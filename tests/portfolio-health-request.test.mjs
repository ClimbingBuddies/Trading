import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPortfolioHealthCandidate, canonicalSourcePayload, extractBearerToken, immutableSnapshotMatches, latestObservationsByInstrument, resolveFxMappings, sha256Hex } from '../supabase/functions/_shared/portfolio-health-request.mjs'

test('health request helpers require a bearer token', () => {
  assert.equal(extractBearerToken(null), null)
  assert.equal(extractBearerToken('Basic abc'), null)
  assert.equal(extractBearerToken('Bearer owner-token'), 'owner-token')
})

test('health request helpers select no observation after the cutoff', () => {
  const rows = [
    { id: 'before', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00Z' },
    { id: 'after', instrument_id: 'i1', observed_at: '2026-09-02T11:00:00Z' },
  ]
  assert.equal(latestObservationsByInstrument(rows, '2026-09-02T10:00:00Z').get('i1').id, 'before')
})

test('health request helpers resolve equal-time observation ties by canonical row identity', () => {
  const rows = [
    { id: '9', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00Z' },
    { id: '10', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00Z' },
  ]
  assert.equal(latestObservationsByInstrument(rows, '2026-09-02T10:00:00Z').get('i1').id, '10')
  assert.equal(latestObservationsByInstrument([...rows].reverse(), '2026-09-02T10:00:00Z').get('i1').id, '10')
})

test('health request helpers compare observation instants rather than timestamp text', () => {
  const rows = [
    { id: 'earlier-instant', instrument_id: 'i1', observed_at: '2026-09-02T10:00:00+01:00' },
    { id: 'later-instant', instrument_id: 'i1', observed_at: '2026-09-02T09:30:00Z' },
  ]
  assert.equal(latestObservationsByInstrument(rows, '2026-09-02T10:00:00Z').get('i1').id, 'later-instant')
  assert.equal(latestObservationsByInstrument([...rows].reverse(), '2026-09-02T10:00:00Z').get('i1').id, 'later-instant')
})

test('health request helpers resolve only exact direct or inverse FX observations aligned to the price instant', () => {
  const args = {
    positions: [{ id: 'p1', instrument_id: 'equity-usd' }],
    instruments: [{ id: 'equity-usd', currency_code: 'USD' }],
    observations: [{ id: 'price-1', instrument_id: 'equity-usd', observed_at: '2026-09-02T09:00:00Z' }],
    fxInstruments: [{ id: 'fx-aud-usd', symbol: 'AUD/USD', asset_type: 'forex', is_active: true }],
    fxObservations: [
      { id: 'fx-earlier', instrument_id: 'fx-aud-usd', provider_id: 'tiingo', interval_code: '1day', observed_at: '2026-09-02T08:59:59Z', adjusted_close: '0.65' },
      { id: 'fx-aligned', instrument_id: 'fx-aud-usd', provider_id: 'tiingo', interval_code: '1day', observed_at: '2026-09-02T09:00:00Z', adjusted_close: '0.66', close: '0.65', currency_code: 'usd' },
    ],
    baseCurrency: 'AUD', sourceCutoff: '2026-09-02T10:00:00Z',
  }
  assert.deepEqual(resolveFxMappings(args), [{ positionId: 'p1', observationId: 'fx-aligned', instrumentId: 'fx-aud-usd', pairSymbol: 'AUD/USD', providerId: 'tiingo', intervalCode: '1day', rateField: 'adjusted_close', adjustedClose: '0.66', close: '0.65', currencyCode: 'USD', rate: 0.66, observedAt: '2026-09-02T09:00:00Z' }])
  assert.deepEqual(resolveFxMappings({ ...args, fxObservations: [args.fxObservations[0]] }), [])
  assert.throws(() => resolveFxMappings({ ...args, fxInstruments: [...args.fxInstruments, { id: 'fx-usd-aud', symbol: 'USD/AUD', asset_type: 'forex', is_active: true }] }), /ambiguous/)
})

test('health candidate is deterministic and owner scoped', async () => {
  const args = {
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [{ id: 'pos1', instrument_id: 'i1', quantity: '2', average_cost_per_unit: '40', cost_currency: 'AUD' }],
    observations: [{ id: 'obs1', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49' }],
    instruments: [{ id: 'i1', asset_type: 'equity', currency_code: 'AUD' }],
  }
  const first = await buildPortfolioHealthCandidate(args)
  const second = await buildPortfolioHealthCandidate(args)
  assert.equal(first.owner_user_id, 'owner-a')
  assert.equal(first.total_value, 100)
  assert.equal(first.completeness_pct, 100)
  assert.deepEqual(first.measures.assetAllocationPct, { equity: 100 })
  assert.equal(first.source_hash, second.source_hash)
  assert.equal(immutableSnapshotMatches(first, second), true)
  const reorderedMeasures = Object.fromEntries(Object.entries(first.measures).reverse())
  assert.equal(immutableSnapshotMatches({ ...first, total_value: String(first.total_value), completeness_pct: String(first.completeness_pct), measures: reorderedMeasures }, second), true)
  assert.equal(immutableSnapshotMatches({ ...first, source_hash: 'different' }, second), false)
  assert.equal(immutableSnapshotMatches({ ...first, summary_status: first.summary_status === 'HEALTHY' ? 'NEEDS_REVIEW' : 'HEALTHY' }, second), false)
  assert.equal(immutableSnapshotMatches({ ...first, total_value: Number(first.total_value) + 1 }, second), false)
  assert.equal(immutableSnapshotMatches({ ...first, completeness_reasons: ['CORRUPTED'] }, second), false)
})

test('health candidate applies explicit FX mappings and binds them to source identity', async () => {
  const args = {
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [{ id: 'pos1', instrument_id: 'i1', quantity: '2', average_cost_per_unit: '40', cost_currency: 'USD' }],
    observations: [{ id: 'obs1', instrument_id: 'i1', provider_id: 'provider-1', interval_code: '1day', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49', currency_code: 'USD' }],
    instruments: [{ id: 'i1', asset_type: 'equity', currency_code: 'USD' }],
    fxMappings: [{ positionId: 'pos1', observationId: 'fx1', instrumentId: 'fx-i1', pairSymbol: 'AUD/USD', providerId: 'provider-1', intervalCode: '1day', rateField: 'adjusted_close', adjustedClose: '0.5', close: '0.49', currencyCode: 'USD', rate: 0.5, observedAt: '2026-09-02T09:00:00.000Z' }],
  }
  const converted = await buildPortfolioHealthCandidate(args)
  const changed = await buildPortfolioHealthCandidate({ ...args, fxMappings: [{ ...args.fxMappings[0], rate: 0.4 }] })
  assert.equal(converted.total_value, 200)
  assert.equal(converted.measures.currencyExposureState, 'NEEDS_REVIEW')
  assert.notEqual(converted.source_hash, changed.source_hash)
})

test('health candidate completeness reflects the weaker of price and cost coverage', async () => {
  const candidate = await buildPortfolioHealthCandidate({
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [
      { id: 'pos1', instrument_id: 'i1', quantity: '2', average_cost_per_unit: '40', cost_currency: 'AUD' },
      { id: 'pos2', instrument_id: 'i2', quantity: '1', average_cost_per_unit: null, cost_currency: 'AUD' },
    ],
    observations: [{ id: 'obs1', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49' }],
    instruments: [{ id: 'i1', asset_type: 'equity', currency_code: 'AUD' }, { id: 'i2', asset_type: 'etf', currency_code: 'AUD' }],
  })
  assert.equal(candidate.completeness_pct, 50)
  assert.equal(candidate.summary_status, 'INCOMPLETE_DATA')
})

test('health candidate completeness includes canonical asset mapping coverage', async () => {
  const candidate = await buildPortfolioHealthCandidate({
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [
      { id: 'pos1', instrument_id: 'i1', quantity: '1', average_cost_per_unit: '40', cost_currency: 'AUD' },
      { id: 'pos2', instrument_id: 'i2', quantity: '1', average_cost_per_unit: '40', cost_currency: 'AUD' },
    ],
    observations: [
      { id: 'obs1', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '60', close: '59' },
      { id: 'obs2', instrument_id: 'i2', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '40', close: '39' },
    ],
    instruments: [{ id: 'i1', asset_type: 'equity', currency_code: 'AUD' }],
  })
  assert.equal(candidate.completeness_pct, 50)
  assert.equal(candidate.summary_status, 'INCOMPLETE_DATA')
  assert.equal(candidate.measures.assetAllocationPct, null)
  assert.deepEqual(candidate.completeness_reasons, ['MISSING_ASSET_TYPE:pos2', 'MISSING_INSTRUMENT_CURRENCY:pos2'])
})

test('health candidate binds exact owner watchlist membership to overlap and immutable identity', async () => {
  const args = {
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [
      { id: 'pos1', instrument_id: 'i1', quantity: '2', average_cost_per_unit: '40', cost_currency: 'AUD' },
      { id: 'pos2', instrument_id: 'i2', quantity: '1', average_cost_per_unit: '20', cost_currency: 'AUD' },
    ],
    observations: [
      { id: 'obs1', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49' },
      { id: 'obs2', instrument_id: 'i2', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '20', close: '19' },
    ],
    instruments: [{ id: 'i1', asset_type: 'equity', currency_code: 'AUD' }, { id: 'i2', asset_type: 'equity', currency_code: 'AUD' }],
    watchlistItems: [{ watchlistId: 'wl-1', instrumentId: 'i2' }], watchedInstrumentIds: ['i2'],
  }
  const candidate = await buildPortfolioHealthCandidate(args)
  const movedMembership = await buildPortfolioHealthCandidate({ ...args, watchlistItems: [{ watchlistId: 'wl-2', instrumentId: 'i2' }] })
  assert.equal(candidate.measures.watchlistOverlapState, 'COMPLETE')
  assert.equal(candidate.measures.watchlistOverlapPct, 50)
  assert.deepEqual(candidate.measures.overlappingInstrumentIds, ['i2'])
  assert.notEqual(candidate.source_hash, movedMembership.source_hash)
})

test('health candidate binds canonical theme lifecycle evidence and preserves nullable schema scores', async () => {
  const args = {
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [{ id: 'pos1', instrument_id: 'i1', quantity: '2', average_cost_per_unit: '40', cost_currency: 'AUD' }],
    observations: [{ id: 'obs1', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49' }],
    instruments: [{ id: 'i1', asset_type: 'equity', currency_code: 'AUD' }],
    themeMappings: [{ positionId: 'pos1', themeId: 'theme-1', exposureType: 'DIRECT', exposureScore: null, isActive: true, themeStatus: 'ACTIVE' }],
  }
  const candidate = await buildPortfolioHealthCandidate(args)
  const paused = await buildPortfolioHealthCandidate({ ...args, themeMappings: [{ ...args.themeMappings[0], themeStatus: 'PAUSED' }] })
  assert.equal(candidate.measures.themeExposureState, 'COMPLETE')
  assert.deepEqual(candidate.measures.themeExposurePct, { 'theme-1': 100 })
  assert.notEqual(candidate.source_hash, paused.source_hash)
})

test('health source identity canonicalizes equivalent target-allocation keys and ordering', async () => {
  const base = {
    ownerId: 'owner-a', sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [{ id: 'pos1', instrument_id: 'i1', quantity: '1', average_cost_per_unit: '40', cost_currency: 'AUD' }],
    observations: [{ id: 'obs1', instrument_id: 'i1', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49' }],
    instruments: [{ id: 'i1', asset_type: 'equity', currency_code: 'AUD' }],
  }
  const first = await buildPortfolioHealthCandidate({ ...base, portfolio: { id: 'p1', base_currency: 'AUD', target_allocations: { Equity: 100, etf: 0 } } })
  const second = await buildPortfolioHealthCandidate({ ...base, portfolio: { id: 'p1', base_currency: 'AUD', target_allocations: { etf: '0', ' equity ': '100' } } })
  assert.equal(first.source_hash, second.source_hash)
})

test('health source identity canonically binds every explicit derived evidence family', async () => {
  const base = {
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [{ id: 'p2', instrument_id: 'i2', quantity: '1', average_cost_per_unit: '40', cost_currency: 'AUD', instrument_currency: 'USD' }],
    observations: [{ id: 'obs1', instrument_id: 'i2', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49' }],
    instruments: [{ id: 'i2', asset_type: 'equity', currency_code: 'usd' }],
    fxMappings: [{ positionId: 'p2', observationId: 'fx1', instrumentId: 'fx-i1', pairSymbol: 'usd/aud', providerId: 'provider-1', intervalCode: '1day', rateField: 'adjusted_close', adjustedClose: '1.5', close: '1.49', currencyCode: 'AUD', rate: '1.5', observedAt: '2026-09-02T09:00:00.000Z' }],
    issuerMappings: [{ positionId: 'p2', applicability: 'required', issuerId: 'a1111111-1111-4111-8111-111111111111', sourceName: 'registry', sourceUrl: 'https://example.test/issuer-1', evidenceAsOf: '2026-09-02', methodologyVersion: 'issuer-v1', validFrom: '2026-09-02', validTo: null }],
    themeMappings: [{ positionId: 'p2', themeId: 'theme-1', exposureType: 'DIRECT', exposureScore: '80', isActive: true, themeStatus: 'ACTIVE' }],
    watchlistItems: [{ watchlistId: 'wl-2', instrumentId: 'i3' }, { watchlistId: 'wl-1', instrumentId: 'i2' }], watchedInstrumentIds: ['i3', 'i2', 'i2'],
    freshnessMappings: [{ positionId: 'p2', priceObservationId: 'obs1', priceObservedAt: '2026-09-02T09:00:00.000Z', priceProviderId: 'provider-1', priceIntervalCode: '1day', fxObservationId: 'fx1', fxObservedAt: '2026-09-02T09:00:00.000Z', fxProviderId: 'provider-1', calendarId: 'calendar-1', methodologyVersion: 'freshness-v1', priceMissedSessions: 0, fxMissedSessions: 1 }],
  }
  const canonical = canonicalSourcePayload(base)
  const reordered = canonicalSourcePayload({ ...base, watchlistItems: [...base.watchlistItems].reverse(), watchedInstrumentIds: ['i2', 'i3'] })
  assert.equal(await sha256Hex(canonical), await sha256Hex(reordered))
  const changedFxRawSource = canonicalSourcePayload({ ...base, fxMappings: [{ ...base.fxMappings[0], adjustedClose: '1.51' }] })
  assert.notEqual(await sha256Hex(canonical), await sha256Hex(changedFxRawSource))
  for (const [key, mutate] of [
    ['fxMappings', (row) => ({ ...row, rate: 1.6 })],
    ['themeMappings', (row) => ({ ...row, exposureScore: 81 })],
    ['watchlistItems', (row) => row.watchlistId === 'wl-1' ? { ...row, watchlistId: 'wl-3' } : row],
    ['freshnessMappings', (row) => ({ ...row, fxMissedSessions: 2 })],
  ]) {
    const changed = canonicalSourcePayload({ ...base, [key]: base[key].map(mutate) })
    assert.notEqual(await sha256Hex(canonical), await sha256Hex(changed), key)
  }
})

test('health source identity binds every issuer applicability, provenance and validity field', async () => {
  const base = {
    ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, sourceCutoff: '2026-09-02T10:00:00.000Z',
    positions: [{ id: 'p2', instrument_id: 'i2', quantity: '1', average_cost_per_unit: '40', cost_currency: 'AUD' }],
    observations: [{ id: 'obs1', instrument_id: 'i2', observed_at: '2026-09-02T09:00:00.000Z', adjusted_close: '50', close: '49' }],
    instruments: [{ id: 'i2', asset_type: 'equity', currency_code: 'AUD' }],
    issuerMappings: [{ positionId: 'p2', applicability: 'required', issuerId: 'a1111111-1111-4111-8111-111111111111', sourceName: 'registry', sourceUrl: 'https://example.test/issuer-1', evidenceAsOf: '2026-09-01', methodologyVersion: 'issuer-v1', validFrom: '2026-09-01', validTo: null }],
  }
  const canonicalHash = await sha256Hex(canonicalSourcePayload(base))
  for (const [field, mutate] of [
    ['applicability', (row) => ({ ...row, applicability: 'not_applicable', issuerId: null })],
    ['issuerId', (row) => ({ ...row, issuerId: '22222222-2222-4222-8222-222222222222' })],
    ['sourceName', (row) => ({ ...row, sourceName: 'exchange-filing' })],
    ['sourceUrl', (row) => ({ ...row, sourceUrl: 'https://example.test/issuer-2' })],
    ['evidenceAsOf', (row) => ({ ...row, evidenceAsOf: '2026-09-02' })],
    ['methodologyVersion', (row) => ({ ...row, methodologyVersion: 'issuer-v2' })],
    ['validFrom', (row) => ({ ...row, validFrom: '2026-08-31' })],
    ['validTo', (row) => ({ ...row, validTo: '2026-09-03' })],
  ]) {
    const changed = canonicalSourcePayload({ ...base, issuerMappings: [mutate(base.issuerMappings[0])] })
    assert.notEqual(await sha256Hex(changed), canonicalHash, field)
  }
})

test('health source identity distinguishes omitted, null and loaded-empty evidence', async () => {
  const base = { ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, positions: [], observations: [], instruments: [], sourceCutoff: '2026-09-02T10:00:00.000Z' }
  const hashes = await Promise.all([
    canonicalSourcePayload(base),
    canonicalSourcePayload({ ...base, freshnessMappings: null }),
    canonicalSourcePayload({ ...base, freshnessMappings: [] }),
  ].map(sha256Hex))
  assert.equal(new Set(hashes).size, 3)
  assert.throws(() => canonicalSourcePayload({ ...base, fxMappings: [{ positionId: 'p1' }, { positionId: 'p1' }] }), /present and unique/)
})

test('health source identity rejects incomplete evidence before hashing', () => {
  const base = { ownerId: 'owner-a', portfolio: { id: 'p1', base_currency: 'AUD' }, positions: [], observations: [], instruments: [], sourceCutoff: '2026-09-02T10:00:00.000Z' }
  const issuer = { positionId: 'p1', applicability: 'required', issuerId: 'a1111111-1111-4111-8111-111111111111', sourceName: 'registry', sourceUrl: 'https://example.test/issuer-1', evidenceAsOf: '2026-09-01', methodologyVersion: 'issuer-v1', validFrom: '2026-09-01', validTo: null }
  assert.throws(() => canonicalSourcePayload({ ...base, themeMappings: [{ positionId: 'p1', exposureType: 'direct', exposureScore: 50, isActive: true, themeStatus: 'active' }] }), /present and unique/)
  assert.throws(() => canonicalSourcePayload({ ...base, watchlistItems: [{ instrumentId: 'i1' }] }), /present and unique/)
  assert.throws(() => canonicalSourcePayload({ ...base, watchlistItems: [{ watchlistId: 'wl-1', instrumentId: 'i1' }, { watchlistId: 'wl-1', instrumentId: 'i1' }] }), /present and unique/)
  assert.throws(() => canonicalSourcePayload({ ...base, watchedInstrumentIds: [''] }), /non-empty string identities/)
  assert.throws(() => canonicalSourcePayload({ ...base, freshnessMappings: [{ positionId: 'p1', priceMissedSessions: 0 }] }), /present and unique/)
  for (const invalidIssuer of [
    { ...issuer, applicability: 'required', issuerId: null },
    { ...issuer, issuerId: 'issuer-1' },
    { ...issuer, issuerId: ' a1111111-1111-4111-8111-111111111111' },
    { ...issuer, issuerId: 'a1111111-1111-4111-8111-111111111111 ' },
    { ...issuer, issuerId: '11111111-1111-4111-8111-11111111111G' },
    { ...issuer, issuerId: 'a1111111-1111-4111-8111-111111111111'.toUpperCase() },
    { ...issuer, applicability: 'not_applicable', issuerId: 'a1111111-1111-4111-8111-111111111111' },
    { ...issuer, sourceName: ' ' },
    { ...issuer, sourceName: ' registry' },
    { ...issuer, sourceName: 'registry ' },
    { ...issuer, sourceName: 'registry\nsecret' },
    { ...issuer, sourceUrl: ' ' },
    { ...issuer, sourceUrl: ' https://example.test/issuer-1' },
    { ...issuer, sourceUrl: 'https://example.test/issuer-1 ' },
    { ...issuer, sourceUrl: 'http://example.test/issuer-1' },
    { ...issuer, sourceUrl: '/issuer-1' },
    { ...issuer, sourceUrl: 'https://user:secret@example.test/issuer-1' },
    { ...issuer, sourceUrl: 'https://example.test/issuer-1?api_key=secret' },
    { ...issuer, sourceUrl: 'https://example.test/issuer-1#private-note' },
    { ...issuer, methodologyVersion: '' },
    { ...issuer, methodologyVersion: ' issuer-v1' },
    { ...issuer, methodologyVersion: 'issuer-v1 ' },
    { ...issuer, methodologyVersion: 'issuer-v1\tprivate' },
    { ...issuer, evidenceAsOf: '2026-09-03' },
    { ...issuer, evidenceAsOf: 'not-a-date' },
    { ...issuer, evidenceAsOf: '2026-02-30' },
    { ...issuer, validFrom: '2026-09' },
    { ...issuer, validFrom: '2026-02-30' },
    { ...issuer, validFrom: '2026-09-03' },
    { ...issuer, validTo: '2026-09-01' },
    { ...issuer, validFrom: '2026-01-01', validTo: '2026-02-30' },
    { ...issuer, validFrom: '2026-08-01', validTo: '2026-09-02' },
  ]) assert.throws(() => canonicalSourcePayload({ ...base, issuerMappings: [invalidIssuer] }), /present and unique/)
})

test('Edge Function source validates permanent users and filters every privileged personal query by owner', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../supabase/functions/refresh-portfolio-health/index.ts', import.meta.url), 'utf8')
  assert.match(source, /auth\.getUser\(token\)/)
  assert.match(source, /user\.is_anonymous/)
  assert.equal((source.match(/\.eq\('owner_user_id', user\.id\)/g) ?? []).length >= 3, true)
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(source, /NEXT_PUBLIC_.*SERVICE/)
  assert.match(source, /error\.code !== '23505'/)
  assert.match(source, /immutableSnapshotMatches/)
  assert.match(source, /@supabase\/supabase-js@2\.57\.0/)
  assert.doesNotMatch(source, /select\('\*'\)/)
  assert.match(source, /new Date\(cutoffMs\)\.toISOString\(\)/)
  assert.match(source, /from\('data_providers'\)\.select\('id,provider_code,is_active'\)\.eq\('provider_code', 'tiingo'\)\.eq\('is_active', true\)/)
  assert.match(source, /providerResult\.data \?\? \[\]\)\.length !== 1/)
  assert.match(source, /from\('portfolio_positions'\)[\s\S]*?\.eq\('portfolio_id', body\.portfolio_id\)\.eq\('owner_user_id', user\.id\)\.order\('id'\)\.range\(offset, offset \+ pageSize - 1\)/)
  assert.match(source, /heldInstrumentIds = instrumentIds\.slice\(batchOffset, batchOffset \+ idBatchSize\)/)
  assert.match(source, /select\('id,asset_type,currency_code'\)\.in\('id', heldInstrumentIds\)\.order\('id'\)/)
  assert.match(source, /instruments\.length !== instrumentIds\.length/)
  assert.match(source, /select\('id,instrument_id,provider_id,interval_code,observed_at,adjusted_close,close,currency_code'\)/)
  assert.match(source, /\.eq\('provider_id', providerId\)\.eq\('interval_code', '1day'\)\.lte\('observed_at', sourceCutoff\)/)
  assert.match(source, /\.order\('observed_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/)
  assert.match(source, /from\('instruments'\)\.select\('id,symbol,asset_type,is_active,currency_code'\)\.eq\('asset_type', 'forex'\)\.eq\('is_active', true\)/)
  assert.match(source, /resolveFxMappings\(\{ positions, instruments, observations, fxInstruments: relevantFxInstruments, fxObservations, baseCurrency, sourceCutoff \}\)/)
  assert.match(source, /from\('watchlists'\)[\s\S]*?\.eq\('owner_user_id', user\.id\)/)
  assert.match(source, /watchlistIds\.slice\(batchOffset, batchOffset \+ idBatchSize\)/)
  assert.match(source, /from\('watchlist_items'\)\.select\('watchlist_id,instrument_id'\)\.in\('watchlist_id', ownerListIds\)/)
  assert.match(source, /watchlistId: row\.watchlist_id, instrumentId: row\.instrument_id/)
  assert.match(source, /cutoffDate = sourceCutoff\.slice\(0, 10\)/)
  assert.match(source, /from\('instrument_issuer_mappings'\)\.select\('id,instrument_id,issuer_id,applicability,source_name,source_url,evidence_as_of,methodology_version,valid_from,valid_to'\)/)
  assert.match(source, /\.lte\('evidence_as_of', cutoffDate\)/)
  assert.match(source, /\.lte\('valid_from', cutoffDate\)\.or\(`valid_to\.is\.null,valid_to\.gt\.\$\{cutoffDate\}`\)/)
  assert.match(source, /from\('instrument_issuer_mappings'\)[\s\S]*?\.order\('instrument_id'\)\.order\('valid_from'\)\.order\('methodology_version'\)\.order\('id'\)\.range\(offset, offset \+ pageSize - 1\)/)
  assert.match(source, /issuerRows\.push\(\.\.\.rows\)[\s\S]*?if \(rows\.length < pageSize\) break/)
  assert.match(source, /issuerByInstrumentId\.has\(row\.instrument_id\)/)
  assert.match(source, /positionId: position\.id, applicability: row\.applicability, issuerId: row\.issuer_id/)
  assert.match(source, /buildPortfolioHealthCandidate\(\{[\s\S]*?issuerMappings/)
  assert.match(source, /\.range\(offset, offset \+ pageSize - 1\)/)
  assert.match(source, /from\('opportunity_theme_instruments'\)\.select\('theme_id,instrument_id,exposure_type,exposure_score,is_active'\)/)
  assert.match(source, /from\('opportunity_themes'\)\.select\('id,status'\)/)
  assert.match(source, /themeRows\.length !== themeIds\.length/)
  assert.match(source, /positionId: position\.id, themeId: row\.theme_id/)
})
