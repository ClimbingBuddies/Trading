import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
await db.exec("set timezone='UTC'")
const original=readFileSync(new URL('./test-prediction-ledger.mjs',import.meta.url),'utf8')
const setup=original.slice(original.indexOf('await db.exec(`')+15,original.indexOf('`)\nawait db.exec'))
await db.exec(setup)
await db.exec('create role service_role; grant usage on schema public,auth to authenticated,anon;')
await db.exec(readFileSync(new URL('./prediction-ledger-v1.sql',import.meta.url),'utf8'))
await db.exec(readFileSync(new URL('./ai-timing-v2.sql',import.meta.url),'utf8'))
await db.exec(readFileSync(new URL('./decision-journal-v3.sql',import.meta.url),'utf8'))
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
const queue=(await db.query('select * from private.decision_candidates_v3()')).rows
assert.equal(queue.length,1); assert.equal(queue[0].block_reason,null)
const hash=queue[0].input_hash
const pub=()=>`select private.publish_decision_v3('${owner}','${ass}','WAIT','The evidence supports waiting for stronger conditions.','Risks remain material and prices can fall further.','fixture model','${hash}') id`
const root=(await db.query(pub())).rows[0].id
assert.equal((await db.query(pub())).rows[0].id,root)
assert.equal((await db.query('select count(*)::int n from personal_decision_events')).rows[0].n,1)
await assert.rejects(db.exec("update personal_decision_events set note='rewrite'"))
await assert.rejects(db.exec('delete from personal_prediction_plans'))
await db.exec(`set role authenticated; select set_config('test.owner','${other}',false)`)
assert.equal((await db.query('select count(*)::int n from personal_decision_events')).rows[0].n,0)
assert.equal((await db.query('select count(*)::int n from personal_recommendation_views_v3')).rows[0].n,0)
await assert.rejects(db.exec(`select public.append_personal_decision_note_v3('${root}','BUY','My test note','${ids[9]}')`))
await db.exec(`select set_config('test.owner','${owner}',false)`)
assert.equal((await db.query('select count(*)::int n from personal_recommendation_views_v3')).rows[0].n,2)
const noteSql=`select public.append_personal_decision_note_v3('${root}','BUY','My personal buy view, separate from the AI.','${ids[9]}') id`
const noteId=(await db.query(noteSql)).rows[0].id
assert.equal((await db.query(noteSql)).rows[0].id,noteId)
await assert.rejects(db.exec("insert into personal_decision_outcomes(prediction_id) values(gen_random_uuid())"))
await db.exec('reset role; set role anon')
await assert.rejects(db.exec('select * from personal_decision_events'))
await assert.rejects(db.exec(noteSql))
await db.exec('reset role; select private.evaluate_decisions_v3()')
assert.equal((await db.query('select count(*)::int n from personal_decision_outcomes')).rows[0].n,0,'A user BUY note must not enter an AI position')

// Future fresh assessments append to the same immutable root, not replace it.
const nextAss='10000000-0000-4000-8000-000000000001',nextRun='10000000-0000-4000-8000-000000000002'
await db.exec(`insert into gpt_market_runs values('${nextRun}','succeeded',clock_timestamp(),clock_timestamp(),'fixture model','scheduled');
insert into gpt_market_assessments values('${nextAss}','${nextRun}','${stock}',false,'Buy','New thesis','New risk','Bear','fixture model',clock_timestamp())`)
const nextQ=(await db.query('select * from private.decision_candidates_v3()')).rows[0]
assert.equal(nextQ.prediction_id,root)
const updated=(await db.query(`select private.publish_decision_v3('${owner}','${nextAss}','BUY','New evidence supports a prospective buy decision.','The new view still has substantial downside risk.','fixture model','${nextQ.input_hash}') id`)).rows[0].id
assert.equal(updated,root)
assert.equal((await db.query(`select action from personal_prediction_plans where id='${root}'`)).rows[0].action,'HOLD')
assert.equal((await db.query(`select count(*)::int n from personal_decision_events where prediction_id='${root}' and actor='AI'`)).rows[0].n,2)
await db.exec('select private.evaluate_personal_predictions_v1()')
assert.equal((await db.query('select count(*)::int n from personal_prediction_results')).rows[0].n,0,'Legacy evaluator must not apply forced timing to v3')

// Synthetic historical fixtures only, never inserted into production.
await db.exec('delete from market_observations')
await db.exec(`insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close)
select i,'${provider}','1day',date_trunc('day',now())-interval '39 days'+n*interval '1 day',date_trunc('day',now())-interval '39 days'+n*interval '1 day'+interval '23 hours',100+n,100+n
from generate_series(0,38)n cross join(values('${stock}'::uuid),('${bench}'::uuid))x(i);`)
async function fixture(seed,sellDay=null){
 const a=`20000000-0000-4000-8000-${String(seed).padStart(12,'0')}`
 await db.exec(`insert into gpt_market_assessments select '${a}',run_id,instrument_id,technical_engine_input_used,rating,summary,key_risks,bear_case,model_version,created_at from gpt_market_assessments limit 1`)
 const p=(await db.query(`insert into personal_prediction_plans(owner_user_id,assessment_id,instrument_id,symbol,instrument_name,currency,published_at,source_cutoff,source_rating,action,horizon_sessions,entry_rule,exit_rule,entry_deadline,thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id,methodology,entry_delay_sessions,holding_sessions,input_hash)
 select owner_user_id,'${a}',instrument_id,symbol,instrument_name,currency,date_trunc('day',now())-interval '40 days',date_trunc('day',now())-interval '40 days',source_rating,'BUY',20,entry_rule,exit_rule,date_trunc('day',now())-interval '26 days',thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id,methodology,entry_delay_sessions,holding_sessions,input_hash from personal_prediction_plans where id='${root}' returning id`)).rows[0].id
 await db.exec(`insert into personal_decision_events(prediction_id,owner_user_id,actor,action,published_at,assessment_id,note,model_identity,source_snapshot,input_hash)
 values('${p}','${owner}','AI','BUY',date_trunc('day',now())-interval '40 days','${a}','Synthetic initial buy','fixture','{}','fixture')`)
 if(sellDay!==null)await db.exec(`insert into personal_decision_events(prediction_id,owner_user_id,actor,action,published_at,assessment_id,note,model_identity,source_snapshot,input_hash)
 values('${p}','${owner}','AI','SELL',date_trunc('day',now())-interval '${sellDay} days','${ass}','Synthetic later sell','fixture','{}','fixture')`)
 return p
}
const closed=await fixture(1,32),open=await fixture(2),missing=await fixture(3)
await db.exec(`insert into personal_decision_events(prediction_id,owner_user_id,actor,action,published_at,assessment_id,note,model_identity,source_snapshot,input_hash)
values('${open}','${owner}','AI','REDUCE',date_trunc('day',now())-interval '30 days','${ass}','Reduce advisory, no size specified','fixture','{}','fixture')`)
await db.exec('select private.evaluate_decisions_v3()')
const rows=(await db.query(`select * from personal_decision_outcomes where prediction_id='${closed}'`)).rows
const exit=rows.find(r=>r.kind==='EXIT')
assert.equal(Number(exit.price),108)
assert.ok(Math.abs(Number(exit.net_return)-(108*.999/(100*1.001)-1))<1e-10)
assert.ok(rows.find(r=>r.kind==='CHECKPOINT_5'))
assert.ok(!rows.find(r=>r.kind==='CHECKPOINT_20'),'A checkpoint after closure cannot use a hypothetical continuing position')
const openRows=(await db.query(`select * from personal_decision_outcomes where prediction_id='${open}'`)).rows
assert.ok(openRows.find(r=>r.kind==='CHECKPOINT_20'))
assert.ok(!openRows.find(r=>r.kind==='EXIT'),'No sell call means no forced exit; REDUCE is advisory')
const before=(await db.query('select count(*)::int n from personal_decision_outcomes')).rows[0].n
await db.exec('select private.evaluate_decisions_v3()')
assert.equal((await db.query('select count(*)::int n from personal_decision_outcomes')).rows[0].n,before)
await assert.rejects(db.exec('delete from personal_decision_outcomes'))
// Entry corrections do not rewrite the recorded entry or generate flattering revised returns.
await db.exec(`update market_observations set close=999 where instrument_id='${stock}' and observed_at=date_trunc('day',now())-interval '39 days'; select private.evaluate_decisions_v3();`)
assert.ok((await db.query(`select 1 from personal_decision_outcomes where prediction_id='${open}' and kind='DATA_GAP'`)).rows.length)
assert.equal(Number((await db.query(`select price from personal_decision_outcomes where prediction_id='${open}' and kind='ENTRY'`)).rows[0].price),100)
const absent=await fixture(4,32),cancelled=await fixture(5,39.98)
await db.exec(`delete from market_observations where instrument_id='${stock}' and observed_at=date_trunc('day',now())-interval '39 days'; set timezone='Australia/Perth'; select private.evaluate_decisions_v3();`)
assert.equal((await db.query(`select count(*)::int n from personal_decision_outcomes where prediction_id='${absent}' and kind='ENTRY'`)).rows[0].n,0)
assert.equal((await db.query(`select count(*)::int n from personal_decision_outcomes where prediction_id='${absent}' and kind='CANCELLED'`)).rows[0].n,0,'Missing prices do not prove there was no entry')
assert.equal((await db.query(`select count(*)::int n from personal_decision_outcomes where prediction_id='${cancelled}' and kind='CANCELLED'`)).rows[0].n,1,'Same-day withdrawal precedes any eligible entry')
console.log('PASS journal v3: append-only calls, linked updates, personal-note isolation/idempotency, owner/anonymous/view permissions, legacy separation, signal exits, checkpoints without forced sales, REDUCE advisory, immutable price evidence and correction handling.')
await db.close()
