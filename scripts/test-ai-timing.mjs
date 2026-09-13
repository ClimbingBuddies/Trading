import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
const original=readFileSync(new URL('./test-prediction-ledger.mjs',import.meta.url),'utf8')
const setup=original.slice(original.indexOf('await db.exec(`')+15,original.indexOf('`)\nawait db.exec'))
await db.exec(setup)
await db.exec('create role service_role; grant usage on schema public,auth to authenticated,anon;')
await db.exec(readFileSync(new URL('./prediction-ledger-v1.sql',import.meta.url),'utf8'))
await db.exec(readFileSync(new URL('./ai-timing-v2.sql',import.meta.url),'utf8'))
const ids=Array.from({length:10},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const [owner,other,stock,bench,provider,run,ass,watch,history]=ids
await db.exec(`insert into auth.users values('${owner}'),('${other}');
insert into personal_prediction_tracking values('${owner}',now()-interval '2 hours');
insert into instruments values('${stock}','TEST','Test share','USD','equity',true),('${bench}','QQQ','Benchmark','USD','etf',true);
insert into data_providers values('${provider}','tiingo',true);
insert into provider_instruments values('${provider}','${stock}',true),('${provider}','${bench}',true);
insert into watchlists values('${watch}','${owner}'); insert into watchlist_items values('${watch}','${stock}',now()-interval '1 hour');
insert into gpt_market_runs values('${run}','succeeded',now(),now(),'fixture model','scheduled');
insert into gpt_market_assessments values('${ass}','${run}','${stock}',false,'Buy','Source thesis','Source risk','Bear','fixture model',now());
insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close)
select i,'${provider}','1day',date_trunc('day',now())-n*interval '1 day',date_trunc('day',now())-n*interval '1 day'+interval '23 hours',100+n,100+n
from generate_series(1,20)n cross join (values('${stock}'::uuid),('${bench}'::uuid))x(i);`)
const queue=(await db.query('select * from private.ai_timing_candidates_v2()')).rows
assert.equal(queue.length,2); assert.equal(queue[0].block_reason,null)
const hash=queue[0].input_hash
const publish=(delay=2,hold=3,horizon=5,inputHash=hash)=>`select private.publish_ai_timing_v2('${owner}','${ass}',${horizon},'BUY',${delay},${hold},'Forward test thesis with source evidence','Forward test risk from source evidence','Delay two sessions for the stated evidence; hold three sessions.','fixture model','${inputHash}') id`
await assert.rejects(db.exec(publish(5,5)),/Invalid AI timing/)
await assert.rejects(db.exec(publish(2,3,5,'wrong')),/Evidence changed/)
const plan=(await db.query(publish())).rows[0].id
assert.equal((await db.query(publish())).rows[0].id,plan)
assert.equal((await db.query('select count(*)::int n from personal_prediction_plans')).rows[0].n,1)
await assert.rejects(db.exec('update personal_prediction_plans set holding_sessions=1'),/cannot be changed/)
await assert.rejects(db.exec('delete from personal_prediction_plans'),/cannot be changed/)
await db.exec(`set role authenticated; select set_config('test.owner','${other}',false)`)
assert.equal((await db.query('select count(*)::int n from personal_prediction_plans')).rows[0].n,0)
await assert.rejects(db.exec(publish()))
await db.exec(`select set_config('test.owner','${owner}',false)`)
assert.equal((await db.query('select count(*)::int n from personal_prediction_plans')).rows[0].n,1)
await assert.rejects(db.exec("insert into personal_prediction_plans(id) values(gen_random_uuid())"))
await db.exec('reset role; set role anon')
await assert.rejects(db.exec('select * from personal_prediction_plans'))
await db.exec('reset role')
assert.equal((await db.query('select private.publish_personal_predictions_v1() n')).rows[0].n,0)
// Synthetic past publication is a test fixture only. Production helper accepts no timestamp override.
await db.exec(`insert into gpt_market_assessments select '${history}',run_id,instrument_id,technical_engine_input_used,rating,summary,key_risks,bear_case,model_version,created_at from gpt_market_assessments limit 1;
insert into personal_prediction_plans(owner_user_id,assessment_id,instrument_id,symbol,instrument_name,currency,published_at,source_cutoff,source_rating,action,horizon_sessions,entry_deadline,thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id,entry_rule,exit_rule,methodology,entry_delay_sessions,holding_sessions,timing_reason,input_hash)
select owner_user_id,'${history}',instrument_id,symbol,instrument_name,currency,date_trunc('day',now())-interval '40 days',date_trunc('day',now())-interval '40 days',source_rating,action,horizon_sessions,date_trunc('day',now())-interval '26 days',thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id,entry_rule,exit_rule,methodology,entry_delay_sessions,holding_sessions,timing_reason,input_hash from personal_prediction_plans where id='${plan}';
insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close)
select i,'${provider}','1day',date_trunc('day',now())-interval '39 days'+n*interval '1 day',date_trunc('day',now())-interval '39 days'+n*interval '1 day'+interval '23 hours',100+n,100+n from generate_series(0,5)n cross join (values('${stock}'::uuid),('${bench}'::uuid))x(i);
delete from market_observations where instrument_id='${stock}' and observed_at=date_trunc('day',now())-interval '38 days';
select private.evaluate_personal_predictions_v1();`)
assert.equal((await db.query("select count(*)::int n from personal_prediction_results where status='OPEN'")).rows[0].n,0,'Missing intended entry must not move to a later stock session')
await db.exec(`insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close) values('${stock}','${provider}','1day',date_trunc('day',now())-interval '38 days',date_trunc('day',now())-interval '38 days'+interval '23 hours',101,101); select private.evaluate_personal_predictions_v1();`)
const outcome=(await db.query("select * from personal_prediction_results where status='COMPLETE'")).rows[0]
assert.ok(outcome)
assert.equal(Number(outcome.entry_price),101); assert.equal(Number(outcome.exit_price),104)
assert.ok(Math.abs(Number(outcome.net_return)-(104*.999/(101*1.001)-1))<1e-10)
await db.exec('select private.evaluate_personal_predictions_v1()')
assert.equal((await db.query("select count(*)::int n from personal_prediction_results where status='COMPLETE'")).rows[0].n,1)
await assert.rejects(db.exec("update personal_prediction_results set net_return=1"),/cannot be changed/)
// Stale evidence and unsupported currencies fail closed.
await db.exec(`update gpt_market_runs set analysis_cutoff_time=now()-interval '3 days'`)
assert.ok((await db.query('select * from private.ai_timing_candidates_v2()')).rows.every(r=>r.block_reason))
console.log('PASS AI timing: schema, prompt hash, validation, idempotency, owner/anonymous isolation, immutable plans/results, variable entry/exit, missing-session refusal, stale-source rejection, cost calculation.')
await db.close()