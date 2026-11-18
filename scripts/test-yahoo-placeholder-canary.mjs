// Synthetic PostgreSQL execution of the exact manual canary SQL. No hosted calls.
// The original enqueue implementation is installed with its real definition hash.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite();
const path='scripts/recover-yahoo-placeholder-canary.sql',sql=await readFile(path,'utf8');
const baseline=(await readFile('scripts/history-queue-baseline.sql','utf8')).replaceAll('\r\n','\n');
const instrument='00000000-0000-4000-8000-000000000010',audit='00000000-0000-4000-8000-000000000020';
const key='normalizer-v2-canary-20261118',oldJob='00000000-0000-4000-8000-000000000001';
let scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(text,params=[])=>(await pg.query(text,params)).rows;
const jobs=()=>query('select * from market_history_jobs order by id');
const audits=()=>query('select * from sync_runs order by id');
async function reset(){
  await pg.exec(baseline);
  await pg.query("select set_config('trading.recovery_instrument',$1,false),set_config('trading.recovery_symbol','TEST',false),set_config('trading.recovery_audit',$2,false)",[instrument,audit]);
  await pg.exec(`truncate instruments,market_history_jobs,sync_runs;
    insert into instruments values('${instrument}','TEST','ASX','AUD',true);
    insert into market_history_jobs(id,instrument_id,job_type,source_scope,source_key,symbol,years,status,attempts,created_at,metadata)
      values('${oldJob}','${instrument}','daily_incremental','active_universe','old-daily','TEST',1,'succeeded',1,'2026-11-17T14:15:00Z','{"unchanged":true}');
    insert into sync_runs values('${audit}','2026-11-17T15:00:00Z','succeeded',
      '{"instrument_id":"${instrument}","function":"asx-yahoo-market-history","rejected_bars":[{"date":"2026-11-17"}]}');`);
}
async function execute(){
  try{return await pg.exec(sql);}catch(error){await pg.exec('rollback');throw error;}
}
async function blocked(pattern){
  const before=await jobs(),beforeAudits=await audits();
  await assert.rejects(execute(),pattern);assertions++;
  eq(await jobs(),before,'guard rejection must not modify queue');eq(await audits(),beforeAudits,'audit is read-only');
}
async function scenario(name,fn){
  await reset();try{await fn();scenarios++;console.log('PASS '+name);}
  catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,1600));}
}
try{
  await pg.exec(`create schema market_history;
    create table instruments(id uuid primary key,symbol text,exchange_code text,currency_code text,is_active boolean);
    create table market_history_jobs(id uuid primary key default gen_random_uuid(),instrument_id uuid,job_type text,
      source_scope text,source_key text,symbol text,years integer,status text,attempts integer default 0,max_attempts integer default 3,
      next_attempt_at timestamptz default clock_timestamp(),created_at timestamptz default clock_timestamp(),
      updated_at timestamptz default clock_timestamp(),started_at timestamptz,finished_at timestamptz,metadata jsonb default '{}');
    create table sync_runs(id uuid primary key,started_at timestamptz,status text,metadata jsonb);`);
  await reset();
  eq((await query("select md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure)) hash"))[0].hash,
    '519b5c19fd5bbd92a838b7ef4cc99541','no fixture rebinding of production enqueue fingerprint');
  await scenario('one bounded pending daily job; previous queue and audit unchanged',async()=>{
    const before=await jobs(),beforeAudits=await audits();const results=await execute();
    const receipt=results.flatMap(r=>r.rows??[]);eq(receipt.length,1);
    const after=await jobs();eq(after.length,2);eq(after.find(r=>r.id===oldJob),before[0]);eq(await audits(),beforeAudits);
    const job=after.find(r=>r.id!==oldJob);eq(receipt[0].id,job.id);eq(receipt[0].status,'pending');
    eq([job.instrument_id,job.symbol,job.job_type,job.source_scope,job.source_key,job.years,job.status,job.attempts],
      [instrument,'TEST','daily_incremental','manual',key,1,'pending',0]);
    eq(job.metadata,{reason:'reviewed_normalizer_v2_quarantine_recovery',expected_normalization_version:2});
    eq(job.started_at,null);eq(job.finished_at,null);
  });
  for(const status of ['pending','running','succeeded','failed','mapping_required','validation_failed']){
    await scenario('idempotent '+status+' receipt never resets or creates work',async()=>{
      await execute();await pg.query(`update market_history_jobs set status=$1,attempts=3,next_attempt_at='2099-01-01',
        finished_at='2026-11-18T01:00:00Z',metadata=metadata||'{"terminal_receipt":true}'::jsonb where source_key=$2`,[status,key]);
      const before=await jobs();const results=await execute();eq(await jobs(),before);
      const receipt=results.flatMap(r=>r.rows??[]);eq(receipt.length,1);eq(receipt[0].status,status);
      eq(receipt[0].id,before.find(r=>r.source_key===key).id);
    });
  }
  for(const status of ['pending','running'])await scenario('existing '+status+' work blocks canary',async()=>{
    await pg.query('update market_history_jobs set status=$1 where id=$2',[status,oldJob]);await blocked(/already has active work/);
  });
  for(const status of ['mapping_required','validation_failed','failed'])await scenario('latest '+status+' hold blocks canary',async()=>{
    await pg.query('update market_history_jobs set status=$1 where id=$2',[status,oldJob]);await blocked(/latest canary job/);
  });
  await scenario('missing latest job blocks canary',async()=>{await pg.exec('truncate market_history_jobs');await blocked(/latest canary job/);});
  for(const [field,value] of [['symbol','OTHER'],['exchange_code','NYSE'],['currency_code','USD'],['is_active',false]]){
    await scenario('changed identity '+field+' blocks canary',async()=>{
      await pg.query(`update instruments set ${field}=$1 where id=$2`,[value,instrument]);await blocked(/identity changed/);
    });
  }
  await scenario('missing identity blocks canary',async()=>{await pg.exec('truncate instruments');await blocked(/identity changed/);});
  await scenario('newer matching audit blocks stale recovery evidence',async()=>{
    await pg.query(`insert into sync_runs select gen_random_uuid(),started_at+interval '1 minute',status,metadata from sync_runs`);
    await blocked(/audit changed/);
  });
  await scenario('missing audit blocks stale recovery evidence',async()=>{await pg.exec('truncate sync_runs');await blocked(/audit changed/);});
  await scenario('unrelated newer audit does not block exact canary evidence',async()=>{
    await pg.exec(`insert into sync_runs values(gen_random_uuid(),'2099-01-01','failed','{"function":"unrelated"}')`);
    const before=await audits();await execute();eq((await jobs()).length,2);eq(await audits(),before);
  });
  await scenario('enqueue definition drift blocks before any insert',async()=>{
    await pg.exec(`alter function market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb) set search_path to public`);
    await blocked(/enqueue function changed/);
  });
  for(const setting of ['trading.recovery_instrument','trading.recovery_audit'])await scenario('invalid '+setting+' fails closed',async()=>{
    await pg.query('select set_config($1,$2,false)',[setting,'invalid-uuid']);await blocked(/invalid input syntax for type uuid/);
  });
  await scenario('empty recovery symbol fails closed',async()=>{
    await pg.query("select set_config('trading.recovery_symbol','',false)");await blocked(/identity changed/);
  });
  eq(/begin isolation level serializable/i.test(sql),true);
  eq(sql.indexOf('pg_advisory_xact_lock')<sql.indexOf('market_history.enqueue_job(\'daily_incremental\''),true);
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions. Single-backend PGlite; native concurrency unverified.`);
  console.log(createHash('sha256').update(sql).digest('hex')+' '+path);
}finally{await pg.close();}
