// Execute the actual bounded recovery batch against isolated PostgreSQL.
// Synthetic identifiers only; no hosted services, HTTP, scheduler or production writes.
// Source snapshot/score currentness functions are controlled stubs: this tests
// the batch's consumption of their receipts, not those independently tested engines.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite();
const path='scripts/recover-yahoo-placeholder-remaining.sql',sql=await readFile(path,'utf8');
const baseline=(await readFile('scripts/history-queue-baseline.sql','utf8')).replaceAll('\r\n','\n');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const provider=uid(900),pilotInstrument=uid(100),pilotAudit=uid(200),pilotJob=uid(300);
const prefix='normalizer-v2-recovery-20261118:';
let scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(text,params=[])=>(await pg.query(text,params)).rows;
const jobs=()=>query('select * from market_history_jobs order by id');
const audits=()=>query('select * from sync_runs order by id');
const batch=()=>query("select * from market_history_jobs where source_scope='manual' and source_key like $1 order by instrument_id",[prefix+'%']);
async function candidate(n){
  await pg.query('insert into instruments values($1,$2,\'ASX\',\'AUD\',true)',[uid(n),'TEST'+n]);
  await pg.query(`insert into sync_runs values($1,$2,'2026-11-17T15:00:00Z','succeeded',$3::jsonb)`,[uid(1000+n),provider,JSON.stringify({
    instrument_id:uid(n),function:'asx-yahoo-market-history',provider_symbol:'TEST'+n+'.AX',normalization_version:1,
    rejected_bars:[{date:'2026-11-17',reason:'synthetic legacy placeholder'}]})]);
  await pg.query(`insert into market_history_jobs(id,instrument_id,job_type,source_scope,source_key,symbol,years,status,attempts,created_at,sync_run_id,metadata)
    values($1,$2,'daily_incremental','active_universe',$3,$4,1,'succeeded',1,'2026-11-17T14:15:00Z',$5,'{"unchanged":true}')`,
    [uid(2000+n),uid(n),'old-daily:'+n,'TEST'+n,uid(1000+n)]);
}
async function reset(){
  await pg.exec(baseline);
  await pg.exec(`drop trigger if exists fixture_enqueue_fault on market_history_jobs;
    truncate instruments,market_history_jobs,sync_runs,data_providers,market_scores,fixture_source;
    insert into data_providers values('${provider}','yahoo',true);
    insert into instruments values('${pilotInstrument}','PILOT','ASX','AUD',true);
    insert into sync_runs values('${pilotAudit}','${provider}','2026-11-18T01:00:00Z','succeeded',
      '{"instrument_id":"${pilotInstrument}","function":"asx-yahoo-market-history","provider_symbol":"PILOT.AX","normalization_version":2,"normalization_revalidation":{"state":"completed"},"rejected_bars":[]}');
    insert into market_history_jobs(id,instrument_id,job_type,source_scope,source_key,symbol,years,status,sync_run_id)
      values('${pilotJob}','${pilotInstrument}','daily_incremental','manual','normalizer-v2-canary-20261118','PILOT',1,'succeeded','${pilotAudit}');
    insert into fixture_source values('${pilotInstrument}','{"status":"ready","anchor_audit_id":"${pilotAudit}","terminal_audit_id":"${pilotAudit}"}');
    insert into market_scores values(1,'${pilotInstrument}','technical-score-asx-v1','2026-11-18T01:10:00Z',true);`);
  for(let n=1;n<=13;n++)await candidate(n);
}
async function execute(){try{return await pg.exec(sql);}catch(error){await pg.exec('rollback');throw error;}}
async function blocked(pattern){
  const before=await jobs(),beforeAudits=await audits();
  await assert.rejects(execute(),pattern);assertions++;
  eq(await jobs(),before,'transaction must roll back all earlier candidate inserts');eq(await audits(),beforeAudits);
  eq((await query("select to_regclass('pg_temp.recovery_candidates') relation"))[0].relation,null,'temporary candidates are not left behind');
}
async function scenario(name,fn){
  await reset();try{await fn();scenarios++;console.log('PASS '+name);}
  catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,1800));}
}
try{
  await pg.exec(`create schema market_history;create schema technical_engine;
    create table instruments(id uuid primary key,symbol text,exchange_code text,currency_code text,is_active boolean);
    create table data_providers(id uuid primary key,provider_code text unique,is_active boolean);
    create table market_history_jobs(id uuid primary key default gen_random_uuid(),instrument_id uuid,job_type text,
      source_scope text,source_key text,symbol text,years integer,status text,attempts integer default 0,max_attempts integer default 3,
      next_attempt_at timestamptz default clock_timestamp(),created_at timestamptz default clock_timestamp(),
      updated_at timestamptz default clock_timestamp(),started_at timestamptz,finished_at timestamptz,sync_run_id uuid,metadata jsonb default '{}');
    create table sync_runs(id uuid primary key,provider_id uuid,started_at timestamptz,status text,metadata jsonb);
    create table fixture_source(instrument_id uuid primary key,receipt jsonb);
    create table market_scores(id bigint primary key,instrument_id uuid,methodology_version text,calculated_at timestamptz,fixture_matches boolean);
    create function technical_engine.asx_source_snapshot_v1(uuid,timestamptz) returns jsonb language sql stable as
      $$select receipt from fixture_source where instrument_id=$1$$;
    create function technical_engine.asx_score_source_matches_v1(bigint) returns boolean language sql stable as
      $$select fixture_matches from market_scores where id=$1$$;`);
  await reset();
  eq((await query("select md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure)) hash"))[0].hash,
    '519b5c19fd5bbd92a838b7ef4cc99541');
  await scenario('exactly 13 unique one-year manual daily jobs; pilot and existing data unchanged',async()=>{
    const before=await jobs(),beforeAudits=await audits();const result=await execute();const rows=await batch();
    eq(result.flatMap(r=>r.rows??[]),[{status:'pending',jobs:13}]);eq(rows.length,13);
    eq(new Set(rows.map(r=>r.id)).size,13);eq(rows.map(r=>r.instrument_id),Array.from({length:13},(_,i)=>uid(i+1)));
    for(let n=1;n<=13;n++){
      const r=rows[n-1];eq([r.job_type,r.source_scope,r.source_key,r.symbol,r.years,r.status,r.attempts,r.sync_run_id],
        ['daily_incremental','manual',prefix+uid(n),'TEST'+n,1,'pending',0,null]);
      eq(r.metadata,{reason:'reviewed_normalizer_v2_quarantine_recovery',expected_normalization_version:2});
    }
    eq((await jobs()).filter(r=>before.some(b=>b.id===r.id)),before);eq(await audits(),beforeAudits);
  });
  await scenario('terminal mixed batch is never replayed or reset',async()=>{
    await execute();let n=0;for(const r of await batch())await pg.query(`update market_history_jobs set status=$1,attempts=3,
      next_attempt_at='2099-01-01',finished_at='2026-11-18T01:30:00Z',metadata=metadata||'{"terminal":true}' where id=$2`,
      [['succeeded','failed','mapping_required','validation_failed'][n++%4],r.id]);
    const before=await jobs();await execute();eq(await jobs(),before);eq((await batch()).length,13);
  });
  await scenario('pending committed batch is never duplicated',async()=>{await execute();const before=await jobs();await execute();eq(await jobs(),before);});
  for(const mutate of [
    "delete from market_history_jobs where id='"+pilotJob+"'",
    "update market_history_jobs set status='failed' where id='"+pilotJob+"'",
    "update market_history_jobs set sync_run_id=null where id='"+pilotJob+"'",
    "update sync_runs set status='failed' where id='"+pilotAudit+"'",
    "update sync_runs set metadata=jsonb_set(metadata,'{normalization_version}','1') where id='"+pilotAudit+"'",
    "update sync_runs set metadata=jsonb_set(metadata,'{normalization_revalidation,state}','\"pending\"') where id='"+pilotAudit+"'",
    "update sync_runs set metadata=jsonb_set(metadata,'{rejected_bars}','[{}]') where id='"+pilotAudit+"'",
    "update sync_runs set metadata=metadata-'rejected_bars' where id='"+pilotAudit+"'"
  ])await scenario('invalid pilot predicate '+(scenarios-2),async()=>{await pg.exec(mutate);await blocked(/query returned no rows/);});
  await scenario('12 candidates abort without inserts',async()=>{await pg.query('delete from instruments where id=$1',[uid(13)]);await blocked(/expected 13.*found 12/);});
  await scenario('14 candidates abort without inserts',async()=>{await candidate(14);await blocked(/expected 13.*found 14/);});
  for(const status of ['pending','running'])await scenario('last candidate '+status+' rolls back first 12 inserts',async()=>{
    await pg.query('update market_history_jobs set status=$1 where instrument_id=$2',[status,uid(13)]);await blocked(/active work/);
  });
  for(const status of ['mapping_required','validation_failed','failed'])await scenario('last candidate '+status+' hold rolls back first 12 inserts',async()=>{
    await pg.query('update market_history_jobs set status=$1 where instrument_id=$2',[status,uid(13)]);await blocked(/hold or unreviewed failure/);
  });
  await scenario('last candidate missing job blocks whole batch',async()=>{
    await pg.query('delete from market_history_jobs where instrument_id=$1',[uid(13)]);await blocked(/hold or unreviewed failure/);
  });
  for(const [field,value] of [['is_active',false],['exchange_code','NYSE'],['currency_code','USD']])await scenario('candidate '+field+' change fails exact count',async()=>{
    await pg.query(`update instruments set ${field}=$1 where id=$2`,[value,uid(13)]);await blocked(/expected 13.*found 12/);
  });
  for(const [field,value] of [['status','failed'],['version',2],['rejected',[]],['symbol','OTHER.AX']])await scenario('latest audit '+field+' change cannot fall back to old accepted audit',async()=>{
    const row=(await query('select * from sync_runs where id=$1',[uid(1013)]))[0];
    if(field==='version')row.metadata.normalization_version=value;
    if(field==='rejected')row.metadata.rejected_bars=value;
    if(field==='symbol'){
      // Changing the only correctly identified audit must remove this candidate.
      await pg.query("update sync_runs set metadata=jsonb_set(metadata,'{provider_symbol}',$1::jsonb) where id=$2",[JSON.stringify(value),uid(1013)]);
    }else await pg.query('insert into sync_runs values($1,$2,\'2099-01-01\',$3,$4::jsonb)',
      [uid(9913),provider,field==='status'?value:'succeeded',JSON.stringify(row.metadata)]);
    await blocked(/expected 13.*found 12/);
  });
  await scenario('inactive Yahoo provider blocks pilot verification',async()=>{await pg.exec('update data_providers set is_active=false');await blocked(/query returned no rows/);});
  await scenario('enqueue drift blocks atomically',async()=>{
    await pg.exec('alter function market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb) set search_path to public');await blocked(/enqueue function changed/);
  });
  for(const field of ['status','anchor_audit_id','terminal_audit_id'])await scenario('pilot source '+field+' mismatch blocks batch',async()=>{
    await pg.query('update fixture_source set receipt=jsonb_set(receipt,$1::text[],$2::jsonb)',[[field],JSON.stringify(field==='status'?'blocked':uid(999))]);
    await blocked(/pilot source\/Technical admission changed/);
  });
  await scenario('missing pilot source receipt blocks batch',async()=>{await pg.exec('truncate fixture_source');await blocked(/pilot source\/Technical admission changed/);});
  for(const value of [false,null])await scenario('pilot Technical currentness '+value+' blocks batch',async()=>{
    await pg.query('update market_scores set fixture_matches=$1',[value]);await blocked(/pilot source\/Technical admission changed/);
  });
  await scenario('missing pilot ASX score blocks batch',async()=>{await pg.exec('truncate market_scores');await blocked(/pilot source\/Technical admission changed/);});
  await scenario('latest stale score cannot fall back to older current score',async()=>{
    await pg.exec(`insert into market_scores values(2,'${pilotInstrument}','technical-score-asx-v1','2026-11-18T01:11:00Z',false)`);
    await blocked(/pilot source\/Technical admission changed/);
  });
  await scenario('wrong pilot audit instrument identity blocks batch',async()=>{
    await pg.query("update sync_runs set metadata=jsonb_set(metadata,'{instrument_id}',$1::jsonb) where id=$2",[JSON.stringify(uid(999)),pilotAudit]);
    await blocked(/query returned no rows/);
  });
  await scenario('duplicate pilot receipts fail closed',async()=>{
    await pg.exec(`insert into market_history_jobs(instrument_id,job_type,source_scope,source_key,symbol,years,status,sync_run_id)
      select instrument_id,job_type,source_scope,source_key,symbol,years,status,sync_run_id from market_history_jobs where id='${pilotJob}'`);
    await blocked(/query returned more than one row/);
  });
  await scenario('partial committed prefix does not allow another batch',async()=>{
    await execute();await pg.query('delete from market_history_jobs where source_key like $1 and instrument_id<>$2',[prefix+'%',uid(1)]);
    await blocked(/partial or conflicting prior recovery batch/);
  });
  for(const mutation of ["source_scope='active_universe'","job_type='initial_backfill'","years=5",
    "metadata=metadata-'expected_normalization_version'","metadata=metadata-'reason'",
    `source_key='${prefix}wrong-key'`,`instrument_id='${uid(2)}'`]){
    await scenario('conflicting committed batch '+mutation.split('=')[0]+' rejected without overwrite',async()=>{
      await execute();await pg.query(`update market_history_jobs set ${mutation} where source_key=$1`,[prefix+uid(1)]);
      await blocked(/partial or conflicting prior recovery batch/);
    });
  }
  await scenario('returned enqueue receipt must match the exact new job key',async()=>{
    await pg.exec(`create or replace function fixture_enqueue_fault() returns trigger language plpgsql as $$begin
      if new.source_key='${prefix+uid(13)}' then new.source_scope:='active_universe';end if;return new;end$$;
      create trigger fixture_enqueue_fault before insert on market_history_jobs for each row execute function fixture_enqueue_fault();`);
    await blocked(/enqueue reused an unexpected job/);
  });
  await scenario('final count guard atomically rejects a disappearing earlier batch row',async()=>{
    await pg.exec(`create or replace function fixture_enqueue_fault() returns trigger language plpgsql as $$begin
      if new.source_key='${prefix+uid(13)}' then delete from public.market_history_jobs where source_key='${prefix+uid(1)}';end if;return new;end$$;
      create trigger fixture_enqueue_fault after insert on market_history_jobs for each row execute function fixture_enqueue_fault();`);
    await blocked(/incomplete recovery batch/);
  });
  eq(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql),false,'public source contains no literal instrument or audit UUID');
  eq(/begin isolation level read committed/i.test(sql),true);eq(/pg_advisory_xact_lock/.test(sql),true);
  eq(sql.includes("hashtextextended('market-history-daily-cohorts-v1',0)"),true);
  eq(/lock table public\.market_history_jobs in share row exclusive mode/i.test(sql),true);
  eq(sql.indexOf('lock table public.market_history_jobs')<sql.indexOf('select count(*) into v_count'),true);
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions. Single-backend PGlite; native concurrency unverified.`);
  console.log(createHash('sha256').update(sql).digest('hex')+' '+path);
}finally{await pg.close();}
