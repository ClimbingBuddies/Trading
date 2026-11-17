// Actual queue functions in isolated PostgreSQL. No network or hosted access.
// pg_cron is a table/function mock. Cron command digests are rebound ONLY in
// memory to synthetic commands; actual baseline/function digests must match.
// Each guard is independently fault-injected. Release file stays untouched.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const source=await readFile('supabase/migrations/20261117021821_align_daily_history_with_controller.sql','utf8');
const baseline=(await readFile('scripts/history-queue-baseline.sql','utf8')).replaceAll('\r\n','\n');
const rollbackSource=await readFile('scripts/rollback-controller-history-queue.sql','utf8');
let release=source,scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const query=async(text,params=[])=>(await db.query(text,params)).rows;
const queue=()=>query('select * from market_history_jobs order by id');
const cron=()=>query('select * from cron.job order by jobid');
const enqueue=async(asx)=>(await query(asx?'select market_history.enqueue_asx_daily_jobs_v1() n':'select market_history.enqueue_daily_jobs() n'))[0].n;
const claim=()=>query('select * from public.claim_market_history_job()');
const definition=async(signature)=>(await query('select pg_get_functiondef($1::regprocedure) sql',[signature]))[0].sql;
const cronFixture=[
  [1,'market-history-daily-close-enqueue','30 22 * * *','select market_history.enqueue_daily_jobs()',true],
  [2,'market-history-maintenance-worker-every-2-minutes','*/2 * * * *','select fixture_worker_dispatch_unchanged()',true],
  [3,'trading-technical-engine-daily-0715-awst','15 23 * * *',"select technical_engine.run_v1('scheduled', null)",true],
  [4,'trading-technical-engine-retry-0745-awst','45 23 * * *','select technical_engine.retry_latest_failed_v1()',true],
  [5,'market-quotes-four-hour','0 3,7,11,15,19,23 * * *','select fixture_quote_dispatch_unchanged()',true],
  [6,'unrelated-disabled-job','* * * * *','select fixture_unrelated_unchanged()',false]
];
async function resetBaseline(){
  await db.exec(baseline);
  await db.exec(`revoke all on all functions in schema market_history from public,anon,authenticated;
    revoke all on function public.claim_market_history_job() from public,anon,authenticated;
    grant execute on all functions in schema market_history to service_role;
    grant execute on function public.claim_market_history_job() to service_role;
    truncate cron.job,cron.fixture_changes,market_history_jobs`);
  for(const r of cronFixture)await db.query('insert into cron.job values($1,$2,$3,$4,$5)',r);
}
async function addJob(n,instrument=1,patch={}){
  const values={id:uid(1000+n),instrument_id:instrument===null?null:uid(instrument),job_type:'daily_incremental',source_scope:'active_universe',source_key:'fixture:'+n,
    symbol:'FIXTURE',years:1,status:'pending',attempts:0,max_attempts:3,next_attempt_at:'2000-01-01T00:00:00Z',created_at:'2001-01-01T00:00:00Z',
    updated_at:'2001-01-01T00:00:00Z',started_at:null,finished_at:null,metadata:{fixture:true},...patch};
  const columns=Object.keys(values);
  await db.query(`insert into market_history_jobs(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,
    Object.values(values).map(v=>v&&typeof v==='object'?JSON.stringify(v):v));
  return values.id;
}
async function scenario(name,fn){
  await db.exec('begin');
  try{await fn();scenarios++;console.log('PASS '+name);}
  catch(error){throw new Error(`FAIL ${name}: ${String(error.message).slice(0,1200)}`);}
  finally{await db.exec('rollback');}
}
const focus=()=>db.exec(`update instruments set is_active=(id='${uid(1)}');truncate watchlist_items,opportunity_theme_external_instruments,market_history_jobs`);
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema market_history;create schema cron;grant usage on schema market_history to service_role;
    create table instruments(id uuid primary key,symbol text,exchange_code text,is_active boolean);
    create table watchlist_items(instrument_id uuid);
    create table opportunity_theme_external_instruments(symbol text,exchange_code text,is_active boolean);
    create table shared_decision_calls(id uuid primary key,instrument_id uuid);
    create table shared_decision_outcomes(call_id uuid,kind text);
    create table market_history_jobs(id uuid primary key default gen_random_uuid(),instrument_id uuid,job_type text,
      source_scope text,source_key text,symbol text,years integer,status text,attempts integer default 0,max_attempts integer default 3,
      next_attempt_at timestamptz default clock_timestamp(),created_at timestamptz default clock_timestamp(),
      updated_at timestamptz default clock_timestamp(),started_at timestamptz,finished_at timestamptz,metadata jsonb default '{}');
    create table cron.job(jobid bigint primary key,jobname text,schedule text,command text,active boolean);
    create table cron.fixture_changes(kind text,jobid bigint);
    create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$declare n bigint;begin
      select coalesce(max(jobid),0)+1 into n from cron.job;
      insert into cron.job values(n,$1,$2,$3,true);insert into cron.fixture_changes values('schedule',n);return n;end$$;
    create function cron.alter_job(job_id bigint,schedule text default null) returns void language plpgsql as $$begin
      update cron.job set schedule=coalesce($2,cron.job.schedule) where jobid=$1;
      insert into cron.fixture_changes values('alter',job_id);end$$;
    create function cron.unschedule(job_name text) returns boolean language plpgsql as $$begin
      delete from cron.job where jobname=$1;return found;end$$;
    insert into instruments values('${uid(1)}','ACTIVE_ASX','ASX',true),('${uid(2)}','ACTIVE_WATCH','NYSE',true),
      ('${uid(3)}','INACTIVE_WATCH_ASX','ASX',false),('${uid(4)}','OPP_UNKNOWN','NYSE',false),
      ('${uid(5)}','OPP_ASX','ASX',false),('${uid(6)}','EXCLUDED','ASX',false),
      ('${uid(7)}','NULL_VENUE',null,true),('${uid(8)}','ACTIVE_PLAIN','NYSE',true),
      ('${uid(9)}','OPEN_ONLY_INACTIVE','NYSE',false),('${uid(10)}','INACTIVE_WATCH','NYSE',false),('${uid(11)}','OVERLAP_ASX','ASX',true);
    insert into watchlist_items values('${uid(2)}'),('${uid(2)}'),('${uid(3)}'),('${uid(10)}'),('${uid(11)}');
    insert into opportunity_theme_external_instruments values(' opp_unknown ','UNKNOWN',true),('opp_asx','asx',true),
      ('ACTIVE_PLAIN','NYSE',true),('OVERLAP_ASX','ASX',true),('EXCLUDED','ASX',false),('EXCLUDED','NYSE',true);
    insert into shared_decision_calls values('${uid(201)}','${uid(1)}'),('${uid(209)}','${uid(9)}');`);
  await resetBaseline();
  for(const [signature,expected] of [
    ['market_history.enqueue_daily_jobs()','c81a6dc84d0d495fcf5a6d69fe3af28d'],
    ['public.claim_market_history_job()','da04210e797ca4b5b6668834def76ca6'],
    ['market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)','519b5c19fd5bbd92a838b7ef4cc99541']]){
    const digest=(await query('select md5(pg_get_functiondef($1::regprocedure)) digest',[signature]))[0].digest;
    eq(digest,expected,'fixture baseline definition must match captured live fingerprint');
    console.log('Baseline definition MD5 '+JSON.stringify({signature,digest,recorded:expected,matchesRecorded:digest===expected}));
    assert.ok(release.includes(expected));release=release.replace(expected,digest);
  }
  for(const [n,expected] of [[0,'f7ad107b9531adcb7ba73ac980b9c5c3'],[1,'f48a6318be6459d80a38778cbb08a341'],
    [2,'024c715837343b5eb4865e09f35e467c'],[3,'fb4e24c84122966864083ec9dc49be2c']]){
    assert.ok(release.includes(expected));release=release.replace(expected,createHash('md5').update(cronFixture[n][3]).digest('hex'));
  }
  const baselineCount=await enqueue(false);
  const baselineUniverse=(await queue()).map(r=>r.instrument_id).sort();eq(baselineCount,9);
  eq(baselineUniverse,[1,2,3,4,5,7,8,10,11].map(uid).sort());
  for(const [name,change] of [
    ['enqueue function drift',async()=>db.exec((await definition('market_history.enqueue_daily_jobs()')).replace('declare','declare\n -- fixture drift\n'))],
    ['claim function drift',async()=>db.exec((await definition('public.claim_market_history_job()')).replace('declare','declare\n -- fixture drift\n'))],
    ['enqueue helper drift',async()=>db.exec((await definition('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)')).replace('declare','declare\n -- fixture drift\n'))],
    ['running worker',()=>addJob(900,1,{status:'running'})],
    ['daily cadence drift',()=>db.exec("update cron.job set schedule='31 22 * * *' where jobid=1")],
    ['worker command drift',()=>db.exec("update cron.job set command=command||' ' where jobid=2")],
    ['worker inactive',()=>db.exec('update cron.job set active=false where jobid=2')],
    ['Technical cadence drift',()=>db.exec("update cron.job set schedule='16 23 * * *' where jobid=3")],
    ['retry command drift',()=>db.exec("update cron.job set command=command||' ' where jobid=4")],
    ['missing required job',()=>db.exec('delete from cron.job where jobid=4')],
    ['existing ASX enqueue identity',()=>db.exec("insert into cron.job values(20,'market-history-asx-daily-close-enqueue','15 14 * * *','unexpected',false)")]
  ]){
    await resetBaseline();await change();const beforeCron=await cron(),beforeQueue=await queue();
    await assert.rejects(db.exec(release),/drift|worker running/);assertions++;await db.exec('rollback');
    eq(await cron(),beforeCron);eq(await queue(),beforeQueue);eq(await query('select * from cron.fixture_changes'),[]);
    eq((await query("select to_regprocedure('market_history.enqueue_daily_cohort_v1(boolean)') value"))[0].value,null);
    scenarios++;console.log('PASS release rejects '+name+' atomically');
  }
  await resetBaseline();const cronBefore=await cron();const helperBefore=await definition('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)');
  const originalEnqueue=await definition('market_history.enqueue_daily_jobs()'),originalClaim=await definition('public.claim_market_history_job()');
  const oldAcl=()=>query("select proname,proacl::text acl from pg_proc where pronamespace='market_history'::regnamespace or oid='public.claim_market_history_job()'::regprocedure order by proname");
  const baselineAcl=await oldAcl();
  await db.exec(release);
  for(const signature of ['market_history.enqueue_daily_jobs()','public.claim_market_history_job()',
    'market_history.enqueue_daily_cohort_v1(boolean)','market_history.enqueue_asx_daily_jobs_v1()',
    'market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'])
    console.log('Installed definition MD5 '+JSON.stringify({signature,digest:(await query('select md5(pg_get_functiondef($1::regprocedure)) digest',[signature]))[0].digest}));
  await scenario('release alters only authorized schedules and adds one ASX enqueue without executing jobs',async()=>{
    const after=await cron();eq(after.length,7);
    for(const n of [1,2,5,6])eq(after.find(r=>r.jobid===n),cronBefore.find(r=>r.jobid===n));
    for(const [n,schedule] of [[3,'0 0 * * *'],[4,'5 0 * * *']])eq(after.find(r=>r.jobid===n),{...cronBefore.find(r=>r.jobid===n),schedule});
    eq(after[6].jobname,'market-history-asx-daily-close-enqueue');eq(after[6].schedule,'15 14 * * *');
    eq(after[6].command,'select market_history.enqueue_asx_daily_jobs_v1()');eq(await queue(),[]);
    eq(await definition('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'),helperBefore);
  });
  await scenario('ASX 14:15 UTC follows Sydney midnight in summer and winter; non-ASX retains22:30UTC',async()=>{
    for(const [at,expected] of [['2026-01-15T14:15Z','2026-01-16 01:15'],['2026-06-15T14:15Z','2026-06-16 00:15']])
      eq((await query("select to_char($1::timestamptz at time zone 'Australia/Sydney','YYYY-MM-DD HH24:MI') local",[at]))[0].local,expected);
    eq((await cron()).find(r=>r.jobid===1).schedule,'30 22 * * *');
  });
  await scenario('split wrappers exactly preserve prior active/watch/opportunity union without duplication',async()=>{
    eq(await enqueue(true),4);eq((await queue()).map(r=>r.instrument_id).sort(),[1,3,5,11].map(uid).sort());
    eq(await enqueue(false),5);eq((await queue()).map(r=>r.instrument_id).sort(),baselineUniverse);
    eq(await enqueue(true),0);eq(await enqueue(false),0);eq((await queue()).length,9);
  });
  for(const status of ['succeeded','failed','cancelled','already_complete','mapping_required','validation_required'])
    await scenario('same-cycle '+status+' cannot create a second daily job',async()=>{
      await focus();eq(await enqueue(true),1);await db.query('update market_history_jobs set status=$1,attempts=2,finished_at=clock_timestamp()',[status]);
      const before=await queue();eq(await enqueue(true),0);eq(await queue(),before);
    });
  for(const status of ['pending','running'])await scenario('prior-day '+status+' is reused and marked without resetting state/attempts/due time',async()=>{
    await focus();const day=(await query("select (statement_timestamp() at time zone 'UTC')::date::text cycle_day"))[0].cycle_day;
    const oldDay=(await query("select ((statement_timestamp() at time zone 'UTC')::date-1)::text cycle_day"))[0].cycle_day;
    await addJob(1,1,{status,attempts:2,next_attempt_at:'2999-01-01Z',started_at:'2002-01-01Z',metadata:{enqueued_for:oldDay,daily_enqueue_cycles:[oldDay],retained:'evidence'}});
    const before=(await queue())[0];eq(await enqueue(true),1);const after=(await queue())[0];
    eq({...after,metadata:before.metadata},before);eq(after.metadata.enqueued_for,oldDay);eq(after.metadata.daily_enqueue_cycles,[oldDay,day]);eq(after.metadata.retained,'evidence');
    eq(await enqueue(true),0);eq((await queue())[0],after);
    await db.exec("update market_history_jobs set status='succeeded'");eq(await enqueue(true),0);eq((await queue()).length,1);
  });
  for(const status of ['mapping_required','validation_required'])await scenario('latest explicit '+status+' blocks daily enqueue, even beside older pending work',async()=>{
    await focus();await addJob(1,1,{status:'pending'});await addJob(2,1,{status,job_type:'initial_backfill',created_at:'2002-01-01Z'});
    const before=await queue();eq(await enqueue(true),0);eq(await queue(),before);
  });
  await scenario('latest hold selection uses created date then ID and does not treat older resolved hold as current',async()=>{
    await focus();await addJob(1,1,{status:'mapping_required'});await addJob(2,1,{status:'succeeded'});
    eq(await enqueue(true),1);eq((await queue()).length,3);
  });
  await scenario('explicit cohort is mandatory',async()=>{
    await db.exec('savepoint invalid');await assert.rejects(db.query('select market_history.enqueue_daily_cohort_v1(null)'),/Explicit daily cohort/);assertions++;
    await db.exec('rollback to savepoint invalid');eq(await queue(),[]);
  });
  await scenario('active open > active watched > active > inactive overrides global initial-backfill preference',async()=>{
    await addJob(1,1);await addJob(2,2,{job_type:'initial_backfill'});await addJob(3,8,{job_type:'initial_backfill'});
    await addJob(4,3,{job_type:'initial_backfill'});await addJob(5,9,{job_type:'initial_backfill'});
    const order=[];for(let n=0;n<5;n++)order.push((await claim())[0].instrument_id);
    eq(order,[1,2,8,3,9].map(uid));eq(await claim(),[]);
  });
  await scenario('initial backfill wins only inside a cohort, then due time, creation and ID decide',async()=>{
    await addJob(1,8,{next_attempt_at:'1990-01-01Z'});
    await addJob(2,8,{job_type:'initial_backfill',next_attempt_at:'2000-01-02Z'});
    await addJob(3,8,{job_type:'initial_backfill',next_attempt_at:'2000-01-01Z',created_at:'2002-01-01Z'});
    await addJob(4,8,{job_type:'initial_backfill'});await addJob(5,8,{job_type:'initial_backfill'});
    const order=[];for(let n=0;n<5;n++)order.push((await claim())[0].id);
    eq(order,[4,5,3,2,1].map(n=>uid(1000+n)));
  });
  await scenario('EXIT/CANCELLED close only their own calls; remaining open call retains first priority',async()=>{
    await db.exec(`insert into shared_decision_outcomes values('${uid(201)}','EXIT');
      insert into shared_decision_calls values('${uid(202)}','${uid(2)}'),('${uid(203)}','${uid(2)}');
      insert into shared_decision_outcomes values('${uid(202)}','CANCELLED')`);
    await addJob(1,1);await addJob(2,2);eq((await claim())[0].instrument_id,uid(2));
  });
  await scenario('claim requires due pending work and preserves previous start while incrementing exactly once',async()=>{
    await addJob(1,1,{status:'running'});await addJob(2,1,{next_attempt_at:'2999-01-01Z'});await addJob(3,1,{next_attempt_at:null});
    await addJob(4,1,{status:'validation_required'});await addJob(5,8,{attempts:2,started_at:'2002-01-01Z'});
    const before=await queue();const r=(await claim())[0];eq(r.id,uid(1005));eq(r.attempts,3);eq(r.status,'running');
    eq(new Date(r.started_at).toISOString(),'2002-01-01T00:00:00.000Z');eq(await claim(),[]);
    eq((await queue()).filter(j=>j.id!==r.id),before.filter(j=>j.id!==r.id));
  });
  await scenario('unmapped pending jobs remain claimable at inactive/support priority',async()=>{
    await addJob(1,null);await addJob(2,8);eq((await claim())[0].instrument_id,uid(8));eq((await claim())[0].instrument_id,null);
  });
  await scenario('new wrappers stay private while existing trusted worker/enqueue grants persist',async()=>{
    for(const role of ['anon','authenticated','service_role'])for(const fn of ['market_history.enqueue_daily_cohort_v1(boolean)','market_history.enqueue_asx_daily_jobs_v1()'])
      eq((await query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn]))[0].allowed,false);
    for(const fn of ['market_history.enqueue_daily_jobs()','public.claim_market_history_job()']){
      eq((await query('select has_function_privilege(\'service_role\',$1,\'EXECUTE\') allowed',[fn]))[0].allowed,true);
      for(const role of ['anon','authenticated'])eq((await query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn]))[0].allowed,false);
    }
    await db.exec('set local role service_role');eq(await enqueue(false),5);eq((await claim()).length,1);await db.exec('reset role');
  });
  await scenario('lock clauses scope row locks to queue and serialize cohort enqueue sequence',async()=>{
    const claimSql=await definition('public.claim_market_history_job()');assert.match(claimSql,/for update of j skip locked limit 1/i);assertions++;
    const cohortSql=await definition('market_history.enqueue_daily_cohort_v1(boolean)');assert.match(cohortSql,/pg_advisory_xact_lock\(hashtextextended\('market-history-daily-cohorts-v1',0\)\)/);assertions++;
    const result=await claim();eq(result,[]);
  });
  // Rollback clock substitution affects its guard only, never restored function
  // bodies. This makes the safe UTC boundary reproducible at any test-run time.
  let rollback=rollbackSource.replaceAll('\r\n','\n');
  for(const [n,digest] of [[0,'f7ad107b9531adcb7ba73ac980b9c5c3'],[1,'f48a6318be6459d80a38778cbb08a341'],[2,'024c715837343b5eb4865e09f35e467c'],[3,'fb4e24c84122966864083ec9dc49be2c']])
    rollback=rollback.replace(digest,createHash('md5').update(cronFixture[n][3]).digest('hex'));
  const restoreStart=rollback.indexOf('CREATE OR REPLACE FUNCTION');assert.ok(restoreStart>0);
  const rollbackAt=at=>rollback.slice(0,restoreStart).replaceAll('clock_timestamp()',`timestamptz '${at}'`)+rollback.slice(restoreStart);
  const installedCron=await cron(),installedEnqueue=await definition('market_history.enqueue_daily_jobs()'),installedClaim=await definition('public.claim_market_history_job()');
  const signatures=['market_history.enqueue_daily_jobs()','public.claim_market_history_job()',
    'market_history.enqueue_daily_cohort_v1(boolean)','market_history.enqueue_asx_daily_jobs_v1()',
    'market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'];
  const installedDefinitions=await Promise.all(signatures.map(definition));
  for(let index=0;index<signatures.length;index++){
    await db.exec(installedDefinitions[index].replace('AS $function$','AS $function$\n-- synthetic unreviewed function change\n'));
    const beforeDefinitions=await Promise.all(signatures.map(definition));const before=await queue(),beforeCron=await cron();
    await assert.rejects(db.exec(rollbackAt('2026-11-17T10:00:00Z')),/Rollback function drift/);assertions++;await db.exec('rollback');
    eq(await Promise.all(signatures.map(definition)),beforeDefinitions);eq(await queue(),before);eq(await cron(),beforeCron);
    await db.exec(installedDefinitions[index]);scenarios++;console.log('PASS rollback refuses to overwrite unreviewed '+signatures[index]);
  }
  assert.match(rollback.slice(0,restoreStart),/pg_advisory_xact_lock\(hashtextextended\('market-history-daily-cohorts-v1',0\)\)/);assertions++;
  eq(rollback.indexOf('pg_advisory_xact_lock')<rollback.indexOf('if md5'),true);
  for(const [name,at,change] of [
    ['exact unsafe UTC boundary','2026-11-17T14:15:00Z',async()=>{}],
    ['after unsafe UTC boundary','2026-11-17T23:00:00Z',async()=>{}],
    ['ASX cycle original enqueue date','2026-11-17T10:00:00Z',()=>addJob(1,1,{status:'succeeded',metadata:{enqueued_for:'2026-11-17'}})],
    ['ASX reused cycle marker','2026-11-17T10:00:00Z',()=>addJob(1,1,{status:'failed',metadata:{enqueued_for:'2026-11-16',daily_enqueue_cycles:['2026-11-17']}})],
    ['running job','2026-11-17T10:00:00Z',()=>addJob(1,2,{status:'running'})],
    ['cron drift','2026-11-17T10:00:00Z',()=>db.exec("update cron.job set schedule='1 0 * * *' where jobid=3")],
    ['worker dispatch drift','2026-11-17T10:00:00Z',()=>db.exec("update cron.job set command=command||' ' where jobid=2")]
  ]){
    await db.exec('truncate market_history_jobs');
    for(const row of installedCron)await db.query('update cron.job set schedule=$1,command=$2,active=$3 where jobid=$4',[row.schedule,row.command,row.active,row.jobid]);
    await change();const before=await queue(),beforeCron=await cron();
    await assert.rejects(db.exec(rollbackAt(at)),/Unsafe|running|drift/);assertions++;await db.exec('rollback');
    eq(await queue(),before);eq(await cron(),beforeCron);eq(await definition('market_history.enqueue_daily_jobs()'),installedEnqueue);
    eq(await definition('public.claim_market_history_job()'),installedClaim);scenarios++;console.log('PASS rollback rejects '+name+' atomically');
  }
  await db.exec('truncate market_history_jobs');
  for(const row of installedCron)await db.query('update cron.job set schedule=$1,command=$2,active=$3 where jobid=$4',[row.schedule,row.command,row.active,row.jobid]);
  await addJob(1,1,{status:'pending',attempts:2,metadata:{enqueued_for:'2026-11-16',daily_enqueue_cycles:['2026-11-16'],retained:'keep'}});
  await addJob(2,2,{status:'succeeded',metadata:{enqueued_for:'2026-11-17'}});
  const preserved=await queue();await db.exec(rollbackAt('2026-11-17T14:14:59.999999Z'));
  eq(await definition('market_history.enqueue_daily_jobs()'),originalEnqueue);
  eq(await definition('public.claim_market_history_job()'),originalClaim);
  eq(await definition('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'),helperBefore);
  eq(await queue(),preserved);eq(await cron(),cronBefore);
  eq(await oldAcl(),baselineAcl);
  for(const fn of ['market_history.enqueue_daily_cohort_v1(boolean)','market_history.enqueue_asx_daily_jobs_v1()'])
    eq((await query('select to_regprocedure($1) value',[fn]))[0].value,null);
  eq((await query("select has_function_privilege('service_role','public.claim_market_history_job()','EXECUTE') allowed"))[0].allowed,true);
  scenarios++;console.log('PASS safe-boundary rollback restores exact original definitions/schedules and preserves all jobs');
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual queue functions and synthetic scheduler guard fixtures.`);
  console.log('Migration SHA256 '+createHash('sha256').update(source).digest('hex'));
  console.log('Rollback SHA256 '+createHash('sha256').update(rollbackSource).digest('hex'));
  console.log('UNVERIFIED: multi-session lock contention, live cron command digests and hosted execution. PGlite uses one backend; no concurrency acceptance claimed.');
}finally{await db.close();}
