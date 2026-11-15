import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyWindow, assessDailyRevision, yahooEventManifest } from '../supabase/functions/market-history-maintenance-worker/history-window.mjs';
import { backfillYahoo, sydneyDate, addDays } from '../supabase/functions/market-history-maintenance-worker/yahoo.mjs';
import { JobStateUnconfirmed } from '../supabase/functions/market-history-maintenance-worker/job-state.mjs';

const end = addDays(sydneyDate(), -1), latest = addDays(end, -1), old = addDays(end, -90);
const bar = (date, values = {}) => ({ date, open: 10, high: 12, low: 9, close: 11, adjusted_close: 10.5, volume: 100, ...values });
const stored = rows => rows.map(({ date, ...values }) => ({ observed_at: date + 'T00:00:00.000Z', ...values }));
const instrument = { id: 'instrument', symbol: 'XRO', currency_code: 'AUD' };
const dailyJob = { job_type: 'daily_incremental', years: 1 };
function payload(rows, events = {}) {
  return { chart: { result: [{ meta: { symbol: 'XRO.AX', exchangeName: 'ASX', currency: 'AUD', exchangeTimezoneName: 'Australia/Sydney', dataGranularity: '1d' },
    timestamp: rows.map(row => Date.parse(row.date + 'T00:00:00Z') / 1000), events,
    indicators: { quote: [Object.fromEntries(['open', 'high', 'low', 'close', 'volume'].map(field => [field, rows.map(row => row[field])]))],
      adjclose: [{ adjclose: rows.map(row => row.adjusted_close) }] } }] } };
}
function fakeDb({ rows = [bar(latest)], prior = {}, auditError = false, upsertError = false, readError = false, creationThrows = false } = {}) {
  const db = { writes: [], updates: [], queries: [], inserts: [], batches: [], rows: stored(rows), from(table) {
    const entry = { table, filters: [], action: 'select' }; db.queries.push(entry);
    const result = () => {
      if (table === 'data_providers') return { data: { id: 'provider' }, error: null };
      if (entry.action === 'insert') {
        if (creationThrows) throw new Error('transport lost after insert');
        return { data: { id: 'run' }, error: null };
      }
      if (entry.action === 'update') return { data: auditError ? null : { id: 'run' }, error: auditError ? { message: 'audit unavailable' } : null };
      if (table === 'sync_runs') return { data: { id: 'prior', metadata: prior }, error: null };
      return { data: db.rows, error: readError ? { message: 'read unavailable' } : null };
    };
    const query = {
      select(value) { entry.select = value; return query; },
      eq(...args) { entry.filters.push(['eq', ...args]); return query; },
      gte(...args) { entry.filters.push(['gte', ...args]); return query; },
      lte(...args) { entry.filters.push(['lte', ...args]); return query; },
      in(...args) { entry.filters.push(['in', ...args]); return query; },
      order() { return query; }, limit() { return query; },
      single() { return Promise.resolve(result()); }, maybeSingle() { return Promise.resolve(result()); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      insert(value) { entry.action = 'insert'; db.inserts.push(structuredClone(value)); return query; },
      update(value) { entry.action = 'update'; db.updates.push(structuredClone(value)); return query; },
      upsert(values) { db.batches.push(values.length); if (!upsertError) db.writes.push(...values); return Promise.resolve({ error: upsertError ? { message: 'upsert rejected' } : null }); }
    };
    return query;
  } };
  return db;
}
function mockProvider(t, responses) {
  const windows = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const current = new URL(url); windows.push(addDays(new Date(Number(current.searchParams.get('period1')) * 1000).toISOString().slice(0, 10), 1));
    const response = responses[windows.length - 1];
    assert.ok(response, 'unexpected extra provider request');
    if (response instanceof Error) throw response;
    return { ok: true, json: async () => response };
  });
  return windows;
}

test('window uses latest minus fourteen days, seeds one year, and never infers calendar gaps', () => {
  const window = historyWindow(end, stored([bar(old), bar(latest)]));
  assert.equal(window.start, addDays(latest, -14));
  assert.deepEqual(window.missingDates, []);
  assert.equal(historyWindow(end).start, window.horizonStart);
  assert.deepEqual(historyWindow(end, stored([bar(latest)]), { history_window_version: 1, accepted_provider_dates: [old, latest] }).missingDates, [old]);
});

test('actual daily_incremental job fetches overlap only and guards provider-specific reads/audit writes', async t => {
  const db = fakeDb({ rows: [bar(latest, { close: '11', adjusted_close: '10.5' })] });
  const windows = mockProvider(t, [payload([bar(latest), bar(end)])]);
  await backfillYahoo(db, instrument, dailyJob);
  assert.deepEqual(windows, [addDays(latest, -14)]);
  assert.equal(db.updates.at(-1).status, 'succeeded');
  assert.deepEqual(db.batches, [2]);
  const read = db.queries.find(q => q.table === 'market_observations');
  for (const filter of [['eq', 'provider_id', 'provider'], ['eq', 'instrument_id', 'instrument'], ['eq', 'interval_code', '1day']]) assert.ok(read.filters.some(f => JSON.stringify(f) === JSON.stringify(filter)));
  const audit = db.queries.find(q => q.action === 'update');
  assert.deepEqual(audit.filters, [['eq', 'id', 'run'], ['eq', 'status', 'running']]);
});

test('initial backfill retains explicitly requested multi-year window', async t => {
  const db = fakeDb(); const windows = mockProvider(t, [payload([bar(latest)])]);
  await backfillYahoo(db, instrument, { job_type: 'initial_backfill', years: 5 });
  const expected = new Date(end + 'T00:00:00Z'); expected.setUTCFullYear(expected.getUTCFullYear() - 5);
  assert.deepEqual(windows, [expected.toISOString().slice(0, 10)]);
  assert.ok(!db.queries.some(q => q.filters.some(f => f[0] === 'gte')));
});

test('revised overlap fetches one bounded correction and preserves raw versus adjusted prices', async t => {
  const db = fakeDb({ rows: [bar(old), bar(latest)] });
  const changed = bar(latest, { adjusted_close: 9.5 });
  const windows = mockProvider(t, [payload([changed]), payload([bar(old), changed, bar(end)])]);
  await backfillYahoo(db, instrument, dailyJob);
  assert.deepEqual(windows, [addDays(latest, -14), historyWindow(end).horizonStart]);
  assert.equal(db.updates.at(-1).metadata.correction.state, 'resolved');
  assert.equal(db.writes.find(r => r.observed_at.startsWith(latest)).close, 11);
  assert.equal(db.writes.find(r => r.observed_at.startsWith(latest)).adjusted_close, 9.5);
  assert.deepEqual(db.batches, [3]);
});

test('new, changed and removed corporate-action evidence require correction', () => {
  const timestamp = Date.parse(latest + 'T00:00:00Z') / 1000;
  const events = { dividends: { [timestamp]: { date: timestamp, amount: 1 } } };
  const manifest = yahooEventManifest(events, old, end);
  const window = historyWindow(end, stored([bar(latest)]));
  for (const [current, previous] of [[events, {}], [{ dividends: { [timestamp]: { date: timestamp, amount: 2 } } }, manifest], [{}, manifest]]) {
    const decision = assessDailyRevision(window, stored([bar(latest)]), { rows: [bar(latest)], events: current }, { event_manifest: previous });
    assert.deepEqual(decision.reasons, ['CORPORATE_ACTION_EVIDENCE_CHANGED']);
  }
});

test('provider-confirmed missing date triggers repair without assuming holidays', async t => {
  const db = fakeDb({ prior: { history_window_version: 1, accepted_provider_dates: [old, latest] } });
  const windows = mockProvider(t, [payload([bar(latest)]), payload([bar(old), bar(latest)])]);
  await backfillYahoo(db, instrument, dailyJob);
  assert.equal(windows.length, 2);
  assert.deepEqual(db.updates.at(-1).metadata.correction.original_missing_dates, [old]);
  assert.equal(db.updates.at(-1).metadata.correction.state, 'resolved');
});

test('incomplete pure gap preserves daily closes and unchanged unfillable retry is suppressed', async t => {
  const prior = { history_window_version: 1, accepted_provider_dates: [old, latest] };
  const first = fakeDb({ prior });
  const windows = mockProvider(t, [payload([bar(latest), bar(end)]), payload([bar(latest), bar(end)])]);
  const daily = await backfillYahoo(first, instrument, dailyJob);
  assert.match(daily.last_error, /correction remains incomplete/);
  assert.equal(windows.length, 2); assert.equal(first.writes.length, 2);
  const audit = first.updates.at(-1); assert.equal(audit.status, 'succeeded');
  assert.equal(audit.metadata.correction.state, 'unresolved');
  assert.deepEqual(audit.metadata.correction.unresolved_dates, [old]);
  t.mock.restoreAll();
  assert.equal(audit.metadata.daily_closes_preserved_while_gap_unresolved, true);
  const retry = fakeDb({ rows: [bar(latest), bar(end)], prior: audit.metadata });
  const retried = mockProvider(t, [payload([bar(latest), bar(end)])]);
  const retriedDaily = await backfillYahoo(retry, instrument, dailyJob);
  assert.match(retriedDaily.last_error, /unchanged repair signature suppressed/);
  assert.equal(retried.length, 1); assert.equal(retry.writes.length, 2);
  assert.equal(retry.updates.at(-1).metadata.correction.state, 'suppressed_unchanged_unresolved');
});

test('rejected correction bars retain evidence and prevent mixed historical revisions', async t => {
  const db = fakeDb({ rows: [bar(old), bar(latest)] });
  mockProvider(t, [payload([bar(latest, { adjusted_close: 9 })]), payload([bar(old, { high: 1 }), bar(latest, { adjusted_close: 9 })])]);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), /incomplete/);
  assert.deepEqual(db.writes, []);
  assert.equal(db.updates.at(-1).metadata.rejected_bars[0].high, 1);
  assert.deepEqual(db.updates.at(-1).metadata.correction.unresolved_dates, [old]);
});

test('a new confirmed missing date beside an old unfillable gap allows another bounded repair', () => {
  const prior = { history_window_version: 1, accepted_provider_dates: [old, addDays(old, 1), latest],
    correction: { state: 'unresolved', completed_provider_attempt: true, signature: 'previous-signature',
      reasons: ['PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE'], unresolved_dates: [old], original_missing_dates: [old] } };
  const rows = stored([bar(latest)]);
  const decision = assessDailyRevision(historyWindow(end, rows, prior), rows, { rows: [bar(latest)], events: {} }, prior);
  assert.equal(decision.suppressed, false);
});

test('daily job repairs newly deleted B even while prior unfillable A remains recorded', async t => {
  const missingB = addDays(old, 1);
  const prior = { history_window_version: 1, accepted_provider_dates: [old, missingB, latest],
    correction: { state: 'unresolved', completed_provider_attempt: true, signature: 'old-A-only',
      reasons: ['PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE'], unresolved_dates: [old], original_missing_dates: [old] } };
  const db = fakeDb({ prior });
  const windows = mockProvider(t, [payload([bar(latest)]), payload([bar(old), bar(missingB), bar(latest)])]);
  await backfillYahoo(db, instrument, dailyJob);
  assert.equal(windows.length, 2);
  assert.ok(db.writes.some(row => row.observed_at.startsWith(missingB)));
  assert.equal(db.updates.at(-1).metadata.correction.state, 'resolved');
});

test('pure-gap repair saves recovered B while A stays absent and suppresses only remaining A', async t => {
  const missingB = addDays(old, 1);
  const prior = { history_window_version: 1, accepted_provider_dates: [old, missingB, latest],
    correction: { state: 'unresolved', completed_provider_attempt: true, signature: 'old-A-only',
      reasons: ['PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE'], unresolved_dates: [old], original_missing_dates: [old] } };
  const db = fakeDb({ prior });
  const windows = mockProvider(t, [payload([bar(latest), bar(end)]), payload([bar(missingB), bar(latest), bar(end)])]);
  const result = await backfillYahoo(db, instrument, dailyJob);
  assert.match(result.last_error, /incomplete/); assert.equal(windows.length, 2);
  assert.deepEqual(db.writes.map(row => row.observed_at.slice(0, 10)), [missingB, latest, end]);
  const audit = db.updates.at(-1).metadata;
  assert.deepEqual(audit.correction.unresolved_dates, [old]);
  t.mock.restoreAll();
  const retry = fakeDb({ prior: audit, rows: [bar(missingB), bar(latest), bar(end)] });
  const retriedWindows = mockProvider(t, [payload([bar(latest), bar(end)])]);
  const retried = await backfillYahoo(retry, instrument, dailyJob);
  assert.match(retried.last_error, /suppressed/); assert.equal(retriedWindows.length, 1);
  assert.deepEqual(retry.updates.at(-1).metadata.known_missing_provider_dates, [old]);
});

test('pure-gap response merge never chooses conflicting new prices', async t => {
  const db = fakeDb({ prior: { history_window_version: 1, accepted_provider_dates: [old, latest] } });
  mockProvider(t, [payload([bar(latest), bar(end)]), payload([bar(latest), bar(end, { adjusted_close: 9 })])]);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), /responses disagree/);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.updates.at(-1).metadata.correction.conflicting_dates, [end]);
  assert.ok(db.updates.at(-1).metadata.correction.reasons.includes('CONFLICTING_PROVIDER_RESPONSES'));
});

test('pure-gap merge quarantines valid/rejected cross-response conflicts in either direction', async t => {
  for (const rejectedIn of ['recent', 'wide']) {
    const db = fakeDb({ prior: { history_window_version: 1, accepted_provider_dates: [old, latest] } });
    const recentBar = bar(end, rejectedIn === 'recent' ? { high: 1 } : {});
    const wideBar = bar(end, rejectedIn === 'wide' ? { high: 1 } : {});
    mockProvider(t, [payload([bar(latest), recentBar]), payload([bar(latest), wideBar])]);
    await assert.rejects(backfillYahoo(db, instrument, dailyJob), /responses disagree/);
    assert.deepEqual(db.writes, []);
    const audit = db.updates.at(-1).metadata;
    assert.deepEqual(audit.correction.conflicting_dates, [end]);
    assert.ok(audit.fetch_attempts.some(attempt => attempt.rejected_bars.some(row => row.date === end)));
    t.mock.restoreAll();
  }
});

test('a rejected old gap with no competing valid row still permits safe daily closes', async t => {
  const db = fakeDb({ prior: { history_window_version: 1, accepted_provider_dates: [old, latest] } });
  mockProvider(t, [payload([bar(latest), bar(end)]), payload([bar(old, { high: 1 }), bar(latest), bar(end)])]);
  const result = await backfillYahoo(db, instrument, dailyJob);
  assert.match(result.last_error, /incomplete/);
  assert.deepEqual(db.writes.map(row => row.observed_at.slice(0, 10)), [latest, end]);
  assert.equal(db.updates.at(-1).metadata.rejected_bars[0].date, old);
});

test('wide correction omitting a newly confirmed recent date cannot resolve a price revision', async t => {
  const revised = bar(latest, { adjusted_close: 9 });
  const db = fakeDb({ rows: [bar(old), bar(latest)] });
  mockProvider(t, [payload([revised, bar(end)]), payload([bar(old), revised])]);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), /incomplete/);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.updates.at(-1).metadata.correction.unresolved_dates, [end]);
  assert.equal(db.updates.at(-1).metadata.correction.state, 'unresolved');
});

test('wide response discovering old price or event revisions cannot use the pure-gap daily fallback', async t => {
  const missing = addDays(old, -1);
  const timestamp = Date.parse(old + 'T00:00:00Z') / 1000;
  for (const kind of ['price', 'event']) {
    const db = fakeDb({ rows: [bar(old), bar(latest)], prior: { history_window_version: 1, accepted_provider_dates: [missing, old, latest], event_manifest: {} } });
    const events = kind === 'event' ? { dividends: { [timestamp]: { date: timestamp, amount: 1 } } } : {};
    const older = kind === 'price' ? bar(old, { adjusted_close: 9 }) : bar(old);
    mockProvider(t, [payload([bar(latest)]), payload([older, bar(latest)], events)]);
    await assert.rejects(backfillYahoo(db, instrument, dailyJob), /incomplete/);
    assert.deepEqual(db.writes, []);
    const correction = db.updates.at(-1).metadata.correction;
    assert.ok(correction.reasons.includes(kind === 'price' ? 'OVERLAP_VALUES_REVISED' : 'CORPORATE_ACTION_EVIDENCE_CHANGED'));
    assert.equal(correction.state, 'unresolved');
    assert.equal(db.updates.at(-1).metadata.daily_closes_preserved_while_gap_unresolved, undefined);
    t.mock.restoreAll();
  }
});

test('thrown audit-creation transport error stops retry as unconfirmed state', async t => {
  const db = fakeDb({ creationThrows: true });
  const windows = mockProvider(t, []);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), JobStateUnconfirmed);
  assert.deepEqual(windows, []); assert.deepEqual(db.writes, []); assert.deepEqual(db.updates, []);
});

test('failed corporate-action correction retains old baseline for stable suppression', async t => {
  const timestamp = Date.parse(latest + 'T00:00:00Z') / 1000;
  const events = { dividends: { [timestamp]: { date: timestamp, amount: 1 } } };
  const db = fakeDb({ rows: [bar(old), bar(latest)] });
  mockProvider(t, [payload([bar(latest)], events), payload([bar(latest)], events)]);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), /incomplete/);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.updates.at(-1).metadata.event_manifest, {});
  t.mock.restoreAll();
  const retry = fakeDb({ rows: [bar(old), bar(latest)], prior: db.updates.at(-1).metadata });
  const windows = mockProvider(t, [payload([bar(latest)], events)]);
  await assert.rejects(backfillYahoo(retry, instrument, dailyJob), /suppressed/);
  assert.equal(windows.length, 1); assert.deepEqual(retry.writes, []);
});

test('provider failure preserves pending correction for a bounded later retry', async t => {
  const db = fakeDb({ prior: { history_window_version: 1, accepted_provider_dates: [old, latest] } });
  mockProvider(t, [payload([bar(latest)]), new Error('provider unavailable')]);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), /provider unavailable/);
  assert.equal(db.updates.at(-1).metadata.correction.state, 'pending');
  assert.equal(db.updates.at(-1).metadata.correction.completed_provider_attempt, false);
  t.mock.restoreAll();
  const retry = fakeDb({ prior: db.updates.at(-1).metadata });
  const windows = mockProvider(t, [payload([bar(latest)]), payload([bar(old), bar(latest)])]);
  await backfillYahoo(retry, instrument, dailyJob);
  assert.equal(windows.length, 2); assert.equal(retry.updates.at(-1).status, 'succeeded');
});

test('database failure leaves correction pending rather than falsely resolved or suppressed', async t => {
  const db = fakeDb({ upsertError: true });
  mockProvider(t, [payload([bar(latest, { adjusted_close: 9 })]), payload([bar(latest, { adjusted_close: 9 })])]);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), /upsert rejected/);
  assert.equal(db.updates.at(-1).metadata.correction.state, 'pending');
  const prior = db.updates.at(-1).metadata;
  const decision = assessDailyRevision(historyWindow(end, db.rows, prior), db.rows, { rows: [bar(latest, { adjusted_close: 9 })], events: {} }, prior);
  assert.equal(decision.suppressed, false);
});

test('unconfirmed success or failure audit stops retry through JobStateUnconfirmed', async t => {
  for (const response of [payload([bar(latest)]), payload([])]) {
    const db = fakeDb({ auditError: true }); mockProvider(t, [response]);
    await assert.rejects(backfillYahoo(db, instrument, dailyJob), JobStateUnconfirmed);
    assert.equal(db.updates.length, 1, 'must not overwrite an ambiguously successful audit');
    t.mock.restoreAll();
  }
});

test('unverified persisted history fails before any provider request or observation mutation', async t => {
  const db = fakeDb({ readError: true }); const windows = mockProvider(t, []);
  await assert.rejects(backfillYahoo(db, instrument, dailyJob), /verify persisted/);
  assert.deepEqual(windows, []); assert.deepEqual(db.writes, []); assert.deepEqual(db.inserts, []);
});
