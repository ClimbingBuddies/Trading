// Actual aggregate diagnostic against synthetic in-memory PostgreSQL only.
// Clock substitution is fixture-only; production query has no caller cutoff.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const sql=await readFile('scripts/asx-admission-review.sql','utf8');
const atCutoff=sql.replaceAll('statement_timestamp()','$1::timestamptz');
const cutoff='2026-11-10T00:00:00Z'; // Sydney Nov10; New York Nov9.
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let scenarios=0,assertions=0;
const eq=(a,b)=>{assert.deepEqual(a,b);assertions++;};
const query=async(text,params=[])=>(await db.query(text,params)).rows;
const row=async()=>(await query(atCutoff,[cutoff]))[0];
async function check(name,change,verify){
  await db.exec('begin');
  try{await change();await db.exec('set transaction read only');await verify(await row());scenarios++;console.log('PASS '+name);}
  catch(error){throw new Error(`FAIL ${name}: ${String(error.message).slice(0,1200)}`);}
  finally{await db.exec('rollback');}
}
const tech=expected=>r=>eq(r.technical_states,{[expected]:1});
const ai=expected=>r=>eq(r.ai_states,{[expected]:1});
try{
  await db.exec(`create schema technical_engine;create schema private;create schema market_convergence;
    create table instruments(id uuid primary key,is_active boolean,exchange_code text,asset_type text,currency_code text,symbol text,owner_id uuid);
    create table market_scores(id bigint primary key,instrument_id uuid,score_date date,overall_score numeric,confidence_score numeric,
      score_status text,technical_calculation_version text,methodology_version text,calculated_at timestamptz);
    create table gpt_market_runs(run_id uuid primary key,status text,completed_at timestamptz);
    create table gpt_market_assessments(assessment_id uuid primary key,instrument_id uuid,assessment_date date,score numeric,confidence numeric,
      rating text,technical_engine_input_used boolean,run_id uuid,methodology_version text,created_at timestamptz);
    create table fixture_source(score_id bigint,matched boolean,fail_if_called boolean default false);
    create function technical_engine.asx_score_source_matches_v1(p_score_id bigint) returns boolean language plpgsql stable as $$
      declare r record;begin select * into r from public.fixture_source where score_id=p_score_id;
      if r.fail_if_called then raise exception 'source matcher must not inspect ineligible score';end if;return r.matched;end$$;
    create function market_convergence.run_v1() returns void language plpgsql as $$begin raise exception 'diagnostic invoked convergence';end$$;
    create function technical_engine.refresh_asx_v1() returns void language plpgsql as $$begin raise exception 'diagnostic invoked refresh';end$$;
    create table private.shared_market_calendars(exchange_code text,time_zone text,coverage_start timestamptz,coverage_end timestamptz,verified_at timestamptz,valid_until timestamptz);
    create table private.shared_market_input_config(instrument_id uuid,exchange_code text,verified_at timestamptz);
    create table private.shared_decision_config(instrument_id uuid primary key,enabled boolean);
    insert into instruments values('${id(1)}',true,'ASX','equity','AUD','PRIVATE_SYMBOL','${id(99)}'),
      ('${id(2)}',false,'ASX','equity','AUD','PRIVATE_INACTIVE','${id(99)}'),
      ('${id(3)}',true,'NYSE','equity','USD','PRIVATE_OTHER','${id(99)}');
    insert into market_scores values(1,'${id(1)}','2026-11-10',75,90,'partial','technical-engine-asx-v1','technical-score-asx-v1','2026-11-09T23:00Z');
    insert into fixture_source values(1,true,false);
    insert into gpt_market_runs values('${id(10)}','succeeded','2026-11-09T23:30Z');
    insert into gpt_market_assessments values('${id(20)}','${id(1)}','2026-11-09',70,80,'Buy',false,'${id(10)}','independent-market-ai-v1','2026-11-09T23:00Z');`);
  await check('baseline separates Sydney Technical and New York AI screens with only aggregate output',async()=>{},r=>{
    eq(Number(r.active_asx),1);eq(r.technical_states,{SOURCE_MATCHED_AGE_SCREEN:1});eq(r.ai_states,{TERMINAL_AGE_SCREEN:1});
    eq(new Date(r.sydney_date).toISOString().slice(0,10),'2026-11-10');eq(new Date(r.ai_logical_date).toISOString().slice(0,10),'2026-11-09');
    eq(Object.keys(r).sort(),['cutoff_at','sydney_date','ai_logical_date','active_asx','technical_states','ai_states','convergence_contract',
      'recommendation_boundary','asx_calendar_revisions','currently_valid_asx_calendar_revisions','active_asx_with_input_config',
      'active_asx_with_enabled_publication_config','active_aud_etf_or_index_inventory','measurement_limit'].sort());
    eq(/PRIVATE_|00000000|owner_id|instrument_id/.test(JSON.stringify(r)),false);
    assert.match(r.measurement_limit,/do not certify/);assertions++;
  });
  for(const [change,expected] of [
    ['delete from market_scores','MISSING'],
    ["update market_scores set methodology_version='technical-score-v1'",'MISSING'],
    ["update market_scores set technical_calculation_version='technical-engine-v1'",'VERSION_MISMATCH'],
    ['update market_scores set technical_calculation_version=null','VERSION_MISMATCH'],
    ['update market_scores set overall_score=null','INVALID'],['update market_scores set overall_score=101','INVALID'],
    ['update market_scores set confidence_score=-1','INVALID'],['update market_scores set score_date=null','INVALID'],
    ["update market_scores set score_status='insufficient_input'",'INVALID'],
    ["update market_scores set score_date='2026-11-11'",'FUTURE_DATE'],
    ["update market_scores set score_date='2026-11-05'",'STALE_AGE_SCREEN'],
    ["update market_scores set score_date='2026-11-06'",'SOURCE_MATCHED_AGE_SCREEN'],
    ["update market_scores set calculated_at='2026-11-10T00:00:00Z'",'SOURCE_MATCHED_AGE_SCREEN'],
    ["update market_scores set calculated_at='2026-11-10T00:00:00.000001Z'",'MISSING'],
    ['update market_scores set calculated_at=null','MISSING'],
    ['update fixture_source set matched=false','SOURCE_CHANGED_OR_BLOCKED'],
    ['update fixture_source set matched=null','SOURCE_CHANGED_OR_BLOCKED']
  ]) await check('Technical classification: '+change,()=>db.exec(change),tech(expected));
  for(const [change,expected] of [
    ['delete from gpt_market_assessments','MISSING'],
    ["update gpt_market_assessments set methodology_version='independent-market-ai-v2'",'MISSING'],
    ['update gpt_market_assessments set technical_engine_input_used=true','INVALID_OR_NOT_INDEPENDENT'],
    ['update gpt_market_assessments set technical_engine_input_used=null','INVALID_OR_NOT_INDEPENDENT'],
    ['update gpt_market_assessments set score=null','INVALID_OR_NOT_INDEPENDENT'],
    ['update gpt_market_assessments set confidence=101','INVALID_OR_NOT_INDEPENDENT'],
    ["update gpt_market_assessments set rating='unknown'",'INVALID_OR_NOT_INDEPENDENT'],
    ['update gpt_market_assessments set assessment_date=null','INVALID_OR_NOT_INDEPENDENT'],
    ["update gpt_market_runs set status='running'",'RUN_NOT_TERMINAL_AT_CUTOFF'],
    ['delete from gpt_market_runs','RUN_NOT_TERMINAL_AT_CUTOFF'],
    ['update gpt_market_runs set completed_at=null','RUN_NOT_TERMINAL_AT_CUTOFF'],
    ["update gpt_market_runs set completed_at='2026-11-10T00:00:00.000001Z'",'RUN_NOT_TERMINAL_AT_CUTOFF'],
    ["update gpt_market_runs set status='partial',completed_at='2026-11-10T00:00:00Z'",'TERMINAL_AGE_SCREEN'],
    ["update gpt_market_assessments set assessment_date='2026-11-10'",'FUTURE_DATE'],
    ["update gpt_market_assessments set assessment_date='2026-11-04'",'STALE_AGE_SCREEN'],
    ["update gpt_market_assessments set assessment_date='2026-11-05'",'TERMINAL_AGE_SCREEN'],
    ["update gpt_market_assessments set created_at='2026-11-10T00:00:00.000001Z'",'MISSING'],
    ['update gpt_market_assessments set created_at=null','MISSING']
  ]) await check('AI classification: '+change,()=>db.exec(change),ai(expected));
  await check('latest named Technical score never falls back around invalid data or source mismatch',async()=>{
    await db.exec(`insert into market_scores select 2,instrument_id,score_date,overall_score,confidence_score,'insufficient_input',technical_calculation_version,methodology_version,calculated_at from market_scores;
      insert into fixture_source values(2,false,true)`);
  },tech('INVALID'));
  await check('Technical ordering prioritizes date then calculation then ID and does not use older matching source',async()=>{
    await db.exec(`insert into market_scores values(99,'${id(1)}','2026-11-09',90,90,'complete','technical-engine-asx-v1','technical-score-asx-v1','2026-11-09T23:59Z');
      insert into market_scores select 2,instrument_id,score_date,overall_score,confidence_score,score_status,technical_calculation_version,methodology_version,'2026-11-09T23:01Z' from market_scores where id=1;
      insert into market_scores select 3,instrument_id,score_date,overall_score,confidence_score,score_status,technical_calculation_version,methodology_version,calculated_at from market_scores where id=2;
      insert into fixture_source values(99,true,false),(2,true,false),(3,false,false)`);
  },tech('SOURCE_CHANGED_OR_BLOCKED'));
  await check('latest independent AI row never falls back around an unfinished run',async()=>{
    await db.exec(`insert into gpt_market_runs values('${id(11)}','running',null);
      insert into gpt_market_assessments select '${id(21)}',instrument_id,assessment_date,score,confidence,rating,false,'${id(11)}',methodology_version,created_at from gpt_market_assessments`);
  },ai('RUN_NOT_TERMINAL_AT_CUTOFF'));
  await check('calendar/config inventory uses documented cutoffs but cannot certify readiness',async()=>{
    await db.exec(`insert into private.shared_market_calendars values
      ('ASX','Australia/Sydney','2026-11-10Z','2026-11-11Z','2026-11-10Z','2026-11-11Z'),
      ('ASX','Australia/Sydney','2026-11-01Z','2026-11-10Z','2026-11-01Z','2026-11-11Z'),
      ('ASX','Australia/Sydney','2026-11-01Z','2026-11-11Z','2026-11-01Z','2026-11-10Z'),
      ('ASX','Australia/Sydney','2026-11-01Z','2026-11-11Z','2026-11-10T00:00:01Z','2026-11-11Z'),
      ('ASX','UTC','2026-11-01Z','2026-11-11Z','2026-11-01Z','2026-11-11Z'),
      ('NYSE','America/New_York','2026-11-01Z','2026-11-11Z','2026-11-01Z','2026-11-11Z');
      insert into private.shared_market_input_config values('${id(1)}','ASX','2026-11-10Z'),('${id(1)}','ASX','2026-11-01Z'),
      ('${id(2)}','ASX','2026-11-01Z'),('${id(3)}','NYSE','2026-11-01Z');
      insert into private.shared_decision_config values('${id(1)}',true),('${id(2)}',true),('${id(3)}',true);`);
  },r=>{eq(Number(r.asx_calendar_revisions),5);eq(Number(r.currently_valid_asx_calendar_revisions),1);
    eq(Number(r.active_asx_with_input_config),1);eq(Number(r.active_asx_with_enabled_publication_config),1);});
  await check('future input configuration and disabled publication are excluded',async()=>{
    await db.exec(`insert into private.shared_market_input_config values('${id(1)}','ASX','2026-11-10T00:00:00.000001Z');
      insert into private.shared_decision_config values('${id(1)}',false)`);
  },r=>{eq(Number(r.active_asx_with_input_config),0);eq(Number(r.active_asx_with_enabled_publication_config),0);});
  await check('AUD ETF/index count remains inventory distinct from scoring and publication',async()=>{
    await db.exec(`insert into instruments values('${id(4)}',true,'ASX','etf',' AUD ','SECRET',null),
      ('${id(5)}',true,'ASX','index','AUD','SECRET',null),('${id(6)}',true,'ASX','etf','USD','SECRET',null),
      ('${id(7)}',false,'ASX','index','AUD','SECRET',null)`);
  },r=>{eq(Number(r.active_asx),4);eq(Number(r.active_aud_etf_or_index_inventory),2);eq(r.technical_states,{MISSING:3,SOURCE_MATCHED_AGE_SCREEN:1});});
  await check('inactive, unknown activity and other venues do not enter ASX aggregates',async()=>{
    await db.exec('update instruments set is_active=null where id=\''+id(1)+'\'');
  },r=>{eq(Number(r.active_asx),0);eq(r.technical_states,{});eq(r.ai_states,{});});
  await check('empty inventory remains a single safe aggregate report',()=>db.exec('truncate instruments,market_scores,gpt_market_assessments,gpt_market_runs,fixture_source'),r=>{
    eq(Number(r.active_asx),0);eq(r.technical_states,{});eq(r.ai_states,{});eq(Number(r.active_asx_with_input_config),0);eq(Number(r.active_aud_etf_or_index_inventory),0);
  });
  await db.exec('begin read only');
  try{eq((await query(sql)).length,1);}finally{await db.exec('rollback');}
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual read-only admission SQL, synthetic source matcher and fixed fixture clock.`);
  console.log('SQL SHA256 '+createHash('sha256').update(sql).digest('hex'));
}finally{await db.close();}
