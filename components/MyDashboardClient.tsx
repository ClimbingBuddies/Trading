'use client'

import Link from 'next/link'
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { parseHoldingsCsv, type HoldingsCsvValue } from '@/lib/portfolio-holdings-csv.mjs'
import styles from './MyDashboardClient.module.css'

const tabs = [
  { key: 'today', label: 'Today' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'watchlists', label: 'Watchlists' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'portfolio-health', label: 'Portfolio Health' },
  { key: 'decision-lab', label: 'Decision Lab' },
] as const

const DEFAULT_BASE_CURRENCY = 'AUD'
const DEFAULT_HORIZON = 20 as const
const DEFAULT_RISK = 'unspecified' as const
const PAGE_SIZE = 500
const WATCHLIST_ID_BATCH_SIZE = 100

type TabKey = (typeof tabs)[number]['key']
type Preferences = {
  owner_user_id: string
  base_currency: string
  default_horizon_sessions: 5 | 20 | 60
  risk_preference: 'unspecified' | 'conservative' | 'balanced' | 'growth'
  updated_at: string
}
type DashboardCounts = { watchlists: number; watchedInstruments: number; interests: number }
type Portfolio = {
  id: string
  name: string
  portfolio_kind: 'manual' | 'paper'
  base_currency: string
  status: 'active' | 'archived'
  updated_at: string
}
type InstrumentOption = { id: string; symbol: string; instrument_name: string; currency_code: string | null; exchange_code: string }
type PortfolioPosition = {
  id: string
  portfolio_id: string
  instrument_id: string
  quantity: number
  average_cost_per_unit: number | null
  cost_currency: string
  position_source: 'manual' | 'paper_decision'
  source_decision_id: string | null
  updated_at: string
}
type PrivateDataState = 'idle' | 'loading' | 'ready' | 'error'
type PortfolioHealthSnapshot = {
  id: string
  portfolio_id: string
  source_cutoff: string
  evaluated_at: string
  total_value: number | string | null
  base_currency: string
  measures: Record<string, unknown>
  summary_status: 'INCOMPLETE_DATA' | 'NEEDS_REVIEW' | 'HEALTHY'
  completeness_pct: number | string
  completeness_reasons: string[]
  methodology_version: string
  source_hash: string
}
type PortfolioHealthState = 'idle' | 'loading' | 'ready' | 'error'
type PortfolioHealthErrorAction = 'load' | 'refresh'
type RecommendationSource = {
  recommendation_id: string
  source_family: 'MARKET_AI' | 'TECHNICAL' | 'OPPORTUNITY' | 'EXTERNAL_FACT'
  source_table: string
  source_record_key: string
  source_cutoff: string
  methodology_version: string
  relevance: string
  canonical_source_url: string | null
}
type RecommendationSnapshot = {
  id: string
  instrument_id: string
  generated_at: string
  valid_until: string | null
  category: 'INVESTIGATE' | 'MONITOR' | 'REVIEW_RISK' | 'THEME_EXPOSURE'
  intended_horizon_sessions: 5 | 20 | 60
  thesis: string
  principal_risks: string
  confidence: number | string | null
  relevance_reasons: string[]
  methodology_version: string
  model_identity: string | null
  source_cutoff: string
  source_hash: string
  quality_status: string
  quality_reasons: string[]
  sources: RecommendationSource[]
  latestEvent: 'watch' | 'dismiss' | 'feedback' | null
}
type RecommendationState = 'idle' | 'loading' | 'ready' | 'error'
type DecisionEvent = { decision_id: string; event_type: 'EXIT' | 'CANCEL' | 'NOTE' | 'REVIEW'; event_at: string }
type PersonalDecision = {
  id: string
  instrument_id: string
  source_type: 'AI_SIGNAL' | 'USER_PAPER'
  source_action: string
  action: 'BUY' | 'WATCH' | 'HOLD' | 'PASS' | 'AVOID'
  horizon_sessions: 5 | 20 | 60
  decision_at: string
  source_table: 'gpt_market_assessments' | 'user_action_snapshot'
  source_record_key: string
  source_hash: string
  source_cutoff: string
  entry_rule: 'NEXT_DAILY_CLOSE'
  benchmark_mode: 'NONE' | 'OWNER_SELECTED' | 'APPROVED_MAPPING'
  notional_amount: number | string
  base_currency: string
  instrument_currency: string
  calculation_version: string
  events: DecisionEvent[]
}
type DecisionState = 'idle' | 'loading' | 'ready' | 'error'
type CsvPreviewRow = {
  line: number
  value: HoldingsCsvValue
  instrument: InstrumentOption
  existing: PortfolioPosition | null
  warnings: string[]
}
type CsvPreview = { fileName: string; revision: string; rows: CsvPreviewRow[]; errors: string[] }

const evidenceReasonLabels: Record<string, (count: number) => string> = {
  MISSING_PRICE: (count) => `Current market price unavailable for ${count} ${count === 1 ? 'holding' : 'holdings'}.`,
  MISSING_THEME_MAPPING_EVIDENCE: (count) => `Opportunity-theme mapping unavailable for ${count} ${count === 1 ? 'holding' : 'holdings'}.`,
  MISSING_ASSET_TYPE: (count) => `Asset classification unavailable for ${count} ${count === 1 ? 'holding' : 'holdings'}.`,
  MISSING_INSTRUMENT_CURRENCY: (count) => `Instrument currency unavailable for ${count} ${count === 1 ? 'holding' : 'holdings'}.`,
  MISSING_FX: (count) => `Required currency conversion evidence unavailable for ${count} ${count === 1 ? 'holding' : 'holdings'}.`,
  MISSING_ISSUER_MAPPING: (count) => `Issuer mapping unavailable for ${count} ${count === 1 ? 'holding' : 'holdings'}.`,
  MISSING_FRESHNESS: (count) => `Market-session freshness evidence unavailable for ${count} ${count === 1 ? 'holding' : 'holdings'}.`,
  INCOMPLETE_COST_BASIS: () => 'Cost-basis evidence is incomplete.',
  NO_POSITIONS: () => 'No positions were available at this snapshot cutoff.',
}

function summariseEvidenceReasons(reasons: string[]) {
  const counts = new Map<string, number>()
  for (const reason of reasons) {
    const code = reason.split(':', 1)[0]
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()].map(([code, count]) => evidenceReasonLabels[code]?.(count) ?? `${code.toLowerCase().replaceAll('_', ' ')} (${count}).`)
}

function permanentUser(user: User | null | undefined) {
  return user && !user.is_anonymous ? user : null
}

function validTab(value: string | null): TabKey {
  return tabs.some((tab) => tab.key === value) ? (value as TabKey) : 'today'
}

function validPortfolioHealthSnapshot(value: unknown): value is PortfolioHealthSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const snapshot = value as Partial<PortfolioHealthSnapshot>
  const totalValue = snapshot.total_value === null ? null : Number(snapshot.total_value)
  const completeness = Number(snapshot.completeness_pct)
  return typeof snapshot.id === 'string'
    && typeof snapshot.portfolio_id === 'string'
    && typeof snapshot.source_cutoff === 'string'
    && Number.isFinite(Date.parse(snapshot.source_cutoff))
    && typeof snapshot.evaluated_at === 'string'
    && Number.isFinite(Date.parse(snapshot.evaluated_at))
    && (totalValue === null || (Number.isFinite(totalValue) && totalValue >= 0))
    && typeof snapshot.base_currency === 'string'
    && /^[A-Z]{3}$/.test(snapshot.base_currency)
    && !!snapshot.measures
    && typeof snapshot.measures === 'object'
    && !Array.isArray(snapshot.measures)
    && ['INCOMPLETE_DATA', 'NEEDS_REVIEW', 'HEALTHY'].includes(snapshot.summary_status ?? '')
    && Number.isFinite(completeness)
    && completeness >= 0
    && completeness <= 100
    && Array.isArray(snapshot.completeness_reasons)
    && snapshot.completeness_reasons.every((reason) => typeof reason === 'string')
    && typeof snapshot.methodology_version === 'string'
    && snapshot.methodology_version.length > 0
    && typeof snapshot.source_hash === 'string'
    && snapshot.source_hash.length > 0
}

function validRecommendationSnapshot(value: unknown): value is Omit<RecommendationSnapshot, 'sources' | 'latestEvent'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const snapshot = value as Partial<RecommendationSnapshot>
  const confidence = snapshot.confidence === null ? null : Number(snapshot.confidence)
  return typeof snapshot.id === 'string'
    && typeof snapshot.instrument_id === 'string'
    && typeof snapshot.generated_at === 'string'
    && Number.isFinite(Date.parse(snapshot.generated_at))
    && (snapshot.valid_until === null || (typeof snapshot.valid_until === 'string' && Number.isFinite(Date.parse(snapshot.valid_until))))
    && ['INVESTIGATE', 'MONITOR', 'REVIEW_RISK', 'THEME_EXPOSURE'].includes(snapshot.category ?? '')
    && [5, 20, 60].includes(snapshot.intended_horizon_sessions ?? 0)
    && typeof snapshot.thesis === 'string' && snapshot.thesis.trim().length > 0
    && typeof snapshot.principal_risks === 'string' && snapshot.principal_risks.trim().length > 0
    && (confidence === null || (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1))
    && Array.isArray(snapshot.relevance_reasons) && snapshot.relevance_reasons.every((reason) => typeof reason === 'string')
    && typeof snapshot.methodology_version === 'string' && snapshot.methodology_version.length > 0
    && typeof snapshot.source_cutoff === 'string' && Number.isFinite(Date.parse(snapshot.source_cutoff))
    && Date.parse(snapshot.source_cutoff) <= Date.parse(snapshot.generated_at)
    && typeof snapshot.source_hash === 'string' && snapshot.source_hash.length > 0
    && typeof snapshot.quality_status === 'string' && snapshot.quality_status.length > 0
    && Array.isArray(snapshot.quality_reasons) && snapshot.quality_reasons.every((reason) => typeof reason === 'string')
}

function validRecommendationSource(value: unknown, snapshotsById: Map<string, Omit<RecommendationSnapshot, 'sources' | 'latestEvent'>>): value is RecommendationSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const source = value as Partial<RecommendationSource>
  const snapshot = typeof source.recommendation_id === 'string' ? snapshotsById.get(source.recommendation_id) : undefined
  return !!snapshot
    && ['MARKET_AI', 'TECHNICAL', 'OPPORTUNITY', 'EXTERNAL_FACT'].includes(source.source_family ?? '')
    && typeof source.source_table === 'string' && source.source_table.trim().length > 0
    && typeof source.source_record_key === 'string' && source.source_record_key.trim().length > 0
    && typeof source.source_cutoff === 'string' && Number.isFinite(Date.parse(source.source_cutoff))
    && Date.parse(source.source_cutoff) <= Date.parse(snapshot.source_cutoff)
    && typeof source.methodology_version === 'string' && source.methodology_version.trim().length > 0
    && typeof source.relevance === 'string' && source.relevance.trim().length > 0
    && (source.canonical_source_url === null || (typeof source.canonical_source_url === 'string' && /^https:\/\//.test(source.canonical_source_url)))
}

function validPersonalDecision(value: unknown): value is Omit<PersonalDecision, 'events'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const decision = value as Partial<PersonalDecision>
  return typeof decision.id === 'string'
    && typeof decision.instrument_id === 'string'
    && ['AI_SIGNAL', 'USER_PAPER'].includes(decision.source_type ?? '')
    && typeof decision.source_action === 'string' && decision.source_action.trim().length > 0
    && ['BUY', 'WATCH', 'HOLD', 'PASS', 'AVOID'].includes(decision.action ?? '')
    && [5, 20, 60].includes(decision.horizon_sessions ?? 0)
    && typeof decision.decision_at === 'string' && Number.isFinite(Date.parse(decision.decision_at))
    && ['gpt_market_assessments', 'user_action_snapshot'].includes(decision.source_table ?? '')
    && typeof decision.source_record_key === 'string' && decision.source_record_key.length > 0
    && typeof decision.source_hash === 'string' && decision.source_hash.length > 0
    && typeof decision.source_cutoff === 'string' && Number.isFinite(Date.parse(decision.source_cutoff))
    && Date.parse(decision.source_cutoff) <= Date.parse(decision.decision_at)
    && decision.entry_rule === 'NEXT_DAILY_CLOSE'
    && ['NONE', 'OWNER_SELECTED', 'APPROVED_MAPPING'].includes(decision.benchmark_mode ?? '')
    && Number.isFinite(Number(decision.notional_amount)) && Number(decision.notional_amount) > 0
    && typeof decision.base_currency === 'string' && /^[A-Z]{3}$/.test(decision.base_currency.trim())
    && typeof decision.instrument_currency === 'string' && /^[A-Z]{3}$/.test(decision.instrument_currency.trim())
    && typeof decision.calculation_version === 'string' && decision.calculation_version.length > 0
}

export default function MyDashboardClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedTab = validTab(searchParams.get('tab'))
  const activeOwnerRef = useRef<string | null>(null)
  const loadGenerationRef = useRef(0)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [privateDataState, setPrivateDataState] = useState<PrivateDataState>('idle')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [counts, setCounts] = useState<DashboardCounts | null>(null)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [portfolioName, setPortfolioName] = useState('')
  const [portfolioKind, setPortfolioKind] = useState<Portfolio['portfolio_kind']>('manual')
  const [portfolioCurrency, setPortfolioCurrency] = useState(DEFAULT_BASE_CURRENCY)
  const [instruments, setInstruments] = useState<InstrumentOption[]>([])
  const [positionPortfolioId, setPositionPortfolioId] = useState('')
  const [positionInstrumentId, setPositionInstrumentId] = useState('')
  const [positionQuantity, setPositionQuantity] = useState('')
  const [positionCost, setPositionCost] = useState('')
  const [positionCurrency, setPositionCurrency] = useState(DEFAULT_BASE_CURRENCY)
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [healthSnapshots, setHealthSnapshots] = useState<PortfolioHealthSnapshot[]>([])
  const [healthPortfolioId, setHealthPortfolioId] = useState('')
  const [healthState, setHealthState] = useState<PortfolioHealthState>('idle')
  const [healthError, setHealthError] = useState('')
  const [healthErrorAction, setHealthErrorAction] = useState<PortfolioHealthErrorAction>('load')
  const [recommendations, setRecommendations] = useState<RecommendationSnapshot[]>([])
  const [recommendationState, setRecommendationState] = useState<RecommendationState>('idle')
  const [recommendationError, setRecommendationError] = useState('')
  const [recommendationBusyId, setRecommendationBusyId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<PersonalDecision[]>([])
  const [decisionState, setDecisionState] = useState<DecisionState>('idle')
  const [decisionError, setDecisionError] = useState('')
  const [baseCurrency, setBaseCurrency] = useState(DEFAULT_BASE_CURRENCY)
  const [horizon, setHorizon] = useState<5 | 20 | 60>(DEFAULT_HORIZON)
  const [risk, setRisk] = useState<Preferences['risk_preference']>(DEFAULT_RISK)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [csvPortfolioId, setCsvPortfolioId] = useState('')
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvMessage, setCsvMessage] = useState('')

  const clearPrivateState = useCallback((ownerId: string | null) => {
    activeOwnerRef.current = ownerId
    loadGenerationRef.current += 1
    setPreferences(null)
    setCounts(null)
    setPortfolios([])
    setPortfolioName('')
    setPortfolioKind('manual')
    setPortfolioCurrency(DEFAULT_BASE_CURRENCY)
    setInstruments([])
    setPositionPortfolioId('')
    setPositionInstrumentId('')
    setPositionQuantity('')
    setPositionCost('')
    setPositionCurrency(DEFAULT_BASE_CURRENCY)
    setCsvPortfolioId('')
    setCsvPreview(null)
    setCsvBusy(false)
    setCsvMessage('')
    setPositions([])
    setHealthSnapshots([])
    setHealthPortfolioId('')
    setHealthState('idle')
    setHealthError('')
    setHealthErrorAction('load')
    setRecommendations([])
    setRecommendationState('idle')
    setRecommendationError('')
    setRecommendationBusyId(null)
    setDecisions([])
    setDecisionState('idle')
    setDecisionError('')
    setBaseCurrency(DEFAULT_BASE_CURRENCY)
    setHorizon(DEFAULT_HORIZON)
    setRisk(DEFAULT_RISK)
    setPrivateDataState('idle')
    setLoading(false)
    setError('')
    setStatus('')
  }, [])

  const loadPrivateData = useCallback(async (ownerId: string) => {
    activeOwnerRef.current = ownerId
    const loadGeneration = ++loadGenerationRef.current
    const isCurrentLoad = () => activeOwnerRef.current === ownerId && loadGenerationRef.current === loadGeneration

    setLoading(true)
    setPrivateDataState('loading')
    setHealthState('loading')
    setHealthError('')
    setHealthErrorAction('load')
    setCounts(null)
    setError('')
    try {
      const supabase = getBrowserSupabase()
      const [preferencesResult, watchlistsCountResult, interestsCountResult, portfoliosResult, instrumentsResult, positionsResult] = await Promise.all([
        supabase
          .from('user_market_preferences')
          .select('owner_user_id,base_currency,default_horizon_sessions,risk_preference,updated_at')
          .eq('owner_user_id', ownerId)
          .maybeSingle(),
        supabase.from('watchlists').select('id', { count: 'exact', head: true }).eq('owner_user_id', ownerId),
        supabase.from('user_market_interests').select('id', { count: 'exact', head: true }).eq('owner_user_id', ownerId),
        supabase
          .from('portfolios')
          .select('id,name,portfolio_kind,base_currency,status,updated_at')
          .eq('owner_user_id', ownerId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('instruments')
          .select('id,symbol,instrument_name,currency_code,exchange_code')
          .eq('is_active', true)
          .order('symbol', { ascending: true })
          .limit(500),
        supabase
          .from('portfolio_positions')
          .select('id,portfolio_id,instrument_id,quantity,average_cost_per_unit,cost_currency,position_source,source_decision_id,updated_at')
          .eq('owner_user_id', ownerId)
          .order('updated_at', { ascending: false }),
      ])
      if (!isCurrentLoad()) return
      if (preferencesResult.error) throw preferencesResult.error
      if (watchlistsCountResult.error) throw watchlistsCountResult.error
      if (interestsCountResult.error) throw interestsCountResult.error
      if (portfoliosResult.error) throw portfoliosResult.error
      if (instrumentsResult.error) throw instrumentsResult.error
      if (positionsResult.error) throw positionsResult.error
      if (watchlistsCountResult.count === null || interestsCountResult.count === null) {
        throw new Error('Exact private dashboard counts were unavailable.')
      }

      const listIds: string[] = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const pageResult = await supabase
          .from('watchlists')
          .select('id')
          .eq('owner_user_id', ownerId)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)
        if (!isCurrentLoad()) return
        if (pageResult.error) throw pageResult.error
        const rows = pageResult.data ?? []
        listIds.push(...rows.map((row) => row.id))
        if (rows.length < PAGE_SIZE) break
      }

      const watchedInstrumentIds = new Set<string>()
      for (let batchStart = 0; batchStart < listIds.length; batchStart += WATCHLIST_ID_BATCH_SIZE) {
        const listIdBatch = listIds.slice(batchStart, batchStart + WATCHLIST_ID_BATCH_SIZE)
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const pageResult = await supabase
            .from('watchlist_items')
            .select('watchlist_id,instrument_id')
            .in('watchlist_id', listIdBatch)
            .order('watchlist_id', { ascending: true })
            .order('instrument_id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
          if (!isCurrentLoad()) return
          if (pageResult.error) throw pageResult.error
          const rows = pageResult.data ?? []
          rows.forEach((row) => watchedInstrumentIds.add(row.instrument_id))
          if (rows.length < PAGE_SIZE) break
        }
      }

      const nextPreferences = (preferencesResult.data ?? null) as Preferences | null
      setPreferences(nextPreferences)
      setCounts({
        watchlists: watchlistsCountResult.count,
        watchedInstruments: watchedInstrumentIds.size,
        interests: interestsCountResult.count,
      })
      setPortfolios((portfoliosResult.data ?? []) as Portfolio[])
      setInstruments((instrumentsResult.data ?? []) as InstrumentOption[])
      setPositions((positionsResult.data ?? []) as PortfolioPosition[])
      const activePortfolios = ((portfoliosResult.data ?? []) as Portfolio[]).filter((portfolio) => portfolio.status === 'active')
      setHealthPortfolioId((current) => activePortfolios.some((portfolio) => portfolio.id === current) ? current : (activePortfolios[0]?.id ?? ''))
      setCsvPortfolioId((current) => activePortfolios.some((portfolio) => portfolio.id === current && portfolio.portfolio_kind === 'manual') ? current : (activePortfolios.find((portfolio) => portfolio.portfolio_kind === 'manual')?.id ?? ''))

      const snapshots: PortfolioHealthSnapshot[] = []
      try {
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const pageResult = await supabase
            .from('portfolio_health_snapshots')
            .select('id,portfolio_id,source_cutoff,evaluated_at,total_value,base_currency,measures,summary_status,completeness_pct,completeness_reasons,methodology_version,source_hash')
            .eq('owner_user_id', ownerId)
            .order('portfolio_id', { ascending: true })
            .order('source_cutoff', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
          if (!isCurrentLoad()) return
          if (pageResult.error) throw pageResult.error
          const rows = pageResult.data ?? []
          if (!rows.every(validPortfolioHealthSnapshot)) throw new Error('A persisted Portfolio Health snapshot failed response validation.')
          snapshots.push(...rows)
          if (rows.length < PAGE_SIZE) break
        }
        const latestByPortfolio = new Map<string, PortfolioHealthSnapshot>()
        snapshots.forEach((snapshot) => {
          if (!latestByPortfolio.has(snapshot.portfolio_id)) latestByPortfolio.set(snapshot.portfolio_id, snapshot)
        })
        setHealthSnapshots([...latestByPortfolio.values()])
        setHealthState('ready')
      } catch (snapshotError) {
        if (!isCurrentLoad()) return
        setHealthSnapshots([])
        setHealthState('error')
        setHealthErrorAction('load')
        setHealthError(snapshotError instanceof Error ? snapshotError.message : 'Calculated Portfolio Health could not be loaded.')
      }
      if (nextPreferences) {
        setBaseCurrency(nextPreferences.base_currency.trim())
        setHorizon(nextPreferences.default_horizon_sessions)
        setRisk(nextPreferences.risk_preference)
      } else {
        setBaseCurrency(DEFAULT_BASE_CURRENCY)
        setHorizon(DEFAULT_HORIZON)
        setRisk(DEFAULT_RISK)
      }
      setPrivateDataState('ready')

      setRecommendationState('loading')
      setRecommendationError('')
      try {
        const recommendationResult = await supabase
          .from('personal_recommendation_snapshots')
          .select('id,instrument_id,generated_at,valid_until,category,intended_horizon_sessions,thesis,principal_risks,confidence,relevance_reasons,methodology_version,model_identity,source_cutoff,source_hash,quality_status,quality_reasons')
          .eq('owner_user_id', ownerId)
          .order('generated_at', { ascending: false })
          .limit(100)
        if (!isCurrentLoad()) return
        if (recommendationResult.error) throw recommendationResult.error
        const snapshotRows = recommendationResult.data ?? []
        if (!snapshotRows.every(validRecommendationSnapshot)) throw new Error('A persisted recommendation failed response validation.')
        const recommendationIds = snapshotRows.map((row) => row.id)
        const [sourceResult, eventResult] = recommendationIds.length ? await Promise.all([
          supabase.from('personal_recommendation_sources').select('recommendation_id,source_family,source_table,source_record_key,source_cutoff,methodology_version,relevance,canonical_source_url').eq('owner_user_id', ownerId).in('recommendation_id', recommendationIds).order('source_family'),
          supabase.from('personal_recommendation_events').select('recommendation_id,event_type,event_at').eq('owner_user_id', ownerId).in('recommendation_id', recommendationIds).order('event_at', { ascending: false }),
        ]) : [{ data: [], error: null }, { data: [], error: null }]
        if (!isCurrentLoad()) return
        if (sourceResult.error) throw sourceResult.error
        if (eventResult.error) throw eventResult.error
        const snapshotsById = new Map(snapshotRows.map((snapshot) => [snapshot.id, snapshot]))
        const sourceRows = sourceResult.data ?? []
        if (!sourceRows.every((source) => validRecommendationSource(source, snapshotsById))) {
          throw new Error('Persisted recommendation provenance failed response validation.')
        }
        const sources = sourceRows as RecommendationSource[]
        const latestEvents = new Map<string, RecommendationSnapshot['latestEvent']>()
        ;(eventResult.data ?? []).forEach((event) => {
          if (!latestEvents.has(event.recommendation_id) && ['watch', 'dismiss', 'feedback'].includes(event.event_type)) {
            latestEvents.set(event.recommendation_id, event.event_type as RecommendationSnapshot['latestEvent'])
          }
        })
        const hydratedRecommendations = snapshotRows.map((snapshot) => ({
          ...snapshot,
          sources: sources.filter((source) => source.recommendation_id === snapshot.id),
          latestEvent: latestEvents.get(snapshot.id) ?? null,
        }))
        if (hydratedRecommendations.some((recommendation) => recommendation.sources.length === 0)) {
          throw new Error('A recommendation is missing its required source lineage.')
        }
        setRecommendations(hydratedRecommendations as RecommendationSnapshot[])
        setRecommendationState('ready')
      } catch (recommendationLoadError) {
        if (!isCurrentLoad()) return
        setRecommendations([])
        setRecommendationState('error')
        setRecommendationError(recommendationLoadError instanceof Error ? recommendationLoadError.message : 'Recommendations could not be loaded.')
      }

      setDecisionState('loading')
      setDecisionError('')
      try {
        const decisionResult = await supabase
          .from('personal_decisions')
          .select('id,instrument_id,source_type,source_action,action,horizon_sessions,decision_at,source_table,source_record_key,source_hash,source_cutoff,entry_rule,benchmark_mode,notional_amount,base_currency,instrument_currency,calculation_version')
          .eq('owner_user_id', ownerId)
          .order('decision_at', { ascending: false })
          .limit(200)
        if (!isCurrentLoad()) return
        if (decisionResult.error) throw decisionResult.error
        const decisionRows = decisionResult.data ?? []
        if (!decisionRows.every(validPersonalDecision)) throw new Error('A persisted decision failed response validation.')
        const decisionIds = decisionRows.map((decision) => decision.id)
        const eventResult = decisionIds.length
          ? await supabase.from('personal_decision_events').select('decision_id,event_type,event_at').eq('owner_user_id', ownerId).in('decision_id', decisionIds).order('event_at', { ascending: false })
          : { data: [], error: null }
        if (!isCurrentLoad()) return
        if (eventResult.error) throw eventResult.error
        const eventRows = (eventResult.data ?? []) as DecisionEvent[]
        if (!eventRows.every((event) => decisionIds.includes(event.decision_id) && ['EXIT', 'CANCEL', 'NOTE', 'REVIEW'].includes(event.event_type) && Number.isFinite(Date.parse(event.event_at)))) {
          throw new Error('Persisted decision event history failed response validation.')
        }
        setDecisions(decisionRows.map((decision) => ({ ...decision, events: eventRows.filter((event) => event.decision_id === decision.id) })) as PersonalDecision[])
        setDecisionState('ready')
      } catch (decisionLoadError) {
        if (!isCurrentLoad()) return
        setDecisions([])
        setDecisionState('error')
        setDecisionError(decisionLoadError instanceof Error ? decisionLoadError.message : 'Decision Lab could not be loaded.')
      }
    } catch (loadError) {
      if (!isCurrentLoad()) return
      setPreferences(null)
      setCounts(null)
      setPrivateDataState('error')
      setHealthSnapshots([])
      setHealthState('error')
      setHealthErrorAction('load')
      setHealthError('Calculated Portfolio Health is unavailable while private data cannot be loaded.')
      setError(loadError instanceof Error ? loadError.message : 'The private dashboard could not be loaded.')
    } finally {
      if (isCurrentLoad()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    let mounted = true
    let authGeneration = 0

    const applySession = (sessionUser: User | null | undefined) => {
      const resolved = permanentUser(sessionUser)
      const nextOwnerId = resolved?.id ?? null
      const ownerChanged = activeOwnerRef.current !== nextOwnerId
      if (ownerChanged) clearPrivateState(nextOwnerId)
      setUser(resolved)
      setAuthReady(true)
      if (sessionUser?.is_anonymous) {
        setError('Anonymous sessions cannot open My Dashboard. Sign in with a permanent email account.')
      }
      if (resolved && ownerChanged) void loadPrivateData(resolved.id)
    }

    const initialGeneration = ++authGeneration
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted || initialGeneration !== authGeneration) return
      if (sessionError) {
        clearPrivateState(null)
        setUser(null)
        setAuthReady(true)
        setError(sessionError.message)
        return
      }
      applySession(data.session?.user)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      authGeneration += 1
      applySession(session?.user)
    })

    return () => {
      mounted = false
      activeOwnerRef.current = null
      loadGenerationRef.current += 1
      listener.subscription.unsubscribe()
    }
  }, [clearPrivateState, loadPrivateData])

  useEffect(() => {
    if (authReady && !user) {
      router.replace('/login?next=/my-dashboard')
    }
  }, [authReady, router, user])

  const attentionItems = useMemo(() => {
    const items: Array<{ title: string; detail: string; href: string; action: string }> = []
    if (privateDataState !== 'ready' || !counts) return items
    if (!preferences) items.push({ title: 'Set your research preferences', detail: 'Choose a base currency, default horizon and optional risk style.', href: '#preferences', action: 'Set preferences' })
    if (counts.watchlists === 0) items.push({ title: 'Create your first watchlist', detail: 'Follow instruments privately before personal Opportunities are added.', href: '/watchlists', action: 'Open Watchlists' })
    if (counts.watchedInstruments === 0 && counts.watchlists > 0) items.push({ title: 'Add an instrument to a watchlist', detail: 'Today will use persisted watchlist membership; it will not invent suggestions.', href: '/watchlists', action: 'Add instrument' })
    return items
  }, [counts, preferences, privateDataState])

  function selectTab(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'today') params.delete('tab')
    else params.set('tab', key)
    router.push(params.size ? `${pathname}?${params}` : pathname)
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = tabs.length - 1
    else return
    event.preventDefault()
    selectTab(tabs[target].key)
    document.getElementById(`my-dashboard-tab-${tabs[target].key}`)?.focus()
  }

  async function signOut() {
    const { error: authError } = await getBrowserSupabase().auth.signOut()
    if (authError) setError(authError.message)
    else setStatus('Signed out. No private dashboard data is visible.')
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const ownerId = user.id
    setLoading(true)
    setError('')
    setStatus('')
    const payload = {
      owner_user_id: ownerId,
      base_currency: baseCurrency.trim().toUpperCase(),
      default_horizon_sessions: horizon,
      risk_preference: risk,
    }
    const preferenceValues = {
      base_currency: payload.base_currency,
      default_horizon_sessions: horizon,
      risk_preference: risk,
    }
    const supabase = getBrowserSupabase()
    const updateResult = await supabase
      .from('user_market_preferences')
      .update(preferenceValues)
      .eq('owner_user_id', ownerId)
      .select('owner_user_id')
      .maybeSingle()
    let writeError = updateResult.error
    if (!writeError && !updateResult.data) {
      const insertResult = await supabase.from('user_market_preferences').insert(payload)
      writeError = insertResult.error
      if (writeError?.code === '23505') {
        const retryResult = await supabase
          .from('user_market_preferences')
          .update(preferenceValues)
          .eq('owner_user_id', ownerId)
        writeError = retryResult.error
      }
    }
    if (activeOwnerRef.current !== ownerId) return
    if (writeError) setError(writeError.message)
    else {
      setStatus('Preferences saved privately.')
      await loadPrivateData(ownerId)
    }
    if (activeOwnerRef.current === ownerId) setLoading(false)
  }

  if (!authReady) {
    return <section className={styles.stateCard} aria-live="polite"><span className={styles.eyebrow}>MY DASHBOARD</span><h1>Opening your private workspace…</h1><p>Checking your secure session before requesting personal rows.</p></section>
  }

  if (!user) {
    return (
      <section className={styles.stateCard} aria-live="polite">
        <span className={styles.eyebrow}>SECURE WORKSPACE</span>
        <h1>Taking you to sign in…</h1>
        <p>You’ll return to My Dashboard after authentication.</p>
      </section>
    )
  }

  async function appendRecommendationEvent(recommendationId: string, eventType: 'watch' | 'dismiss' | 'feedback') {
    if (!permanentUser(user)) return
    setRecommendationBusyId(recommendationId)
    setRecommendationError('')
    try {
      const { error: eventError } = await getBrowserSupabase().rpc('append_personal_recommendation_event_v1', {
        p_recommendation_id: recommendationId,
        p_event_type: eventType,
        p_feedback_code: eventType === 'feedback' ? 'RELEVANCE_REVIEW' : null,
        p_feedback_note: null,
      })
      if (eventError) throw eventError
      setRecommendations((current) => current.map((recommendation) => recommendation.id === recommendationId ? { ...recommendation, latestEvent: eventType } : recommendation))
      setStatus(eventType === 'dismiss' ? 'Recommendation dismissed. Its immutable source snapshot was not changed.' : 'Feedback recorded separately from the immutable recommendation.')
    } catch (eventError) {
      setRecommendationError(eventError instanceof Error ? eventError.message : 'Recommendation feedback could not be saved.')
    } finally {
      setRecommendationBusyId(null)
    }
  }

  async function createPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const ownerId = user.id
    const name = portfolioName.trim()
    const currency = portfolioCurrency.trim().toUpperCase()
    if (!name || name.length > 120 || !/^[A-Z]{3}$/.test(currency)) {
      setError('Enter a portfolio name and a valid three-letter currency code.')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    const { data, error: insertError } = await getBrowserSupabase()
      .from('portfolios')
      .insert({ owner_user_id: ownerId, name, portfolio_kind: portfolioKind, base_currency: currency })
      .select('id,name,portfolio_kind,base_currency,status,updated_at')
      .single()
    if (activeOwnerRef.current !== ownerId) return
    if (insertError) {
      setError(insertError.code === '23505' ? 'An active portfolio with this name already exists.' : insertError.message)
    } else {
      setPortfolios((current) => [data as Portfolio, ...current])
      setPositionPortfolioId(data.id)
      setHealthPortfolioId(data.id)
      setPortfolioName('')
      setPortfolioCurrency(currency)
      setStatus('Portfolio created privately.')
    }
    if (activeOwnerRef.current === ownerId) setLoading(false)
  }

  async function createPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const ownerId = user.id
    const quantity = Number(positionQuantity)
    const averageCost = positionCost.trim() ? Number(positionCost) : null
    const currency = positionCurrency.trim().toUpperCase()
    if (!portfolios.some((portfolio) => portfolio.id === positionPortfolioId) || !instruments.some((instrument) => instrument.id === positionInstrumentId)) {
      setError('Choose one of your portfolios and a listed instrument.')
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || (averageCost !== null && (!Number.isFinite(averageCost) || averageCost < 0)) || !/^[A-Z]{3}$/.test(currency)) {
      setError('Quantity must be positive; cost must be zero or greater when supplied; currency must use three letters.')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    const { data, error: insertError } = await getBrowserSupabase()
      .from('portfolio_positions')
      .insert({
        owner_user_id: ownerId,
        portfolio_id: positionPortfolioId,
        instrument_id: positionInstrumentId,
        quantity,
        average_cost_per_unit: averageCost,
        cost_currency: currency,
        position_source: 'manual',
      })
      .select('id,portfolio_id,instrument_id,quantity,average_cost_per_unit,cost_currency,position_source,updated_at')
      .single()
    if (activeOwnerRef.current !== ownerId) return
    if (insertError) {
      setError(insertError.code === '23505' ? 'This instrument already has a position in the selected portfolio.' : insertError.message)
    } else {
      setPositions((current) => [data as PortfolioPosition, ...current])
      setPositionQuantity('')
      setPositionCost('')
      setStatus(averageCost === null ? 'Position saved with cost basis marked incomplete.' : 'Position saved privately.')
    }
    if (activeOwnerRef.current === ownerId) setLoading(false)
  }

  function clearCsvPreview(message = '') {
    setCsvPreview(null)
    setCsvMessage(message)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  async function previewCsvFile(file: File | undefined) {
    clearCsvPreview()
    const currentUser = permanentUser((await getBrowserSupabase().auth.getUser()).data.user)
    if (!currentUser || currentUser.id !== activeOwnerRef.current) {
      setCsvMessage('Your permanent authenticated session is required to preview a private import.')
      return
    }
    const portfolio = portfolios.find((item) => item.id === csvPortfolioId && item.status === 'active' && item.portfolio_kind === 'manual')
    if (!portfolio || !file) {
      setCsvMessage(file ? 'Choose one of your active manual portfolios.' : '')
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvMessage('Choose a .csv file using the canonical seven-column format.')
      return
    }
    setCsvBusy(true)
    try {
      const parsed = parseHoldingsCsv(new Uint8Array(await file.arrayBuffer()))
      if (!parsed.ok) {
        setCsvPreview({ fileName: file.name, revision: '', rows: [], errors: parsed.errors.map((issue) => `Line ${issue.line ?? 'file'}: ${issue.message} [${issue.code}]`) })
        return
      }
      const errors: string[] = []
      const rows: CsvPreviewRow[] = []
      if (parsed.rows.length === 0) errors.push('The CSV has no data rows. [NO_DATA_ROWS]')
      for (const parsedRow of parsed.rows) {
        if (!parsedRow.value) continue
        const matches = instruments.filter((instrument) => instrument.symbol.toUpperCase() === parsedRow.value?.symbol && instrument.exchange_code.toUpperCase() === parsedRow.value?.exchangeCode)
        if (matches.length !== 1) {
          errors.push(`Line ${parsedRow.line}: ${matches.length ? 'Instrument match is ambiguous' : 'No active instrument matches'} ${parsedRow.value.symbol} on ${parsedRow.value.exchangeCode}. [${matches.length ? 'AMBIGUOUS_INSTRUMENT' : 'UNKNOWN_INSTRUMENT'}]`)
          continue
        }
        const existing = positions.find((position) => position.portfolio_id === portfolio.id && position.instrument_id === matches[0].id) ?? null
        const warnings = [existing ? 'Will replace the current holding.' : 'Will add a new holding.']
        if (parsedRow.value.averageCostPerUnit === null) warnings.push('Cost basis will remain incomplete.')
        if (parsedRow.value.acquiredAt === null) warnings.push('Acquisition date will remain incomplete.')
        rows.push({ line: parsedRow.line, value: parsedRow.value, instrument: matches[0], existing, warnings })
      }
      const revisionInput = JSON.stringify({ portfolioId: portfolio.id, rows: rows.map((row) => ({ ...row.value, instrumentId: row.instrument.id, positionId: row.existing?.id ?? null, positionUpdatedAt: row.existing?.updated_at ?? null })) })
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(revisionInput))
      const revision = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      setCsvPreview({ fileName: file.name, revision, rows, errors })
    } catch (previewError) {
      setCsvMessage(previewError instanceof Error ? previewError.message : 'The CSV preview could not be created.')
    } finally {
      setCsvBusy(false)
    }
  }

  async function confirmCsvImport() {
    if (!csvPreview || csvPreview.errors.length || csvPreview.rows.length === 0) return
    const preview = csvPreview
    setCsvBusy(true)
    setCsvMessage('')
    const supabase = getBrowserSupabase()
    const currentUser = permanentUser((await supabase.auth.getUser()).data.user)
    if (!currentUser || currentUser.id !== activeOwnerRef.current) {
      setCsvBusy(false)
      setCsvMessage('Your permanent authenticated session is required to import holdings.')
      return
    }
    const rows = preview.rows.map((row) => ({
      symbol: row.value.symbol,
      exchange_code: row.value.exchangeCode,
      quantity: row.value.quantity,
      average_cost_per_unit: row.value.averageCostPerUnit,
      cost_currency: row.value.costCurrency,
      acquired_at: row.value.acquiredAt,
      notes: row.value.notes,
      expected_instrument_id: row.instrument.id,
      expected_position_id: row.existing?.id ?? null,
      expected_position_updated_at: row.existing?.updated_at ?? null,
    }))
    const { data, error: importError } = await supabase.rpc('import_portfolio_holdings_csv_v1', { p_portfolio_id: csvPortfolioId, p_preview_revision: preview.revision, p_rows: rows })
    if (activeOwnerRef.current !== currentUser.id) {
      setCsvBusy(false)
      return
    }
    if (importError) {
      setCsvMessage(importError.message.includes('PREVIEW_STALE') ? 'The portfolio changed after preview. Create a fresh preview before importing.' : `Import failed without saving any rows: ${importError.message}`)
      setCsvBusy(false)
      return
    }
    const result = Array.isArray(data) ? data[0] : data
    clearCsvPreview()
    await loadPrivateData(currentUser.id)
    setStatus(`Holdings imported privately: ${Number(result?.inserted_count ?? 0)} added, ${Number(result?.updated_count ?? 0)} updated.`)
    setCsvBusy(false)
  }

  async function refreshPortfolioHealth() {
    if (!user) return
    const ownerId = user.id
    const loadGeneration = loadGenerationRef.current
    if (!portfolios.some((portfolio) => portfolio.id === healthPortfolioId && portfolio.status === 'active')) {
      setHealthState('error')
      setHealthErrorAction('refresh')
      setHealthError('Choose one of your active private portfolios before refreshing Portfolio Health.')
      return
    }
    setHealthState('loading')
    setHealthError('')
    setHealthErrorAction('refresh')
    setStatus('')
    const { data, error: invokeError } = await getBrowserSupabase().functions.invoke('refresh-portfolio-health', {
      body: { portfolio_id: healthPortfolioId, source_cutoff: new Date().toISOString() },
    })
    if (activeOwnerRef.current !== ownerId || loadGenerationRef.current !== loadGeneration) return
    if (invokeError || !data?.snapshot) {
      setHealthState('error')
      setHealthErrorAction('refresh')
      setHealthError(invokeError?.message ?? 'The trusted Portfolio Health refresh returned no persisted snapshot.')
      return
    }
    const snapshot = data.snapshot
    if (!validPortfolioHealthSnapshot(snapshot) || snapshot.portfolio_id !== healthPortfolioId) {
      setHealthState('error')
      setHealthErrorAction('refresh')
      setHealthError('The refresh response did not match the selected private portfolio.')
      return
    }
    setHealthSnapshots((current) => [snapshot, ...current.filter((item) => item.portfolio_id !== snapshot.portfolio_id)])
    setHealthState('ready')
    setStatus('Portfolio Health refreshed from persisted source evidence.')
  }

  const selectedHealthSnapshot = healthSnapshots.find((snapshot) => snapshot.portfolio_id === healthPortfolioId) ?? null
  const selectedHealthPortfolio = portfolios.find((portfolio) => portfolio.id === healthPortfolioId) ?? null
  const totalValue = selectedHealthSnapshot?.total_value === null || selectedHealthSnapshot?.total_value === undefined
    ? null
    : Number(selectedHealthSnapshot.total_value)
  const completeness = selectedHealthSnapshot ? Number(selectedHealthSnapshot.completeness_pct) : null

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>PERSONAL MARKET WORKSPACE</span><h1>My Dashboard</h1><p className={styles.lede}>Your private research overview. Stored data, source evidence and later inference stay distinct.</p></div>
        <div className={styles.accountActions}>
          <span>Signed in as <strong>{user.email ?? 'authenticated user'}</strong></span>
          <button className={styles.secondaryButton} onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className={styles.tabScroller}>
        <div className={styles.tabs} role="tablist" aria-label="My Dashboard sections">
          {tabs.map((tab, index) => <button id={`my-dashboard-tab-${tab.key}`} key={tab.key} type="button" role="tab" aria-selected={selectedTab === tab.key} aria-controls={`my-dashboard-panel-${tab.key}`} tabIndex={selectedTab === tab.key ? 0 : -1} className={selectedTab === tab.key ? styles.activeTab : styles.tab} onClick={() => selectTab(tab.key)} onKeyDown={(event) => onTabKeyDown(event, index)}>{tab.label}</button>)}
        </div>
      </div>

      {error && privateDataState !== 'error' && <div className={styles.error} role="alert"><strong>Dashboard error</strong><span>{error}</span></div>}
      {status && <div className={styles.status} role="status">{status}</div>}

      <section id={`my-dashboard-panel-${selectedTab}`} role="tabpanel" aria-labelledby={`my-dashboard-tab-${selectedTab}`} tabIndex={0}>
        {privateDataState === 'error' ? (
          <article className={styles.stateCard} aria-live="assertive">
            <span className={styles.eyebrow}>PRIVATE DATA UNAVAILABLE</span>
            <h2>My Dashboard could not be loaded</h2>
            <p>{error || 'The private dashboard could not be loaded.'}</p>
            <button onClick={() => loadPrivateData(user.id)}>Try again</button>
          </article>
        ) : privateDataState !== 'ready' || !counts ? (
          <article className={styles.stateCard} aria-live="polite" aria-busy="true">
            <span className={styles.eyebrow}>PRIVATE WORKSPACE</span>
            <h2>Loading your dashboard…</h2>
            <p>Personal counts and preferences remain hidden until the complete private-data load succeeds.</p>
          </article>
        ) : selectedTab === 'today' ? (
            <div className={styles.todayGrid} aria-busy={loading}>
              <div className={styles.metrics}>
                <article><span>Private watchlists</span><strong>{counts.watchlists}</strong><Link href="/watchlists">Manage lists</Link></article>
                <article><span>Watched instruments</span><strong>{counts.watchedInstruments}</strong><Link href="/markets">Research markets</Link></article>
                <article><span>Stored interests</span><strong>{counts.interests}</strong><small>Instrument or Opportunity research interests</small></article>
              </div>

              <article className={styles.panel}>
                <div className={styles.panelHeading}><div><span className={styles.eyebrow}>TODAY</span><h2>Items needing attention</h2></div><span>{loading ? 'Refreshing…' : `${attentionItems.length} open`}</span></div>
                {attentionItems.length ? <ul className={styles.attentionList}>{attentionItems.map((item) => <li key={item.title}><div><strong>{item.title}</strong><p>{item.detail}</p></div><Link href={item.href}>{item.action}</Link></li>)}</ul> : <div className={styles.empty}><strong>Your personal foundation is ready.</strong><p>No setup gaps are currently detected. Later gates will add relevant Opportunities, portfolio health, recommendations and forward decision results.</p></div>}
              </article>

              <article className={styles.panel} id="preferences">
                <div className={styles.panelHeading}><div><span className={styles.eyebrow}>PREFERENCES</span><h2>Research defaults</h2></div><span>{preferences ? 'Persisted' : 'Not configured'}</span></div>
                <form className={styles.preferenceForm} onSubmit={savePreferences}>
                  <label>Base currency<input value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value)} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" required /></label>
                  <label>Default horizon<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 5 | 20 | 60)}><option value={5}>5 sessions</option><option value={20}>20 sessions</option><option value={60}>60 sessions</option></select></label>
                  <label>Optional risk style<select value={risk} onChange={(event) => setRisk(event.target.value as Preferences['risk_preference'])}><option value="unspecified">Unspecified</option><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="growth">Growth</option></select></label>
                  <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save preferences'}</button>
                </form>
                <p className={styles.disclosure}>These settings organise research presentation only. They are not a suitability assessment or permission to trade.</p>
              </article>
            </div>
        ) : selectedTab === 'recommendations' ? (
          <div className={styles.todayGrid} aria-busy={recommendationState === 'loading'}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>PERSONAL RESEARCH</span><h2>Explainable recommendations</h2></div><span>{recommendationState === 'ready' ? `${recommendations.filter((item) => item.latestEvent !== 'dismiss').length} current` : 'Loading'}</span></div>
              <p className={styles.disclosure}>These are immutable research-relevance snapshots, not financial advice or Buy/Sell instructions. Opportunity evidence can explain relevance but never creates a short-term action label by itself.</p>
            </article>
            {recommendationState === 'error' ? (
              <article className={styles.stateCard} role="alert"><span className={styles.eyebrow}>RECOMMENDATIONS UNAVAILABLE</span><h2>Private recommendations could not be loaded</h2><p>{recommendationError}</p><button type="button" onClick={() => loadPrivateData(user.id)}>Try again</button></article>
            ) : recommendationState !== 'ready' ? (
              <article className={styles.stateCard} role="status" aria-busy="true"><span className={styles.eyebrow}>PRIVATE RESEARCH</span><h2>Loading recommendation snapshots…</h2><p>Cards remain hidden until their snapshot, provenance and feedback history load together.</p></article>
            ) : recommendations.filter((item) => item.latestEvent !== 'dismiss').length === 0 ? (
              <article className={styles.stateCard} role="status"><span className={styles.eyebrow}>NO CURRENT SHORTLIST</span><h2>No supported recommendation is available</h2><p>No recommendation is invented from Opportunity alone, momentum, one indicator, stale evidence or an unsupported model opinion.</p></article>
            ) : recommendations.filter((item) => item.latestEvent !== 'dismiss').map((recommendation) => {
              const instrument = instruments.find((item) => item.id === recommendation.instrument_id)
              const confidence = recommendation.confidence === null ? null : Number(recommendation.confidence)
              return (
                <article className={styles.recommendationCard} key={recommendation.id}>
                  <div className={styles.panelHeading}><div><span className={styles.eyebrow}>{recommendation.category.replaceAll('_', ' ')}</span><h2>{instrument?.symbol ?? 'Instrument unavailable'} · {recommendation.intended_horizon_sessions} sessions</h2></div><span>{recommendation.quality_status.replaceAll('_', ' ')}</span></div>
                  <p className={styles.recommendationThesis}>{recommendation.thesis}</p>
                  <div className={styles.recommendationFacts}><div><span>Confidence</span><strong>{confidence === null ? 'Not provided' : `${Math.round(confidence * 100)}%`}</strong></div><div><span>Evidence cutoff</span><strong>{new Date(recommendation.source_cutoff).toLocaleString()}</strong></div><div><span>Valid until</span><strong>{recommendation.valid_until ? new Date(recommendation.valid_until).toLocaleString() : 'No expiry asserted'}</strong></div></div>
                  <section className={styles.riskBox} aria-label="Principal risks"><strong>Principal risks</strong><p>{recommendation.principal_risks}</p></section>
                  <section><strong>Why this is relevant</strong><ul className={styles.reasonList}>{recommendation.relevance_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>
                  {recommendation.quality_reasons.length ? <section className={styles.incomplete}><strong>Evidence limitations</strong><ul>{recommendation.quality_reasons.map((reason) => <li key={reason}>{reason.replaceAll('_', ' ')}</li>)}</ul></section> : null}
                  <section className={styles.sourceGroups} aria-label="Separated recommendation evidence">
                    {(['MARKET_AI', 'TECHNICAL', 'OPPORTUNITY', 'EXTERNAL_FACT'] as const).map((family) => {
                      const familySources = recommendation.sources.filter((source) => source.source_family === family)
                      if (!familySources.length) return null
                      return <div key={family}><strong>{family.replaceAll('_', ' ')}</strong>{familySources.map((source) => <p key={`${source.source_table}:${source.source_record_key}`}>{source.relevance}<small>Cutoff {new Date(source.source_cutoff).toLocaleString()} · {source.methodology_version}</small></p>)}</div>
                    })}
                  </section>
                  <dl className={styles.provenance}><div><dt>Snapshot methodology</dt><dd>{recommendation.methodology_version}</dd></div><div><dt>Model</dt><dd>{recommendation.model_identity ?? 'No AI model asserted'}</dd></div><div><dt>Source identity</dt><dd>{recommendation.source_hash.slice(0, 12)}…</dd></div></dl>
                  <div className={styles.recommendationActions}><Link href={instrument ? `/markets/${encodeURIComponent(instrument.symbol)}` : '/markets'}>Open research</Link><button type="button" onClick={() => void appendRecommendationEvent(recommendation.id, 'watch')} disabled={recommendationBusyId === recommendation.id}>Watch</button><button type="button" onClick={() => void appendRecommendationEvent(recommendation.id, 'feedback')} disabled={recommendationBusyId === recommendation.id}>Relevant</button><button type="button" className={styles.secondaryButton} onClick={() => void appendRecommendationEvent(recommendation.id, 'dismiss')} disabled={recommendationBusyId === recommendation.id}>Dismiss</button><button type="button" disabled title="Paper decisions are added in the separately audited Decision Lab gate">Paper decision — later gate</button></div>
                  {recommendation.latestEvent ? <p className={styles.disclosure}>Latest separate event: {recommendation.latestEvent}. The snapshot and its source assessments remain unchanged.</p> : null}
                </article>
              )
            })}
          </div>
        ) : selectedTab === 'portfolio-health' ? (
          <div className={styles.todayGrid} aria-busy={loading}>
            <article className={styles.panel} aria-busy={healthState === 'loading'}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>CALCULATED HEALTH</span><h2>Persisted portfolio snapshot</h2></div><span>{healthState === 'loading' ? 'Refreshing…' : selectedHealthSnapshot?.summary_status.replaceAll('_', ' ') ?? 'No snapshot'}</span></div>
              {portfolios.filter((portfolio) => portfolio.status === 'active').length === 0 ? (
                <div className={styles.empty}><strong>No calculated health is available.</strong><p>Create an active private portfolio first. No values or conclusions are fabricated.</p></div>
              ) : (
                <div className={styles.healthControls}>
                  <label>Portfolio<select value={healthPortfolioId} onChange={(event) => { setHealthPortfolioId(event.target.value); setHealthError('') }}>{portfolios.filter((portfolio) => portfolio.status === 'active').map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label>
                  <button type="button" onClick={refreshPortfolioHealth} disabled={healthState === 'loading'}>{healthState === 'loading' ? 'Calculating…' : 'Refresh calculated health'}</button>
                </div>
              )}
              {healthState === 'error' ? (
                <div className={styles.error} role="alert"><strong>Calculated health unavailable</strong><span>{healthError}</span><button type="button" onClick={() => healthErrorAction === 'load' ? loadPrivateData(user.id) : refreshPortfolioHealth()} disabled={healthErrorAction === 'refresh' && !healthPortfolioId}>{healthErrorAction === 'load' ? 'Reload private data' : 'Try refresh again'}</button></div>
              ) : healthState === 'loading' ? (
                <div className={styles.empty} role="status"><strong>Loading calculated Portfolio Health…</strong><p>The selected owner-scoped snapshot remains hidden until the complete read or trusted refresh succeeds.</p></div>
              ) : !selectedHealthSnapshot ? (
                <div className={styles.empty}><strong>No calculated snapshot yet.</strong><p>{selectedHealthPortfolio?.name ?? 'This portfolio'} has no persisted Portfolio Health result. Refresh uses the current secure session and stores an immutable, source-cutoff result.</p></div>
              ) : (
                <div className={styles.healthSummary}>
                  <div className={styles.healthMetrics}>
                    <div><span>Total value</span><strong>{totalValue !== null && Number.isFinite(totalValue) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: selectedHealthSnapshot.base_currency }).format(totalValue) : 'Incomplete'}</strong></div>
                    <div><span>Data completeness</span><strong>{completeness !== null && Number.isFinite(completeness) ? `${completeness.toFixed(2)}%` : 'Incomplete'}</strong></div>
                    <div><span>Summary</span><strong>{selectedHealthSnapshot.summary_status.replaceAll('_', ' ')}</strong></div>
                  </div>
                  {selectedHealthSnapshot.completeness_reasons.length ? <div className={styles.incomplete}><strong>Incomplete evidence remains</strong><ul>{summariseEvidenceReasons(selectedHealthSnapshot.completeness_reasons).map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
                  <dl className={styles.provenance}><div><dt>Source cutoff</dt><dd>{new Date(selectedHealthSnapshot.source_cutoff).toLocaleString()}</dd></div><div><dt>Methodology</dt><dd>{selectedHealthSnapshot.methodology_version}</dd></div><div><dt>Source identity</dt><dd>{selectedHealthSnapshot.source_hash.slice(0, 12)}…</dd></div></dl>
                </div>
              )}
              <p className={styles.disclosure}>Calculated measures come only from a persisted trusted result with source provenance. Missing issuer, calendar, price, currency or cost evidence remains explicitly incomplete.</p>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>PORTFOLIO HEALTH</span><h2>Your private portfolios</h2></div><span>{portfolios.length} stored</span></div>
              {portfolios.length ? (
                <ul className={styles.portfolioList}>
                  {portfolios.map((portfolio) => (
                    <li key={portfolio.id}>
                      <div><strong>{portfolio.name}</strong><p>{portfolio.portfolio_kind === 'paper' ? 'Paper portfolio' : 'Manually entered portfolio'} · {portfolio.base_currency}</p></div>
                      <span>{portfolio.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.empty}><strong>No portfolio has been added.</strong><p>This is a real empty state from your private Supabase rows. Position entry and calculated health measures will be added in the next MYDASH-004 slices; missing holdings or values are never fabricated.</p></div>
              )}
              <p className={styles.disclosure}>Portfolio Health is for private research and paper tracking only. It cannot place trades or connect to a broker.</p>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>ADD PORTFOLIO</span><h2>Create a private portfolio</h2></div><span>Owner only</span></div>
              <form className={styles.portfolioForm} onSubmit={createPortfolio}>
                <label>Portfolio name<input value={portfolioName} onChange={(event) => setPortfolioName(event.target.value)} maxLength={120} placeholder="Long-term research" required /></label>
                <label>Tracking type<select value={portfolioKind} onChange={(event) => setPortfolioKind(event.target.value as Portfolio['portfolio_kind'])}><option value="manual">Manual holdings</option><option value="paper">Paper portfolio</option></select></label>
                <label>Base currency<input value={portfolioCurrency} onChange={(event) => setPortfolioCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" required /></label>
                <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Create portfolio'}</button>
              </form>
              <p className={styles.disclosure}>Creating a portfolio stores only its private header. It does not add holdings, calculate performance or place a trade.</p>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>ADD POSITION</span><h2>Enter a manual holding</h2></div><span>Private input</span></div>
              {portfolios.length === 0 ? (
                <div className={styles.empty}><strong>Create a portfolio first.</strong><p>A position must belong to one of your private portfolios.</p></div>
              ) : instruments.length === 0 ? (
                <div className={styles.empty}><strong>No active instruments are available.</strong><p>No symbol is invented when the canonical instrument list is unavailable.</p></div>
              ) : (
                <form className={styles.positionForm} onSubmit={createPosition}>
                  <label>Portfolio<select value={positionPortfolioId} onChange={(event) => setPositionPortfolioId(event.target.value)} required><option value="">Choose portfolio</option>{portfolios.filter((portfolio) => portfolio.status === 'active').map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label>
                  <label>Instrument<select value={positionInstrumentId} onChange={(event) => { const nextId = event.target.value; setPositionInstrumentId(nextId); const next = instruments.find((instrument) => instrument.id === nextId); if (next?.currency_code) setPositionCurrency(next.currency_code.trim().toUpperCase()) }} required><option value="">Choose instrument</option>{instruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.symbol} — {instrument.instrument_name}</option>)}</select></label>
                  <label>Quantity<input type="number" value={positionQuantity} onChange={(event) => setPositionQuantity(event.target.value)} min="0.000000000001" step="any" required /></label>
                  <label>Average cost per unit <span className={styles.optional}>(optional)</span><input type="number" value={positionCost} onChange={(event) => setPositionCost(event.target.value)} min="0" step="any" /></label>
                  <label>Cost currency<input value={positionCurrency} onChange={(event) => setPositionCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" required /></label>
                  <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save position'}</button>
                </form>
              )}
              <p className={styles.disclosure}>A blank cost basis remains explicitly incomplete. Saving a position never places an order or contacts a broker.</p>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>IMPORT HOLDINGS</span><h2>Preview a private CSV</h2></div><span>Optional</span></div>
              {portfolios.some((portfolio) => portfolio.status === 'active' && portfolio.portfolio_kind === 'manual') ? (
                <div className={styles.csvImport}>
                  <label>Manual portfolio<select value={csvPortfolioId} onChange={(event) => { setCsvPortfolioId(event.target.value); clearCsvPreview() }}><option value="">Choose portfolio</option>{portfolios.filter((portfolio) => portfolio.status === 'active' && portfolio.portfolio_kind === 'manual').map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label>
                  <div className={styles.dropZone} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void previewCsvFile(event.dataTransfer.files[0]) }}>
                    <strong>Drop one holdings CSV here</strong><span>or choose a UTF-8 .csv file up to 1 MiB</span>
                    <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={(event) => void previewCsvFile(event.target.files?.[0])} aria-label="Choose holdings CSV" disabled={csvBusy || !csvPortfolioId} />
                  </div>
                  {csvMessage ? <p className={styles.csvMessage} role="status" aria-live="polite">{csvMessage}</p> : null}
                  {csvPreview ? (
                    <div className={styles.csvPreview}>
                      <div role="status" aria-live="polite"><strong>{csvPreview.errors.length ? 'Import cannot be confirmed' : `${csvPreview.rows.length} ${csvPreview.rows.length === 1 ? 'row' : 'rows'} ready`}</strong><span>{csvPreview.fileName} stays in this browser preview until cleared or confirmed.</span></div>
                      {csvPreview.errors.length ? <ul className={styles.csvErrors}>{csvPreview.errors.map((item) => <li key={item}>{item}</li>)}</ul> : (
                        <div className={styles.csvTableWrap}><table><thead><tr><th>Line</th><th>Instrument</th><th>Quantity</th><th>Cost basis</th><th>Result</th></tr></thead><tbody>{csvPreview.rows.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.value.symbol} · {row.value.exchangeCode}</td><td>{row.value.quantity}</td><td>{row.value.averageCostPerUnit === null ? 'Incomplete' : `${row.value.costCurrency} ${row.value.averageCostPerUnit}`}</td><td>{row.warnings.map((warning) => <span key={warning}>{warning}</span>)}</td></tr>)}</tbody></table></div>
                      )}
                      <div className={styles.csvActions}><button type="button" className={styles.secondaryButton} onClick={() => clearCsvPreview()} disabled={csvBusy}>Clear preview</button><button type="button" onClick={() => void confirmCsvImport()} disabled={csvBusy || csvPreview.errors.length > 0 || csvPreview.rows.length === 0}>{csvBusy ? 'Importing…' : 'Import holdings'}</button></div>
                    </div>
                  ) : null}
                </div>
              ) : <div className={styles.empty}><strong>Create an active manual portfolio first.</strong><p>CSV imports cannot target paper or archived portfolios.</p></div>}
              <p className={styles.disclosure}>Use only the canonical columns: symbol, exchange_code, quantity, average_cost_per_unit, cost_currency, acquired_at and notes. Broker/account fields are rejected. Previewing never writes; confirmation is atomic and never places a trade.</p>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>POSITIONS</span><h2>Stored holdings</h2></div><span>{positions.length} stored</span></div>
              {positions.length ? (
                <ul className={styles.positionList}>
                  {positions.map((position) => {
                    const portfolio = portfolios.find((item) => item.id === position.portfolio_id)
                    const instrument = instruments.find((item) => item.id === position.instrument_id)
                    return (
                      <li key={position.id}>
                        <div><strong>{instrument?.symbol ?? 'Unresolved instrument'}</strong><p>{instrument?.instrument_name ?? 'Instrument details unavailable'} · {portfolio?.name ?? 'Unresolved portfolio'}</p></div>
                        <div className={styles.positionFacts}><span>{position.quantity} units</span><span>{position.average_cost_per_unit === null ? 'Cost basis incomplete' : `${position.cost_currency} ${position.average_cost_per_unit} average cost`}</span></div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className={styles.empty}><strong>No positions have been saved.</strong><p>This is the current owner's real private empty state. Holdings and cost values are never inferred.</p></div>
              )}
            </article>
          </div>
        ) : selectedTab === 'decision-lab' ? (
          <div className={styles.todayGrid} aria-busy={decisionState === 'loading'}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>FORWARD PAPER EVIDENCE</span><h2>Immutable personal decisions</h2></div><span>{decisionState === 'ready' ? `${decisions.length} stored` : 'Owner only'}</span></div>
              <p>AI-signal decisions keep the original assessment cutoff. User-paper decisions keep the later user clock. They are never combined into one entry timestamp.</p>
              {decisionState === 'error' ? (
                <div className={styles.error} role="alert"><strong>Decision Lab unavailable</strong><span>{decisionError}</span><button type="button" onClick={() => void loadPrivateData(user.id)}>Reload private data</button></div>
              ) : decisionState === 'loading' || decisionState === 'idle' ? (
                <div className={styles.empty} role="status"><strong>Loading private decisions…</strong><p>No decision or result is shown until the complete owner-scoped read succeeds.</p></div>
              ) : decisions.length === 0 ? (
                <div className={styles.empty} role="status"><strong>No forward decisions have been captured.</strong><p>This is the current owner's real private empty state. Historical decisions and returns are not reconstructed.</p></div>
              ) : (
                <ul className={styles.decisionList}>
                  {decisions.map((decision) => {
                    const instrument = instruments.find((item) => item.id === decision.instrument_id)
                    const terminal = decision.events.find((event) => event.event_type === 'EXIT' || event.event_type === 'CANCEL')
                    const hasPaperPosition = positions.some((position) => position.source_decision_id === decision.id)
                    const lifecycle = terminal ? 'COMPLETED' : hasPaperPosition ? 'OPEN' : 'PENDING ENTRY'
                    return <li key={decision.id}>
                      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>{decision.source_type.replaceAll('_', ' ')}</span><h3>{instrument?.symbol ?? 'Unresolved instrument'} · {decision.action}</h3></div><span>{lifecycle}</span></div>
                      <div className={styles.recommendationFacts}><div><span>Decision clock</span><strong>{new Date(decision.decision_at).toLocaleString()}</strong></div><div><span>Source cutoff</span><strong>{new Date(decision.source_cutoff).toLocaleString()}</strong></div><div><span>Horizon</span><strong>{decision.horizon_sessions} sessions</strong></div></div>
                      <dl className={styles.provenance}><div><dt>Entry rule</dt><dd>{decision.entry_rule.replaceAll('_', ' ')}</dd></div><div><dt>Calculation</dt><dd>{decision.calculation_version}</dd></div><div><dt>Source identity</dt><dd>{decision.source_hash.slice(0, 12)}…</dd></div></dl>
                      <p className={styles.disclosure}>{decision.source_type === 'AI_SIGNAL' ? `Assessment action: ${decision.source_action}. The AI cutoff controls this clock.` : `User action snapshot: ${decision.source_action}. The server capture clock controls this record.`} {terminal ? `Latest terminal event: ${terminal.event_type} at ${new Date(terminal.event_at).toLocaleString()}.` : 'Entry price and returns remain unavailable until forward evidence exists.'}</p>
                    </li>
                  })}
                </ul>
              )}
              <p className={styles.disclosure}>Decision Lab is simulated research only. It cannot place orders, connect a broker or present an unresolved return as zero.</p>
            </article>
          </div>
        ) : (
          <article className={styles.panel}>
            <span className={styles.eyebrow}>FOUNDATION READY</span>
            <h2>{tabs.find((tab) => tab.key === selectedTab)?.label}</h2>
            <p>This tab is intentionally empty until its independently audited project gate. No placeholder recommendations, holdings or returns are fabricated.</p>
            <div className={styles.deepLinks}><Link href="/markets">Markets</Link><Link href="/assessments">Assessments</Link><Link href="/opportunities">Opportunities</Link><Link href="/watchlists">Watchlists</Link><Link href="/strategies">Strategies</Link></div>
          </article>
        )}
      </section>
    </div>
  )
}
