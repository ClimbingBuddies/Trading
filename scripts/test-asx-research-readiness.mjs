// Actual readiness query plus actual ASX source admission in isolated PostgreSQL.
// Only clock expressions are rebound in memory. No production data or services.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareAsxResearchReadiness} from './prepare-asx-research-readiness.mjs';
import {calendarManifestHash} from '../lib/shared-market-calendar.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite();
const paths={query:'scripts/asx-research-readiness.sql',template:'scripts/asx-research-readiness.template.sql',
  source:'supabase/migrations/20261115235043_add_asx_technical_sources_v1.sql',
  manifest:'data/shared-market-calendars/asx-research-2026-20261118.json',trust:'data/shared-market-calendars/asx-research-2026-20261118.trust.json'};
const files=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await readFile(p,'utf8')])));
const manifest=JSON.parse(files.manifest),trust=JSON.parse(files.trust);
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const inst=uid(1),provider=uid(100),anchor=uid(200);
const cutoff='2026-11-18T03:00:00Z',basis='Yahoo native OHLC plus separately supplied adjusted close';
const initialDates=manifest.days.filter(d=>d.status==='OPEN'&&d.date<='2026-11-17').map(d=>d.date);
let scenarios=0,assertions=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const query=async(sql,params=[])=>(await pg.query(sql,params)).rows;
const readAt=(at=cutoff,text=files.query)=>{
  assert.match(at,/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  return text.replaceAll('statement_timestamp()',`'${at}'::timestamptz`);
};
async function inspect(at=cutoff,text=files.query){
  await pg.exec('begin read only;set local role service_role');
  try{return await query(readAt(at,text));}finally{await pg.exec('rollback');}
}
const row=async(at=cutoff,text=files.query)=>(await inspect(at,text)).find(r=>r.instrument_id===inst);
const source=async(at=cutoff)=>(await query('select technical_engine.asx_source_snapshot_v1($1::uuid,$2::timestamptz) result',[inst,at]))[0].result;
async function seed(dates=initialDates,end='2026-11-17',at=cutoff){
  await pg.exec('truncate instruments,data_providers,sync_runs,market_observations,watchlist_items,shared_decision_calls,shared_decision_outcomes');
  await pg.query('insert into instruments values($1,true,\'TEST\',\'ASX\',\'equity\',\'AUD\')',[inst]);
  await pg.query('insert into data_providers values($1,\'yahoo\',true)',[provider]);
  const start=new Date(end+'T00:00:00Z');start.setUTCFullYear(start.getUTCFullYear()-1);const startDate=start.toISOString().slice(0,10);
  const began=new Date(Date.parse(at)-180000).toISOString(),retrieved=new Date(Date.parse(at)-120000).toISOString(),finished=new Date(Date.parse(at)-60000).toISOString();
  const metadata={function:'asx-yahoo-market-history',provider:'yahoo',instrument_id:inst,symbol:'TEST',provider_symbol:'TEST.AX',exchange:'ASX',
    price_basis:basis,requested_start_date:startDate,requested_end_date:end,retrieved_at:retrieved,
    history_window_version:1,normalization_version:2,previous_audit_id:null,accepted_provider_dates:dates,
    normalization_revalidation:{version:2,state:'completed',required_dates:[]},coverage_has_rejected_bars:false,
    rejected_bars:[],duplicate_bars:[],events:{},valid_rows:dates.length,
    fetch_attempts:[{requested_start_date:startDate,requested_end_date:end,retrieved_at:retrieved,valid_rows:dates.length,rejected_bars:[],duplicate_bars:[],events:{}}]};
  await pg.query('insert into sync_runs values($1,$2,$3,$4,\'succeeded\',1,$5,$5,$6::jsonb)',[anchor,provider,began,finished,dates.length,JSON.stringify(metadata)]);
  let n=0;for(const date of dates){
    const raw={date,open:10,high:12,low:9,close:11,adjusted_close:10.5,volume:100,
      _backfill:{function:metadata.function,provider:'yahoo',symbol:'TEST',provider_symbol:'TEST.AX',exchange:'ASX',
        requested_start_date:startDate,requested_end_date:end,price_basis:basis,retrieved_at:retrieved,source:'Yahoo Finance'}};
    await pg.query(`insert into market_observations values($1,$2,$3,'1day',$4,10,12,9,11,10.5,100,'AUD',$5,$6::jsonb)`,
      [++n,inst,provider,date+'T00:00:00Z',retrieved,JSON.stringify(raw)]);
  }
}
async function scenario(name,fn){await seed();try{await fn();scenarios++;console.log('PASS '+name);}catch(error){throw new Error('FAIL '+name+': '+String(error.message).slice(0,2000));}}
const expect=async(state,at=cutoff,text=files.query)=>{const r=await row(at,text);eq(r.readiness,state,JSON.stringify(r));return r;};
const mutateAudit=patch=>pg.query('update sync_runs set metadata=metadata||$1::jsonb where id=$2',[JSON.stringify(patch),anchor]);
const customSql=(m=structuredClone(manifest),t=structuredClone(trust))=>{t.manifestHash=calendarManifestHash(m);return prepareAsxResearchReadiness(m,t,files.template);};
try{
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create table instruments(id uuid primary key,is_active boolean,symbol text,exchange_code text,asset_type text,currency_code text);
    create table data_providers(id uuid primary key,provider_code text,is_active boolean);
    create table sync_runs(id uuid primary key,provider_id uuid,started_at timestamptz,finished_at timestamptz,status text,
      requested_count integer,received_count integer,inserted_count integer,metadata jsonb);
    create table market_observations(id bigint primary key,instrument_id uuid,provider_id uuid,interval_code text,observed_at timestamptz,
      open numeric(20,8),high numeric(20,8),low numeric(20,8),close numeric(20,8),adjusted_close numeric(20,8),volume numeric(24,4),
      currency_code text,loaded_at timestamptz,raw_payload jsonb);
    create table watchlist_items(instrument_id uuid,owner_secret text);
    create table shared_decision_calls(id uuid primary key,instrument_id uuid);
    create table shared_decision_outcomes(call_id uuid,kind text);
    create table personal_portfolios(owner_secret text,private_value numeric);
    create table market_scores(id bigint,private_score numeric);
    grant select on instruments,data_providers,sync_runs,market_observations,shared_decision_calls,shared_decision_outcomes to service_role;
    grant select(instrument_id) on watchlist_items to service_role;
    insert into personal_portfolios values('private-sentinel',12345);insert into market_scores values(1,12345);`);
  // Permit deterministic future fixture dates without changing any other source logic.
  await pg.exec(files.source.replaceAll('clock_timestamp()',"'2027-01-01T00:00:00Z'::timestamptz"));
  eq(files.query.replaceAll('\r\n','\n'),prepareAsxResearchReadiness(manifest,trust,files.template).replaceAll('\r\n','\n'));
  await scenario('real clean source admits raw prices and session target under read-only restricted role',async()=>{
    const s=await source();eq(s.status,'ready');const r=await expect('RAW_PRICE_SESSION_READY');
    eq(r.admitted_open_dates,24);eq(r.target_session.toISOString().slice(0,10),'2026-11-17');eq(r.target_present,true);
    eq(r.anchor_audit_id,anchor);eq(r.terminal_audit_id,anchor);eq(r.source_hash,s.source_hash);eq(r.calendar_hash,trust.manifestHash);
    eq(r.closed_date_bars,0);eq(r.invalid_cutoff_bars,0);eq(r.provider,'yahoo');
    eq(Object.keys(r).some(k=>/owner|portfolio|score|raw_payload|open_price|close_price/.test(k)),false);
    eq((await query("select has_table_privilege('service_role','personal_portfolios','select') p,has_table_privilege('service_role','market_scores','select') s,has_column_privilege('service_role','watchlist_items','owner_secret','select') w"))[0],{p:false,s:false,w:false});
  });
  for(const [at,state] of [['2026-11-18T02:34:20.999999Z','CALENDAR_REVIEW_EXPIRED_OR_NOT_YET_VALID'],
    ['2026-11-18T02:34:21Z','RAW_PRICE_SESSION_READY'],['2026-11-25T02:34:20.999999Z','TARGET_SESSION_MISSING'],
    ['2026-11-25T02:34:21Z','CALENDAR_REVIEW_EXPIRED_OR_NOT_YET_VALID']]){
    await scenario('trust exact boundary '+at,async()=>{
      await seed(initialDates,'2026-11-17','2026-11-18T02:34:21Z');const r=await expect(state,at);
      if(state.startsWith('CALENDAR')){eq(r.target_session,null);eq(r.source_status,null);}
    });
  }
  for(const [at,target] of [['2026-11-18T02:34:21Z','2026-11-17'],['2026-11-18T12:59:59.999999Z','2026-11-17'],['2026-11-18T13:00:00Z','2026-11-18']]){
    await scenario('Sydney current date excluded at '+at,async()=>{
      await seed(initialDates,'2026-11-17','2026-11-18T02:34:21Z');const r=await row(at);
      eq(r.target_session.toISOString().slice(0,10),target);
      eq(r.readiness,target==='2026-11-17'?'RAW_PRICE_SESSION_READY':'TARGET_SESSION_MISSING');
    });
  }
  for(const day of ['2026-11-21','2026-11-22','2026-11-23'])await scenario('weekend/prior Friday target on '+day,async()=>{
    const at=day+'T01:00:00Z',dates=manifest.days.filter(d=>d.status==='OPEN'&&d.date<='2026-11-20').map(d=>d.date);
    await seed(dates,'2026-11-20',at);const r=await expect('RAW_PRICE_SESSION_READY',at);
    eq(r.target_session.toISOString().slice(0,10),'2026-11-20');
  });
  await scenario('22 nonconsecutive reviewed OPEN dates with target are sufficient',async()=>{
    await seed(initialDates.filter(d=>!['2026-10-20','2026-10-22'].includes(d)));const r=await expect('RAW_PRICE_SESSION_READY');eq(r.admitted_open_dates,22);
  });
  for(const n of [20,19])await scenario(n+' admitted OPEN date threshold',async()=>{
    await seed(initialDates.slice(-n));const r=await expect(n===20?'RAW_PRICE_SESSION_READY':'INSUFFICIENT_REVIEWED_OPEN_OBSERVATIONS');eq(r.admitted_open_dates,n);
  });
  await scenario('enough older dates cannot replace missing target',async()=>{
    await seed(initialDates.slice(0,-1));eq((await source()).status,'ready');const r=await expect('TARGET_SESSION_MISSING');eq(r.admitted_open_dates,23);
  });
  await scenario('valid native bar on CLOSED date blocks readiness',async()=>{
    await seed([...initialDates,'2026-11-14'].sort());eq((await source()).status,'ready');const r=await expect('SOURCE_ON_CLOSED_DATE');eq(r.closed_date_bars,1);
  });
  await scenario('older dates outside reviewed coverage do not inflate 20-date threshold',async()=>{
    await seed(['2026-10-13','2026-10-14',...initialDates.slice(-19)]);eq((await source()).status,'ready');const r=await expect('INSUFFICIENT_REVIEWED_OPEN_OBSERVATIONS');eq(r.admitted_open_dates,19);
  });
  for(const patch of [{rejected_bars:[{date:'2026-11-17'}]},{coverage_has_rejected_bars:true},
    {correction:{state:'pending'}},{correction:{state:'unresolved'}},{daily_closes_preserved_while_gap_unresolved:true},
    {provider_symbol:'OTHER.AX'},{instrument_id:uid(999)}])await scenario('actual source blocks audit '+Object.keys(patch)[0]+JSON.stringify(patch).slice(0,40),async()=>{
    await mutateAudit(patch);eq((await source()).status,'blocked');await expect('SOURCE_BLOCKED');
  });
  await scenario('actual source blocks duplicate observation dates',async()=>{
    await pg.exec('insert into market_observations select 9999,instrument_id,provider_id,interval_code,observed_at,open,high,low,close,adjusted_close,volume,currency_code,loaded_at,raw_payload from market_observations where id=1');
    const r=await expect('SOURCE_BLOCKED');eq(r.source_reason,'INVALID_OBSERVATION');
  });
  for(const delta of ['0 microsecond','1 microsecond'])await scenario('load timestamp cutoff '+delta,async()=>{
    await pg.query(`update market_observations set loaded_at=$1::timestamptz+interval '${delta}' where id=1`,[cutoff]);
    await expect(delta==='0 microsecond'?'RAW_PRICE_SESSION_READY':'SOURCE_BLOCKED');
  });
  await scenario('audit whose requested window includes current Sydney day is blocked',async()=>{
    await seed([...initialDates,'2026-11-18'],'2026-11-18');const r=await expect('SOURCE_BLOCKED');eq(r.source_reason,'INVALID_AUDIT_WINDOW');
  });
  await scenario('newer failed source audit cannot fall back to clean anchor',async()=>{
    await pg.query(`insert into sync_runs select $1,provider_id,$2::timestamptz-interval '30 seconds',$2::timestamptz-interval '20 seconds','failed',requested_count,received_count,inserted_count,metadata from sync_runs`,[uid(201),cutoff]);
    await expect('SOURCE_BLOCKED');
  });
  for(const [field,value] of [['asset_type','fund'],['currency_code','USD']])await scenario('unsupported '+field+' blocks before source use',async()=>{
    await pg.query(`update instruments set ${field}=$1`,[value]);const r=await expect('UNSUPPORTED_IDENTITY');eq(r.source_status,null);
  });
  await scenario('distinct active/watched/open shared union exposes inactive rows with open then watched priority',async()=>{
    for(let n=2;n<=9;n++)await pg.query('insert into instruments values($1,$2,$3,$4,\'equity\',\'AUD\')',
      [uid(n),[2,7,9].includes(n),'SCOPE'+n,n===7?'NYSE':'ASX']);
    await pg.query('insert into watchlist_items values($1,\'secret-a\'),($1,\'secret-b\'),($2,\'secret-c\')',[uid(2),uid(3)]);
    for(const n of [2,4,5,6])await pg.query('insert into shared_decision_calls values($1,$2)',[uid(300+n),uid(n)]);
    await pg.query("insert into shared_decision_outcomes values($1,'EXIT'),($2,'CANCELLED')",[uid(305),uid(306)]);
    const rows=await inspect();eq(rows.map(r=>r.instrument_id),[uid(2),uid(4),uid(3),uid(1),uid(9)]);
    eq(rows.filter(r=>!r.is_active).map(r=>r.readiness),['INACTIVE_INSTRUMENT','INACTIVE_INSTRUMENT']);
    eq(JSON.stringify(rows).includes('secret-'),false);eq(rows[0].is_watched,true);eq(rows[0].has_open_shared_call,true);
  });
  await scenario('empty scope returns no invented readiness',async()=>{await pg.exec('truncate instruments');eq(await inspect(),[]);});
  for(const [at,start,end] of [['2026-10-14T03:00:00Z','2026-10-14T00:00:00Z','2026-10-21T00:00:00Z'],
    ['2026-12-22T03:00:00Z','2026-12-22T00:00:00Z','2026-12-29T00:00:00Z']])await scenario('outside coverage fails closed with freshly trusted calendar '+at,async()=>{
      const t={...trust,verifiedAt:start,validUntil:end};const r=await expect('CALENDAR_COVERAGE_MISSING',at,customSql(undefined,t));
      eq(r.target_session,null);eq(r.source_status,null);
    });
  await scenario('covered dates with no earlier OPEN date cannot invent a target',async()=>{
    const m=structuredClone(manifest);for(const d of m.days){d.status='CLOSED';d.reason='Synthetic closure';}
    const r=await expect('CALENDAR_TARGET_MISSING',cutoff,customSql(m));eq(r.target_session,null);eq(r.source_status,null);
  });
  console.log(`PASS: ${scenarios} scenarios; ${assertions} assertions; actual ASX source and read-only readiness SQL.`);
  for(const k of ['query','source','manifest','trust'])console.log(createHash('sha256').update(files[k]).digest('hex')+' '+paths[k]);
}finally{await pg.close();}
