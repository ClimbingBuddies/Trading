// Independent actual-PostgreSQL late-session provenance regressions.
// Installs original source, proves the failure, then applies the new source repair.
// No provider calls, hosted services, production data or clock substitution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite();
const sourcePath='supabase/migrations/20261115235043_add_asx_technical_sources_v1.sql';
const sourceSql=(await readFile(sourcePath,'utf8')).replaceAll('\r\n','\n');
const repairPath=process.env.ASX_SOURCE_REPAIR_SQL||'supabase/migrations/20261118030255_repair_asx_late_session_admission.sql',repairSql=await readFile(repairPath,'utf8');
const rollbackPath='scripts/rollback-asx-late-session-admission.sql',rollbackSql=await readFile(rollbackPath,'utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const inst=uid(1),provider=uid(2),anchor=uid(100),prior=uid(101),latest=uid(102);
const cutoff='2026-11-18T01:00:00Z',basis='Yahoo native OHLC plus separately supplied adjusted close';
const dateRange=(from,to)=>{const result=[];for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=86400000){const d=new Date(t);if(![0,6].includes(d.getUTCDay()))result.push(d.toISOString().slice(0,10));}return result;};
const anchorDates=dateRange('2025-11-16','2026-11-16'),oldDates=dateRange('2026-11-02','2026-11-16'),newDates=dateRange('2026-11-02','2026-11-17');
let scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(text,params=[])=>(await pg.query(text,params)).rows;
const snapshot=async()=>(await query('select technical_engine.asx_source_snapshot_v1($1::uuid,$2::timestamptz) result',[inst,cutoff]))[0].result;
const ready=async()=>{const s=await snapshot();eq(s.status,'ready',JSON.stringify(s));return s;};
const blocked=async()=>{const s=await snapshot();eq(s.status,'blocked',JSON.stringify(s));return s;};
async function audit(id,start,end,returned,accepted,parent,minute,legacy=false){
  const retrieved=`2026-11-18T00:${String(minute+1).padStart(2,'0')}:00.000Z`;
  const metadata={function:'asx-yahoo-market-history',provider:'yahoo',instrument_id:inst,symbol:'TEST',provider_symbol:'TEST.AX',exchange:'ASX',
    requested_start_date:start,requested_end_date:end,price_basis:basis,retrieved_at:retrieved,normalization_version:2,
    coverage_has_rejected_bars:false,rejected_bars:[],duplicate_bars:[],events:{},valid_rows:returned.length};
  if(!legacy)Object.assign(metadata,{history_window_version:1,previous_audit_id:parent,accepted_provider_dates:accepted,
    fetch_attempts:[{requested_start_date:start,requested_end_date:end,retrieved_at:retrieved,valid_rows:returned.length,rejected_bars:[],duplicate_bars:[],events:{}}]});
  await pg.query('insert into sync_runs values($1,$2,$3,$4,\'succeeded\',1,$5,$5,$6::jsonb)',
    [id,provider,`2026-11-18T00:${String(minute).padStart(2,'0')}:00Z`,`2026-11-18T00:${String(minute+2).padStart(2,'0')}:00Z`,returned.length,JSON.stringify(metadata)]);
  for(const date of returned){
    const n=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse('2025-11-01T00:00:00Z'))/86400000)+100,value=100+n;
    const raw={date,open:value,high:value+1,low:value-1,close:value,adjusted_close:value,volume:100+n,
      _backfill:{function:metadata.function,provider:'yahoo',symbol:'TEST',provider_symbol:'TEST.AX',exchange:'ASX',
        requested_start_date:start,requested_end_date:end,price_basis:basis,retrieved_at:retrieved,source:'Yahoo Finance'}};
    await pg.query(`insert into market_observations values($1,$2,$3,'1day',$4,$5,$6,$7,$5,$5,$8,'AUD',$9,$10::jsonb)
      on conflict(id) do update set loaded_at=excluded.loaded_at,raw_payload=excluded.raw_payload`,
      [n,inst,provider,date+'T00:00:00Z',value,value+1,value-1,100+n,retrieved,JSON.stringify(raw)]);
  }
}
async function seed({legacy=false,lateAnchor=false,withNew=true}={}){
  await pg.exec('truncate market_observations,sync_runs,technical_engine.asx_input_snapshots,technical_indicators,market_scores');
  const originalDates=lateAnchor?anchorDates.filter(d=>d!=='2026-10-20'):anchorDates;
  await audit(anchor,'2025-11-16','2026-11-16',originalDates,originalDates,null,0,legacy);
  await audit(prior,'2026-11-02','2026-11-17',oldDates,[...new Set([...originalDates,...oldDates])],anchor,3);
  if(withNew){
    const returned=lateAnchor?dateRange('2026-10-15','2026-11-17'):newDates;
    await audit(latest,lateAnchor?'2026-10-15':'2026-11-02','2026-11-17',returned,[...new Set([...anchorDates,...newDates])],prior,6);
  }
}
async function patch(id,fn){const m=(await query('select metadata from sync_runs where id=$1',[id]))[0].metadata;fn(m);await pg.query('update sync_runs set metadata=$1::jsonb where id=$2',[JSON.stringify(m),id]);}
async function scenario(name,fn,options={}){await seed(options);try{await fn();scenarios++;console.log('PASS '+name);}catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,2000));}}
try{
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table instruments(id uuid primary key,is_active boolean,symbol text,exchange_code text,asset_type text,currency_code text);
    create table data_providers(id uuid primary key,provider_code text,is_active boolean);
    create table sync_runs(id uuid primary key,provider_id uuid,started_at timestamptz,finished_at timestamptz,status text,
      requested_count int,received_count int,inserted_count int,metadata jsonb);
    create table market_observations(id bigint primary key,instrument_id uuid,provider_id uuid,interval_code text,observed_at timestamptz,
      open numeric(20,8),high numeric(20,8),low numeric(20,8),close numeric(20,8),adjusted_close numeric(20,8),volume numeric(24,4),
      currency_code text,loaded_at timestamptz,raw_payload jsonb);
    create table technical_indicators(id bigint generated always as identity primary key,instrument_id uuid,observation_id bigint,
      indicator_code text,interval_code text,calculated_at timestamptz,value numeric(24,8),values jsonb,calculation_version text,
      constraint technical_indicators_instrument_id_observation_id_indicator_key unique(instrument_id,observation_id,interval_code,indicator_code,calculation_version));
    create table market_scores(id bigint generated always as identity primary key,instrument_id uuid,score_date date,momentum_score numeric,
      trend_score numeric,volatility_score numeric,volume_score numeric,overall_score numeric,confidence_score numeric,methodology_version text,
      technical_calculation_version text,score_status text,score_details jsonb,calculated_at timestamptz,
      constraint market_scores_instrument_date_methodology_key unique(instrument_id,score_date,methodology_version));
    insert into instruments values('${inst}',true,'TEST','ASX','equity','AUD');
    insert into data_providers values('${provider}','yahoo',true);`);
  await pg.exec(sourceSql);
  const originalHelpers=await readFile('supabase/migrations/20260821064000_implement_technical_indicators_v1.sql','utf8');
  await pg.exec(originalHelpers.slice(0,originalHelpers.indexOf('create or replace function technical_engine.refresh_v1')));
  await pg.exec(await readFile('supabase/migrations/20261115235320_add_asx_technical_calculation_v1.sql','utf8'));
  const definition=async()=>(await query("select pg_get_functiondef('technical_engine.asx_source_snapshot_v1(uuid,timestamptz)'::regprocedure) value"))[0].value;
  const properties=async()=>(await query("select md5(replace(prosrc,chr(13),'')) body_hash,provolatile,prosecdef,proconfig from pg_proc where oid='technical_engine.asx_source_snapshot_v1(uuid,timestamptz)'::regprocedure"))[0];
  const originalDefinition=await definition(),originalProperties=await properties();eq(originalProperties.body_hash,'9797cdf23cd74b2b5d7f58c6f958b1ec');
  await seed();const original=await blocked();eq(original.reason,'UNCONFIRMED_DATE_COVERAGE');
  scenarios++;console.log('PASS original source reproduces late-session false block');
  const evidence=()=>query(`select (select md5(jsonb_agg(to_jsonb(a) order by id)::text) from sync_runs a) audits,
    (select md5(jsonb_agg(to_jsonb(o) order by id)::text) from market_observations o) observations`);
  const beforeEvidence=await evidence();
  await pg.exec(repairSql);
  eq(await evidence(),beforeEvidence);const repairedProperties=await properties();
  eq(repairedProperties.body_hash,'1ec5492fa95af89fa7e85fc1a3312b00');
  eq({...repairedProperties,body_hash:null},{...originalProperties,body_hash:null});
  for(const [role,allowed] of [['anon',false],['authenticated',false],['service_role',true]])
    eq((await query("select has_function_privilege($1,'technical_engine.asx_source_snapshot_v1(uuid,timestamptz)','EXECUTE') allowed",[role]))[0].allowed,allowed);
  scenarios++;console.log('PASS exact migration precondition, stable invoker/config and ACLs; evidence unchanged');
  const repairedDefinition=await definition();await assert.rejects(pg.exec(repairSql),/definition drift/);assertions++;
  eq(await definition(),repairedDefinition);eq(await evidence(),beforeEvidence);
  scenarios++;console.log('PASS already changed source cannot be overwritten by migration replay');
  for(const legacy of [false,true])await scenario((legacy?'legacy':'v1')+' full anchor with clean late overlap becomes ready',async()=>{
    const s=await ready();eq(s.audit_ids,[anchor,prior,latest]);eq(s.terminal_audit_id,latest);
    eq(s.observations.length,anchorDates.length+1);eq(s.observations.at(-1).observed_at.slice(0,10),'2026-11-17');
    eq(s.observations.at(-1).raw_payload._backfill.retrieved_at,'2026-11-18T00:07:00.000Z');
  },{legacy});
  await scenario('unchanged old chain remains ready before new session is available',async()=>{const s=await ready();eq(s.audit_ids,[anchor,prior]);eq(s.observations.length,anchorDates.length);},{withNew:false});
  await scenario('old accepted date disappearing remains blocked',async()=>{
    await pg.exec("delete from market_observations where observed_at='2026-10-01T00:00Z'");await blocked();
  });
  await scenario('new row without its new provenance audit is blocked',async()=>{await pg.query('delete from sync_runs where id=$1',[latest]);await blocked();});
  await scenario('new date outside owning audit accepted dates is blocked',async()=>{
    await patch(latest,m=>m.accepted_provider_dates=m.accepted_provider_dates.filter(d=>d!=='2026-11-17'));await blocked();
  });
  await scenario('fabricated new row attributing itself to old audit is blocked',async()=>{
    await pg.exec(`update market_observations set raw_payload=jsonb_set(raw_payload,'{_backfill,retrieved_at}','"2026-11-18T00:04:00.000Z"') where observed_at='2026-11-17T00:00Z'`);await blocked();
  });
  for(const id of [anchor,prior,latest])for(const kind of ['duplicate','malformed','future','count'])await scenario('invalid accepted '+kind+' for audit '+id.slice(-3),async()=>{
    await patch(id,m=>{
      if(kind==='duplicate')m.accepted_provider_dates.push(m.accepted_provider_dates[0]);
      if(kind==='malformed')m.accepted_provider_dates.push({date:'2026-10-01'});
      if(kind==='future')m.accepted_provider_dates.push('2026-11-19');
      if(kind==='count'){m.valid_rows++;m.fetch_attempts.at(-1).valid_rows++;}
    });
    if(kind==='count')await pg.query('update sync_runs set received_count=received_count+1 where id=$1',[id]);
    await blocked();
  });
  await scenario('invalid calendar date in accepted list is blocked',async()=>{await patch(prior,m=>m.accepted_provider_dates.push('2026-02-30'));await blocked();});
  await scenario('non-array accepted list is blocked',async()=>{await patch(latest,m=>m.accepted_provider_dates={});await blocked();});
  await scenario('cumulative dates before overlap window are legitimate evidence',async()=>{
    const s=await ready();eq(s.audits[1].metadata.accepted_provider_dates.length,anchorDates.length);
  });
  await scenario('late anchor-range date requires and accepts newer valid v1 provenance',async()=>{
    const s=await ready();eq(s.observations.some(o=>o.observed_at.slice(0,10)==='2026-10-20'),true);
    eq(s.observations.find(o=>o.observed_at.slice(0,10)==='2026-10-20').raw_payload._backfill.retrieved_at,'2026-11-18T00:07:00.000Z');
  },{lateAnchor:true});
  await scenario('legacy anchor counts remain conservative when a new date appears inside its range',async()=>{await blocked();},{legacy:true,lateAnchor:true});
  await scenario('late anchor-range row cannot claim old audit provenance',async()=>{
    await pg.exec(`update market_observations set raw_payload=jsonb_set(raw_payload,'{_backfill}',raw_payload->'_backfill'||
      '{"requested_start_date":"2025-11-16","requested_end_date":"2026-11-16","retrieved_at":"2026-11-18T00:01:00.000Z"}'::jsonb)
      where observed_at='2026-10-20T00:00Z'`);await blocked();
  },{lateAnchor:true});
  await scenario('duplicate observed date still blocks independently of accepted counts',async()=>{
    await pg.exec('insert into market_observations select 9999,instrument_id,provider_id,interval_code,observed_at,open,high,low,close,adjusted_close,volume,currency_code,loaded_at,raw_payload from market_observations limit 1');await blocked();
  });
  await scenario('genuine repaired chain flows through actual calculation, persistence and source match',async()=>{
    const s=await ready();const r=(await query('select technical_engine.refresh_asx_v1($1::uuid) result',[inst]))[0].result;
    eq(r.instruments_processed,1);eq(r.blocked_instruments,0);eq(r.indicator_rows_upserted,16);eq(r.score_rows_upserted,1);
    const score=(await query('select * from market_scores'))[0];eq(score.score_date.toISOString().slice(0,10),'2026-11-17');
    eq(score.score_details.source_hash,s.source_hash);eq(score.methodology_version,'technical-score-asx-v1');
    eq((await query('select technical_engine.asx_score_source_matches_v1($1::bigint) matches',[score.id]))[0].matches,true);
    const saved=(await query('select * from technical_engine.asx_input_snapshots'))[0];eq(saved.snapshot.audit_ids,[anchor,prior,latest]);
    eq(saved.snapshot.observations.at(-1).observed_at.slice(0,10),'2026-11-17');
    const reproduced=(await query("select technical_engine.asx_calculate_v1(snapshot)->'score'->>'overall_score' value from technical_engine.asx_input_snapshots"))[0].value;
    eq(Number(reproduced),Number(score.overall_score));
    await pg.exec("delete from market_observations where observed_at='2026-10-01T00:00Z'");
    eq((await query('select technical_engine.asx_score_source_matches_v1($1::bigint) matches',[score.id]))[0].matches,false);
  });
  await scenario('guarded rollback restores original validator and blocker without deleting evidence or Technical snapshots; repair can reapply',async()=>{
    await ready();await query('select technical_engine.refresh_asx_v1($1::uuid)',[inst]);
    const data=()=>query(`select (select md5(jsonb_agg(to_jsonb(s) order by id)::text) from technical_engine.asx_input_snapshots s) snapshots,
      (select md5(jsonb_agg(to_jsonb(i) order by id)::text) from technical_indicators i) indicators,
      (select md5(jsonb_agg(to_jsonb(m) order by id)::text) from market_scores m) scores`);
    const before=await evidence(),technical=await data();
    await pg.exec(rollbackSql);
    eq((await definition()).replaceAll('\r\n','\n'),originalDefinition.replaceAll('\r\n','\n'));
    eq(await properties(),originalProperties);eq((await blocked()).reason,'UNCONFIRMED_DATE_COVERAGE');
    eq(await evidence(),before);eq(await data(),technical);
    for(const [role,allowed] of [['anon',false],['authenticated',false],['service_role',true]])
      eq((await query("select has_function_privilege($1,'technical_engine.asx_source_snapshot_v1(uuid,timestamptz)','EXECUTE') allowed",[role]))[0].allowed,allowed);
    const blockedRefresh=(await query('select technical_engine.refresh_asx_v1($1::uuid) result',[inst]))[0].result;
    eq(blockedRefresh.blocked_instruments,1);eq(blockedRefresh.score_rows_upserted,0);eq(await data(),technical);
    const old=await definition();await assert.rejects(pg.exec(rollbackSql),/rollback drift/);assertions++;eq(await definition(),old);
    await pg.exec(repairSql);eq((await properties()).body_hash,repairedProperties.body_hash);await ready();
    eq(await evidence(),before);eq(await data(),technical);
    eq((await query('select technical_engine.asx_score_source_matches_v1(id) matches from market_scores'))[0].matches,true);
  });
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual original/new source and Technical refresh.`);
  for(const path of [sourcePath,repairPath,rollbackPath])console.log(createHash('sha256').update(await readFile(path)).digest('hex')+' '+path);
}finally{await pg.close();}
