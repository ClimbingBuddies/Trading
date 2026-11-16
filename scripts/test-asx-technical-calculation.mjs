// Independent local PostgreSQL calculation/refresh acceptance fixtures.
// No network or live data. Run from repo root with optional PGLITE_MODULE URL.
// Source admission is tested separately: this fixture deliberately stubs that
// boundary so source changes between the two refresh reads are deterministic.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let assertions = 0;
let scenarios = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const near = (actual, expected, label) => {
  assert.ok(Math.abs(Number(actual) - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
  assertions++;
};
const check = async (name, fn) => {
  try { await fn(); scenarios++; console.log(`PASS ${name}`); }
  catch (error) { throw new Error(`FAIL ${name}: ${String(error.message).slice(0,1000)}`); }
};
const id = '00000000-0000-4000-8000-000000000001';
const tiingoId = '00000000-0000-4000-8000-000000000002';
const migration = 'supabase/migrations/20261115235320_add_asx_technical_calculation_v1.sql';
const sql = await readFile(migration, 'utf8');
const original = await readFile('supabase/migrations/20260821064000_implement_technical_indicators_v1.sql', 'utf8');
const originalScore = await readFile('supabase/migrations/20260821083000_implement_technical_market_scores_v1.sql', 'utf8');
const clone = value => structuredClone(value);
function bars(count = 260, price = n => 100 + n) {
  const rows = [];
  const date = new Date('2025-01-06T00:00:00Z');
  while (rows.length < count) {
    if (![0, 6].includes(date.getUTCDay())) {
      const value = price(rows.length + 1);
      rows.push({ id: rows.length + 1, observed_at: date.toISOString(), adjusted_close: value,
        open: value, high: value + 1, low: value - 1, close: value,
        volume: 100, provider_id: 2, instrument_id: id });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return rows;
}
function snapshot(observations = bars(), hash = 'fixture-source-a') {
  return { status: 'ready', source_hash: hash, cutoff_at: '2026-02-02T00:00:00Z',
    window_start: observations[0].observed_at.slice(0, 10),
    window_end: observations.at(-1).observed_at.slice(0, 10),
    anchor_audit_id: 'fixture-anchor', terminal_audit_id: 'fixture-terminal',
    audit_ids: ['fixture-anchor', 'fixture-terminal'], observations };
}
const calculate = async s => (await db.query('select technical_engine.asx_calculate_v1($1::jsonb) result', [JSON.stringify(s)])).rows[0].result;
const indicator = (r, interval, code) => r.indicators.find(i => i.interval_code === interval && i.indicator_code === code);
const query = async (text, params = []) => (await db.query(text, params)).rows;
const refresh = async () => (await query('select technical_engine.refresh_asx_v1($1::uuid) result', [id]))[0].result;
async function setSource(s, mode = 'stable') {
  await db.query('update fixture_source set snapshot=$1::jsonb, mode=$2, calls=0', [JSON.stringify(s), mode]);
}
async function persisted() {
  return query(`select (select jsonb_agg(to_jsonb(x) order by id) from technical_engine.asx_input_snapshots x) snapshots,
    (select jsonb_agg(to_jsonb(x) order by id) from technical_indicators x where calculation_version='technical-engine-asx-v1') indicators,
    (select jsonb_agg(to_jsonb(x) order by id) from market_scores x where methodology_version='technical-score-asx-v1') scores`);
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table instruments(id uuid primary key,is_active boolean,exchange_code text);
    create table data_providers(id int primary key,provider_code text);
    create table market_observations(id bigint primary key,instrument_id uuid,provider_id int,interval_code text,
      observed_at timestamptz,loaded_at timestamptz default '2026-01-01Z',adjusted_close numeric(20,8),
      open numeric(20,8),high numeric(20,8),low numeric(20,8),close numeric(20,8),volume numeric(24,4));
    create table technical_indicators(id bigint generated always as identity primary key,instrument_id uuid,
      observation_id bigint,indicator_code text,interval_code text,calculated_at timestamptz,value numeric(24,8),
      values jsonb,calculation_version text,
      constraint technical_indicators_instrument_id_observation_id_indicator_key unique
      (instrument_id,observation_id,interval_code,indicator_code,calculation_version));
    create table market_scores(id bigint generated always as identity primary key,instrument_id uuid,score_date date,
      momentum_score numeric,trend_score numeric,volatility_score numeric,volume_score numeric,overall_score numeric,
      confidence_score numeric,methodology_version text,technical_calculation_version text,score_status text,
      score_details jsonb,calculated_at timestamptz,
      constraint market_scores_instrument_date_methodology_key unique(instrument_id,score_date,methodology_version));
    insert into instruments values('${id}',true,'ASX'),('${tiingoId}',true,'NYSE');
    insert into data_providers values(1,'tiingo'),(2,'yahoo');`);
  await db.exec(original);
  await db.exec(originalScore.slice(originalScore.indexOf('create or replace function')));
  const baselineDefinitions = await query(`select proname,pg_get_functiondef(oid) definition from pg_proc
    where pronamespace='technical_engine'::regnamespace order by proname`);
  await db.exec(`create table fixture_source(snapshot jsonb,mode text,calls int);
    insert into fixture_source values('{}','stable',0);
    create function technical_engine.asx_source_snapshot_v1(p_id uuid,p_cutoff timestamptz)
    returns jsonb language plpgsql as $$ declare s jsonb; m text; n int; begin
      update public.fixture_source set calls=calls+1 returning snapshot,mode,calls into s,m,n;
      if m='changed' and n%2=0 then return s||jsonb_build_object('source_hash','changed-with-same-ids'); end if;
      if m='blocked-recheck' and n%2=0 then return jsonb_build_object('status','blocked','reason','unresolved_revision'); end if;
      if m='mutate-live' then update public.market_observations set adjusted_close=99999,volume=99999 where instrument_id=p_id; end if;
      return s||jsonb_build_object('cutoff_at',p_cutoff);
    end $$;`);
  await db.exec(sql);
  await db.exec(await readFile('supabase/migrations/20260821073000_grant_technical_indicator_helper_execution.sql', 'utf8'));

  await check('additive migration preserves every original Tiingo function definition', async () => {
    eq(await query(`select proname,pg_get_functiondef(oid) definition from pg_proc
      where pronamespace='technical_engine'::regnamespace and proname not like 'asx_%' and proname<>'refresh_asx_v1' order by proname`), baselineDefinitions);
  });

  const linear = snapshot();
  const calculated = await calculate(linear);
  await check('linear prices have independently derived daily means, EMA and RSI', async () => {
    eq(calculated.indicators.length, 16);
    near(indicator(calculated,'1day','sma_20').value,350.5,'daily SMA20');
    near(indicator(calculated,'1day','sma_50').value,335.5,'daily SMA50');
    near(indicator(calculated,'1day','sma_200').value,260.5,'daily SMA200');
    near(indicator(calculated,'1day','ema_12').value,354.5,'daily EMA12');
    near(indicator(calculated,'1day','ema_26').value,347.5,'daily EMA26');
    near(indicator(calculated,'1day','rsi_14').value,100,'daily RSI');
    near(indicator(calculated,'1day','macd').value,7,'daily MACD');
    near(indicator(calculated,'1week','sma_20').value,312.5,'weekly SMA20');
    near(indicator(calculated,'1week','sma_50').value,237.5,'weekly SMA50');
    eq(indicator(calculated,'1week','sma_200').value,null);
    eq(indicator(calculated,'1week','sma_200').values.status,'insufficient_history');
    eq(calculated.score.score_status,'partial');
    eq(calculated.score.confidence_score,94);
    eq(calculated.score.score_details.availability_weights,{trend:85,momentum:100,volatility:100,volume:100});
    eq(calculated.score.score_details.component_weights,{trend:40,momentum:35,volatility:15,volume:10});
  });

  await check('actual unchanged Tiingo engine and scorer agree on identical source inputs', async () => {
    await db.query(`insert into market_observations(id,instrument_id,provider_id,interval_code,observed_at,adjusted_close,open,high,low,close,volume)
      select id,$2::uuid,1,'1day',observed_at,adjusted_close,open,high,low,close,volume
      from jsonb_to_recordset($1::jsonb) b(id bigint,observed_at timestamptz,adjusted_close numeric,open numeric,high numeric,low numeric,close numeric,volume numeric)`,[JSON.stringify(linear.observations),tiingoId]);
    await query('select * from technical_engine.refresh_v1($1::uuid)',[tiingoId]);
    await query('select * from technical_engine.refresh_scores_v1($1::uuid)',[tiingoId]);
    const actual = await query('select * from technical_indicators where instrument_id=$1::uuid',[tiingoId]);
    eq(actual.length,16);
    for (const i of actual) {
      const expected = indicator(calculated,i.interval_code,i.indicator_code);
      if (expected.value===null) eq(i.value,null); else near(i.value,expected.value,`${i.interval_code} ${i.indicator_code}`);
    }
    const score=(await query('select * from market_scores where instrument_id=$1::uuid',[tiingoId]))[0];
    for(const key of ['momentum_score','trend_score','volatility_score','volume_score','overall_score','confidence_score']) near(score[key],calculated.score[key],key);
    eq(score.score_status,calculated.score.score_status);
    eq(score.score_details.availability_weights,calculated.score.score_details.availability_weights);
  });

  await check('constant prices and snapshot volume changes preserve explicit limitations', async () => {
    const fixed = snapshot(bars(260,()=>100)); const r=await calculate(fixed);
    for(const interval of ['1day','1week']) {
      near(indicator(r,interval,'sma_20').value,100,'constant SMA');
      near(indicator(r,interval,'ema_12').value,100,'constant EMA');
      near(indicator(r,interval,'rsi_14').value,50,'constant RSI');
      near(indicator(r,interval,'volatility_20').value,0,'constant volatility');
    }
    eq(r.score.volume_score,50); eq(r.score.volatility_score,100);
    for(const b of fixed.observations.slice(-20)) b.volume=200;
    eq((await calculate(fixed)).score.volume_score,100);
    fixed.observations.at(-1).volume=null;
    const missing=await calculate(fixed);
    eq(missing.score.volume_score,null); eq(missing.score.confidence_score,84);
    eq(missing.score.score_details.availability_weights.volume,0);
    for(const b of fixed.observations) b.volume=0;
    eq((await calculate(fixed)).score.volume_score,null);
  });

  await check('fractional price boundary matches Tiingo scoring after numeric(24,8) indicator storage',async()=>{
    const tiny=snapshot(bars(260,n=>n===260?100.00000001:100));
    const r=await calculate(tiny);
    eq(indicator(r,'1day','ema_12').value,100);eq(indicator(r,'1day','ema_26').value,100);
    eq(r.score.trend_score,76.47);
    await db.exec('begin');
    try {
      await db.query(`update market_observations set adjusted_close=case when id=260 then 100.00000001 else 100 end,
        open=100,close=100,high=101,low=99 where instrument_id=$1::uuid`,[tiingoId]);
      await query('select * from technical_engine.refresh_v1($1::uuid)',[tiingoId]);
      await query('select * from technical_engine.refresh_scores_v1($1::uuid)',[tiingoId]);
      const s=(await query('select * from market_scores where instrument_id=$1::uuid',[tiingoId]))[0];
      for(const key of ['trend_score','momentum_score','volume_score','volatility_score','overall_score','confidence_score']) near(s[key],r.score[key],`fractional ${key}`);
    } finally {await db.exec('rollback');}
  });

  await check('Sydney completed week changes exactly at Monday midnight including DST', async () => {
    for(const [friday,before,after] of [
      ['2026-11-13','2026-11-15T12:59:59Z','2026-11-15T13:00:00Z'],
      ['2026-06-12','2026-06-14T13:59:59Z','2026-06-14T14:00:00Z']]) {
      const s=snapshot([{id:900,observed_at:friday+'T00:00:00Z',adjusted_close:100,volume:100}]);
      s.cutoff_at=before; const a=await calculate(s);
      eq(indicator(a,'1week','sma_20').observation_id,null);
      eq(indicator(a,'1week','sma_20').values.valid_periods,0);
      s.cutoff_at=after; const b=await calculate(s);
      eq(indicator(b,'1week','sma_20').observation_id,900);
      eq(indicator(b,'1week','sma_20').values.valid_periods,1);
      eq(b.score.score_status,'insufficient_input');
    }
  });

  await check('invalid or empty snapshot envelopes are rejected', async () => {
    for(const bad of [{status:'blocked'}, {...linear,observations:[]}, {...linear,source_hash:null}, {...linear,cutoff_at:null}]) {
      await assert.rejects(calculate(bad),/ready source snapshot/); assertions++;
    }
  });

  const oldTiingo=await query(`select to_jsonb(t) data from technical_indicators t where calculation_version='technical-engine-v1' order by id`);
  const oldScores=await query(`select to_jsonb(t) data from market_scores t where methodology_version='technical-score-v1' order by id`);
  await check('refresh pins all indicators and score to one snapshot, cutoff and batch', async () => {
    await setSource(linear); const r=await refresh();
    eq(r.indicator_rows_upserted,16);eq(r.score_rows_upserted,1);eq(r.blocked_instruments,0);
    const state=(await persisted())[0]; eq(state.snapshots.length,1);eq(state.indicators.length,16);eq(state.scores.length,1);
    const s=state.scores[0];
    eq(state.indicators.every(i=>i.values.refresh_batch_id===s.score_details.refresh_batch_id),true);
    eq(state.indicators.every(i=>i.values.source_snapshot_id===state.snapshots[0].id),true);
    eq(s.score_details.source_snapshot_id,state.snapshots[0].id);
    eq(state.indicators.every(i=>i.calculated_at===s.calculated_at),true);
    eq(state.indicators.every(i=>i.values.source_hash===linear.source_hash),true);
    eq(s.score_details.input_snapshot['1day_price'],360);
    eq(s.score_details.input_snapshot.current_20_day_average_volume,100);
  });
  await check('same source rerun retains immutable private snapshot and deterministic row identities', async () => {
    const before=(await persisted())[0]; await setSource(linear); await refresh(); const after=(await persisted())[0];
    eq(after.snapshots.length,before.snapshots.length+1);
    eq(after.snapshots.filter(s=>before.snapshots.some(b=>b.id===s.id)),before.snapshots);
    eq(after.indicators.map(r=>r.id),before.indicators.map(r=>r.id));
    eq(after.scores.map(r=>r.id),before.scores.map(r=>r.id));
    eq(after.scores[0].overall_score,before.scores[0].overall_score);
    assert.notEqual(after.scores[0].score_details.refresh_batch_id,before.scores[0].score_details.refresh_batch_id);assertions++;
    const linked=after.snapshots.find(s=>s.id===after.scores[0].score_details.source_snapshot_id);
    eq(linked.cutoff_at,after.scores[0].calculated_at);
    const replay=await calculate(linked.snapshot);
    eq(replay.score.overall_score,after.scores[0].overall_score);
    eq(replay.score.score_details.cutoff_at,after.scores[0].score_details.cutoff_at);
  });
  await check('changed fingerprint and newly blocked source prevent every publication write', async () => {
    for(const mode of ['changed','blocked-recheck']) {
      const before=await persisted();await setSource(linear,mode);const r=await refresh();
      eq(r.blocked_instruments,1);eq(r.score_rows_upserted,0);
      eq(r.blocker_counts,{source_changed_during_calculation:1});eq(await persisted(),before);
    }
    const before=await persisted();await setSource({status:'blocked',reason:'unresolved_revision'});const r=await refresh();
    eq(r.blocker_counts,{unresolved_revision:1});eq(await persisted(),before);
  });
  await check('mutable observations and stale mixed indicator batches are never calculation inputs', async () => {
    await db.query(`insert into market_observations(id,instrument_id,provider_id,interval_code,observed_at,adjusted_close,volume)
      values(10000,$1::uuid,2,'1day','2026-01-02Z',1,1)`,[id]);
    await db.exec(`update technical_indicators set value=999999,calculated_at='2099-01-01Z',
      values=values||'{"refresh_batch_id":"stale-mixed"}' where calculation_version='technical-engine-asx-v1'`);
    await setSource(linear,'mutate-live');await refresh();const s=(await persisted())[0];
    eq(s.scores[0].score_details.input_snapshot['1day_price'],360);
    eq(s.scores[0].volume_score,50);
    eq(s.indicators.some(i=>i.values.refresh_batch_id==='stale-mixed'),false);
    near(s.indicators.find(i=>i.interval_code==='1day'&&i.indicator_code==='sma_20').value,350.5,'fresh recalculation');
    eq(Number((await query('select adjusted_close from market_observations where id=10000'))[0].adjusted_close),99999);
    eq(await query(`select to_jsonb(t) data from technical_indicators t where calculation_version='technical-engine-v1' order by id`),oldTiingo);
    eq(await query(`select to_jsonb(t) data from market_scores t where methodology_version='technical-score-v1' order by id`),oldScores);
  });
  await check('new source hash with same observation IDs publishes a distinct pinned source', async () => {
    const before=(await persisted())[0];
    const changed=clone(linear);changed.source_hash='fixture-source-b';
    for(const b of changed.observations) b.adjusted_close*=2;
    for(const b of changed.observations.slice(-20)) b.volume=200;
    await setSource(changed);await refresh();const s=(await persisted())[0];
    eq(s.snapshots.length,before.snapshots.length+1);eq(s.indicators.length,16);eq(s.scores.length,1);
    eq(s.scores[0].score_details.source_hash,'fixture-source-b');
    eq(s.scores[0].score_details.input_snapshot['1day_price'],720);eq(s.scores[0].volume_score,100);
    near(s.indicators.find(i=>i.interval_code==='1day'&&i.indicator_code==='sma_20').value,701,'changed prices');
  });
  await check('anonymous and authenticated roles cannot read snapshots or execute private entry points', async () => {
    for(const role of ['anon','authenticated']) {
      eq((await query(`select has_function_privilege($1,'technical_engine.asx_calculate_v1(jsonb)','EXECUTE') allowed`,[role]))[0].allowed,false);
      eq((await query(`select has_function_privilege($1,'technical_engine.refresh_asx_v1(uuid)','EXECUTE') allowed`,[role]))[0].allowed,false);
      for(const statement of ['select * from technical_engine.asx_input_snapshots',
        "select technical_engine.asx_calculate_v1('{}'::jsonb)",'select technical_engine.refresh_asx_v1()']) {
        await db.exec(`set role ${role}`);
        try{await assert.rejects(db.query(statement),/permission denied/);assertions++;}finally{await db.exec('reset role');}
      }
    }
    eq((await query(`select has_function_privilege('service_role','technical_engine.asx_calculate_v1(jsonb)','EXECUTE') allowed`))[0].allowed,true);
    eq((await query(`select has_table_privilege('service_role','technical_engine.asx_input_snapshots','UPDATE') allowed`))[0].allowed,false);
    eq((await query(`select relrowsecurity from pg_class where oid='technical_engine.asx_input_snapshots'::regclass`))[0].relrowsecurity,true);
  });
  await check('trusted service executes calculation and refresh but cannot rewrite pinned snapshots', async () => {
    // Public-table grants mimic the trusted worker; these are fixture-only.
    await db.exec(`grant select,insert,update on all tables in schema public to service_role;
      grant usage on all sequences in schema public to service_role;
      grant execute on function technical_engine.asx_source_snapshot_v1(uuid,timestamptz) to service_role`);
    await setSource(linear);
    const beforeCount=(await query('select count(*)::int n from technical_engine.asx_input_snapshots'))[0].n;
    await db.exec('set role service_role');
    try {
      eq((await calculate(linear)).indicators.length,16);
      eq((await refresh()).score_rows_upserted,1);
      eq((await query('select count(*)::int n from technical_engine.asx_input_snapshots'))[0].n,beforeCount+1);
      await assert.rejects(db.query("update technical_engine.asx_input_snapshots set snapshot='{}'::jsonb"),/permission denied/);assertions++;
      await assert.rejects(db.query('delete from technical_engine.asx_input_snapshots'),/permission denied/);assertions++;
    } finally { await db.exec('reset role'); }
  });

  await check('source mutation inside actual calculation is visible to the volatile parent recheck', async () => {
    const sourceDefinition=(await query("select pg_get_functiondef('technical_engine.asx_source_snapshot_v1(uuid,timestamptz)'::regprocedure) sql"))[0].sql;
    await db.exec(`create or replace function technical_engine.asx_source_snapshot_v1(p_id uuid,p_cutoff timestamptz)
      returns jsonb language sql stable as 'select snapshot||jsonb_build_object(''cutoff_at'',p_cutoff) from public.fixture_source';
      alter function technical_engine.sma(numeric[],integer) rename to fixture_original_sma;
      create function technical_engine.sma(p_prices numeric[],p_period integer) returns numeric language plpgsql volatile as $$
      begin
        update public.fixture_source set snapshot=snapshot||'{"source_hash":"mutated-inside-calculation"}'::jsonb;
        return technical_engine.fixture_original_sma(p_prices,p_period);
      end $$;`);
    try {
      await setSource(linear);const before=await persisted();const r=await refresh();
      eq(r.blocker_counts,{source_changed_during_calculation:1});eq(r.score_rows_upserted,0);
      eq(await persisted(),before);
      eq((await query("select snapshot->>'source_hash' hash from fixture_source"))[0].hash,'mutated-inside-calculation');
    } finally {
      await db.exec(`drop function technical_engine.sma(numeric[],integer);
        alter function technical_engine.fixture_original_sma(numeric[],integer) rename to sma;`);
      await db.exec(sourceDefinition);
    }
  });

  await check('same source across Sydney week boundary links to exactly replayable cutoff envelopes',async()=>{
    const definition=(await query("select pg_get_functiondef('technical_engine.refresh_asx_v1(uuid)'::regprocedure) sql"))[0].sql;
    // Only this isolated database gets a deterministic clock substitution.
    // The actual release file is never rewritten; arithmetic/source remain real.
    await db.exec(`create table fixture_clock(at timestamptz);
      insert into fixture_clock values('2026-01-04T12:59:59Z');
      create function public.fixture_clock() returns timestamptz language sql volatile as 'select at from public.fixture_clock';`);
    await db.exec(definition.replaceAll('clock_timestamp()','public.fixture_clock()'));
    try {
      const countBefore=(await persisted())[0].snapshots.length;
      const points=[];
      for(const at of ['2026-01-04T12:59:59Z','2026-01-04T13:00:00Z']) {
        await db.query('update fixture_clock set at=$1::timestamptz',[at]);
        await setSource(linear);await refresh();const state=(await persisted())[0];
        const score=state.scores[0];const saved=state.snapshots.find(s=>s.id===score.score_details.source_snapshot_id);
        const replay=await calculate(saved.snapshot);
        eq(new Date(saved.cutoff_at).toISOString(),new Date(at).toISOString());
        eq(saved.snapshot.cutoff_at,score.score_details.cutoff_at);
        for(const key of ['overall_score','trend_score','momentum_score','volume_score','volatility_score','confidence_score']) eq(replay.score[key],score[key]);
        const current=state.indicators.filter(i=>i.values.refresh_batch_id===score.score_details.refresh_batch_id);
        eq(current.length,16);
        for(const i of current) {
          const expected=indicator(replay,i.interval_code,i.indicator_code);
          eq(i.value,expected.value);eq(i.observation_id,expected.observation_id);
          eq(i.values.source_snapshot_id,saved.id);
        }
        points.push({id:saved.id,payload:saved,periods:indicator(replay,'1week','sma_20').values.valid_periods});
      }
      eq(points[0].periods,51);eq(points[1].periods,52);
      assert.notEqual(points[0].id,points[1].id);assertions++;
      const after=(await persisted())[0];eq(after.snapshots.length,countBefore+2);
      eq(after.snapshots.find(s=>s.id===points[0].id),points[0].payload);
    } finally { await db.exec(definition); }
  });

  const schedulerPath='supabase/migrations/20261115235607_integrate_asx_technical_scheduler_v1.sql';
  const schedulerSql=await readFile(schedulerPath,'utf8');
  // Git checkout uses CRLF on Windows; SQL bodies are compared after both
  // fixture inputs are decoded with the same LF convention, not reformatted.
  const originalScheduler=(await readFile('supabase/migrations/20260821095000_add_technical_engine_scheduler_monitoring.sql','utf8')).replaceAll('\r\n','\n');
  const rollbackSql=await readFile('scripts/rollback-asx-technical-scheduler.sql','utf8');
  // Load the actual original run schema/functions; fixture cron rows replace
  // only its final pg_cron installation block, unsupported by isolated PGlite.
  const cronInstall=originalScheduler.search(/do \$\$\s*declare\s*v_job_id bigint/);
  assert.ok(cronInstall>0,'original scheduler cron-install boundary must exist');
  await db.exec(originalScheduler.slice(0,cronInstall));
  await db.exec(`create schema cron;create table cron.job(jobid bigint,jobname text,schedule text,command text,active boolean);
    insert into cron.job values
      (1,'trading-technical-engine-daily-0715-awst','15 23 * * *','select technical_engine.run_v1(''scheduled'', null);',true),
      (2,'trading-technical-engine-retry-0745-awst','45 23 * * *','select technical_engine.retry_latest_failed_v1();',true),
      (3,'unrelated-job','0 * * * *','select 1;',false);`);
  const cronBefore=await query('select * from cron.job order by jobid');
  const originalRunDefinition=(await query("select pg_get_functiondef('technical_engine.run_v1(text,uuid)'::regprocedure) sql"))[0].sql;
  const run=async(source='manual',parent=null)=>{
    const r=(await query('select technical_engine.run_v1($1,$2::uuid) id',[source,parent]))[0];
    return (await query('select * from technical_engine_runs where id=$1::uuid',[r.id]))[0];
  };
  const allResults=async()=>query(`select
    (select jsonb_agg(to_jsonb(x) order by id) from technical_indicators x) indicators,
    (select jsonb_agg(to_jsonb(x) order by id) from market_scores x) scores,
    (select jsonb_agg(to_jsonb(x) order by id) from technical_engine.asx_input_snapshots x) snapshots`);
  const oldSuccess=await run('scheduled');
  await db.exec(schedulerSql);
  await check('old Tiingo-only success permits composite run; matching composite success alone skips',async()=>{
    eq(oldSuccess.status,'succeeded');eq(oldSuccess.metadata.pipeline_contract,undefined);
    await setSource(linear);const first=await run('scheduled');
    eq(first.status,'succeeded');eq(first.metadata.pipeline_contract,'tiingo-v1+asx-v1');
    eq(first.calculation_version,'technical-engine-v1');eq(first.methodology_version,'technical-score-v1');
    eq(first.indicator_rows_upserted,16);eq(first.score_rows_upserted,1);
    eq(first.metadata.asx.calculation_version,'technical-engine-asx-v1');
    eq(first.metadata.asx.methodology_version,'technical-score-asx-v1');
    eq(first.metadata.asx.indicator_rows_upserted,16);eq(first.metadata.asx.score_rows_upserted,1);
    const before=await allResults();const second=await run('scheduled');
    eq(second.status,'skipped');eq(second.error_code,'already_succeeded');eq(await allResults(),before);
    await db.query("update technical_engine_runs set metadata=jsonb_set(metadata,'{pipeline_contract}','\"unrelated-contract\"') where id=$1::uuid",[first.id]);
    eq((await run('scheduled')).status,'succeeded');
    eq(await query('select * from cron.job order by jobid'),cronBefore);
  });
  let failed;
  await check('blocked ASX source yields durable failed aggregate receipt while retaining Tiingo results',async()=>{
    await setSource({status:'blocked',reason:'unresolved_revision'});
    await db.exec("update technical_indicators set value=-999 where calculation_version='technical-engine-v1'");
    const before=await persisted();failed=await run();
    eq(failed.status,'failed');eq(failed.error_code,'asx_source_blocked');
    eq(failed.indicator_rows_upserted,16);eq(failed.score_rows_upserted,1);
    eq(failed.metadata.asx.blocker_counts,{unresolved_revision:1});eq(failed.metadata.asx.blocked_instruments,1);
    eq(failed.metadata.asx.score_rows_upserted,0);eq(await persisted(),before);
    eq((await query("select count(*)::int n from technical_indicators where calculation_version='technical-engine-v1' and value=-999"))[0].n,0);
    eq(JSON.stringify(failed.metadata).includes(id),false);
    eq(Object.keys(failed.metadata.asx).some(k=>/symbol|observation|snapshot|owner/.test(k)),false);
  });
  await check('actual ASX calculation exception rolls back both stages but preserves failed receipt',async()=>{
    const broken=clone(linear);broken.observations.at(-2).adjusted_close=0;
    await setSource(broken);const before=await allResults();const r=await run();
    eq(r.status,'failed');eq(r.error_code,'22012');eq(r.indicator_rows_upserted,0);eq(r.score_rows_upserted,0);
    eq(await allResults(),before);eq(r.finished_at!==null,true);eq(r.metadata.pipeline_contract,'tiingo-v1+asx-v1');
  });
  await check('retry parents, child deduplication and three-attempt cap remain enforced',async()=>{
    await setSource({status:'blocked',reason:'unresolved_revision'});
    const second=await run('retry',failed.id);eq(second.status,'failed');eq(second.attempt_number,2);
    eq(second.scheduled_for,failed.scheduled_for);eq(second.retry_of_run_id,failed.id);
    const third=await run('retry',second.id);eq(third.status,'failed');eq(third.attempt_number,3);
    await assert.rejects(run('retry',third.id),/three attempts/);assertions++;
    await assert.rejects(run('retry',null),/requires p_retry_of_run_id/);assertions++;
    await assert.rejects(run('manual',failed.id),/only for retry/);assertions++;
    await assert.rejects(run('retry',oldSuccess.id),/existing failed run/);assertions++;
    await assert.rejects(run('unsupported'),/scheduled, manual or retry/);assertions++;
    const parent=await run();await setSource(linear);const child=await run('retry',parent.id);
    eq(child.status,'succeeded');eq(child.attempt_number,2);
    await assert.rejects(run('retry',parent.id),/running or successful child/);assertions++;
    await setSource({status:'blocked',reason:'unresolved_revision'});const runningParent=await run();
    await db.query(`insert into technical_engine_runs(scheduled_for,execution_source,retry_of_run_id,attempt_number,status)
      values($1,'retry',$2::uuid,2,'running')`,[runningParent.scheduled_for,runningParent.id]);
    await assert.rejects(run('retry',runningParent.id),/running or successful child/);assertions++;
  });
  await check('paired scheduler rollback exactly restores original runner and retains ASX evidence and cron',async()=>{
    const before=await allResults();const receipts=await query('select * from technical_engine_runs order by id');
    await db.exec(rollbackSql.replaceAll('\r\n','\n'));
    eq((await query("select pg_get_functiondef('technical_engine.run_v1(text,uuid)'::regprocedure) sql"))[0].sql,originalRunDefinition);
    eq(await allResults(),before);eq(await query('select * from technical_engine_runs order by id'),receipts);
    eq(await query('select * from cron.job order by jobid'),cronBefore);
    eq((await query("select has_function_privilege('anon','technical_engine.run_v1(text,uuid)','EXECUTE') allowed"))[0].allowed,false);
  });

  // Replace the deterministic admission stub with the actual adapter and real
  // schema types. Existing Tiingo rows remain for composite integration checks.
  const sourceSql=await readFile('supabase/migrations/20261115235043_add_asx_technical_sources_v1.sql','utf8');
  const yahooProvider='00000000-0000-4000-8000-000000000020';
  const tiingoProvider='00000000-0000-4000-8000-000000000010';
  const anchor='00000000-0000-4000-8000-000000000100';
  await db.exec(`alter table instruments add column symbol text,add column asset_type text,add column currency_code text;
    update instruments set symbol='TEST',asset_type='equity',currency_code='AUD' where id='${id}';
    alter table data_providers alter column id type uuid using case when id=1 then '${tiingoProvider}'::uuid else '${yahooProvider}'::uuid end;
    alter table data_providers add column is_active boolean default true;
    alter table market_observations alter column provider_id type uuid using case when provider_id=1 then '${tiingoProvider}'::uuid else '${yahooProvider}'::uuid end;
    alter table market_observations add column currency_code text,add column raw_payload jsonb;
    delete from market_observations where instrument_id='${id}';
    create table sync_runs(id uuid primary key,provider_id uuid,started_at timestamptz,finished_at timestamptz,status text,
      requested_count int,received_count int,inserted_count int,metadata jsonb);
    drop function technical_engine.asx_source_snapshot_v1(uuid,timestamptz);`);
  await db.exec(sourceSql);
  const basis='Yahoo native OHLC plus separately supplied adjusted close';
  await db.query(`insert into market_observations(id,instrument_id,provider_id,interval_code,observed_at,loaded_at,
      open,high,low,close,adjusted_close,volume,currency_code,raw_payload)
    select 10000+row_number() over(order by d),$1::uuid,$2::uuid,'1day',d,'2025-11-15T00:01Z',
      10.123456789,12,9,11.123456789,10.500000009,100.00004,'AUD',
      jsonb_build_object('date',to_char(d at time zone 'UTC','YYYY-MM-DD'),'open',10.123456789,'high',12,'low',9,
        'close',11.123456789,'adjusted_close',10.500000009,'volume',100.00004,
        '_backfill',jsonb_build_object('function','asx-yahoo-market-history','provider','yahoo','symbol','TEST',
          'provider_symbol','TEST.AX','exchange','ASX','requested_start_date','2024-11-14','requested_end_date','2025-11-14',
          'price_basis',$3::text,'retrieved_at','2025-11-15T00:01:00.000Z','source','Yahoo Finance'))
    from generate_series('2024-11-14Z'::timestamptz,'2025-11-14Z'::timestamptz,interval '1 day') d
    where extract(isodow from d)<=5`,[id,yahooProvider,basis]);
  await db.query(`insert into sync_runs values($1::uuid,$2::uuid,'2025-11-15T00:00Z','2025-11-15T00:02Z','succeeded',1,262,262,
    jsonb_build_object('function','asx-yahoo-market-history','provider','yahoo','symbol','TEST','provider_symbol','TEST.AX','exchange','ASX',
      'price_basis',$3::text,'requested_start_date','2024-11-14','requested_end_date','2025-11-14','retrieved_at','2025-11-15T00:01:00.000Z',
      'coverage_has_rejected_bars',false,'rejected_bars','[]'::jsonb,'duplicate_bars','[]'::jsonb,'events','{}'::jsonb,'valid_rows',262))`,[anchor,yahooProvider,basis]);
  await db.exec(schedulerSql);
  const admitted=async()=> (await query('select technical_engine.asx_source_snapshot_v1($1::uuid,clock_timestamp()) result',[id]))[0].result;
  const matches=async(scoreId)=>(await query('select technical_engine.asx_score_source_matches_v1($1::bigint) result',[scoreId]))[0].result;
  let integratedScore;
  await check('actual source adapter, typmod storage, calculator and composite scheduler integrate',async()=>{
    const source=await admitted();eq(source.status,'ready');eq(source.observations.length,262);
    eq(typeof source.observations[0].id,'number');eq(source.observations[0].adjusted_close,10.50000001);
    eq(source.observations[0].volume,100);
    const r=await run();eq(r.status,'succeeded');eq(r.metadata.asx.score_rows_upserted,1);
    eq(r.indicator_rows_upserted,16);eq(r.score_rows_upserted,1);
    const state=(await persisted())[0];integratedScore=state.scores.find(s=>s.score_details.refresh_batch_id===r.metadata.asx.refresh_batch_id);
    const saved=state.snapshots.find(s=>s.id===integratedScore.score_details.source_snapshot_id);
    const replay=await calculate(saved.snapshot);eq(replay.score.overall_score,integratedScore.overall_score);
    const current=state.indicators.filter(i=>i.values.refresh_batch_id===r.metadata.asx.refresh_batch_id);eq(current.length,16);
    eq(current.every(i=>i.values.source_snapshot_id===saved.id),true);
    eq(current.find(i=>i.interval_code==='1week'&&i.indicator_code==='sma_200').value,null);
    eq(integratedScore.score_details.source_hash,source.source_hash);eq(integratedScore.score_status,'partial');
    eq(await matches(integratedScore.id),true);eq(await matches(-999),false);
    eq(await query('select * from cron.job order by jobid'),cronBefore);
  });
  await check('actual source currentness detects changed prices retaining IDs and timestamps',async()=>{
    const before=await query('select id,loaded_at from market_observations where instrument_id=$1::uuid order by id',[id]);
    await db.exec(`update market_observations set adjusted_close=10.75,raw_payload=jsonb_set(raw_payload,'{adjusted_close}','10.75')
      where id=(select max(id) from market_observations where instrument_id='${id}')`);
    eq(await matches(integratedScore.id),false);
    const source=await admitted();eq(source.status,'ready');assert.notEqual(source.source_hash,integratedScore.score_details.source_hash);assertions++;
    eq(await query('select id,loaded_at from market_observations where instrument_id=$1::uuid order by id',[id]),before);
    const r=await run();eq(r.status,'succeeded');
    integratedScore=(await persisted())[0].scores.find(s=>s.score_details.refresh_batch_id===r.metadata.asx.refresh_batch_id);
    eq(await matches(integratedScore.id),true);eq(integratedScore.score_details.input_snapshot['1day_price'],10.75);
  });
  await check('actual quality quarantine blocks scheduler and source-currentness without removing prior evidence',async()=>{
    const before=await persisted();
    await db.exec(`update sync_runs set metadata=metadata||'{"coverage_has_rejected_bars":true,"rejected_bars":[{"date":"2025-11-14"}]}'::jsonb`);
    eq(await matches(integratedScore.id),false);eq((await admitted()).status,'blocked');
    const r=await run();eq(r.status,'failed');eq(r.error_code,'asx_source_blocked');
    eq(r.metadata.asx.blocked_instruments,1);eq(await persisted(),before);
    eq(r.indicator_rows_upserted,16);eq(r.score_rows_upserted,1);
  });
  await check('source matching rejects older Sydney-week cutoffs and remains private',async()=>{
    await db.exec(`update sync_runs set metadata=metadata||'{"coverage_has_rejected_bars":false,"rejected_bars":[]}'::jsonb`);
    eq(await matches(integratedScore.id),true);
    await db.query(`update market_scores set score_details=jsonb_set(score_details,'{cutoff_at}','"2020-01-01T00:00:00Z"') where id=$1`,[integratedScore.id]);
    eq(await matches(integratedScore.id),false);
    for(const role of ['anon','authenticated']) eq((await query("select has_function_privilege($1,'technical_engine.asx_score_source_matches_v1(bigint)','EXECUTE') allowed",[role]))[0].allowed,false);
    eq((await query("select has_function_privilege('service_role','technical_engine.asx_score_source_matches_v1(bigint)','EXECUTE') allowed"))[0].allowed,true);
  });
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual ASX SQL plus unchanged Tiingo formulas; synthetic source boundary.`);
  console.log(`Calculation migration SHA256 ${createHash('sha256').update(sql).digest('hex')}`);
  console.log(`Scheduler migration SHA256 ${createHash('sha256').update(schedulerSql).digest('hex')}`);
  console.log(`Scheduler rollback SHA256 ${createHash('sha256').update(rollbackSql).digest('hex')}`);
  console.log(`Source migration SHA256 ${createHash('sha256').update(sourceSql).digest('hex')}`);
} finally { await db.close(); }
