import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluatePortfolioHealthCore, PORTFOLIO_HEALTH_VERSION } from '../lib/portfolio-health.mjs'

const cutoff = '2026-09-02T10:00:00.000Z'

test('portfolio-health-v1 deterministically calculates concentration and complete cost coverage', () => {
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [
    { id: 'a', quantity: 2, currentPrice: 50, priceObservedAt: '2026-09-02T09:00:00.000Z', averageCostPerUnit: 40, costCurrency: 'AUD', assetType: 'equity' },
    { id: 'b', quantity: 1, currentPrice: 300, priceObservedAt: '2026-09-02T09:30:00.000Z', averageCostPerUnit: 250, costCurrency: 'AUD', assetType: 'crypto' },
  ] })
  assert.equal(result.methodologyVersion, PORTFOLIO_HEALTH_VERSION)
  assert.equal(result.totalValue, 400)
  assert.equal(result.largestPositionPct, 75)
  assert.equal(result.topThreePct, 100)
  assert.equal(result.costBasisCompletenessPct, 100)
  assert.equal(result.concentrationState, 'NEEDS_REVIEW')
  assert.equal(result.assetAllocationComplete, true)
  assert.deepEqual(result.assetAllocationPct, { crypto: 75, equity: 25 })
})

test('portfolio-health-v1 never substitutes missing price or cost with zero', () => {
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [
    { id: 'missing', quantity: 3, currentPrice: null, priceObservedAt: null, averageCostPerUnit: null, costCurrency: 'USD', assetType: 'equity' },
  ] })
  assert.equal(result.totalValue, null)
  assert.equal(result.largestPositionPct, null)
  assert.equal(result.costBasisCompletenessPct, 0)
  assert.equal(result.concentrationState, 'INCOMPLETE_DATA')
  assert.deepEqual(result.completenessReasons, ['INCOMPLETE_COST_BASIS', 'MISSING_PRICE:missing'])
})

test('portfolio-health-v1 reports an empty portfolio as incomplete', () => {
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [] })
  assert.equal(result.totalValue, null)
  assert.equal(result.concentrationState, 'INCOMPLETE_DATA')
  assert.deepEqual(result.completenessReasons, ['NO_POSITIONS'])
})

test('portfolio-health-v1 rejects look-ahead observations', () => {
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [
    { id: 'future', quantity: 1, currentPrice: 20, priceObservedAt: '2026-09-02T10:00:01.000Z', averageCostPerUnit: 10, costCurrency: 'AUD' },
  ] }), /future price observation/)
})

const positionAtValue = (id, value, averageCostPerUnit = 1, costCurrency = 'AUD') => ({
  id,
  quantity: 1,
  currentPrice: value,
  priceObservedAt: '2026-09-02T09:00:00.000Z',
  averageCostPerUnit,
  costCurrency,
  assetType: 'equity',
})

test('portfolio-health-v1 exposes incomplete asset classification without guessing', () => {
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [
    { ...positionAtValue('mapped', 60), assetType: 'ETF' },
    { ...positionAtValue('unmapped', 40), assetType: null },
  ] })
  assert.equal(result.valuationComplete, true)
  assert.equal(result.assetAllocationComplete, false)
  assert.equal(result.mappedAssetPositionCount, 1)
  assert.equal(result.assetAllocationPct, null)
  assert.deepEqual(result.completenessReasons, ['MISSING_ASSET_TYPE:unmapped'])
})

test('portfolio-health-v1 treats exact advisory boundaries as within threshold', () => {
  const values = [15, 15, 15, 14, 14, 14, 13]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: values.map((value, index) => positionAtValue(String(index), value)) })
  assert.equal(result.largestPositionPct, 15)
  assert.equal(result.topThreePct, 45)
  assert.equal(result.concentrationState, 'WITHIN_THRESHOLD')
})

test('portfolio-health-v1 treats exact review boundaries as advisory', () => {
  const values = [25, 20, 15, 10, 10, 10, 10]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: values.map((value, index) => positionAtValue(String(index), value)) })
  assert.equal(result.largestPositionPct, 25)
  assert.equal(result.topThreePct, 60)
  assert.equal(result.concentrationState, 'ADVISORY')
})

test('portfolio-health-v1 evaluates thresholds before display rounding', () => {
  const values = [25.004, 17, 17, 14.996, 13, 13]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: values.map((value, index) => positionAtValue(String(index), value)) })
  assert.equal(result.largestPositionPct, 25)
  assert.equal(result.topThreePct, 59)
  assert.equal(result.concentrationState, 'NEEDS_REVIEW')
})

test('portfolio-health-v1 rejects invalid numeric inputs and preserves partial cost completeness', () => {
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [positionAtValue('bad-quantity', 10), { ...positionAtValue('invalid', 10), quantity: Number.NaN }] }), /positive quantity/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [positionAtValue('invalid-price', Number.POSITIVE_INFINITY)] }), /positive current price/)

  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [
    positionAtValue('complete', 60),
    positionAtValue('missing-cost', 40, null, 'AUD'),
  ] })
  assert.equal(result.costBasisCompletenessPct, 50)
  assert.deepEqual(result.completenessReasons, ['INCOMPLETE_COST_BASIS'])
})

test('portfolio-health-v1 keeps absent targets distinct and applies strict drift thresholds', () => {
  const positions = [
    { ...positionAtValue('equity', 60), assetType: 'Equity' },
    { ...positionAtValue('etf', 40), assetType: 'ETF' },
  ]
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions }).targetAllocationState, 'NOT_CONFIGURED')
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, targetAllocations: { equity: 55, etf: 45 } }).targetAllocationState, 'WITHIN_THRESHOLD')
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, targetAllocations: { equity: 50, etf: 50 } }).targetAllocationState, 'ADVISORY')
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, targetAllocations: { equity: 49.99, etf: 50.01 } }).targetAllocationState, 'NEEDS_REVIEW')
})

test('portfolio-health-v1 validates targets and refuses drift from incomplete allocation', () => {
  const positions = [{ ...positionAtValue('unmapped', 100), assetType: null }]
  const incomplete = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, targetAllocations: { equity: 100 } })
  assert.equal(incomplete.targetAllocationState, 'INCOMPLETE_DATA')
  assert.equal(incomplete.targetAllocationDriftPct, null)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, targetAllocations: {} }), /total 100 percent/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, targetAllocations: { equity: 90 } }), /total 100 percent/)
})

test('portfolio-health-v1 evaluates target drift before display rounding', () => {
  const positions = [
    { ...positionAtValue('equity', 60.004), assetType: 'equity' },
    { ...positionAtValue('etf', 39.996), assetType: 'etf' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, targetAllocations: { equity: 50, etf: 50 } })
  assert.equal(result.assetAllocationPct.equity, 60)
  assert.equal(result.largestTargetDriftPct, 10)
  assert.equal(result.targetAllocationState, 'NEEDS_REVIEW')
})

test('portfolio-health-v1 combines instruments by issuer and applies strict thresholds', () => {
  const positions = [positionAtValue('a', 15), positionAtValue('b', 15), positionAtValue('c', 70)]
  const mappings = [
    { positionId: 'a', applicability: 'required', issuerId: 'issuer-1' },
    { positionId: 'b', applicability: 'required', issuerId: 'issuer-1' },
    { positionId: 'c', applicability: 'required', issuerId: 'issuer-2' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, issuerMappings: mappings })
  assert.deepEqual(result.issuerConcentrationPct, { 'issuer-1': 30, 'issuer-2': 70 })
  assert.equal(result.largestIssuerPct, 70)
  assert.equal(result.issuerConcentrationState, 'NEEDS_REVIEW')
})

test('portfolio-health-v1 fails closed on missing issuer mappings and preserves not applicable', () => {
  const positions = [positionAtValue('a', 50), positionAtValue('b', 50)]
  const incomplete = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, issuerMappings: [{ positionId: 'a', applicability: 'required', issuerId: 'issuer-1' }] })
  assert.equal(incomplete.issuerConcentrationState, 'INCOMPLETE_DATA')
  assert.deepEqual(incomplete.completenessReasons, ['MISSING_ISSUER_MAPPING:b'])
  const notApplicable = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, issuerMappings: positions.map((position) => ({ positionId: position.id, applicability: 'not_applicable', issuerId: null })) })
  assert.equal(notApplicable.issuerConcentrationState, 'NOT_APPLICABLE')
  assert.equal(notApplicable.issuerConcentrationPct, null)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, issuerMappings: [
    ...positions.map((position) => ({ positionId: position.id, applicability: 'not_applicable', issuerId: null })),
    { positionId: 'outside', applicability: 'required', issuerId: 'issuer-2' },
  ] }), /outside the evaluated portfolio/)
})

test('portfolio-health-v1 evaluates issuer thresholds before display rounding', () => {
  const positions = [positionAtValue('a', 30.004), positionAtValue('b', 23.332), positionAtValue('c', 23.332), positionAtValue('d', 23.332)]
  const mappings = positions.map((position, index) => ({ positionId: position.id, applicability: 'required', issuerId: `issuer-${index}` }))
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, issuerMappings: mappings })
  assert.equal(result.issuerConcentrationPct['issuer-0'], 30)
  assert.equal(result.issuerConcentrationState, 'NEEDS_REVIEW')

  const exact = evaluatePortfolioHealthCore({
    sourceCutoff: cutoff,
    positions: [positionAtValue('a', 30), positionAtValue('b', 25), positionAtValue('c', 25), positionAtValue('d', 20)],
    issuerMappings: ['a', 'b', 'c', 'd'].map((positionId) => ({ positionId, applicability: 'required', issuerId: positionId })),
  })
  assert.equal(exact.largestIssuerPct, 30)
  assert.equal(exact.issuerConcentrationState, 'ADVISORY')
})

test('portfolio-health-v1 calculates overlapping theme exposure without score weighting', () => {
  const positions = [positionAtValue('a', 60), positionAtValue('b', 40)]
  const themeMappings = [
    { positionId: 'a', themeId: 'ai', exposureType: 'direct', exposureScore: 25, isActive: true, themeStatus: 'active' },
    { positionId: 'a', themeId: 'robotics', exposureType: 'enabler', exposureScore: 100, isActive: true, themeStatus: 'watch' },
    { positionId: 'b', themeId: 'ai', exposureType: 'beneficiary', exposureScore: 75, isActive: true, themeStatus: 'active' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings })
  assert.equal(result.themeExposureState, 'COMPLETE')
  assert.deepEqual(result.themeExposurePct, { ai: 100, robotics: 60 })
})

test('portfolio-health-v1 excludes inactive mappings and non-current themes while preserving complete coverage', () => {
  const positions = [positionAtValue('a', 70), positionAtValue('b', 30)]
  const themeMappings = [
    { positionId: 'a', themeId: 'legacy', exposureType: 'direct', exposureScore: 80, isActive: false, themeStatus: 'active' },
    { positionId: 'b', themeId: 'retired', exposureType: 'risk', exposureScore: 60, isActive: true, themeStatus: 'archived' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings })
  assert.equal(result.themeExposureState, 'COMPLETE')
  assert.deepEqual(result.themeExposurePct, {})
})

test('portfolio-health-v1 fails closed on missing theme mapping evidence', () => {
  const positions = [positionAtValue('a', 50), positionAtValue('b', 50)]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings: [
    { positionId: 'a', themeId: 'ai', exposureType: 'supplier', exposureScore: 90, isActive: true, themeStatus: 'active' },
  ] })
  assert.equal(result.themeExposureState, 'INCOMPLETE_DATA')
  assert.equal(result.themeExposurePct, null)
  assert.deepEqual(result.completenessReasons, ['MISSING_THEME_MAPPING_EVIDENCE:b'])
})

test('portfolio-health-v1 validates theme mapping identities and states', () => {
  const positions = [positionAtValue('a', 100)]
  const valid = { positionId: 'a', themeId: 'ai', exposureType: 'substitute', exposureScore: 0, isActive: true, themeStatus: 'active' }
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings: [valid, valid] }), /unique by position, theme and exposure type/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings: [{ ...valid, positionId: 'outside' }] }), /outside the evaluated portfolio/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings: [{ ...valid, exposureScore: 101 }] }), /scores must be null or from 0 to 100/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings: [{ ...valid, themeStatus: 'unknown' }] }), /explicit mapping and theme states/)
})

test('portfolio-health-v1 accepts every schema-permitted theme lifecycle state', () => {
  const positions = [positionAtValue('a', 50), positionAtValue('b', 50)]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, themeMappings: [
    { positionId: 'a', themeId: 'paused-theme', exposureType: 'direct', exposureScore: 50, isActive: true, themeStatus: 'paused' },
    { positionId: 'b', themeId: 'archived-theme', exposureType: 'risk', exposureScore: 50, isActive: true, themeStatus: 'archived' },
  ] })
  assert.equal(result.themeExposureState, 'COMPLETE')
  assert.deepEqual(result.themeExposurePct, {})
})

test('portfolio-health-v1 preserves nullable schema exposure scores because allocation is not score weighted', () => {
  const result = evaluatePortfolioHealthCore({
    positions: [{ id: 'p1', quantity: 1, averageCostPerUnit: 10, costCurrency: 'AUD', currentPrice: 20, priceObservedAt: cutoff, assetType: 'equity' }],
    sourceCutoff: cutoff,
    themeMappings: [{ positionId: 'p1', themeId: 'theme-1', exposureType: 'direct', exposureScore: null, isActive: true, themeStatus: 'active' }],
  })
  assert.equal(result.themeExposureState, 'COMPLETE')
  assert.deepEqual(result.themeExposurePct, { 'theme-1': 100 })
})

test('portfolio-health-v1 converts direct and inverse FX into base currency', () => {
  const positions = [
    { ...positionAtValue('aud', 100), instrumentCurrency: 'AUD' },
    { ...positionAtValue('usd', 100), instrumentCurrency: 'USD' },
    { ...positionAtValue('cad', 100), instrumentCurrency: 'CAD' },
  ]
  const fxMappings = [
    { positionId: 'usd', observationId: 'fx-usd', pairSymbol: 'AUD/USD', rate: 0.5, observedAt: '2026-09-02T09:00:00.000Z' },
    { positionId: 'cad', observationId: 'fx-cad', pairSymbol: 'CAD/AUD', rate: 1.5, observedAt: '2026-09-02T09:00:00.000Z' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, baseCurrency: 'AUD', fxMappings })
  assert.equal(result.totalValue, 450)
  assert.deepEqual(result.currencyExposurePct, { AUD: 22.22, CAD: 33.33, USD: 44.44 })
  assert.equal(result.nonBaseCurrencyPct, 77.78)
  assert.equal(result.currencyExposureState, 'NEEDS_REVIEW')
})

test('portfolio-health-v1 fails closed on missing FX instead of mixing currencies', () => {
  const positions = [
    { ...positionAtValue('aud', 100), instrumentCurrency: 'AUD' },
    { ...positionAtValue('usd', 100), instrumentCurrency: 'USD' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, baseCurrency: 'AUD', fxMappings: [] })
  assert.equal(result.totalValue, null)
  assert.equal(result.currencyExposureState, 'INCOMPLETE_DATA')
  assert.deepEqual(result.completenessReasons, ['MISSING_FX:usd'])
})

test('portfolio-health-v1 validates FX direction, cutoff and exact position set', () => {
  const positions = [{ ...positionAtValue('usd', 100), instrumentCurrency: 'USD' }]
  const valid = { positionId: 'usd', observationId: 'fx', pairSymbol: 'AUD/USD', rate: 0.5, observedAt: '2026-09-02T09:00:00.000Z' }
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, baseCurrency: 'AUD', fxMappings: [{ ...valid, pairSymbol: 'USD/CAD' }] }), /not a direct or inverse/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, baseCurrency: 'AUD', fxMappings: [{ ...valid, observedAt: '2026-09-02T10:00:01.000Z' }] }), /at or before the source cutoff/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, baseCurrency: 'AUD', fxMappings: [{ ...valid, positionId: 'outside' }] }), /outside the evaluated portfolio/)
})

test('portfolio-health-v1 validates redundant and misdirected FX even when price is missing', () => {
  const missingBasePrice = { ...positionAtValue('aud', 100), instrumentCurrency: 'AUD', currentPrice: null, priceObservedAt: null }
  const redundant = { positionId: 'aud', observationId: 'fx', pairSymbol: 'AUD/USD', rate: 0.5, observedAt: '2026-09-02T09:00:00.000Z' }
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [missingBasePrice], baseCurrency: 'AUD', fxMappings: [redundant] }), /must not supply an FX mapping/)

  const missingUsdPrice = { ...missingBasePrice, id: 'usd', instrumentCurrency: 'USD' }
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [missingUsdPrice], baseCurrency: 'AUD', fxMappings: [{ ...redundant, positionId: 'usd', pairSymbol: 'USD/CAD' }] }), /not a direct or inverse/)
})

test('portfolio-health-v1 applies currency thresholds before display rounding', () => {
  const evaluate = (nonBaseValue) => evaluatePortfolioHealthCore({
    sourceCutoff: cutoff,
    baseCurrency: 'AUD',
    positions: [
      { ...positionAtValue('aud', 100 - nonBaseValue), instrumentCurrency: 'AUD' },
      { ...positionAtValue('usd', nonBaseValue), instrumentCurrency: 'USD' },
    ],
    fxMappings: [{ positionId: 'usd', observationId: 'fx', pairSymbol: 'USD/AUD', rate: 1, observedAt: '2026-09-02T09:00:00.000Z' }],
  })
  assert.equal(evaluate(35).currencyExposureState, 'WITHIN_THRESHOLD')
  assert.equal(evaluate(50).currencyExposureState, 'ADVISORY')
  const rounded = evaluate(50.004)
  assert.equal(rounded.nonBaseCurrencyPct, 50)
  assert.equal(rounded.currencyExposureState, 'NEEDS_REVIEW')
})

test('portfolio-health-v1 calculates watchlist overlap from unique instrument identities', () => {
  const positions = [
    { ...positionAtValue('a', 40), instrumentId: 'instrument-1' },
    { ...positionAtValue('b', 30), instrumentId: 'instrument-1' },
    { ...positionAtValue('c', 30), instrumentId: 'instrument-2' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, watchedInstrumentIds: ['instrument-1', 'instrument-1', 'instrument-3'] })
  assert.equal(result.watchlistOverlapState, 'COMPLETE')
  assert.equal(result.heldInstrumentCount, 2)
  assert.equal(result.watchedInstrumentCount, 2)
  assert.deepEqual(result.overlappingInstrumentIds, ['instrument-1'])
  assert.equal(result.watchlistOverlapPct, 50)
})

test('portfolio-health-v1 distinguishes omitted, null, empty and empty-portfolio watchlist evidence', () => {
  const position = { ...positionAtValue('a', 100), instrumentId: 'instrument-1' }
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position] }).watchlistOverlapState, 'NOT_CONFIGURED')
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], watchedInstrumentIds: null }).watchlistOverlapState, 'INCOMPLETE_DATA')
  const empty = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], watchedInstrumentIds: [] })
  assert.equal(empty.watchlistOverlapState, 'COMPLETE')
  assert.equal(empty.watchlistOverlapPct, 0)
  const noPortfolio = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [], watchedInstrumentIds: [] })
  assert.equal(noPortfolio.watchlistOverlapState, 'NOT_APPLICABLE')
  assert.deepEqual(noPortfolio.overlappingInstrumentIds, [])
})

test('portfolio-health-v1 fails closed on missing portfolio instrument identity', () => {
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [positionAtValue('a', 100)], watchedInstrumentIds: [] })
  assert.equal(result.watchlistOverlapState, 'INCOMPLETE_DATA')
  assert.equal(result.watchlistOverlapPct, null)
  assert.deepEqual(result.completenessReasons, ['MISSING_POSITION_INSTRUMENT:a'])
})

test('portfolio-health-v1 canonicalizes watchlist identity order and whitespace', () => {
  const positions = [
    { ...positionAtValue('a', 34), instrumentId: ' instrument-b ' },
    { ...positionAtValue('b', 33), instrumentId: 'instrument-a' },
    { ...positionAtValue('c', 33), instrumentId: 'instrument-c' },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, watchedInstrumentIds: [' instrument-c ', 'instrument-b'] })
  assert.deepEqual(result.overlappingInstrumentIds, ['instrument-b', 'instrument-c'])
  assert.equal(result.watchlistOverlapPct, 66.67)
})

test('portfolio-health-v1 aggregates explicit price and FX session freshness', () => {
  const positions = [
    { ...positionAtValue('aud', 60), instrumentCurrency: 'AUD' },
    { ...positionAtValue('usd', 40), instrumentCurrency: 'USD' },
  ]
  const freshnessMappings = [
    { positionId: 'usd', priceMissedSessions: 0, fxMissedSessions: 2 },
    { positionId: 'aud', priceMissedSessions: 1 },
  ]
  const result = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, baseCurrency: 'AUD', fxMappings: [{ positionId: 'usd', observationId: 'fx', pairSymbol: 'USD/AUD', rate: 1, observedAt: '2026-09-02T09:00:00.000Z' }], freshnessMappings })
  assert.equal(result.freshnessState, 'NEEDS_REVIEW')
  assert.equal(result.worstMissedSessions, 2)
  assert.deepEqual(result.freshnessByPosition, {
    aud: { priceMissedSessions: 1, fxMissedSessions: null },
    usd: { priceMissedSessions: 0, fxMissedSessions: 2 },
  })
})

test('portfolio-health-v1 preserves freshness thresholds and incomplete states', () => {
  const position = { ...positionAtValue('aud', 100), instrumentCurrency: 'AUD' }
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position] }).freshnessState, 'NOT_CONFIGURED')
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], freshnessMappings: null }).freshnessState, 'INCOMPLETE_DATA')
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], freshnessMappings: [{ positionId: 'aud', priceMissedSessions: 0 }] }).freshnessState, 'CURRENT')
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], freshnessMappings: [{ positionId: 'aud', priceMissedSessions: 1 }] }).freshnessState, 'ADVISORY')
  const missing = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], freshnessMappings: [] })
  assert.equal(missing.freshnessState, 'INCOMPLETE_DATA')
  assert.deepEqual(missing.completenessReasons, ['MISSING_FRESHNESS:aud'])
  assert.equal(evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [], freshnessMappings: [] }).freshnessState, 'NOT_APPLICABLE')
})

test('portfolio-health-v1 validates freshness identity and required FX ages', () => {
  const position = { ...positionAtValue('usd', 100), instrumentCurrency: 'USD' }
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], baseCurrency: 'AUD', freshnessMappings: [{ positionId: 'usd', priceMissedSessions: 0 }] }), /require a non-negative integer FX session age/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], freshnessMappings: [{ positionId: 'usd', priceMissedSessions: 0, fxMissedSessions: 0 }] }), /must not supply an FX session age/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], freshnessMappings: [{ positionId: 'outside', priceMissedSessions: 0 }] }), /outside the evaluated portfolio/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [position], freshnessMappings: [{ positionId: 'usd', priceMissedSessions: 0 }, { positionId: 'usd', priceMissedSessions: 1 }] }), /one unique mapping per position/)
})

test('portfolio-health-v1 uses exact integer freshness boundaries independent of input order', () => {
  const positions = [
    { ...positionAtValue('b', 50), instrumentCurrency: 'AUD' },
    { ...positionAtValue('a', 50), instrumentCurrency: 'AUD' },
  ]
  const exactTwo = evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions, baseCurrency: 'AUD', freshnessMappings: [
    { positionId: 'b', priceMissedSessions: 0 },
    { positionId: 'a', priceMissedSessions: 2 },
  ] })
  assert.equal(exactTwo.freshnessState, 'NEEDS_REVIEW')
  assert.equal(exactTwo.worstMissedSessions, 2)
  assert.deepEqual(Object.keys(exactTwo.freshnessByPosition), ['a', 'b'])
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [positions[0]], freshnessMappings: [{ positionId: 'b', priceMissedSessions: -1 }] }), /non-negative integer price session age/)
  assert.throws(() => evaluatePortfolioHealthCore({ sourceCutoff: cutoff, positions: [positions[0]], freshnessMappings: [{ positionId: 'b', priceMissedSessions: 1.5 }] }), /non-negative integer price session age/)
})
