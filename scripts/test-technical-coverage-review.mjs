// Local synthetic SQL tests. No network, credentials or production fixtures.
// Run from repository root; PGLITE_MODULE may identify an existing installation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = await readFile('scripts/technical-coverage-review.sql', 'utf8');
try {
  await db.exec(`
    create table instruments(id int primary key, is_active boolean, exchange_code text, asset_type text);
    create table market_scores(id int primary key, instrument_id int, score_status text,
      score_details jsonb, score_date date, calculated_at timestamptz,
      methodology_version text default 'technical-score-v1',
      technical_calculation_version text default 'technical-engine-v1');
    create table data_providers(id int primary key, provider_code text);
    create table market_observations(id int primary key, instrument_id int, provider_id int, interval_code text);
    insert into data_providers values (1,'tiingo'),(2,'yahoo'),(3,'other');
    insert into instruments values
      (1,true,'TEST','equity'),(2,false,'TEST','equity'),
      (3,true,'ASX','equity'),(4,true,'FOREX','forex'),
      (5,true,'EMPTY','equity'),(6,false,'EMPTY','equity'),
      (7,true,'OTHER','equity');
    insert into market_scores(id,instrument_id,score_status,score_details,score_date,calculated_at) values
      (1,1,'partial','{}','2026-01-01','2026-01-10Z'),
      (2,1,'partial','{}','2026-01-02','2026-01-02Z'),
      (3,1,'complete','{"availability_weights":{"trend":100}}','2026-01-02','2026-01-03Z'),
      (4,2,'partial','{"availability_weights":{"trend":85}}','2026-01-02','2026-01-03Z'),
      (5,4,'partial','{"availability_weights":{"volume":0}}','2026-01-02','2026-01-03Z'),
      (6,6,'insufficient_input','{}','2026-01-02','2026-01-03Z');
    insert into market_scores values
      (7,3,'complete','{}','2026-01-04','2026-01-04Z','technical-score-v2','technical-engine-v1'),
      (8,5,'complete','{}','2026-01-04','2026-01-04Z','technical-score-v1','technical-engine-v2');
    insert into market_observations values
      (1,1,1,'1day'),(2,1,1,'1day'),(3,1,2,'1day'),
      (4,2,1,'1day'),(5,3,2,'1day'),(6,4,1,'1day'),
      (7,5,1,'1min'),(8,7,3,'1day');
  `);
  // A read-only transaction rejects accidental DDL/DML in the actual diagnostic.
  await db.exec('begin read only');
  const { rows } = await db.query(sql);
  await db.exec('rollback');
  assert.equal(rows.reduce((n, r) => n + r.instruments, 0), 7);
  const row = (exchange, active = true) => rows.find(r => r.exchange_code === exchange && r.is_active === active);
  assert.equal(row('TEST').score_status, 'complete'); // date, then calculation time
  assert.equal(row('TEST').instruments, 1); // history and multiple providers do not multiply
  assert.equal(row('TEST').with_tiingo_daily, 1);
  assert.equal(row('TEST').with_yahoo_daily, 1);
  assert.equal(row('TEST', false).score_status, 'partial');
  assert.equal(row('ASX').score_status, 'no_score'); // incompatible methodology ignored
  assert.equal(row('ASX').with_yahoo_daily, 1);
  assert.equal(row('ASX').with_tiingo_daily, 0);
  assert.equal(row('FOREX').availability_weights.volume, 0);
  assert.equal(row('FOREX').score_status, 'partial');
  assert.equal(row('EMPTY').score_status, 'no_score'); // incompatible engine ignored
  assert.equal(row('EMPTY').without_daily_rows, 1); // minute quotes do not count
  assert.equal(row('EMPTY').oldest_score_date, null);
  assert.equal(row('EMPTY', false).score_status, 'insufficient_input');
  assert.equal(row('OTHER').without_daily_rows, 0); // unrecognized daily provider retained
  assert.equal(row('OTHER').with_tiingo_daily + row('OTHER').with_yahoo_daily, 0);
  assert.equal(Object.keys(rows[0]).some(k => /symbol|instrument_id|owner|note/.test(k)), false);
  await db.exec(`insert into market_scores(id,instrument_id,score_status,score_details,score_date,calculated_at)
    values (9,1,'partial','{}','2026-01-02','2026-01-03Z')`);
  assert.equal((await db.query(sql)).rows.find(r => r.exchange_code === 'TEST' && r.is_active).score_status, 'partial');
  await db.exec('truncate market_scores, market_observations, instruments, data_providers');
  assert.deepEqual((await db.query(sql)).rows, []);
  console.log('PASS: 20 assertions; actual diagnostic SQL; isolated synthetic database');
} finally {
  await db.close();
}
