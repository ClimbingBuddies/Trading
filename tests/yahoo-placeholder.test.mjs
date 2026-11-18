import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYahoo } from '../supabase/functions/market-history-maintenance-worker/yahoo.mjs';

const date = '2026-11-17';
const complete = { open: 10, high: 12, low: 9, close: 11, adjusted_close: 10.5, volume: 100 };
const placeholder = { ...complete, close: null, adjusted_close: null };
function normalize(bars) {
  const payload = { chart: { result: [{ meta: { symbol: 'TEST.AX', exchangeName: 'ASX', currency: 'AUD', exchangeTimezoneName: 'Australia/Sydney', dataGranularity: '1d' },
    timestamp: bars.map((_, i) => Date.parse('2026-11-16T23:00:00Z') / 1000 + i * 3600),
    indicators: { quote: [Object.fromEntries(['open', 'high', 'low', 'close', 'volume'].map(k => [k, bars.map(b => b[k])]))],
      adjclose: [{ adjclose: bars.map(b => b.adjusted_close) }] } }] } };
  return normalizeYahoo(payload, 'TEST.AX', 'AUD', date, date);
}
test('matching close-null placeholder admits the complete native bar in either order with durable provenance', () => {
  for (const bars of [[placeholder, complete], [complete, placeholder], [placeholder, complete, complete]]) {
    const r = normalize(bars);
    assert.deepEqual(r.rows, [{ date, ...complete }]);
    assert.deepEqual(r.rejected, []);
    assert.equal(r.duplicates[0].source_bars.length, bars.length);
    assert.equal(r.duplicates[0].normalization_version, 2);
    assert.equal(r.duplicates[0].selected_source_timestamp, r.duplicates[0].source_bars[bars.indexOf(complete)].source_timestamp);
    assert.equal(r.duplicates[0].source_bars[bars.indexOf(placeholder)].close, null);
  }
});
test('conflicting, incomplete or invalid duplicates never supply a made-up complete row', () => {
  const cases = [
    [placeholder, { ...complete, open: 10.000000001 }],
    [placeholder, { ...complete, volume: 101 }],
    [{ ...placeholder, volume: null }, { ...complete, volume: null }],
    [{ ...placeholder, close: 11 }, complete],
    [{ ...placeholder, adjusted_close: 10.5 }, complete],
    [placeholder, complete, { ...complete, adjusted_close: 10.500000001 }],
    [placeholder, { ...complete, close: -1 }],
    [placeholder, { ...complete, high: 1 }],
    [{ ...placeholder, open: null }, complete],
    [placeholder, { ...placeholder, close: 11 }],
  ];
  for (const bars of cases) {
    const r = normalize(bars);
    assert.deepEqual(r.rows, []);
    assert.equal(r.rejected.length, 1);
  }
});
