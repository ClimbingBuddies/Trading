import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMarketRows,
  scoreDelta,
  shouldShowEmptyState,
  summariseMarketRows,
} from '../lib/quality-critical.mjs'

test('scoreDelta returns a reproducible difference and preserves missing-data semantics', () => {
  assert.equal(scoreDelta(68.1, 67.5), 0.5999999999999943)
  assert.equal(scoreDelta(null, 67.5), null)
  assert.equal(scoreDelta(68.1, null), null)
})

test('buildMarketRows uses canonical status data and safe loader fallbacks', () => {
  const rows = buildMarketRows(
    [
      { id: 'a', symbol: 'AMD', instrument_name: 'AMD', asset_type: 'equity', exchange_code: 'NASDAQ', currency_code: 'USD ' },
      { id: 'b', symbol: 'BTC/USD', instrument_name: 'Bitcoin', asset_type: 'crypto', exchange_code: 'CRYPTO', currency_code: 'USD' },
    ],
    [{ instrument_id: 'a', data_providers: { provider_name: 'Twelve Data', provider_code: 'twelve-data' } }],
    [{ instrument_id: 'a', close: 172.5, observed_at: '2026-08-25T04:00:00Z', loaded_at: '2026-08-25T04:01:00Z', currency_code: 'USD ', age_minutes: 15, session_status: 'open', data_status: 'current' }],
  )

  assert.deepEqual(rows[0], {
    id: 'a',
    symbol: 'AMD',
    instrument_name: 'AMD',
    asset_type: 'equity',
    exchange_code: 'NASDAQ',
    currency_code: 'USD',
    latest_price: 172.5,
    observed_at: '2026-08-25T04:00:00Z',
    loaded_at: '2026-08-25T04:01:00Z',
    provider_name: 'Twelve Data',
    provider_code: 'twelve-data',
    age_minutes: 15,
    session_status: 'open',
    data_status: 'current',
  })
  assert.equal(rows[1].latest_price, null)
  assert.equal(rows[1].provider_name, null)
  assert.equal(rows[1].session_status, '24h')
  assert.equal(rows[1].data_status, 'no_data')
})

test('summariseMarketRows counts asset and freshness states and selects latest observation', () => {
  const rows = [
    { asset_type: 'equity', data_status: 'current', observed_at: '2026-08-25T01:00:00Z' },
    { asset_type: 'etf', data_status: 'market_closed', observed_at: '2026-08-25T00:30:00Z' },
    { asset_type: 'crypto', data_status: 'stale', observed_at: null },
  ]
  const summary = summariseMarketRows(rows)

  assert.deepEqual(summary.counts, { total: 3, equity: 1, etf: 1, forex: 0, crypto: 1 })
  assert.deepEqual(summary.statusSummary, { current: 1, due: 0, stale: 1, marketClosed: 1, noObservation: 0 })
  assert.equal(summary.latestObservationAt, '2026-08-25T01:00:00Z')
})

test('shouldShowEmptyState only exposes an empty state after loading finishes', () => {
  assert.equal(shouldShowEmptyState(true, 0), false)
  assert.equal(shouldShowEmptyState(false, 0), true)
  assert.equal(shouldShowEmptyState(false, 1), false)
})
