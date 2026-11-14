// Isolated PostgreSQL recovery checks. No hosted connection or persistent data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const provider = id(99), ids = Array.from({ length: 16 }, (_, n) => id(n + 1));
let scenarios = 0;
const time = value => db.query("select set_config('test.now',$1,false)", [value]);
const claim = async () => (await db.query('select * from claim_twelve_data_cycle_batch_v1($1,$2::uuid[])', [provider, ids])).rows[0];
const recover = async () => (await db.query('select * from recover_twelve_data_interrupted_runs_v1($1)', [provider])).rows;
const get = async run => (await db.query('select * from sync_runs where id=$1', [run])).rows[0];
async function scenario(name, fn) {
  await db.exec('begin'); await time('2026-11-14T03:00:00Z');
  try { await fn(); scenarios++; console.log('PASS ' + name); } finally { await db.exec('rollback'); }
}
async function rejected(fn, pattern) {
  await db.exec('savepoint expected_failure'); await assert.rejects(fn, pattern); await db.exec('rollback to savepoint expected_failure');
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table data_providers(id uuid primary key,provider_code text);
    create table instruments(id uuid primary key,is_active boolean);
    create table provider_instruments(provider_id uuid,instrument_id uuid,is_active boolean);
    create table sync_runs(id uuid primary key default gen_random_uuid(),provider_id uuid,
      requested_count int default 0,received_count int default 0,inserted_count int default 0,
      status text default 'running',metadata jsonb default '{}',error_message text,
      started_at timestamptz default current_setting('test.now')::timestamptz,finished_at timestamptz);
    create table market_observations(id uuid primary key default gen_random_uuid(),instrument_id uuid,close numeric);`);
  await db.query('insert into data_providers values($1,$2)', [provider, 'twelvedata']);
  for (const instrument of ids) {
    await db.query('insert into instruments values($1,true)', [instrument]);
    await db.query('insert into provider_instruments values($1,$2,true)', [provider, instrument]);
  }
  const source = readFileSync('scripts/market-quotes-interruption-recovery.sql', 'utf8');
  assert.equal(source.split('clock_timestamp()').length - 1, 2);
  await db.exec(source.replaceAll('clock_timestamp()', "current_setting('test.now')::timestamptz"));

  await scenario('service-only recovery and claim ACL deny anonymous/authenticated users', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set local role ' + role);
      await rejected(recover, /permission denied/); await rejected(claim, /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set local role service_role');
    assert.equal((await claim()).claim_status, 'claimed');
    assert.equal((await recover())[0].recovery_status, 'not_expired');
    await db.exec('reset role');
  });
  await scenario('crash after five writes preserves observations and unknown counts, then recovery is idempotent', async () => {
    const first = await claim();
    for (const instrument of ids.slice(0, 5)) await db.query('insert into market_observations(instrument_id,close) values($1,100)', [instrument]);
    await db.query("update sync_runs set metadata=jsonb_set(metadata,'{cycle_version}','2'),error_message='prior sanitized diagnostic' where id=$1", [first.sync_run_id]);
    const before = await get(first.sync_run_id);
    await time('2026-11-14T03:10:00Z'); assert.equal((await recover())[0].recovery_status, 'not_expired');
    await time('2026-11-14T03:10:00.001Z'); assert.equal((await recover())[0].recovery_status, 'recovered_interruption');
    const after = await get(first.sync_run_id);
    assert.equal(after.status, 'failed'); assert.equal(after.error_message, before.error_message);
    assert.equal(after.received_count, 0); assert.equal(after.inserted_count, 0);
    assert.equal(after.metadata.completion_counts_verified, false);
    assert.deepEqual(after.metadata.selected_instrument_ids, before.metadata.selected_instrument_ids);
    assert.equal(after.metadata.interruption_recovery.prior_status, 'running');
    assert.equal((await db.query('select count(*)::int n from market_observations')).rows[0].n, 5);
    assert.deepEqual(await recover(), []); assert.deepEqual(await get(first.sync_run_id), after);
    assert.equal((await claim()).claim_status, 'batch_cooldown');
    await time('2026-11-14T03:11:00.001Z');
    assert.deepEqual((await claim()).selected_instrument_ids, ids.slice(8));
  });
  await scenario('partial acknowledged progress is retained without certifying total completion', async () => {
    const r = await claim();
    await db.query('update sync_runs set received_count=5,inserted_count=4 where id=$1', [r.sync_run_id]);
    await time('2026-11-14T03:20:00Z'); await recover();
    const saved = await get(r.sync_run_id);
    assert.equal(saved.received_count, 5); assert.equal(saved.inserted_count, 4);
    assert.equal(saved.metadata.completion_counts_verified, false);
    assert.equal(saved.metadata.interruption_recovery.retained_inserted_count, 4);
  });
  await scenario('claim automatically recovers expired receipts before its outside-window check', async () => {
    const first = await claim(); await time('2026-11-14T03:20:00Z');
    assert.equal((await claim()).claim_status, 'outside_refresh_window');
    assert.equal((await get(first.sync_run_id)).status, 'failed');
  });
  await scenario('recent receipt remains running and blocks overlap', async () => {
    const first = await claim(); await time('2026-11-14T03:09:59Z');
    assert.equal((await claim()).claim_status, 'batch_running'); assert.equal((await get(first.sync_run_id)).status, 'running');
  });
  for (const [name, expression] of [
    ['unknown version', "jsonb_set(metadata,'{cycle_version}','4')"],
    ['string version', `jsonb_set(metadata,'{cycle_version}','"2"')`],
    ['wrong batch size', "jsonb_set(metadata,'{batch_size}','7')"],
    ['bad selected ID', `jsonb_set(metadata,'{selected_instrument_ids}','["bad"]')`],
    ['duplicate selected IDs', `jsonb_set(metadata,'{selected_instrument_ids}','["${ids[0]}","${ids[0]}"]')`],
    ['bad timestamp', `jsonb_set(metadata,'{evaluated_at}','"not a timestamp"')`],
    ['future timestamp', `jsonb_set(metadata,'{evaluated_at}','"2026-11-15T03:00:00Z"')`],
    ['wrong cycle anchor', `jsonb_set(metadata,'{cycle_started_at}','"2026-11-14T02:00:00Z"')`],
    ['equivalent noncanonical cycle key', `jsonb_set(metadata,'{cycle_started_at}','"2026-11-14 03:00:00+00"')`],
    ['wrong cycle end', `jsonb_set(metadata,'{cycle_ends_at}','"2026-11-14T08:00:00Z"')`],
  ]) await scenario('malformed receipt stays blocked: ' + name, async () => {
    const first = await claim(); await db.query(`update sync_runs set metadata=${expression} where id=$1`, [first.sync_run_id]);
    const before = await get(first.sync_run_id); await time('2026-11-14T03:12:00Z');
    assert.equal((await recover())[0].recovery_status, 'blocked_unverified_receipt');
    assert.equal((await claim()).claim_status, 'batch_running'); assert.deepEqual(await get(first.sync_run_id), before);
  });
  await scenario('malformed metadata does not roll back recovery of another valid expired receipt', async () => {
    const first = await claim();
    await db.query("insert into sync_runs(provider_id,requested_count,metadata) values($1,1,$2)", [provider, { function: 'full-twelve-data-load', cycle_version: 2, evaluated_at: 'bad' }]);
    await time('2026-11-14T03:12:00Z');
    const results = await recover(); assert.equal(results.filter(r => r.recovery_status === 'recovered_interruption').length, 1);
    assert.equal(results.filter(r => r.recovery_status === 'blocked_unverified_receipt').length, 1);
    assert.equal((await get(first.sync_run_id)).status, 'failed'); assert.equal((await claim()).claim_status, 'batch_running');
  });
  for (const [name, update] of [
    ['mismatched requested count', 'requested_count=7'],
    ['terminal timestamp on running receipt', "finished_at='2026-11-14T03:01Z'"],
    ['inconsistent server start', "started_at='2026-11-13T03:00Z'"],
    ['infinite server start', "started_at='-infinity'"],
  ]) await scenario('structurally inconsistent receipt is preserved: ' + name, async () => {
    const first = await claim(); await db.query(`update sync_runs set ${update} where id=$1`, [first.sync_run_id]);
    const before = await get(first.sync_run_id); await time('2026-11-14T03:12:00Z');
    assert.equal((await recover())[0].recovery_status, 'blocked_unverified_receipt');
    assert.deepEqual(await get(first.sync_run_id), before);
  });
  await scenario('unknown legacy stays blocked; exact reviewed exceptions are preserved unchanged', async () => {
    const legacy = ['73413e90-8ef8-46fa-a0d8-50d662296c3c', '9ae8f9f4-9125-4ebb-8913-bd51fc163838'];
    for (const run of legacy) await db.query("insert into sync_runs(id,provider_id,started_at,metadata) values($1,$2,'2026-11-07T03:00Z',$3)", [run, provider, { function: 'full-twelve-data-load' }]);
    const before = (await db.query('select * from sync_runs order by id')).rows;
    await recover(); assert.deepEqual((await db.query('select * from sync_runs order by id')).rows, before);
    assert.equal((await claim()).claim_status, 'claimed');
    await db.query("update sync_runs set status='succeeded',finished_at='2026-11-14T03:00Z' where not(id=any($1::uuid[]))", [legacy]);
    await db.query("insert into sync_runs(provider_id,started_at,metadata) values($1,'2026-11-07T03:00Z',$2)", [provider, { function: 'full-twelve-data-load' }]);
    await time('2026-11-14T03:12:00Z'); assert.equal((await claim()).claim_status, 'batch_running');
  });
  await scenario('late worker compare-and-set cannot overwrite recovered receipt or counts', async () => {
    const first = await claim(); await time('2026-11-14T03:12:00Z'); await recover();
    const before = await get(first.sync_run_id);
    const changed = (await db.query("update sync_runs set status='succeeded',received_count=8,inserted_count=8 where id=$1 and status='running' returning id", [first.sync_run_id])).rows;
    assert.deepEqual(changed, []); assert.deepEqual(await get(first.sync_run_id), before);
  });
  console.log(`PASS ${scenarios} isolated recovery scenarios. Clock substitution only in local test SQL; real intersession locking and hosted deployment remain unverified.`);
} finally { await db.close(); }
