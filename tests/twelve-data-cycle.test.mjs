import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const directory = new URL('../supabase/functions/full-twelve-data-load/', import.meta.url);
const compile = name => ts.transpileModule(readFileSync(new URL(name, directory), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cycle = {};
vm.runInNewContext(compile('cycle.ts'), { exports: cycle, Date, Set, Map, Error });
const mapping = n => ({ instrument_id: `instrument-${String(n).padStart(2, '0')}`, provider_symbol: `PROVIDER-${n}`,
  instruments: { symbol: `SYMBOL-${String(n).padStart(2, '0')}`, currency_code: 'USD', is_active: true, asset_type: 'forex' } });

function worker(options = {}) {
  let now = options.now || '2026-11-11T03:00:00Z';
  const state = { runs: [], observations: [], fetches: [], timeouts: [], reads: [], progressWrites: [], dbRequests: [], finishError: false, ...options };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const db = { async rpc(name, args) {
    assert.equal(name, 'claim_twelve_data_cycle_batch_v1'); assert.equal(args.p_provider_id, 'provider');
    state.reads.push({ rpc: name });
    if (state.claimError) return { data: null, error: { message: 'secret claim diagnostic' } };
    if (state.badClaim) return { data: [state.badClaim], error: null };
    // RPC response seam only: database transaction/advisory-lock tests are separate.
    const at = cycle.refreshCycle(new Date(now));
    const base = { sync_run_id: null, selected_instrument_ids: [], cycle_started_at: at.startedAt,
      cycle_ends_at: at.endsAt, eligible_count: args.p_instrument_ids.length, remaining_count: args.p_instrument_ids.length };
    const skip = claim_status => ({ data: [{ ...base, claim_status }], error: null });
    if (!at.acceptsStarts) return skip('outside_refresh_window');
    if (state.runs.some(run => run.status === 'running')) return skip('batch_running');
    if (state.runs.some(run => run.finished_at && Date.parse(now) - Date.parse(run.finished_at) < 60000)) return skip('batch_cooldown');
    const prior = state.runs.filter(run => run.metadata.cycle_started_at === at.startedAt);
    if (prior.some(run => !Array.isArray(run.metadata.selected_instrument_ids))) return { data: null, error: { message: 'invalid receipt' } };
    const attempted = new Set(prior.flatMap(run => run.metadata.selected_instrument_ids));
    const pending = args.p_instrument_ids.filter(id => !attempted.has(id));
    if (!pending.length) return skip('no_unattempted_eligible_instruments');
    const selected = pending.slice(0, 8);
    const run = { id: `run-${state.runs.length}`, provider_id: 'provider', status: 'running', requested_count: selected.length,
      metadata: { function: 'full-twelve-data-load', cycle_started_at: at.startedAt, selected_instrument_ids: selected } };
    state.runs.push(run);
    return { data: [{ ...base, sync_run_id: run.id, selected_instrument_ids: selected, claim_status: 'claimed', remaining_count: pending.length - selected.length }], error: null };
  }, from(table) {
    const filters = []; let action = 'read', value;
    const result = () => {
      if (table === 'data_providers') return { data: { id: 'provider' }, error: null };
      if (table === 'provider_instruments') return { data: state.mappings || Array.from({ length: 30 }, (_, n) => mapping(n)), error: null };
      if (table === 'sync_runs' && action === 'update') {
        const run = state.runs.find(run => run.id === filters.find(([key]) => key === 'id')[1]);
        assert.equal(filters.find(([key]) => key === 'status')?.[1], 'running');
        if (value.status && state.recoverBeforeFinish) {
          run.status = 'failed'; run.metadata.completion_counts_verified = false;
        }
        if (!value.status && state.recoverBeforeProgress) {
          run.status = 'failed'; run.metadata.completion_counts_verified = false;
        }
        if (run.status !== 'running') return { data: [], error: null };
        if (value.status && state.finishError) return { data: null, error: { message: 'secret finalization diagnostic' } };
        if (!value.status && state.progressErrorAfter === state.fetches.length) return { data: null, error: { message: 'secret progress diagnostic' } };
        if (!value.status) state.progressWrites.push(structuredClone(value));
        Object.assign(run, structuredClone(value)); return { data: [{ id: run.id }], error: null };
      }
      if (table === 'market_observations' && action === 'insert') {
        if (state.observationError) return { data: null, error: { message: 'secret observation diagnostic' } };
        state.observations.push(structuredClone(value)); return { data: null, error: null };
      }
      throw Error(`Unexpected database access: ${table}/${action}`);
    };
    const query = { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
      insert(input) { action = 'insert'; value = input; return this; }, update(input) { action = 'update'; value = input; return this; },
      single() { return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); } };
    return query;
  } };
  let handler;
  vm.runInNewContext(compile('index.ts'), {
    exports: {}, require: name => name === './cycle.ts' ? cycle : { createClient: (_url, _key, configuration) => { state.dbTransport = configuration.global.fetch; return db; } },
    Deno: { serve(fn) { handler = fn; }, env: { get: key => key === 'TWELVE_DATA_API_KEY' ? 'DO-NOT-LOG-KEY' : 'server-config' } },
    Date: Clock, Intl, Set, Map, Error, URL, Response, Request,
    AbortSignal: { timeout(ms) { state.timeouts.push(ms); return new AbortController().signal; }, any: signals => AbortSignal.any(signals) },
    setTimeout(fn) { fn(); return 0; },
    fetch: async (url, init) => {
      if (new URL(url).hostname === 'db.example') {
        state.dbRequests.push({ input: String(url), signal: init.signal }); return new Response('{}');
      }
      const symbol = url.searchParams.get('symbol');
      const active = state.runs.at(-1);
      assert.equal(active.status, 'running', 'The selected IDs must be durable before any provider call');
      const selected = active.metadata.selected_instrument_ids;
      assert.ok(selected.length > 0 && selected.length <= 8);
      assert.ok(init.signal);
      state.fetches.push(symbol);
      if (state.fetchError) throw state.fetchError;
      if (state.providerError) return { ok: true, status: 200, json: async () => ({ status: 'error', message: `https://provider.example/?apikey=DO-NOT-LOG-KEY` }) };
      return { ok: true, status: 200, json: async () => ({ close: '123.45', open: '120', high: '124', low: '119', volume: '20', currency: 'USD' }) };
    },
  });
  return { state, async invoke(at = now, method = 'POST') { now = at; const response = await handler(new Request('https://worker.example', { method }));
    return { status: response.status, body: await response.json() }; } };
}

test('UTC refresh buckets use 03/07/11/15/19/23 regardless of DST and admit only first 15 minutes', () => {
  for (const [time, start, active] of [
    ['2026-11-11T00:00:00Z', '2026-11-10T23:00:00.000Z', false],
    ['2026-11-11T03:00:00Z', '2026-11-11T03:00:00.000Z', true],
    ['2026-11-11T03:14:59.999Z', '2026-11-11T03:00:00.000Z', true],
    ['2026-11-11T03:15:00Z', '2026-11-11T03:00:00.000Z', false],
    ['2026-11-11T07:00:00Z', '2026-11-11T07:00:00.000Z', true],
    ['2026-03-08T07:00:00Z', '2026-03-08T07:00:00.000Z', true],
    ['2026-11-01T07:00:00Z', '2026-11-01T07:00:00.000Z', true],
  ]) { const result = cycle.refreshCycle(new Date(time)); assert.equal(result.startedAt, start); assert.equal(result.acceptsStarts, active); }
  assert.throws(() => cycle.refreshCycle(new Date('invalid')), /clock/);
});

test('claim input is deterministic, unique and bounded at 64 instruments', () => {
  const mappings = Array.from({ length: 64 }, (_, n) => mapping(n));
  assert.equal(cycle.orderedCycleMappings([...mappings].reverse()).map(item => item.instrument_id).join(','), mappings.map(item => item.instrument_id).join(','));
  assert.throws(() => cycle.orderedCycleMappings([...mappings, mapping(64)]), /capacity/);
  assert.equal(cycle.orderedCycleMappings([mapping(1), mapping(1)]).length, 1);
});

test('30 mapped instruments finish serially in four batches and the next four-hour cycle refreshes again', async () => {
  const w = worker();
  for (const [minute, count] of [[0, 8], [2, 8], [4, 8], [6, 6]]) {
    const result = await w.invoke(`2026-11-11T03:0${minute}:00Z`); assert.equal(result.body.requested_count, count); assert.equal(result.body.status, 'succeeded');
  }
  assert.equal(new Set(w.state.fetches).size, 30); assert.equal(w.state.fetches.length, 30);
  assert.equal((await w.invoke('2026-11-11T03:08:00Z')).body.reason, 'no_unattempted_eligible_instruments');
  assert.equal(w.state.runs.length, 4);
  assert.equal((await w.invoke('2026-11-11T07:00:00Z')).body.requested_count, 8);
  assert.equal(w.state.fetches.length, 38);
  assert.ok(w.state.timeouts.every(timeout => timeout === 10_000));
  const observation = w.state.observations[0];
  assert.equal(observation.interval_code, 'quote'); assert.equal(observation.close, 123.45); assert.equal(observation.adjusted_close, 123.45);
  assert.equal(observation.is_delayed, true); assert.equal(observation.raw_payload.close, '123.45');
});

test('failed provider symbols remain attempted and cannot starve later symbols', async () => {
  const w = worker({ providerError: true });
  const first = await w.invoke(); assert.equal(first.body.status, 'failed');
  const second = await w.invoke('2026-11-11T03:02:00Z'); assert.equal(second.body.requested_count, 8);
  assert.equal(new Set(w.state.fetches).size, 16); assert.equal(w.state.observations.length, 0);
  assert.equal(JSON.stringify([first, second, w.state.runs]).includes('DO-NOT-LOG-KEY'), false);
});

test('uncertain finalization blocks new claims across cycles without claiming success', async () => {
  const w = worker({ finishError: true }); assert.equal((await w.invoke()).status, 500);
  assert.equal(w.state.runs[0].status, 'running'); w.state.finishError = false;
  assert.equal((await w.invoke('2026-11-11T03:02:00Z')).body.reason, 'batch_running');
  assert.equal((await w.invoke('2026-11-11T07:00:00Z')).body.reason, 'batch_running');
  assert.equal(w.state.fetches.length, 8);
});

test('outside-window calls do no database or provider work; method guard stays intact', async () => {
  const w = worker(); assert.equal((await w.invoke('2026-11-11T03:15:00Z')).body.reason, 'outside_refresh_window');
  assert.equal((await w.invoke('2026-11-11T07:00:00Z', 'GET')).status, 405);
  assert.equal(w.state.runs.length, 0); assert.equal(w.state.reads.length, 0); assert.equal(w.state.fetches.length, 0);
});

test('failed or malformed atomic claim fails closed before provider calls', async () => {
  for (const options of [{ claimError: true }, { badClaim: { claim_status: 'claimed', sync_run_id: 'unknown', selected_instrument_ids: ['unmapped'] } }]) {
    const w = worker(options); assert.equal((await w.invoke()).status, 500); assert.equal(w.state.fetches.length, 0);
  }
});

test('worker honors cooldown and concurrent RPC running exclusion', async () => {
  const w = worker();
  const results = await Promise.all([w.invoke(), w.invoke()]);
  assert.equal(results.filter(result => result.body.status === 'succeeded').length, 1);
  assert.equal(results.filter(result => result.body.reason === 'batch_running').length, 1);
  assert.equal(w.state.fetches.length, 8);
  assert.equal((await w.invoke('2026-11-11T03:00:59Z')).body.reason, 'batch_cooldown');
  assert.equal(w.state.fetches.length, 8);
  assert.equal((await w.invoke('2026-11-11T03:01:00Z')).body.requested_count, 8);
});

test('malformed same-cycle receipts and capacity overflow require review without provider calls', async () => {
  const broken = worker({ runs: [{ provider_id: 'provider', metadata: { function: 'full-twelve-data-load', cycle_started_at: '2026-11-11T03:00:00.000Z' } }] });
  assert.equal((await broken.invoke()).status, 500); assert.equal(broken.state.fetches.length, 0);
  const over = worker({ mappings: Array.from({ length: 65 }, (_, n) => mapping(n)) });
  assert.equal((await over.invoke()).status, 500); assert.equal(over.state.fetches.length, 0);
});

test('timeout and write errors retain sanitized receipts without credential-bearing diagnostics', async () => {
  const error = new Error('https://provider.example/?apikey=DO-NOT-LOG-KEY'); error.name = 'TimeoutError';
  for (const options of [{ fetchError: error }, { observationError: true }]) {
    const w = worker(options); const result = await w.invoke();
    if (options.observationError) { assert.equal(result.status, 500); assert.equal(w.state.runs[0].status, 'running'); }
    else assert.equal(result.body.status, 'failed');
    assert.equal(JSON.stringify([result, w.state.runs]).includes('DO-NOT-LOG-KEY'), false);
    assert.equal(JSON.stringify([result, w.state.runs]).includes('secret'), false);
  }
});

test('per-request progress survives five saved quotes before an uncertain progress write stops the batch', async () => {
  const w = worker({ progressErrorAfter: 5 }); const result = await w.invoke();
  assert.equal(result.status, 500); assert.equal(w.state.fetches.length, 5); assert.equal(w.state.observations.length, 5);
  assert.equal(w.state.runs[0].status, 'running'); assert.equal(w.state.runs[0].requested_count, 8);
  assert.equal(w.state.runs[0].received_count, 4); assert.equal(w.state.runs[0].inserted_count, 4);
  assert.equal(w.state.progressWrites.length, 4);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('late progress and terminal writes cannot overwrite a recovered receipt', async () => {
  for (const options of [{ recoverBeforeProgress: true }, { recoverBeforeFinish: true }]) {
    const w = worker(options); const result = await w.invoke();
    assert.equal(result.status, 500); assert.equal(w.state.runs[0].status, 'failed');
    assert.equal(w.state.runs[0].metadata.completion_counts_verified, false);
    assert.equal(w.state.fetches.length, options.recoverBeforeProgress ? 1 : 8);
  }
});

test('database transport has a 15-second deadline and preserves caller cancellation', async () => {
  const w = worker(); await w.invoke();
  const cancellation = new AbortController(); cancellation.abort();
  await w.state.dbTransport('https://db.example/rest/v1/test', { signal: cancellation.signal });
  assert.equal(w.state.timeouts.at(-1), 15_000);
  assert.equal(w.state.dbRequests[0].signal.aborted, true);
});

test('equity session rules remain unchanged while forex can refresh outside US hours', async () => {
  const equity = mapping(1); equity.instruments.asset_type = 'equity';
  const closed = worker({ mappings: [equity] }); assert.equal((await closed.invoke()).body.reason, 'no_unattempted_eligible_instruments');
  assert.equal(closed.state.fetches.length, 0);
  const open = worker({ mappings: [equity] }); assert.equal((await open.invoke('2026-11-11T19:00:00Z')).body.requested_count, 1);
});
