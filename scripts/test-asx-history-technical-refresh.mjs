// Isolated PostgreSQL tests for the service-only history-worker refresh RPC.
// Actual release/rollback SQL, synthetic routing probes, then actual ASX
// calculation/refresh integration with a deterministic source-admission stub.
// Run from repo root; optional PGLITE_MODULE points to an existing installation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const releasePath='supabase/migrations/20261116054221_route_asx_history_technical_refresh_v1.sql';
const rollbackPath='scripts/rollback-asx-history-technical-refresh.sql';
const calculationPath='supabase/migrations/20261115235320_add_asx_technical_calculation_v1.sql';
const [release,rollback,calculation]=await Promise.all([releasePath,rollbackPath,calculationPath].map(p=>readFile(p,'utf8')));
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const asx=uid(1),other=uid(2),inactive=uid(3),noVenue=uid(4),blocked=uid(5);
const batch=uid(100);
let assertions=0,scenarios=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(sql,params=[])=>(await db.query(sql,params)).rows;
const rpc=async(id)=>(await query('select public.refresh_market_trends_for_instrument($1::uuid) result',[id]))[0].result;
const check=async(name,fn)=>{
  try {await fn();scenarios++;console.log(`PASS ${name}`);}
  catch(error){throw new Error(`FAIL ${name}: ${String(error.message).slice(0,1200)}`);}
};
const calls=async()=>query('select stage,instrument_id from fixture_calls order by id');
const clearCalls=()=>db.exec('truncate fixture_calls');
const keys=['instrument_id','indicator_rows','complete_indicators','score_rows','complete_scores'];
const deny=async(statement)=>{await assert.rejects(db.query(statement),/permission denied/);assertions++;};
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema technical_engine;
    create table instruments(id uuid primary key,is_active boolean,exchange_code text);
    insert into instruments values('${asx}',true,'ASX'),('${other}',true,'NYSE'),
      ('${inactive}',false,'ASX'),('${noVenue}',true,null),('${blocked}',true,'ASX');
    create table technical_indicators(id bigint generated always as identity primary key,
      instrument_id uuid,observation_id bigint,indicator_code text,interval_code text,calculated_at timestamptz,
      value numeric(24,8),values jsonb,calculation_version text,
      constraint technical_indicators_instrument_id_observation_id_indicator_key unique
      (instrument_id,observation_id,interval_code,indicator_code,calculation_version));
    create table market_scores(id bigint generated always as identity primary key,instrument_id uuid,score_date date,
      momentum_score numeric,trend_score numeric,volatility_score numeric,volume_score numeric,overall_score numeric,
      confidence_score numeric,methodology_version text,technical_calculation_version text,score_status text,
      score_details jsonb,calculated_at timestamptz,
      constraint market_scores_instrument_date_methodology_key unique(instrument_id,score_date,methodology_version));
    create table fixture_calls(id bigint generated always as identity,stage text,instrument_id uuid);
    create table fixture_asx(result jsonb);
    insert into fixture_asx values('{}');
    create function technical_engine.refresh_v1(p_instrument_id uuid default null)
      returns table(rows_upserted integer,complete_rows integer) language plpgsql as $$begin
      insert into public.fixture_calls(stage,instrument_id) values('tiingo-indicators',p_instrument_id);
      return query select case when p_instrument_id='${noVenue}' then null::int else 16 end,
        case when p_instrument_id='${noVenue}' then null::int else 13 end;end$$;
    create function technical_engine.refresh_scores_v1(p_instrument_id uuid default null)
      returns table(rows_upserted integer,complete_scores integer) language plpgsql as $$begin
      insert into public.fixture_calls(stage,instrument_id) values('tiingo-scores',p_instrument_id);
      return query select case when p_instrument_id='${noVenue}' then null::int else 1 end,
        case when p_instrument_id='${noVenue}' then null::int else 0 end;end$$;
    create function technical_engine.refresh_asx_v1(p_instrument_id uuid default null)
      returns jsonb language plpgsql as $$begin
      insert into public.fixture_calls(stage,instrument_id) values('asx',p_instrument_id);
      return (select result from public.fixture_asx);end$$;
    revoke all on schema technical_engine from public,anon,authenticated,service_role;
    revoke all on all functions in schema technical_engine from public,anon,authenticated,service_role;`);
  // Capture the supplied pre-release rollback baseline before installing the
  // change. Independent return-contract checks below do not derive expectations
  // from this definition. Normalize only Windows checkout line endings.
  await db.exec(rollback.replaceAll('\r\n','\n'));
  const baselineDefinition=(await query("select pg_get_functiondef('public.refresh_market_trends_for_instrument(uuid)'::regprocedure) sql"))[0].sql;
  const legacy=await rpc(other);await clearCalls();
  await db.exec(release);
  await check('non-ASX routing and all legacy return keys are unchanged',async()=>{
    eq(await rpc(other),legacy);
    eq(legacy,{instrument_id:other,indicator_rows:16,complete_indicators:13,score_rows:1,complete_scores:0});
    eq(Object.keys(legacy).sort(),[...keys].sort());
    eq(await calls(),[{stage:'tiingo-indicators',instrument_id:other},{stage:'tiingo-scores',instrument_id:other}]);
    await clearCalls();eq(await rpc(noVenue),{instrument_id:noVenue,indicator_rows:0,complete_indicators:0,score_rows:0,complete_scores:0});
    eq((await calls()).map(c=>c.stage),['tiingo-indicators','tiingo-scores']);
  });
  const metadata={refresh_batch_id:batch,instruments_processed:1,blocked_instruments:0,
    indicator_rows_upserted:3,score_rows_upserted:1,complete_scores:0,partial_scores:1,
    calculation_version:'technical-engine-asx-v1',methodology_version:'technical-score-asx-v1'};
  await db.query('update fixture_asx set result=$1::jsonb',[JSON.stringify(metadata)]);
  for(const [instrument,version,refreshBatch,status] of [
    [asx,'technical-engine-asx-v1',batch,'complete'],[asx,'technical-engine-asx-v1',batch,'complete'],
    [asx,'technical-engine-asx-v1',batch,'insufficient_history'],
    [asx,'technical-engine-asx-v1','old-batch','complete'],[asx,'technical-engine-asx-v1',null,'complete'],
    [other,'technical-engine-asx-v1',batch,'complete'],[asx,'technical-engine-v1',batch,'complete']]) {
    await db.query('insert into technical_indicators(instrument_id,calculation_version,values) values($1::uuid,$2,$3::jsonb)',
      [instrument,version,JSON.stringify({refresh_batch_id:refreshBatch,status})]);
  }
  await check('ASX uses only ASX refresh and counts only this instrument/version/batch complete rows',async()=>{
    await clearCalls();const r=await rpc(asx);
    eq(Object.keys(r).sort(),[...keys,'asx'].sort());
    eq(r,{instrument_id:asx,indicator_rows:3,complete_indicators:2,score_rows:1,complete_scores:0,asx:metadata});
    eq(await calls(),[{stage:'asx',instrument_id:asx}]);
  });
  await check('blocked ASX reports zero fresh work despite previous complete history',async()=>{
    const result={...metadata,refresh_batch_id:uid(101),blocked_instruments:1,blocker_counts:{UNRESOLVED_SOURCE_QUALITY:1},
      indicator_rows_upserted:0,score_rows_upserted:0,complete_scores:0,partial_scores:0};
    await db.query('update fixture_asx set result=$1::jsonb',[JSON.stringify(result)]);
    await clearCalls();const r=await rpc(asx);
    eq(r.indicator_rows,0);eq(r.complete_indicators,0);eq(r.score_rows,0);eq(r.complete_scores,0);
    eq(r.asx.blocker_counts,{UNRESOLVED_SOURCE_QUALITY:1});eq(await calls(),[{stage:'asx',instrument_id:asx}]);
  });
  await check('unknown and null instruments fail before invoking either engine',async()=>{
    for(const value of [uid(999),null]) {
      await clearCalls();await assert.rejects(rpc(value),/Unknown instrument/);assertions++;eq(await calls(),[]);
    }
  });
  await check('only service role can call the definer RPC without underlying privileges',async()=>{
    for(const role of ['anon','authenticated']) {
      eq((await query("select has_function_privilege($1,'public.refresh_market_trends_for_instrument(uuid)','EXECUTE') allowed",[role]))[0].allowed,false);
      await db.exec(`set role ${role}`);
      try{await deny(`select public.refresh_market_trends_for_instrument('${asx}')`);}finally{await db.exec('reset role');}
    }
    await db.exec('set role service_role');
    try{
      await deny('select * from public.instruments');
      await deny(`select technical_engine.refresh_asx_v1('${asx}')`);
      eq((await rpc(other)).indicator_rows,16);eq((await rpc(asx)).asx.blocked_instruments,1);
    }finally{await db.exec('reset role');}
    const security=(await query("select prosecdef,proconfig from pg_proc where oid='public.refresh_market_trends_for_instrument(uuid)'::regprocedure"))[0];
    eq(security.prosecdef,true);eq(security.proconfig,['search_path=pg_catalog']);
  });
  await check('underlying ASX errors propagate instead of returning success-shaped zero counts',async()=>{
    const definition=(await query("select pg_get_functiondef('technical_engine.refresh_asx_v1(uuid)'::regprocedure) sql"))[0].sql;
    await db.exec(`create or replace function technical_engine.refresh_asx_v1(p_instrument_id uuid default null)
      returns jsonb language plpgsql as $$begin raise exception 'synthetic ASX calculation failure';end$$;`);
    try{await assert.rejects(rpc(asx),/synthetic ASX calculation failure/);assertions++;}finally{await db.exec(definition);}
  });
  await check('rollback exactly restores supplied baseline, legacy ASX routing, ACL and persisted rows',async()=>{
    const before=await query('select * from technical_indicators order by id');
    await db.exec(rollback.replaceAll('\r\n','\n'));
    eq((await query("select pg_get_functiondef('public.refresh_market_trends_for_instrument(uuid)'::regprocedure) sql"))[0].sql,baselineDefinition);
    eq(await query('select * from technical_indicators order by id'),before);
    await clearCalls();eq(await rpc(asx),{instrument_id:asx,indicator_rows:16,complete_indicators:13,score_rows:1,complete_scores:0});
    eq((await calls()).map(c=>c.stage),['tiingo-indicators','tiingo-scores']);
    for(const role of ['anon','authenticated']) eq((await query("select has_function_privilege($1,'public.refresh_market_trends_for_instrument(uuid)','EXECUTE') allowed",[role]))[0].allowed,false);
    eq((await query("select has_function_privilege('service_role','public.refresh_market_trends_for_instrument(uuid)','EXECUTE') allowed"))[0].allowed,true);
  });

  // Actual ASX calculation and persisted refresh, replacing only source admission.
  await db.exec('truncate technical_indicators,market_scores');
  const helpers=await readFile('supabase/migrations/20260821064000_implement_technical_indicators_v1.sql','utf8');
  await db.exec(helpers.slice(0,helpers.indexOf('create or replace function technical_engine.refresh_v1(')));
  await db.exec(`create table fixture_source(instrument_id uuid primary key,snapshot jsonb);
    create function technical_engine.asx_source_snapshot_v1(p_instrument_id uuid,p_cutoff_at timestamptz)
      returns jsonb language sql stable as 'select snapshot||jsonb_build_object(''cutoff_at'',p_cutoff_at) from public.fixture_source where instrument_id=p_instrument_id';`);
  await db.exec(calculation);await db.exec(release);
  const observations=[];const date=new Date('2025-01-06T00:00:00Z');
  while(observations.length<80) {
    if(![0,6].includes(date.getUTCDay())) observations.push({id:observations.length+1,observed_at:date.toISOString(),adjusted_close:100+observations.length,volume:100});
    date.setUTCDate(date.getUTCDate()+1);
  }
  const source={status:'ready',source_hash:'isolated-history-hook-source',observations,
    window_start:'2025-01-06',window_end:observations.at(-1).observed_at.slice(0,10),
    anchor_audit_id:uid(500),terminal_audit_id:uid(500),audit_ids:[uid(500)]};
  await db.query('insert into fixture_source values($1::uuid,$2::jsonb),($3::uuid,$4::jsonb)',
    [asx,JSON.stringify(source),blocked,JSON.stringify({status:'blocked',reason:'UNRESOLVED_SOURCE_QUALITY'})]);
  let first;
  await check('actual ASX history hook persists one fresh batch with independently counted completeness',async()=>{
    await clearCalls();first=await rpc(asx);
    eq(first.instrument_id,asx);eq(first.indicator_rows,16);eq(first.score_rows,1);eq(first.complete_scores,0);
    // Eight daily indicators: only SMA200 lacks history (7 complete).
    // Sixteen weekly closes: EMA12 and RSI14 alone have enough periods (2).
    eq(first.complete_indicators,9);eq(first.asx.partial_scores,1);eq(first.asx.blocked_instruments,0);
    const actual=await query('select * from technical_indicators where instrument_id=$1::uuid',[asx]);
    eq(actual.length,16);eq(actual.every(r=>r.values.refresh_batch_id===first.asx.refresh_batch_id),true);
    eq((await query('select count(*)::int n from technical_engine.asx_input_snapshots'))[0].n,1);
    eq((await query('select score_details from market_scores'))[0].score_details.refresh_batch_id,first.asx.refresh_batch_id);
    eq(await calls(),[]);
  });
  await check('actual rerun preserves logical identities and excludes prior batch/version/instrument rows',async()=>{
    const priorIds=(await query('select id from technical_indicators order by id')).map(r=>r.id);
    await db.query(`insert into technical_indicators(instrument_id,observation_id,indicator_code,interval_code,calculation_version,values)
      values($1::uuid,999,'sma_20','1day','technical-engine-asx-v1',$3::jsonb),
      ($1::uuid,999,'sma_20','1day','technical-engine-v1',$3::jsonb),
      ($2::uuid,999,'sma_20','1day','technical-engine-asx-v1',$3::jsonb)`,[asx,other,JSON.stringify({status:'complete',refresh_batch_id:first.asx.refresh_batch_id})]);
    const next=await rpc(asx);eq(next.indicator_rows,16);eq(next.complete_indicators,9);eq(next.score_rows,1);
    assert.notEqual(next.asx.refresh_batch_id,first.asx.refresh_batch_id);assertions++;
    eq((await query('select id from technical_indicators where observation_id<>999 order by id')).map(r=>r.id),priorIds);
    eq((await query('select count(*)::int n from market_scores'))[0].n,1);
    eq((await query('select count(*)::int n from technical_engine.asx_input_snapshots'))[0].n,2);
  });
  await check('actual inactive and blocked ASX instruments never fall back to Tiingo',async()=>{
    await clearCalls();
    const before=await query('select * from market_scores order by id');
    const inactiveResult=await rpc(inactive);eq(inactiveResult.asx.instruments_processed,0);
    for(const key of ['indicator_rows','complete_indicators','score_rows','complete_scores']) eq(inactiveResult[key],0);
    const blockedResult=await rpc(blocked);eq(blockedResult.asx.blocked_instruments,1);
    eq(blockedResult.asx.blocker_counts,{UNRESOLVED_SOURCE_QUALITY:1});
    for(const key of ['indicator_rows','complete_indicators','score_rows','complete_scores']) eq(blockedResult[key],0);
    eq(await calls(),[]);eq(await query('select * from market_scores order by id'),before);
  });
  await check('service-role RPC succeeds through actual private ASX functions and snapshot RLS',async()=>{
    await db.exec('set role service_role');
    try{const r=await rpc(asx);eq(r.indicator_rows,16);eq(r.complete_indicators,9);eq(r.score_rows,1);}
    finally{await db.exec('reset role');}
  });
  await check('rollback after real calculation retains snapshots, indicators and scores',async()=>{
    const data=async()=>query(`select (select jsonb_agg(to_jsonb(x) order by id) from technical_indicators x) indicators,
      (select jsonb_agg(to_jsonb(x) order by id) from market_scores x) scores,
      (select jsonb_agg(to_jsonb(x) order by id) from technical_engine.asx_input_snapshots x) snapshots`);
    const before=await data();await db.exec(rollback.replaceAll('\r\n','\n'));eq(await data(),before);
    eq((await query("select pg_get_functiondef('public.refresh_market_trends_for_instrument(uuid)'::regprocedure) sql"))[0].sql,baselineDefinition);
  });
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual history RPC and ASX calculation/refresh; synthetic source admission.`);
  for(const [name,sql] of [['Release',release],['Rollback',rollback],['Calculation',calculation]]) console.log(`${name} SHA256 ${createHash('sha256').update(sql).digest('hex')}`);
} finally {await db.close();}
