// Execute the actual diagnostic on synthetic PostgreSQL data, without network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = await readFile('scripts/research-source-failures.sql', 'utf8');
let scenarios = 0;
async function read() {
  await db.exec('begin read only');
  try { return (await db.query(sql)).rows; }
  finally { await db.exec('rollback'); }
}
async function check(name, run) {
  await run(); scenarios++; console.log(`PASS ${name}`);
}
try {
  await db.exec(`
    create table opinion_reviews(id uuid primary key, review_date date, started_at timestamptz,
      completed_at timestamptz, status text, instruments_checked int,
      coverage_current int, coverage_stale int, coverage_none int);
    create table opinion_sources(id uuid primary key, source_key text, is_active boolean);
    create table opinion_source_review_results(review_id uuid, source_id uuid,
      status text, items_seen int, opinions_inserted int, duplicates_skipped int,
      error_message text, metadata jsonb);
  `);
  const review = '00000000-0000-4000-8000-000000000001';
  const source = '00000000-0000-4000-8000-000000000002';
  await check('empty history returns no invented review', async () => assert.deepEqual(await read(), []));
  await db.query(`insert into opinion_reviews values ($1,'2026-11-18','2026-11-19T00:00Z',null,'partial',4,2,1,1)`, [review]);
  await check('missing source result preserves review and reports unverified telemetry', async () => {
    const [r] = await read(); assert.equal(r.review_status, 'partial');
    assert.equal(r.source_status, null); assert.equal(r.telemetry_state, 'COLLECTION_TELEMETRY_UNVERIFIED');
  });
  await db.query('insert into opinion_sources values ($1,\'official_company\',true)', [source]);
  await db.query(`insert into opinion_source_review_results values ($1,$2,'failed',2,1,1,'ISSUER_SOURCE_COVERAGE_INCOMPLETE','{}')`, [review, source]);
  await check('partial saved output remains separate from failed collection', async () => {
    const [r] = await read(); assert.equal(r.opinions_inserted, 1);
    assert.equal(r.source_status, 'failed'); assert.equal(r.source_reason, 'ISSUER_SOURCE_COVERAGE_INCOMPLETE');
    assert.equal(r.ledger_rows, null);
  });
  await check('legacy free text and malformed identity fields never reach output', async () => {
    await db.query('update opinion_source_review_results set error_message=$1,metadata=$2',
      ['synthetic-private-marker', { source_sha: 'synthetic-private-marker', collection_contract: 'synthetic-private-marker', coverage_ledger: {} }]);
    const [r] = await read(); assert.equal(r.has_error, true);
    assert.equal(r.source_reason, 'DETAIL_REQUIRES_PRIVATE_REVIEW');
    assert.equal(r.source_sha, null); assert.equal(r.collection_contract, null);
    assert.equal(r.ledger_rows, null); assert.ok(!JSON.stringify(r).includes('synthetic-private-marker'));
  });
  await check('legacy sourceSha accepted only as an exact commit digest', async () => {
    await db.query('update opinion_source_review_results set metadata=$1', [{ sourceSha: 'a'.repeat(40) }]);
    assert.equal((await read())[0].source_sha, 'a'.repeat(40));
  });
  await check('empty or duplicated ledger is present, never certified complete', async () => {
    for (const ledger of [[], [{ instrument_id: source }, { instrument_id: source }]]) {
      await db.query('update opinion_source_review_results set metadata=$1',
        [{ collection_contract: 'research-source-recovery-v1', coverage_ledger: ledger }]);
      const [r] = await read(); assert.equal(r.ledger_rows, ledger.length);
      assert.equal(r.telemetry_state, 'LEDGER_PRESENT_REQUIRES_SCOPE_AND_EVIDENCE_REVIEW');
    }
  });
  await check('malformed metadata shapes are safe and unverified', async () => {
    for (const metadata of [null, 'text', [], { coverage_ledger: 'text' }, { coverage_ledger: null }]) {
      await db.query('update opinion_source_review_results set metadata=$1', [JSON.stringify(metadata)]);
      const [r] = await read(); assert.equal(r.ledger_rows, null);
      assert.equal(r.telemetry_state, 'COLLECTION_TELEMETRY_UNVERIFIED');
    }
  });
  await check('latest execution wins even when review date differs', async () => {
    await db.query(`insert into opinion_reviews values ($1,'2026-11-17','2026-11-19T00:01Z',null,'running',0,0,0,0)`,
      ['00000000-0000-4000-8000-000000000003']);
    const [r] = await read(); assert.equal(r.review_status, 'running'); assert.equal(r.source_status, null);
  });
  console.log(`PASS: ${scenarios} scenarios, actual SELECT in read-only transactions.`);
} finally { await db.close(); }
