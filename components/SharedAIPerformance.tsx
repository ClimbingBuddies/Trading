'use client'

import { useEffect, useId, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './SharedAIPerformance.module.css'

type Decimal = string | null
type Metrics = { sampleSize: number; meanActionReturn: Decimal; meanStockReturn: Decimal; meanBenchmarkReturn: Decimal; meanExcessStock: Decimal; meanExcessBenchmark: Decimal; benchmarkBeatRate: Decimal; stockBeatRate: Decimal; worstActionReturn: Decimal; maxDrawdown: Decimal }
type Model = { modelIdentity: string; sampleSize: number; meanActionReturn: Decimal; meanExcessBenchmark: Decimal; benchmarkBeatRate: Decimal }
type Action = { action: string; sampleSize: number; meanActionReturn: Decimal; meanExcessStock: Decimal; meanExcessBenchmark: Decimal }
type Trial = { eventId: string; callId: string; symbol: string; action: string; modelIdentity: string; publishedAt: string; entryAt: string | null; asOf: string | null; actionReturn: Decimal; stockReturn: Decimal; benchmarkReturn: Decimal; excessStock: Decimal; excessBenchmark: Decimal; maxDrawdown: Decimal }
type Payload = { contractVersion: number; methodology: string; generatedAt: string; horizon: number; counts: { events: number; matured: number; pending: number; blocked: number }; overall: Metrics; byModel: Model[]; byAction: Action[]; recent: Trial[]; limitations: string[] }
type SavedDecision = { callId: string; symbol: string; action: string; publishedAt: string }
const metricKeys = ['meanActionReturn', 'meanStockReturn', 'meanBenchmarkReturn', 'meanExcessStock', 'meanExcessBenchmark', 'benchmarkBeatRate', 'stockBeatRate', 'worstActionReturn', 'maxDrawdown']
const decimal = (value: unknown) => value === null || typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown) => typeof value === 'string' && value.length > 0
const validMetrics = (value: unknown, keys: string[]) => record(value) && keys.every(key => decimal(value[key]))
function validPayload(value: unknown, horizon: number): value is Payload {
  if (!record(value) || value.contractVersion !== 1 || value.methodology !== 'shared-action-trial-v1' || value.horizon !== horizon || !text(value.generatedAt) || !Number.isFinite(Date.parse(String(value.generatedAt)))) return false
  const counts = value.counts
  if (!record(counts) || !['events', 'matured', 'pending', 'blocked'].every(key => count(counts[key])) || !validMetrics(value.overall, metricKeys) || !record(value.overall) || !count(value.overall.sampleSize)) return false
  if (!Array.isArray(value.byModel) || !value.byModel.every(row => record(row) && text(row.modelIdentity) && count(row.sampleSize) && validMetrics(row, ['meanActionReturn', 'meanExcessBenchmark', 'benchmarkBeatRate']))) return false
  if (!Array.isArray(value.byAction) || !value.byAction.every(row => record(row) && text(row.action) && count(row.sampleSize) && validMetrics(row, ['meanActionReturn', 'meanExcessStock', 'meanExcessBenchmark']))) return false
  return Array.isArray(value.recent) && value.recent.length <= 20 && value.recent.every(row => record(row) && ['eventId', 'callId', 'symbol', 'action', 'modelIdentity', 'publishedAt'].every(key => text(row[key])) && ['entryAt', 'asOf'].every(key => row[key] === null || text(row[key])) && validMetrics(row, ['actionReturn', 'stockReturn', 'benchmarkReturn', 'excessStock', 'excessBenchmark', 'maxDrawdown'])) && Array.isArray(value.limitations) && value.limitations.every(item => typeof item === 'string')
}
const percent = (value: Decimal, signed = true) => value === null ? 'Not available' : `${signed && Number(value) > 0 ? '+' : ''}${(Number(value) * 100).toFixed(2)}%`
const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'

export default function SharedAIPerformance({ scope, revision = 0, savedDecisions = [], savedDecisionsLoading = false, savedDecisionsError = '', onOpenDecision }: { scope: 'all' | 'watched'; revision?: number; savedDecisions?: SavedDecision[]; savedDecisionsLoading?: boolean; savedDecisionsError?: string; onOpenDecision: (callId: string, eventId?: string) => void }) {
  const id = useId()
  const [horizon, setHorizon] = useState<5 | 20>(5)
  const [retry, setRetry] = useState(0)
  const requestKey = `${scope}:${horizon}:${revision}:${retry}`
  const [result, setResult] = useState<{ key: string; payload: Payload | null; error: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const client = getBrowserSupabase()
        if (!client) throw new Error('Unavailable')
        const { data, error } = await client.rpc('shared_ai_performance_v1', { p_scope: scope, p_horizon: horizon })
        if (error || !validPayload(data, horizon)) throw new Error('Unverified performance response')
        if (!cancelled) setResult({ key: requestKey, payload: data, error: false })
      } catch { if (!cancelled) setResult({ key: requestKey, payload: null, error: true }) }
    })()
    return () => { cancelled = true }
  }, [scope, horizon, requestKey])
  const current = result?.key === requestKey ? result : null
  const payload = current?.payload
  return <section className={styles.card} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><div><h2 id={`${id}-title`}>AI performance</h2><p>{scope === 'watched' ? 'My watched shares' : 'All shared AI calls'} · Full cohort of original calls and reviews</p></div><label htmlFor={`${id}-horizon`}>Action trial horizon <select id={`${id}-horizon`} value={horizon} onChange={e => setHorizon(Number(e.target.value) as 5 | 20)}><option value={5}>5 sessions</option><option value={20}>20 sessions</option></select></label></header>
    {!current && <p role="status">Loading verified AI performance…</p>}
    {current?.error && <div className={styles.error} role="alert"><p>AI performance could not be verified. The service may be unavailable or access could not be confirmed. No results have been substituted.</p><button onClick={() => setRetry(value => value + 1)}>Retry performance</button></div>}
    <div className={styles.savedDecisions}><h3>Saved decision history · Current calls page</h3><p className={styles.muted}>Open the saved reasoning even when action trials are pending or blocked. These controls cover the current calls page; performance metrics cover the full cohort. Use the call list pagination for more saved decisions.</p>{savedDecisionsLoading ? <p role="status">Loading saved decision controls…</p> : savedDecisionsError ? <p role="alert">Saved decision controls could not be loaded. {savedDecisionsError}</p> : savedDecisions.length === 0 ? <p>No saved calls on the current page.</p> : <ul>{savedDecisions.map(decision => <li key={decision.callId}><div><strong>{decision.symbol} · {decision.action}</strong><small>Original published {date(decision.publishedAt)}</small></div><button className={styles.historyArrow} onClick={() => onOpenDecision(decision.callId)} aria-label={`View decision history for ${decision.symbol}`}><span aria-hidden="true">›</span><span>Decision history</span></button></li>)}</ul>}</div>
    {payload && <>
      <p className={styles.counts}>{payload.counts.events} AI events · {payload.counts.matured} matured · {payload.counts.pending} pending · {payload.counts.blocked} blocked</p>
      {payload.overall.sampleSize === 0 ? <p className={styles.notice}>{payload.counts.events === 0 ? 'No shared AI events in this scope yet.' : 'No verified mature trials at this horizon yet. Pending or blocked evidence is not a zero return.'} Performance evidence will appear after publication and verified market sessions.</p> : <dl className={styles.metrics}><div><dt>Mean excess vs benchmark</dt><dd>{percent(payload.overall.meanExcessBenchmark)}</dd></div><div><dt>Benchmark beat rate</dt><dd>{percent(payload.overall.benchmarkBeatRate, false)}</dd></div><div><dt>Worst trial drawdown</dt><dd>{percent(payload.overall.maxDrawdown, false)}</dd></div><div><dt>Verified trial sample</dt><dd>{payload.overall.sampleSize}</dd></div></dl>}
      <p className={styles.muted}>Overlapping trials are correlated observations. Small samples do not establish reliable AI performance; model changes and shared market conditions affect comparisons. Trial drawdown is not portfolio drawdown.</p>
      <details className={styles.details}><summary>Performance detail and methodology</summary>
        <dl className={styles.metrics}>{[
          ['Mean action return', payload.overall.meanActionReturn], ['Mean full-share return', payload.overall.meanStockReturn], ['Mean benchmark return', payload.overall.meanBenchmarkReturn], ['Mean excess vs full share', payload.overall.meanExcessStock], ['Full-share beat rate', payload.overall.stockBeatRate], ['Worst action return', payload.overall.worstActionReturn]
        ].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{percent(value as Decimal, name !== 'Full-share beat rate')}</dd></div>)}</dl>
        <h3>By model</h3>{payload.byModel.length === 0 ? <p>No mature model results.</p> : <div className={styles.table}><table><caption>Verified trials grouped by recorded model identity</caption><thead><tr><th>Model</th><th>Sample</th><th>Mean action</th><th>Mean excess vs benchmark</th><th>Benchmark beat rate</th></tr></thead><tbody>{payload.byModel.map(row => <tr key={row.modelIdentity}><th scope="row">{row.modelIdentity}</th><td>{row.sampleSize}</td><td>{percent(row.meanActionReturn)}</td><td>{percent(row.meanExcessBenchmark)}</td><td>{percent(row.benchmarkBeatRate, false)}</td></tr>)}</tbody></table></div>}
        <h3>By action</h3><p className={styles.muted}>For WAIT, AVOID and SELL, excess vs full share measures losses avoided when positive and missed opportunities when negative. Benchmark excess remains a separate comparison. REDUCE measures a standardized half-exposure trial.</p>
        {payload.byAction.length === 0 ? <p>No mature action results.</p> : <div className={styles.table}><table><caption>Action outcomes, including avoidance and opportunity cost</caption><thead><tr><th>Action</th><th>Sample</th><th>Mean action</th><th>Mean excess vs full share</th><th>Mean excess vs benchmark</th></tr></thead><tbody>{payload.byAction.map(row => <tr key={row.action}><th scope="row">{row.action === 'REDUCE' ? 'REDUCE (50% exposure)' : row.action}</th><td>{row.sampleSize}</td><td>{percent(row.meanActionReturn)}</td><td>{percent(row.meanExcessStock)}</td><td>{percent(row.meanExcessBenchmark)}</td></tr>)}</tbody></table></div>}
        <h3>Recent verified trials</h3>{payload.recent.length === 0 ? <p>No verified trial results yet.</p> : <div className={styles.table}><table><caption>Up to 20 recent results; cohort metrics above include the full scope</caption><thead><tr><th>Share / model</th><th>Action</th><th>Published / entry / checkpoint</th><th>Action</th><th>Full share</th><th>Benchmark</th><th>Excess vs share</th><th>Excess vs benchmark</th><th>Trial drawdown</th><th>Decision history</th></tr></thead><tbody>{payload.recent.map(row => <tr key={row.eventId}><th scope="row">{row.symbol}<small>{row.modelIdentity}</small></th><td>{row.action}</td><td>{date(row.publishedAt)}<small>Entry: {date(row.entryAt)}<br />Checkpoint: {date(row.asOf)}</small></td><td>{percent(row.actionReturn)}</td><td>{percent(row.stockReturn)}</td><td>{percent(row.benchmarkReturn)}</td><td>{percent(row.excessStock)}</td><td>{percent(row.excessBenchmark)}</td><td>{percent(row.maxDrawdown, false)}</td><td><button className={styles.historyArrow} onClick={() => onOpenDecision(row.callId, row.eventId)} aria-label={`View decision history for ${row.symbol}, ${row.action} event ${row.eventId}`}><span aria-hidden="true">›</span><span>View decision</span></button></td></tr>)}</tbody></table></div>}
        <h3>How to interpret these figures</h3><ul><li>Each original call or review starts a standalone hypothetical allocation at the close of the first verified session opening strictly after publication. Results use {horizon} subsequent market sessions.</li><li>BUY/HOLD: 100% share exposure. REDUCE: standardized 50% share exposure, independent of your holdings. WAIT/AVOID/SELL: 0% share exposure. Remaining cash earns zero.</li><li>Action costs are 0.1% per side on the share allocation. Full-share and pinned benchmark comparators each include the same 0.1% costs per side at full exposure.</li><li>Means and beat rates summarize verified mature trials, not an investable portfolio or independent trades. Worst trial drawdown is the greatest verified peak-to-trough allocation decline including cash and entry costs; it is not a strategy equity curve.</li><li>Missing or inconsistent evidence stays unavailable. Corporate-action changes or source revisions block evaluation; dividends are not assumed accounted for.</li><li>The separate paper returns in the call list and drawer follow the existing Buy-to-Sell cycle and its own sizing and benchmark cost convention.</li>{payload.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
        <p className={styles.muted}>Generated {date(payload.generatedAt)} · shared-action-trial-v1</p>
      </details>
    </>}
  </section>
}
