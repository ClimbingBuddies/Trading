export const PORTFOLIO_HEALTH_VERSION = 'portfolio-health-v1'
const roundPct = (value) => Math.round(value * 100) / 100

export function evaluatePortfolioHealthCore({ positions, sourceCutoff, targetAllocations = null, issuerMappings = null, themeMappings = null, baseCurrency = null, fxMappings = null, watchedInstrumentIds = undefined, freshnessMappings = undefined }) {
  const cutoffMs = Date.parse(sourceCutoff)
  if (!Number.isFinite(cutoffMs)) throw new Error('A valid source cutoff is required.')
  const valued = []
  let completeCosts = 0
  let mappedAssetPositions = 0
  const reasons = []
  const allocationValues = new Map()
  const currencyValues = new Map()
  const currencyConfigured = baseCurrency !== null && baseCurrency !== undefined
  const normalizedBaseCurrency = currencyConfigured && typeof baseCurrency === 'string' ? baseCurrency.trim().toUpperCase() : null
  if (currencyConfigured && !/^[A-Z]{3}$/.test(normalizedBaseCurrency ?? '')) throw new Error('Base currency must be a three-letter code.')
  if (currencyConfigured && fxMappings !== null && fxMappings !== undefined && !Array.isArray(fxMappings)) throw new Error('FX mappings must be an array or null.')
  const fxByPosition = new Map()
  if (currencyConfigured) {
    const positionIds = new Set(positions.map((position) => position.id))
    for (const mapping of fxMappings ?? []) {
      if (!mapping?.positionId || !positionIds.has(mapping.positionId)) throw new Error('FX mappings cannot reference positions outside the evaluated portfolio.')
      if (fxByPosition.has(mapping.positionId)) throw new Error('FX mappings require at most one mapping per position.')
      const observedMs = Date.parse(mapping.observedAt)
      if (!mapping.observationId || !Number.isFinite(observedMs) || observedMs > cutoffMs) throw new Error('FX mappings require an observation at or before the source cutoff.')
      if (!Number.isFinite(mapping.rate) || mapping.rate <= 0) throw new Error('FX mapping rates must be positive.')
      fxByPosition.set(mapping.positionId, mapping)
    }
    for (const position of positions) {
      const instrumentCurrency = typeof position.instrumentCurrency === 'string' ? position.instrumentCurrency.trim().toUpperCase() : ''
      if (!/^[A-Z]{3}$/.test(instrumentCurrency)) continue
      const mapping = fxByPosition.get(position.id)
      if (instrumentCurrency === normalizedBaseCurrency && mapping) throw new Error('Base-currency positions must not supply an FX mapping.')
      if (instrumentCurrency !== normalizedBaseCurrency && mapping) {
        const pair = typeof mapping.pairSymbol === 'string' ? mapping.pairSymbol.trim().toUpperCase() : ''
        if (pair !== `${instrumentCurrency}/${normalizedBaseCurrency}` && pair !== `${normalizedBaseCurrency}/${instrumentCurrency}`) throw new Error(`FX mapping for position ${position.id} is not a direct or inverse base-currency pair.`)
      }
    }
  }
  for (const position of positions) {
    if (!Number.isFinite(position.quantity) || position.quantity <= 0) throw new Error('Every position requires a positive quantity.')
    const costComplete = Number.isFinite(position.averageCostPerUnit) && position.averageCostPerUnit >= 0 && /^[A-Z]{3}$/.test(position.costCurrency ?? '')
    if (costComplete) completeCosts += 1
    const assetType = typeof position.assetType === 'string' && position.assetType.trim() ? position.assetType.trim().toLowerCase() : null
    if (assetType) mappedAssetPositions += 1
    else reasons.push(`MISSING_ASSET_TYPE:${position.id}`)
    if (currencyConfigured && !/^[A-Z]{3}$/.test(typeof position.instrumentCurrency === 'string' ? position.instrumentCurrency.trim().toUpperCase() : '')) reasons.push(`MISSING_INSTRUMENT_CURRENCY:${position.id}`)
    if (position.currentPrice === null || position.priceObservedAt === null) { reasons.push(`MISSING_PRICE:${position.id}`); continue }
    const observedMs = Date.parse(position.priceObservedAt)
    if (!Number.isFinite(observedMs) || observedMs > cutoffMs) throw new Error(`Position ${position.id} has an invalid or future price observation.`)
    if (!Number.isFinite(position.currentPrice) || position.currentPrice <= 0) throw new Error(`Position ${position.id} requires a positive current price.`)
    const nativeValue = position.quantity * position.currentPrice
    let value = nativeValue
    let instrumentCurrency = null
    if (currencyConfigured) {
      instrumentCurrency = typeof position.instrumentCurrency === 'string' ? position.instrumentCurrency.trim().toUpperCase() : ''
      if (!/^[A-Z]{3}$/.test(instrumentCurrency)) { reasons.push(`MISSING_INSTRUMENT_CURRENCY:${position.id}`); continue }
      if (instrumentCurrency !== normalizedBaseCurrency) {
        const mapping = fxByPosition.get(position.id)
        if (!mapping) { reasons.push(`MISSING_FX:${position.id}`); continue }
        const pair = typeof mapping.pairSymbol === 'string' ? mapping.pairSymbol.trim().toUpperCase() : ''
        if (pair === `${instrumentCurrency}/${normalizedBaseCurrency}`) value *= mapping.rate
        else if (pair === `${normalizedBaseCurrency}/${instrumentCurrency}`) value /= mapping.rate
        else throw new Error(`FX mapping for position ${position.id} is not a direct or inverse base-currency pair.`)
      } else if (fxByPosition.has(position.id)) throw new Error('Base-currency positions must not supply an FX mapping.')
      currencyValues.set(instrumentCurrency, (currencyValues.get(instrumentCurrency) ?? 0) + value)
    }
    valued.push({ id: position.id, value })
    if (assetType) allocationValues.set(assetType, (allocationValues.get(assetType) ?? 0) + value)
  }
  if (positions.length === 0) reasons.push('NO_POSITIONS')
  const valuationComplete = positions.length > 0 && valued.length === positions.length
  const totalValue = valuationComplete ? valued.reduce((sum, row) => sum + row.value, 0) : null
  const raw = totalValue === null ? [] : valued.map((row) => ({ id: row.id, pct: (row.value / totalValue) * 100 })).sort((a, b) => b.pct - a.pct)
  const largestPositionPct = raw[0] ? roundPct(raw[0].pct) : null
  const rawLargest = raw[0]?.pct ?? null
  const rawTopThree = totalValue === null ? null : raw.slice(0, 3).reduce((sum, row) => sum + row.pct, 0)
  const topThreePct = rawTopThree === null ? null : roundPct(rawTopThree)
  let currencyExposureState = 'NOT_CONFIGURED'
  let currencyExposurePct = null
  let nonBaseCurrencyPct = null
  if (currencyConfigured) {
    if (!valuationComplete) currencyExposureState = 'INCOMPLETE_DATA'
    else {
      const rawCurrencyPct = [...currencyValues.entries()].map(([currency, value]) => [currency, (value / totalValue) * 100]).sort(([a], [b]) => a.localeCompare(b))
      const rawNonBasePct = rawCurrencyPct.filter(([currency]) => currency !== normalizedBaseCurrency).reduce((sum, [, pct]) => sum + pct, 0)
      currencyExposurePct = Object.fromEntries(rawCurrencyPct.map(([currency, pct]) => [currency, roundPct(pct)]))
      nonBaseCurrencyPct = roundPct(rawNonBasePct)
      currencyExposureState = rawNonBasePct > 50 ? 'NEEDS_REVIEW' : rawNonBasePct > 35 ? 'ADVISORY' : 'WITHIN_THRESHOLD'
    }
  }
  const costBasisCompletenessPct = positions.length === 0 ? 0 : roundPct((completeCosts / positions.length) * 100)
  const assetAllocationComplete = valuationComplete && allocationValues.size > 0 && mappedAssetPositions === positions.length
  const rawAssetAllocationPct = assetAllocationComplete && totalValue !== null
    ? Object.fromEntries([...allocationValues.entries()].map(([assetType, value]) => [assetType, (value / totalValue) * 100]))
    : null
  const assetAllocationPct = assetAllocationComplete && totalValue !== null
    ? Object.fromEntries(Object.entries(rawAssetAllocationPct).sort(([a], [b]) => a.localeCompare(b)).map(([assetType, value]) => [assetType, roundPct(value)]))
    : null
  let targetAllocationState = 'NOT_CONFIGURED'
  let targetAllocationDriftPct = null
  let largestTargetDriftPct = null
  if (targetAllocations !== null && targetAllocations !== undefined) {
    if (typeof targetAllocations !== 'object' || Array.isArray(targetAllocations)) throw new Error('Target allocations must be an object or null.')
    const targets = new Map()
    for (const [rawKey, rawValue] of Object.entries(targetAllocations)) {
      const key = rawKey.trim().toLowerCase()
      const value = Number(rawValue)
      if (!key || targets.has(key) || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Target allocations require unique asset types and percentages from 0 to 100.')
      targets.set(key, value)
    }
    const targetTotal = [...targets.values()].reduce((sum, value) => sum + value, 0)
    if (targets.size === 0 || Math.abs(targetTotal - 100) > 0.01) throw new Error('Target allocations must total 100 percent.')
    if (!assetAllocationComplete || assetAllocationPct === null) targetAllocationState = 'INCOMPLETE_DATA'
    else {
      const classes = [...new Set([...targets.keys(), ...Object.keys(assetAllocationPct)])].sort()
      const rawDrift = Object.fromEntries(classes.map((key) => [key, Math.abs((rawAssetAllocationPct[key] ?? 0) - (targets.get(key) ?? 0))]))
      largestTargetDriftPct = Math.max(...Object.values(rawDrift))
      targetAllocationDriftPct = Object.fromEntries(classes.map((key) => [key, roundPct(rawDrift[key])]))
      targetAllocationState = largestTargetDriftPct > 10 ? 'NEEDS_REVIEW' : largestTargetDriftPct > 5 ? 'ADVISORY' : 'WITHIN_THRESHOLD'
    }
  }
  let issuerConcentrationState = 'NOT_CONFIGURED'
  let issuerConcentrationPct = null
  let largestIssuerPct = null
  if (issuerMappings !== null && issuerMappings !== undefined) {
    if (!Array.isArray(issuerMappings)) throw new Error('Issuer mappings must be an array or null.')
    const mappings = new Map()
    for (const mapping of issuerMappings) {
      if (!mapping?.positionId || mappings.has(mapping.positionId)) throw new Error('Issuer mappings require one unique mapping per position.')
      if (mapping.applicability === 'required' && !(typeof mapping.issuerId === 'string' && mapping.issuerId.trim())) throw new Error('Required issuer mappings need an issuer ID.')
      if (mapping.applicability === 'not_applicable' && mapping.issuerId != null) throw new Error('Not-applicable issuer mappings cannot name an issuer.')
      if (!['required', 'not_applicable'].includes(mapping.applicability)) throw new Error('Issuer mapping applicability is invalid.')
      mappings.set(mapping.positionId, mapping)
    }
    const missing = positions.filter((position) => !mappings.has(position.id))
    const positionIds = new Set(positions.map((position) => position.id))
    const unexpected = [...mappings.keys()].filter((positionId) => !positionIds.has(positionId))
    if (unexpected.length > 0) throw new Error('Issuer mappings cannot reference positions outside the evaluated portfolio.')
    for (const position of missing) reasons.push(`MISSING_ISSUER_MAPPING:${position.id}`)
    if (!valuationComplete || missing.length > 0) issuerConcentrationState = 'INCOMPLETE_DATA'
    else {
      const issuerValues = new Map()
      for (const row of valued) {
        const mapping = mappings.get(row.id)
        if (mapping.applicability === 'required') issuerValues.set(mapping.issuerId.trim(), (issuerValues.get(mapping.issuerId.trim()) ?? 0) + row.value)
      }
      if (issuerValues.size === 0) issuerConcentrationState = 'NOT_APPLICABLE'
      else {
        const rawIssuerPct = [...issuerValues.entries()].map(([issuerId, value]) => [issuerId, (value / totalValue) * 100]).sort(([a], [b]) => a.localeCompare(b))
        largestIssuerPct = Math.max(...rawIssuerPct.map(([, pct]) => pct))
        issuerConcentrationPct = Object.fromEntries(rawIssuerPct.map(([issuerId, pct]) => [issuerId, roundPct(pct)]))
        issuerConcentrationState = largestIssuerPct > 30 ? 'NEEDS_REVIEW' : largestIssuerPct > 20 ? 'ADVISORY' : 'WITHIN_THRESHOLD'
      }
    }
  }
  let themeExposureState = 'NOT_CONFIGURED'
  let themeExposurePct = null
  if (themeMappings !== null && themeMappings !== undefined) {
    if (!Array.isArray(themeMappings)) throw new Error('Theme mappings must be an array or null.')
    const validExposureTypes = new Set(['direct', 'enabler', 'beneficiary', 'supplier', 'infrastructure', 'substitute', 'risk'])
    const positionIds = new Set(positions.map((position) => position.id))
    const coveredPositions = new Set()
    const uniqueMappings = new Set()
    const eligibleMappings = []
    for (const mapping of themeMappings) {
      const positionId = typeof mapping?.positionId === 'string' ? mapping.positionId.trim() : ''
      const themeId = typeof mapping?.themeId === 'string' ? mapping.themeId.trim() : ''
      const exposureType = typeof mapping?.exposureType === 'string' ? mapping.exposureType.trim().toLowerCase() : ''
      const themeStatus = typeof mapping?.themeStatus === 'string' ? mapping.themeStatus.trim().toLowerCase() : ''
      if (!positionId || !positionIds.has(positionId)) throw new Error('Theme mappings cannot reference positions outside the evaluated portfolio.')
      if (!themeId || !validExposureTypes.has(exposureType)) throw new Error('Theme mappings require a theme ID and valid exposure type.')
      if (!['active', 'watch', 'paused', 'archived'].includes(themeStatus) || typeof mapping.isActive !== 'boolean') throw new Error('Theme mappings require explicit mapping and theme states.')
      if (mapping.exposureScore !== null && (!Number.isFinite(mapping.exposureScore) || mapping.exposureScore < 0 || mapping.exposureScore > 100)) throw new Error('Theme mapping exposure scores must be null or from 0 to 100.')
      const identity = `${positionId}|${themeId}|${exposureType}`
      if (uniqueMappings.has(identity)) throw new Error('Theme mappings must be unique by position, theme and exposure type.')
      uniqueMappings.add(identity)
      coveredPositions.add(positionId)
      if (mapping.isActive && ['active', 'watch'].includes(themeStatus)) eligibleMappings.push({ positionId, themeId })
    }
    const missing = positions.filter((position) => !coveredPositions.has(position.id))
    for (const position of missing) reasons.push(`MISSING_THEME_MAPPING_EVIDENCE:${position.id}`)
    if (positions.length === 0) themeExposureState = 'NOT_APPLICABLE'
    else if (!valuationComplete || missing.length > 0) themeExposureState = 'INCOMPLETE_DATA'
    else {
      const positionValues = new Map(valued.map((row) => [row.id, row.value]))
      const themeValues = new Map()
      const countedPositionThemes = new Set()
      for (const mapping of eligibleMappings) {
        const identity = `${mapping.positionId}|${mapping.themeId}`
        if (countedPositionThemes.has(identity)) continue
        countedPositionThemes.add(identity)
        themeValues.set(mapping.themeId, (themeValues.get(mapping.themeId) ?? 0) + positionValues.get(mapping.positionId))
      }
      themeExposurePct = Object.fromEntries([...themeValues.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([themeId, value]) => [themeId, roundPct((value / totalValue) * 100)]))
      themeExposureState = 'COMPLETE'
    }
  }
  let watchlistOverlapState = 'NOT_CONFIGURED'
  let heldInstrumentCount = null
  let watchedInstrumentCount = null
  let overlappingInstrumentIds = null
  let watchlistOverlapPct = null
  if (watchedInstrumentIds !== undefined) {
    if (watchedInstrumentIds !== null && !Array.isArray(watchedInstrumentIds)) throw new Error('Watched instrument IDs must be an array, null or omitted.')
    if (watchedInstrumentIds === null) watchlistOverlapState = 'INCOMPLETE_DATA'
    else {
      const watched = new Set()
      for (const id of watchedInstrumentIds) {
        if (typeof id !== 'string' || !id.trim()) throw new Error('Watched instrument IDs must be non-empty strings.')
        watched.add(id.trim())
      }
      const held = new Set()
      for (const position of positions) {
        if (typeof position.instrumentId !== 'string' || !position.instrumentId.trim()) reasons.push(`MISSING_POSITION_INSTRUMENT:${position.id}`)
        else held.add(position.instrumentId.trim())
      }
      heldInstrumentCount = held.size
      watchedInstrumentCount = watched.size
      if (positions.length === 0) {
        overlappingInstrumentIds = []
        watchlistOverlapState = 'NOT_APPLICABLE'
      } else if (held.size === 0 || positions.some((position) => typeof position.instrumentId !== 'string' || !position.instrumentId.trim())) watchlistOverlapState = 'INCOMPLETE_DATA'
      else {
        overlappingInstrumentIds = [...held].filter((id) => watched.has(id)).sort()
        watchlistOverlapPct = roundPct((overlappingInstrumentIds.length / held.size) * 100)
        watchlistOverlapState = 'COMPLETE'
      }
    }
  }
  let freshnessState = 'NOT_CONFIGURED'
  let worstMissedSessions = null
  let freshnessByPosition = null
  if (freshnessMappings !== undefined) {
    if (freshnessMappings !== null && !Array.isArray(freshnessMappings)) throw new Error('Freshness mappings must be an array, null or omitted.')
    if (freshnessMappings === null) freshnessState = 'INCOMPLETE_DATA'
    else {
      const positionIds = new Set(positions.map((position) => position.id))
      const mappings = new Map()
      for (const mapping of freshnessMappings) {
        if (!mapping?.positionId || !positionIds.has(mapping.positionId)) throw new Error('Freshness mappings cannot reference positions outside the evaluated portfolio.')
        if (mappings.has(mapping.positionId)) throw new Error('Freshness mappings require one unique mapping per position.')
        if (!Number.isInteger(mapping.priceMissedSessions) || mapping.priceMissedSessions < 0) throw new Error('Freshness mappings require a non-negative integer price session age.')
        const position = positions.find((candidate) => candidate.id === mapping.positionId)
        const instrumentCurrency = typeof position.instrumentCurrency === 'string' ? position.instrumentCurrency.trim().toUpperCase() : ''
        const requiresFx = currencyConfigured && /^[A-Z]{3}$/.test(instrumentCurrency) && instrumentCurrency !== normalizedBaseCurrency
        if (requiresFx && (!Number.isInteger(mapping.fxMissedSessions) || mapping.fxMissedSessions < 0)) throw new Error('Non-base positions require a non-negative integer FX session age.')
        if (!requiresFx && mapping.fxMissedSessions !== null && mapping.fxMissedSessions !== undefined) throw new Error('Positions without required FX must not supply an FX session age.')
        mappings.set(mapping.positionId, { priceMissedSessions: mapping.priceMissedSessions, fxMissedSessions: requiresFx ? mapping.fxMissedSessions : null })
      }
      const missing = positions.filter((position) => !mappings.has(position.id))
      for (const position of missing) reasons.push(`MISSING_FRESHNESS:${position.id}`)
      if (positions.length === 0) {
        freshnessByPosition = {}
        freshnessState = 'NOT_APPLICABLE'
      } else if (missing.length > 0) freshnessState = 'INCOMPLETE_DATA'
      else {
        freshnessByPosition = Object.fromEntries([...mappings.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([positionId, ages]) => [positionId, ages]))
        worstMissedSessions = Math.max(...[...mappings.values()].flatMap((ages) => [ages.priceMissedSessions, ...(ages.fxMissedSessions === null ? [] : [ages.fxMissedSessions])]))
        freshnessState = worstMissedSessions >= 2 ? 'NEEDS_REVIEW' : worstMissedSessions >= 1 ? 'ADVISORY' : 'CURRENT'
      }
    }
  }
  if (completeCosts !== positions.length) reasons.push('INCOMPLETE_COST_BASIS')
  const review = rawLargest !== null && (rawLargest > 25 || (rawTopThree ?? 0) > 60)
  const advisory = rawLargest !== null && (rawLargest > 15 || (rawTopThree ?? 0) > 45)
  return { methodologyVersion: PORTFOLIO_HEALTH_VERSION, sourceCutoff, totalValue, positionCount: positions.length, valuedPositionCount: valued.length, mappedAssetPositionCount: mappedAssetPositions, valuationComplete, costBasisCompletenessPct, largestPositionPct, topThreePct, currencyExposureState, currencyExposurePct, nonBaseCurrencyPct, assetAllocationComplete, assetAllocationPct, targetAllocationState, targetAllocationDriftPct, largestTargetDriftPct: largestTargetDriftPct === null ? null : roundPct(largestTargetDriftPct), issuerConcentrationState, issuerConcentrationPct, largestIssuerPct: largestIssuerPct === null ? null : roundPct(largestIssuerPct), themeExposureState, themeExposurePct, watchlistOverlapState, heldInstrumentCount, watchedInstrumentCount, overlappingInstrumentIds, watchlistOverlapPct, freshnessState, worstMissedSessions, freshnessByPosition, concentrationState: valuationComplete ? (review ? 'NEEDS_REVIEW' : advisory ? 'ADVISORY' : 'WITHIN_THRESHOLD') : 'INCOMPLETE_DATA', completenessReasons: [...new Set(reasons)].sort() }
}
