const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create schema auth; create schema cron;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.owner',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
create function cron.schedule(text,text,text) returns integer language sql as $$select 1$$;
create table public.instruments(id uuid primary key, symbol text, instrument_name text, currency_code text, asset_type text, is_active boolean);
create table public.data_providers(id uuid primary key,provider_code text,is_active boolean);
create table public.provider_instruments(provider_id uuid,instrument_id uuid,is_active boolean);
create table public.gpt_market_runs(run_id uuid primary key,status text,completed_at timestamptz,analysis_cutoff_time timestamptz,model_name text,analysis_mode text);
create table public.gpt_market_assessments(assessment_id uuid primary key,run_id uuid,instrument_id uuid,technical_engine_input_used boolean,rating text,summary text,key_risks text,bear_case text,model_version text,created_at timestamptz);
create table public.watchlists(id uuid primary key,owner_user_id uuid);
create table public.watchlist_items(watchlist_id uuid,instrument_id uuid,added_at timestamptz);
create table public.market_observations(id bigint generated always as identity primary key,instrument_id uuid,provider_id uuid,interval_code text,observed_at timestamptz,loaded_at timestamptz,close numeric,adjusted_close numeric);
`)
await db.exec(readFileSync(new URL('./prediction-ledger-v1.sql', import.meta.url),'utf8'))
const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002'
const stock='00000000-0000-4000-8000-000000000003', benchmark='00000000-0000-4000-8000-000000000004', provider='00000000-0000-4000-8000-000000000005'
const run='00000000-0000-4000-8000-000000000006', assessment='00000000-0000-4000-8000-000000000007', watch='00000000-0000-4000-8000-000000000008'
await assert.rejects(db.exec('select public.start_personal_prediction_tracking_v1()'))
await db.exec(`insert into auth.users values('${owner}'),('${other}'); select set_config('test.owner','${owner}',false); select public.start_personal_prediction_tracking_v1(); select public.start_personal_prediction_tracking_v1();`)
assert.equal((await db.query('select count(*)::int n from personal_prediction_tracking')).rows[0].n,1)
await db.exec(`insert into instruments values('${stock}','TEST','Test share','USD','equity',true),('${benchmark}','QQQ','Benchmark','USD','etf',true);
insert into data_providers values('${provider}','tiingo',true); insert into provider_instruments values('${provider}','${stock}',true);
insert into watchlists values('${watch}','${owner}'); insert into watchlist_items values('${watch}','${stock}',now()-interval '1 hour');
insert into gpt_market_runs values('${run}','succeeded',clock_timestamp(),clock_timestamp(),'test model','scheduled');
insert into gpt_market_assessments values('${assessment}','${run}','${stock}',false,'Buy','Test thesis','Test risk','Test bear','test model',clock_timestamp());
select private.publish_personal_predictions_v1(); select private.publish_personal_predictions_v1();`)
assert.equal((await db.query('select count(*)::int n from personal_prediction_plans')).rows[0].n,2)
await assert.rejects(db.exec("update personal_prediction_plans set thesis='rewrite'"))
await assert.rejects(db.exec('delete from personal_prediction_plans'))
await db.exec(`set role authenticated; select set_config('test.owner','${other}',false);`)
assert.equal((await db.query('select count(*)::int n from personal_prediction_plans')).rows[0].n,0)
await assert.rejects(db.exec('insert into personal_prediction_tracking(owner_user_id) values(gen_random_uuid())'))
await db.exec(`reset role; select set_config('test.owner','${owner}',false); select private.evaluate_personal_predictions_v1();`)
assert.equal((await db.query("select count(*)::int n from personal_prediction_results where status='PENDING_ENTRY'")).rows[0].n,2)
// Synthetic forward fixture starts in the past solely to test evaluation. Never published to production.
await db.exec(`insert into personal_prediction_plans(owner_user_id,assessment_id,instrument_id,symbol,instrument_name,currency,published_at,source_cutoff,source_rating,action,horizon_sessions,entry_deadline,thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id)
select owner_user_id,assessment_id,instrument_id,'TEST-HISTORY',instrument_name,currency,now()-interval '40 days',now()-interval '40 days','Buy','BUY',5,now()-interval '33 days',thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id from personal_prediction_plans where horizon_sessions=5 on conflict do nothing;`)
// Use a second assessment to avoid altering the immutable fresh prediction.
await db.exec(`insert into gpt_market_assessments select '00000000-0000-4000-8000-000000000009',run_id,instrument_id,technical_engine_input_used,rating,summary,key_risks,bear_case,model_version,now()-interval '40 days' from gpt_market_assessments limit 1;
insert into personal_prediction_plans(owner_user_id,assessment_id,instrument_id,symbol,instrument_name,currency,published_at,source_cutoff,source_rating,action,horizon_sessions,entry_deadline,thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id)
select owner_user_id,'00000000-0000-4000-8000-000000000009',instrument_id,'TEST-HISTORY',instrument_name,currency,date_trunc('day',now())-interval '40 days',date_trunc('day',now())-interval '40 days','Buy','BUY',5,now()-interval '33 days',thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id from personal_prediction_plans where horizon_sessions=5;
insert into market_observations(instrument_id,provider_id,interval_code,observed_at,loaded_at,close,adjusted_close)
select i,'${provider}','1day',date_trunc('day',now())-interval '39 days'+n*interval '1 day',date_trunc('day',now())-interval '39 days'+n*interval '1 day'+interval '23 hours',100+n,100+n from generate_series(0,5) n cross join (values('${stock}'::uuid),('${benchmark}'::uuid)) x(i);
select private.evaluate_personal_predictions_v1();`)
const completed=(await db.query("select * from personal_prediction_results where status='COMPLETE'")).rows
assert.equal(completed.length,1)
assert.ok(Math.abs(Number(completed[0].net_return)-(105*.999/(100*1.001)-1))<1e-10)
assert.equal(Number(completed[0].benchmark_return),.05)
await assert.rejects(db.exec('delete from personal_prediction_results'))
await db.exec('select private.evaluate_personal_predictions_v1()')
assert.equal((await db.query("select count(*)::int n from personal_prediction_results where status='COMPLETE'")).rows[0].n,1)
console.log('PASS: migration, owner-only access, authentication, immutable plans/results, enrolment/publication retries, pending outcomes, forward evaluation and benchmark costs.')
await db.close()

