import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual UI's boundary functions; no mock implementation of them.
const source = fs.readFileSync(new URL('../components/SharedResearchRecommendations.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source + '\nexport { validPayload, safeHref };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
vm.runInNewContext(js, { exports, require: () => ({}), URL, Set, Date, Number });
const { validPayload, safeHref } = exports;
const decision = { id: 'recommendation', assessmentId: 'assessment', action: 'WAIT', thesis: 'Await independently verified developments.', risks: 'Research-only source and benchmark gaps.', modelIdentity: 'recorded-model', publishedAt: '2026-10-07T03:00:00Z', sourceCutoff: '2026-10-07T02:00:00Z' };
const item = { instrument: { id: 'instrument', symbol: 'WA1', name: 'WA1 Resources', exchange: 'ASX', currency: 'AUD' }, original: decision, latest: decision, history: [decision], sources: [{ name: 'Issuer announcement', url: 'https://example.com/filing', text: 'Published before the research cutoff.' }], measurementStatus: 'NOT_MEASURABLE', measurementBlocker: 'No verified ASX benchmark/session attribution.', includedInPerformance: false };
item.sources[0].availableAt = '2026-10-07T01:00:00Z';
item.sources[0].sourcePublishedAt = '2026-10-06T00:00:00Z';
item.priceEvidence = { status: 'AVAILABLE', latestAt: '2026-10-06T00:00:00Z', latestLoadedAt: '2026-10-06T12:00:00Z', providers: ['yahoo-unofficial'], sampleRows: 60, availableRows: 70, omittedRows: 10, caveat: 'Frozen raw research prices; provider/session attribution is not verified for performance.' };
const fixture = () => ({ contractVersion: 1, generatedAt: '2026-10-07T04:00:00Z', items: [structuredClone(item)] });

test('research response accepts saved actions and a complete 59-instrument cohort', () => {
  const p = fixture(); p.items = Array.from({ length: 59 }, (_, i) => ({ ...structuredClone(item), instrument: { ...item.instrument, id: `instrument-${i}`, symbol: `S${i}` } }));
  assert.equal(validPayload(p), true);
  for (const action of ['BUY', 'WAIT', 'HOLD', 'SELL', 'REDUCE', 'AVOID']) {
    p.items[0].latest.action = action; assert.equal(validPayload(p), true);
  }
});
test('empty saved cohort is valid without inventing recommendations', () => { const p = fixture(); p.items = []; assert.equal(validPayload(p), true); });
test('unknown source publication remains nullable while verified availability is retained', () => { const p = fixture(); p.items[0].sources[0].sourcePublishedAt = null; assert.equal(validPayload(p), true); });
for (const [name, mutate] of [
  ['measured status', p => { p.items[0].measurementStatus = 'READY'; }],
  ['included in performance', p => { p.items[0].includedInPerformance = true; }],
  ['missing exclusion flag', p => { delete p.items[0].includedInPerformance; }],
  ['missing blocker', p => { p.items[0].measurementBlocker = ''; }],
  ['unknown action', p => { p.items[0].latest.action = 'STRONG_BUY'; }],
  ['missing original model', p => { p.items[0].original.modelIdentity = ''; }],
  ['invalid saved cutoff', p => { p.items[0].latest.sourceCutoff = 'invalid'; }],
  ['invalid history record', p => { p.items[0].history.push({ action: 'BUY' }); }],
  ['missing source name', p => { p.items[0].sources[0].name = ''; }],
  ['invalid response version', p => { p.contractVersion = 2; }],
  ['invalid retrieval timestamp', p => { p.generatedAt = ''; }],
  ['missing price caveat', p => { p.items[0].priceEvidence.caveat = ''; }],
  ['negative price count', p => { p.items[0].priceEvidence.availableRows = -1; }],
  ['invalid raw price timestamp', p => { p.items[0].priceEvidence.latestAt = 'invalid'; }],
  ['missing source availability', p => { delete p.items[0].sources[0].availableAt; }],
  ['malformed source availability', p => { p.items[0].sources[0].availableAt = 'invalid'; }],
  ['malformed source publication', p => { p.items[0].sources[0].sourcePublishedAt = 'invalid'; }],
  ['missing source publication property', p => { delete p.items[0].sources[0].sourcePublishedAt; }],
]) test(`UI rejects ${name} instead of substituting evidence`, () => { const p = fixture(); mutate(p); assert.equal(validPayload(p), false); });

for (const value of [null, '', 'javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'ftp://example.com', 'https://user:password@example.com', 'https://user@example.com', '//example.com', '/relative']) {
  test(`source link is not clickable: ${String(value)}`, () => assert.equal(safeHref(value), null));
}
test('safe HTTPS source links retain escaped path/query and do not expose credentials', () => assert.equal(safeHref('https://example.com/filing?q=WA1%20ASX#date'), 'https://example.com/filing?q=WA1%20ASX#date'));
