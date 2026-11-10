// Local-only in-memory PostgreSQL checks. No connection string or hosted access.
// PGLITE_MODULE may be a file URL to a temporary @electric-sql/pglite installation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const readiness = read('./market-convergence-readiness.sql')
// Substitute only the clock, leaving the complete production SELECT intact.
const atCutoff = readiness.replaceAll('statement_timestamp()', '$1::timestamptz')
const cutoff = '2026-11-10T00:00:00Z' // New York logical date: 9 November.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let passed = 0
async function scenario(name, fn) {
  await db.exec('begin')
  try { await fn(); passed++; console.log(`PASS ${name}`) }
  finally { await db.exec('rollback') }
}
const rows = async () => (await db.query(atCutoff, [cutoff])).rows
const row = async () => (await rows())[0]
const blocked = async code => { const r = await row(); assert.equal(r.readiness, code); assert.equal(r.invocation_sql, null); return r }
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.instruments(id uuid primary key, symbol text, is_active boolean);
    create table public.market_scores(id bigint primary key, instrument_id uuid references public.instruments,
      score_date date, overall_score numeric, confidence_score numeric, methodology_version text,
      calculated_at timestamptz, score_status text);
    create table public.gpt_market_runs(run_id uuid primary key, status text, completed_at timestamptz);
    create table public.gpt_market_assessments(assessment_id uuid primary key, instrument_id uuid references public.instruments,
      run_id uuid references public.gpt_market_runs, assessment_date date, rating text, score numeric,
      confidence numeric, methodology_version text, created_at timestamptz, technical_engine_input_used boolean);
  `)
  const base = read('../supabase/migrations/20260813_phase2_two_assessment_architecture.sql')
  const start = base.indexOf('create table if not exists public.market_convergence_assessments (')
  assert.ok(start >= 0)
  const end = base.indexOf('\n);', start)
  assert.ok(end > start)
  await db.exec(base.slice(start, end + 4))
  for (const name of ['20260822033000_implement_market_convergence_v1.sql', '20260822042000_add_market_convergence_history_retry_v1.sql', '20260822052500_enforce_market_convergence_retry_chain.sql']) {
    await db.exec(read('../supabase/migrations/' + name))
  }
  await db.exec(`
    insert into instruments values('${id(1)}','FIXTURE',true),('${id(9)}','INACTIVE',false);
    insert into market_scores values(1,'${id(1)}','2026-11-09',80,90,'technical-score-v1','2026-11-09T22:00Z','complete');
    insert into gpt_market_runs values('${id(2)}','succeeded','2026-11-09T23:00Z');
    insert into gpt_market_assessments values('${id(3)}','${id(1)}','${id(2)}','2026-11-09','Buy',70,80,'independent-market-ai-v1','2026-11-09T22:30Z',false);
  `)
  await scenario('readiness is read-only and returns one fixed current cutoff without placeholders', async () => {
    await db.exec('set transaction read only')
    const current = (await db.query(readiness)).rows
    assert.equal(current.length, 1)
    assert.ok(Number.isFinite(Date.parse(current[0].cutoff_at)))
    assert.equal((await db.query('select count(*)::int n from market_convergence_runs')).rows[0].n, 0)
  })
  await scenario('ready exact SQL produces fresh canonical lineage; scheduled replay is harmless', async () => {
    const ready = await row()
    assert.equal(ready.readiness, 'READY'); assert.equal(ready.technical_score_id, 1)
    assert.equal(ready.ai_assessment_id, id(3)); assert.match(ready.invocation_sql, /'scheduled'/)
    const runId = (await db.query(ready.invocation_sql)).rows[0].run_id
    const run = (await db.query('select * from market_convergence_runs where id=$1', [runId])).rows[0]
    assert.equal(run.status, 'succeeded'); assert.equal(run.fresh_pairs, 1); assert.equal(run.rows_changed, 1)
    const before = (await db.query('select * from market_convergence_assessments')).rows
    assert.equal(before[0].technical_score_id, 1); assert.equal(before[0].ai_assessment_id, id(3))
    assert.equal(Number(before[0].convergence_score), 75)
    await blocked('ALREADY_SUCCEEDED')
    const replayId = (await db.query(ready.invocation_sql)).rows[0].run_id
    assert.equal((await db.query('select error_code from market_convergence_runs where id=$1', [replayId])).rows[0].error_code, 'already_succeeded')
    assert.deepEqual((await db.query('select * from market_convergence_assessments')).rows, before)
  })
  for (const [sql, code] of [
    ['delete from market_scores', 'TECHNICAL_INPUT_MISSING'],
    ['delete from gpt_market_assessments', 'AI_INPUT_MISSING'],
    ["update market_scores set score_date='2026-11-04'", 'TECHNICAL_INPUT_STALE'],
    ["update gpt_market_assessments set assessment_date='2026-11-04'", 'AI_INPUT_STALE'],
    ["update market_scores set calculated_at='2026-11-10T00:00:01Z'", 'TECHNICAL_INPUT_MISSING'],
    ["update gpt_market_assessments set created_at='2026-11-10T00:00:01Z'", 'AI_INPUT_MISSING'],
    ["update market_scores set score_date='2026-11-10'", 'TECHNICAL_INPUT_MISSING'],
    ['update gpt_market_assessments set technical_engine_input_used=true', 'AI_INPUT_MISSING'],
    ['update market_scores set overall_score=101', 'TECHNICAL_INPUT_MISSING'],
    ["update gpt_market_runs set status='running'", 'AI_RUN_NOT_TERMINAL_AT_CUTOFF'],
    ['update gpt_market_runs set completed_at=null', 'AI_RUN_NOT_TERMINAL_AT_CUTOFF'],
    ["update gpt_market_runs set completed_at='2026-11-10T00:00:01Z'", 'AI_RUN_NOT_TERMINAL_AT_CUTOFF']
  ]) await scenario(code + ': ' + sql, async () => { await db.exec(sql); await blocked(code) })
  await scenario('four-calendar-day boundary and partial independent inputs remain eligible', async () => {
    await db.exec("update market_scores set score_date='2026-11-05',score_status='partial'; update gpt_market_assessments set assessment_date='2026-11-05'; update gpt_market_runs set status='partial'")
    assert.equal((await row()).readiness, 'READY')
  })
  await scenario('canonical latest AI selection never falls back around an unfinished run', async () => {
    await db.exec(`insert into gpt_market_runs values('${id(4)}','running',null);
      insert into gpt_market_assessments select '${id(5)}',instrument_id,'${id(4)}',assessment_date,rating,score,confidence,methodology_version,'2026-11-09T23:30Z',false from gpt_market_assessments`)
    const r = await blocked('AI_RUN_NOT_TERMINAL_AT_CUTOFF'); assert.equal(r.ai_assessment_id, id(5))
  })
  await scenario('tied source dates/timestamps use the same descending IDs as canonical refresh', async () => {
    await db.exec(`insert into market_scores select 2,instrument_id,score_date,overall_score,confidence_score,methodology_version,calculated_at,score_status from market_scores;
      insert into gpt_market_assessments select '${id(5)}',instrument_id,run_id,assessment_date,rating,score,confidence,methodology_version,created_at,false from gpt_market_assessments`)
    const r = await row(); assert.equal(r.technical_score_id, 2); assert.equal(r.ai_assessment_id, id(5))
    await db.query(r.invocation_sql)
    const saved = (await db.query('select * from market_convergence_assessments')).rows[0]
    assert.equal(saved.technical_score_id, r.technical_score_id); assert.equal(saved.ai_assessment_id, r.ai_assessment_id)
  })
  await scenario('same-day zero-fresh success is blocked instead of falsely completed or bypassed', async () => {
    await db.exec('delete from market_scores')
    await db.query("select market_convergence.run_v1('scheduled',null,$1,$2)", [cutoff, id(1)])
    await blocked('SAME_DAY_INCOMPLETE_SUCCESS')
  })
  await scenario('changed same-day lineage is reported instead of bypassing scheduled idempotency', async () => {
    await db.query((await row()).invocation_sql)
    await db.exec('insert into market_scores select 2,instrument_id,score_date,overall_score,confidence_score,methodology_version,calculated_at,score_status from market_scores')
    await blocked('SAME_DAY_LINEAGE_CHANGED')
  })
  for (const laterCompletion of [false, true]) await scenario(`native success cannot certify unfinished AI (later completion=${laterCompletion})`, async () => {
    await db.exec("update gpt_market_runs set status='running',completed_at=null")
    const savedCutoff = '2026-11-09T22:45:00Z'
    const nativeId = (await db.query("select market_convergence.run_v1('scheduled',null,$1,$2) id", [savedCutoff, id(1)])).rows[0].id
    const saved = (await db.query('select status,fresh_pairs from market_convergence_runs where id=$1', [nativeId])).rows[0]
    assert.equal(saved.status, 'succeeded'); assert.equal(saved.fresh_pairs, 1)
    if (laterCompletion) await db.exec("update gpt_market_runs set status='succeeded',completed_at='2026-11-09T23:00:00Z'")
    const r = await blocked(laterCompletion ? 'AI_RUN_NOT_TERMINAL_AT_SAVED_CUTOFF' : 'AI_RUN_NOT_TERMINAL_AT_CUTOFF')
    assert.equal(r.existing_success_id, nativeId)
    assert.equal(new Date(r.existing_success_cutoff_at).toISOString(), new Date(savedCutoff).toISOString())
  })
  for (const [table, column, code] of [['market_scores', 'score_date', 'TECHNICAL_INPUT_STALE'], ['gpt_market_assessments', 'assessment_date', 'AI_INPUT_STALE']]) {
    await scenario(`existing native success cannot conceal revised stale source: ${table}`, async () => {
      const nativeId = (await db.query((await row()).invocation_sql)).rows[0].run_id
      await db.exec(`update ${table} set ${column}='2026-11-04'`)
      assert.equal((await blocked(code)).existing_success_id, nativeId)
    })
  }
  await scenario('canonical failed retries preserve cutoff/scope and stop at the third attempt', async () => {
    await db.exec(`create function public.fixture_fail() returns trigger language plpgsql as $$begin raise exception 'fixture'; end$$;
      create trigger fixture_fail before insert on market_convergence_assessments for each row execute function public.fixture_fail()`)
    const first = (await db.query((await row()).invocation_sql)).rows[0].run_id
    assert.equal((await blocked('FAILED_RETRY_REQUIRES_ORIGINAL_CUTOFF')).failed_leaf_id, first)
    let parent = first
    for (const attempt of [2, 3]) {
      const next = (await db.query("select market_convergence.run_v1('retry',$1,clock_timestamp(),null) id", [parent])).rows[0].id
      const run = (await db.query('select * from market_convergence_runs where id=$1', [next])).rows[0]
      assert.equal(run.attempt_number, attempt); assert.equal(run.instrument_id, id(1)); assert.equal(new Date(run.cutoff_at).toISOString(), new Date(cutoff).toISOString())
      parent = next
    }
    assert.equal((await blocked('RETRY_EXHAUSTED')).failed_leaf_id, parent)
    // Each expected exception gets its own savepoint so the scenario can continue.
    await db.exec('savepoint rejected')
    await assert.rejects(db.query("select market_convergence.run_v1('retry',$1,clock_timestamp(),null)", [first]), /child attempt/)
    await db.exec('rollback to savepoint rejected')
    await assert.rejects(db.query("select market_convergence.run_v1('retry',$1,clock_timestamp(),null)", [parent]), /three attempts/)
    await db.exec('rollback to savepoint rejected')
  })
  await scenario('skipped child never permits a new scheduled chain around a failed parent', async () => {
    await db.exec(`insert into market_convergence_runs(id,logical_date,cutoff_at,instrument_id,execution_source,status,finished_at)
      values('${id(6)}','2026-11-09','${cutoff}','${id(1)}','scheduled','failed',now());
      insert into market_convergence_runs(logical_date,cutoff_at,instrument_id,execution_source,status,finished_at,retry_of_run_id,attempt_number)
      values('2026-11-09','${cutoff}','${id(1)}','retry','skipped',now(),'${id(6)}',2)`)
    const r = await blocked('FAILED_CHAIN_REQUIRES_RECONCILIATION'); assert.equal(r.failed_leaf_id, null)
  })
  await scenario('running global scope blocks overlap without producing invocation text', async () => {
    await db.exec(`insert into market_convergence_runs(logical_date,cutoff_at,execution_source,status) values('2026-11-09','${cutoff}','scheduled','running')`)
    await blocked('CONVERGENCE_RUNNING')
  })
  console.log(`PASS: ${passed} isolated PostgreSQL scenarios; in-memory fixtures only. Concurrent-session advisory locking and hosted controller execution remain unverified.`)
} finally { await db.close() }
