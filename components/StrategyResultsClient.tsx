'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './StrategyResultsClient.module.css'

type Numeric = number | string | null | undefined

type Strategy = {
  id: string
  strategy_code: string
  strategy_name: string
  strategy_version: number
  description: string | null
  status: string
  live_execution_enabled: boolean
  updated_at: string
}

type TestRun = {
  id: string
  strategy_id: string
  run_name: string
  run_status: string
  test_type: string
  period_start: string | null
  period_end: string | null
  instrument_count: number | null
  trade_count: number | null
  net_profit: Numeric
  return_pct: Numeric
  win_rate_pct: Numeric
  profit_factor: Numeric
  expectancy: Numeric
  max_drawdown_pct: Numeric
  sharpe_ratio: Numeric
  out_of_sample_return_pct: Numeric
  engine_version: string | null
  ingestion_version: string
  metric_definition_version: string
  strategy_snapshot_hash: string | null
  completed_at: string | null
}

type DecisionStep = {
  step: number
  title: string
  node_code: string
  node_type: string
  metric_code?: string
  metric_value?: Numeric
  comparison_operator?: string
  threshold_value?: Numeric
  result?: boolean
  edge_label?: string
  outcome_code?: string
  outcome_status?: string
}

type Evaluation = {
  id: string
  test_run_id: string
  outcome_code: string
  outcome_status: string
  decision_path: DecisionStep[]
  evaluated_at: string
}

function permanentUser(user: User | null | undefined) {
  return user && user.is_anonymous !== true ? user : null
}

function humanise(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

function numberValue(value: Numeric, digits = 2) {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-AU', { maximumFractionDigits: digits })
    : '—'
}

function percent(value: Numeric) {
  const formatted = numberValue(value)
  return formatted === '—' ? formatted : `${formatted}%`
}

function dateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Perth',
  }).format(new Date(value))
}

function decisionEvidence(step: DecisionStep) {
  if (!step.metric_code) return step.edge_label ?? null
  const value = numberValue(step.metric_value, 4)
  const threshold = numberValue(step.threshold_value, 4)
  const comparison = `${step.metric_code} ${value} ${step.comparison_operator ?? ''} ${threshold}`
  return `${comparison} · ${step.result ? 'passed' : 'did not pass'}`
}

export default function StrategyResultsClient() {
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [runs, setRuns] = useState<TestRun[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async (userId: string) => {
    setLoading(true)
    setError('')
    try {
      const supabase = getBrowserSupabase()
      const strategyResult = await supabase
        .from('trading_strategies')
        .select('id,strategy_code,strategy_name,strategy_version,description,status,live_execution_enabled,updated_at')
        .eq('owner_user_id', userId)
        .order('updated_at', { ascending: false })

      if (strategyResult.error) throw strategyResult.error
      const strategyRows = (strategyResult.data ?? []) as Strategy[]
      setStrategies(strategyRows)

      const strategyIds = strategyRows.map((strategy) => strategy.id)
      if (!strategyIds.length) {
        setRuns([])
        setEvaluations([])
        return
      }

      const runResult = await supabase
        .from('trading_test_runs')
        .select('id,strategy_id,run_name,run_status,test_type,period_start,period_end,instrument_count,trade_count,net_profit,return_pct,win_rate_pct,profit_factor,expectancy,max_drawdown_pct,sharpe_ratio,out_of_sample_return_pct,engine_version,ingestion_version,metric_definition_version,strategy_snapshot_hash,completed_at')
        .eq('owner_user_id', userId)
        .in('strategy_id', strategyIds)
        .order('created_at', { ascending: false })

      if (runResult.error) throw runResult.error
      const runRows = (runResult.data ?? []) as TestRun[]
      setRuns(runRows)

      const runIds = runRows.map((run) => run.id)
      if (!runIds.length) {
        setEvaluations([])
        return
      }

      const evaluationResult = await supabase
        .from('trading_decision_evaluations')
        .select('id,test_run_id,outcome_code,outcome_status,decision_path,evaluated_at')
        .eq('owner_user_id', userId)
        .in('test_run_id', runIds)
        .order('evaluated_at', { ascending: false })

      if (evaluationResult.error) throw evaluationResult.error
      setEvaluations((evaluationResult.data ?? []) as Evaluation[])
    } finally {
      setLoading(false)
    }
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
      if (data.session?.user?.is_anonymous) {
        setError('Anonymous sessions cannot read private strategy evidence. Sign in with a permanent email account.')
      }
      if (current) {
        loadData(current.id).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Strategy evidence could not be loaded.'))
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      const current = permanentUser(session?.user)
      setUser(current)
      setAuthReady(true)
      if (current) {
        setError('')
        loadData(current.id).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Strategy evidence could not be loaded.'))
      } else {
        setStrategies([])
        setRuns([])
        setEvaluations([])
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadData])

  const evaluationMap = useMemo(
    () => new Map(evaluations.map((evaluation) => [evaluation.test_run_id, evaluation])),
    [evaluations],
  )

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setBusy(true)
    setError('')
    setStatus('')
    try {
      const { error: authError } = await getBrowserSupabase().auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/strategies`,
          shouldCreateUser: true,
        },
      })
      if (authError) throw authError
      setStatus('Check your email for the secure sign-in link.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Secure sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    setError('')
    try {
      const { error: authError } = await getBrowserSupabase().auth.signOut()
      if (authError) throw authError
      setStatus('Signed out.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Sign out failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!authReady) {
    return <div className={styles.authCard}>Checking secure strategy session…</div>
  }

  if (!user) {
    return (
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <h1>Strategies</h1>
            <p>Real strategy tests and review outcomes are private to their owner.</p>
          </div>
        </header>
        {error ? <p className={styles.error}>{error}</p> : null}
        {status ? <p className={styles.statusMessage}>{status}</p> : null}
        <section className={styles.authCard}>
          <h2>Sign in to view strategy evidence</h2>
          <p>Authentication preserves the existing Supabase row-level security boundary. No privileged key is used in the browser.</p>
          <form className={styles.signInForm} onSubmit={signIn}>
            <label>
              Email address
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            </label>
            <button type="submit" disabled={busy}>Send secure sign-in link</button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <h1>Strategies</h1>
          <p>Owner-scoped strategy definitions, real test evidence and persisted Standard Strategy Review outcomes.</p>
        </div>
        <div className={styles.signedIn}>
          <span>{user.email ?? 'Authenticated owner'}</span>
          <button type="button" onClick={signOut} disabled={busy}>Sign out</button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.statusMessage}>{status}</p> : null}

      <section className={styles.summaryGrid} aria-label="Strategy summary">
        <article><span>Strategies</span><strong>{strategies.length}</strong><small>Visible to this owner</small></article>
        <article><span>Successful tests</span><strong>{runs.filter((run) => run.run_status === 'succeeded').length}</strong><small>Persisted real runs</small></article>
        <article><span>Completed reviews</span><strong>{evaluations.length}</strong><small>Database decision outcomes</small></article>
        <article><span>Live trading</span><strong>{strategies.some((strategy) => strategy.live_execution_enabled) ? 'Enabled' : 'Disabled'}</strong><small>Safety boundary</small></article>
      </section>

      {loading ? <div className={styles.authCard}>Loading owner-scoped strategy evidence…</div> : null}

      {!loading && strategies.length === 0 ? (
        <section className={styles.empty}>
          <strong>No strategy evidence is visible for this account.</strong>
          <span>Confirm you signed in with the owner account used to create the strategy. Row-level security intentionally hides other owners’ records.</span>
        </section>
      ) : null}

      {!loading && strategies.map((strategy) => {
        const strategyRuns = runs.filter((run) => run.strategy_id === strategy.id)
        return (
          <section className={styles.strategyPanel} key={strategy.id}>
            <div className={styles.strategyHeader}>
              <div>
                <span className={styles.eyebrow}>{strategy.strategy_code} · v{strategy.strategy_version}</span>
                <h2>{strategy.strategy_name}</h2>
                <p>{strategy.description ?? 'No strategy description has been persisted.'}</p>
              </div>
              <div className={styles.badges}>
                <span className={styles.lifecycle}>{humanise(strategy.status)}</span>
                <span className={strategy.live_execution_enabled ? styles.liveEnabled : styles.liveDisabled}>
                  Live trading {strategy.live_execution_enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
            </div>

            {strategyRuns.length === 0 ? (
              <div className={styles.emptyInline}>No real test run has been persisted for this strategy.</div>
            ) : strategyRuns.map((run) => {
              const evaluation = evaluationMap.get(run.id)
              return (
                <article className={styles.runCard} key={run.id}>
                  <div className={styles.runHeader}>
                    <div>
                      <span className={styles.eyebrow}>{humanise(run.test_type)} · {humanise(run.run_status)}</span>
                      <h3>{run.run_name}</h3>
                      <p>{run.period_start ?? '—'} to {run.period_end ?? '—'} · {run.instrument_count ?? '—'} instruments</p>
                    </div>
                    {evaluation ? (
                      <span className={styles.outcomeBadge}>{humanise(evaluation.outcome_status)}</span>
                    ) : <span className={styles.pendingBadge}>Review pending</span>}
                  </div>

                  <div className={styles.metrics}>
                    <article><span>Trades</span><strong>{numberValue(run.trade_count, 0)}</strong></article>
                    <article><span>Total return</span><strong>{percent(run.return_pct)}</strong></article>
                    <article><span>Out-of-sample</span><strong>{percent(run.out_of_sample_return_pct)}</strong></article>
                    <article><span>Win rate</span><strong>{percent(run.win_rate_pct)}</strong></article>
                    <article><span>Profit factor</span><strong>{numberValue(run.profit_factor, 3)}</strong></article>
                    <article><span>Expectancy</span><strong>{numberValue(run.expectancy, 2)}</strong></article>
                    <article><span>Max drawdown</span><strong>{percent(run.max_drawdown_pct)}</strong></article>
                    <article><span>Sharpe ratio</span><strong>{numberValue(run.sharpe_ratio, 3)}</strong></article>
                  </div>

                  {evaluation ? (
                    <section className={styles.review}>
                      <div className={styles.reviewHeader}>
                        <div>
                          <span className={styles.eyebrow}>Standard Strategy Review</span>
                          <h3>{humanise(evaluation.outcome_code)}</h3>
                          <p>Persisted outcome: <strong>{humanise(evaluation.outcome_status)}</strong> · evaluated {dateTime(evaluation.evaluated_at)}</p>
                        </div>
                        <span className={styles.safetyCallout}>Evidence only · no live execution</span>
                      </div>
                      <ol className={styles.decisionPath}>
                        {evaluation.decision_path.map((step) => (
                          <li key={`${evaluation.id}-${step.step}`} className={step.result === false ? styles.failedStep : ''}>
                            <span>{step.step}</span>
                            <div>
                              <strong>{step.title}</strong>
                              {decisionEvidence(step) ? <small>{decisionEvidence(step)}</small> : null}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : (
                    <section className={styles.reviewPending}>
                      This succeeded run has no persisted decision evaluation yet. No outcome has been inferred.
                    </section>
                  )}

                  <details className={styles.provenance}>
                    <summary>Evidence and provenance</summary>
                    <dl>
                      <div><dt>Completed</dt><dd>{dateTime(run.completed_at)}</dd></div>
                      <div><dt>Engine</dt><dd>{run.engine_version ?? '—'}</dd></div>
                      <div><dt>Ingestion contract</dt><dd>{run.ingestion_version}</dd></div>
                      <div><dt>Metric definitions</dt><dd>{run.metric_definition_version}</dd></div>
                      <div><dt>Strategy snapshot</dt><dd>{run.strategy_snapshot_hash ?? '—'}</dd></div>
                      <div><dt>Net profit</dt><dd>{numberValue(run.net_profit, 2)}</dd></div>
                    </dl>
                  </details>
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
