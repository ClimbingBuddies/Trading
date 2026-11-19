// Independent actual-SQL regression. Reuse the existing source/calculation
// fixture setup, not its assertions or a second implementation of admission.
// Only PostgreSQL clocks are rebound after exact migration guards have run.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const fixture=await readFile('scripts/test-asx-convergence.mjs','utf8');
const marker="  await check('exact reviewed calendar seed and unchanged original v1 function definitions'";
assert.equal(fixture.split(marker).length,2,'Unique fixture setup boundary');
const modulePath=process.env.PGLITE_MODULE||import.meta.resolve('@electric-sql/pglite');
let setup=fixture.slice(0,fixture.indexOf(marker));
setup=setup.replace("process.env.PGLITE_MODULE||'@electric-sql/pglite'",JSON.stringify(modulePath));
assert.ok(setup.includes('await db.exec(clock(sql));'));
setup=setup.replace('await db.exec(clock(sql));',"await db.exec(sql.replaceAll('\\r\\n','\\n'));");
async function identityChecks(){
  const migrationPath='supabase/migrations/20261119051916_fix_asx_admission_note_identity.sql';
  const migration=(await readFile(migrationPath,'utf8')).replaceAll('\r\n','\n');
  const monitoring=(await readFile('supabase/migrations/20261118054201_integrate_asx_alerts_and_monitoring.sql','utf8')).replaceAll('\r\n','\n');
  function sqlDefinition(text,name){
    const start=text.search(new RegExp('create(?: or replace)? function '+name.replaceAll('.','\\.')+'\\(','i'));
    assert(start>=0,name);const rest=text.slice(start),tag=rest.match(/\bas\s+(\$[^$]*\$)/i);assert(tag,name);
    const end=tag.index+tag[0].length;return (rest.slice(0,rest.indexOf(tag[1],end)+tag[1].length)+';').replace(/^create function/i,'create or replace function');
  }
  const signatures=['market_convergence.run_asx_v1(uuid,text,uuid,timestamptz)','private.asx_convergence_health_v1(timestamptz)'];
  const expectedHashes=['de2dd67850f4b8f6a0e93fae519e5fdc','f437d00a3a9d58aaa22a24a686f036c4'];
  const rebound=async(signature)=>{const d=(await query('select pg_get_functiondef($1::regprocedure) d',[signature]))[0].d;await db.exec(clock(d));};
  const bodyHash=async signature=>(await query("select md5(replace(prosrc,chr(13),'')) hash from pg_proc where oid=$1::regprocedure",[signature]))[0].hash;
  await db.exec(`alter table gpt_market_runs add column notes text default 'Original bookkeeping';
    create schema if not exists private;
    create table private.asx_convergence_alert_queue(state text);
    create table public.alerts(is_enabled boolean,alert_type text,instrument_id uuid,watchlist_id uuid,owner_user_id uuid);
    create table public.watchlists(id uuid,owner_user_id uuid);
    create table public.watchlist_items(watchlist_id uuid,instrument_id uuid);`);
  await db.exec(sqlDefinition(monitoring,'private.asx_convergence_health_v1'));
  for(let n=0;n<signatures.length;n++)eq(await bodyHash(signatures[n]),expectedHashes[n],'Actual predecessor body before clock rebinding');
  await rebound('market_convergence.prepare_asx_v1(uuid,timestamptz)');
  for(const s of signatures)await rebound(s);
  const health=async()=>(await query('select private.asx_convergence_health_v1($1) h',[at]))[0].h;
  await check('predecessor reproduces notes-only replay rejection and false health mismatch',async()=>{
    const id=await run();eq((await receipt(id)).status,'succeeded');eq((await health()).state,'CURRENT');
    const rows=await published(),runs=await ledger();await db.exec("update gpt_market_runs set notes='Receipt bookkeeping appended after convergence'");
    eq((await prepare()).readiness,'READY');await rejected(()=>run(),/SAME_DAY_INPUT_CHANGED/);
    eq((await health()).reasons.CURRENT_ADMISSION_CHANGED,1);eq(await published(),rows);eq(await ledger(),runs);
  });
  await db.exec(sqlDefinition(sql.replaceAll('\r\n','\n'),'market_convergence.run_asx_v1'));
  await db.exec(sqlDefinition(monitoring,'private.asx_convergence_health_v1'));
  for(let n=0;n<signatures.length;n++)eq(await bodyHash(signatures[n]),expectedHashes[n]);
  const metadata=async()=>query('select oid::regprocedure::text signature,prosecdef,provolatile,proconfig,proacl from pg_proc where oid=any($1::regprocedure[]) order by 1',[signatures]);
  const originalMetadata=await metadata();
  const guard=migration.slice(migration.indexOf('do $guard$'),migration.indexOf('end $guard$;')+'end $guard$;'.length);
  const drift=async signature=>{const d=(await query('select pg_get_functiondef($1::regprocedure) d',[signature]))[0].d;const end=d.lastIndexOf('$function$');await db.exec(d.slice(0,end)+'\n-- unexpected later implementation\n'+d.slice(end));};
  for(const signature of signatures)await check('release rejects changed predecessor '+signature,async()=>{
    await drift(signature);await rejected(()=>db.exec(guard),/ASX baseline changed/);eq(await published(),[]);eq(await ledger(),[]);
  });
  await check('release guard rejects an unresolved ASX run',async()=>{
    await db.query("insert into market_convergence.asx_runs_v1(instrument_id,logical_date,cutoff_at,execution_source,attempt_number,status,input_envelope) values($1,'2026-11-17',$2,'manual',1,'running','{}')",[inst,at]);
    await rejected(()=>db.exec(guard),/Unresolved convergence/);eq((await ledger()).length,1);eq(await published(),[]);
  });
  await check('release guard also rejects unresolved original-v1 work',async()=>{
    await db.query("insert into market_convergence_runs(logical_date,cutoff_at,instrument_id,execution_source,attempt_number,status) values('2026-11-17',$1,$2,'manual',1,'running')",[at,other]);
    await rejected(()=>db.exec(guard),/Unresolved convergence/);eq(await ledger(),[]);eq(await published(),[]);
  });
  await db.exec('drop function if exists market_convergence.asx_input_identity_v1(jsonb)');
  await db.exec(migration);
  for(const s of signatures)await rebound(s);
  await check('notes-only updates preserve saved result identity, frozen envelope and current health',async()=>{
    const id=await run(),rows=await published(),runs=await ledger(),e=await ready();
    for(const notes of ['Post-run receipt summary',null,'']){
      await db.query('update gpt_market_runs set notes=$1',[notes]);eq((await prepare()).readiness,'READY');
      eq(await run('scheduled'),id);eq(await run('manual'),id);eq((await health()).state,'CURRENT');
      const diagnosticRow=await report();eq(diagnosticRow.readiness,'ALREADY_SUCCEEDED');eq(diagnosticRow.invocation_sql,null);
      eq(await published(),rows);eq(await ledger(),runs);
      eq((await receipt(id)).input_envelope,e);
    }
  });
  await check('notes changed after an atomic failure permit the same pinned retry',async()=>{
    await fault();const id=await run();eq((await receipt(id)).status,'failed');const original=await receipt(id);
    await db.exec("drop trigger fixture_publication_fault on market_convergence_assessments;update gpt_market_runs set notes='Failure receipt added'");
    const retryId=await run('retry',id);const retry=await receipt(retryId);eq(retry.status,'succeeded');eq(retry.attempt_number,2);
    eq(retry.input_envelope,original.input_envelope);eq((await published()).length,1);eq((await health()).state,'CURRENT');
    eq(await receipt(id),original);
  });
  await check('bookkeeping added during publication does not invalidate unchanged admitted evidence',async()=>{
    await fault("update public.gpt_market_runs set notes='During-write bookkeeping';");
    const id=await run();eq((await receipt(id)).status,'succeeded');eq((await published()).length,1);eq((await health()).state,'CURRENT');
    eq((await receipt(id)).input_envelope.ai_run.notes,'Original bookkeeping');
  });
  const material=[
    ['AI score',"update gpt_market_assessments set score=71",'SAME_DAY_INPUT_CHANGED'],
    ['AI confidence',"update gpt_market_assessments set confidence=81",'SAME_DAY_INPUT_CHANGED'],
    ['AI rating',"update gpt_market_assessments set rating='Hold'",'SAME_DAY_INPUT_CHANGED'],
    ['AI terminal status',"update gpt_market_runs set status='partial'",'SAME_DAY_INPUT_CHANGED'],
    ['AI no longer terminal',"update gpt_market_runs set status='running'",'AI_RUN_NOT_TERMINAL_AT_CUTOFF'],
    ['AI analysis cutoff',"update gpt_market_runs set analysis_cutoff_time='2026-11-18T03:31:59Z'",'SAME_DAY_INPUT_CHANGED'],
    ['AI completed timestamp',"update gpt_market_runs set completed_at='2026-11-18T03:34:01Z'",'SAME_DAY_INPUT_CHANGED'],
    ['Technical score',"update market_scores set overall_score=overall_score-1 where methodology_version='technical-score-asx-v1'",'TECHNICAL_PAYLOAD_MISMATCH'],
    ['Technical calculation cutoff',"update market_scores set calculated_at='2026-11-18T03:34:01Z' where methodology_version='technical-score-asx-v1'",'TECHNICAL_SNAPSHOT_MISMATCH'],
    ['source audit evidence',"update sync_runs set metadata=jsonb_set(metadata,'{coverage_has_rejected_bars}','true')",'TECHNICAL_SOURCE_CHANGED_OR_BLOCKED'],
    ['source observation load identity',"update market_observations set loaded_at=loaded_at+interval '1 second'",'TECHNICAL_SOURCE_CHANGED_OR_BLOCKED'],
    ['AI assessment identity',`insert into gpt_market_assessments select '${uid(301)}',instrument_id,run_id,assessment_date,rating,score,confidence,methodology_version,created_at,technical_engine_input_used from gpt_market_assessments where assessment_id='${aiId}'`,'SAME_DAY_INPUT_CHANGED'],
  ];
  for(const [name,mutation,code] of material)await check(name+' changes remain blocked after notes exclusion',async()=>{
    await run();const rows=await published(),runs=await ledger();await db.exec(mutation);
    eq((await report()).readiness,code);eq((await report()).invocation_sql,null);await rejected(()=>run(),new RegExp(code));
    eq((await health()).state,'ATTENTION');eq(await published(),rows);eq(await ledger(),runs);
  });
  await check('material mutation inside publication rolls back result and leaves failed receipt',async()=>{
    await fault('update public.gpt_market_assessments set score=71;');const id=await run();const r=await receipt(id);
    eq(r.status,'failed');eq(r.error_code,'INPUT_CHANGED_DURING_PUBLICATION');eq(await published(),[]);
    eq(Number((await query('select score from gpt_market_assessments'))[0].score),70);
  });
  await check('material change still rejects retry of an immutable failed envelope',async()=>{
    await fault();const id=await run();await db.exec('drop trigger fixture_publication_fault on market_convergence_assessments;update gpt_market_assessments set score=71');
    const original=await receipt(id),failed=await receipt(await run('retry',id));eq(failed.status,'failed');eq(failed.error_code,'PINNED_INPUT_CHANGED_OR_BLOCKED');
    eq(await receipt(id),original);eq(failed.input_envelope,original.input_envelope);eq(await published(),[]);
  });
  await check('input identity excludes only nested run notes and retains admission clocks',async()=>{
    const base=await ready();const identity=async e=>(await query('select market_convergence.asx_input_identity_v1($1::jsonb) e',[JSON.stringify(e)]))[0].e;
    const original=await identity(base),notes=structuredClone(base);notes.ai_run.notes='Updated';eq(await identity(notes),original);
    for(const [section,key,value] of [[null,'cutoff_at','2026-11-18T03:39:00Z'],[null,'logical_date','2026-11-16'],[null,'notes','Top-level evidence'],['ai_run','status','partial'],['ai_run','analysis_cutoff_time','2026-11-18T03:31:00Z'],['ai','summary','Changed analytical text'],['technical','score_details',{unverified:true}],['calendar','manifest_hash','changed']]){
      const changed=structuredClone(base);if(section)changed[section][key]=value;else changed[key]=value;
      eq(JSON.stringify(await identity(changed))===JSON.stringify(original),false,section+'.'+key+' remains material');
    }
  });
  await check('new admission still rejects stale/future cutoffs while permitted replays keep saved ID',async()=>{
    const id=await run();eq(await run('manual',null,'2026-11-18T03:39:00Z'),id);
    await rejected(()=>run('manual',null,'2026-11-18T03:34:59Z'),/current cutoff/);
    await rejected(()=>run('manual',null,'2026-11-18T03:40:00.001Z'),/current cutoff/);
    eq((await ledger()).length,1);eq((await published()).length,1);
  });
  await check('service role retains actual run/replay access while client roles cannot execute identity helper',async()=>{
    await db.exec('set local role service_role');const id=await run();eq((await receipt(id)).status,'succeeded');await db.exec('reset role');
    await db.exec("update gpt_market_runs set notes='Service retry bookkeeping';set local role service_role");eq(await run(),id);await db.exec('reset role');
    for(const role of ['anon','authenticated']){
      eq((await query("select has_function_privilege($1,'market_convergence.asx_input_identity_v1(jsonb)','EXECUTE') allowed",[role]))[0].allowed,false);
      await db.exec('set local role '+role);await rejected(()=>query("select market_convergence.asx_input_identity_v1('{}')"),/permission denied/);await db.exec('reset role');
    }
  });
  const lineageSQL=clock(await readFile('scripts/asx-convergence-lineage-diff.sql','utf8'));
  const lineage=()=>query(lineageSQL);
  await check('table-only lineage diagnostic is read-only and no receipt never becomes admission',async()=>{
    await db.exec('set transaction read only');const rows=await lineage();eq(rows.length,1);eq(rows[0].lineage_state,'NO_SUCCESSFUL_RECEIPT');
    eq(Number(rows[0].instruments),1);eq(rows[0].verification_scope,'TABLE_COMPARISON_ONLY_NOT_ADMISSION');
    eq(Object.keys(rows[0]).sort(),['checked_at','instruments','lineage_state','verification_scope']);
  });
  await check('table-only lineage distinguishes matching, notes-only and substantive changes without writes',async()=>{
    await run();const rows=await published(),runs=await ledger();eq((await lineage())[0].lineage_state,'STORED_LINEAGE_ROWS_MATCH');
    await db.exec("update gpt_market_runs set notes='Bookkeeping'");eq((await lineage())[0].lineage_state,'RUN_NOTES_ONLY');
    await db.exec('update gpt_market_assessments set confidence=81');eq((await lineage())[0].lineage_state,'ANALYTICAL_OR_LIFECYCLE_ROW_CHANGED');
    eq(await published(),rows);eq(await ledger(),runs);
  });
  await check('table-only diagnostic reports missing current lineage and excludes inactive inventory',async()=>{
    await run();await db.exec('delete from gpt_market_runs');eq((await lineage())[0].lineage_state,'CURRENT_LINEAGE_ROW_MISSING');
    await db.exec("update instruments set is_active=false where exchange_code='ASX'");eq(await lineage(),[]);
  });
  await check('paired recovery rejects changed definitions, restores prior gates and retains immutable history',async()=>{
    const id=await run();await db.exec("update gpt_market_runs set notes='Changed post-result notes'");eq(await run(),id);
    const beforeRows=await published(),beforeRuns=await ledger(),beforeInputs=await evidence();
    // Recovery guards compare exact definitions, so reinstall raw production
    // clocks before testing them; only after restoration are clocks rebound.
    await db.exec(sqlDefinition(migration,'market_convergence.run_asx_v1'));
    await db.exec(sqlDefinition(migration,'private.asx_convergence_health_v1'));
    const recovery=(await readFile('scripts/rollback-asx-admission-note-identity.sql','utf8')).replaceAll('\r\n','\n').replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'');
    for(const statement of [
      `insert into market_convergence.asx_runs_v1(instrument_id,logical_date,cutoff_at,execution_source,attempt_number,status,input_envelope) values('${inst}','2026-11-17','${at}','manual',1,'running','{}')`,
      `insert into market_convergence_runs(logical_date,cutoff_at,instrument_id,execution_source,attempt_number,status) values('2026-11-17','${at}','${other}','manual',1,'running')`,
    ]){
      await db.exec('savepoint running_receipt');await db.exec(statement);await rejected(()=>db.exec(recovery),/Unresolved convergence/);
      eq(await published(),beforeRows);await db.exec('rollback to running_receipt;release running_receipt');
    }
    for(const signature of signatures){
      await db.exec('savepoint drifted');await drift(signature);await rejected(()=>db.exec(recovery),/changed|drift|review/i);
      eq(await published(),beforeRows);eq(await ledger(),beforeRuns);await db.exec('rollback to drifted;release drifted');
    }
    await db.exec(recovery);
    for(let n=0;n<signatures.length;n++)eq(await bodyHash(signatures[n]),expectedHashes[n]);
    eq(await metadata(),originalMetadata);eq(await published(),beforeRows);eq(await ledger(),beforeRuns);eq(await evidence(),beforeInputs);
    for(const s of signatures)await rebound(s);
    await rejected(()=>run(),/SAME_DAY_INPUT_CHANGED/);eq((await health()).reasons.CURRENT_ADMISSION_CHANGED,1);
  });
  console.log('PASS: '+scenarios+' scenarios; '+assertions+' assertions; actual source/calculator/admission/health SQL; native concurrent sessions unverified.');
  console.log(createHash('sha256').update(migration).digest('hex')+' canonical-LF '+migrationPath);
}
const body=identityChecks.toString();
const checks=body.slice(body.indexOf('{')+1,body.lastIndexOf('}'))+'\n}finally{await db.close();}';
try{await import('data:text/javascript;base64,'+Buffer.from(setup+checks+'\n//# sourceURL=asx-admission-identity-fixture.mjs').toString('base64'));}
catch(error){console.error(String(error.message));process.exitCode=1;}
