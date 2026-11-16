import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { backfillYahoo, sydneyDate, addDays } from '../supabase/functions/market-history-maintenance-worker/yahoo.mjs';
import { refreshAsxTechnical } from '../supabase/functions/market-history-maintenance-worker/technical-refresh.mjs';
import { JobStateUnconfirmed, persistJobState } from '../supabase/functions/market-history-maintenance-worker/job-state.mjs';

// Execute the real request handler, removing imports only to inject synthetic
// Supabase/fetch dependencies. Yahoo normalization, audit handling, technical
// receipt classification and job compare-and-set are the production modules.
const worker=await readFile(new URL('../supabase/functions/market-history-maintenance-worker/index.ts',import.meta.url),'utf8');
const compiled=stripTypeScriptTypes(worker.replace(/^import[^\n]*\r?\n/gm,''),{mode:'transform'});
const instantiate=new Function('Deno','createClient','backfillYahoo','refreshAsxTechnical','JobStateUnconfirmed','persistJobState',compiled);
const instrument={id:'00000000-0000-4000-8000-000000000001',symbol:'TEST',exchange_code:'ASX',asset_type:'equity',currency_code:'AUD',is_active:true};
const job={id:'history-job',instrument_id:instrument.id,attempts:1,max_attempts:3,job_type:'initial_backfill',years:1};
const receipt=(patch={})=>({data:{instrument_id:instrument.id,asx:{instruments_processed:1,blocked_instruments:0,score_rows_upserted:1,...patch}},error:null});
const basePayload=()=>({chart:{result:[{meta:{symbol:'TEST.AX',exchangeName:'ASX',currency:'AUD',exchangeTimezoneName:'Australia/Sydney',dataGranularity:'1d'},
  timestamp:[Date.parse(addDays(sydneyDate(),-3)+'T00:00:00Z')/1000],
  indicators:{quote:[{open:[10],high:[12],low:[9],close:[11],volume:[100]}],adjclose:[{adjclose:[10.5]}]}}]}});

async function request(t,options={}) {
  const events=[],writes=[],audits=[],fetches=[];
  let handler;
  const db={
    async rpc(name,args){
      if(name==='claim_market_history_job'){events.push('claim');return {data:[job],error:null};}
      assert.equal(name,'refresh_market_trends_for_instrument');assert.deepEqual(args,{p_instrument_id:instrument.id});
      assert.equal(audits.at(-1)?.status,'succeeded','derived refresh follows acknowledged successful provider audit');
      events.push('technical');
      if(options.hookThrow)throw new Error('synthetic private RPC transport detail');
      return options.hookReceipt??receipt();
    },
    from(table){
      let operation='select',values,filters=[];
      const result=async()=>{
        if(table==='instruments')return {data:instrument,error:null};
        if(table==='data_providers')return {data:{id:filters.find(([key])=>key==='provider_code')?.[1]+'-provider'},error:null};
        if(table==='sync_runs'){
          if(operation==='insert'){events.push('audit:running');audits.push(values);return {data:{id:'audit-1'},error:null};}
          assert.equal(operation,'update');events.push('audit:'+values.status);audits.push(values);
          assert.deepEqual(filters,[['id','audit-1'],['status','running']]);
          return options.auditUnconfirmed?{data:null,error:{message:'synthetic audit timeout'}}:{data:{id:'audit-1'},error:null};
        }
        if(table==='market_observations'){
          if(operation==='upsert'){events.push('observations');return {error:null};}
          return {data:[],error:null};
        }
        assert.equal(table,'market_history_jobs');assert.equal(operation,'update');
        assert.deepEqual(filters,[['id',job.id],['status','running'],['attempts',job.attempts]]);
        writes.push(values);events.push('job:'+values.status);
        return options.finishUnconfirmed?{data:[],error:null}:{data:[{id:job.id}],error:null};
      };
      const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},
        insert(v){operation='insert';values=v;return q},update(v){operation='update';values=v;return q},
        upsert(v){operation='upsert';values=v;return q},single:result,
        then(resolve,reject){return result().then(resolve,reject)}};
      return q;
    }
  };
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(new URL(url).hostname,'query1.finance.yahoo.com');fetches.push(String(url));events.push('fetch');
    if(options.providerFailure)return new Response('{}',{status:503});
    const payload=basePayload();
    if(options.partialProviderWarning){
      const item=payload.chart.result[0];item.timestamp.push(item.timestamp[0]+86400);
      for(const [k,values] of Object.entries(item.indicators.quote[0]))values.push(k==='high'?1:values[0]);
      item.indicators.adjclose[0].adjclose.push(10.5);
    }
    return new Response(JSON.stringify(payload),{status:200});
  });
  const Deno={env:{get:key=>({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'}[key])},serve:fn=>{handler=fn}};
  instantiate(Deno,()=>db,backfillYahoo,refreshAsxTechnical,JobStateUnconfirmed,persistJobState);
  const response=await handler(new Request('https://synthetic.invalid/worker',{method:'POST'}));
  return {response,body:await response.json(),events,writes,audits,fetches};
}

test('actual ASX request persists provider observations and audit before refresh and terminal job receipt',async t=>{
  const r=await request(t);
  assert.equal(r.response.status,200);assert.equal(r.body.status,'succeeded');assert.equal(r.body.technical_refresh.status,'succeeded');
  assert.deepEqual(r.events,['claim','audit:running','fetch','observations','audit:succeeded','technical','job:succeeded']);
  assert.equal(r.fetches.length,1);assert.equal(r.writes.length,1);assert.equal(r.writes[0].sync_run_id,'audit-1');
  assert.equal(r.writes[0].last_error,null);assert.equal(r.writes[0].received_count,1);
});

test('provider failure records failed audit and existing provider retry without calling Technical',async t=>{
  const r=await request(t,{providerFailure:true});
  assert.equal(r.body.status,'retry_scheduled');assert.equal(r.fetches.length,1);
  assert.deepEqual(r.events,['claim','audit:running','fetch','audit:failed','job:pending']);
  assert.equal(r.writes[0].status,'pending');assert.match(r.writes[0].last_error,/Yahoo HTTP 503/);
});

for(const [name,options,expected] of [
  ['RPC error',{hookReceipt:{data:null,error:{message:'sensitive DB detail'}}},'failed'],
  ['transport error',{hookThrow:true},'failed'],
  ['source blocked',{hookReceipt:receipt({blocked_instruments:1,score_rows_upserted:0})},'blocked'],
  ['malformed receipt',{hookReceipt:receipt({score_rows_upserted:'1'})},'failed']
])test(`actual request ${name} preserves succeeded provider job with durable warning and no provider retry`,async t=>{
  const r=await request(t,options);
  assert.equal(r.body.status,'succeeded');assert.equal(r.body.ok,true);assert.equal(r.body.technical_refresh.status,expected);
  assert.equal(r.fetches.length,1);assert.equal(r.writes.length,1);assert.equal(r.writes[0].status,'succeeded');
  assert.ok(r.writes[0].last_error);assert.equal(r.writes[0].last_error,r.body.technical_refresh.warning);
  assert.equal(r.writes[0].last_error.includes('sensitive'),false);assert.equal(r.writes[0].last_error.includes('private'),false);
  assert.deepEqual(r.events.slice(-3),['audit:succeeded','technical','job:succeeded']);
  assert.equal(r.audits.at(-1).status,'succeeded');assert.equal(r.writes[0].next_attempt_at,undefined);
});

test('provider quality warning and blocked Technical warning both survive terminal job persistence',async t=>{
  const r=await request(t,{partialProviderWarning:true,hookReceipt:receipt({blocked_instruments:1,score_rows_upserted:0})});
  assert.equal(r.body.status,'succeeded');assert.equal(r.body.technical_refresh.status,'blocked');
  assert.match(r.writes[0].last_error,/invalid or ambiguous Yahoo sessions excluded/);
  assert.match(r.writes[0].last_error,/Technical refresh blocked/);assert.equal(r.fetches.length,1);
});

test('inactive/no-work Technical receipt skips cleanly after successful provider persistence',async t=>{
  const r=await request(t,{hookReceipt:receipt({instruments_processed:0,score_rows_upserted:0})});
  assert.equal(r.body.technical_refresh.status,'skipped');assert.equal(r.writes[0].status,'succeeded');assert.equal(r.writes[0].last_error,null);
});

test('unconfirmed Yahoo success audit prevents refresh and does not schedule contradictory retry',async t=>{
  const r=await request(t,{auditUnconfirmed:true});
  assert.equal(r.response.status,500);assert.equal(r.body.status,'state_unconfirmed');assert.equal(r.events.includes('technical'),false);
  assert.equal(r.writes.length,0);assert.equal(r.fetches.length,1);
});

test('unconfirmed terminal job write after refresh does not trigger another provider request or retry write',async t=>{
  const r=await request(t,{finishUnconfirmed:true});
  assert.equal(r.response.status,500);assert.equal(r.body.status,'state_unconfirmed');assert.equal(r.fetches.length,1);
  assert.equal(r.writes.length,1);assert.equal(r.writes[0].status,'succeeded');assert.equal(r.events.filter(e=>e==='technical').length,1);
});

test('receipt helper classifies valid success, skipped and blocked responses',async()=>{
  for(const [patch,status] of [[{},'succeeded'],[{instruments_processed:0,score_rows_upserted:0},'skipped'],[{blocked_instruments:1,score_rows_upserted:0},'blocked']]) {
    const calls=[];const r=await refreshAsxTechnical({rpc:async(...args)=>{calls.push(args);return receipt(patch)}},instrument.id);
    assert.equal(r.status,status);assert.equal(calls.length,1);assert.equal(calls[0][0],'refresh_market_trends_for_instrument');
    assert.deepEqual(calls[0][1],{p_instrument_id:instrument.id});assert.equal(Boolean(r.warning),status==='blocked');
  }
});

test('receipt helper rejects absent, wrong-instrument, error and impossible count shapes',async()=>{
  const malformed=[null,{}, {data:{}}, {data:{instrument_id:'different',asx:receipt().data.asx}},
    {data:receipt().data,error:{message:'do not expose'}},receipt({instruments_processed:2}),receipt({score_rows_upserted:0})];
  for(const field of ['blocked_instruments','instruments_processed','score_rows_upserted'])
    for(const value of [null,undefined,'1',-1,0.5,NaN,Infinity,true]) malformed.push(receipt({[field]:value}));
  for(const value of malformed) {
    const r=await refreshAsxTechnical({rpc:async()=>value},instrument.id);
    assert.equal(r.status,'failed');assert.match(r.warning,/after history persisted/);assert.equal(r.warning.includes('do not expose'),false);
  }
});
