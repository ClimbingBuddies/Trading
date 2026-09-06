const METHOD = 'personal-research-relevance-v1'
const FAMILIES = new Set(['MARKET_AI', 'TECHNICAL', 'OPPORTUNITY', 'EXTERNAL_FACT'])
const CATEGORIES = new Set(['INVESTIGATE', 'MONITOR', 'REVIEW_RISK', 'THEME_EXPOSURE'])
const SESSION_LIMITS = { 5: 2, 20: 5, 60: 10 }
const DAY_LIMITS = { 5: 30, 20: 60, 60: 90 }

function required(value, name) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) throw new Error(`${name} is required and canonical`)
  return value
}

function instant(value, name) {
  required(value, name)
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw new Error(`${name} must be an ISO instant`)
  return ms
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function dependencyKey(source) {
  if (source.family === 'EXTERNAL_FACT') {
    const url = new URL(required(source.canonicalSourceUrl, 'canonicalSourceUrl'))
    if (url.username || url.password || url.hash) throw new Error('External source URL must not contain credentials or fragments')
    return `EXTERNAL_FACT:${url.href}:${required(source.publisher, 'publisher').toLowerCase()}`
  }
  const ids = [...new Set((source.dependencyIds ?? [source.recordKey]).map((id) => required(id, 'dependencyId')))].sort()
  return ids.join('|')
}

function assessSource(source, generatedMs, horizon) {
  if (!FAMILIES.has(source.family)) throw new Error('Unsupported evidence family')
  required(source.table, 'source table')
  required(source.recordKey, 'source record key')
  required(source.methodologyVersion, 'source methodology')
  const cutoffMs = instant(source.cutoff, 'source cutoff')
  if (cutoffMs > generatedMs) throw new Error('Source cutoff cannot be later than generated_at')

  const limitations = []
  if (source.status !== 'COMPLETE') limitations.push(`SOURCE_${source.status ?? 'STATUS_MISSING'}:${source.family}:${source.recordKey}`)
  if (source.family === 'MARKET_AI' || source.family === 'TECHNICAL') {
    if (source.calendarAvailable !== true || !Number.isInteger(source.missedSessions)) limitations.push(`STALE_SOURCE:CALENDAR_UNAVAILABLE:${source.family}:${source.recordKey}`)
    else if (source.missedSessions > SESSION_LIMITS[horizon]) limitations.push(`STALE_SOURCE:${source.family}:${source.recordKey}`)
  } else if ((generatedMs - cutoffMs) / 86400000 > DAY_LIMITS[horizon]) limitations.push(`STALE_SOURCE:${source.family}:${source.recordKey}`)

  return {
    ...source,
    cutoffMs,
    dependencyKey: dependencyKey(source),
    limitations,
    qualifiesPositive: source.positive === true && limitations.length === 0,
  }
}

export async function buildRecommendationCandidate(input) {
  required(input.ownerId, 'ownerId')
  required(input.instrumentId, 'instrumentId')
  if (!CATEGORIES.has(input.category)) throw new Error('Unsupported recommendation category')
  if (!SESSION_LIMITS[input.horizonSessions]) throw new Error('Unsupported recommendation horizon')
  const generatedMs = instant(input.generatedAt, 'generatedAt')
  const relevance = [...new Set((input.relevanceReasons ?? []).map((reason) => required(reason, 'relevance reason')))].sort()
  if (relevance.length === 0 || !relevance.some((reason) => /^(WATCHLIST|PORTFOLIO|EXPLICIT_INTEREST):/.test(reason))) {
    throw new Error('Personal relevance is required')
  }
  required(input.thesis, 'thesis')
  required(input.principalRisks, 'principalRisks')
  if (!Array.isArray(input.sources) || input.sources.length === 0) throw new Error('At least one source is required')

  const sources = input.sources.map((source) => assessSource(source, generatedMs, input.horizonSessions))
  const sourceKeys = new Set()
  for (const source of sources) {
    const key = `${source.family}:${source.table}:${source.recordKey}`
    if (sourceKeys.has(key)) throw new Error('Source identities must be unique')
    sourceKeys.add(key)
  }
  const positiveGroups = new Set(sources.filter((source) => source.qualifiesPositive).map((source) => source.dependencyKey))
  const limitations = [...new Set(sources.flatMap((source) => source.limitations))].sort()
  const requiredGroups = ['INVESTIGATE', 'REVIEW_RISK'].includes(input.category) ? 2 : 1
  if (positiveGroups.size < requiredGroups) throw new Error('Unsupported recommendation path: insufficient independent qualifying evidence')
  if (input.category === 'INVESTIGATE' && positiveGroups.size === 1 && sources.some((source) => source.family === 'OPPORTUNITY')) {
    throw new Error('Unsupported recommendation path: Opportunity alone cannot produce INVESTIGATE')
  }
  if (requiredGroups === 1 && positiveGroups.size === 1) limitations.push('SINGLE_DEPENDENCY_GROUP')

  const orderedSources = sources.map((source) => ({
    source_family: source.family,
    source_table: source.table,
    source_record_key: source.recordKey,
    source_cutoff: source.cutoff,
    methodology_version: source.methodologyVersion,
    relevance: required(source.relevance, 'source relevance'),
    canonical_source_url: source.canonicalSourceUrl ?? null,
    claim_hash: source.claimHash ?? null,
    dependency_key: source.dependencyKey,
    qualifies_positive: source.qualifiesPositive,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const sourceCutoff = new Date(Math.max(...sources.map((source) => source.cutoffMs))).toISOString()
  const identity = {
    owner_user_id: input.ownerId, instrument_id: input.instrumentId, generated_at: input.generatedAt,
    valid_until: input.validUntil ?? null,
    category: input.category, intended_horizon_sessions: input.horizonSessions,
    thesis: input.thesis, principal_risks: input.principalRisks, confidence: input.confidence ?? null,
    relevance_reasons: relevance, methodology_version: METHOD, model_identity: input.modelIdentity ?? null,
    source_cutoff: sourceCutoff, quality_status: limitations.length ? 'LIMITED' : 'COMPLETE',
    quality_reasons: [...new Set(limitations)].sort(), sources: orderedSources,
  }
  return { ...identity, source_hash: await sha256(identity) }
}

export function immutableRecommendationMatches(candidate, persisted, persistedSources) {
  const comparable = { ...candidate }
  delete comparable.sources
  const stored = Object.fromEntries(Object.keys(comparable).map((key) => [key, persisted[key]]))
  return JSON.stringify(canonical(comparable)) === JSON.stringify(canonical(stored))
    && JSON.stringify(canonical(candidate.sources)) === JSON.stringify(canonical(persistedSources))
}

export async function persistRecommendationCandidate(store, candidate) {
  if (!store || typeof store.runAtomically !== 'function') throw new Error('An atomic trusted store is required')
  return store.runAtomically(async (transaction) => {
    const { sources, ...snapshot } = candidate
    const result = await transaction.insertSnapshotOnConflictDoNothing(snapshot)
    if (result.inserted) {
      await transaction.insertSources(sources.map((source) => ({ ...source, recommendation_id: result.id, owner_user_id: snapshot.owner_user_id })))
      return { id: result.id, inserted: true }
    }
    const existing = await transaction.loadSnapshotAndSources(snapshot.owner_user_id, snapshot.instrument_id, snapshot.generated_at, snapshot.methodology_version)
    if (!existing || !immutableRecommendationMatches(candidate, existing.snapshot, existing.sources)) {
      throw new Error('Immutable recommendation conflict: persisted source identity differs')
    }
    return { id: existing.snapshot.id, inserted: false }
  })
}

export async function loadOwnerRecommendationContext(store, ownerId, instrumentId, generatedAt) {
  required(ownerId, 'ownerId')
  required(instrumentId, 'instrumentId')
  instant(generatedAt, 'generatedAt')
  if (!store || typeof store.loadPersonalRelevance !== 'function' || typeof store.loadEligibleEvidence !== 'function') {
    throw new Error('A trusted recommendation source store is required')
  }
  const relevance = await store.loadPersonalRelevance({ ownerId, instrumentId, cutoff: generatedAt })
  if (!Array.isArray(relevance) || !relevance.length || relevance.some((row) => row.owner_user_id !== ownerId)) {
    throw new Error('Owner-filtered personal relevance is required')
  }
  const evidence = await store.loadEligibleEvidence({ ownerId, instrumentId, cutoff: generatedAt })
  if (!Array.isArray(evidence) || evidence.some((row) => Date.parse(row.cutoff) > Date.parse(generatedAt))) {
    throw new Error('Evidence loader returned a future or invalid source')
  }
  return {
    relevanceReasons: [...new Set(relevance.map((row) => required(row.reason, 'relevance reason')))].sort(),
    sources: evidence,
  }
}

export async function persistRecommendationWithRpc(client, candidate) {
  if (!client || typeof client.schema !== 'function') throw new Error('A trusted Supabase client is required')
  const privateClient = client.schema('private')
  if (!privateClient || typeof privateClient.rpc !== 'function') throw new Error('The private trusted RPC schema is required')
  const { sources, ...snapshot } = candidate
  const { data, error } = await privateClient.rpc('persist_personal_recommendation_v1', { p_snapshot: snapshot, p_sources: sources })
  if (error) throw error
  return data
}

export function createSupabaseRecommendationSourceStore(client) {
  if (!client || typeof client.schema !== 'function') throw new Error('A trusted Supabase client is required')
  const privateClient = client.schema('private')
  if (!privateClient || typeof privateClient.rpc !== 'function') throw new Error('The private trusted RPC schema is required')
  const cache = new Map()
  async function load({ ownerId, instrumentId, cutoff }) {
    const key = JSON.stringify([ownerId, instrumentId, cutoff])
    if (!cache.has(key)) cache.set(key, (async () => {
      const { data, error } = await privateClient.rpc('load_personal_recommendation_context_v1', {
        p_owner_user_id: ownerId, p_instrument_id: instrumentId, p_cutoff: cutoff,
      })
      if (error) throw error
      if (!data || !Array.isArray(data.relevance) || !Array.isArray(data.evidence)) throw new Error('Trusted recommendation context response is invalid')
      return data
    })())
    return cache.get(key)
  }
  return {
    loadPersonalRelevance: async (args) => (await load(args)).relevance,
    loadEligibleEvidence: async (args) => (await load(args)).evidence,
  }
}

export { METHOD as PERSONAL_RECOMMENDATION_METHOD }
