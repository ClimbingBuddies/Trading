import { getSupabase } from './supabase'

export type OpportunityTheme = {
  id: string
  theme_code: string
  theme_name: string
  description: string | null
  horizon_years_min: number | null
  horizon_years_max: number | null
  status: string
  created_at: string
  updated_at: string
}

export type OpportunityAssessment = {
  id: string
  theme_id: string
  assessment_date: string
  structural_signal_id: string | null
  technology_inflection_signal_id: string | null
  structural_score: number | null
  structural_confidence: number | null
  technology_inflection_score: number | null
  technology_inflection_confidence: number | null
  opportunity_score: number | null
  opportunity_confidence: number | null
  opportunity_level: string | null
  commercial_readiness: string | null
  time_horizon: string | null
  summary: string | null
  methodology_version: string
  created_at: string
  updated_at: string
}

export type StructuralSignal = {
  id: string
  theme_id: string
  signal_date: string
  demand_score: number | null
  adoption_score: number | null
  capital_investment_score: number | null
  capacity_constraint_score: number | null
  economics_score: number | null
  overall_score: number | null
  confidence: number | null
  signal_label: string | null
  summary: string | null
  evidence_summary: Record<string, unknown>
  methodology_version: string
  created_at: string
  updated_at: string
}

export type TechnologySignal = {
  id: string
  theme_id: string
  signal_date: string
  bottleneck: string | null
  unlock_description: string | null
  maturity_stage: string | null
  bottleneck_unlock_score: number | null
  evidence_quality_score: number | null
  commercialisation_score: number | null
  impact_score: number | null
  overall_score: number | null
  confidence: number | null
  signal_label: string | null
  summary: string | null
  methodology_version: string
  created_at: string
  updated_at: string
}

export type TechnologyEvent = {
  id: string
  technology_signal_id: string
  event_date: string | null
  event_type: string | null
  title: string
  description: string
  source_name: string | null
  source_url: string | null
  evidence_strength: number | null
  created_at: string
}

export type ThemeExposure = {
  theme_id: string
  instrument_id: string
  exposure_type: string
  exposure_score: number | null
  rationale: string | null
  is_active: boolean
  instruments: {
    symbol: string
    instrument_name: string
    asset_type: string
    exchange_code: string
  } | null
}

export type OpportunityOverviewRow = {
  theme: OpportunityTheme
  latest: OpportunityAssessment | null
  exposureCount: number
  exposures: ThemeExposure[]
}

export type RelatedOpportunityTheme = {
  theme: OpportunityTheme
  latest: OpportunityAssessment | null
  sharedExposures: Array<{
    symbol: string
    currentExposureScore: number | null
    relatedExposureScore: number | null
  }>
}

export type ResearchDocument = {
  id: string
  document_scope: string
  opportunity_assessment_id: string | null
  title: string
  tiptap_json: Record<string, unknown>
  plain_text: string | null
  content_schema_version: string
  document_version: number
  status: string
  generated_by: string | null
  last_editor: string | null
  created_at: string
  updated_at: string
}

export type ResearchEmbed = {
  id: string
  document_id: string
  node_id: string
  embed_type: string
  title: string | null
  description: string | null
  display_variant: string | null
  source_name: string | null
  source_url: string | null
  source_published_at: string | null
  asset_url: string | null
  alt_text: string | null
  instrument_id: string | null
  technical_indicator_id: number | null
  market_score_id: number | null
  market_convergence_id: string | null
  gpt_market_assessment_id: string | null
  structural_signal_id: string | null
  technology_inflection_signal_id: string | null
  technology_inflection_event_id: string | null
  opportunity_assessment_id: string | null
  chart_config: Record<string, unknown>
  data_reference: Record<string, unknown>
  snapshot_data: Record<string, unknown> | unknown[]
  metadata: Record<string, unknown>
  relevance_score: number | null
  confidence: number | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

function latestByTheme(rows: OpportunityAssessment[]) {
  const map = new Map<string, OpportunityAssessment>()
  for (const row of rows) if (!map.has(row.theme_id)) map.set(row.theme_id, row)
  return map
}

function normalizeThemeCode(value: string) {
  return decodeURIComponent(value).trim().toLowerCase()
}

export async function getOpportunityOverview() {
  const supabase = getSupabase()
  const [themesRes, assessmentsRes, exposuresRes] = await Promise.all([
    supabase
      .from('opportunity_themes')
      .select('id,theme_code,theme_name,description,horizon_years_min,horizon_years_max,status,created_at,updated_at')
      .in('status', ['active', 'watch'])
      .order('theme_name'),
    supabase
      .from('opportunity_assessments')
      .select('id,theme_id,assessment_date,structural_signal_id,technology_inflection_signal_id,structural_score,structural_confidence,technology_inflection_score,technology_inflection_confidence,opportunity_score,opportunity_confidence,opportunity_level,commercial_readiness,time_horizon,summary,methodology_version,created_at,updated_at')
      .order('assessment_date', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(2000),
    supabase
      .from('opportunity_theme_instruments')
      .select('theme_id,instrument_id,exposure_type,exposure_score,rationale,is_active,instruments(symbol,instrument_name,asset_type,exchange_code)')
      .eq('is_active', true)
      .order('exposure_score', { ascending: false }),
  ])

  if (themesRes.error) throw themesRes.error
  if (assessmentsRes.error) throw assessmentsRes.error
  if (exposuresRes.error) throw exposuresRes.error

  const themes = (themesRes.data ?? []) as OpportunityTheme[]
  const assessments = (assessmentsRes.data ?? []) as OpportunityAssessment[]
  const exposures = (exposuresRes.data ?? []) as unknown as ThemeExposure[]
  const latestMap = latestByTheme(assessments)
  const exposureMap = new Map<string, ThemeExposure[]>()

  for (const row of exposures) {
    const rows = exposureMap.get(row.theme_id) ?? []
    rows.push(row)
    exposureMap.set(row.theme_id, rows)
  }

  const rows: OpportunityOverviewRow[] = themes.map((theme) => {
    const themeExposures = exposureMap.get(theme.id) ?? []
    return {
      theme,
      latest: latestMap.get(theme.id) ?? null,
      exposureCount: themeExposures.length,
      exposures: themeExposures,
    }
  })

  rows.sort((a, b) => (b.latest?.opportunity_score ?? -1) - (a.latest?.opportunity_score ?? -1) || a.theme.theme_name.localeCompare(b.theme.theme_name))

  const scored = rows.filter((row) => row.latest?.opportunity_score !== null && row.latest?.opportunity_score !== undefined)
  const averageScore = scored.length ? scored.reduce((sum, row) => sum + (row.latest?.opportunity_score ?? 0), 0) / scored.length : null
  const highest = scored.slice(0, 5)
  const majorCount = rows.filter((row) => ['major', 'transformational'].includes(row.latest?.opportunity_level ?? '')).length
  const latestDate = assessments[0]?.assessment_date ?? null

  return { rows, averageScore, highest, majorCount, latestDate }
}

export async function getOpportunityDetail(themeCode: string) {
  const overview = await getOpportunityOverview()
  const overviewRow = overview.rows.find((item) => normalizeThemeCode(item.theme.theme_code) === normalizeThemeCode(themeCode))
  if (!overviewRow) return null

  const supabase = getSupabase()
  const theme = overviewRow.theme
  const exposures = overviewRow.exposures

  const [assessmentsRes, structuralRes, techRes] = await Promise.all([
    supabase
      .from('opportunity_assessments')
      .select('id,theme_id,assessment_date,structural_signal_id,technology_inflection_signal_id,structural_score,structural_confidence,technology_inflection_score,technology_inflection_confidence,opportunity_score,opportunity_confidence,opportunity_level,commercial_readiness,time_horizon,summary,methodology_version,created_at,updated_at')
      .eq('theme_id', theme.id)
      .order('assessment_date', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(365),
    supabase
      .from('structural_opportunity_signals')
      .select('id,theme_id,signal_date,demand_score,adoption_score,capital_investment_score,capacity_constraint_score,economics_score,overall_score,confidence,signal_label,summary,evidence_summary,methodology_version,created_at,updated_at')
      .eq('theme_id', theme.id)
      .order('signal_date', { ascending: false })
      .limit(30),
    supabase
      .from('technology_inflection_signals')
      .select('id,theme_id,signal_date,bottleneck,unlock_description,maturity_stage,bottleneck_unlock_score,evidence_quality_score,commercialisation_score,impact_score,overall_score,confidence,signal_label,summary,methodology_version,created_at,updated_at')
      .eq('theme_id', theme.id)
      .order('signal_date', { ascending: false })
      .limit(30),
  ])

  if (assessmentsRes.error) throw assessmentsRes.error
  if (structuralRes.error) throw structuralRes.error
  if (techRes.error) throw techRes.error

  const assessments = (assessmentsRes.data ?? []) as OpportunityAssessment[]
  const structuralSignals = (structuralRes.data ?? []) as StructuralSignal[]
  const technologySignals = (techRes.data ?? []) as TechnologySignal[]
  const latest = assessments[0] ?? null
  const latestStructural = structuralSignals[0] ?? null
  const latestTechnology = technologySignals[0] ?? null

  let events: TechnologyEvent[] = []
  if (technologySignals.length) {
    const ids = technologySignals.map((row) => row.id)
    const eventsRes = await supabase
      .from('technology_inflection_events')
      .select('id,technology_signal_id,event_date,event_type,title,description,source_name,source_url,evidence_strength,created_at')
      .in('technology_signal_id', ids)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)
    if (eventsRes.error) throw eventsRes.error
    events = (eventsRes.data ?? []) as TechnologyEvent[]
  }

  let researchDocument: ResearchDocument | null = null
  let researchEmbeds: ResearchEmbed[] = []
  if (latest) {
    const documentRes = await supabase
      .from('assessment_research_documents')
      .select('id,document_scope,opportunity_assessment_id,title,tiptap_json,plain_text,content_schema_version,document_version,status,generated_by,last_editor,created_at,updated_at')
      .eq('document_scope', 'opportunity')
      .eq('opportunity_assessment_id', latest.id)
      .maybeSingle()
    if (documentRes.error) throw documentRes.error
    researchDocument = documentRes.data as ResearchDocument | null

    if (researchDocument) {
      const embedsRes = await supabase
        .from('assessment_research_embeds')
        .select('id,document_id,node_id,embed_type,title,description,display_variant,source_name,source_url,source_published_at,asset_url,alt_text,instrument_id,technical_indicator_id,market_score_id,market_convergence_id,gpt_market_assessment_id,structural_signal_id,technology_inflection_signal_id,technology_inflection_event_id,opportunity_assessment_id,chart_config,data_reference,snapshot_data,metadata,relevance_score,confidence,sort_order,created_at,updated_at')
        .eq('document_id', researchDocument.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (embedsRes.error) throw embedsRes.error
      researchEmbeds = (embedsRes.data ?? []) as ResearchEmbed[]
    }
  }

  const currentBySymbol = new Map<string, ThemeExposure>()
  for (const exposure of exposures) {
    const symbol = exposure.instruments?.symbol
    if (symbol) currentBySymbol.set(symbol, exposure)
  }

  const relatedThemes: RelatedOpportunityTheme[] = overview.rows
    .filter((row) => row.theme.id !== theme.id)
    .map((row) => {
      const sharedExposures = row.exposures.flatMap((exposure) => {
        const symbol = exposure.instruments?.symbol
        if (!symbol) return []
        const current = currentBySymbol.get(symbol)
        if (!current) return []
        return [{
          symbol,
          currentExposureScore: current.exposure_score,
          relatedExposureScore: exposure.exposure_score,
        }]
      })
      return { theme: row.theme, latest: row.latest, sharedExposures }
    })
    .filter((row) => row.sharedExposures.length > 0)
    .sort((a, b) => b.sharedExposures.length - a.sharedExposures.length || (b.latest?.opportunity_score ?? -1) - (a.latest?.opportunity_score ?? -1))

  return {
    theme,
    themeOptions: overview.rows.map((row) => row.theme),
    assessments,
    latest,
    structuralSignals,
    technologySignals,
    latestStructural,
    latestTechnology,
    events,
    exposures,
    relatedThemes,
    researchDocument,
    researchEmbeds,
  }
}
