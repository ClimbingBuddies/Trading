'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './WatchlistsClient.module.css'

type AlertType = 'price_threshold' | 'data_freshness' | 'market_assessment' | 'opportunity_assessment' | 'market_convergence' | 'technical_score'
type TargetScope = 'instrument' | 'watchlist' | 'theme'

type AlertRow = {
  id: string
  owner_user_id: string
  instrument_id: string | null
  watchlist_id: string | null
  theme_id: string | null
  name: string
  alert_type: AlertType
  condition: Record<string, unknown>
  is_enabled: boolean
  last_triggered_at: string | null
  created_at: string
  updated_at: string
}

type AlertEvent = {
  id: number
  alert_id: string
  instrument_id: string | null
  theme_id: string | null
  triggered_at: string
  trigger_value: number | null
  message: string | null
  notification_status: string
  event_key: string
  metadata: Record<string, unknown>
}

type Instrument = { id: string; symbol: string; instrument_name: string; currency_code: string }
type Watchlist = { id: string; name: string }
type Theme = { id: string; theme_name: string; status: string }

const typeLabels: Record<AlertType, string> = {
  price_threshold: 'Price threshold',
  data_freshness: 'Market-data freshness',
  market_assessment: 'Market Assessment',
  opportunity_assessment: 'Opportunity Assessment',
  market_convergence: 'Market Convergence',
  technical_score: 'Technical score',
}

function permanentUser(user: User | null | undefined) {
  return user && user.is_anonymous !== true ? user : null
}

function formatWhen(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function AlertsClient() {
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [themes, setThemes] = useState<Theme[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [alertType, setAlertType] = useState<AlertType>('price_threshold')
  const [targetScope, setTargetScope] = useState<TargetScope>('instrument')
  const [targetId, setTargetId] = useState('')
  const [operator, setOperator] = useState('crosses_above')
  const [metric, setMetric] = useState('')
  const [threshold, setThreshold] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [minimumConfidence, setMinimumConfidence] = useState('0')
  const [currencyCode, setCurrencyCode] = useState('USD')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async (userId: string) => {
    const supabase = getBrowserSupabase()
    const [alertsRes, eventsRes, instrumentsRes, watchlistsRes, themesRes] = await Promise.all([
      supabase.from('alerts').select('id,owner_user_id,instrument_id,watchlist_id,theme_id,name,alert_type,condition,is_enabled,last_triggered_at,created_at,updated_at').eq('owner_user_id', userId).order('created_at', { ascending: false }),
      supabase.from('alert_events').select('id,alert_id,instrument_id,theme_id,triggered_at,trigger_value,message,notification_status,event_key,metadata').order('triggered_at', { ascending: false }).limit(100),
      supabase.from('instruments').select('id,symbol,instrument_name,currency_code').eq('is_active', true).order('symbol'),
      supabase.from('watchlists').select('id,name').eq('owner_user_id', userId).order('name'),
      supabase.from('opportunity_themes').select('id,theme_name,status').in('status', ['active', 'watch']).order('theme_name'),
    ])
    if (alertsRes.error) throw alertsRes.error
    if (eventsRes.error) throw eventsRes.error
    if (instrumentsRes.error) throw instrumentsRes.error
    if (watchlistsRes.error) throw watchlistsRes.error
    if (themesRes.error) throw themesRes.error
    setAlerts((alertsRes.data ?? []) as AlertRow[])
    setEvents((eventsRes.data ?? []) as AlertEvent[])
    setInstruments((instrumentsRes.data ?? []).map((row) => ({ ...row, currency_code: row.currency_code.trim() })) as Instrument[])
    setWatchlists((watchlistsRes.data ?? []) as Watchlist[])
    setThemes((themesRes.data ?? []) as Theme[])
  }, [])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    let mounted = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) setError(sessionError.message)
      const current = permanentUser(data.session?.user)
      setUser(current)
      setAuthReady(true)
      if (current) loadData(current.id).catch((loadError) => setError(loadError.message))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      const current = permanentUser(session?.user)
      setUser(current)
      setAuthReady(true)
      if (current) {
        setError('')
        loadData(current.id).catch((loadError) => setError(loadError.message))
      } else {
        setAlerts([])
        setEvents([])
      }
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadData])

  useEffect(() => {
    if (alertType === 'opportunity_assessment') {
      setTargetScope('theme')
      setMetric('opportunity_level')
      setOperator('enters_value')
      setSelectedValue('major')
    } else if (alertType === 'price_threshold') {
      if (targetScope === 'theme') setTargetScope('instrument')
      setMetric('')
      setOperator('crosses_above')
      setSelectedValue('')
    } else if (alertType === 'data_freshness') {
      if (targetScope === 'theme') setTargetScope('instrument')
      setMetric('')
      setOperator('enters_state')
      setSelectedValue('stale')
    } else if (alertType === 'market_assessment') {
      if (targetScope === 'theme') setTargetScope('instrument')
      setMetric('rating')
      setOperator('enters_value')
      setSelectedValue('Buy')
    } else if (alertType === 'market_convergence') {
      if (targetScope === 'theme') setTargetScope('instrument')
      setMetric('convergence_label')
      setOperator('enters_value')
      setSelectedValue('strong_bullish')
    } else if (alertType === 'technical_score') {
      if (targetScope === 'theme') setTargetScope('instrument')
      setMetric('overall_score')
      setOperator('crosses_above')
      setThreshold('70')
    }
    setTargetId('')
  }, [alertType])

  useEffect(() => {
    if (targetScope === 'instrument' && targetId) {
      const instrument = instruments.find((row) => row.id === targetId)
      if (instrument) setCurrencyCode(instrument.currency_code)
    }
  }, [targetScope, targetId, instruments])

  const instrumentMap = useMemo(() => new Map(instruments.map((row) => [row.id, row])), [instruments])
  const watchlistMap = useMemo(() => new Map(watchlists.map((row) => [row.id, row])), [watchlists])
  const themeMap = useMemo(() => new Map(themes.map((row) => [row.id, row])), [themes])
  const alertMap = useMemo(() => new Map(alerts.map((row) => [row.id, row])), [alerts])

  async function runAction(action: () => Promise<void>, successMessage?: string) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await action()
      if (successMessage) setStatus(successMessage)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Alert action failed.')
    } finally {
      setBusy(false)
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    await runAction(async () => {
      const { error: authError } = await getBrowserSupabase().auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${window.location.origin}/alerts`, shouldCreateUser: true },
      })
      if (authError) throw authError
    }, 'Check your email for the secure sign-in link.')
  }

  async function signOut() {
    await runAction(async () => {
      const { error: authError } = await getBrowserSupabase().auth.signOut()
      if (authError) throw authError
    }, 'Signed out.')
  }

  function buildCondition() {
    const base: Record<string, unknown> = { condition_version: 'alert-trigger-v1', operator, minimum_confidence: Number(minimumConfidence || 0) }
    if (alertType === 'price_threshold') return { ...base, threshold: Number(threshold), currency_code: currencyCode.trim().toUpperCase() }
    if (alertType === 'data_freshness') return { ...base, states: [selectedValue] }
    if (alertType === 'market_assessment') {
      if (metric === 'rating') return operator === 'changes' ? { ...base, metric } : { ...base, metric, values: [selectedValue] }
      return { ...base, metric, threshold: Number(threshold) }
    }
    if (alertType === 'opportunity_assessment') {
      return metric === 'opportunity_score' ? { ...base, metric, threshold: Number(threshold) } : { ...base, metric, values: [selectedValue] }
    }
    if (alertType === 'market_convergence') {
      if (metric === 'convergence_label') return operator === 'changes' ? { ...base, metric } : { ...base, metric, values: [selectedValue] }
      return { ...base, metric, threshold: Number(threshold) }
    }
    return { ...base, metric, threshold: Number(threshold) }
  }

  function resetForm() {
    setEditingId(null)
    setName('')
    setAlertType('price_threshold')
    setTargetScope('instrument')
    setTargetId('')
    setOperator('crosses_above')
    setMetric('')
    setThreshold('')
    setSelectedValue('')
    setMinimumConfidence('0')
    setCurrencyCode('USD')
  }

  async function saveAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !name.trim() || !targetId) return
    const payload = {
      owner_user_id: user.id,
      instrument_id: targetScope === 'instrument' ? targetId : null,
      watchlist_id: targetScope === 'watchlist' ? targetId : null,
      theme_id: targetScope === 'theme' ? targetId : null,
      name: name.trim(),
      alert_type: alertType,
      condition: buildCondition(),
      is_enabled: true,
    }
    await runAction(async () => {
      const supabase = getBrowserSupabase()
      if (editingId) {
        const { error: updateError } = await supabase.from('alerts').update(payload).eq('id', editingId).eq('owner_user_id', user.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('alerts').insert(payload)
        if (insertError) throw insertError
      }
      resetForm()
      await loadData(user.id)
    }, editingId ? 'Alert updated.' : 'Alert created and baselined.')
  }

  function editAlert(alert: AlertRow) {
    const condition = alert.condition
    setEditingId(alert.id)
    setName(alert.name)
    setAlertType(alert.alert_type)
    setTargetScope(alert.theme_id ? 'theme' : alert.watchlist_id ? 'watchlist' : 'instrument')
    setTargetId(alert.theme_id ?? alert.watchlist_id ?? alert.instrument_id ?? '')
    setOperator(String(condition.operator ?? 'crosses_above'))
    setMetric(String(condition.metric ?? ''))
    setThreshold(condition.threshold === undefined ? '' : String(condition.threshold))
    const values = Array.isArray(condition.values) ? condition.values : Array.isArray(condition.states) ? condition.states : []
    setSelectedValue(values.length ? String(values[0]) : '')
    setMinimumConfidence(String(condition.minimum_confidence ?? 0))
    setCurrencyCode(String(condition.currency_code ?? 'USD'))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function toggleAlert(alert: AlertRow) {
    if (!user) return
    await runAction(async () => {
      const { error: updateError } = await getBrowserSupabase().from('alerts').update({ is_enabled: !alert.is_enabled }).eq('id', alert.id).eq('owner_user_id', user.id)
      if (updateError) throw updateError
      await loadData(user.id)
    }, alert.is_enabled ? 'Alert disabled.' : 'Alert enabled and rebaselined.')
  }

  async function deleteAlert(alert: AlertRow) {
    if (!user || !window.confirm(`Delete “${alert.name}” and its event history?`)) return
    await runAction(async () => {
      const { error: deleteError } = await getBrowserSupabase().from('alerts').delete().eq('id', alert.id).eq('owner_user_id', user.id)
      if (deleteError) throw deleteError
      if (editingId === alert.id) resetForm()
      await loadData(user.id)
    }, 'Alert deleted.')
  }

  function targetName(alert: AlertRow) {
    if (alert.instrument_id) return instrumentMap.get(alert.instrument_id)?.symbol ?? 'Instrument'
    if (alert.watchlist_id) return watchlistMap.get(alert.watchlist_id)?.name ?? 'Watchlist'
    if (alert.theme_id) return themeMap.get(alert.theme_id)?.theme_name ?? 'Opportunity theme'
    return 'Unknown target'
  }

  if (!authReady) return <div className={styles.authCard}>Checking secure alert session…</div>

  if (!user) {
    return (
      <div className={styles.shell}>
        <header className={styles.hero}><div><h1>Alerts</h1><p>Private alert definitions and persisted event history.</p></div></header>
        {error ? <p className={styles.error}>{error}</p> : null}
        {status ? <p className={styles.status}>{status}</p> : null}
        <section className={styles.authCard}>
          <h2>Sign in to use alerts</h2>
          <p>Alerts use the same permanent Supabase Auth identity as private watchlists.</p>
          <form className={styles.formGrid} onSubmit={signIn}>
            <label className={styles.field}>Email address<input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <button className={styles.primaryButton} type="submit" disabled={busy}>Send secure sign-in link</button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div><h1>Alerts</h1><p>Edge-triggered monitoring backed by persisted source data and owner-scoped RLS.</p></div>
        <div className={styles.signedIn}><span>{user.email ?? 'Authenticated user'}</span><button className={styles.secondaryButton} type="button" onClick={signOut} disabled={busy}>Sign out</button></div>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.status}>{status}</p> : null}

      <form className={styles.panel} onSubmit={saveAlert}>
        <div className={styles.panelHeader}><div><h2>{editingId ? 'Edit alert' : 'Create an alert'}</h2><p>Every alert is baselined first; existing conditions do not fire historically.</p></div>{editingId ? <button className={styles.secondaryButton} type="button" onClick={resetForm}>Cancel edit</button> : null}</div>
        <div className={styles.formGrid}>
          <label className={styles.field}>Name<input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className={styles.field}>Alert type<select className={styles.select} value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={styles.field}>Target scope<select className={styles.select} value={targetScope} onChange={(e) => { setTargetScope(e.target.value as TargetScope); setTargetId('') }} disabled={alertType === 'opportunity_assessment'}>{alertType !== 'opportunity_assessment' ? <><option value="instrument">Instrument</option><option value="watchlist">Watchlist</option></> : null}<option value="theme">Opportunity theme</option></select></label>
          <label className={styles.field}>Target<select className={styles.select} value={targetId} onChange={(e) => setTargetId(e.target.value)} required><option value="">Select a target…</option>{targetScope === 'instrument' ? instruments.map((row) => <option key={row.id} value={row.id}>{row.symbol} — {row.instrument_name}</option>) : null}{targetScope === 'watchlist' ? watchlists.map((row) => <option key={row.id} value={row.id}>{row.name}</option>) : null}{targetScope === 'theme' ? themes.map((row) => <option key={row.id} value={row.id}>{row.theme_name}</option>) : null}</select></label>

          {alertType === 'price_threshold' ? <><label className={styles.field}>Operator<select className={styles.select} value={operator} onChange={(e) => setOperator(e.target.value)}><option value="crosses_above">Crosses above</option><option value="crosses_below">Crosses below</option></select></label><label className={styles.field}>Threshold<input className={styles.input} type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} required /></label><label className={styles.field}>Currency<input className={styles.input} value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} required /></label></> : null}
          {alertType === 'data_freshness' ? <label className={styles.field}>State<select className={styles.select} value={selectedValue} onChange={(e) => setSelectedValue(e.target.value)}><option value="due">Due (91–120 min)</option><option value="stale">Stale (&gt;120 min while active)</option><option value="no_observation">No observation</option></select></label> : null}
          {alertType === 'market_assessment' ? <><label className={styles.field}>Metric<select className={styles.select} value={metric} onChange={(e) => { const next=e.target.value; setMetric(next); setOperator(next==='rating'?'enters_value':'crosses_above') }}><option value="rating">Rating</option><option value="score">Score</option></select></label>{metric === 'rating' ? <><label className={styles.field}>Operator<select className={styles.select} value={operator} onChange={(e) => setOperator(e.target.value)}><option value="enters_value">Enters rating</option><option value="changes">Any rating change</option></select></label>{operator !== 'changes' ? <label className={styles.field}>Rating<select className={styles.select} value={selectedValue} onChange={(e) => setSelectedValue(e.target.value)}><option>Buy</option><option>Hold</option><option>Sell</option></select></label> : null}</> : <><label className={styles.field}>Operator<select className={styles.select} value={operator} onChange={(e) => setOperator(e.target.value)}><option value="crosses_above">Crosses above</option><option value="crosses_below">Crosses below</option></select></label><label className={styles.field}>Threshold<input className={styles.input} type="number" min="0" max="100" value={threshold} onChange={(e) => setThreshold(e.target.value)} required /></label></>}</> : null}
          {alertType === 'opportunity_assessment' ? <><label className={styles.field}>Metric<select className={styles.select} value={metric} onChange={(e) => { const next=e.target.value; setMetric(next); setOperator(next==='opportunity_score'?'crosses_above':'enters_value') }}><option value="opportunity_level">Opportunity level</option><option value="opportunity_score">Opportunity score</option><option value="commercial_readiness">Commercial readiness</option></select></label>{metric === 'opportunity_score' ? <><label className={styles.field}>Operator<select className={styles.select} value={operator} onChange={(e) => setOperator(e.target.value)}><option value="crosses_above">Crosses above</option><option value="crosses_below">Crosses below</option></select></label><label className={styles.field}>Threshold<input className={styles.input} type="number" min="0" max="100" value={threshold} onChange={(e) => setThreshold(e.target.value)} required /></label></> : <label className={styles.field}>Value<select className={styles.select} value={selectedValue} onChange={(e) => setSelectedValue(e.target.value)}>{metric === 'commercial_readiness' ? ['early','watch','developing','actionable','mature'].map((v)=><option key={v} value={v}>{v}</option>) : ['emerging','watch','high','major','transformational'].map((v)=><option key={v} value={v}>{v}</option>)}</select></label>}</> : null}
          {alertType === 'market_convergence' ? <><label className={styles.field}>Metric<select className={styles.select} value={metric} onChange={(e) => { const next=e.target.value; setMetric(next); setOperator(next==='convergence_label'?'enters_value':'crosses_above') }}><option value="convergence_label">Convergence label</option><option value="convergence_score">Convergence score</option></select></label>{metric === 'convergence_label' ? <><label className={styles.field}>Operator<select className={styles.select} value={operator} onChange={(e) => setOperator(e.target.value)}><option value="enters_value">Enters label</option><option value="changes">Any label change</option></select></label>{operator !== 'changes' ? <label className={styles.field}>Label<select className={styles.select} value={selectedValue} onChange={(e) => setSelectedValue(e.target.value)}>{['very_strong_bullish','strong_bullish','moderate_bullish','neutral','mixed','conflict','moderate_bearish','strong_bearish','very_strong_bearish'].map((v)=><option key={v} value={v}>{v}</option>)}</select></label> : null}</> : <><label className={styles.field}>Operator<select className={styles.select} value={operator} onChange={(e) => setOperator(e.target.value)}><option value="crosses_above">Crosses above</option><option value="crosses_below">Crosses below</option></select></label><label className={styles.field}>Threshold<input className={styles.input} type="number" min="0" max="100" value={threshold} onChange={(e) => setThreshold(e.target.value)} required /></label></>}</> : null}
          {alertType === 'technical_score' ? <><label className={styles.field}>Metric<select className={styles.select} value={metric} onChange={(e) => setMetric(e.target.value)}>{['overall_score','momentum_score','trend_score','volatility_score','volume_score'].map((v)=><option key={v} value={v}>{v}</option>)}</select></label><label className={styles.field}>Operator<select className={styles.select} value={operator} onChange={(e) => setOperator(e.target.value)}><option value="crosses_above">Crosses above</option><option value="crosses_below">Crosses below</option></select></label><label className={styles.field}>Threshold<input className={styles.input} type="number" min="0" max="100" value={threshold} onChange={(e) => setThreshold(e.target.value)} required /></label></> : null}
          {!['price_threshold','data_freshness'].includes(alertType) ? <label className={styles.field}>Minimum confidence<input className={styles.input} type="number" min="0" max="100" value={minimumConfidence} onChange={(e) => setMinimumConfidence(e.target.value)} /></label> : null}
          <div className={styles.buttonRow}><button className={styles.primaryButton} type="submit" disabled={busy || !name.trim() || !targetId}>{editingId ? 'Save alert' : 'Create alert'}</button></div>
        </div>
      </form>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><h2>Your alerts</h2><p>{alerts.length} private definitions</p></div></div>
        {alerts.length ? <div className={styles.itemList}>{alerts.map((alert) => <article className={styles.itemCard} key={alert.id}><div className={styles.instrument}><strong>{alert.name}</strong><span>{typeLabels[alert.alert_type]} · {targetName(alert)}</span></div><span className={styles.muted}>{alert.is_enabled ? 'Enabled' : 'Disabled'} · last trigger {formatWhen(alert.last_triggered_at)}</span><span className={styles.muted}>{JSON.stringify(alert.condition)}</span><div className={styles.itemActions}><button className={styles.secondaryButton} type="button" onClick={() => editAlert(alert)} disabled={busy}>Edit</button><button className={styles.secondaryButton} type="button" onClick={() => toggleAlert(alert)} disabled={busy}>{alert.is_enabled ? 'Disable' : 'Enable'}</button><button className={styles.dangerButton} type="button" onClick={() => deleteAlert(alert)} disabled={busy}>Delete</button></div></article>)}</div> : <div className={styles.empty}>No alerts yet. Create one above to establish a baseline.</div>}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><h2>Event history</h2><p>Persisted system-generated trigger evidence. Delivery is not requested in v1.</p></div></div>
        {events.length ? <div className={styles.itemList}>{events.map((event) => { const alert=alertMap.get(event.alert_id); return <article className={styles.itemCard} key={event.id}><div className={styles.instrument}><strong>{alert?.name ?? 'Alert event'}</strong><span>{formatWhen(event.triggered_at)}</span></div><span className={styles.muted}>{event.message ?? event.event_key}</span><span className={styles.muted}>{event.trigger_value === null ? String(event.metadata.current_value ?? '') : String(event.trigger_value)} · {event.notification_status}</span><span className={styles.muted}>{String(event.metadata.source_table ?? '')}</span></article> })}</div> : <div className={styles.empty}>No alert events have fired yet.</div>}
      </section>
    </div>
  )
}
