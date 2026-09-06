import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'
import { buildPortfolioHealthCandidate, extractBearerToken, immutableSnapshotMatches, resolveFxMappings } from '../_shared/portfolio-health-request.mjs'

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
const publicSnapshot = (row: Record<string, unknown>) => ({
  id: row.id, portfolio_id: row.portfolio_id, source_cutoff: row.source_cutoff,
  evaluated_at: row.evaluated_at, total_value: row.total_value, base_currency: row.base_currency,
  measures: row.measures, summary_status: row.summary_status, completeness_pct: row.completeness_pct,
  completeness_reasons: row.completeness_reasons, methodology_version: row.methodology_version,
  source_hash: row.source_hash,
})
const snapshotColumns = 'id,owner_user_id,portfolio_id,source_cutoff,evaluated_at,total_value,base_currency,measures,summary_status,completeness_pct,completeness_reasons,methodology_version,source_hash'
const pageSize = 1000
const idBatchSize = 100

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !publishableKey || !serviceKey) return json({ error: 'Server configuration is missing.' }, 500)

  const token = extractBearerToken(request.headers.get('authorization'))
  if (!token) return json({ error: 'Authentication required.' }, 401)
  const auth = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: userData, error: userError } = await auth.auth.getUser(token)
  const user = userData.user
  if (userError || !user || user.is_anonymous) return json({ error: 'Permanent authenticated user required.' }, 401)

  let body: { portfolio_id?: string; source_cutoff?: string } = {}
  try { body = await request.json() } catch { return json({ error: 'Valid JSON is required.' }, 400) }
  if (!body.portfolio_id) return json({ error: 'portfolio_id is required.' }, 400)
  const cutoffMs = Date.parse(body.source_cutoff ?? new Date().toISOString())
  if (!Number.isFinite(cutoffMs)) return json({ error: 'source_cutoff must be an ISO timestamp.' }, 400)
  const sourceCutoff = new Date(cutoffMs).toISOString()

  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const providerResult = await db.from('data_providers').select('id,provider_code,is_active').eq('provider_code', 'tiingo').eq('is_active', true)
  if (providerResult.error) return json({ error: 'Canonical provider lookup failed.' }, 500)
  if ((providerResult.data ?? []).length !== 1) return json({ error: 'Canonical provider identity is unavailable or ambiguous.' }, 500)
  const providerId = providerResult.data[0].id
  const portfolioResult = await db.from('portfolios').select('id,owner_user_id,base_currency,target_allocations').eq('id', body.portfolio_id).eq('owner_user_id', user.id).maybeSingle()
  if (portfolioResult.error) return json({ error: 'Portfolio lookup failed.' }, 500)
  if (!portfolioResult.data) return json({ error: 'Portfolio not found.' }, 404)
  const positions = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await db.from('portfolio_positions').select('id,owner_user_id,portfolio_id,instrument_id,quantity,average_cost_per_unit,cost_currency').eq('portfolio_id', body.portfolio_id).eq('owner_user_id', user.id).order('id').range(offset, offset + pageSize - 1)
    if (page.error) return json({ error: 'Position lookup failed.' }, 500)
    const rows = page.data ?? []
    positions.push(...rows)
    if (rows.length < pageSize) break
  }
  const instrumentIds = [...new Set(positions.map((row) => row.instrument_id))]
  const instruments = []
  for (let batchOffset = 0; batchOffset < instrumentIds.length; batchOffset += idBatchSize) {
    const heldInstrumentIds = instrumentIds.slice(batchOffset, batchOffset + idBatchSize)
    const page = await db.from('instruments').select('id,asset_type,currency_code').in('id', heldInstrumentIds).order('id')
    if (page.error) return json({ error: 'Instrument classification lookup failed.' }, 500)
    instruments.push(...(page.data ?? []))
  }
  if (instruments.length !== instrumentIds.length || new Set(instruments.map((row) => row.id)).size !== instrumentIds.length) return json({ error: 'Canonical held-instrument evidence is incomplete or ambiguous.' }, 500)
  const observations = []
  for (let batchOffset = 0; batchOffset < instrumentIds.length; batchOffset += idBatchSize) {
    const heldInstrumentIds = instrumentIds.slice(batchOffset, batchOffset + idBatchSize)
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from('market_observations').select('id,instrument_id,provider_id,interval_code,observed_at,adjusted_close,close,currency_code').in('instrument_id', heldInstrumentIds).eq('provider_id', providerId).eq('interval_code', '1day').lte('observed_at', sourceCutoff).order('observed_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize - 1)
      if (page.error) return json({ error: 'Canonical observation lookup failed.' }, 500)
      const rows = page.data ?? []
      observations.push(...rows)
      if (rows.length < pageSize) break
    }
  }

  const fxInstruments = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await db.from('instruments').select('id,symbol,asset_type,is_active,currency_code').eq('asset_type', 'forex').eq('is_active', true).order('symbol').order('id').range(offset, offset + pageSize - 1)
    if (page.error) return json({ error: 'Canonical FX instrument lookup failed.' }, 500)
    const rows = page.data ?? []
    fxInstruments.push(...rows)
    if (rows.length < pageSize) break
  }
  const baseCurrency = String(portfolioResult.data.base_currency ?? '').trim().toUpperCase()
  const heldCurrencies = new Set(instruments.map((row) => String(row.currency_code ?? '').trim().toUpperCase()).filter((currency) => /^[A-Z]{3}$/.test(currency) && currency !== baseCurrency))
  const relevantFxInstruments = fxInstruments.filter((row) => {
    const match = /^([A-Z]{3})\/([A-Z]{3})$/.exec(String(row.symbol ?? '').trim().toUpperCase())
    return match && ((match[1] === baseCurrency && heldCurrencies.has(match[2])) || (match[2] === baseCurrency && heldCurrencies.has(match[1])))
  })
  const fxObservations = []
  const fxInstrumentIds = relevantFxInstruments.map((row) => row.id)
  for (let batchOffset = 0; batchOffset < fxInstrumentIds.length; batchOffset += idBatchSize) {
    const pairIds = fxInstrumentIds.slice(batchOffset, batchOffset + idBatchSize)
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from('market_observations').select('id,instrument_id,provider_id,interval_code,observed_at,adjusted_close,close,currency_code').in('instrument_id', pairIds).eq('provider_id', providerId).eq('interval_code', '1day').lte('observed_at', sourceCutoff).order('observed_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize - 1)
      if (page.error) return json({ error: 'Canonical FX observation lookup failed.' }, 500)
      const rows = page.data ?? []
      fxObservations.push(...rows)
      if (rows.length < pageSize) break
    }
  }
  let fxMappings
  try { fxMappings = resolveFxMappings({ positions, instruments, observations, fxInstruments: relevantFxInstruments, fxObservations, baseCurrency, sourceCutoff }) }
  catch { return json({ error: 'Canonical FX identity is unavailable or ambiguous.' }, 500) }

  const watchlists = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await db.from('watchlists').select('id,owner_user_id').eq('owner_user_id', user.id).order('id').range(offset, offset + pageSize - 1)
    if (page.error) return json({ error: 'Watchlist lookup failed.' }, 500)
    const rows = page.data ?? []
    watchlists.push(...rows)
    if (rows.length < pageSize) break
  }
  const watchlistIds = watchlists.map((row) => row.id)
  const watchlistRows = []
  for (let batchOffset = 0; batchOffset < watchlistIds.length; batchOffset += idBatchSize) {
    const ownerListIds = watchlistIds.slice(batchOffset, batchOffset + idBatchSize)
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from('watchlist_items').select('watchlist_id,instrument_id').in('watchlist_id', ownerListIds).order('watchlist_id').order('instrument_id').range(offset, offset + pageSize - 1)
      if (page.error) return json({ error: 'Watchlist item lookup failed.' }, 500)
      const rows = page.data ?? []
      watchlistRows.push(...rows)
      if (rows.length < pageSize) break
    }
  }
  const watchlistItems = watchlistRows.map((row) => ({ watchlistId: row.watchlist_id, instrumentId: row.instrument_id }))
  const watchedInstrumentIds = [...new Set(watchlistRows.map((row) => row.instrument_id))]

  const cutoffDate = sourceCutoff.slice(0, 10)
  const issuerRows = []
  for (let batchOffset = 0; batchOffset < instrumentIds.length; batchOffset += idBatchSize) {
    const heldInstrumentIds = instrumentIds.slice(batchOffset, batchOffset + idBatchSize)
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from('instrument_issuer_mappings').select('id,instrument_id,issuer_id,applicability,source_name,source_url,evidence_as_of,methodology_version,valid_from,valid_to').in('instrument_id', heldInstrumentIds).lte('evidence_as_of', cutoffDate).lte('valid_from', cutoffDate).or(`valid_to.is.null,valid_to.gt.${cutoffDate}`).order('instrument_id').order('valid_from').order('methodology_version').order('id').range(offset, offset + pageSize - 1)
      if (page.error) return json({ error: 'Canonical issuer mapping lookup failed.' }, 500)
      const rows = page.data ?? []
      issuerRows.push(...rows)
      if (rows.length < pageSize) break
    }
  }
  const issuerByInstrumentId = new Map()
  for (const row of issuerRows) {
    if (issuerByInstrumentId.has(row.instrument_id)) return json({ error: 'Canonical issuer mapping evidence is ambiguous.' }, 500)
    issuerByInstrumentId.set(row.instrument_id, row)
  }
  const issuerMappings = positions.flatMap((position) => {
    const row = issuerByInstrumentId.get(position.instrument_id)
    return row ? [{ positionId: position.id, applicability: row.applicability, issuerId: row.issuer_id, sourceName: row.source_name, sourceUrl: row.source_url, evidenceAsOf: row.evidence_as_of, methodologyVersion: row.methodology_version, validFrom: row.valid_from, validTo: row.valid_to }] : []
  })

  const themeInstrumentRows = []
  for (let batchOffset = 0; batchOffset < instrumentIds.length; batchOffset += idBatchSize) {
    const heldInstrumentIds = instrumentIds.slice(batchOffset, batchOffset + idBatchSize)
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from('opportunity_theme_instruments').select('theme_id,instrument_id,exposure_type,exposure_score,is_active').in('instrument_id', heldInstrumentIds).order('instrument_id').order('theme_id').order('exposure_type').range(offset, offset + pageSize - 1)
      if (page.error) return json({ error: 'Opportunity-theme mapping lookup failed.' }, 500)
      const rows = page.data ?? []
      themeInstrumentRows.push(...rows)
      if (rows.length < pageSize) break
    }
  }
  const themeIds = [...new Set(themeInstrumentRows.map((row) => row.theme_id))]
  const themeRows = []
  for (let batchOffset = 0; batchOffset < themeIds.length; batchOffset += idBatchSize) {
    const heldThemeIds = themeIds.slice(batchOffset, batchOffset + idBatchSize)
    const page = await db.from('opportunity_themes').select('id,status').in('id', heldThemeIds).order('id')
    if (page.error) return json({ error: 'Opportunity-theme lifecycle lookup failed.' }, 500)
    themeRows.push(...(page.data ?? []))
  }
  if (themeRows.length !== themeIds.length) return json({ error: 'Opportunity-theme lifecycle evidence is incomplete.' }, 500)
  const themeStatusById = new Map(themeRows.map((row) => [row.id, row.status]))
  const themeMappings = positions.flatMap((position) => themeInstrumentRows.filter((row) => row.instrument_id === position.instrument_id).map((row) => ({ positionId: position.id, themeId: row.theme_id, exposureType: row.exposure_type, exposureScore: row.exposure_score === null ? null : Number(row.exposure_score), isActive: row.is_active, themeStatus: themeStatusById.get(row.theme_id) })))

  const candidate = await buildPortfolioHealthCandidate({ ownerId: user.id, portfolio: portfolioResult.data, positions, observations, instruments, sourceCutoff, fxMappings, issuerMappings, themeMappings, watchlistItems, watchedInstrumentIds })
  const insertResult = await db.from('portfolio_health_snapshots').insert(candidate).select(snapshotColumns).single()
  if (!insertResult.error) return json({ snapshot: publicSnapshot(insertResult.data) }, 201)
  if (insertResult.error.code !== '23505') return json({ error: 'Snapshot persistence failed.' }, 500)
  const existingResult = await db.from('portfolio_health_snapshots').select(snapshotColumns).eq('portfolio_id', body.portfolio_id).eq('owner_user_id', user.id).eq('source_cutoff', sourceCutoff).eq('methodology_version', candidate.methodology_version).maybeSingle()
  if (existingResult.error || !existingResult.data || !immutableSnapshotMatches(existingResult.data, candidate)) return json({ error: 'Immutable snapshot conflict.' }, 409)
  return json({ snapshot: publicSnapshot(existingResult.data) }, 200)
})
