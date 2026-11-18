// Actual preflight SELECT in isolated PostgreSQL with synthetic shared data.
// No network, hosted access, or personal data. Clock replacement is test-only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const sql=await readFile('scripts/daily-reviewer-preflight.sql','utf8');
const fixtureSql=sql.replaceAll('statement_timestamp()','$1::timestamptz');
const cutoff='2026-11-17T00:00:00Z';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(text,params=[])=>(await db.query(text,params)).rows;
async function check(name,setup,verify){
  await db.exec('begin');
  try{
    await setup();await db.exec('set transaction read only;set local role preflight_reader');
    const rows=await query(fixtureSql,[cutoff]);await verify(rows,rows.find(r=>r.instrument_id===id(2)));
    scenarios++;console.log('PASS '+name);
  }catch(error){throw new Error(`FAIL ${name}: ${String(error.message).slice(0,1400)}`);}
  finally{await db.exec('rollback');}
}
const noop=async()=>{};
try{
  await db.exec(`create role preflight_reader;create schema private;
    create table instruments(id uuid primary key,symbol text,exchange_code text,currency_code text,is_active boolean,asset_type text);
    create table watchlist_items(instrument_id uuid,owner_id uuid,private_note text);
    create table shared_decision_calls(id uuid primary key,instrument_id uuid);
    create table shared_decision_outcomes(call_id uuid,kind text);
    create table data_providers(id uuid primary key,provider_code text,is_active boolean);
    create table market_observations(id bigint generated always as identity,instrument_id uuid,provider_id uuid,interval_code text,
      observed_at timestamptz,loaded_at timestamptz,close numeric,adjusted_close numeric,currency_code text,raw_payload jsonb);
    create table provider_instruments(instrument_id uuid,provider_id uuid,is_active boolean);
    create table market_history_jobs(id bigint primary key,instrument_id uuid,status text,created_at timestamptz,private_error text);
    create table sync_runs(id uuid primary key,provider_id uuid,status text,started_at timestamptz,metadata jsonb);
    create table gpt_market_runs(run_id uuid primary key,analysis_mode text,status text,completed_at timestamptz);
    create table gpt_market_assessments(assessment_id uuid primary key,instrument_id uuid,run_id uuid,assessment_date date,
      created_at timestamptz,technical_engine_input_used boolean,methodology_version text,score numeric,confidence numeric,rating text,raw_text text);
    create table private.shared_decision_config(instrument_id uuid primary key,enabled boolean,verification_reference text);
    create table private.personal_candidates(owner_id uuid,instrument_id uuid,notes text);
    create table private.personal_notes(owner_id uuid,notes text);
    insert into private.personal_candidates values('${id(99)}','${id(9)}','DO_NOT_READ_PERSONAL');
    insert into private.personal_notes values('${id(99)}','DO_NOT_READ_PERSONAL');
    insert into instruments values
      ('${id(1)}','A_ACTIVE','NYSE','USD',true,'equity'),
      ('${id(2)}','B_WATCHED','NASDAQ','USD',true,'equity'),
      ('${id(3)}','C_INACTIVE_WATCH','NYSE','USD',false,'equity'),
      ('${id(4)}','Z_INACTIVE_OPEN','NYSE','USD',false,'equity'),
      ('${id(5)}','E_EXITED','NYSE','USD',false,'equity'),
      ('${id(6)}','D_ENTRY_ONLY','NYSE','USD',false,'equity'),
      ('${id(7)}','F_CANCELLED','NYSE','USD',false,'equity'),
      ('${id(8)}','C_ACTIVE_OPEN','ASX','AUD',true,'equity'),
      ('${id(9)}','X_PERSONAL_ONLY','ASX','AUD',false,'equity'),
      ('${id(10)}','G_NULL_ACTIVITY','NYSE','USD',null,'equity');
    insert into watchlist_items values('${id(2)}','${id(99)}','PRIVATE_WATCH_NOTE'),('${id(2)}','${id(98)}','PRIVATE_WATCH_NOTE'),
      ('${id(3)}','${id(99)}','PRIVATE_WATCH_NOTE'),('${id(10)}','${id(99)}','PRIVATE_WATCH_NOTE');
    insert into shared_decision_calls values('${id(40)}','${id(4)}'),('${id(50)}','${id(5)}'),('${id(60)}','${id(6)}'),
      ('${id(70)}','${id(7)}'),('${id(80)}','${id(8)}'),('${id(81)}','${id(8)}');
    insert into shared_decision_outcomes values('${id(50)}','EXIT'),('${id(60)}','ENTRY'),('${id(70)}','CANCELLED'),('${id(80)}','EXIT');
    insert into data_providers values('${id(101)}','tiingo',true),('${id(102)}','yahoo',true),('${id(103)}','yahoo',false);
    insert into provider_instruments values('${id(2)}','${id(101)}',true),('${id(2)}','${id(102)}',true),('${id(2)}','${id(101)}',false),('${id(8)}','${id(102)}',true);
    insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close,currency_code,raw_payload)
      select '${id(2)}','${id(101)}','1day','${cutoff}'::timestamptz-n*interval '1 day','2026-11-16T23:00Z',11,10.5,' USD ','{"private_raw":"DO_NOT_EXPOSE"}'
      from generate_series(1,20)n;
    insert into market_history_jobs values
      (1,'${id(2)}','pending','2026-11-16T20:00Z','PRIVATE_JOB_ERROR'),
      (2,'${id(2)}','succeeded','2026-11-16T21:00Z','PRIVATE_JOB_ERROR'),
      (4,'${id(8)}','failed','2026-11-16T23:00Z','PRIVATE_JOB_ERROR'),
      (5,'${id(8)}','succeeded','2026-11-16T22:00Z','PRIVATE_JOB_ERROR');
    insert into gpt_market_runs values('${id(200)}','scheduled','succeeded','2026-11-16T23:30Z');
    insert into gpt_market_assessments values('${id(300)}','${id(2)}','${id(200)}','2026-11-16','2026-11-16T23:00Z',false,
      'independent-market-ai-v1',70,80,'Buy','PRIVATE_ASSESSMENT_RAW');
    alter table market_history_jobs add requested_end date,add coverage_end timestamptz,add sync_run_id uuid;
    grant select on sync_runs to preflight_reader;
    grant usage on schema private to preflight_reader;
    grant select on instruments,watchlist_items,shared_decision_calls,shared_decision_outcomes,data_providers,market_observations,
      provider_instruments,market_history_jobs,gpt_market_runs,gpt_market_assessments,private.shared_decision_config to preflight_reader;`);

  await check('distinct active/watched/open shared union excludes personal-only and terminal-only inactive instruments',noop,rows=>{
    eq(rows.length,7);eq(rows.map(r=>r.instrument_id).sort(),[1,2,3,4,6,8,10].map(id).sort());
    eq(new Set(rows.map(r=>r.instrument_id)).size,7);
    eq(rows.find(r=>r.instrument_id===id(4)).is_active,false);
    eq(rows.find(r=>r.instrument_id===id(10)).is_active,null);
    eq(rows.find(r=>r.instrument_id===id(8)).has_open_shared_call,true);
  });
  await check('open shared calls sort before watched instruments, then remaining active instruments',noop,rows=>{
    eq(rows.map(r=>r.instrument_id),[4,6,8,2,3,10,1].map(id));
    eq(rows.map(r=>r.research_priority),[0,0,0,1,1,1,2]);
  });
  await check('watched plus open status stays one row with open priority',()=>db.exec(`insert into watchlist_items values('${id(8)}','${id(99)}','PRIVATE_WATCH_NOTE')`),rows=>{
    eq(rows.length,7);const r=rows.find(r=>r.instrument_id===id(8));eq(r.is_watched,true);eq(r.has_open_shared_call,true);eq(r.research_priority,0);
  });
  await check('correct venue provider and latest instrument-scoped job are selected',noop,(rows,r)=>{
    eq(r.provider_code,'tiingo');eq(r.history_status,'succeeded');eq(Number(r.active_mapping_count),1);
    const asx=rows.find(r=>r.instrument_id===id(8));eq(asx.provider_code,'yahoo');eq(asx.history_status,'failed');
    eq(Number(asx.active_mapping_count),1);eq(Number(asx.daily_rows),0);
  });
  await check('equal instrument job timestamps use descending job ID',()=>db.exec(`insert into market_history_jobs(id,instrument_id,status,created_at,private_error) values(6,'${id(2)}','running','2026-11-16T21:00Z','PRIVATE_JOB_ERROR')`),(_,r)=>eq(r.history_status,'running'));
  await check('future jobs cannot replace the preflight history receipt',()=>db.exec(`insert into market_history_jobs(id,instrument_id,status,created_at) values(6,'${id(2)}','running','2026-11-18T00:00Z')`),(_,r)=>eq(r.history_status,'succeeded'));
  await check('succeeded job exposes quarantined Yahoo session without leaking raw prices',async()=>{
    await db.exec(`insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close,currency_code)
      select '${id(8)}','${id(102)}','1day','${cutoff}'::timestamptz-n*interval '1 day','2026-11-16T23:00Z',11,10.5,'AUD' from generate_series(1,20)n;
      update market_history_jobs set status='succeeded',requested_end='2026-11-16',coverage_end='2026-11-15T00:00Z',sync_run_id='${id(400)}' where id=4;
      insert into sync_runs values('${id(400)}','${id(102)}','succeeded','2026-11-16T23:00Z','{"instrument_id":"${id(8)}","function":"asx-yahoo-market-history","provider_symbol":"C_ACTIVE_OPEN.AX","rejected_bars":[{"private_raw":"DO_NOT_EXPOSE"}],"normalization_revalidation":{"state":"unresolved"}}');`);
  },rows=>{
    const r=rows.find(r=>r.instrument_id===id(8));
    eq(r.history_status,'succeeded');eq(r.yahoo_rejected_sessions,1);
    eq(r.yahoo_revalidation_state,'unresolved');eq(r.data_status,'yahoo_quarantined_sessions_require_recovery');
    eq(r.history_audit_id,id(400));eq(/DO_NOT_EXPOSE/.test(JSON.stringify(rows)),false);
    eq(rows.find(r=>r.instrument_id===id(2)).data_status,'requires_session_and_cutoff_validation');
  });
  await check('failed Yahoo revalidation is visible without a job-linked sync receipt',()=>db.exec(`
    insert into sync_runs values('${id(401)}','${id(102)}','failed','2026-11-16T23:30Z',
      '{"instrument_id":"${id(8)}","function":"asx-yahoo-market-history","provider_symbol":"C_ACTIVE_OPEN.AX","rejected_bars":[],"normalization_revalidation":{"state":"unresolved"}}');`),rows=>{
    const r=rows.find(r=>r.instrument_id===id(8));eq(r.history_audit_id,id(401));
    eq(r.history_audit_status,'failed');eq(r.history_audit_job_linked,false);eq(r.yahoo_revalidation_state,'unresolved');
  });
  await check('twenty finite matching-currency rows are only a conditional history count',noop,(_,r)=>{
    eq(Number(r.daily_rows),20);eq(new Date(r.first_date).toISOString().slice(0,10),'2026-10-28');
    eq(new Date(r.last_date).toISOString().slice(0,10),'2026-11-16');
    eq(r.data_status,'requires_session_and_cutoff_validation');eq(r.publication_path,'research_only_proof_required_before_cutoff');
  });
  const invalidBars=[
    {close:'NaN'},{close:'Infinity'},{close:'-Infinity'},{close:0},{close:-1},{close:null},
    {adjusted_close:'NaN'},{adjusted_close:'Infinity'},{adjusted_close:'-Infinity'},{adjusted_close:0},{adjusted_close:null},
    {currency_code:'AUD'},{currency_code:'usd'},{currency_code:null},
    {loaded_at:'2026-11-17T00:00:00.000001Z'},{loaded_at:null},
    {observed_at:cutoff},{observed_at:'2026-11-17T00:00:00.000001Z'},{observed_at:null},
    {interval_code:'1min'},{provider_id:id(102)},{instrument_id:id(1)}
  ];
  await check('nonfinite/null/currency/provider/interval/future values cannot inflate daily history count',async()=>{
    for(const patch of invalidBars){const v={instrument_id:id(2),provider_id:id(101),interval_code:'1day',observed_at:'2026-11-16T10:00Z',loaded_at:'2026-11-16T23:30Z',close:10,adjusted_close:10,currency_code:'USD',...patch};
      await db.query('insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close,currency_code) values($1,$2,$3,$4,$5,$6,$7,$8)',Object.values(v));}
  },(_,r)=>{eq(Number(r.daily_rows),20);eq(new Date(r.last_loaded_at).toISOString(),'2026-11-16T23:00:00.000Z');});
  await check('loaded cutoff equality is included while observation cutoff is strictly exclusive',()=>db.exec(`insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close,currency_code)
      values('${id(2)}','${id(101)}','1day','2026-11-16T23:59:59.999999Z','${cutoff}',11,10.5,'USD')`),(_,r)=>{
    eq(Number(r.daily_rows),21);eq(new Date(r.last_loaded_at).toISOString(),new Date(cutoff).toISOString());
  });
  await check('Yahoo canonical identity validation is conditional without mapping rows; Tiingo still requires one mapping',async()=>{
    await db.exec(`delete from provider_instruments;
      insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close,currency_code)
      select '${id(8)}','${id(102)}','1day','${cutoff}'::timestamptz-n*interval '1 day','2026-11-16T23:00Z',11,10.5,'AUD' from generate_series(1,20)n`);
  },(rows,r)=>{
    eq(Number(r.active_mapping_count),0);eq(r.data_status,'mapping_missing_or_ambiguous');
    const asx=rows.find(row=>row.instrument_id===id(8));eq(Number(asx.active_mapping_count),0);eq(Number(asx.daily_rows),20);
    eq(asx.data_status,'requires_yahoo_identity_session_and_cutoff_validation');
  });
  for(const [name,setup,status] of [
    ['below history threshold',`delete from market_observations where id=(select max(id) from market_observations)`,'history_insufficient'],
    ['missing mapping',`delete from provider_instruments where provider_id='${id(101)}'`,'mapping_missing_or_ambiguous'],
    ['duplicate mapping',`insert into provider_instruments values('${id(2)}','${id(101)}',true)`,'mapping_missing_or_ambiguous'],
    ['inactive provider',`update data_providers set is_active=false where id='${id(101)}'`,'provider_missing'],
    ['inactive instrument',`update instruments set is_active=false where id='${id(2)}'`,'inactive_instrument']
  ])await check(name+' is honestly labelled',()=>db.exec(setup),(_,r)=>eq(r.data_status,status));
  await check('publication routing is conditional and inactive records remain visible',noop,(rows,r)=>{
    eq(r.measurable_config_enabled,false);eq(r.publication_path,'research_only_proof_required_before_cutoff');
    eq(rows.find(r=>r.instrument_id===id(1)).publication_path,'not_in_shared_publication_scope');
    eq(rows.find(r=>r.instrument_id===id(8)).publication_path,'publication_path_unsupported');
    for(const n of [3,4,6,10]){eq(rows.find(r=>r.instrument_id===id(n)).publication_path,'inactive_instrument');eq(rows.find(r=>r.instrument_id===id(n)).data_status,'inactive_instrument');}
  });
  await check('enabled configuration means candidate check after research, never automatic admission',()=>db.exec(`insert into private.shared_decision_config values('${id(2)}',true,'PRIVATE_VERIFICATION'),('${id(3)}',true,'PRIVATE_VERIFICATION'),('${id(1)}',true,'PRIVATE_VERIFICATION')`),(rows,r)=>{
    eq(r.measurable_config_enabled,true);eq(r.publication_path,'measurable_candidate_check_after_research');
    eq(rows.find(r=>r.instrument_id===id(3)).publication_path,'inactive_instrument');
    eq(rows.find(r=>r.instrument_id===id(1)).publication_path,'not_in_shared_publication_scope');
  });
  for(const change of ["asset_type='forex'","exchange_code='OTC'","asset_type=null"])
    await check('unsupported watched route: '+change,()=>db.exec(`update instruments set ${change} where id='${id(2)}'`),(_,r)=>eq(r.publication_path,'publication_path_unsupported'));
  await check('completed independent scheduled assessment is visible without raw analytical text',noop,(_,r)=>{
    eq(r.assessment_id,id(300));eq(new Date(r.assessment_date).toISOString().slice(0,10),'2026-11-16');
  });
  for(const [name,change] of [
    ['manual run',"update gpt_market_runs set analysis_mode='manual'"],['unfinished run',"update gpt_market_runs set status='running'"],
    ['failed run',"update gpt_market_runs set status='failed'"],['missing completion','update gpt_market_runs set completed_at=null'],
    ['future completion',"update gpt_market_runs set completed_at='2026-11-17T00:00:00.000001Z'"],
    ['future creation',"update gpt_market_assessments set created_at='2026-11-17T00:00:00.000001Z'"],
    ['not independent','update gpt_market_assessments set technical_engine_input_used=true'],
    ['unknown independence','update gpt_market_assessments set technical_engine_input_used=null'],
    ['different methodology',"update gpt_market_assessments set methodology_version='independent-market-ai-v2'"]
  ])await check('assessment inventory excludes '+name,()=>db.exec(change),(_,r)=>eq(r.assessment_id,null));
  await check('partial terminal run and exact created/completed cutoff are included',()=>db.exec(`update gpt_market_runs set status='partial',completed_at='${cutoff}';update gpt_market_assessments set created_at='${cutoff}'`),(_,r)=>eq(r.assessment_id,id(300)));
  await check('latest completed scheduled row is not silently replaced by older good data or treated as eligibility',()=>db.exec(`insert into gpt_market_assessments values('${id(301)}','${id(2)}','${id(200)}','2099-01-01','2026-11-16T23:15Z',false,'independent-market-ai-v1','NaN',null,'invalid','PRIVATE_BAD_ASSESSMENT')`),(_,r)=>{
    eq(r.assessment_id,id(301));eq(new Date(r.assessment_date).toISOString().slice(0,10),'2099-01-01');
    eq(r.data_status,'requires_session_and_cutoff_validation');eq(r.publication_path,'research_only_proof_required_before_cutoff');
  });
  await check('private raw values never appear and reader has no personal-table permissions',noop,async rows=>{
    eq(/PRIVATE_|DO_NOT_|owner_id|raw_payload|raw_text/.test(JSON.stringify(rows)),false);
    eq(Object.keys(rows[0]).sort(),['instrument_id','symbol','exchange_code','currency_code','is_active','is_watched','has_open_shared_call','research_priority',
      'provider_code','daily_rows','first_date','last_date','last_loaded_at','active_mapping_count','history_status','history_requested_end','history_coverage_end',
      'history_audit_id','history_audit_status','history_audit_job_linked','yahoo_rejected_sessions','yahoo_revalidation_state','assessment_id','assessment_date',
      'assessment_created_at','measurable_config_enabled','publication_path','data_status'].sort());
    for(const table of ['private.personal_candidates','private.personal_notes'])eq((await query('select has_table_privilege(current_user,$1,\'SELECT\') allowed',[table]))[0].allowed,false);
  });
  await check('empty shared inventory returns no rows even with personal candidate records',()=>db.exec('truncate instruments,watchlist_items,shared_decision_calls,shared_decision_outcomes'),rows=>eq(rows,[]));
  await db.exec('begin read only;set local role preflight_reader');
  try{eq((await query(sql)).length,7);}finally{await db.exec('rollback');}
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual read-only preflight SQL under restricted shared-reader role.`);
  console.log('SQL SHA256 '+createHash('sha256').update(sql).digest('hex'));
}finally{await db.close();}
