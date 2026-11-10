import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYahoo, backfillYahoo, sydneyDate, addDays } from './yahoo.mjs';
const sample = () => ({ chart: { result: [{ meta: { symbol: 'XRO.AX', exchangeName: 'ASX', currency: 'AUD', exchangeTimezoneName: 'Australia/Sydney', dataGranularity: '1d' }, timestamp: [Date.parse('2026-01-05T23:00:00Z') / 1000], indicators: { quote: [{ open: [10], high: [12], low: [9], close: [11], volume: [100] }], adjclose: [{ adjclose: [10.5] }] } }] } });
const parse = p => normalizeYahoo(p, 'XRO.AX', 'AUD', '2026-01-06', '2026-01-06');
test('uses Sydney session date and retains separate adjusted close', () => {
  const row = parse(sample()).rows[0];
  assert.equal(row.date, '2026-01-06'); assert.equal(row.close, 11); assert.equal(row.adjusted_close, 10.5);
});
test('rejects wrong currency and wrong venue', () => {
  for (const [key,value] of [['currency','USD'],['exchangeName','NMS']]) { const p=sample(); p.chart.result[0].meta[key]=value; assert.throws(() => parse(p), /mismatch/); }
});
test('does not turn missing prices into zero', () => {
  const p=sample(); for (const key of ['open','high','low','close']) p.chart.result[0].indicators.quote[0][key]=[null];
  assert.equal(parse(p).rows.length, 0); assert.equal(parse(p).skipped, 1);
});
test('quarantines impossible OHLC with original values', () => {
  const p=sample(); p.chart.result[0].indicators.quote[0].high=[5]; const result=parse(p); assert.equal(result.rows.length,0); assert.equal(result.rejected.length,1); assert.equal(result.rejected[0].high,5); assert.equal(result.rejected[0].close,11);
});
test('keeps valid bars beside a quarantined bar', () => {
  const p=sample(), x=p.chart.result[0];
  x.timestamp.push(Date.parse('2026-01-06T23:00:00Z')/1000);
  for (const key of ['open','high','low','close','volume']) x.indicators.quote[0][key].push(x.indicators.quote[0][key][0]);
  x.indicators.quote[0].high[0]=5; x.indicators.adjclose[0].adjclose.push(10.5);
  const result=normalizeYahoo(p,'XRO.AX','AUD','2026-01-06','2026-01-07');
  assert.equal(result.rows.length,1); assert.equal(result.rows[0].date,'2026-01-07'); assert.equal(result.rejected.length,1);
});
test('excludes partial or out-of-window sessions', () => {
  assert.equal(normalizeYahoo(sample(), 'XRO.AX','AUD','2026-01-01','2026-01-05').rows.length, 0);
});

function appendBar(payload, timestamp, overrides = {}) {
  const x = payload.chart.result[0];
  x.timestamp.push(timestamp);
  for (const key of ['open', 'high', 'low', 'close', 'volume']) {
    x.indicators.quote[0][key].push(Object.hasOwn(overrides, key) ? overrides[key] : x.indicators.quote[0][key][0]);
  }
  x.indicators.adjclose[0].adjclose.push(Object.hasOwn(overrides, 'adjusted_close') ? overrides.adjusted_close : x.indicators.adjclose[0].adjclose[0]);
}

test('collapses identical daily values and preserves both source timestamps in audit', () => {
  const p = sample(), first = p.chart.result[0].timestamp[0];
  appendBar(p, first + 3600);
  const result = parse(p);
  assert.deepEqual(result.rows, parse(sample()).rows);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.duplicates[0].count, 2);
  assert.deepEqual(result.duplicates[0].source_bars.map(b => b.source_timestamp), [first, first + 3600]);
});

test('any conflicting field excludes the entire date while retaining unrelated valid dates', () => {
  for (const [key, value] of [['open', 10.1], ['high', 12.1], ['low', 9.1], ['close', 11.1], ['volume', 101], ['adjusted_close', 10.6], ['close', null], ['adjusted_close', null]]) {
    const p = sample(), first = p.chart.result[0].timestamp[0];
    appendBar(p, first + 3600, { [key]: value });
    appendBar(p, first + 86400);
    const result = normalizeYahoo(p, 'XRO.AX', 'AUD', '2026-01-06', '2026-01-07');
    assert.deepEqual(result.rows.map(b => b.date), ['2026-01-07'], key);
    assert.equal(result.rejected.length, 1);
    assert.match(result.rejected[0].reason, /entire session excluded/);
    assert.equal(result.rejected[0].source_bars[1][key], value);
    assert.equal(result.duplicates.length, 0);
  }
});

test('three-bar conflict remains excluded regardless of provider ordering', () => {
  const p = sample(), first = p.chart.result[0].timestamp[0];
  appendBar(p, first + 3600);
  appendBar(p, first + 7200, { close: 11.5 });
  const forward = parse(p);
  const x = p.chart.result[0];
  x.timestamp.reverse();
  Object.values(x.indicators.quote[0]).forEach(values => values.reverse());
  x.indicators.adjclose[0].adjclose.reverse();
  const reverse = parse(p);
  assert.deepEqual(forward.rows, []);
  assert.deepEqual(reverse.rows, []);
  assert.equal(forward.rejected[0].source_bars.length, 3);
  assert.deepEqual(reverse.rejected[0].source_bars, forward.rejected[0].source_bars.toReversed());
});

test('out-of-window conflicting duplicates do not contaminate a completed-session request', () => {
  const p = sample(), first = p.chart.result[0].timestamp[0];
  appendBar(p, first + 86400);
  appendBar(p, first + 90000, { close: null });
  const result = parse(p);
  assert.deepEqual(result.rows, parse(sample()).rows);
  assert.equal(result.rejected.length, 0);
});

test('identical invalid and empty duplicates remain unusable', () => {
  const invalid = sample();
  invalid.chart.result[0].indicators.quote[0].high[0] = 5;
  appendBar(invalid, invalid.chart.result[0].timestamp[0] + 3600);
  assert.equal(parse(invalid).rows.length, 0);
  assert.equal(parse(invalid).rejected[0].high, 5);
  const empty = sample();
  for (const key of ['open', 'high', 'low', 'close']) empty.chart.result[0].indicators.quote[0][key][0] = null;
  appendBar(empty, empty.chart.result[0].timestamp[0] + 3600);
  assert.equal(parse(empty).skipped, 2);
  assert.equal(parse(empty).rows.length, 0);
});

function fakeDb() {
  const updates = [], writes = [];
  return { updates, writes, from(table) {
    const query = {
      select() { return query; }, eq() { return query; },
      single() { return Promise.resolve({ data: { id: table === 'data_providers' ? 'provider' : 'run' }, error: null }); },
      insert() { return query; },
      in() { return Promise.resolve({ data: [], error: null }); },
      upsert(rows) { writes.push(...rows); return Promise.resolve({ error: null }); },
      update(value) { updates.push(value); return query; }
    };
    return query;
  } };
}

test('backfill persists conflict evidence on success and on an all-rejected failure', async t => {
  for (const keepValid of [true, false]) {
    const p = sample(), x = p.chart.result[0];
    x.timestamp[0] = Date.parse(addDays(sydneyDate(), -3) + 'T00:00:00Z') / 1000;
    appendBar(p, x.timestamp[0] + 3600, { close: null });
    if (keepValid) {
      appendBar(p, x.timestamp[0] + 86400);
      appendBar(p, x.timestamp[0] + 90000);
    }
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => p }));
    const db = fakeDb();
    const run = backfillYahoo(db, { id: 'instrument', symbol: 'XRO', currency_code: 'AUD' }, { years: 1 });
    if (keepValid) {
      const result = await run;
      assert.match(result.last_error, /ambiguous/);
      assert.equal(db.writes.length, 1);
      assert.equal(db.updates.at(-1).status, 'succeeded');
      assert.equal(db.updates.at(-1).metadata.duplicate_bars[0].count, 2);
    } else {
      await assert.rejects(run, /no usable daily bars/);
      assert.equal(db.writes.length, 0);
      assert.equal(db.updates.at(-1).status, 'failed');
    }
    const audit = db.updates.at(-1).metadata;
    assert.equal(audit.coverage_has_rejected_bars, true);
    assert.equal(audit.rejected_bars[0].source_bars.length, 2);
    assert.equal(audit.rejected_bars[0].source_bars[1].close, null);
    t.mock.restoreAll();
  }
});
