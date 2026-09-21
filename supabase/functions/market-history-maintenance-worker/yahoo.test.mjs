import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYahoo } from './yahoo.mjs';
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
test('quarantines impossible OHLC with original values and rejects duplicate dates', () => {
  const p=sample(); p.chart.result[0].indicators.quote[0].high=[5]; const result=parse(p); assert.equal(result.rows.length,0); assert.equal(result.rejected.length,1); assert.equal(result.rejected[0].high,5); assert.equal(result.rejected[0].close,11);
  const d=sample(); d.chart.result[0].timestamp.push(d.chart.result[0].timestamp[0]); assert.throws(() => parse(d), /duplicate/);
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
