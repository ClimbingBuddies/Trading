import { getSupabase } from './supabase'

export type SyncRun = {
  id: string
  provider_id?: string
  started_at: string
  finished_at: string | null
  requested_count: number
  received_count: number
  inserted_count: number
  status: string
  error_message: string | null
  metadata: Record<string, unknown> | null
}

export type MarketSessionStatus = 'open' | 'closed' | '24h'
export type MarketDataStatus = 'current' | 'due' | 'stale' | 'market_closed' | 'no_data'

export type MarketRow = {
  id: string
  symbol: string
  instrument_name: string
  asset_type: string
  exchange_code: string
  currency_code: string
  latest_price: number | null
  observed_at: string | null
  loaded_at: string | null
  provider_name: string | null
  provider_code: string | null
  age_minutes: number | null
  session_status: MarketSessionStatus
  data_status: MarketDataStatus
}

export type AssessmentRow = {
  assessment_id: string
  instrument_id: string
  symbol: string
  instrument_name: string
  assessment_date: string
  rating: string
  confidence: number | null
  score: number | null
  summary: string | null
  bull_case: string | null
  bear_case: string | null
  technical_view: string | null
  macro_view: string | null
  valuation_view: string | null
  key_catalysts: string | null
  key_risks: string | null
  evidence_summary: string | null
  created_at: string
}

type MarketRun = {
  run_id: string
  started_at: string
  completed_at: string | null
  status: string
  analysis_cutoff_time: string | null
  model_name: string | null
  prompt_version: string | null
  analysis_mode: string | null
  tickers_requested: number | null
  tickers_completed: number | null
  notes: string | null
}

const PAGE_SIZE = 1000
const CURRENT_DATA_MINUTES = 90
const DUE_DATA_MINUTES = 120

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, month - 1, 1 + offset + (nth - 1) * 7))
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const last = new Date(Date.UTC(year, month, 0))
  const offset = (last.getUTCDay() - weekday + 7) % 7
  last.setUTCDate(last.getUTCDate() - offset)
  return last
}

function observedFixedHoliday(year: number, month: number, day: number) {
  const holiday = new Date(Date.UTC(year, month - 1, day))
  if (holiday.getUTCDay() === 6) holiday.setUTCDate(holiday.getUTCDate() - 1)
  else if (holiday.getUTCDay() === 0) holiday.setUTCDate(holiday.getUTCDate() + 1)
  return holiday
}

function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function usMarketHolidayKeys(year: number) {
  const keys = new Set<string>()

  for (const holidayYear of [year - 1, year, year + 1]) {
    keys.add(dateKey(observedFixedHoliday(holidayYear, 1, 1)))
    keys.add(dateKey(nthWeekdayOfMonth(holidayYear, 1, 1, 3)))
    keys.add(dateKey(nthWeekdayOfMonth(holidayYear, 2, 1, 3)))

    const goodFriday = easterSunday(holidayYear)
    goodFriday.setUTCDate(goodFriday.getUTCDate() - 2)
    keys.add(dateKey(goodFriday))

    keys.add(dateKey(lastWeekdayOfMonth(holidayYear, 5, 1)))
    keys.add(dateKey(observedFixedHoliday(holidayYear, 6, 19)))
    keys.add(dateKey(observedFixedHoliday(holidayYear, 7, 4)))
    keys.add(dateKey(nthWeekdayOfMonth(holidayYear, 9, 1, 1)))
    keys.add(dateKey(nthWeekdayOfMonth(holidayYear, 11, 4, 4)))
    keys.add(dateKey(observedFixedHoliday(holidayYear, 12, 25)))
  }

  return keys
}

function newYorkParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))

  return {
    weekday: get('weekday'),
    year,
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
  }
}

function isUsMarketOpen(now: Date) {
  const ny = newYorkParts(now)
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(ny.weekday)) return false
  if (usMarketHolidayKeys(ny.year).has(ny.dateKey)) return false
  return ny.minutes >= 9 * 60 + 30 && ny.minutes < 16 * 60
}

function marketSessionStatus(assetType: string, now: Date): MarketSessionStatus {
  if (assetType === 'equity' || assetType === 'etf') return isUsMarketOpen(now) ? 'open' : 'closed'
  return '24h'
}

function marketDataStatus(sessionStatus: MarketSessionStatus, ageMinutes: number | null): MarketDataStatus {
  if (ageMinutes === null) return 'no_data'
  if (sessionStatus === 'closed') return 'market_closed'
  if (ageMinutes <= CURRENT_DATA_MINUTES) return 'current'
  if (ageMinutes <= DUE_DATA_MINUTES) return 'due'
  return 'stale'
}

async function getLatestProductionMarketRun(): Promise<MarketRun | null> {
  const supabase = getSupabase()
  const result = await supabase
    .from('gpt_market_runs')
    .select('run_id,started_at,completed_at,status,analysis_cutoff_time,model_name,prompt_version,analysis_mode,tickers_requested,tickers_completed,notes')
    .in('status', ['succeeded', 'partial'])
    .order('started_at', { ascending: false })
    .limit(20)

  if (result.error) throw result.error
  return ((result.data ?? []) as MarketRun[]).find((run) => run.analysis_mode !== 'test') ?? null
}

async function fetchSyncRunsSince(sinceIso: string) {
  const supabase = getSupabase()
  const rows: SyncRun[] = []

  for (let page = 0; page < 6; page += 1) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const result = await supabase
      .from('sync_runs')
      .select('id,provider_id,started_at,finished_at,requested_count,received_count,inserted_count,status,error_message,metadata')
      .gte('started_at', sinceIso)
      .order('started_at', { ascending: false })
      .range(from, to)

    if (result.error) throw result.error
    const pageRows = (result.data ?? []) as SyncRun[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) break
  }

  return rows
}

async function fetchObservationTimesSince(sinceIso: string) {
  const supabase = getSupabase()
  const rows: { loaded_at: string }[] = []

  for (let page = 0; page < 8; page += 1) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const result = await supabase
      .from('market_observations')
      .select('loaded_at')
      .gte('loaded_at', sinceIso)
      .order('loaded_at', { ascending: false })
      .range(from, to)

    if (result.error) throw result.error
    const pageRows = (result.data ?? []) as { loaded_at: string }[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) break
  }

  return rows
}

export async function getAdminDashboardData() {
  const supabase = getSupabase()
  const now = new Date()
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)
  const since14 = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)
  since14.setUTCHours(0, 0, 0, 0)

  const [runs, observations, activeRes, latestObsRes, latestInstrumentObsRes] = await Promise.all([
    fetchSyncRunsSince(since14.toISOString()),
    fetchObservationTimesSince(since14.toISOString()),
    supabase.from('instruments').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('market_observations').select('loaded_at').order('loaded_at', { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from('market_observations')
      .select('instrument_id,loaded_at')
      .order('loaded_at', { ascending: false })
      .limit(1000),
  ])

  if (activeRes.error) throw activeRes.error
  if (latestObsRes.error) throw latestObsRes.error
  if (latestInstrumentObsRes.error) throw latestInstrumentObsRes.error

  const todayIso = today.toISOString()
  const runsToday = runs.filter((r) => r.started_at >= todayIso)
  const observationsToday = observations.filter((o) => o.loaded_at >= todayIso).length
  const lastRun = runs[0] ?? null
  const lastSuccessful = runs.find((r) => r.status === 'succeeded') ?? null
  const failuresToday = runsToday.filter((r) => r.status === 'failed' || r.status === 'partial').length

  const dailyMap = new Map<string, { date: string; runs: number; inserted: number }>()
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(since14.getTime() + i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    dailyMap.set(key, { date: key, runs: 0, inserted: 0 })
  }
  for (const run of runs) {
    const item = dailyMap.get(run.started_at.slice(0, 10))
    if (item) item.runs += 1
  }
  for (const obs of observations) {
    const item = dailyMap.get(obs.loaded_at.slice(0, 10))
    if (item) item.inserted += 1
  }

  const latestByInstrument = new Map<string, string>()
  for (const row of (latestInstrumentObsRes.data ?? []) as { instrument_id: string; loaded_at: string }[]) {
    if (!latestByInstrument.has(row.instrument_id)) latestByInstrument.set(row.instrument_id, row.loaded_at)
  }

  const freshness = { under15: 0, under60: 0, under240: 0, over240: 0, noObservation: 0 }
  for (const loadedAt of latestByInstrument.values()) {
    const age = Math.max(0, (now.getTime() - new Date(loadedAt).getTime()) / 60000)
    if (age < 15) freshness.under15 += 1
    else if (age < 60) freshness.under60 += 1
    else if (age < 240) freshness.under240 += 1
    else freshness.over240 += 1
  }
  freshness.noObservation = Math.max(0, (activeRes.count ?? 0) - latestByInstrument.size)

  return {
    lastRun,
    lastSuccessful,
    loadsToday: runsToday.length,
    observationsToday,
    failuresToday,
    activeInstruments: activeRes.count ?? 0,
    latestObservationAt: latestObsRes.data?.loaded_at ?? null,
    recentRuns: runs.slice(0, 40),
    daily: [...dailyMap.values()],
    freshness,
  }
}

export async function getLoadDetail(id: string) {
  const supabase = getSupabase()
  const runRes = await supabase
    .from('sync_runs')
    .select('id,provider_id,started_at,finished_at,requested_count,received_count,inserted_count,status,error_message,metadata')
    .eq('id', id)
    .single()

  if (runRes.error) throw runRes.error
  const run = runRes.data
  const from = new Date(new Date(run.started_at).getTime() - 60_000).toISOString()
  const to = new Date(new Date(run.finished_at ?? run.started_at).getTime() + 60_000).toISOString()

  const obsRes = await supabase
    .from('market_observations')
    .select('id,instrument_id,observed_at,loaded_at,open,high,low,close,volume,currency_code,instruments(symbol,instrument_name,asset_type)')
    .gte('loaded_at', from)
    .lte('loaded_at', to)
    .order('loaded_at', { ascending: true })

  if (obsRes.error) throw obsRes.error
  return { run, observations: obsRes.data ?? [] }
}

export async function getMarketsData() {
  const supabase = getSupabase()
  const [instrumentsRes, providersRes, observationsRes] = await Promise.all([
    supabase
      .from('instruments')
      .select('id,symbol,instrument_name,exchange_code,asset_type,currency_code,is_active')
      .eq('is_active', true)
      .order('asset_type')
      .order('symbol'),
    supabase
      .from('provider_instruments')
      .select('instrument_id,is_active,data_providers(provider_name,provider_code)')
      .eq('is_active', true),
    supabase
      .from('latest_market_observations')
      .select('instrument_id,close,observed_at,loaded_at,currency_code'),
  ])

  if (instrumentsRes.error) throw instrumentsRes.error
  if (providersRes.error) throw providersRes.error
  if (observationsRes.error) throw observationsRes.error

  const providerMap = new Map<string, { provider_name: string | null; provider_code: string | null }>()
  for (const row of providersRes.data ?? []) {
    const provider = (row as unknown as { data_providers: { provider_name: string; provider_code: string } | null }).data_providers
    providerMap.set(row.instrument_id, {
      provider_name: provider?.provider_name ?? null,
      provider_code: provider?.provider_code ?? null,
    })
  }

  const latestMap = new Map<string, { close: number; observed_at: string; loaded_at: string; currency_code: string | null }>()
  for (const row of observationsRes.data ?? []) latestMap.set(row.instrument_id, row)

  const now = new Date()
  const rows: MarketRow[] = (instrumentsRes.data ?? []).map((instrument) => {
    const latest = latestMap.get(instrument.id)
    const provider = providerMap.get(instrument.id)
    const ageMinutes = latest?.observed_at
      ? Math.max(0, Math.round((now.getTime() - new Date(latest.observed_at).getTime()) / 60000))
      : null
    const sessionStatus = marketSessionStatus(instrument.asset_type, now)

    return {
      id: instrument.id,
      symbol: instrument.symbol,
      instrument_name: instrument.instrument_name,
      asset_type: instrument.asset_type,
      exchange_code: instrument.exchange_code,
      currency_code: instrument.currency_code.trim(),
      latest_price: latest?.close ?? null,
      observed_at: latest?.observed_at ?? null,
      loaded_at: latest?.loaded_at ?? null,
      provider_name: provider?.provider_name ?? null,
      provider_code: provider?.provider_code ?? null,
      age_minutes: ageMinutes,
      session_status: sessionStatus,
      data_status: marketDataStatus(sessionStatus, ageMinutes),
    }
  })

  const counts = rows.reduce(
    (acc, row) => {
      acc.total += 1
      if (row.asset_type === 'equity') acc.equity += 1
      else if (row.asset_type === 'etf') acc.etf += 1
      else if (row.asset_type === 'forex') acc.forex += 1
      else if (row.asset_type === 'crypto') acc.crypto += 1
      return acc
    },
    { total: 0, equity: 0, etf: 0, forex: 0, crypto: 0 },
  )

  const statusSummary = { current: 0, due: 0, stale: 0, marketClosed: 0, noObservation: 0 }
  for (const row of rows) {
    if (row.data_status === 'current') statusSummary.current += 1
    else if (row.data_status === 'due') statusSummary.due += 1
    else if (row.data_status === 'stale') statusSummary.stale += 1
    else if (row.data_status === 'market_closed') statusSummary.marketClosed += 1
    else statusSummary.noObservation += 1
  }

  const latestObservationAt = rows
    .map((row) => row.observed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null

  return { rows, counts, statusSummary, latestObservationAt }
}

export async function getMarketDetail(symbol: string) {
  const supabase = getSupabase()
  const instrumentRes = await supabase
    .from('instruments')
    .select('id,symbol,instrument_name,exchange_code,asset_type,currency_code,is_active')
    .eq('symbol', symbol)
    .maybeSingle()

  if (instrumentRes.error) throw instrumentRes.error
  if (!instrumentRes.data) return null

  const [observationsRes, latestRun] = await Promise.all([
    supabase
      .from('market_observations')
      .select('id,open,high,low,close,volume,currency_code,observed_at,loaded_at')
      .eq('instrument_id', instrumentRes.data.id)
      .order('observed_at', { ascending: false })
      .limit(200),
    getLatestProductionMarketRun(),
  ])

  if (observationsRes.error) throw observationsRes.error

  let latestAssessment = null
  if (latestRun) {
    const assessmentRes = await supabase
      .from('gpt_market_assessments')
      .select('assessment_id,assessment_date,rating,confidence,score,summary')
      .eq('instrument_id', instrumentRes.data.id)
      .eq('run_id', latestRun.run_id)
      .maybeSingle()

    if (assessmentRes.error) throw assessmentRes.error
    latestAssessment = assessmentRes.data ?? null
  }

  return {
    instrument: instrumentRes.data,
    observations: observationsRes.data ?? [],
    latestAssessment,
  }
}

export async function getAssessmentsData() {
  const supabase = getSupabase()
  const latestRun = await getLatestProductionMarketRun()

  if (!latestRun) {
    return {
      rows: [] as AssessmentRow[],
      latestDate: null,
      distribution: [] as { rating: string; count: number; avgConfidence: number | null }[],
      averageConfidence: null,
      highest: [] as AssessmentRow[],
      lowest: [] as AssessmentRow[],
      latestRun: null,
    }
  }

  const assessmentsRes = await supabase
    .from('gpt_market_assessments')
    .select('assessment_id,instrument_id,assessment_date,rating,confidence,score,summary,bull_case,bear_case,technical_view,macro_view,valuation_view,key_catalysts,key_risks,evidence_summary,created_at,instruments(symbol,instrument_name)')
    .eq('run_id', latestRun.run_id)
    .order('confidence', { ascending: false })
    .limit(500)

  if (assessmentsRes.error) throw assessmentsRes.error

  const rows: AssessmentRow[] = (assessmentsRes.data ?? []).map((row) => {
    const instrument = (row as unknown as { instruments: { symbol: string; instrument_name: string } | null }).instruments
    return {
      assessment_id: row.assessment_id,
      instrument_id: row.instrument_id,
      symbol: instrument?.symbol ?? 'Unknown',
      instrument_name: instrument?.instrument_name ?? 'Unknown instrument',
      assessment_date: row.assessment_date,
      rating: row.rating,
      confidence: row.confidence,
      score: row.score,
      summary: row.summary,
      bull_case: row.bull_case,
      bear_case: row.bear_case,
      technical_view: row.technical_view,
      macro_view: row.macro_view,
      valuation_view: row.valuation_view,
      key_catalysts: row.key_catalysts,
      key_risks: row.key_risks,
      evidence_summary: row.evidence_summary,
      created_at: row.created_at,
    }
  })

  const latestDate = rows[0]?.assessment_date ?? null
  const ratingMap = new Map<string, { rating: string; count: number; totalConfidence: number; confidenceCount: number }>()
  for (const row of rows) {
    const item = ratingMap.get(row.rating) ?? { rating: row.rating, count: 0, totalConfidence: 0, confidenceCount: 0 }
    item.count += 1
    if (row.confidence !== null) {
      item.totalConfidence += row.confidence
      item.confidenceCount += 1
    }
    ratingMap.set(row.rating, item)
  }
  const distribution = [...ratingMap.values()].map((item) => ({
    rating: item.rating,
    count: item.count,
    avgConfidence: item.confidenceCount ? item.totalConfidence / item.confidenceCount : null,
  }))

  const confidences = rows.map((row) => row.confidence).filter((value): value is number => value !== null)
  const averageConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null
  const highest = [...rows].sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1) || (b.score ?? -1) - (a.score ?? -1)).slice(0, 5)
  const lowest = [...rows].sort((a, b) => (a.confidence ?? 101) - (b.confidence ?? 101) || (a.score ?? 101) - (b.score ?? 101)).slice(0, 5)

  return { rows, latestDate, distribution, averageConfidence, highest, lowest, latestRun }
}

export async function getAssessmentDetail(symbol: string) {
  const supabase = getSupabase()
  const instrumentRes = await supabase.from('instruments').select('id,symbol,instrument_name,asset_type,exchange_code').eq('symbol', symbol).maybeSingle()
  if (instrumentRes.error) throw instrumentRes.error
  if (!instrumentRes.data) return null

  const latestRun = await getLatestProductionMarketRun()
  if (!latestRun) return { instrument: instrumentRes.data, assessment: null, evidence: [] }

  const assessmentRes = await supabase
    .from('gpt_market_assessments')
    .select('assessment_id,instrument_id,assessment_date,rating,confidence,score,summary,bull_case,bear_case,technical_view,macro_view,valuation_view,key_catalysts,key_risks,evidence_summary,created_at')
    .eq('instrument_id', instrumentRes.data.id)
    .eq('run_id', latestRun.run_id)
    .maybeSingle()

  if (assessmentRes.error) throw assessmentRes.error
  if (!assessmentRes.data) return { instrument: instrumentRes.data, assessment: null, evidence: [] }

  const evidenceRes = await supabase
    .from('gpt_market_evidence')
    .select('evidence_id,evidence_type,source_name,source_url,evidence_text,relevance_score,confidence,created_at')
    .eq('assessment_id', assessmentRes.data.assessment_id)
    .order('relevance_score', { ascending: false })

  if (evidenceRes.error) throw evidenceRes.error
  return { instrument: instrumentRes.data, assessment: assessmentRes.data, evidence: evidenceRes.data ?? [] }
}

export async function getStrategiesData() {
  const supabase = getSupabase()
  const [strategiesRes, testsRes, treeRes] = await Promise.all([
    supabase.from('trading_strategies').select('id,strategy_code,strategy_name,description,status,created_at,updated_at').order('updated_at', { ascending: false }),
    supabase.from('trading_test_runs').select('id,strategy_id,run_name,test_type,period_start,period_end,instrument_count,trade_count,net_profit,return_pct,win_rate_pct,profit_factor,expectancy,max_drawdown_pct,sharpe_ratio,out_of_sample_return_pct,completed_at,created_at').order('created_at', { ascending: false }),
    supabase.from('trading_decision_trees').select('id,tree_code,tree_name,description,version,is_system_template,is_active').eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (strategiesRes.error) throw strategiesRes.error
  if (testsRes.error) throw testsRes.error
  if (treeRes.error) throw treeRes.error

  let nodes: Record<string, unknown>[] = []
  let edges: Record<string, unknown>[] = []
  if (treeRes.data) {
    const [nodesRes, edgesRes] = await Promise.all([
      supabase.from('trading_decision_nodes').select('id,tree_id,node_code,node_type,title,description,metric_code,comparison_operator,threshold_value,outcome_code,outcome_status,sort_order').eq('tree_id', treeRes.data.id).order('sort_order'),
      supabase.from('trading_decision_edges').select('id,tree_id,from_node_id,to_node_id,result_value,edge_label,sort_order').eq('tree_id', treeRes.data.id).order('sort_order'),
    ])
    if (nodesRes.error) throw nodesRes.error
    if (edgesRes.error) throw edgesRes.error
    nodes = (nodesRes.data ?? []) as Record<string, unknown>[]
    edges = (edgesRes.data ?? []) as Record<string, unknown>[]
  }

  return {
    strategies: strategiesRes.data ?? [],
    tests: testsRes.data ?? [],
    tree: treeRes.data ?? null,
    nodes,
    edges,
  }
}