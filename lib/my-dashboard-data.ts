import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 500
const ID_BATCH_SIZE = 100

type WatchlistRow = {
  id: string
  owner_user_id: string
  name: string
  description: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

type WatchlistItemRow = {
  watchlist_id: string
  instrument_id: string
  sort_order: number
  notes: string | null
  added_at: string
}

type InterestRow = {
  id: string
  instrument_id: string | null
  theme_id: string | null
  interest_kind: 'watch' | 'hold' | 'research'
}

type InstrumentRow = {
  id: string
  symbol: string
  instrument_name: string
  asset_type: string
  exchange_code: string
  currency_code: string
}

type ObservationRow = {
  instrument_id: string
  interval_code: string
  observed_at: string
  close: number | string
  currency_code: string | null
  is_delayed: boolean
}

type ThemeMappingRow = {
  theme_id: string
  instrument_id: string
  exposure_type: string
  exposure_score: number | string | null
  rationale: string | null
}

type ThemeRow = {
  id: string
  theme_code: string
  theme_name: string
  description: string | null
  horizon_years_min: number | string | null
  horizon_years_max: number | string | null
  status: string
}

type AssessmentRow = {
  id: string
  theme_id: string
  assessment_date: string
  opportunity_score: number | string | null
  opportunity_confidence: number | string | null
  opportunity_level: string | null
  commercial_readiness: string | null
  time_horizon: string | null
  summary: string | null
  methodology_version: string
}

export type DashboardObservedPrice = {
  close: number
  currencyCode: string | null
  intervalCode: string
  observedAt: string
  isDelayed: boolean
}

export type DashboardWatchedInstrument = {
  instrumentId: string
  symbol: string
  instrumentName: string
  assetType: string
  exchangeCode: string
  currencyCode: string
  notes: string | null
  addedAt: string
  observedPrice: DashboardObservedPrice | null
  relatedThemeCount: number
}

export type DashboardWatchlist = {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  items: DashboardWatchedInstrument[]
}

export type DashboardOpportunityInstrument = {
  instrumentId: string
  symbol: string
  exposureType: string
  exposureScore: number | null
  rationale: string | null
  sourceKinds: Array<'watchlist' | 'instrument_interest'>
}

export type DashboardOpportunity = {
  themeId: string
  themeCode: string
  themeName: string
  description: string | null
  horizonYearsMin: number | null
  horizonYearsMax: number | null
  assessment: {
    id: string
    assessmentDate: string
    opportunityScore: number | null
    confidence: number | null
    level: string | null
    commercialReadiness: string | null
    timeHorizon: string | null
    summary: string | null
    methodologyVersion: string
  } | null
  directThemeInterest: boolean
  relatedInstruments: DashboardOpportunityInstrument[]
}

export type MyDashboardGateThreeData = {
  watchlists: DashboardWatchlist[]
  watchedInstrumentCount: number
  interestCount: number
  opportunities: DashboardOpportunity[]
  dataGaps: string[]
}

function numeric(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function loadMyDashboardGateThree(
  supabase: SupabaseClient,
  ownerId: string,
  isCurrent: () => boolean,
): Promise<MyDashboardGateThreeData | null> {
  const watchlists: WatchlistRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase
      .from('watchlists')
      .select('id,owner_user_id,name,description,is_default,created_at,updated_at')
      .eq('owner_user_id', ownerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (!isCurrent()) return null
    if (result.error) throw result.error
    const rows = (result.data ?? []) as WatchlistRow[]
    watchlists.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  const interests: InterestRow[] = []
  let exactInterestCount: number | null = null
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase
      .from('user_market_interests')
      .select('id,instrument_id,theme_id,interest_kind', { count: offset === 0 ? 'exact' : undefined })
      .eq('owner_user_id', ownerId)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (!isCurrent()) return null
    if (result.error) throw result.error
    if (offset === 0) exactInterestCount = result.count
    const rows = (result.data ?? []) as InterestRow[]
    interests.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  if (exactInterestCount === null) throw new Error('Exact private interest count was unavailable.')

  const listIds = watchlists.map((list) => list.id)
  const items: WatchlistItemRow[] = []
  for (let batchStart = 0; batchStart < listIds.length; batchStart += ID_BATCH_SIZE) {
    const batch = listIds.slice(batchStart, batchStart + ID_BATCH_SIZE)
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await supabase
        .from('watchlist_items')
        .select('watchlist_id,instrument_id,sort_order,notes,added_at')
        .in('watchlist_id', batch)
        .order('watchlist_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('added_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (!isCurrent()) return null
      if (result.error) throw result.error
      const rows = (result.data ?? []) as WatchlistItemRow[]
      items.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }
  }

  const watchedInstrumentIds = new Set(items.map((item) => item.instrument_id))
  const interestedInstrumentIds = new Set(
    interests.map((interest) => interest.instrument_id).filter((id): id is string => Boolean(id)),
  )
  const relevantInstrumentIds = [...new Set([...watchedInstrumentIds, ...interestedInstrumentIds])]

  const instruments: InstrumentRow[] = []
  for (let batchStart = 0; batchStart < relevantInstrumentIds.length; batchStart += ID_BATCH_SIZE) {
    const batch = relevantInstrumentIds.slice(batchStart, batchStart + ID_BATCH_SIZE)
    const result = await supabase
      .from('instruments')
      .select('id,symbol,instrument_name,asset_type,exchange_code,currency_code')
      .in('id', batch)
      .order('symbol', { ascending: true })
    if (!isCurrent()) return null
    if (result.error) throw result.error
    instruments.push(...((result.data ?? []) as InstrumentRow[]))
  }
  const instrumentMap = new Map(instruments.map((instrument) => [instrument.id, instrument]))

  const observations = new Map<string, ObservationRow>()
  await Promise.all(relevantInstrumentIds.map(async (instrumentId) => {
    const result = await supabase
      .from('market_observations')
      .select('instrument_id,interval_code,observed_at,close,currency_code,is_delayed')
      .eq('instrument_id', instrumentId)
      .in('interval_code', ['quote', '1day'])
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!isCurrent()) return
    if (result.error) throw result.error
    if (result.data) observations.set(instrumentId, result.data as ObservationRow)
  }))
  if (!isCurrent()) return null

  const mappings: ThemeMappingRow[] = []
  for (let batchStart = 0; batchStart < relevantInstrumentIds.length; batchStart += ID_BATCH_SIZE) {
    const batch = relevantInstrumentIds.slice(batchStart, batchStart + ID_BATCH_SIZE)
    const result = await supabase
      .from('opportunity_theme_instruments')
      .select('theme_id,instrument_id,exposure_type,exposure_score,rationale')
      .in('instrument_id', batch)
      .eq('is_active', true)
      .order('theme_id', { ascending: true })
      .order('instrument_id', { ascending: true })
    if (!isCurrent()) return null
    if (result.error) throw result.error
    mappings.push(...((result.data ?? []) as ThemeMappingRow[]))
  }

  const directlyInterestedThemeIds = new Set(
    interests.map((interest) => interest.theme_id).filter((id): id is string => Boolean(id)),
  )
  const relevantThemeIds = [...new Set([...mappings.map((mapping) => mapping.theme_id), ...directlyInterestedThemeIds])]

  const themes: ThemeRow[] = []
  for (let batchStart = 0; batchStart < relevantThemeIds.length; batchStart += ID_BATCH_SIZE) {
    const batch = relevantThemeIds.slice(batchStart, batchStart + ID_BATCH_SIZE)
    const result = await supabase
      .from('opportunity_themes')
      .select('id,theme_code,theme_name,description,horizon_years_min,horizon_years_max,status')
      .in('id', batch)
      .eq('status', 'active')
      .order('theme_name', { ascending: true })
    if (!isCurrent()) return null
    if (result.error) throw result.error
    themes.push(...((result.data ?? []) as ThemeRow[]))
  }

  const latestAssessments = new Map<string, AssessmentRow>()
  await Promise.all(themes.map(async (theme) => {
    const result = await supabase
      .from('opportunity_assessments')
      .select('id,theme_id,assessment_date,opportunity_score,opportunity_confidence,opportunity_level,commercial_readiness,time_horizon,summary,methodology_version')
      .eq('theme_id', theme.id)
      .order('assessment_date', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!isCurrent()) return
    if (result.error) throw result.error
    if (result.data) latestAssessments.set(theme.id, result.data as AssessmentRow)
  }))
  if (!isCurrent()) return null

  const mappingsByInstrument = new Map<string, ThemeMappingRow[]>()
  for (const mapping of mappings) {
    const existing = mappingsByInstrument.get(mapping.instrument_id) ?? []
    existing.push(mapping)
    mappingsByInstrument.set(mapping.instrument_id, existing)
  }

  const dashboardWatchlists = watchlists.map((list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    isDefault: list.is_default,
    items: items
      .filter((item) => item.watchlist_id === list.id)
      .sort((left, right) => left.sort_order - right.sort_order || left.added_at.localeCompare(right.added_at))
      .map((item) => {
        const instrument = instrumentMap.get(item.instrument_id)
        const observation = observations.get(item.instrument_id)
        return {
          instrumentId: item.instrument_id,
          symbol: instrument?.symbol ?? 'UNMAPPED',
          instrumentName: instrument?.instrument_name ?? 'Instrument mapping unavailable',
          assetType: instrument?.asset_type ?? 'unknown',
          exchangeCode: instrument?.exchange_code ?? 'unknown',
          currencyCode: instrument?.currency_code ?? 'unknown',
          notes: item.notes,
          addedAt: item.added_at,
          observedPrice: observation ? {
            close: Number(observation.close),
            currencyCode: observation.currency_code,
            intervalCode: observation.interval_code,
            observedAt: observation.observed_at,
            isDelayed: observation.is_delayed,
          } : null,
          relatedThemeCount: (mappingsByInstrument.get(item.instrument_id) ?? []).length,
        }
      }),
  }))

  const dashboardOpportunities = themes.map((theme) => {
    const assessment = latestAssessments.get(theme.id)
    const themeMappings = mappings.filter((mapping) => mapping.theme_id === theme.id)
    return {
      themeId: theme.id,
      themeCode: theme.theme_code,
      themeName: theme.theme_name,
      description: theme.description,
      horizonYearsMin: numeric(theme.horizon_years_min),
      horizonYearsMax: numeric(theme.horizon_years_max),
      assessment: assessment ? {
        id: assessment.id,
        assessmentDate: assessment.assessment_date,
        opportunityScore: numeric(assessment.opportunity_score),
        confidence: numeric(assessment.opportunity_confidence),
        level: assessment.opportunity_level,
        commercialReadiness: assessment.commercial_readiness,
        timeHorizon: assessment.time_horizon,
        summary: assessment.summary,
        methodologyVersion: assessment.methodology_version,
      } : null,
      directThemeInterest: directlyInterestedThemeIds.has(theme.id),
      relatedInstruments: themeMappings.map((mapping) => {
        const instrument = instrumentMap.get(mapping.instrument_id)
        const sourceKinds: Array<'watchlist' | 'instrument_interest'> = []
        if (watchedInstrumentIds.has(mapping.instrument_id)) sourceKinds.push('watchlist')
        if (interestedInstrumentIds.has(mapping.instrument_id)) sourceKinds.push('instrument_interest')
        return {
          instrumentId: mapping.instrument_id,
          symbol: instrument?.symbol ?? 'UNMAPPED',
          exposureType: mapping.exposure_type,
          exposureScore: numeric(mapping.exposure_score),
          rationale: mapping.rationale,
          sourceKinds,
        }
      }).sort((left, right) => (right.exposureScore ?? -1) - (left.exposureScore ?? -1) || left.symbol.localeCompare(right.symbol)),
    }
  }).sort((left, right) => (right.assessment?.opportunityScore ?? -1) - (left.assessment?.opportunityScore ?? -1) || left.themeName.localeCompare(right.themeName))

  const dataGaps: string[] = []
  const unmappedWatched = [...watchedInstrumentIds].filter((instrumentId) => !(mappingsByInstrument.get(instrumentId)?.length))
  if (unmappedWatched.length) dataGaps.push(`${unmappedWatched.length} watched instrument${unmappedWatched.length === 1 ? '' : 's'} have no active Opportunity mapping.`)
  const missingAssessments = dashboardOpportunities.filter((opportunity) => !opportunity.assessment)
  if (missingAssessments.length) dataGaps.push(`${missingAssessments.length} relevant Opportunity theme${missingAssessments.length === 1 ? '' : 's'} have no persisted assessment.`)
  const unavailableDirectThemes = [...directlyInterestedThemeIds].filter((themeId) => !themes.some((theme) => theme.id === themeId))
  if (unavailableDirectThemes.length) dataGaps.push(`${unavailableDirectThemes.length} stored theme interest${unavailableDirectThemes.length === 1 ? '' : 's'} are inactive or unavailable.`)
  const missingInstrumentMappings = relevantInstrumentIds.filter((instrumentId) => !instrumentMap.has(instrumentId))
  if (missingInstrumentMappings.length) dataGaps.push(`${missingInstrumentMappings.length} private instrument reference${missingInstrumentMappings.length === 1 ? '' : 's'} could not be resolved to the tracked universe.`)

  return {
    watchlists: dashboardWatchlists,
    watchedInstrumentCount: watchedInstrumentIds.size,
    interestCount: exactInterestCount,
    opportunities: dashboardOpportunities,
    dataGaps,
  }
}
