// Actual recovery SQL and original enqueue definition in isolated PostgreSQL.
// Source admission is a controlled receipt stub; separately tested actual adapter.
// Only statement_timestamp() is replaced in memory for deterministic date tests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite(),path='scripts/recover-asx-missing-session.sql',sql=await readFile(path,'utf8');
const baseline=(await readFile('scripts/history-queue-baseline.sql','utf8')).replaceAll('\r\n','\n');
const instrument='00000000-0000-4000-a000-00000000000a',audit='00000000-0000-4000-a000-00000000000b';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const target='2026-11-17',key='asx-session-gap:'+target+':'+instrument,at='2026-11-18T03:00:00Z';
let scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(text,params=[])=>(await pg.query(text,params)).rows;
const jobs=()=>query('select * from market_history_jobs order by id');
const params=patch=>Promise.all(Object.entries(patch).map(([name,value])=>pg.query('select set_config($1,$2,false)',['trading.recovery_'+name,value])));
async function reset(){
  await pg.exec(baseline);
  await pg.exec(`drop trigger if exists fixture_enqueue_fault on market_history_jobs;
    truncate instruments,market_history_jobs,fixture_source;
    insert into instruments values('${instrument}','TEST','ASX','AUD','equity',true);
    insert into fixture_source values('${instrument}','{"status":"ready","terminal_audit_id":"${audit}","window_end":"${target}","observations":[]}');
    insert into market_history_jobs(id,instrument_id,job_type,source_scope,source_key,symbol,years,status,attempts,created_at,metadata)
      values('${uid(1)}','${instrument}','daily_incremental','active_universe','old-daily','TEST',1,'succeeded',1,'2026-11-17T14:15:00Z','{"unchanged":true}');`);
  for(const [n,status] of [[2,'running'],[3,'pending'],[4,'validation_failed']])await pg.query(`insert into market_history_jobs(id,instrument_id,job_type,source_scope,source_key,symbol,years,status,attempts,metadata)
    values($1,$2,'daily_incremental','manual',$3,'OTHER',1,$4,2,'{"other_instrument":true}')`,[uid(n),uid(100+n),'unrelated:'+n,status]);
  await params({instrument,symbol:'TEST',audit,target});
}
async function execute(clock=at){
  assert.match(clock,/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  try{return (await pg.exec(sql.replaceAll('statement_timestamp()',`'${clock}'::timestamptz`))).flatMap(r=>r.rows??[]).filter(r=>r.id);}
  catch(error){await pg.exec('rollback');throw error;}
}
async function blocked(pattern,clock=at){const before=await jobs();await assert.rejects(execute(clock),pattern);assertions++;eq(await jobs(),before);}
async function scenario(name,fn){await reset();try{await fn();scenarios++;console.log('PASS '+name);}catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,1600));}}
async function newJob(){await execute();return (await jobs()).find(j=>j.source_key===key);}
try{
  await pg.exec(`create schema market_history;create schema technical_engine;
    create table instruments(id uuid primary key,symbol text,exchange_code text,currency_code text,asset_type text,is_active boolean);
    create table market_history_jobs(id uuid primary key default gen_random_uuid(),instrument_id uuid,job_type text,
      source_scope text,source_key text,symbol text,years integer,status text,attempts integer default 0,max_attempts integer default 3,
      next_attempt_at timestamptz default clock_timestamp(),created_at timestamptz default clock_timestamp(),
      updated_at timestamptz default clock_timestamp(),started_at timestamptz,finished_at timestamptz,metadata jsonb default '{}');
    create table fixture_source(instrument_id uuid primary key,receipt jsonb);
    create function technical_engine.asx_source_snapshot_v1(uuid,timestamptz) returns jsonb language sql stable as
      $$select receipt from fixture_source where instrument_id=$1$$;`);
  await reset();eq((await query("select md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure)) hash"))[0].hash,
    '519b5c19fd5bbd92a838b7ef4cc99541');
  await scenario('exact single pending receipt leaves other instruments and old evidence unchanged',async()=>{
    const before=await jobs(),receipts=await execute(),after=await jobs();eq(receipts.length,1);eq(after.length,before.length+1);
    eq(after.filter(j=>before.some(b=>b.id===j.id)),before);const j=after.find(j=>j.source_key===key);
    eq(receipts[0].id,j.id);eq([j.instrument_id,j.symbol,j.job_type,j.source_scope,j.years,j.status,j.attempts],
      [instrument,'TEST','daily_incremental','manual',1,'pending',0]);
    eq(j.metadata,{reason:'reviewed_calendar_target_gap_provider_now_available',target_session:target});
  });
  for(const status of ['pending','running','succeeded','failed','mapping_required','validation_failed'])await scenario('existing '+status+' receipt is immutable and never retried by replay',async()=>{
    const j=await newJob();await pg.query("update market_history_jobs set status=$1,attempts=3,next_attempt_at='2099-01-01',finished_at='2026-11-18T03:00Z' where id=$2",[status,j.id]);
    const before=await jobs(),receipt=await execute();eq(await jobs(),before);eq(receipt.length,1);eq(receipt[0].id,j.id);eq(receipt[0].status,status);
  });
  for(const [field,value] of [['symbol','OTHER'],['exchange_code','NYSE'],['currency_code','USD'],['asset_type','fund'],['is_active',false]])await scenario('changed '+field+' identity blocks',async()=>{
    await pg.query(`update instruments set ${field}=$1 where id=$2`,[value,instrument]);await blocked(/identity changed/);
  });
  await scenario('missing identity blocks',async()=>{await pg.exec('truncate instruments');await blocked(/identity changed/);});
  for(const status of ['pending','running'])await scenario('existing '+status+' work on chosen instrument blocks',async()=>{
    await pg.query('update market_history_jobs set status=$1 where id=$2',[status,uid(1)]);await blocked(/active work/);
  });
  for(const status of ['mapping_required','validation_failed','failed'])await scenario('latest '+status+' hold blocks',async()=>{
    await pg.query('update market_history_jobs set status=$1 where id=$2',[status,uid(1)]);await blocked(/latest job not successful/);
  });
  await scenario('no previous successful job blocks',async()=>{await pg.query('delete from market_history_jobs where id=$1',[uid(1)]);await blocked(/latest job not successful/);});
  for(const [field,value] of [['status','blocked'],['terminal_audit_id',uid(99)],['window_end','2026-11-16']])await scenario('source '+field+' change blocks',async()=>{
    await pg.query('update fixture_source set receipt=jsonb_set(receipt,$1::text[],$2::jsonb)',[[field],JSON.stringify(value)]);await blocked(/source identity\/quality\/request end changed/);
  });
  await scenario('missing source blocks',async()=>{await pg.exec('truncate fixture_source');await blocked(/source identity\/quality\/request end changed/);});
  await scenario('already present target blocks duplicate recovery',async()=>{
    await pg.query("update fixture_source set receipt=jsonb_set(receipt,'{observations}',$1::jsonb)",[JSON.stringify([{observed_at:target+'T00:00:00Z'}])]);await blocked(/target already present/);
  });
  for(const date of ['2026-11-16','2026-11-18','2026-11-19'])await scenario('non-yesterday target '+date+' blocks',async()=>{
    await params({target:date});await blocked(/target no longer yesterday/);
  });
  await scenario('Sydney rollover invalidates earlier reviewed target',async()=>{await blocked(/target no longer yesterday/,'2026-11-18T13:00:00Z');});
  await scenario('just before Sydney midnight still accepts yesterday target',async()=>{eq((await execute('2026-11-18T12:59:59.999999Z')).length,1);});
  for(const name of ['instrument','audit'])await scenario('invalid '+name+' parameter fails closed',async()=>{await params({[name]:'not-a-uuid'});await blocked(/invalid input syntax for type uuid/);});
  await scenario('invalid target date fails closed',async()=>{await params({target:'2026-02-30'});await blocked(/date\/time field value out of range/);});
  await scenario('enqueue definition drift blocks',async()=>{
    await pg.exec('alter function market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb) set search_path to public');await blocked(/enqueue function changed/);
  });
  await scenario('uppercase UUID parameters still return the canonical inserted receipt',async()=>{
    await params({instrument:instrument.toUpperCase(),audit:audit.toUpperCase()});const receipts=await execute();eq(receipts.length,1);
    eq((await jobs()).filter(j=>j.source_key===key).length,1);
  });
  await scenario('equivalent target date encoding still returns canonical receipt',async()=>{
    await params({target:target+' 00:00:00'});eq((await execute()).length,1);eq((await jobs()).filter(j=>j.source_key===key).length,1);
  });
  for(const mutation of [`instrument_id='${uid(99)}'`,"symbol='OTHER'","job_type='initial_backfill'","years=5",
    "metadata=metadata-'reason'","metadata=metadata-'target_session'","source_scope='active_universe'"]){
    await scenario('conflicting key '+mutation.split('=')[0]+' is not accepted as idempotent',async()=>{
      const j=await newJob();await pg.query(`update market_history_jobs set ${mutation} where id=$1`,[j.id]);await blocked(/conflict/);
    });
  }
  await scenario('duplicate exact recovery keys fail closed',async()=>{
    const j=await newJob();await pg.query(`insert into market_history_jobs(instrument_id,job_type,source_scope,source_key,symbol,years,status,metadata)
      select instrument_id,job_type,source_scope,source_key,symbol,years,status,metadata from market_history_jobs where id=$1`,[j.id]);await blocked(/conflict/);
  });
  await scenario('post-enqueue receipt mismatch atomically rolls back',async()=>{
    await pg.exec(`create function fixture_enqueue_fault() returns trigger language plpgsql as $$begin
      if new.source_key='${key}' then new.symbol:='MISMATCH';end if;return new;end$$;
      create trigger fixture_enqueue_fault before insert on market_history_jobs for each row execute function fixture_enqueue_fault();`);
    await blocked(/exact pending receipt missing/);
  });
  eq(/begin isolation level read committed/i.test(sql),true);
  eq(sql.indexOf('pg_advisory_xact_lock')<sql.indexOf('lock table'),true);
  eq(sql.indexOf('lock table')<sql.indexOf('do $$'),true);
  eq(/lock table public\.market_history_jobs in share row exclusive mode/i.test(sql),true);
  eq(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql),false);
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual enqueue, controlled source receipts, native concurrency unverified.`);
  console.log(createHash('sha256').update(sql).digest('hex')+' '+path);
}finally{await pg.close();}
