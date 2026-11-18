// Isolated PostgreSQL alert/monitor tests. Actual old lifecycle/evaluator/core,
// actual new SQL and actual convergence calculator. Admission receipts are
// controlled stubs; the real admission chain is independently tested elsewhere.
// Clock calls alone are rebound to a synthetic session setting. No hosted calls.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),path='supabase/migrations/20261118054201_integrate_asx_alerts_and_monitoring.sql';
const sql=await readFile(path,'utf8');
const rawFunction=name=>{const start=sql.search(new RegExp('create(?: or replace)? function '+name.replaceAll('.','\\.')+'\\('));assert(start>=0,name);return sql.slice(start,sql.indexOf('end $$;',start)+7).replace(/^create function/,'create or replace function');};
const functionDefinition=(source,name)=>{const start=source.search(new RegExp('create(?: or replace)? function '+name.replaceAll('.','\\.')+'\\(','i'));assert(start>=0,name);const rest=source.slice(start);const tag=rest.match(/\bas\s+(\$[^$]*\$)/i);assert(tag,name+' body delimiter');const end=tag.index+tag[0].length;return rest.slice(0,rest.indexOf(tag[1],end)+tag[1].length)+';';};
const clock=s=>s.replaceAll('clock_timestamp()','public.fixture_now()').replaceAll('statement_timestamp()','public.fixture_now()');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const asx=id(1),asx2=id(2),us=id(3),owner=id(900),otherOwner=id(901),watch=id(800),rule=id(1000);
const now='2026-11-18T06:00:00Z';let scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(s,p=[])=>(await db.query(s,p)).rows;
const time=t=>db.query("select set_config('fixture.now',$1,true)",[t]);
const events=()=>query('select * from alert_events order by id');
const states=()=>query('select * from alert_evaluation_state order by alert_id,instrument_id');
const queue=()=>query('select * from private.asx_convergence_alert_queue order by assessment_id');
const dispatch=async(t=now)=>(await query('select private.dispatch_asx_convergence_alerts_v1($1::timestamptz) n',[t]))[0].n;
const health=async(t=now)=>{await time(t);return (await query('select private.asx_convergence_health_v1($1::timestamptz) s',[t]))[0].s;};
const rejected=async(fn,pattern)=>{await db.exec('savepoint expected');try{await assert.rejects(fn,pattern);assertions++;}finally{await db.exec('rollback to expected;release expected');}};
async function check(name,fn){await db.exec('begin');await time(now);try{await fn();scenarios++;console.log('PASS '+name);}catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,1800));}finally{await db.exec('rollback');}}
async function addRule(n=1000,{instrument=asx,watchlist=null,who=owner,enabled=true,condition={condition_version:'alert-trigger-v1',metric:'convergence_score',operator:'crosses_above',threshold:50},type='market_convergence'}={}){
  await db.query(`insert into alerts(id,owner_user_id,instrument_id,watchlist_id,name,alert_type,condition,is_enabled)
    values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,[id(n),who,watchlist?null:instrument,watchlist,'Owner-private rule '+n,type,JSON.stringify(condition),enabled]);return id(n);
}
const envelope=i=>({readiness:'READY',methodology_version:'market-convergence-asx-v1',instrument_id:i,target_session:'2026-11-17',
  technical:{id:i===asx?101:102,overall_score:70,confidence_score:90,score_date:'2026-11-17'},
  ai:{assessment_id:i===asx?id(301):id(302),score:80,confidence:80,rating:'Buy',assessment_date:'2026-11-17'}});
async function addResult(n,{instrument=asx,value=60.25,method='market-convergence-asx-v1',date='2026-11-17',stamp='2026-11-18T06:01:00Z',terminal=true,insertTerminal=false,current=false}={}){
  await time(stamp);const e=(await query('select market_convergence.prepare_asx_v1($1,$2::timestamptz) e',[instrument,stamp]))[0].e;
  const calc=(await query('select market_convergence.calculate_asx_v1($1::jsonb) c',[JSON.stringify(e)]))[0].c;
  await db.query(`insert into market_convergence_assessments(id,instrument_id,assessment_date,technical_score_id,ai_assessment_id,
    technical_source_date,ai_source_date,convergence_score,convergence_confidence,convergence_label,methodology_version,created_at,updated_at)
    values($1,$2,$3,$4,$5,'2026-11-17','2026-11-17',$6,$7,$8,$9,$10,$10)`,
    [id(n),instrument,date,e.technical?.id??101,e.ai?.assessment_id??id(301),current?calc.convergence_score:value,calc.convergence_confidence,
      current?calc.convergence_label:(value>50?'strong_bullish':'neutral'),method,stamp]);
  if(method==='market-convergence-asx-v1'){
    await db.query(`insert into market_convergence.asx_runs_v1(id,instrument_id,logical_date,cutoff_at,status,assessment_id,input_envelope,started_at,finished_at)
      values($1,$2,'2026-11-17',$3,$4,$5,$6::jsonb,$3,$7)`,[id(n+10000),instrument,stamp,insertTerminal?'succeeded':'running',id(n),JSON.stringify(e),insertTerminal?stamp:null]);
    if(terminal&&!insertTerminal)await db.query("update market_convergence.asx_runs_v1 set status='succeeded',finished_at=$1 where id=$2",[stamp,id(n+10000)]);
  }
  return id(n);
}
async function baselineRule(options={}){await addRule(1000,options);eq((await events()).length,0);}
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema private;create schema cron;create schema market_convergence;
    create function public.fixture_now() returns timestamptz language sql stable as $$select current_setting('fixture.now')::timestamptz$$;
    select set_config('fixture.now','${now}',false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text);
    create function cron.unschedule(bigint) returns boolean language sql as $$delete from cron.job where jobid=$1 returning true$$;
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
    create table instruments(id uuid primary key,symbol text,is_active boolean,exchange_code text,asset_type text,currency_code text,created_at timestamptz default now());
    create table watchlists(id uuid primary key,owner_user_id uuid);
    alter table watchlists enable row level security;
    create policy fixture_watchlist_owner on watchlists for select to authenticated using(owner_user_id=auth.uid());
    grant select on watchlists to authenticated;
    create table watchlist_items(watchlist_id uuid,instrument_id uuid,added_at timestamptz default public.fixture_now(),primary key(watchlist_id,instrument_id));
    create table opportunity_themes(id uuid primary key);
    create table alerts(id uuid primary key default gen_random_uuid(),owner_user_id uuid,instrument_id uuid,watchlist_id uuid,name text,alert_type text,
      condition jsonb,is_enabled boolean default true,last_triggered_at timestamptz,created_at timestamptz default public.fixture_now());
    create table alert_events(id bigint generated always as identity primary key,alert_id uuid,instrument_id uuid,triggered_at timestamptz,
      trigger_value numeric,message text,notification_status text,metadata jsonb);
    create table market_observations(id bigint generated always as identity primary key,instrument_id uuid,interval_code text,observed_at timestamptz,loaded_at timestamptz,close numeric,currency_code text);
    create table market_scores(id bigint,instrument_id uuid,score_date date,calculated_at timestamptz,score_status text,overall_score numeric,
      momentum_score numeric,trend_score numeric,volatility_score numeric,volume_score numeric,confidence_score numeric,methodology_version text);
    create table gpt_market_runs(run_id uuid primary key,status text,completed_at timestamptz,analysis_mode text,analysis_cutoff_time timestamptz);
    create table gpt_market_assessments(assessment_id uuid primary key,instrument_id uuid,run_id uuid,assessment_date date,created_at timestamptz,
      technical_engine_input_used boolean,rating text,score numeric,confidence numeric,methodology_version text);
    create table opportunity_assessment_runs(run_id uuid primary key,status text,assessment_date date,started_at timestamptz,completed_at timestamptz,themes_completed int,themes_requested int);
    create table opportunity_assessments(id uuid,theme_id uuid,assessment_date date,updated_at timestamptz,opportunity_level text,
      opportunity_score numeric,commercial_readiness text,opportunity_confidence numeric,methodology_version text);
    create table technical_engine_runs(id uuid primary key,status text);
    create table market_convergence_runs(id uuid primary key,status text,instrument_id uuid);
    create table market_convergence_assessments(id uuid primary key,instrument_id uuid,assessment_date date,technical_score_id bigint,ai_assessment_id uuid,
      technical_source_date date,ai_source_date date,convergence_score numeric,convergence_confidence numeric,convergence_label text,methodology_version text,
      created_at timestamptz,updated_at timestamptz);
    create table market_convergence.asx_runs_v1(id uuid primary key,instrument_id uuid,logical_date date,cutoff_at timestamptz,status text,
      assessment_id uuid,input_envelope jsonb,started_at timestamptz,finished_at timestamptz,retry_of_run_id uuid);
    create table market_convergence.asx_calendars_v1(revision text,verified_at timestamptz,valid_until timestamptz);
    create table fixture_admission(instrument_id uuid primary key,receipt jsonb);
    create function market_convergence.prepare_asx_v1(uuid,timestamptz) returns jsonb language sql stable as
      $$select receipt||jsonb_build_object('cutoff_at',$2,'logical_date',($2 at time zone 'America/New_York')::date) from public.fixture_admission where instrument_id=$1$$;
    create table private.shared_market_calendars(id uuid,exchange_code text,verified_at timestamptz,valid_until timestamptz,coverage_start timestamptz,coverage_end timestamptz,days jsonb);
    create table opinion_reviews(id uuid,review_date date,triggered_by text,started_at timestamptz,completed_at timestamptz,status text);
    create table shared_decision_calls(id uuid primary key,instrument_id uuid,published_at timestamptz);
    create table shared_decision_outcomes(call_id uuid,kind text);
    create table shared_decision_reviews(id uuid,published_at timestamptz);
    create table shared_decision_private_notes(note text);
    insert into shared_decision_private_notes values('private-user-note-sentinel');
    create table private.shared_decision_config(instrument_id uuid,enabled boolean);
    create table private.shared_decision_assessment_usage(assessment_id uuid,call_id uuid,event_id uuid);
    create table private.shared_evaluation_run_items(call_id uuid,status text,run_id uuid);
    create table private.shared_evaluation_runs(id uuid,origin text,completed_at timestamptz,started_at timestamptz,spec_revision text);
    create table private.shared_evaluator_release(accepted_revision text,enabled boolean);
    create function private.shared_decision_input_v1(uuid) returns jsonb language plpgsql as $$begin raise exception 'FIXTURE_UNEXPECTED_PUBLICATION_INPUT';end$$;
    insert into instruments(id,symbol,is_active,exchange_code,asset_type,currency_code) values('${asx}','ASX_ONE',true,'ASX','equity','AUD'),('${asx2}','ASX_TWO',true,'ASX','equity','AUD'),('${us}','US_ONE',true,'NYSE','equity','USD');
    insert into watchlists values('${watch}','${owner}');
    insert into watchlist_items values('${watch}','${asx}','2026-11-01Z'),('${watch}','${asx2}','2026-11-01Z'),('${watch}','${us}','2026-11-01Z');
    insert into market_convergence.asx_calendars_v1 values('fixture-review','2026-11-18T02:34:21Z','2026-11-25T02:34:21Z');`);
  for(const i of [asx,asx2,us])await db.query('insert into fixture_admission values($1,$2::jsonb)',[i,JSON.stringify(envelope(i))]);
  const adapter=await readFile('supabase/migrations/20261118033709_add_asx_convergence_adapter_v1.sql','utf8');
  const calculateStart=adapter.indexOf('create function market_convergence.calculate_asx_v1');
  await db.exec(adapter.slice(calculateStart,adapter.indexOf('end $$;',calculateStart)+7));
  await db.exec(clock(await readFile('supabase/migrations/20260824122500_implement_alert_lifecycle_v1.sql','utf8')));
  await db.exec(clock(await readFile('supabase/migrations/20260824124500_fix_alert_evaluator_event_key_ambiguity.sql','utf8')));
  await db.exec(await readFile('supabase/migrations/20260824125200_harden_alert_internal_tables_and_indexes.sql','utf8'));
  await db.exec(clock(await readFile('scripts/trading-pipeline-monitor.sql','utf8')));
  const restoredSignatures=['alerting.evaluate_one_v1(uuid,timestamptz)','private.trading_pipeline_snapshot_v1(timestamptz)','private.run_trading_watchdog_v1()', 'alerting.run_v1(text,text,uuid,uuid,uuid,timestamptz)'];
  const definitions=async()=>query(`select p.oid::regprocedure::text signature,p.prosecdef,p.provolatile,p.proconfig,p.proacl from pg_proc p where p.oid=any($1::regprocedure[]) order by 1`,[restoredSignatures]);
  const baselineDefinitions=await definitions();
  const oldCore=(await query("select pg_get_functiondef('private.trading_pipeline_snapshot_v1(timestamptz)'::regprocedure) d"))[0].d;
  await db.exec(oldCore.replace('private.trading_pipeline_snapshot_v1','private.fixture_original_core_snapshot'));
  await addResult(600,{value:40,date:'2026-11-16',stamp:'2026-11-18T05:00:00Z',insertTerminal:true});
  const cronBefore=await query('select * from cron.job order by jobid');await time(now);await db.exec(clock(sql));
  await check('installation baselines existing result without replay and changes no cron schedules',async()=>{
    eq(await query('select * from cron.job order by jobid'),cronBefore);const q=(await queue())[0];eq(q.assessment_id,id(600));eq(q.state,'baseline_no_replay');eq(q.attempts,0);
    await baselineRule();eq(await dispatch(),0);eq(await events(),[]);
  });
  await check('scoped queue crossing emits one decimal event and replay is harmless',async()=>{
    await baselineRule();const result=await addResult(601);eq((await queue()).find(q=>q.assessment_id===result).state,'pending');
    eq(await dispatch('2026-11-18T06:01:00Z'),1);const ev=await events();eq(ev.length,1);eq(Number(ev[0].trigger_value),60.25);
    eq(ev[0].instrument_id,asx);eq(ev[0].metadata.source_row_id,result);eq(ev[0].notification_status,'not_requested');
    const before=await states();eq(await dispatch('2026-11-18T06:02:00Z'),0);eq(await events(),ev);eq(await states(),before);
  });
  await check('mixed watchlist processes only queued ASX instrument and pins its exact result',async()=>{
    await addResult(610,{instrument:asx2,value:40,stamp:'2026-11-18T05:00Z',insertTerminal:true});
    await addResult(611,{instrument:us,value:40,method:'market-convergence-v1',stamp:'2026-11-18T05:00Z'});
    await time(now);await baselineRule({watchlist:watch});const before=await states();
    await addResult(612,{instrument:asx2,value:80,stamp:'2026-11-18T06:01Z',terminal:false});
    await addResult(613,{instrument:us,value:80,method:'market-convergence-v1',stamp:'2026-11-18T06:01Z'});
    await addResult(614,{value:70,stamp:'2026-11-18T06:01Z'});await dispatch('2026-11-18T06:02Z');
    eq((await events()).map(e=>e.instrument_id),[asx]);eq((await states()).filter(s=>s.instrument_id!==asx),before.filter(s=>s.instrument_id!==asx));
  });
  await check('first result is baseline only, including already-true condition',async()=>{
    await baselineRule({instrument:asx2});await addResult(620,{instrument:asx2,value:80});await dispatch('2026-11-18T06:01Z');
    eq(await events(),[]);eq((await states())[0].condition_true,true);
  });
  await check('methodology switch never creates a cross-method event',async()=>{
    await baselineRule();await db.query("update alert_evaluation_state set last_source_key=$1,last_value='{\"value\":10}',condition_true=false",[id(630)]);
    await addResult(630,{value:10,method:'market-convergence-v1',date:'2026-11-16',stamp:'2026-11-18T05:00Z'});
    const fresh=await addResult(631,{value:80});await dispatch('2026-11-18T06:01Z');eq(await events(),[]);eq((await states())[0].last_source_key,fresh);
  });
  await check('success trigger is idempotent per assessment, even another successful run links it',async()=>{
    const assessment=await addResult(640);await db.query(`insert into market_convergence.asx_runs_v1 select $1,instrument_id,logical_date,cutoff_at,'running',assessment_id,input_envelope,started_at,null,null from market_convergence.asx_runs_v1 where assessment_id=$2`,[id(10641),assessment]);
    await db.query("update market_convergence.asx_runs_v1 set status='succeeded',finished_at='2026-11-18T06:02Z' where id=$1",[id(10641)]);
    eq((await queue()).filter(q=>q.assessment_id===assessment).length,1);
  });
  await check('superseded queued result is explicitly skipped; no rules is explicit completion',async()=>{
    const old=await addResult(650,{date:'2026-11-16',stamp:'2026-11-18T06:01Z'}),latest=await addResult(651,{date:'2026-11-17',stamp:'2026-11-18T06:02Z'});
    await dispatch('2026-11-18T06:02Z');const rows=await queue();eq(rows.find(q=>q.assessment_id===old).state,'superseded');eq(rows.find(q=>q.assessment_id===old).attempts,0);
    eq(rows.find(q=>q.assessment_id===latest).state,'no_rules');eq(await events(),[]);
  });
  await check('result predating changed rule cannot replay a crossing',async()=>{
    await baselineRule();await addResult(660,{stamp:'2026-11-18T06:01Z'});await time('2026-11-18T06:02Z');
    await db.exec("update alerts set condition=jsonb_set(condition,'{threshold}','55')");await dispatch('2026-11-18T06:03Z');eq(await events(),[]);
  });
  await check('membership added after result cannot consume old crossing',async()=>{
    await db.query('delete from watchlist_items where instrument_id=$1',[asx]);await baselineRule({watchlist:watch});
    await addResult(670,{stamp:'2026-11-18T06:01Z'});await time('2026-11-18T06:02Z');await db.query('insert into watchlist_items values($1,$2,$3)',[watch,asx,'2026-11-18T06:02Z']);
    const before=await states();await dispatch('2026-11-18T06:03Z');eq(await events(),[]);eq(await states(),before);
  });
  await check('disabled and removed watchlist rules create no events',async()=>{
    await baselineRule({watchlist:watch});await addResult(680);await db.query('delete from watchlist_items where instrument_id=$1',[asx]);
    await dispatch('2026-11-18T06:01Z');eq(await events(),[]);eq((await queue()).find(q=>q.assessment_id===id(680)).state,'no_rules');
  });
  await check('partial evaluator failure rolls back all rules and states; bounded retry succeeds exactly once',async()=>{
    await baselineRule();await addRule(1001);const before=await states();await addResult(690);
    await db.exec(`create function public.fixture_event_failure() returns trigger language plpgsql as $$begin if new.alert_id='${id(1001)}' then raise exception 'private failure detail';end if;return new;end$$;
      create trigger fixture_event_failure before insert on alert_events for each row execute function public.fixture_event_failure();`);
    await dispatch('2026-11-18T06:01Z');eq(await events(),[]);eq(await states(),before);let q=(await queue()).find(q=>q.assessment_id===id(690));eq(q.state,'failed');eq(q.attempts,1);eq(q.reason_code,'ASX_ALERT_EVALUATION_FAILED');
    eq(JSON.stringify(await query('select * from alert_evaluator_runs')).includes('private failure detail'),false);
    eq(await dispatch('2026-11-18T06:15:59.999999Z'),0);await db.exec('drop trigger fixture_event_failure on alert_events');
    await dispatch('2026-11-18T06:16Z');eq((await events()).length,2);q=(await queue()).find(q=>q.assessment_id===id(690));eq(q.state,'evaluated');eq(q.attempts,2);eq(q.alert_run_ids.length,2);
  });
  await check('51 rules fail without partial writes and exhaust after three spaced attempts',async()=>{
    for(let n=1000;n<1051;n++)await addRule(n);await addResult(700);const before=await states();
    for(const stamp of ['2026-11-18T06:01Z','2026-11-18T06:16Z','2026-11-18T06:31Z'])await dispatch(stamp);
    const q=(await queue()).find(q=>q.assessment_id===id(700));eq(q.state,'exhausted');eq(q.attempts,3);eq(q.reason_code,'ASX_ALERT_RULE_LIMIT');eq(q.alert_run_ids.length,3);
    eq(await events(),[]);eq(await states(),before);eq(await dispatch('2026-11-18T08:00Z'),0);
  });
  await check('dispatch processes at most ten queue rows per call',async()=>{
    for(let n=10;n<21;n++){
      await db.query("insert into instruments(id,symbol,is_active,exchange_code,asset_type,currency_code) values($1,$2,true,'ASX','equity','AUD')",[id(n),'BOUND'+n]);
      await db.query('insert into fixture_admission values($1,$2::jsonb)',[id(n),JSON.stringify(envelope(id(n)))]);
      await addResult(800+n,{instrument:id(n)});
    }
    eq(await dispatch('2026-11-18T06:02Z'),10);eq((await queue()).filter(q=>q.state==='pending').length,1);eq(await dispatch('2026-11-18T06:03Z'),1);
  });
  await check('new ASX health is read-only and missing current convergence never reports CURRENT',async()=>{
    await db.exec('set transaction read only');const h=await health();eq(h.state,'ATTENTION');eq(h.counts.ready,2);eq(h.counts.current,0);
    eq(h.alerts.externalDelivery,'NOT_CONFIGURED_OR_VERIFIED');eq(JSON.stringify(h).includes('Owner-private'),false);
  });
  await check('current health verifies matching terminal receipts, public lineage and payload',async()=>{
    await addResult(901,{instrument:asx,current:true,stamp:'2026-11-18T05:59Z'});await addResult(902,{instrument:asx2,current:true,stamp:'2026-11-18T05:59Z'});
    await dispatch();const h=await health();eq(h.state,'CURRENT');eq(h.counts.current,2);
    await db.exec('update market_convergence_assessments set convergence_score=1 where id=\''+id(901)+'\'');eq((await health()).state,'ATTENTION');
  });
  await check('missing calendar with empty inventory is never all-good',async()=>{
    await db.exec('update instruments set is_active=false;truncate market_convergence.asx_calendars_v1');const h=await health();eq(h.state==='CURRENT',false);eq(h.calendarExpiring,true);
  });
  await check('old core morning state/counts/problems remain byte-for-byte unchanged',async()=>{
    const old=(await query('select private.fixture_original_core_snapshot($1::timestamptz) s',[now]))[0].s;
    await query('select private.reconcile_asx_convergence_health_v1($1::timestamptz,false)',[now]);
    const current=(await query('select private.trading_pipeline_snapshot_v1($1::timestamptz) s',[now]))[0].s;
    const {asxMonitoringVersion,asxConvergence,...core}=current;eq(core,old);eq(asxMonitoringVersion,1);eq(asxConvergence.state,'ATTENTION');
  });
  await check('fifty rules are supported and each creates at most one event',async()=>{
    for(let n=1000;n<1050;n++)await addRule(n);await addResult(950);
    await dispatch('2026-11-18T06:01Z');eq((await events()).length,50);
    eq((await queue()).find(q=>q.assessment_id===id(950)).state,'evaluated');
    eq(await dispatch('2026-11-18T06:02Z'),0);eq((await events()).length,50);
  });
  await check('a busy rule defers without consuming attempts or leaving partial events',async()=>{
    await baselineRule();await addRule(1001);const before=await states();await addResult(949);
    await db.exec(`create function public.fixture_lock_busy() returns trigger language plpgsql as $$begin if new.alert_id='${id(1001)}' then raise exception using errcode='55P03',message='synthetic lock contention';end if;return new;end$$;
      create trigger fixture_lock_busy before insert on alert_events for each row execute function public.fixture_lock_busy();`);
    for(const stamp of ['2026-11-18T06:01Z','2026-11-18T06:16Z','2026-11-18T06:31Z','2026-11-18T06:46Z'])await dispatch(stamp);
    eq(await events(),[]);eq(await states(),before);let q=(await queue()).find(q=>q.assessment_id===id(949));
    eq(q.reason_code,'ASX_ALERT_LOCK_BUSY');eq(q.attempts,0);eq(q.alert_run_ids,[]);eq(q.state==='exhausted',false);
    eq(await dispatch('2026-11-18T07:00:59.999999Z'),0);await db.exec('drop trigger fixture_lock_busy on alert_events');
    await dispatch('2026-11-18T07:01Z');eq((await events()).length,2);q=(await queue()).find(q=>q.assessment_id===id(949));eq(q.state,'evaluated');eq(q.attempts,1);
  });
  await check('scoped helper refuses nonterminal, future and wrong-method ASX sources',async()=>{
    await baselineRule();const before=await states();await addResult(951,{terminal:false});
    eq((await query('select alerting.evaluate_one_scoped_v1($1,$2,$3,$4) n',[rule,'2026-11-18T06:02Z',asx,id(951)]))[0].n,0);eq(await states(),before);
    await addResult(952,{stamp:'2026-11-18T07:00Z'});
    eq((await query('select alerting.evaluate_one_scoped_v1($1,$2,$3,$4) n',[rule,'2026-11-18T06:02Z',asx,id(952)]))[0].n,0);eq(await states(),before);
    await addResult(953,{method:'market-convergence-v1'});
    eq((await query('select alerting.evaluate_one_scoped_v1($1,$2,$3,$4) n',[rule,'2026-11-18T06:02Z',asx,id(953)]))[0].n,0);eq(await states(),before);eq(await events(),[]);
  });
  await check('older pinned assessment cannot rewind a newer baseline',async()=>{
    await baselineRule();await addResult(954,{date:'2026-11-17'});await dispatch('2026-11-18T06:01Z');
    const before=await states();const ev=await events();
    eq((await query('select alerting.evaluate_one_scoped_v1($1,$2,$3,$4) n',[rule,'2026-11-18T06:02Z',asx,id(600)]))[0].n,0);
    eq(await states(),before);eq(await events(),ev);
  });
  await check('non-ASX original two-argument evaluator still crosses on its own method',async()=>{
    await addResult(955,{instrument:us,method:'market-convergence-v1',value:40,stamp:'2026-11-18T05:00Z'});await time(now);await baselineRule({instrument:us});
    await addResult(956,{instrument:us,method:'market-convergence-v1',value:60.5});
    eq((await query('select alerting.evaluate_one_v1($1,$2) n',[rule,'2026-11-18T06:01Z']))[0].n,1);
    eq((await events())[0].instrument_id,us);eq(Number((await events())[0].trigger_value),60.5);
  });
  await check('queue, receipt and helper privileges remain inaccessible to client and service roles',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      for(const relation of ['private.asx_convergence_alert_queue','private.asx_convergence_monitor_state']){
        eq((await query('select has_table_privilege($1,$2,\'SELECT\') b',[role,relation]))[0].b,false);
        eq((await query('select has_table_privilege($1,$2,\'UPDATE\') b',[role,relation]))[0].b,false);
      }
      for(const fn of ['private.dispatch_asx_convergence_alerts_v1(timestamptz)','private.asx_convergence_health_v1(timestamptz)',
        'alerting.evaluate_one_scoped_v1(uuid,timestamptz,uuid,uuid)','private.run_trading_watchdog_v1()']){
        eq((await query('select has_function_privilege($1,$2,\'EXECUTE\') b',[role,fn]))[0].b,false);
      }
      await db.exec('set local role '+role);await rejected(()=>query('select private.dispatch_asx_convergence_alerts_v1(now())'),/permission denied/);await db.exec('reset role');
    }
  });
  await check('alert events remain owner-scoped with actual authenticated RLS',async()=>{
    await baselineRule();await addRule(1001,{who:otherOwner});await addResult(957);await dispatch('2026-11-18T06:01Z');eq((await events()).length,2);
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims','{\"is_anonymous\":false}',true)",[owner]);
    await db.exec('set local role authenticated');const ownEvents=await query('select alert_id,metadata from alert_events');eq(ownEvents.length,1);eq(ownEvents[0].alert_id,rule);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[otherOwner]);eq((await query('select alert_id from alert_events'))[0].alert_id,id(1001));
    await db.query("select set_config('request.jwt.claims','{\"is_anonymous\":true}',true)");eq(await query('select alert_id from alert_events'),[]);
    await rejected(()=>query('select public.trading_pipeline_status_v1()'),/Permanent sign-in required/);await db.exec('reset role');
  });
  await check('failed and running convergence remain visible, never current from historical success',async()=>{
    await addResult(958,{instrument:asx,current:true,terminal:false,stamp:'2026-11-18T05:59Z'});
    await addResult(959,{instrument:asx2,current:true,terminal:false,stamp:'2026-11-18T05:59Z'});
    await db.query("update market_convergence.asx_runs_v1 set status='failed',finished_at=$1 where assessment_id=$2",[now,id(959)]);
    const h=await health();eq(h.state,'ATTENTION');eq(h.counts.running,1);eq(h.counts.failed,1);eq(h.counts.current,0);
  });
  await check('blocked admission, expired calendar and pending alerts cannot claim CURRENT',async()=>{
    await addResult(960,{instrument:asx,current:true,stamp:'2026-11-18T05:59Z'});await addResult(961,{instrument:asx2,current:true,stamp:'2026-11-18T05:59Z'});
    eq((await health()).state,'ATTENTION');eq((await health()).alerts.pending,2);await dispatch();eq((await health()).state,'CURRENT');
    await db.query("update fixture_admission set receipt=jsonb_set(receipt,'{readiness}','\"SOURCE_BLOCKED\"') where instrument_id=$1",[asx]);
    let h=await health();eq(h.state,'ATTENTION');eq(h.reasons.SOURCE_BLOCKED,1);
    await db.query('update fixture_admission set receipt=$1::jsonb where instrument_id=$2',[JSON.stringify(envelope(asx)),asx]);
    await db.exec("update market_convergence.asx_calendars_v1 set valid_until='2026-11-18T05:59Z'");h=await health();eq(h.state,'ATTENTION');eq(h.calendarExpiring,true);
  });
  await check('incidents persist outside the due window and resolve only with current evidence',async()=>{
    await query('select private.reconcile_asx_convergence_health_v1($1,false)',[now]);let s=(await query('select snapshot from private.asx_convergence_monitor_state'))[0].snapshot;
    eq(s.state,'ATTENTION');const opened=s.incidentOpenedAt;eq(opened!=null,true);eq(s.incidentResolvedAt,null);
    await time('2026-11-18T14:00Z');await query('select private.reconcile_asx_convergence_health_v1($1,false)',['2026-11-18T14:00Z']);
    s=(await query('select snapshot from private.asx_convergence_monitor_state'))[0].snapshot;eq(s.state,'DEFERRED');eq(s.incidentOpenedAt,opened);eq(s.incidentResolvedAt,null);
    await addResult(962,{instrument:asx,current:true,stamp:'2026-11-18T06:01Z'});await addResult(963,{instrument:asx2,current:true,stamp:'2026-11-18T06:01Z'});await dispatch('2026-11-18T06:01Z');
    await query('select private.reconcile_asx_convergence_health_v1($1,false)',['2026-11-18T06:01Z']);s=(await query('select snapshot from private.asx_convergence_monitor_state'))[0].snapshot;
    eq(s.state,'CURRENT');eq(s.incidentOpenedAt,opened);eq(s.incidentResolvedAt!=null,true);
  });
  await check('unexpected health and dispatch failures produce sanitized UNVERIFIED evidence',async()=>{
    await db.exec(`create or replace function market_convergence.prepare_asx_v1(uuid,timestamptz) returns jsonb language plpgsql stable as $$begin raise exception 'private-user-note-sentinel';end$$;`);
    await query('select private.reconcile_asx_convergence_health_v1($1,false)',[now]);let s=(await query('select snapshot from private.asx_convergence_monitor_state'))[0].snapshot;
    eq(s.state,'UNVERIFIED');eq(s.reason,'ASX_MONITOR_FAILED');eq(JSON.stringify(s).includes('private-user-note-sentinel'),false);eq(s.incidentOpenedAt!=null,true);
    await query('select private.reconcile_asx_convergence_health_v1($1,true)',[now]);s=(await query('select snapshot from private.asx_convergence_monitor_state'))[0].snapshot;eq(s.reason,'ASX_ALERT_DISPATCH_FAILED');
  });
  await check('health due and calendar-warning boundaries are exact',async()=>{
    eq((await health('2026-11-18T02:14:59.999999Z')).state,'NOT_DUE');
    eq((await health('2026-11-18T02:15:00Z')).dispatchDue,true);
    eq((await health('2026-11-18T12:59:59.999999Z')).dispatchDue,true);
    eq((await health('2026-11-18T13:00:00Z')).state,'DEFERRED');
    await db.exec("update market_convergence.asx_calendars_v1 set valid_until='2026-11-20T06:00:00.000001Z'");eq((await health()).calendarExpiring,false);
    await db.exec("update market_convergence.asx_calendars_v1 set valid_until='2026-11-20T06:00:00Z'");eq((await health()).calendarExpiring,true);
    await time(now);await rejected(()=>query('select private.asx_convergence_health_v1($1)',['2026-11-18T06:00:00.000001Z']),/Invalid health clock/);
  });
  await check('actual watchdog with unmodified PostgreSQL clocks passes health clock validation',async()=>{
    // Reinstall raw functions: replacing both clocks in the other deterministic
    // scenarios would conceal clock_timestamp() > statement_timestamp().
    await db.exec(rawFunction('private.asx_convergence_health_v1'));
    await db.exec(rawFunction('private.run_trading_watchdog_v1'));
    await query('select private.run_trading_watchdog_v1()');
    const s=(await query('select snapshot from private.asx_convergence_monitor_state'))[0].snapshot;
    eq(s.state==='UNVERIFIED',false);eq(s.reason==='ASX_MONITOR_FAILED',false);eq(s.checkedAt!=null,true);
  });
  await check('paired rollback restores original functions and preserves all audit/event/result history',async()=>{
    await baselineRule();await addResult(970);await dispatch('2026-11-18T06:01Z');
    await query('select private.reconcile_asx_convergence_health_v1($1,false)',['2026-11-18T06:01Z']);
    const before={events:await events(),queue:await queue(),states:await states(),runs:await query('select * from market_convergence.asx_runs_v1 order by id'),assessments:await query('select * from market_convergence_assessments order by id'),monitor:await query('select * from private.asx_convergence_monitor_state')};
    // The deployed predecessor differs from the repository historical migration
    // (including its original decimal regex). Verify independent live-frozen
    // definition hashes supplied by the lead, rather than the fixture body.
    const recovery=(await readFile('scripts/rollback-asx-alert-monitoring.sql','utf8')).replaceAll('\r\n','\n').replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'');
    const raw=sql.replaceAll('\r\n','\n');
    const guardSignatures=[...restoredSignatures,'private.enqueue_asx_convergence_alert_v1()'];
    for(const signature of guardSignatures)await db.exec(functionDefinition(raw,signature.split('(')[0]).replace(/^create function/i,'create or replace function'));
    console.log('POST_MIGRATION_DEFINITION_MD5 '+JSON.stringify(await query('select signature,md5(pg_get_functiondef(signature::regprocedure)) md5 from unnest($1::text[]) signature',[guardSignatures])));
    for(const signature of guardSignatures){
      await db.exec('savepoint altered_definition');const def=(await query('select pg_get_functiondef($1::regprocedure) d',[signature]))[0].d;
      const end=def.lastIndexOf('$function$');assert(end>=0);await db.exec(def.slice(0,end)+'\n-- synthetic later implementation\n'+def.slice(end));
      await rejected(()=>db.exec(recovery),/Recovery definition drift/);
      eq((await query('select pg_get_functiondef($1::regprocedure) d',[signature]))[0].d.includes('synthetic later implementation'),true);
      eq(await queue(),before.queue);eq(await events(),before.events);await db.exec('rollback to altered_definition;release altered_definition');
    }
    for(const mutation of ['alter table market_convergence.asx_runs_v1 disable trigger enqueue_asx_convergence_alert','drop trigger enqueue_asx_convergence_alert on market_convergence.asx_runs_v1']){
      await db.exec('savepoint altered_trigger');await db.exec(mutation);await rejected(()=>db.exec(recovery),/Recovery trigger drift/);
      eq(await queue(),before.queue);eq(await events(),before.events);await db.exec('rollback to altered_trigger;release altered_trigger');
    }
    await db.exec(recovery);eq(await definitions(),baselineDefinitions);
    const expected=['6220819c284e504c603b922964dac1ff','f83a5b2baefada3dd6ac6841b69dd109','856fb77799f2b4a3836540115ca5be01','fb136ec5296ddba4de2931d2c3877e0d'];
    for(let n=0;n<restoredSignatures.length;n++)eq((await query('select md5(pg_get_functiondef($1::regprocedure)) md5',[restoredSignatures[n]]))[0].md5,expected[n],restoredSignatures[n]);
    eq({events:await events(),queue:await queue(),states:await states(),runs:await query('select * from market_convergence.asx_runs_v1 order by id'),assessments:await query('select * from market_convergence_assessments order by id'),monitor:await query('select * from private.asx_convergence_monitor_state')},before);
    eq(await query('select * from cron.job order by jobid'),cronBefore);
    eq((await query("select count(*)::int n from pg_trigger where tgname='enqueue_asx_convergence_alert'"))[0].n,0);
    const core=(await query('select private.trading_pipeline_snapshot_v1($1) s',[now]))[0].s;eq(Object.hasOwn(core,'asxConvergence'),false);
  });
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual alert lifecycle/evaluator/core and calculator; controlled admission; native concurrency unverified.`);
  console.log(createHash('sha256').update(sql).digest('hex')+' '+path);
}finally{await db.close();}
