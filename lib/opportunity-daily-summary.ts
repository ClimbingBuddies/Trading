import { getSupabase } from './supabase'
import { scoreDelta } from './quality-critical.mjs'

export type OpportunityAssessmentRunSummary = {
  run_id: string
  assessment_date: string
  started_at: string | null
  completed_at: string | null
  status: string
  execution_source: string | null
  themes_requested: number | null
  themes_completed: number | null
}

export type OpportunityDailyThemeStatus = {
  assessmentId: string | null
  previousAssessmentId: string | null
  scoreDelta: number | null
  scoreChanged: boolean
  updatedInLatestRun: boolean
  evidenceRefreshed: boolean
  newEventCount: number
}

export type OpportunityDailySummary = {
  latestRun: OpportunityAssessmentRunSummary | null
  isToday: boolean
  assessedCount: number
  scoreChangedCount: number
  evidenceRefreshedCount: number
  newEventCount: number
  byTheme: Record<string, OpportunityDailyThemeStatus>
}

type AssessmentRow = {
  id: string
  theme_id: string
  assessment_date: string
  opportunity_score: number | null
  assessment_run_id: string | null
  updated_at: string
}

type TechnologySignalRow = {
  id: string
  theme_id: string
}

function perthToday() {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function getOpportunityDailySummary(): Promise<OpportunityDailySummary> {
  const supabase = getSupabase()

  const [runRes, assessmentsRes] = await Promise.all([
    supabase
      .from('opportunity_assessment_runs')
      .select('run_id,assessment_date,started_at,completed_at,status,execution_source,themes_requested,themes_completed')
      .order('assessment_date', { ascending: false })
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('opportunity_assessments')
      .select('id,theme_id,assessment_date,opportunity_score,assessment_run_id,updated_at')
      .order('assessment_date', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(500),
  ])

  if (runRes.error) throw runRes.error
  if (assessmentsRes.error) throw assessmentsRes.error

  const latestRun = runRes.data as OpportunityAssessmentRunSummary | null
  const assessments = (assessmentsRes.data ?? []) as AssessmentRow[]

  if (!latestRun) {
    return {
      latestRun: null,
      isToday: false,
      assessedCount: 0,
      scoreChangedCount: 0,
      evidenceRefreshedCount: 0,
      newEventCount: 0,
      byTheme: {},
    }
  }

  const currentRows = assessments.filter((row) => row.assessment_run_id === latestRun.run_id)
  const currentIds = currentRows.map((row) => row.id)

  const [documentsRes, technologySignalsRes] = await Promise.all([
    currentIds.length
      ? supabase
          .from('assessment_research_documents')
          .select('id,opportunity_assessment_id')
          .eq('document_scope', 'opportunity')
          .in('opportunity_assessment_id', currentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('technology_inflection_signals')
      .select('id,theme_id')
      .eq('assessment_run_id', latestRun.run_id),
  ])

  if (documentsRes.error) throw documentsRes.error
  if (technologySignalsRes.error) throw technologySignalsRes.error

  const technologySignals = (technologySignalsRes.data ?? []) as TechnologySignalRow[]
  const technologySignalIds = technologySignals.map((row) => row.id)
  const eventsRes = technologySignalIds.length
    ? await supabase
        .from('technology_inflection_events')
        .select('id,technology_signal_id')
        .in('technology_signal_id', technologySignalIds)
    : { data: [], error: null }

  if (eventsRes.error) throw eventsRes.error

  const assessmentTheme = new Map(currentRows.map((row) => [row.id, row.theme_id]))
  const evidenceThemes = new Set<string>()
  for (const document of documentsRes.data ?? []) {
    const assessmentId = document.opportunity_assessment_id as string | null
    const themeId = assessmentId ? assessmentTheme.get(assessmentId) : null
    if (themeId) evidenceThemes.add(themeId)
  }

  const technologyTheme = new Map(technologySignals.map((row) => [row.id, row.theme_id]))
  const eventCountByTheme = new Map<string, number>()
  for (const event of eventsRes.data ?? []) {
    const themeId = technologyTheme.get(event.technology_signal_id as string)
    if (!themeId) continue
    eventCountByTheme.set(themeId, (eventCountByTheme.get(themeId) ?? 0) + 1)
  }

  const byTheme: Record<string, OpportunityDailyThemeStatus> = {}
  let scoreChangedCount = 0

  for (const current of currentRows) {
    const previous = assessments.find((row) => row.theme_id === current.theme_id && row.id !== current.id) ?? null
    const delta = scoreDelta(current.opportunity_score, previous?.opportunity_score ?? null)
    const changed = delta !== null && Math.abs(delta) >= 0.005
    if (changed) scoreChangedCount += 1

    byTheme[current.theme_id] = {
      assessmentId: current.id,
      previousAssessmentId: previous?.id ?? null,
      scoreDelta: delta,
      scoreChanged: changed,
      updatedInLatestRun: true,
      evidenceRefreshed: evidenceThemes.has(current.theme_id),
      newEventCount: eventCountByTheme.get(current.theme_id) ?? 0,
    }
  }

  return {
    latestRun,
    isToday: latestRun.assessment_date === perthToday(),
    assessedCount: currentRows.length,
    scoreChangedCount,
    evidenceRefreshedCount: evidenceThemes.size,
    newEventCount: (eventsRes.data ?? []).length,
    byTheme,
  }
}
