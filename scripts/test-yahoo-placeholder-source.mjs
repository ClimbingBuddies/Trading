// Actual Yahoo worker writes into isolated PostgreSQL through a tiny Supabase
// query adapter, then actual ASX admission SQL checks the persisted evidence.
// Provider responses are synthetic; no network or hosted operations occur.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {backfillYahoo,sydneyDate,addDays} from '../supabase/functions/market-history-maintenance-worker/yahoo.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite();
const sourcePath='supabase/migrations/20261115235043_add_asx_technical_sources_v1.sql';
const admissionSql=await readFile(sourcePath,'utf8');
const workerPath='supabase/functions/market-history-maintenance-worker/yahoo.mjs';
const inst={id:'00000000-0000-4000-8000-000000000001',symbol:'TEST',exchange_code:'ASX',currency_code:'AUD',asset_type:'equity'};
const provider='00000000-0000-4000-8000-000000000002',legacy='00000000-0000-4000-8000-000000000100';
const end=addDays(sydneyDate(),-1),floor=new Date(end+'T00:00:00Z');floor.setUTCFullYear(floor.getUTCFullYear()-1);
const start=floor.toISOString().slice(0,10),dates=[];
for(let d=start;d<=end;d=addDays(d,1))if(![0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()))dates.push(d);
const rejectedDate=dates.at(-40),newRejectedDate=dates.at(-1),revisionDate=dates.at(-2);
const bar=date=>({date,open:10.123456789,high:12,low:9,close:11.123456789,adjusted_close:10.500000009,volume:100.00004});
const complete=dates.map(bar);
let scenarios=0,assertions=0,fetches=[],mode='clean',failWrite=false;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(sql,params=[])=>(await pg.query(sql,params)).rows;
const wire=value=>JSON.parse(JSON.stringify(value));
const col=name=>{
  if(/^metadata->>\w+$/.test(name))return 'metadata->>\''+name.slice(11)+'\'';
  assert.match(name,/^[a-z_]+$/);return '"'+name+'"';
};
function adapter(){return {from(table){
  assert.ok(['data_providers','sync_runs','market_observations'].includes(table));
  let action='select',values,projection='*',filters=[],ordering=[],limit=null;
  const run=async(single=false)=>{
    const params=[];const bind=v=>{params.push(v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);return '$'+params.length;};
    const where=()=>filters.length?' where '+filters.map(([op,key,value])=>op==='in'
      ?`${col(key)} in (${value.map(bind).join(',')})`:`${col(key)} ${op} ${bind(value)}`).join(' and '):'';
    let text;
    if(action==='upsert'){
      if(failWrite)return {data:null,error:{message:'synthetic write failure'}};
      for(const row of values){
        const keys=Object.keys(row);const p=keys.map(k=>row[k]&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]);
        await pg.query(`insert into market_observations(${keys.map(col).join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})
          on conflict(instrument_id,provider_id,interval_code,observed_at) do update set
          ${keys.filter(k=>!['instrument_id','provider_id','interval_code','observed_at'].includes(k)).map(k=>col(k)+'=excluded.'+col(k)).join(',')},loaded_at=clock_timestamp()`,p);
      }
      return {data:null,error:null};
    }
    if(action==='insert'){
      const keys=Object.keys(values);text=`insert into ${table}(${keys.map(col).join(',')}) values(${keys.map(k=>bind(values[k])).join(',')}) returning id`;
    }else if(action==='update')text=`update ${table} set ${Object.keys(values).map(k=>col(k)+'='+bind(values[k])).join(',')}${where()} returning id`;
    else text=`select ${projection==='*'?'*':projection.split(',').map(col).join(',')} from ${table}${where()}`+
      (ordering.length?' order by '+ordering.map(([k,asc])=>col(k)+(asc?' asc':' desc')).join(','):'')+(limit?' limit '+limit:'');
    const rows=wire(await query(text,params));return {data:single?(rows[0]??null):rows,error:null};
  };
  const q={select(v='*'){projection=v;return q},eq(k,v){filters.push(['=',k,v]);return q},gte(k,v){filters.push(['>=',k,v]);return q},
    lte(k,v){filters.push(['<=',k,v]);return q},in(k,v){filters.push(['in',k,v]);return q},
    order(k,{ascending=true}={}){ordering.push([k,ascending]);return q},limit(n){limit=n;return q},
    insert(v){action='insert';values=v;return q},update(v){action='update';values=v;return q},upsert(v){action='upsert';values=v;return q},
    single(){return run(true)},maybeSingle(){return run(true)},then(resolve,reject){return run().then(resolve,reject)}};
  return q;
}};}
function payload(rows,events={}){return {chart:{result:[{meta:{symbol:'TEST.AX',exchangeName:'ASX',currency:'AUD',exchangeTimezoneName:'Australia/Sydney',dataGranularity:'1d'},
  timestamp:rows.map(r=>Date.parse(r.date+'T00:00:00Z')/1000+(r.offset??0)),events,
  indicators:{quote:[Object.fromEntries(['open','high','low','close','volume'].map(k=>[k,rows.map(r=>r[k])]))],adjclose:[{adjclose:rows.map(r=>r.adjusted_close)}]}}]}};}
const actualFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  const endpoint=new URL(url);eq(endpoint.hostname,'query1.finance.yahoo.com');
  const from=addDays(new Date(Number(endpoint.searchParams.get('period1'))*1000).toISOString().slice(0,10),1);
  fetches.push(from);await new Promise(resolve=>setTimeout(resolve,3)); // after DB audit start, like a real provider response
  if(mode==='transport')throw new Error('synthetic transport failure');
  let rows=complete.filter(r=>r.date>=from).map(r=>({...r}));
  if(mode==='omitted')rows=rows.filter(r=>r.date!==rejectedDate);
  else if(rows.some(r=>r.date===rejectedDate))rows.push({...bar(rejectedDate),close:null,adjusted_close:null,
    volume:mode==='conflict'?101:bar(rejectedDate).volume,offset:3600});
  if(mode==='new-conflict')rows.push({...bar(newRejectedDate),close:11.5,offset:3600});
  if(mode==='omit-new'||mode.endsWith('-incomplete'))rows=rows.filter(r=>r.date!==newRejectedDate);
  if(mode.startsWith('overlap-'))rows=rows.map(r=>r.date===revisionDate?{...r,adjusted_close:9}:r);
  const timestamp=Date.parse(revisionDate+'T00:00:00Z')/1000;
  const events=mode.startsWith('corporate-')?{dividends:{[timestamp]:{date:timestamp,amount:1}}}:{};
  if(mode==='reverse')rows.reverse();
  return {ok:true,json:async()=>payload(rows,events)};
};
const load=()=>backfillYahoo(adapter(),inst,{job_type:'daily_incremental',years:1});
const latestAudit=async()=>(await query('select * from sync_runs order by started_at desc,id desc limit 1'))[0];
async function admitted(){
  await pg.exec('begin read only');
  try{return (await query('select technical_engine.asx_source_snapshot_v1($1::uuid,clock_timestamp()) result',[inst.id]))[0].result;}
  finally{await pg.exec('rollback');}
}
async function reset(){
  await pg.exec('truncate market_observations,sync_runs restart identity');fetches=[];mode='clean';failWrite=false;
  // Legacy quarantine fixture; all new terminal audit and row provenance below
  // are generated exclusively by the unchanged worker persistence path.
  const metadata={function:'asx-yahoo-market-history',provider:'yahoo',instrument_id:inst.id,symbol:inst.symbol,provider_symbol:'TEST.AX',
    exchange:'ASX',history_window_version:1,normalization_version:1,accepted_provider_dates:dates,
    requested_start_date:start,requested_end_date:end,rejected_bars:[{date:rejectedDate,reason:'legacy complete/placeholder conflict'}],
    coverage_has_rejected_bars:true,events:{}};
  await pg.query(`insert into sync_runs(id,provider_id,started_at,finished_at,status,requested_count,received_count,inserted_count,metadata)
    values($1,$2,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour','succeeded',1,1,0,$3::jsonb)`,[legacy,provider,JSON.stringify(metadata)]);
}
async function scenario(name,fn){await reset();try{await fn();scenarios++;console.log('PASS '+name);}catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,1600));}}
try{
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create table instruments(id uuid primary key,is_active boolean,symbol text,exchange_code text,asset_type text,currency_code text);
    create table data_providers(id uuid primary key,provider_code text,is_active boolean);
    create table sync_runs(id uuid primary key default gen_random_uuid(),provider_id uuid,started_at timestamptz default clock_timestamp(),
      finished_at timestamptz,status text,requested_count int,received_count int default 0,inserted_count int default 0,metadata jsonb,error_message text);
    create table market_observations(id bigint generated always as identity primary key,instrument_id uuid,provider_id uuid,interval_code text,
      observed_at timestamptz,open numeric(20,8),high numeric(20,8),low numeric(20,8),close numeric(20,8),adjusted_close numeric(20,8),
      volume numeric(24,4),currency_code text,loaded_at timestamptz default clock_timestamp(),raw_payload jsonb,is_delayed boolean,
      unique(instrument_id,provider_id,interval_code,observed_at));
    insert into instruments values('${inst.id}',true,'TEST','ASX','equity','AUD');
    insert into data_providers values('${provider}','yahoo',true);`);
  await pg.exec(admissionSql);
  await pg.exec(await readFile('supabase/migrations/20261118030255_repair_asx_late_session_admission.sql','utf8'));
  for(const order of ['clean','reverse'])await scenario('generated full revalidation with matching placeholder is admitted ('+order+')',async()=>{
    mode=order;eq((await admitted()).status,'blocked');const result=await load();const audit=await latestAudit();const source=await admitted();
    eq(fetches,[start]);eq(audit.status,'succeeded');eq(audit.metadata.normalization_version,2);eq(audit.metadata.history_window_version,1);
    eq(audit.metadata.normalization_revalidation.state,'completed');eq(audit.metadata.normalization_revalidation.required_dates,[rejectedDate]);
    eq(audit.metadata.requested_start_date,start);eq(audit.metadata.fetch_attempts.length,1);eq(audit.metadata.rejected_bars,[]);
    eq(source.status,'ready',JSON.stringify(source));eq(source.anchor_audit_id,result.sync_run_id);eq(source.terminal_audit_id,result.sync_run_id);
    eq(source.audit_ids,[result.sync_run_id]);eq(source.observations.length,dates.length);
    const duplicate=audit.metadata.duplicate_bars.find(d=>d.date===rejectedDate);eq(duplicate.normalization_version,2);
    eq(duplicate.source_bars.length,2);eq(duplicate.source_bars.filter(b=>b.close===null).length,1);
    eq(duplicate.selected_source_timestamp,Date.parse(rejectedDate+'T00:00:00Z')/1000);
    const stored=(await query('select * from market_observations where observed_at=$1::timestamptz',[rejectedDate+'T00:00:00Z']))[0];
    eq(Number(stored.close),11.12345679);eq(stored.raw_payload.close,11.123456789);eq(stored.raw_payload.adjusted_close,10.500000009);
    const second=await load();eq(fetches,[start,addDays(dates.at(-1),-14)]);
    const chained=await admitted();eq(chained.status,'ready',JSON.stringify(chained));eq(chained.anchor_audit_id,result.sync_run_id);
    eq(chained.terminal_audit_id,second.sync_run_id);eq(chained.audit_ids,[result.sync_run_id,second.sync_run_id]);
  });
  for(const failure of ['omitted','conflict'])await scenario(failure+' required session remains blocked and cannot cause repeated full fetches',async()=>{
    mode=failure;await assert.rejects(load(),/omitted or rejected/);assertions++;const audit=await latestAudit();
    eq(audit.status,'failed');eq(audit.metadata.normalization_revalidation.state,'unresolved');
    eq(audit.metadata.normalization_revalidation.missing_dates,[rejectedDate]);eq(fetches,[start]);
    eq((await query('select count(*)::int n from market_observations'))[0].n,0);eq((await admitted()).status,'blocked');
    if(failure==='conflict')eq(audit.metadata.rejected_bars[0].date,rejectedDate);
    mode='clean';await assert.rejects(load(),/reviewed recovery required/);assertions++;
    eq(fetches,[start]);eq((await latestAudit()).status,'failed');eq((await admitted()).status,'blocked');
  });
  for(const failure of ['transport','write'])await scenario(failure+' failure retains pending bounded full revalidation and clean retry is admitted',async()=>{
    mode=failure==='transport'?'transport':'clean';failWrite=failure==='write';
    await assert.rejects(load(),/synthetic/);assertions++;const failed=await latestAudit();
    eq(failed.status,'failed');eq(failed.metadata.normalization_revalidation.state,'pending');eq((await admitted()).status,'blocked');
    eq((await query('select count(*)::int n from market_observations'))[0].n,0);
    mode='clean';failWrite=false;const result=await load();eq(fetches,[start,start]);
    const source=await admitted();eq(source.status,'ready',JSON.stringify(source));eq(source.anchor_audit_id,result.sync_run_id);
    eq((await latestAudit()).metadata.normalization_revalidation.state,'completed');
  });
  await scenario('new rejection in full revalidation cannot create a clean Technical anchor',async()=>{
    mode='new-conflict';const result=await load();const audit=await latestAudit();
    eq(audit.status,'succeeded');eq(audit.metadata.normalization_revalidation.state,'completed');
    eq(audit.metadata.rejected_bars.map(r=>r.date),[newRejectedDate]);
    eq(audit.metadata.coverage_has_rejected_bars,true);assert.match(result.last_error,/excluded/);assertions++;
    eq((await query('select count(*)::int n from market_observations'))[0].n,dates.length-1);
    eq((await admitted()).status,'blocked');eq(fetches,[start]);
  });
  await scenario('pending retry cannot forget a newly quarantined date after failed write',async()=>{
    await pg.query(`update sync_runs set metadata=jsonb_set(metadata,'{accepted_provider_dates}',$1::jsonb) where id=$2`,
      [JSON.stringify(dates.filter(d=>d!==newRejectedDate)),legacy]);
    mode='new-conflict';failWrite=true;await assert.rejects(load(),/synthetic write failure/);assertions++;
    const failed=await latestAudit();eq(failed.metadata.normalization_revalidation.state,'pending');
    eq(failed.metadata.normalization_revalidation.required_dates,[rejectedDate]);
    eq(failed.metadata.rejected_bars.map(r=>r.date),[newRejectedDate]);
    mode='omit-new';failWrite=false;await assert.rejects(load(),/omitted or rejected/);assertions++;
    const retry=await latestAudit();eq(retry.metadata.normalization_revalidation.state,'unresolved');
    eq(retry.metadata.normalization_revalidation.required_dates,[rejectedDate,newRejectedDate]);
    eq(retry.metadata.normalization_revalidation.missing_dates,[newRejectedDate]);
    eq((await query('select count(*)::int n from market_observations'))[0].n,0);
    eq((await admitted()).status,'blocked');eq(fetches,[start,start]);
    mode='clean';await assert.rejects(load(),/reviewed recovery required/);assertions++;eq(fetches,[start,start]);
  });
  for(const kind of ['corporate','overlap'])for(const state of ['pending','unresolved']){
    await scenario(`${state} ${kind} correction cannot be cleared by placeholder reconciliation with an incomplete year`,async()=>{
      await load();const seed=await latestAudit();
      const reason=kind==='corporate'?'CORPORATE_ACTION_EVIDENCE_CHANGED':'OVERLAP_VALUES_REVISED';
      seed.metadata.normalization_version=1;seed.metadata.normalization_revalidation=null;
      seed.metadata.rejected_bars=[{date:rejectedDate,reason:'legacy complete/placeholder conflict'}];
      seed.metadata.coverage_has_rejected_bars=true;
      seed.metadata.correction={state,reasons:[reason],completed_provider_attempt:state==='unresolved',
        signature:'synthetic-prior-revision',unresolved_dates:[newRejectedDate],original_missing_dates:[]};
      await pg.query('update sync_runs set metadata=$1::jsonb where id=$2',[JSON.stringify(seed.metadata),seed.id]);
      const before=await query('select id,observed_at,loaded_at,adjusted_close,raw_payload from market_observations order by id');
      mode=kind+'-incomplete';await assert.rejects(load(),/correction remains incomplete/);assertions++;
      const failed=await latestAudit();eq(failed.status,'failed');eq(failed.metadata.correction.state,'unresolved');
      eq(failed.metadata.correction.reasons.includes(reason),true);eq(failed.metadata.correction.unresolved_dates,[newRejectedDate]);
      eq(failed.metadata.normalization_revalidation.state,'pending');
      eq(failed.metadata.rejected_bars,[]);eq(failed.metadata.duplicate_bars[0].normalization_version,2);
      eq(await query('select id,observed_at,loaded_at,adjusted_close,raw_payload from market_observations order by id'),before);
      eq((await admitted()).status,'blocked');eq(fetches,[start,start]);
    });
  }
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; real worker-generated rows/audits admitted by actual ASX source SQL.`);
  for(const path of [workerPath,sourcePath])console.log(createHash('sha256').update(await readFile(path)).digest('hex')+' '+path);
}finally{globalThis.fetch=actualFetch;await pg.close();}
