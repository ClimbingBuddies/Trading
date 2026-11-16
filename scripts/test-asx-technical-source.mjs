// Synthetic actual PostgreSQL tests; no network, credentials, or production data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = await readFile('supabase/migrations/20261115235043_add_asx_technical_sources_v1.sql', 'utf8');
const instrument = '00000000-0000-0000-0000-000000000001';
const provider = '00000000-0000-0000-0000-000000000002';
const anchor = '00000000-0000-0000-0000-000000000100';
const child = '00000000-0000-0000-0000-000000000101';
const cutoff = '2025-11-15T05:00:00Z';
const basis = 'Yahoo native OHLC plus separately supplied adjusted close';
let passed = 0;
const snapshot = async (at = cutoff) => (await db.query('select technical_engine.asx_source_snapshot_v1($1::uuid,$2::timestamptz) as result', [instrument, at])).rows[0].result;
async function check(name, change, verify) {
  await db.exec('begin');
  try { await change(); await verify(await snapshot()); passed++; console.log('PASS:', name); }
  finally { await db.exec('rollback'); }
}
const blocked = reason => result => { assert.equal(result.status, 'blocked', JSON.stringify(result)); if (reason) assert.equal(result.reason, reason); };
const ready = result => { assert.equal(result.status, 'ready', JSON.stringify(result)); assert.match(result.source_hash, /^[0-9a-f]{64}$/); };
const amend = async (patch, id = anchor) => db.query('update sync_runs set metadata=metadata||$1::jsonb where id=$2::uuid', [JSON.stringify(patch), id]);
async function makeV8(id = anchor) {
  await db.query(`update sync_runs s set metadata=metadata || jsonb_build_object(
    'history_window_version',1,'instrument_id',$1::text,'previous_audit_id',null,
    'accepted_provider_dates',(select jsonb_agg(to_char(observed_at at time zone 'UTC','YYYY-MM-DD') order by observed_at) from market_observations),
    'fetch_attempts',jsonb_build_array(jsonb_build_object('requested_start_date',metadata->>'requested_start_date',
      'requested_end_date',metadata->>'requested_end_date','retrieved_at',metadata->>'retrieved_at',
      'valid_rows',metadata->'valid_rows','rejected_bars','[]'::jsonb,'duplicate_bars','[]'::jsonb,'events','{}'::jsonb))) where id=$2::uuid`, [instrument, id]);
}
async function addChild() {
  await db.query(`insert into sync_runs select $1::uuid,provider_id,'2025-11-15T02:00Z','2025-11-15T02:02Z','succeeded',1,
    (select count(*) from market_observations where observed_at >= '2025-11-01Z'),0,
    metadata || jsonb_build_object('history_window_version',1,'instrument_id',$2::text,'previous_audit_id',id::text,
      'requested_start_date','2025-11-01','retrieved_at','2025-11-15T02:01:00.000Z',
      'valid_rows',(select count(*) from market_observations where observed_at >= '2025-11-01Z'),
      'accepted_provider_dates',(select jsonb_agg(to_char(observed_at at time zone 'UTC','YYYY-MM-DD') order by observed_at) from market_observations))
    from sync_runs where id=$3::uuid`, [child, instrument, anchor]);
  await db.query(`update sync_runs set metadata = metadata || jsonb_build_object('fetch_attempts',jsonb_build_array(jsonb_build_object(
    'requested_start_date',metadata->>'requested_start_date','requested_end_date',metadata->>'requested_end_date',
    'retrieved_at',metadata->>'retrieved_at','valid_rows',metadata->'valid_rows','rejected_bars','[]'::jsonb,'duplicate_bars','[]'::jsonb,'events','{}'::jsonb))) where id=$1::uuid`, [child]);
  await db.exec(`update market_observations set raw_payload=jsonb_set(raw_payload,'{_backfill}',raw_payload->'_backfill'||
    '{"requested_start_date":"2025-11-01","retrieved_at":"2025-11-15T02:01:00.000Z"}'::jsonb) where observed_at >= '2025-11-01Z'`);
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table instruments(id uuid primary key,is_active boolean,symbol text,exchange_code text,asset_type text,currency_code text);
    create table data_providers(id uuid primary key,provider_code text,is_active boolean);
    create table sync_runs(id uuid primary key,provider_id uuid,started_at timestamptz,finished_at timestamptz,status text,
      requested_count int,received_count int,inserted_count int,metadata jsonb);
    create table market_observations(id bigint primary key,instrument_id uuid,provider_id uuid,interval_code text,observed_at timestamptz,
      open numeric(20,8),high numeric(20,8),low numeric(20,8),close numeric(20,8),adjusted_close numeric(20,8),volume numeric(24,4),currency_code text,loaded_at timestamptz,raw_payload jsonb);
    grant select on all tables in schema public to service_role;
    insert into instruments values ('${instrument}',true,'TEST','ASX','equity','AUD');
    insert into data_providers values ('${provider}','yahoo',true);`);
  await db.exec(sql);
  await db.query(`insert into market_observations select row_number() over(order by d),$1::uuid,$2::uuid,'1day',d,
    10,12,9,11,10.5,100,'AUD','2025-11-15T00:01Z',
    jsonb_build_object('date',to_char(d at time zone 'UTC','YYYY-MM-DD'),'open',10,'high',12,'low',9,'close',11,'adjusted_close',10.5,'volume',100,
      '_backfill',jsonb_build_object('function','asx-yahoo-market-history','provider','yahoo','symbol','TEST','provider_symbol','TEST.AX',
      'exchange','ASX','requested_start_date','2024-11-14','requested_end_date','2025-11-14','price_basis',$3::text,
      'retrieved_at','2025-11-15T00:01:00.000Z','source','Yahoo Finance'))
    from generate_series('2024-11-14Z'::timestamptz,'2025-11-14Z'::timestamptz,interval '1 day') d where extract(isodow from d) <=5`, [instrument, provider, basis]);
  await db.query(`insert into sync_runs values ($1::uuid,$2::uuid,'2025-11-15T00:00Z','2025-11-15T00:02Z','succeeded',1,
    (select count(*) from market_observations),(select count(*) from market_observations),
    jsonb_build_object('function','asx-yahoo-market-history','provider','yahoo','symbol','TEST','provider_symbol','TEST.AX','exchange','ASX',
    'price_basis',$3::text,'requested_start_date','2024-11-14','requested_end_date','2025-11-14','retrieved_at','2025-11-15T00:01:00.000Z',
    'coverage_has_rejected_bars',false,'rejected_bars','[]'::jsonb,'duplicate_bars','[]'::jsonb,'events','{}'::jsonb,
    'valid_rows',(select count(*) from market_observations)))`, [anchor, provider, basis]);
  const baseline = await snapshot(); ready(baseline);
  assert.equal(baseline.anchor_audit_id, anchor); assert.equal(baseline.observations.length, 262);
  assert.equal(baseline.window_start, '2024-11-14'); assert.equal(baseline.window_end, '2025-11-14');
  assert.equal(baseline.audits[0].id,anchor);
  // Reproduce from native JSONB, as the SQL-owned immutable snapshot does.
  // A JS number roundtrip discards numeric typmod scale from jsonb::text.
  const reproduction=(await db.query(`with captured as materialized (select technical_engine.asx_source_snapshot_v1($1::uuid,$2::timestamptz) as s)
    select s->>'source_hash' as hash,encode(sha256(convert_to((s-'source_hash'-'cutoff_at')::text,'UTF8')),'hex') as reproduced from captured`,[instrument,cutoff])).rows[0];
  assert.equal(reproduction.hash,reproduction.reproduced);
  passed++;
  await check('function is read-only and service role can execute', async () => { await db.exec('set transaction read only; set local role service_role'); }, ready);
  await check('clean v8 full anchor', () => makeV8(), ready);
  await check('clean overlap inherits anchor, not its shorter fetch window', addChild, r => { ready(r); assert.deepEqual(r.audit_ids,[anchor,child]); assert.equal(r.window_start,'2024-11-14'); });
  await check('inherited resolved correction is not mistaken for full fetch', async () => {
    await makeV8(); await amend({correction:{state:'resolved',completed_provider_attempt:true,unresolved_dates:[]}}); await addChild();
  }, r => { ready(r); assert.equal(r.anchor_audit_id,anchor); });
  await check('cutoff alone does not change source fingerprint', async () => {}, async r => { assert.equal(r.source_hash,(await snapshot('2025-11-15T06:00Z')).source_hash); });
  for (const [name, mutation] of [
    ['wrong exchange', "update instruments set exchange_code='NYSE'"],
    ['null exchange', 'update instruments set exchange_code=null'],
    ['null asset type', 'update instruments set asset_type=null'],
    ['null currency', 'update instruments set currency_code=null'],
    ['wrong currency', "update instruments set currency_code='USD'"],
    ['inactive', 'update instruments set is_active=false'],
    ['non-equity', "update instruments set asset_type='forex'"],
    ['provider duplicate', `insert into data_providers values ('00000000-0000-0000-0000-000000000003','yahoo',true)`],
    ['missing provider', 'delete from data_providers'],
    ['audit failure', "update sync_runs set status='failed'"],
    ['audit running', "update sync_runs set status='running',finished_at=null"],
    ['null audit status', 'update sync_runs set status=null'],
    ['nonfinite value', "update market_observations set adjusted_close='NaN' where observed_at='2025-11-14Z'"],
    ['missing adjusted close', "update market_observations set adjusted_close=null where observed_at='2025-11-14Z'"],
    ['raw value mismatch', "update market_observations set adjusted_close=9 where observed_at='2025-11-14Z'"],
    ['date not midnight', "update market_observations set observed_at=observed_at+interval '1 hour' where observed_at='2025-11-14Z'"],
    ['deleted date', "delete from market_observations where observed_at='2025-11-14Z'"],
    ['wrong row currency', "update market_observations set currency_code='USD' where observed_at='2025-11-14Z'"]
  ]) await check(name, () => db.exec(mutation), blocked());
  await check('quarantine survives stored valid row', () => amend({rejected_bars:[{date:'2025-11-14'}],coverage_has_rejected_bars:true}), blocked('UNRESOLVED_SOURCE_QUALITY'));
  await check('succeeded preserved closes are not analytical success', () => amend({daily_closes_preserved_while_gap_unresolved:true}), blocked());
  await check('unresolved correction blocks', () => amend({correction:{state:'unresolved',unresolved_dates:['2025-11-14']}}), blocked());
  await check('broken predecessor blocks', async () => { await addChild(); await amend({previous_audit_id:'00000000-0000-0000-0000-000000000999'},child); }, blocked('BROKEN_AUDIT_CHAIN'));
  await check('self cycle blocks', async () => { await addChild(); await amend({previous_audit_id:child},child); }, blocked());
  await check('two-node cycle through full anchor blocks', async () => { await makeV8(); await addChild(); await amend({previous_audit_id:child}); }, blocked('BROKEN_AUDIT_CHAIN'));
  await check('intervening fork cannot be skipped', async () => { await addChild(); await db.query(`insert into sync_runs select '00000000-0000-0000-0000-000000000102',provider_id,'2025-11-15T01:00Z','2025-11-15T01:02Z',status,requested_count,received_count,inserted_count,metadata from sync_runs where id=$1::uuid`,[anchor]); }, blocked());
  await check('overlap must not run concurrently', async () => { await addChild(); await db.query(`update sync_runs set started_at='2025-11-15T00:01Z' where id=$1::uuid`,[child]); }, blocked('BROKEN_AUDIT_CHAIN'));
  await check('descendant cannot claim more returned rows than persisted', async () => { await addChild();
    await db.query(`update sync_runs set received_count=received_count+1, metadata=jsonb_set(jsonb_set(metadata,'{valid_rows}',to_jsonb(received_count+1)),
      '{fetch_attempts,0,valid_rows}',to_jsonb(received_count+1)) where id=$1::uuid`,[child]);
  }, blocked('UNCONFIRMED_DATE_COVERAGE'));
  await check('newer legacy overlap unsupported', async () => { await addChild(); await db.query("update sync_runs set metadata=metadata-'history_window_version' where id=$1::uuid",[child]); }, blocked('UNSUPPORTED_LEGACY_DESCENDANT'));
  await check('v8 audit rejected in first attempt cannot hide behind clean final', async () => {
    await makeV8(); await db.exec(`update sync_runs set metadata=jsonb_set(metadata,'{fetch_attempts}',jsonb_build_array(
      (metadata->'fetch_attempts'->0)||'{"rejected_bars":[{"date":"2025-11-14"}]}'::jsonb,metadata->'fetch_attempts'->0))`);
  }, blocked());
  await check('unknown row provenance blocks', () => db.exec(`update market_observations set raw_payload=jsonb_set(raw_payload,'{_backfill,retrieved_at}','"2025-11-15T00:00:59Z"') where observed_at='2025-11-14Z'`), blocked('UNVERIFIED_ROW_PROVENANCE'));
  await check('mutated values retaining IDs and loaded_at change fingerprint', () => db.exec(`update market_observations set adjusted_close=9,raw_payload=jsonb_set(raw_payload,'{adjusted_close}','9') where observed_at='2025-11-14Z'`), r => { ready(r); assert.notEqual(r.source_hash,baseline.source_hash); });
  await check('audit mutation changes fingerprint', () => amend({review_note:'new audit evidence'}), r => { ready(r); assert.notEqual(r.source_hash,baseline.source_hash); });
  await check('session timezone cannot change fingerprint', () => db.exec("set local timezone='America/New_York'"), r => { ready(r); assert.equal(r.source_hash,baseline.source_hash); });
  await check('null volume permitted without substitution', () => db.exec(`update market_observations set volume=null,raw_payload=jsonb_set(raw_payload,'{volume}','null') where observed_at='2025-11-14Z'`), r => { ready(r); assert.equal(r.observations.at(-1).volume,null); });
  await check('all native fields use actual database precision rather than raw equality', () => db.exec(`update market_observations set
    open=10.123456789,high=12.123456789,low=9.123456789,close=11.123456789,adjusted_close=10.623456789,volume=100.1234567,
    raw_payload=raw_payload||'{"open":10.123456789,"high":12.123456789,"low":9.123456789,"close":11.123456789,"adjusted_close":10.623456789,"volume":100.1234567}'::jsonb
    where observed_at='2025-11-14Z'`), r => { ready(r); const last=r.observations.at(-1); assert.equal(last.close,11.12345679); assert.equal(last.volume,100.1235); assert.equal(typeof last.id,'number'); });
  for (const [field, raw, expected] of [
    ['close','11.000000004',11], ['close','11.000000005',11.00000001],
    ['adjusted_close','10.500000004999',10.5], ['adjusted_close','10.500000005',10.50000001],
    ['volume','100.00004999',100], ['volume','100.00005',100.0001]
  ]) await check(`defined rounding ${field} ${raw}`, () => db.exec(`update market_observations set ${field}=${raw},
    raw_payload=jsonb_set(raw_payload,'{${field}}','${raw}'::jsonb) where observed_at='2025-11-14Z'`), r => { ready(r); assert.equal(r.observations.at(-1)[field],expected); });
  await check('one persisted price unit mismatch is not tolerated', () => db.exec(`update market_observations set close=11.00000001,
    raw_payload=jsonb_set(raw_payload,'{close}','11.000000004') where observed_at='2025-11-14Z'`), blocked('INVALID_OBSERVATION'));
  await check('one persisted volume unit mismatch is not tolerated', () => db.exec(`update market_observations set volume=100.0001,
    raw_payload=jsonb_set(raw_payload,'{volume}','100.00004') where observed_at='2025-11-14Z'`), blocked('INVALID_OBSERVATION'));
  await check('negative native volume cannot be accepted by rounding to zero', () => db.exec(`update market_observations set volume=-0.00001,
    raw_payload=jsonb_set(raw_payload,'{volume}','-0.00001') where observed_at='2025-11-14Z'`), blocked('INVALID_OBSERVATION'));
  await check('positive adjusted close rounding to zero remains unusable', () => db.exec(`update market_observations set adjusted_close=0.000000001,
    raw_payload=jsonb_set(raw_payload,'{adjusted_close}','0.000000001') where observed_at='2025-11-14Z'`), blocked('INVALID_OBSERVATION'));
  await check('invalid native OHLC cannot be hidden by storage rounding', () => db.exec(`update market_observations set high=10.999999999,
    raw_payload=jsonb_set(raw_payload,'{high}','10.999999999') where observed_at='2025-11-14Z'`), blocked('INVALID_OBSERVATION'));
  await check('Sydney current date excluded despite prior UTC date', async () => {}, async () => { blocked()(await snapshot('2025-11-14T12:00Z')); });
  await check('old incompatible generation is ignored', () => db.exec(`insert into market_observations select 999,instrument_id,provider_id,interval_code,'2020-01-01Z',open,high,low,close,1,volume,currency_code,loaded_at,'{}' from market_observations limit 1`), r => { ready(r); assert.equal(r.source_hash,baseline.source_hash); });
  await check('a valid sparse source remains ready without claiming indicator sufficiency', async () => {
    await db.exec(`delete from market_observations where observed_at < '2025-11-13Z'; update sync_runs set received_count=2,inserted_count=2,metadata=metadata||'{"valid_rows":2}'::jsonb`);
  }, r => { ready(r); assert.equal(r.observations.length,2); });
  await check('Tiingo rows never join the Yahoo series', () => db.exec(`insert into market_observations select 998,instrument_id,'00000000-0000-0000-0000-000000000003',interval_code,observed_at,open,high,low,close,1,volume,currency_code,loaded_at,'{}' from market_observations limit 1`), r => { ready(r); assert.equal(r.source_hash,baseline.source_hash); });
  for (const role of ['anon','authenticated']) {
    await db.exec('begin');
    try { await db.exec(`set local role ${role}`); await assert.rejects(snapshot(), /permission denied/); passed++; }
    finally { await db.exec('rollback'); }
  }
  const definition=(await db.query("select prosecdef,provolatile,proconfig from pg_proc where oid='technical_engine.asx_source_snapshot_v1(uuid,timestamptz)'::regprocedure")).rows[0];
  assert.equal(definition.prosecdef,false); assert.equal(definition.provolatile,'s');
  assert.ok(definition.proconfig.includes('search_path=""')); passed++;
  console.log(`PASS: ${passed} scenarios; actual migration; isolated PostgreSQL; no live data`);
} finally { await db.close(); }
