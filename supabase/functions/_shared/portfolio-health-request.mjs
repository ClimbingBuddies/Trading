import { evaluatePortfolioHealthCore, PORTFOLIO_HEALTH_VERSION } from './portfolio-health-core.mjs'

const compareCanonicalIds = (left, right) => {
  const a = String(left)
  const b = String(right)
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0
  return a.localeCompare(b)
}

export function extractBearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '')
  return match?.[1]?.trim() || null
}

export function latestObservationsByInstrument(observations, sourceCutoff) {
  const cutoffMs = Date.parse(sourceCutoff)
  if (!Number.isFinite(cutoffMs)) throw new Error('A valid source cutoff is required.')
  const latest = new Map()
  for (const observation of observations) {
    const observedMs = Date.parse(observation.observed_at)
    if (!Number.isFinite(observedMs) || observedMs > cutoffMs) continue
    const current = latest.get(observation.instrument_id)
    const currentObservedMs = current ? Date.parse(current.observed_at) : Number.NEGATIVE_INFINITY
    if (!current || observedMs > currentObservedMs || (observedMs === currentObservedMs && compareCanonicalIds(observation.id, current.id) > 0)) latest.set(observation.instrument_id, observation)
  }
  return latest
}

export function resolveFxMappings({ positions, instruments, observations, fxInstruments, fxObservations, baseCurrency, sourceCutoff }) {
  const base = typeof baseCurrency === 'string' ? baseCurrency.trim().toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(base)) throw new Error('A valid portfolio base currency is required for FX mapping.')
  const heldById = new Map(instruments.map((row) => [row.id, row]))
  const latestPrices = latestObservationsByInstrument(observations, sourceCutoff)
  const pairsByCurrency = new Map()
  for (const row of fxInstruments) {
    const symbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : ''
    const match = /^([A-Z]{3})\/([A-Z]{3})$/.exec(symbol)
    if (!match || !row.is_active || String(row.asset_type).trim().toLowerCase() !== 'forex') continue
    const currency = match[1] === base ? match[2] : match[2] === base ? match[1] : null
    if (!currency || currency === base) continue
    const rows = pairsByCurrency.get(currency) ?? []
    rows.push({ ...row, canonicalSymbol: symbol })
    pairsByCurrency.set(currency, rows)
  }
  for (const [currency, rows] of pairsByCurrency) if (rows.length > 1) throw new Error(`Canonical FX pair identity is ambiguous for ${currency}/${base}.`)
  const mappings = []
  for (const position of positions) {
    const currency = typeof heldById.get(position.instrument_id)?.currency_code === 'string' ? heldById.get(position.instrument_id).currency_code.trim().toUpperCase() : ''
    if (!/^[A-Z]{3}$/.test(currency) || currency === base) continue
    const pair = pairsByCurrency.get(currency)?.[0]
    const priceObservation = latestPrices.get(position.instrument_id)
    if (!pair || !priceObservation) continue
    const priceMs = Date.parse(priceObservation.observed_at)
    const aligned = latestObservationsByInstrument(fxObservations.filter((row) => row.instrument_id === pair.id && Date.parse(row.observed_at) === priceMs), priceObservation.observed_at).get(pair.id)
    const rateField = aligned?.adjusted_close !== null && aligned?.adjusted_close !== undefined ? 'adjusted_close' : 'close'
    const rate = aligned?.adjusted_close ?? aligned?.close ?? null
    if (!aligned || rate === null || !Number.isFinite(Number(rate)) || Number(rate) <= 0) continue
    mappings.push({ positionId: position.id, observationId: String(aligned.id), instrumentId: pair.id, pairSymbol: pair.canonicalSymbol, providerId: aligned.provider_id, intervalCode: aligned.interval_code, rateField, adjustedClose: aligned.adjusted_close === null || aligned.adjusted_close === undefined ? null : String(aligned.adjusted_close), close: aligned.close === null || aligned.close === undefined ? null : String(aligned.close), currencyCode: aligned.currency_code?.trim().toUpperCase() ?? null, rate: Number(rate), observedAt: aligned.observed_at })
  }
  return mappings
}

const canonicalOptionalRows = (rows, mapRow, identity) => {
  if (rows === undefined || rows === null) return rows
  if (!Array.isArray(rows)) throw new Error('Canonical evidence must be an array, null or omitted.')
  const mapped = rows.map(mapRow)
  const identities = new Set()
  for (const row of mapped) {
    const key = identity(row)
    if (!key || identities.has(key)) throw new Error('Canonical evidence identities must be present and unique.')
    identities.add(key)
  }
  return mapped.sort((a, b) => identity(a).localeCompare(identity(b)))
}

export function canonicalSourcePayload({ ownerId, portfolio, positions, observations, instruments, sourceCutoff, fxMappings = undefined, issuerMappings = undefined, themeMappings = undefined, watchlistItems = undefined, watchedInstrumentIds = undefined, freshnessMappings = undefined }) {
  const byId = (a, b) => compareCanonicalIds(a.id, b.id)
  const cutoffDate = typeof sourceCutoff === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(sourceCutoff) ? sourceCutoff.slice(0, 10) : null
  const isIsoDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  const isPublicHttpsUrl = (value) => {
    if (value === null) return true
    if (typeof value !== 'string' || value !== value.trim() || !value) return false
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && Boolean(parsed.hostname)
    } catch {
      return false
    }
  }
  const canonicalTargets = portfolio.target_allocations === null || portfolio.target_allocations === undefined
    ? null
    : Object.fromEntries(Object.entries(portfolio.target_allocations).map(([key, value]) => [key.trim().toLowerCase(), Number(value)]).sort(([a], [b]) => a.localeCompare(b)))
  const optionalEvidence = {}
  if (fxMappings !== undefined) optionalEvidence.fxMappings = canonicalOptionalRows(fxMappings, (row) => ({ positionId: row.positionId, observationId: row.observationId, instrumentId: row.instrumentId, pairSymbol: row.pairSymbol?.trim().toUpperCase(), providerId: row.providerId, intervalCode: row.intervalCode, rateField: row.rateField, adjustedClose: row.adjustedClose === null || row.adjustedClose === undefined ? null : String(row.adjustedClose), close: row.close === null || row.close === undefined ? null : String(row.close), currencyCode: row.currencyCode?.trim().toUpperCase() ?? null, rate: Number(row.rate), observedAt: row.observedAt }), (row) => row.positionId && row.observationId && row.instrumentId && row.pairSymbol && row.providerId && row.intervalCode && ['adjusted_close', 'close'].includes(row.rateField) && Number.isFinite(row.rate) && row.observedAt ? row.positionId : '')
  if (issuerMappings !== undefined) optionalEvidence.issuerMappings = canonicalOptionalRows(issuerMappings, (row) => ({ positionId: row.positionId, applicability: row.applicability, issuerId: row.issuerId ?? null, sourceName: row.sourceName, sourceUrl: row.sourceUrl ?? null, evidenceAsOf: row.evidenceAsOf, methodologyVersion: row.methodologyVersion, validFrom: row.validFrom, validTo: row.validTo ?? null }), (row) => {
    const requiredIssuer = row.applicability === 'required' && typeof row.issuerId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.issuerId)
    const excludedIssuer = row.applicability === 'not_applicable' && row.issuerId === null
    const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/
    const validProvenance = typeof row.sourceName === 'string' && row.sourceName === row.sourceName.trim() && row.sourceName.length > 0 && !controlCharacters.test(row.sourceName) && isPublicHttpsUrl(row.sourceUrl) && typeof row.methodologyVersion === 'string' && row.methodologyVersion === row.methodologyVersion.trim() && row.methodologyVersion.length > 0 && !controlCharacters.test(row.methodologyVersion)
    const validDates = isIsoDate(row.evidenceAsOf) && isIsoDate(row.validFrom) && (row.validTo === null || isIsoDate(row.validTo) && row.validTo > row.validFrom) && cutoffDate && row.evidenceAsOf <= cutoffDate && row.validFrom <= cutoffDate && (row.validTo === null || row.validTo > cutoffDate)
    return row.positionId && (requiredIssuer || excludedIssuer) && validProvenance && validDates ? row.positionId : ''
  })
  if (themeMappings !== undefined) optionalEvidence.themeMappings = canonicalOptionalRows(themeMappings, (row) => ({ positionId: row.positionId, themeId: row.themeId, exposureType: row.exposureType?.trim().toLowerCase(), exposureScore: row.exposureScore === null || row.exposureScore === undefined ? null : Number(row.exposureScore), isActive: row.isActive, themeStatus: row.themeStatus?.trim().toLowerCase() }), (row) => row.positionId && row.themeId && row.exposureType && (row.exposureScore === null || Number.isFinite(row.exposureScore)) && typeof row.isActive === 'boolean' && row.themeStatus ? `${row.positionId}|${row.themeId}|${row.exposureType}` : '')
  if (watchlistItems !== undefined) optionalEvidence.watchlistItems = canonicalOptionalRows(watchlistItems, (row) => ({ watchlistId: row.watchlistId, instrumentId: row.instrumentId }), (row) => row.watchlistId && row.instrumentId ? `${row.watchlistId}|${row.instrumentId}` : '')
  if (watchedInstrumentIds !== undefined) {
    if (watchedInstrumentIds !== null && !Array.isArray(watchedInstrumentIds)) throw new Error('Watched instrument evidence must be an array, null or omitted.')
    optionalEvidence.watchedInstrumentIds = watchedInstrumentIds === null ? null : [...new Set(watchedInstrumentIds.map((id) => {
      if (typeof id !== 'string' || !id.trim()) throw new Error('Watched instrument evidence requires non-empty string identities.')
      return id.trim()
    }))].sort()
  }
  if (freshnessMappings !== undefined) optionalEvidence.freshnessMappings = canonicalOptionalRows(freshnessMappings, (row) => ({ positionId: row.positionId, priceObservationId: row.priceObservationId, priceObservedAt: row.priceObservedAt, priceProviderId: row.priceProviderId, priceIntervalCode: row.priceIntervalCode, fxObservationId: row.fxObservationId ?? null, fxObservedAt: row.fxObservedAt ?? null, fxProviderId: row.fxProviderId ?? null, calendarId: row.calendarId, methodologyVersion: row.methodologyVersion, priceMissedSessions: Number(row.priceMissedSessions), fxMissedSessions: row.fxMissedSessions === null || row.fxMissedSessions === undefined ? null : Number(row.fxMissedSessions) }), (row) => row.positionId && row.priceObservationId && row.priceObservedAt && row.priceProviderId && row.priceIntervalCode && row.calendarId && row.methodologyVersion && Number.isInteger(row.priceMissedSessions) && row.priceMissedSessions >= 0 && (row.fxMissedSessions === null || (Number.isInteger(row.fxMissedSessions) && row.fxMissedSessions >= 0)) ? row.positionId : '')
  return JSON.stringify({
    methodologyVersion: PORTFOLIO_HEALTH_VERSION,
    ownerId,
    portfolio: { id: portfolio.id, baseCurrency: portfolio.base_currency, targetAllocations: canonicalTargets },
    sourceCutoff,
    positions: positions.map((row) => ({ id: row.id, instrumentId: row.instrument_id, quantity: String(row.quantity), averageCostPerUnit: row.average_cost_per_unit === null ? null : String(row.average_cost_per_unit), costCurrency: row.cost_currency, instrumentCurrency: row.instrument_currency?.trim().toUpperCase() ?? null })).sort(byId),
    instruments: instruments.map((row) => ({ id: row.id, assetType: row.asset_type, currencyCode: row.currency_code?.trim().toUpperCase() ?? null })).sort(byId),
    observations: observations.map((row) => ({ id: String(row.id), instrumentId: row.instrument_id, providerId: row.provider_id, intervalCode: row.interval_code, observedAt: row.observed_at, adjustedClose: row.adjusted_close === null ? null : String(row.adjusted_close), close: row.close === null ? null : String(row.close), currencyCode: row.currency_code?.trim().toUpperCase() ?? null })).sort(byId),
    ...optionalEvidence,
  })
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildPortfolioHealthCandidate({ ownerId, portfolio, positions, observations, instruments, sourceCutoff, fxMappings = undefined, issuerMappings = undefined, themeMappings = undefined, watchlistItems = undefined, watchedInstrumentIds = undefined }) {
  const latest = latestObservationsByInstrument(observations, sourceCutoff)
  const instrumentsById = new Map(instruments.map((row) => [row.id, row]))
  const inputs = positions.map((position) => {
    const observation = latest.get(position.instrument_id) ?? null
    const price = observation?.adjusted_close ?? observation?.close ?? null
    return { id: position.id, instrumentId: position.instrument_id, quantity: Number(position.quantity), averageCostPerUnit: position.average_cost_per_unit === null ? null : Number(position.average_cost_per_unit), costCurrency: position.cost_currency, currentPrice: price === null ? null : Number(price), priceObservedAt: observation?.observed_at ?? null, assetType: instrumentsById.get(position.instrument_id)?.asset_type ?? null, instrumentCurrency: instrumentsById.get(position.instrument_id)?.currency_code ?? null }
  })
  const result = evaluatePortfolioHealthCore({ positions: inputs, sourceCutoff, targetAllocations: portfolio.target_allocations ?? null, baseCurrency: portfolio.base_currency, fxMappings, issuerMappings, themeMappings, watchedInstrumentIds })
  const valuationCoveragePct = result.positionCount === 0 ? 0 : (result.valuedPositionCount / result.positionCount) * 100
  const assetMappingCoveragePct = result.positionCount === 0 ? 0 : (result.mappedAssetPositionCount / result.positionCount) * 100
  const completenessPct = Math.round(Math.min(valuationCoveragePct, result.costBasisCompletenessPct, assetMappingCoveragePct) * 100) / 100
  return {
    owner_user_id: ownerId, portfolio_id: portfolio.id, source_cutoff: sourceCutoff,
    total_value: result.totalValue, base_currency: portfolio.base_currency, measures: result,
    summary_status: result.concentrationState === 'INCOMPLETE_DATA' || !result.assetAllocationComplete ? 'INCOMPLETE_DATA' : result.concentrationState === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'HEALTHY',
    completeness_pct: completenessPct,
    completeness_reasons: result.completenessReasons,
    methodology_version: result.methodologyVersion,
    source_hash: await sha256Hex(canonicalSourcePayload({ ownerId, portfolio, positions, observations: [...latest.values()], instruments, sourceCutoff, fxMappings, issuerMappings, themeMappings, watchlistItems, watchedInstrumentIds })),
  }
}

export function immutableSnapshotMatches(existing, candidate) {
  const stableJson = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    return JSON.stringify(value)
  }
  const totalMatches = existing.total_value === null && candidate.total_value === null || Number(existing.total_value) === Number(candidate.total_value)
  return existing.owner_user_id === candidate.owner_user_id
    && existing.portfolio_id === candidate.portfolio_id
    && existing.source_cutoff === candidate.source_cutoff
    && existing.base_currency === candidate.base_currency
    && existing.methodology_version === candidate.methodology_version
    && existing.source_hash === candidate.source_hash
    && existing.summary_status === candidate.summary_status
    && totalMatches
    && Number(existing.completeness_pct) === Number(candidate.completeness_pct)
    && stableJson(existing.completeness_reasons) === stableJson(candidate.completeness_reasons)
    && stableJson(existing.measures) === stableJson(candidate.measures)
}
