// Actual runner, monitor, migration and rollback; synthetic successful calculator.
// This tests receipt provenance, not pricing or outcome arithmetic. No hosted calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const fixture=await readFile('scripts/test-asx-alert-monitoring.mjs','utf8');
const marker="  await check('installation baselines existing result without replay and changes no cron schedules'";
assert.equal(fixture.split(marker).length,2,'Unique fixture setup boundary');
const modulePath=process.env.PGLITE_MODULE||import.meta.resolve('@electric-sql/pglite');
const setup=fixture.slice(0,fixture.indexOf(marker)).replace("process.env.PGLITE_MODULE||'@electric-sql/pglite'",JSON.stringify(modulePath));
async function provenanceChecks(){
  const migrationPath='supabase/migrations/20261119053418_fix_evaluator_receipt_provenance.sql';
  const migration=(await readFile(migrationPath,'utf8')).replaceAll('\r\n','\n');
  const recovery=(await readFile('scripts/rollback-evaluator-receipt-provenance.sql','utf8')).replaceAll('\r\n','\n');
  const signatures=['private.run_shared_evaluation_v1(uuid,text,text)','private.trading_pipeline_core_snapshot_v1(timestamptz)'];
  const def=async signature=>(await query('select pg_get_functiondef($1::regprocedure) d',[signature]))[0].d;
  const hashes=async()=>query("select p.oid::regprocedure::text signature,md5(replace(pg_get_functiondef(p.oid),chr(13),'')) definition_md5,md5(replace(prosrc,chr(13),'')) body_md5 from pg_proc p where p.oid=any($1::regprocedure[]) order by signature",[signatures]);
  const security=async()=>query('select oid::regprocedure::text signature,prosecdef,provolatile,proconfig,proacl from pg_proc where oid=any($1::regprocedure[]) order by 1',[signatures]);
  await db.exec('drop table private.shared_evaluation_run_items;drop table private.shared_evaluation_runs');
  await db.exec((await readFile('scripts/shared-evaluation-runner.sql','utf8')).replaceAll('\r\n','\n'));
  await db.exec(functionDefinition(sql.replaceAll('\r\n','\n'),'private.trading_pipeline_core_snapshot_v1'));
  const beforeDefs=await Promise.all(signatures.map(def)),beforeSecurity=await security();
  eq((await hashes()).map(x=>x.definition_md5),['012417b1cd996a75e83139fa277e517b','a31c65572116c60459b1b17cae1639cc'],'Exact normalized hosted predecessor definitions');
  const wrapperBefore=await def('private.trading_pipeline_snapshot_v1(timestamptz)');
  const approved='395b740ebfb6a7022dd899acdb055716113e5caa',source='cc9a206158e13ace78da0e7e922c798b73a2a0fb';
  await db.exec(`alter table private.shared_evaluator_release add column singleton boolean primary key default true check(singleton);
    create table private.fixture_calculations(call_id uuid);
    create or replace function private.evaluate_shared_call_v1(p_call uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
    begin
      if current_setting('fixture.failure',true)='true' then raise exception 'VERIFIED_CALENDAR_REQUIRED';end if;
      insert into private.fixture_calculations values(p_call);
      return jsonb_build_object('status','COMMITTED','callId',p_call);
    end $$;
    create table private.shared_decision_evaluation_state(call_id uuid,version bigint,last_attempt_at timestamptz,data_status text,blocker_code text);
    delete from watchlist_items where instrument_id<>'${asx}';
    insert into private.shared_decision_config values('${asx}',true);
    insert into private.shared_evaluator_release(accepted_revision,enabled) values('${approved}',true);
    insert into private.shared_market_calendars values(gen_random_uuid(),'NASDAQ','2026-11-17Z','2026-11-25Z','2026-11-01Z','2026-12-01Z','[{"date":"2026-11-17","status":"OPEN"}]');
    insert into gpt_market_runs values('${id(2000)}','succeeded','2026-11-18T01:03Z','scheduled','2026-11-18T01:00Z');
    insert into gpt_market_assessments(assessment_id,instrument_id,run_id,assessment_date,created_at,technical_engine_input_used,rating,score,confidence,methodology_version)
      values('${id(2001)}','${asx}','${id(2000)}','2026-11-17','2026-11-18T01:02Z',false,'Buy',70,80,'independent-market-ai-v1');
    insert into shared_decision_calls values('${id(2002)}','${asx}','2026-11-18T01:04Z');
    insert into private.shared_decision_assessment_usage values('${id(2001)}','${id(2002)}','${id(2002)}');
    insert into private.shared_decision_evaluation_state values('${id(2002)}',0,null,null,null);
    insert into private.shared_evaluation_runs(id,spec_revision,origin,started_at,completed_at,status,evaluated_count)
      values('${id(1999)}','${approved}','scheduled','2026-11-18T01:05Z','2026-11-18T01:06Z','succeeded',1);
    insert into private.shared_evaluation_run_items values('${id(1999)}','${id(2002)}','evaluated','{"legacy":true}',null);`);
  const historyBefore=await query('select to_jsonb(r) r from private.shared_evaluation_runs r order by id');
  const itemsBefore=await query('select * from private.shared_evaluation_run_items order by run_id,call_id');
  async function rejectedScript(script,pattern){try{await assert.rejects(()=>db.exec(script),pattern);assertions++;}finally{await db.exec('rollback');}}
  await db.exec(`insert into private.shared_evaluation_runs(id,spec_revision,origin) values('${id(1998)}','${source}','scheduled')`);
  await rejectedScript(migration,/Unresolved shared evaluation/);eq((await query("select count(*)::int n from pg_attribute where attrelid='private.shared_evaluation_runs'::regclass and attname='evaluator_revision' and not attisdropped"))[0].n,0);
  await db.exec(`delete from private.shared_evaluation_runs where id='${id(1998)}'`);
  await db.exec(beforeDefs[0].replace('blocked int:=0;','blocked int:=0; -- deliberately drifted\n'));
  await rejectedScript(migration,/baseline drift/);await db.exec(beforeDefs[0]);
  await db.exec(migration);
  const patchedDefs=await Promise.all(signatures.map(def)),patchedHashes=await hashes();
  console.log(JSON.stringify({patched_function_hashes:patchedHashes}));
  eq(await security(),beforeSecurity,'No role or security metadata change');
  eq(await def('private.trading_pipeline_snapshot_v1(timestamptz)'),wrapperBefore);
  eq(await query('select to_jsonb(r)-\'evaluator_revision\' r from private.shared_evaluation_runs r order by id'),historyBefore);
  eq(await query('select * from private.shared_evaluation_run_items order by run_id,call_id'),itemsBefore);
  eq((await query('select evaluator_revision from private.shared_evaluation_runs'))[0].evaluator_revision,null);
  eq(await query('select * from cron.job order by jobid'),cronBefore);
  scenarios++;console.log('PASS exact guarded install, idle/drift refusal, historical preservation and unchanged privileges/schedule/wrapper');
  // Guard checks above and recovery checks below execute unmodified clocks.
  // Rebind only clocks for deterministic dated monitoring and run receipts.
  for(const d of patchedDefs)await db.exec(clock(d));
  await db.exec('alter table private.shared_evaluation_runs alter column started_at set default public.fixture_now()');
  const snapshot=async()=>(await query('select private.trading_pipeline_core_snapshot_v1($1) s',[now]))[0].s;
  const run=async(n=2010,rev=source,origin='scheduled')=>(await query('select private.run_shared_evaluation_v1($1,$2,$3) r',[id(n),rev,origin]))[0].r;
  const countCalls=async()=>(await query('select count(*)::int n from private.fixture_calculations'))[0].n;
  async function scenario(name,fn){await db.exec('begin isolation level serializable');await time(now);try{await db.exec('delete from private.shared_evaluation_run_items;delete from private.shared_evaluation_runs');await fn();scenarios++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
  await scenario('different controller source succeeds under database approved release and monitor recognizes it',async()=>{
    const releaseBefore=await query('select * from private.shared_evaluator_release');
    const r=await run();eq(r.status,'succeeded');eq(r.spec_revision,source);eq(r.evaluator_revision,approved);eq(r.evaluated_count,1);eq(r.blocked_count,0);eq(await countCalls(),1);
    const s=await snapshot();eq(s.counts.supported,1);eq(s.counts.researched,1);eq(s.counts.published,1);eq(s.counts.evaluated,1);eq(s.instruments[0].reason,null);
    eq(await query('select * from private.shared_evaluator_release'),releaseBefore);
    eq((await query("select count(*)::int n from pg_locks where relation='private.shared_evaluator_release'::regclass and mode='RowShareLock' and granted"))[0].n,1,'Approval read lock retained until transaction end');
  });
  await scenario('legacy null provenance retains only exact prior source matching',async()=>{
    await run();await db.exec('update private.shared_evaluation_runs set evaluator_revision=null');eq((await snapshot()).counts.evaluated,0);
    await db.query('update private.shared_evaluation_runs set spec_revision=$1',[approved]);eq((await snapshot()).counts.evaluated,1);
    await db.query('update private.shared_evaluation_runs set evaluator_revision=$1',[source]);eq((await snapshot()).counts.evaluated,0,'Nonnull evaluator mismatch cannot fall back to matching source');
  });
  await scenario('idempotent retry preserves both original facts after changed or disabled approval',async()=>{
    const original=await run();await db.query('update private.shared_evaluator_release set accepted_revision=$1,enabled=false',['a'.repeat(40)]);
    eq(await run(),original);eq(await countCalls(),1);eq((await snapshot()).counts.evaluated,0);
    await rejected(()=>run(2010,approved),/RUN_RETRY_PAYLOAD_MISMATCH/);await rejected(()=>run(2010,source,'manual_verification'),/RUN_RETRY_PAYLOAD_MISMATCH/);
  });
  for(const [name,change] of [['disabled','update private.shared_evaluator_release set enabled=false'],['missing','delete from private.shared_evaluator_release'],['null','update private.shared_evaluator_release set accepted_revision=null'],['invalid',"update private.shared_evaluator_release set accepted_revision='not-an-approved-revision'"]]){
    await scenario(name+' approval blocks without inner calculator or certified provenance',async()=>{
      await db.exec(change);const r=await run();eq(r.status,'blocked');eq(r.evaluator_revision,null);eq(r.spec_revision,source);eq(r.evaluated_count,0);eq(r.blocked_count,1);eq(await countCalls(),0);eq((await snapshot()).counts.evaluated,0);
      eq((await query('select blocker_code from private.shared_evaluation_run_items'))[0].blocker_code,'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED');
      const st=(await query('select * from private.shared_decision_evaluation_state'))[0];eq(st.version,1);eq(st.data_status,'UNVERIFIED');eq(st.blocker_code,'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED');
    });
  }
  await scenario('failure preserves database approval but remains blocked and retains release lock',async()=>{
    await db.exec("select set_config('fixture.failure','true',true)");const r=await run();eq(r.status,'blocked');eq(r.evaluator_revision,approved);eq(await countCalls(),0);eq((await snapshot()).counts.evaluated,0);
    const st=(await query('select * from private.shared_decision_evaluation_state'))[0];eq(st.version,1);eq(st.data_status,'CALENDAR_REQUIRED');eq(st.blocker_code,'VERIFIED_CALENDAR_REQUIRED');
    eq((await query("select count(*)::int n from pg_locks where relation='private.shared_evaluator_release'::regclass and mode='RowShareLock' and granted"))[0].n,1);
  });
  await scenario('manual evaluation and changed release cannot certify scheduled workflow',async()=>{
    await run(2010,source,'manual_verification');eq((await snapshot()).counts.evaluated,0);
    await run(2011);eq((await snapshot()).counts.evaluated,1);
    await db.query('update private.shared_evaluator_release set accepted_revision=$1',['a'.repeat(64)]);eq((await snapshot()).counts.evaluated,0);
    const r=await run(2012);eq(r.evaluator_revision,'a'.repeat(64));eq((await snapshot()).counts.evaluated,1);
  });
  await scenario('new provenance never bypasses publication and receipt time gates',async()=>{
    await run();await db.exec("update private.shared_evaluation_runs set completed_at='2026-11-18T06:01Z'");eq((await snapshot()).counts.evaluated,0);
    await db.exec("update private.shared_evaluation_runs set started_at='2026-11-18T01:02Z',completed_at='2026-11-18T01:03Z'");eq((await snapshot()).counts.evaluated,0);
  });
  await check('nonserializable and client roles denied; malformed stored revision rejected',async()=>{
    await rejected(()=>run(),/SERIALIZABLE_TRANSACTION_REQUIRED/);
    for(const role of ['anon','authenticated','service_role']){
      eq((await query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signatures[0]]))[0].allowed,false);
      eq((await query("select has_table_privilege($1,'private.shared_evaluation_runs','INSERT') allowed",[role]))[0].allowed,false);
    }
    await rejected(()=>db.query('update private.shared_evaluation_runs set evaluator_revision=$1',['bad']),/evaluator_revision_check/);
  });
  // Retain a new terminal receipt across recovery; do not rewrite history.
  await db.exec('begin isolation level serializable');await run(2020);await db.exec('commit');
  const retainedRows=await query('select * from private.shared_evaluation_runs order by id'),retainedItems=await query('select * from private.shared_evaluation_run_items order by run_id,call_id');
  for(const d of patchedDefs)await db.exec(d);
  await db.exec(`insert into private.shared_evaluation_runs(id,spec_revision,origin) values('${id(1998)}','${source}','scheduled')`);
  await rejectedScript(recovery,/Unresolved shared evaluation/);await db.exec(`delete from private.shared_evaluation_runs where id='${id(1998)}'`);
  await db.exec(patchedDefs[1].replace('declare day date','declare -- deliberately drifted\n day date'));
  await rejectedScript(recovery,/drift/i);await db.exec(patchedDefs[1]);
  // Exercise a Windows CRLF script without preprocessing its dollar-quoted guards.
  await db.exec(recovery.replaceAll('\n','\r\n'));
  eq((await Promise.all(signatures.map(def))).map(d=>d.replaceAll('\r','')),beforeDefs,'Exact original definitions restored, normalized line endings only');eq(await security(),beforeSecurity);
  eq(await query('select * from private.shared_evaluation_runs order by id'),retainedRows);eq(await query('select * from private.shared_evaluation_run_items order by run_id,call_id'),retainedItems);
  eq(await def('private.trading_pipeline_snapshot_v1(timestamptz)'),wrapperBefore);eq(await query('select * from cron.job order by jobid'),cronBefore);
  await rejectedScript(migration,/column already exists/);
  scenarios++;console.log('PASS guarded recovery restores exact definitions while retaining provenance and refusing unchecked reinstallation');
  console.log(`PASS evaluator receipt provenance: ${scenarios} scenarios, ${assertions} assertions. Actual SQL; synthetic inner calculator; native multi-session contention UNVERIFIED.`);
}
const body=provenanceChecks.toString();
try{await import('data:text/javascript;base64,'+Buffer.from(setup+body.slice(body.indexOf('{')+1,body.lastIndexOf('}'))+'\n}finally{await db.close();}\n').toString('base64'));}
catch(error){console.error(error.message);process.exitCode=1;}
