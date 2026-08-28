'use client'

import Link from 'next/link'
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase-browser'
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

type TabKey = (typeof tabs)[number]['key']
type Preferences = {
  owner_user_id: string
  base_currency: string
  default_horizon_sessions: 5 | 20 | 60
  risk_preference: 'unspecified' | 'conservative' | 'balanced' | 'growth'
  updated_at: string
}
type DashboardCounts = { watchlists: number; watchedInstruments: number; interests: number }
type PrivateDataState = 'idle' | 'loading' | 'ready' | 'error'

function permanentUser(user: User | null | undefined) {
  return user && !user.is_anonymous ? user : null
}

function validTab(value: string | null): TabKey {
  return tabs.some((tab) => tab.key === value) ? (value as TabKey) : 'today'
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
  const [email, setEmail] = useState('')
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [counts, setCounts] = useState<DashboardCounts | null>(null)
  const [baseCurrency, setBaseCurrency] = useState(DEFAULT_BASE_CURRENCY)
  const [horizon, setHorizon] = useState<5 | 20 | 60>(DEFAULT_HORIZON)
  const [risk, setRisk] = useState<Preferences['risk_preference']>(DEFAULT_RISK)

  const clearPrivateState = useCallback((ownerId: string | null) => {
    activeOwnerRef.current = ownerId
    loadGenerationRef.current += 1
    setPreferences(null)
    setCounts(null)
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
    setCounts(null)
    setError('')
    try {
      const supabase = getBrowserSupabase()
      const [preferencesResult, watchlistsResult, interestsResult] = await Promise.all([
        supabase
          .from('user_market_preferences')
          .select('owner_user_id,base_currency,default_horizon_sessions,risk_preference,updated_at')
          .eq('owner_user_id', ownerId)
          .maybeSingle(),
        supabase.from('watchlists').select('id').eq('owner_user_id', ownerId),
        supabase.from('user_market_interests').select('id').eq('owner_user_id', ownerId),
      ])
      if (!isCurrentLoad()) return
      if (preferencesResult.error) throw preferencesResult.error
      if (watchlistsResult.error) throw watchlistsResult.error
      if (interestsResult.error) throw interestsResult.error

      const listIds = (watchlistsResult.data ?? []).map((row) => row.id)
      const itemsResult = listIds.length
        ? await supabase.from('watchlist_items').select('instrument_id').in('watchlist_id', listIds)
        : { data: [], error: null }
      if (!isCurrentLoad()) return
      if (itemsResult.error) throw itemsResult.error

      const nextPreferences = (preferencesResult.data ?? null) as Preferences | null
      setPreferences(nextPreferences)
      setCounts({
        watchlists: listIds.length,
        watchedInstruments: new Set((itemsResult.data ?? []).map((row) => row.instrument_id)).size,
        interests: (interestsResult.data ?? []).length,
      })
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
    } catch (loadError) {
      if (!isCurrentLoad()) return
      setPreferences(null)
      setCounts(null)
      setPrivateDataState('error')
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
      clearPrivateState(resolved?.id ?? null)
      setUser(resolved)
      setAuthReady(true)
      if (sessionUser?.is_anonymous) {
        setError('Anonymous sessions cannot open My Dashboard. Sign in with a permanent email account.')
      }
      if (resolved) void loadPrivateData(resolved.id)
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

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) return
    setError('')
    const { error: authError } = await getBrowserSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/my-dashboard`, shouldCreateUser: true },
    })
    if (authError) setError(authError.message)
    else setStatus('Check your email for the secure sign-in link.')
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
    const { error: writeError } = preferences
      ? await getBrowserSupabase()
          .from('user_market_preferences')
          .update({ base_currency: payload.base_currency, default_horizon_sessions: horizon, risk_preference: risk })
          .eq('owner_user_id', ownerId)
      : await getBrowserSupabase().from('user_market_preferences').insert(payload)
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
      <section className={styles.signInShell}>
        <span className={styles.eyebrow}>PRIVATE RESEARCH WORKSPACE</span>
        <h1>My Dashboard</h1>
        <p className={styles.lede}>Track your own watchlists, research interests, portfolio health and paper decisions. This workspace never places trades or connects to a broker.</p>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {status && <div className={styles.status} role="status">{status}</div>}
        <form className={styles.signInForm} onSubmit={signIn}>
          <label htmlFor="dashboard-email">Email</label>
          <div>
            <input id="dashboard-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <button type="submit">Send secure link</button>
          </div>
        </form>
        <small>Signed-out and anonymous sessions cannot read personal dashboard tables.</small>
      </section>
    )
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>PERSONAL MARKET WORKSPACE</span><h1>My Dashboard</h1><p className={styles.lede}>Your private research overview. Stored data, source evidence and later inference stay distinct.</p></div>
        <button className={styles.secondaryButton} onClick={signOut}>Sign out</button>
      </header>

      <div className={styles.tabScroller}>
        <div className={styles.tabs} role="tablist" aria-label="My Dashboard sections">
          {tabs.map((tab, index) => <button id={`my-dashboard-tab-${tab.key}`} key={tab.key} type="button" role="tab" aria-selected={selectedTab === tab.key} aria-controls={`my-dashboard-panel-${tab.key}`} tabIndex={selectedTab === tab.key ? 0 : -1} className={selectedTab === tab.key ? styles.activeTab : styles.tab} onClick={() => selectTab(tab.key)} onKeyDown={(event) => onTabKeyDown(event, index)}>{tab.label}</button>)}
        </div>
      </div>

      {error && privateDataState !== 'error' && <div className={styles.error} role="alert"><strong>Dashboard error</strong><span>{error}</span></div>}
      {status && <div className={styles.status} role="status">{status}</div>}

      <section id={`my-dashboard-panel-${selectedTab}`} role="tabpanel" aria-labelledby={`my-dashboard-tab-${selectedTab}`} tabIndex={0}>
        {selectedTab === 'today' ? (
          privateDataState === 'error' ? (
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
          ) : (
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
          )
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
