import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const H={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const iso=(d:Date)=>d.toISOString().slice(0,10);
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const chunks=<T>(a:T[],z=500)=>Array.from({length:Math.ceil(a.length/z)},(_,i)=>a.slice(i*z,(i+1)*z));
const addDays=(s:string,d:number)=>{const x=new Date(s+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+d);return iso(x)};
const yearsAgo=(y:number)=>{const x=new Date();x.setUTCFullYear(x.getUTCFullYear()-y);return iso(x)};
type FetchResult={rows:any[],family:string};
async function tiingo(token:string,type:string,symbol:string,start:string,end:string):Promise<FetchResult>{
 let u:URL,family:string;
 if(type==="equity"||type==="etf"){family="eod";u=new URL(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`);u.searchParams.set("startDate",start);u.searchParams.set("endDate",end)}
 else if(type==="forex"){family="fx";u=new URL(`https://api.tiingo.com/tiingo/fx/${encodeURIComponent(symbol)}/prices`);u.searchParams.set("startDate",start);u.searchParams.set("endDate",end);u.searchParams.set("resampleFreq","1day")}
 else if(type==="crypto"){family="crypto";u=new URL("https://api.tiingo.com/tiingo/crypto/prices");u.searchParams.set("tickers",symbol);u.searchParams.set("startDate",start);u.searchParams.set("endDate",end);u.searchParams.set("resampleFreq","1day")}
 else throw new Error(`Tiingo history is not configured for asset type ${type}`);
 const r=await fetch(u,{headers:{Authorization:`Token ${token}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(60000)});
 let p:any;try{p=await r.json()}catch{throw new Error(`Tiingo returned non-JSON HTTP ${r.status}`)}
 if(!r.ok)throw new Error(`Tiingo request failed: ${p?.detail??p?.message??p?.error??r.status}`);
 if(family==="crypto"){const c=Array.isArray(p)?p.find((x:any)=>String(x?.ticker??"").toLowerCase()===symbol.toLowerCase())??p[0]:p;return{rows:Array.isArray(c?.priceData)?c.priceData:[],family}}
 return{rows:Array.isArray(p)?p:[],family};
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return out({error:"Use POST"},405);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("TIINGO_API_TOKEN");
 if(!url||!key||!token)return out({error:"Server configuration missing"},500);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:claimed,error:ce}=await db.rpc("claim_market_history_job");
 if(ce)return out({error:ce.message},500);
 const job=claimed?.[0];if(!job)return out({ok:true,status:"idle"});
 const finish=async(status:string,extra:any={})=>{await db.from("market_history_jobs").update({status,updated_at:new Date().toISOString(),finished_at:new Date().toISOString(),...extra}).eq("id",job.id)};
 const retry=async(message:string)=>{
  if(job.attempts<job.max_attempts){const at=new Date(Date.now()+10*60000).toISOString();await db.from("market_history_jobs").update({status:"pending",next_attempt_at:at,last_error:message.slice(0,4000),updated_at:new Date().toISOString()}).eq("id",job.id);return out({ok:false,status:"retry_scheduled",job_id:job.id,retry_at:at,error:message})}
  await finish("failed",{last_error:message.slice(0,4000)});return out({ok:false,status:"failed",job_id:job.id,error:message});
 };
 try{
  if(!job.instrument_id){await finish("mapping_required",{last_error:"No unique canonical instrument mapping exists."});return out({ok:false,status:"mapping_required",job_id:job.id})}
  const [{data:inst,error:ie},{data:provider,error:pe}]=await Promise.all([
   db.from("instruments").select("id,symbol,asset_type,currency_code,is_active").eq("id",job.instrument_id).single(),
   db.from("data_providers").select("id").eq("provider_code","tiingo").eq("is_active",true).single()
  ]);
  if(ie||!inst)throw new Error(ie?.message??"Instrument missing");
  if(pe||!provider)throw new Error(pe?.message??"Tiingo provider missing");
  const {data:map,error:me}=await db.from("provider_instruments").select("provider_symbol,is_active").eq("provider_id",provider.id).eq("instrument_id",inst.id).eq("is_active",true).maybeSingle();
  if(me)throw new Error(me.message);
  if(!map){await finish("mapping_required",{last_error:"No active Tiingo provider mapping exists."});return out({ok:false,status:"mapping_required",job_id:job.id,symbol:inst.symbol})}

  const {data:cov,error:coe}=await db.from("market_observations").select("observed_at").eq("instrument_id",inst.id).eq("provider_id",provider.id).eq("interval_code","1day").order("observed_at",{ascending:false}).limit(1).maybeSingle();
  if(coe)throw new Error(coe.message);
  const latest=cov?.observed_at?String(cov.observed_at).slice(0,10):null;
  if(job.job_type==="initial_backfill"&&!latest){
   const {data:prior}=await db.from("sync_runs").select("id").eq("status","succeeded").contains("metadata",{function:"backfill-market-history",symbol:inst.symbol,years:5}).limit(1);
   if(prior?.length&&latest&&latest>=addDays(iso(new Date()),-7)){
    await db.rpc("refresh_market_trends_for_instrument",{p_instrument_id:inst.id});
    await finish("already_complete",{coverage_end:latest+"T00:00:00Z",last_error:null});
    return out({ok:true,status:"already_complete",job_id:job.id,symbol:inst.symbol});
   }
   const originally=inst.is_active;if(!originally)await db.from("instruments").update({is_active:true}).eq("id",inst.id);
   try{
    const auth=req.headers.get("authorization")??`Bearer ${key}`,api=req.headers.get("apikey")??key;
    const r=await fetch(`${url}/functions/v1/backfill-market-history`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:auth,apikey:api},body:JSON.stringify({symbol:inst.symbol,years:job.years}),signal:AbortSignal.timeout(90000)});
    let p:any;try{p=await r.json()}catch{p=null}
    if(!r.ok||!p?.ok)throw new Error(String(p?.error??`backfill-market-history HTTP ${r.status}`));
    await db.rpc("refresh_market_trends_for_instrument",{p_instrument_id:inst.id});
    await finish("succeeded",{sync_run_id:p.sync_run_id,requested_start:p.requested?.start_date,requested_end:p.requested?.end_date,coverage_start:p.actual_coverage?.first_observation,coverage_end:p.actual_coverage?.last_observation,received_count:p.received_count,inserted_count:p.inserted_count,last_error:null});
    return out({ok:true,status:"succeeded",job_id:job.id,symbol:inst.symbol,received_count:p.received_count,inserted_count:p.inserted_count});
   }finally{if(!originally)await db.from("instruments").update({is_active:false}).eq("id",inst.id)}
  }

  const end=iso(new Date()),start=latest?addDays(latest,1):yearsAgo(1);
  if(start>end){await db.rpc("refresh_market_trends_for_instrument",{p_instrument_id:inst.id});await finish("already_complete",{requested_start:start,requested_end:end,coverage_end:latest+"T00:00:00Z",received_count:0,inserted_count:0,last_error:null});return out({ok:true,status:"already_complete",job_id:job.id,symbol:inst.symbol})}
  const started=new Date().toISOString();
  const {data:run,error:re}=await db.from("sync_runs").insert({provider_id:provider.id,requested_count:1,status:"running",metadata:{function:"incremental-market-history",provider:"tiingo",symbol:inst.symbol,provider_symbol:map.provider_symbol,asset_type:inst.asset_type,requested_start_date:start,requested_end_date:end,interval:"1day",started_at:started}}).select("id").single();
  if(re||!run)throw new Error(re?.message??"Could not create sync run");
  try{
   const f=await tiingo(token,inst.asset_type,map.provider_symbol,start,end),now=new Date().toISOString(),rows:any[]=[];
   for(const x of f.rows){const raw=String(x?.date??x?.datetime??"").match(/^(\d{4}-\d{2}-\d{2})/);const close=n(x?.close);if(!raw||close===null)continue;rows.push({instrument_id:inst.id,provider_id:provider.id,interval_code:"1day",observed_at:raw[1]+"T00:00:00.000Z",open:n(x?.open),high:n(x?.high),low:n(x?.low),close,adjusted_close:n(x?.adjClose)??close,volume:n(x?.volume),currency_code:inst.currency_code,is_delayed:true,raw_payload:{...x,_backfill:{source:"Tiingo",function:"incremental-market-history",provider_symbol:map.provider_symbol,endpoint_family:f.family,retrieved_at:now,requested_start_date:start,requested_end_date:end}}})}
   for(const c of chunks(rows))if(c.length){const {error:e}=await db.from("market_observations").upsert(c,{onConflict:"instrument_id,provider_id,interval_code,observed_at"});if(e)throw new Error(e.message)}
   const last=rows.length?rows[rows.length-1].observed_at:(latest?latest+"T00:00:00Z":null);
   await db.from("sync_runs").update({finished_at:new Date().toISOString(),received_count:f.rows.length,inserted_count:rows.length,status:"succeeded",metadata:{function:"incremental-market-history",provider:"tiingo",symbol:inst.symbol,provider_symbol:map.provider_symbol,asset_type:inst.asset_type,requested_start_date:start,requested_end_date:end,interval:"1day",normalised_count:rows.length,endpoint_family:f.family}}).eq("id",run.id);
   await db.rpc("refresh_market_trends_for_instrument",{p_instrument_id:inst.id});
   await finish("succeeded",{sync_run_id:run.id,requested_start:start,requested_end:end,coverage_end:last,received_count:f.rows.length,inserted_count:rows.length,last_error:null});
   return out({ok:true,status:"succeeded",job_id:job.id,symbol:inst.symbol,received_count:f.rows.length,upserted_count:rows.length});
  }catch(e){const m=e instanceof Error?e.message:String(e);await db.from("sync_runs").update({finished_at:new Date().toISOString(),status:"failed",error_message:m.slice(0,4000)}).eq("id",run.id);throw e}
 }catch(e){return await retry(e instanceof Error?e.message:String(e))}
});