// Local-only PostgreSQL checks. No network calls, credentials or hosted connection.
// Run from the repository root; PGLITE_MODULE optionally points to a PGlite file URL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const release = readFileSync('scripts/market-history-demand-dispatch.sql', 'utf8');
const rollback = readFileSync('scripts/market-history-demand-dispatch-rollback.sql', 'utf8');
// Exact reviewed job command. All Vault values below are synthetic.
const originalCommand = `select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='trading_project_url')||'/functions/v1/market-history-maintenance-worker',
  headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='trading_publishable_key'),'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='trading_publishable_key')),
  body := jsonb_build_object('source','pg_cron','requested_at',clock_timestamp()),
  timeout_milliseconds := 100000
 )`;
const jobName = 'market-history-maintenance-worker-every-2-minutes';
let scenarios = 0, assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const cronRows = async () => (await db.query('select * from cron.job order by jobid')).rows;
const queueRows = async () => (await db.query('select * from public.market_history_jobs order by id')).rows;
const requests = async () => (await db.query('select * from net.requests order by id')).rows;
const dispatch = async () => db.exec((await cronRows()).find(row => row.jobid === 12).command);
async function seed() {
  await db.exec('truncate cron.job, public.market_history_jobs, net.requests');
  await db.query('insert into cron.job values(12,$1,$2,$3,true,$4,$5,$6,5432)',
    [jobName, '*/2 * * * *', originalCommand, 'fixture-database', 'fixture-owner', 'localhost']);
  await db.query('insert into cron.job values(13,$1,$2,$3,true,$4,$5,$6,5432)',
    ['unrelated-job', '*/15 * * * *', 'select 42', 'other-database', 'other-owner', 'other-host']);
}
async function scenario(name, run) {
  await seed(); await run(); scenarios++; console.log('PASS ' + name);
}
async function rejectTransaction(sql) {
  await assert.rejects(db.exec(sql)); assertions++;
  await db.exec('rollback');
}
async function addJob(id, status, due = '2000-01-01T00:00:00Z') {
  await db.query('insert into public.market_history_jobs values($1,$2,$3,$4)',
    [id, status, due, { retained: 'synthetic queue evidence', attempt: 2 }]);
}
try {
  equal(createHash('md5').update(originalCommand).digest('hex'), 'ca8cc8a44f633fa6d5b6700e0e4cd73a');
  await db.exec(`
    create schema cron; create schema vault; create schema net;
    create table cron.job(jobid bigint primary key, jobname text, schedule text, command text,
      active boolean, database text, username text, nodename text, nodeport integer);
    create function cron.alter_job(job_id bigint, command text) returns void language sql as
      $$update cron.job set command=$2 where jobid=$1$$;
    create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
    insert into vault.decrypted_secrets values
      ('trading_project_url','https://synthetic.invalid'),
      ('trading_publishable_key','synthetic-key-not-a-credential');
    create table net.requests(id bigint generated always as identity, url text, headers jsonb,
      body jsonb, timeout_milliseconds integer);
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
      returns bigint language sql as
      $$insert into net.requests(url,headers,body,timeout_milliseconds)
        values($1,$2,$3,$4) returning id$$;
    create table public.market_history_jobs(id integer primary key, status text,
      next_attempt_at timestamptz, metadata jsonb);
  `);
  await scenario('release changes only target command and preserves the exact HTTP expression', async () => {
    const before = await cronRows(); await db.exec(release); const after = await cronRows();
    equal(after[1], before[1]);
    equal({ ...after[0], command: originalCommand }, before[0]);
    equal(after[0].command.includes('PERFORM ' + originalCommand.slice(7) + ';'), true);
    equal(await requests(), []); equal(await queueRows(), []);
  });
  for (const [name, rows] of [
    ['empty queue', []],
    ['future pending', [[1, 'pending', '2999-01-01T00:00:00Z']]],
    ['running', [[1, 'running']]],
    ['held', [[1, 'held']]],
    ['failed', [[1, 'failed']]],
    ['succeeded', [[1, 'succeeded']]],
    ['pending without due timestamp', [[1, 'pending', null]]],
    ['mixed nondue states', [[1, 'pending', '2999-01-01T00:00:00Z'], [2, 'running'], [3, 'held'], [4, 'failed']]],
  ]) await scenario(name + ' makes no HTTP request and does not alter queue', async () => {
    for (const row of rows) await addJob(...row);
    const before = await queueRows(); await db.exec(release); await dispatch();
    equal(await requests(), []); equal(await queueRows(), before);
  });
  for (const count of [1, 8]) await scenario(count + ' due pending jobs dispatch exactly once without preclaiming', async () => {
    for (let id = 1; id <= count; id++) await addJob(id, 'pending');
    await addJob(20, 'held'); await addJob(21, 'running'); await addJob(22, 'failed');
    const before = await queueRows(); await db.exec(release); const cronBefore = await cronRows();
    const start = Date.now(); await dispatch(); const sent = await requests();
    equal(sent.length, 1); equal(await queueRows(), before); equal(await cronRows(), cronBefore);
    equal(sent[0].url, 'https://synthetic.invalid/functions/v1/market-history-maintenance-worker');
    equal(sent[0].headers, { 'Content-Type': 'application/json', apikey: 'synthetic-key-not-a-credential',
      Authorization: 'Bearer synthetic-key-not-a-credential' });
    equal(sent[0].body.source, 'pg_cron'); equal(sent[0].timeout_milliseconds, 100000);
    assert.ok(Date.parse(sent[0].body.requested_at) >= start && Date.parse(sent[0].body.requested_at) <= Date.now()); assertions++;
  });
  for (const [name, change] of [
    ['cadence', "update cron.job set schedule='*/3 * * * *' where jobid=12"],
    ['inactive', 'update cron.job set active=false where jobid=12'],
    ['command', "update cron.job set command=command||' ' where jobid=12"],
    ['missing identity', "update cron.job set jobname='other' where jobid=12"],
    ['duplicate identity', "update cron.job set jobname='" + jobName + "' where jobid=13"],
  ]) await scenario('release rejects ' + name + ' drift atomically', async () => {
    await db.exec(change); const before = await cronRows();
    await rejectTransaction(release); equal(await cronRows(), before); equal(await requests(), []);
  });
  await scenario('already wrapped release fails without nesting another dispatcher', async () => {
    await db.exec(release); const before = await cronRows(); await rejectTransaction(release);
    equal(await cronRows(), before); equal(await requests(), []);
  });
  for (const [name, change] of [
    ['cadence', "update cron.job set schedule='*/3 * * * *' where jobid=12"],
    ['inactive', 'update cron.job set active=false where jobid=12'],
    ['HTTP expression', "update cron.job set command=replace(command,'100000','100001') where jobid=12"],
    ['wrapper', "update cron.job set command=command||' ' where jobid=12"],
  ]) await scenario('rollback rejects ' + name + ' drift atomically', async () => {
    await db.exec(release); await db.exec(change); const before = await cronRows();
    await rejectTransaction(rollback); equal(await cronRows(), before); equal(await requests(), []);
  });
  await scenario('rollback rejects the unwrapped baseline', async () => {
    const before = await cronRows(); await rejectTransaction(rollback); equal(await cronRows(), before);
  });
  await scenario('release and rollback round-trip every cron field exactly with queue preserved', async () => {
    await addJob(1, 'pending'); const queueBefore = await queueRows(), before = await cronRows();
    await db.exec(release); await db.exec(rollback);
    equal(await cronRows(), before); equal(await queueRows(), queueBefore); equal(await requests(), []);
    await dispatch(); equal((await requests()).length, 1); equal(await queueRows(), queueBefore);
  });
  console.log(`PASS ${scenarios} isolated dispatch scenarios; ${assertions} assertions. Actual release/rollback SQL and original command; synthetic cron/Vault/HTTP only. Hosted scheduling and concurrent worker claims remain unverified.`);
} finally { await db.close(); }
