// Independent integration tests: actual PostgreSQL source, calculator and adapter.
// Clocks only are rebound in memory. No network, live data, services or schedules.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const path='supabase/migrations/20261118033709_add_asx_convergence_adapter_v1.sql';
const sql=await readFile(path,'utf8');
const diagnostic=await readFile('scripts/asx-convergence-readiness.sql','utf8');
const manifest=JSON.parse(await readFile('data/shared-market-calendars/asx-research-2026-20261118.json','utf8'));
const trust=JSON.parse(await readFile('data/shared-market-calendars/asx-research-2026-20261118.trust.json','utf8'));
const at='2026-11-18T03:40:00Z',technicalAt='2026-11-18T03:34:00Z';
const clock=(text,value=at)=>text.replaceAll('statement_timestamp()',`'${value}'::timestamptz`).replaceAll('clock_timestamp()',`'${value}'::timestamptz`);
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const inst=uid(1),other=uid(2),provider=uid(100),anchor=uid(200),aiId=uid(300),aiRun=uid(400);
let assertions=0,scenarios=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(text,params=[])=>(await db.query(text,params)).rows;
const prepare=async(cutoff=at,id=inst)=>(await query('select market_convergence.prepare_asx_v1($1::uuid,$2::timestamptz) e',[id,cutoff]))[0].e;
const run=async(source='scheduled',parent=null,cutoff=at,id=inst)=>(await query('select market_convergence.run_asx_v1($1::uuid,$2,$3::uuid,$4::timestamptz) id',[id,source,parent,cutoff]))[0].id;
const receipt=async(id)=>(await query('select * from market_convergence.asx_runs_v1 where id=$1',[id]))[0];
const published=()=>query('select * from market_convergence_assessments order by id');
const ledger=()=>query('select * from market_convergence.asx_runs_v1 order by id');
const report=async()=>(await query(clock(diagnostic)))[0];
async function check(name,fn){await db.exec('begin');try{await fn();scenarios++;console.log('PASS '+name);}catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,1600));}finally{await db.exec('rollback');}}
const rejected=async(fn,pattern)=>{
  await db.exec('savepoint expected_error');
  try{await assert.rejects(fn,pattern);assertions++;}
  finally{await db.exec('rollback to savepoint expected_error;release savepoint expected_error');}
};
const blocked=async(code)=>{eq((await prepare()).readiness,code);eq((await report())?.invocation_sql??null,null);};
const ready=async()=>{const e=await prepare();eq(e.readiness,'READY',JSON.stringify(e));return e;};
const evidence=()=>query(`select (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from market_scores x) technical,
  (select md5(jsonb_agg(to_jsonb(x) order by assessment_id)::text) from gpt_market_assessments x) ai,
  (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from market_observations x) observations,
  (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from sync_runs x) audits,
  (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from technical_engine.asx_input_snapshots x) snapshots,
  (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from market_convergence_runs x) legacy_runs`);
async function seedSource(dates=manifest.days.filter(d=>d.status==='OPEN'&&d.date<='2026-11-17').map(d=>d.date)){
  await db.exec('truncate market_observations,sync_runs,technical_engine.asx_input_snapshots,technical_indicators,market_scores cascade');
  const m={function:'asx-yahoo-market-history',provider:'yahoo',instrument_id:inst,symbol:'TEST',provider_symbol:'TEST.AX',exchange:'ASX',
    requested_start_date:'2025-11-17',requested_end_date:'2026-11-17',price_basis:'Yahoo native OHLC plus separately supplied adjusted close',
    retrieved_at:'2026-11-18T03:31:00.000Z',history_window_version:1,normalization_version:2,previous_audit_id:null,
    coverage_has_rejected_bars:false,rejected_bars:[],duplicate_bars:[],events:{},valid_rows:dates.length,accepted_provider_dates:dates,
    fetch_attempts:[{requested_start_date:'2025-11-17',requested_end_date:'2026-11-17',retrieved_at:'2026-11-18T03:31:00.000Z',
      valid_rows:dates.length,rejected_bars:[],duplicate_bars:[],events:{}}]};
  await db.query("insert into sync_runs values($1,$2,'2026-11-18T03:30Z','2026-11-18T03:32Z','succeeded',1,$3,$3,$4::jsonb)",[anchor,provider,dates.length,JSON.stringify(m)]);
  let n=0;for(const date of dates){n++;const p=100+n;const raw={date,open:p,high:p+1,low:p-1,close:p,adjusted_close:p,volume:100+n,
    _backfill:{function:m.function,provider:'yahoo',symbol:'TEST',provider_symbol:'TEST.AX',exchange:'ASX',requested_start_date:m.requested_start_date,
      requested_end_date:m.requested_end_date,price_basis:m.price_basis,retrieved_at:m.retrieved_at,source:'Yahoo Finance'}};
    await db.query("insert into market_observations values($1,$2,$3,'1day',$4,$5,$6,$7,$5,$5,$8,'AUD','2026-11-18T03:31Z',$9::jsonb)",
      [n,inst,provider,date+'T00:00:00Z',p,p+1,p-1,100+n,JSON.stringify(raw)]);
  }
  const r=(await query('select technical_engine.refresh_asx_v1($1::uuid) r',[inst]))[0].r;
  eq(r.blocked_instruments,0);eq(r.score_rows_upserted,1);
}
async function fault(body="raise exception 'fixture publication failure';"){
  await db.exec(`create function public.fixture_publication_fault() returns trigger language plpgsql as $$begin ${body} return new;end$$;
    create trigger fixture_publication_fault before insert on public.market_convergence_assessments for each row execute function public.fixture_publication_fault();`);
}
const expected=(t,a,tc,ac,rating)=>{
  const ts=t>=80?'Strong Buy':t>=60?'Buy':t>=40?'Hold':t>=20?'Sell':'Strong Sell';
  const sign=s=>['strong sell','sell','hold','buy','strong buy'].indexOf(s.toLowerCase())-2;
  const gap=Math.abs(t-a),score=Math.round((t+a)*50)/100;
  const cls=sign(ts)*sign(rating)<0?'conflict':gap>=25?'mixed':gap<10?'aligned':'mild_disagreement';
  const confidence=Math.round(Math.min(Math.sqrt(tc*ac)*(1-gap/200),cls==='conflict'?40:cls==='mixed'?60:100)*100)/100;
  const label=['conflict','mixed'].includes(cls)?cls:score>=85?'very_strong_bullish':score>=70?'strong_bullish':score>=60?'moderate_bullish':score>=40?'neutral':score>=30?'moderate_bearish':score>=15?'strong_bearish':'very_strong_bearish';
  return {score,confidence,label,ts};
};
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table instruments(id uuid primary key,is_active boolean,symbol text,exchange_code text,asset_type text,currency_code text);
    create table data_providers(id uuid primary key,provider_code text,is_active boolean);
    create table sync_runs(id uuid primary key,provider_id uuid,started_at timestamptz,finished_at timestamptz,status text,requested_count int,received_count int,inserted_count int,metadata jsonb);
    create table market_observations(id bigint primary key,instrument_id uuid,provider_id uuid,interval_code text,observed_at timestamptz,
      open numeric(20,8),high numeric(20,8),low numeric(20,8),close numeric(20,8),adjusted_close numeric(20,8),volume numeric(24,4),currency_code text,loaded_at timestamptz,raw_payload jsonb);
    create table technical_indicators(id bigint generated always as identity primary key,instrument_id uuid,observation_id bigint,indicator_code text,interval_code text,calculated_at timestamptz,
      value numeric(24,8),values jsonb,calculation_version text,constraint technical_indicators_instrument_id_observation_id_indicator_key unique(instrument_id,observation_id,interval_code,indicator_code,calculation_version));
    create table market_scores(id bigint generated by default as identity primary key,instrument_id uuid,score_date date,momentum_score numeric,trend_score numeric,volatility_score numeric,volume_score numeric,
      overall_score numeric,confidence_score numeric,methodology_version text,technical_calculation_version text,score_status text,score_details jsonb,calculated_at timestamptz,
      constraint market_scores_instrument_date_methodology_key unique(instrument_id,score_date,methodology_version));
    create table gpt_market_runs(run_id uuid primary key,status text,completed_at timestamptz,analysis_cutoff_time timestamptz);
    create table gpt_market_assessments(assessment_id uuid primary key,instrument_id uuid,run_id uuid,assessment_date date,rating text,score numeric,confidence numeric,
      methodology_version text,created_at timestamptz,technical_engine_input_used boolean);
    insert into instruments values('${inst}',true,'TEST','ASX','equity','AUD'),('${other}',true,'OTHER','NYSE','equity','USD');
    insert into data_providers values('${provider}','yahoo',true);
    insert into gpt_market_runs values('${aiRun}','succeeded','2026-11-18T03:34Z','2026-11-18T03:32Z');
    insert into gpt_market_assessments values('${aiId}','${inst}','${aiRun}','2026-11-17','Buy',70,80,'independent-market-ai-v1','2026-11-18T03:33Z',false);`);
  const base=await readFile('supabase/migrations/20260813_phase2_two_assessment_architecture.sql','utf8');
  const begin=base.indexOf('create table if not exists public.market_convergence_assessments (');
  await db.exec(base.slice(begin,base.indexOf('\n);',begin)+4));
  for(const name of ['20260822033000_implement_market_convergence_v1.sql','20260822042000_add_market_convergence_history_retry_v1.sql','20260822052500_enforce_market_convergence_retry_chain.sql'])
    await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
  const oldDefinitions=await query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='market_convergence'::regnamespace order by proname");
  await db.exec((await readFile('supabase/migrations/20261115235043_add_asx_technical_sources_v1.sql','utf8')).replaceAll('\r\n','\n'));
  await db.exec(await readFile('supabase/migrations/20261118030255_repair_asx_late_session_admission.sql','utf8'));
  const definition=(await query("select pg_get_functiondef('technical_engine.asx_source_snapshot_v1(uuid,timestamptz)'::regprocedure) d"))[0].d;
  await db.exec(clock(definition));
  const helpers=await readFile('supabase/migrations/20260821064000_implement_technical_indicators_v1.sql','utf8');
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function technical_engine.refresh_v1')));
  await db.exec(clock(await readFile('supabase/migrations/20261115235320_add_asx_technical_calculation_v1.sql','utf8'),technicalAt));
  await seedSource();
  await db.exec(clock(sql));
  // The current diagnostic uses the additive identity helper. Keep this suite's
  // original adapter coverage; the admission-identity suite tests the full repair.
  const identityMigration=await readFile('supabase/migrations/20261119051916_fix_asx_admission_note_identity.sql','utf8');
  const identityStart=identityMigration.indexOf('create function market_convergence.asx_input_identity_v1');
  assert(identityStart>=0);
  await db.exec(identityMigration.slice(identityStart,identityMigration.indexOf('CREATE OR REPLACE FUNCTION',identityStart)));
  await db.exec('grant select on instruments,data_providers,sync_runs,market_observations,market_scores,gpt_market_runs,gpt_market_assessments to service_role');
  const score=(await query('select * from market_scores where instrument_id=$1',[inst]))[0];
  await check('exact reviewed calendar seed and unchanged original v1 function definitions',async()=>{
    const c=(await query('select * from market_convergence.asx_calendars_v1'))[0];eq(c.manifest,manifest);eq(c.manifest_hash,trust.manifestHash);
    eq(c.verified_at.toISOString(),new Date(trust.verifiedAt).toISOString());eq(c.valid_until.toISOString(),new Date(trust.validUntil).toISOString());
    eq(await query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='market_convergence'::regnamespace and proname not like '%asx%' order by proname"),oldDefinitions);
  });
  await check('prepare is read-only and freezes actual source/calculation plus independent terminal AI',async()=>{
    const before=await evidence();await db.exec('set transaction read only;set local role service_role');const e=await ready();
    eq(e.logical_date,'2026-11-17');eq(e.target_session,'2026-11-17');eq(e.technical.id,score.id);eq(e.ai.assessment_id,aiId);
    eq(e.source_snapshot.snapshot.anchor_audit_id,anchor);eq(e.ai.technical_engine_input_used,false);
    eq(await evidence(),before);eq(await ledger(),[]);eq(await published(),[]);
  });
  await check('real source to convergence succeeds with independent formula and harmless scheduled/manual replay',async()=>{
    const e=await ready(),before=await evidence(),id=await run(),r=await receipt(id);eq(r.status,'succeeded');eq(r.input_envelope,e);
    const a=(await published())[0],x=expected(Number(score.overall_score),70,Number(score.confidence_score),80,'Buy');
    eq(a.methodology_version,'market-convergence-asx-v1');eq(Number(a.convergence_score),x.score);eq(Number(a.convergence_confidence),x.confidence);eq(a.convergence_label,x.label);
    eq(a.technical_score_id,score.id);eq(a.ai_assessment_id,aiId);eq(await evidence(),before);
    eq(await run('manual'),id);eq(await run('scheduled',null,'2026-11-18T03:39:00Z'),id);eq((await ledger()).length,1);eq((await published()).length,1);
    eq((await report()).readiness,'ALREADY_SUCCEEDED');eq((await report()).invocation_sql,null);
  });
  await check('readiness diagnostic omits private envelopes and its exact READY SQL executes successfully',async()=>{
    const r=await report();eq(r.readiness,'READY');eq(Object.keys(r).sort(),[
      'instrument_id','cutoff_at','readiness','existing_success_id','failed_leaf_id','attempt_number','technical_score_id',
      'ai_assessment_id','target_session','calendar_revision','invocation_sql'].sort());
    eq(JSON.stringify(r).includes('raw_payload'),false);eq(JSON.stringify(r).includes('source_snapshot'),false);
    const id=(await query(r.invocation_sql))[0].run_id;eq((await receipt(id)).status,'succeeded');
  });
  await check('hostile caller search_path and temporary shadow tables do not change source selection',async()=>{
    await db.exec('create temporary table market_scores(id bigint);create temporary table gpt_market_assessments(assessment_id uuid);set local search_path=pg_temp,public');
    const e=await ready();eq(e.technical.id,score.id);eq(e.ai.assessment_id,aiId);
  });
  await check('same-day changed AI inputs cannot replace frozen success or create another run',async()=>{
    await run();const rows=await published(),runs=await ledger();await db.exec('update gpt_market_assessments set score=71');
    eq((await report()).readiness,'SAME_DAY_INPUT_CHANGED');await rejected(()=>run(),/SAME_DAY_INPUT_CHANGED/);eq(await published(),rows);eq(await ledger(),runs);
  });
  await check('actual existing US v1 calculation/history remains unchanged by ASX run',async()=>{
    await db.query(`insert into market_scores(instrument_id,score_date,overall_score,confidence_score,methodology_version,technical_calculation_version,score_status,calculated_at)
      values($1,'2026-11-17',78,100,'technical-score-v1','technical-engine-v1','complete','2026-11-18T03:34Z')`,[other]);
    await db.query(`insert into gpt_market_assessments values($1,$2,$3,'2026-11-17','Buy',72,81,'independent-market-ai-v1','2026-11-18T03:33Z',false)`,[uid(302),other,aiRun]);
    const oldId=(await query("select market_convergence.run_v1('manual',null,$1::timestamptz,$2::uuid) id",[at,other]))[0].id;
    const oldRuns=await query('select * from market_convergence_runs order by id'),oldRows=await published();
    eq(oldRuns[0].id,oldId);eq(oldRuns[0].status,'succeeded');eq(Number(oldRows[0].convergence_score),75);eq(Number(oldRows[0].convergence_confidence),87.3);
    await run();eq(await query('select * from market_convergence_runs order by id'),oldRuns);
    eq((await published()).filter(r=>r.methodology_version==='market-convergence-v1'),oldRows);
  });
  await check('orphan ASX assessment cannot be adopted or overwritten without a successful frozen receipt',async()=>{
    await run();await db.exec('truncate market_convergence.asx_runs_v1');const old=await published();
    eq((await report()).readiness,'IMMUTABLE_ASSESSMENT_CONFLICT');eq((await report()).invocation_sql,null);
    await rejected(()=>run(),/IMMUTABLE_ASSESSMENT_CONFLICT/);eq(await ledger(),[]);eq(await published(),old);
  });
  for(const [field,stamp,state] of [['valid_until',at,'CALENDAR_UNAVAILABLE_OR_EXPIRED'],
    ['valid_until','2026-11-18T03:40:00.000001Z','READY'],['verified_at',at,'READY'],
    ['verified_at','2026-11-18T03:40:00.000001Z','CALENDAR_UNAVAILABLE_OR_EXPIRED']])await check('calendar '+field+' exact boundary '+stamp,async()=>{
      const c=(await query('select * from market_convergence.asx_calendars_v1'))[0];await db.exec('truncate market_convergence.asx_calendars_v1');
      await db.query('insert into market_convergence.asx_calendars_v1 values($1,$2,$3::jsonb,$4,$5)',
        [c.revision,c.manifest_hash,JSON.stringify(c.manifest),field==='verified_at'?stamp:c.verified_at,field==='valid_until'?stamp:c.valid_until]);
      eq((await prepare()).readiness,state);
    });
  await check('missing coverage cannot fall back to the last available calendar day',async()=>{
    const c=(await query('select * from market_convergence.asx_calendars_v1'))[0];c.manifest.endDate='2026-11-16';c.manifest.days=c.manifest.days.filter(d=>d.date<='2026-11-16');
    await db.exec('truncate market_convergence.asx_calendars_v1');await db.query('insert into market_convergence.asx_calendars_v1 values($1,$2,$3::jsonb,$4,$5)',
      [c.revision,c.manifest_hash,JSON.stringify(c.manifest),c.verified_at,c.valid_until]);await blocked('CALENDAR_UNAVAILABLE_OR_EXPIRED');
  });
  await check('no explicit OPEN date means no inferred target',async()=>{
    const c=(await query('select * from market_convergence.asx_calendars_v1'))[0];c.manifest.days=c.manifest.days.map(d=>({...d,status:'CLOSED',reason:'Synthetic closed date'}));
    await db.exec('truncate market_convergence.asx_calendars_v1');await db.query('insert into market_convergence.asx_calendars_v1 values($1,$2,$3::jsonb,$4,$5)',
      [c.revision,c.manifest_hash,JSON.stringify(c.manifest),c.verified_at,c.valid_until]);await blocked('CALENDAR_TARGET_MISSING');
  });
  for(const c of [null,'infinity','-infinity','2026-11-18T03:40:00.000001Z'])await check('invalid prepare cutoff '+c,async()=>{eq((await prepare(c)).readiness,'INVALID_CUTOFF');});
  for(const c of [null,'infinity','2026-11-18T03:40:00.000001Z','2026-11-18T03:34:59.999999Z'])await check('new run rejects non-current cutoff '+c,async()=>{await rejected(()=>run('manual',null,c),/current cutoff/);eq(await ledger(),[]);});
  await check('new cutoff five-minute boundary is inclusive',async()=>{eq((await receipt(await run('manual',null,'2026-11-18T03:35:00Z'))).status,'succeeded');});
  for(const [field,value] of [['is_active',false],['exchange_code','NYSE'],['currency_code','USD'],['asset_type','fund']])await check('instrument gate '+field,async()=>{
    await db.query(`update instruments set ${field}=$1 where id=$2`,[value,inst]);await blocked('UNSUPPORTED_INSTRUMENT');
  });
  for(const [change,code] of [
    ["delete from market_scores",'TECHNICAL_INPUT_MISSING'],["update market_scores set technical_calculation_version='other'",'TECHNICAL_INVALID_OR_STALE'],
    ["update market_scores set overall_score='NaN'",'TECHNICAL_INVALID_OR_STALE'],["update market_scores set confidence_score=null",'TECHNICAL_INVALID_OR_STALE'],
    ["update market_scores set score_date='2026-11-18'",'TECHNICAL_INVALID_OR_STALE'],["update market_scores set score_status='invalid'",'TECHNICAL_INVALID_OR_STALE'],
    ["update market_scores set score_details=score_details-'source_snapshot_id'",'TECHNICAL_SNAPSHOT_MISMATCH'],
    ["update market_scores set overall_score=overall_score-1",'TECHNICAL_PAYLOAD_MISMATCH'],
    ["update sync_runs set metadata=metadata||'{\"coverage_has_rejected_bars\":true}'::jsonb",'TECHNICAL_SOURCE_CHANGED_OR_BLOCKED'],
    ["update market_observations set loaded_at='2026-11-18T03:41Z' where id=1",'TECHNICAL_SOURCE_CHANGED_OR_BLOCKED'],
    ["delete from gpt_market_assessments",'AI_INPUT_MISSING'],["update gpt_market_assessments set technical_engine_input_used=true",'AI_INVALID_OR_STALE'],
    ["update gpt_market_assessments set score='NaN'",'AI_INVALID_OR_STALE'],["update gpt_market_assessments set confidence=101",'AI_INVALID_OR_STALE'],
    ["update gpt_market_assessments set rating='unknown'",'AI_INVALID_OR_STALE'],["update gpt_market_assessments set assessment_date='2026-11-18'",'AI_INVALID_OR_STALE'],
    ["update gpt_market_assessments set assessment_date='2026-11-12'",'AI_INVALID_OR_STALE'],["update gpt_market_runs set status='running'",'AI_RUN_NOT_TERMINAL_AT_CUTOFF'],
    ["update gpt_market_runs set completed_at=null",'AI_RUN_NOT_TERMINAL_AT_CUTOFF'],["update gpt_market_runs set completed_at='2026-11-18T03:40:00.000001Z'",'AI_RUN_NOT_TERMINAL_AT_CUTOFF'],
    ["update gpt_market_runs set completed_at='2026-11-18T03:32Z'",'AI_RUN_NOT_TERMINAL_AT_CUTOFF'],
    ["update gpt_market_runs set analysis_cutoff_time='2026-11-18T03:34Z'",'AI_RUN_NOT_TERMINAL_AT_CUTOFF']
  ])await check(code+': '+change,async()=>{await db.exec(change);await blocked(code);});
  await check('latest unfinished AI prevents fallback to older terminal assessment',async()=>{
    await db.exec(`insert into gpt_market_runs values('${uid(401)}','running',null,'2026-11-18T03:35Z');
      insert into gpt_market_assessments select '${uid(301)}',instrument_id,'${uid(401)}',assessment_date,rating,score,confidence,methodology_version,'2026-11-18T03:36Z',false from gpt_market_assessments`);
    await blocked('AI_RUN_NOT_TERMINAL_AT_CUTOFF');
  });
  await check('canonical AI date/time/ID tie-break selects highest identity without fallback',async()=>{
    await db.exec(`insert into gpt_market_assessments select '${uid(301)}',instrument_id,run_id,assessment_date,rating,71,confidence,methodology_version,created_at,false from gpt_market_assessments`);
    const e=await ready();eq(e.ai.assessment_id,uid(301));eq(e.ai.score,71);
    await db.exec(`update gpt_market_assessments set score=101 where assessment_id='${uid(301)}'`);await blocked('AI_INVALID_OR_STALE');
  });
  await check('future-created AI row cannot be pulled backward into frozen cutoff',async()=>{
    await db.exec(`insert into gpt_market_assessments select '${uid(301)}',instrument_id,run_id,assessment_date,rating,99,confidence,methodology_version,'2026-11-18T03:40:00.000001Z',false from gpt_market_assessments`);
    eq((await ready()).ai.assessment_id,aiId);
  });
  await check('latest named Technical row with future score date blocks older valid row',async()=>{
    await db.query(`insert into market_scores(instrument_id,score_date,overall_score,confidence_score,methodology_version,technical_calculation_version,score_status,score_details,calculated_at)
      select instrument_id,'2026-11-18',overall_score,confidence_score,methodology_version,technical_calculation_version,score_status,score_details,calculated_at from market_scores where id=$1`,[score.id]);
    await blocked('TECHNICAL_INVALID_OR_STALE');
  });
  await check('snapshot payload tamper cannot retain eligibility under an unchanged stored hash',async()=>{
    await db.exec("update technical_engine.asx_input_snapshots set snapshot=jsonb_set(snapshot,'{observations,0,volume}','99999')");
    await blocked('TECHNICAL_SOURCE_CHANGED_OR_BLOCKED');
  });
  await check('snapshot linked to another instrument is not accepted',async()=>{
    await db.query('update technical_engine.asx_input_snapshots set instrument_id=$1',[other]);await blocked('TECHNICAL_SNAPSHOT_MISMATCH');
  });
  await check('matched hash cannot hide prior-week Technical cutoff',async()=>{
    await db.exec(`update technical_engine.asx_input_snapshots set cutoff_at='2026-11-15T03:34Z',snapshot=jsonb_set(snapshot,'{cutoff_at}','"2026-11-15T03:34:00+00:00"');
      update market_scores set calculated_at='2026-11-15T03:34Z',score_details=jsonb_set(score_details,'{cutoff_at}','"2026-11-15T03:34:00+00:00"')`);
    await blocked('TECHNICAL_SOURCE_CHANGED_OR_BLOCKED');
  });
  await check('later source audit cannot retroactively validate or alter a frozen Technical snapshot',async()=>{
    await db.query(`insert into sync_runs select $1,provider_id,'2026-11-18T03:36Z','2026-11-18T03:37Z','failed',requested_count,received_count,inserted_count,metadata from sync_runs`,[uid(201)]);
    eq((await prepare('2026-11-18T03:35:00Z')).readiness,'TECHNICAL_SOURCE_CHANGED_OR_BLOCKED');
  });
  await check('four-day AI freshness and partial terminal run remain eligible',async()=>{
    await db.exec("update gpt_market_assessments set assessment_date='2026-11-13';update gpt_market_runs set status='partial'");await ready();
  });
  for(const [n,state] of [[20,'READY'],[19,'RAW_SESSION_NOT_READY']])await check(n+' nonconsecutive reviewed OPEN observations',async()=>{
    const dates=manifest.days.filter(d=>d.status==='OPEN'&&d.date<='2026-11-17').map(d=>d.date);dates.splice(2,1);dates.splice(4,1);
    await seedSource(dates.slice(-n));eq((await prepare()).readiness,state);
  });
  await check('source-valid CLOSED date observation blocks raw-session readiness',async()=>{
    await seedSource([...manifest.days.filter(d=>d.status==='OPEN'&&d.date<='2026-11-17').map(d=>d.date),'2026-11-14'].sort());await blocked('RAW_SESSION_NOT_READY');
  });
  for(const status of ['failed','succeeded','partial'])await check('terminal AI status '+status,async()=>{
    await db.query('update gpt_market_runs set status=$1',[status]);eq((await prepare()).readiness,status==='failed'?'AI_RUN_NOT_TERMINAL_AT_CUTOFF':'READY');
  });
  await check('publication failure is atomic with durable pinned receipt; original-cutoff retry succeeds',async()=>{
    await fault();const id=await run(),r=await receipt(id);eq(r.status,'failed');eq(r.error_code,'fixture publication failure');eq(await published(),[]);
    await rejected(()=>run('manual'),/Resolve failed ASX chain/);await db.exec('drop trigger fixture_publication_fault on market_convergence_assessments');
    const retry=await receipt(await run('retry',id,'2020-01-01T00:00:00Z'));eq(retry.status,'succeeded');eq(retry.cutoff_at,r.cutoff_at);eq(retry.attempt_number,2);eq(retry.input_envelope,r.input_envelope);
    await rejected(()=>run('retry',id),/Invalid ASX retry parent/);
  });
  await check('three-attempt linear retry limit, wrong-instrument and ancestor rejection',async()=>{
    await fault();const first=await run();await rejected(()=>run('retry',first,at,other),/Invalid ASX retry parent/);
    const second=await run('retry',first),third=await run('retry',second);eq((await receipt(third)).attempt_number,3);
    await rejected(()=>run('retry',first),/Invalid ASX retry parent/);await rejected(()=>run('retry',third),/Invalid ASX retry parent/);
    eq((await report()).readiness,'RETRY_EXHAUSTED');eq((await ledger()).length,3);eq(await published(),[]);
  });
  await check('changed pinned AI cannot be substituted on failed retry',async()=>{
    await fault();const first=await run();await db.exec('drop trigger fixture_publication_fault on market_convergence_assessments;update gpt_market_assessments set score=71');
    const r=await receipt(await run('retry',first));eq(r.status,'failed');eq(r.error_code,'PINNED_INPUT_CHANGED_OR_BLOCKED');eq(await published(),[]);
  });
  await check('retry cannot use expired current calendar trust despite an originally valid frozen cutoff',async()=>{
    await fault();const first=await run();await db.exec('drop trigger fixture_publication_fault on market_convergence_assessments');
    const c=(await query('select * from market_convergence.asx_calendars_v1'))[0];await db.exec('truncate market_convergence.asx_calendars_v1');
    await db.query('insert into market_convergence.asx_calendars_v1 values($1,$2,$3::jsonb,$4,$5)',
      [c.revision,c.manifest_hash,JSON.stringify(c.manifest),c.verified_at,at]);
    const r=await receipt(await run('retry',first));eq(r.status,'failed');eq(r.error_code,'PINNED_INPUT_CHANGED_OR_BLOCKED');eq(await published(),[]);
  });
  await check('retry cannot accept AI completion moved later than its original cutoff',async()=>{
    await fault();const first=await run('scheduled',null,'2026-11-18T03:35:00Z');
    await db.exec("drop trigger fixture_publication_fault on market_convergence_assessments;update gpt_market_runs set completed_at='2026-11-18T03:36Z'");
    const r=await receipt(await run('retry',first,at));eq(r.status,'failed');eq(r.error_code,'PINNED_INPUT_CHANGED_OR_BLOCKED');
    eq(r.cutoff_at.toISOString(),'2026-11-18T03:35:00.000Z');eq(await published(),[]);
  });
  await check('source change during public insert is rolled back and cannot publish mixed evidence',async()=>{
    const before=await evidence();await fault("update public.gpt_market_assessments set score=score+1;");const r=await receipt(await run());
    eq(r.status,'failed');eq(r.error_code,'INPUT_CHANGED_DURING_PUBLICATION');eq(await published(),[]);eq(await evidence(),before);
  });
  for(const source of ['historical','invalid',null])await check('invalid execution source '+source,async()=>{await rejected(()=>run(source),/Invalid ASX execution source/);});
  await check('non-retry parent and missing retry parent rejected',async()=>{
    await rejected(()=>run('manual',uid(999)),/Invalid ASX execution source/);await rejected(()=>run('retry'),/Invalid ASX execution source/);
    await rejected(()=>run('retry',uid(999)),/Invalid ASX retry parent/);
  });
  await check('original v1 running receipt blocks adapter before writes',async()=>{
    await db.exec(`insert into market_convergence_runs(logical_date,cutoff_at,instrument_id,execution_source,attempt_number,status)
      values('2026-11-17','${at}','${other}','manual',1,'running')`);
    await rejected(()=>run(),/Unresolved convergence run/);eq(await ledger(),[]);eq((await report()).readiness,'CONVERGENCE_RUNNING');
  });
  await check('unresolved ASX running receipt blocks another admission',async()=>{
    await db.query(`insert into market_convergence.asx_runs_v1(instrument_id,logical_date,cutoff_at,execution_source,attempt_number,status,input_envelope)
      values($1,'2026-11-17',$2,'manual',1,'running',$3::jsonb)`,[inst,at,JSON.stringify(await ready())]);
    await rejected(()=>run(),/Unresolved convergence run/);eq((await ledger()).length,1);eq((await report()).readiness,'CONVERGENCE_RUNNING');
    await rejected(()=>db.exec("update market_convergence.asx_runs_v1 set input_envelope='{}'"),/immutable/);
  });
  for(const role of ['anon','authenticated'])await check(role+' denied private helpers and ledger',async()=>{
    for(const signature of ['market_convergence.prepare_asx_v1(uuid,timestamptz)','market_convergence.calculate_asx_v1(jsonb)','market_convergence.run_asx_v1(uuid,text,uuid,timestamptz)'])
      eq((await query('select has_function_privilege($1,$2,\'execute\') allowed',[role,signature]))[0].allowed,false);
    eq((await query("select has_table_privilege($1,'market_convergence.asx_runs_v1','select') allowed",[role]))[0].allowed,false);
    await db.exec('set local role '+role);await rejected(()=>prepare(),/permission denied/);await rejected(()=>run(),/permission denied/);
  });
  await check('service role executes real path; terminal ledger, calendar and ASX assessment mutations rejected',async()=>{
    await db.exec('set local role service_role');const id=await run();eq((await receipt(id)).status,'succeeded');
    for(const command of ["update market_convergence.asx_runs_v1 set error_code='changed'","delete from market_convergence.asx_runs_v1",
      "update market_convergence.asx_calendars_v1 set manifest_hash='changed'","update market_convergence_assessments set summary='changed'"]){
      await db.exec('savepoint protected');await rejected(()=>db.exec(command),/immutable|permission denied/);await db.exec('rollback to savepoint protected');
    }
  });
  await check('pure calculator matches independent examples, score bands, gap boundaries and disagreement precedence',async()=>{
    const cases=[[78,72,100,81,'Buy'],[82,55,100,64,'Hold'],[28,74,90,81,'Buy'],[0,0,0,0,'Strong Sell'],[100,100,100,100,'Strong Buy']];
    for(const t of [0,14.99,15,19.99,20,29.99,30,39.99,40,59.99,60,69.99,70,79.99,80,84.99,85,100])cases.push([t,t,90,80,t>=60?'Buy':t<40?'Sell':'Hold']);
    for(const gap of [9.99,10,24.99,25])cases.push([70,70-gap,100,100,'Hold']);
    for(const [t,a,tc,ac,rating] of cases){const x=expected(t,a,tc,ac,rating),e={technical:{overall_score:t,confidence_score:tc,score_date:'2026-11-17'},ai:{score:a,confidence:ac,rating,assessment_date:'2026-11-17'}};
      const result=(await query('select market_convergence.calculate_asx_v1($1::jsonb) r',[JSON.stringify(e)]))[0].r;
      eq(Number(result.convergence_score),x.score);eq(Number(result.convergence_confidence),x.confidence);eq(result.convergence_label,x.label);eq(result.technical_signal,x.ts);
    }
  });
  eq(sql.includes("hashtextextended('market_convergence.run_v1',0)"),true);
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual source/calculation/adapter; clocks substituted only; native concurrency unverified.`);
  console.log(createHash('sha256').update(sql).digest('hex')+' '+path);
}finally{await db.close();}
