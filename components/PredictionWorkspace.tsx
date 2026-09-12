'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { predictionScorecard, predictionStatus, formatPredictionReturn } from '@/lib/prediction-results.mjs'
import styles from './PredictionWorkspace.module.css'

type Prediction = {
  id: string; symbol: string; instrument_name: string; published_at: string; source_cutoff: string;
  action: 'BUY' | 'HOLD' | 'AVOID'; horizon_sessions: number; entry_deadline: string;
  thesis: string; risks: string; source_rating: string; model_identity: string;
  benchmark_symbol: string | null; currency: string; entry_rule: string; exit_rule: string;
}
type Result = {
  prediction_id: string; evaluated_at: string; status: string; entry_at: string | null;
  exit_at: string | null; entry_price: number | null; exit_price: number | null;
  net_return: number | null; benchmark_return: number | null; reason: string | null;
}
const date = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function PredictionWorkspace({ ownerId, mode }: { ownerId: string; mode: 'recommendations' | 'decision-lab' }) {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [enabled, setEnabled] = useState(false)
  const [horizon, setHorizon] = useState(5)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (signal: AbortSignal) => {
    setState('loading'); setError('')
    try {
      const client = getBrowserSupabase()
      const rows: Prediction[] = []
      // Read every page: old losing picks must not fall outside a recent-row limit.
      for (let offset = 0; ; offset += 500) {
        const response = await client.from('personal_prediction_plans').select('*').eq('owner_user_id', ownerId)
          .order('published_at', { ascending: false }).order('id').range(offset, offset + 499).abortSignal(signal)
        if (response.error) throw response.error
        rows.push(...(response.data ?? []) as Prediction[])
        if ((response.data?.length ?? 0) < 500) break
      }
      const outcomes: Result[] = []
      for (let offset = 0; ; offset += 500) {
        const response = await client.from('personal_prediction_results').select('*').eq('owner_user_id', ownerId)
          .order('evaluated_at', { ascending: false }).order('id').range(offset, offset + 499).abortSignal(signal)
        if (response.error) throw response.error
        outcomes.push(...(response.data ?? []) as Result[])
        if ((response.data?.length ?? 0) < 500) break
      }
      const settings = await client.from('personal_prediction_tracking').select('owner_user_id').eq('owner_user_id', ownerId).abortSignal(signal).maybeSingle()
      if (settings.error) throw settings.error
      if (signal.aborted) return
      setPredictions(rows); setResults(outcomes); setEnabled(!!settings.data); setState('ready')
    } catch (cause) {
      if (signal.aborted) return
      setPredictions([]); setResults([]); setState('error')
      setError(cause instanceof Error ? cause.message : 'Prediction tracking is not available yet. Please try again after the database update is installed.')
    }
  }, [ownerId])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  async function start() {
    setBusy(true); setError('')
    try {
      const { error: failure } = await getBrowserSupabase().rpc('start_personal_prediction_tracking_v1')
      if (failure) throw failure
      await load(new AbortController().signal)
    } catch { setError('Tracking could not be started. Your published predictions have not been changed.') }
    finally { setBusy(false) }
  }
  const visible = predictions.filter(p => p.horizon_sessions === horizon)
  const score = predictionScorecard(predictions, results, horizon)
  const lab = mode === 'decision-lab'
  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>{lab ? 'THE TRACK RECORD' : 'YOUR AI SHORTLIST'}</span>
        <h2>{lab ? 'Did the predictions work?' : 'What to buy. When to exit.'}</h2>
        <p>{lab ? 'Every published call stays here, including losses and calls that never entered.' : 'AI views on shares in your watchlist, with the entry and exit rules written down in advance.'}</p>
      </div>
      <Link href={`/my-dashboard?tab=${lab ? 'recommendations' : 'decision-lab'}`}>{lab ? 'View predictions →' : 'See the track record →'}</Link>
    </header>
    <ol className={styles.steps}><li><strong>1. Read the plan</strong><span>Buy and sell rules are fixed at publication.</span></li><li><strong>2. Tracking starts automatically</strong><span>No manual capture. No orders are placed.</span></li><li><strong>3. Review the outcome</strong><span>Compare the completed pick with its benchmark.</span></li></ol>
    <div className={styles.toolbar}><div role="group" aria-label="Prediction horizon">{[5, 20].map(n => <button key={n} aria-pressed={horizon === n} onClick={() => setHorizon(n)}>{n === 5 ? 'Weekly · 5 sessions' : 'Monthly · 20 sessions'}</button>)}</div><span>{enabled ? 'Automatic tracking enabled' : 'Tracking not started'}</span></div>
    {error && <div role="alert" className={styles.notice}>{error}<button onClick={() => void load(new AbortController().signal)}>Retry</button></div>}
    {state === 'loading' ? <p role="status">Loading your prediction ledger…</p> : state === 'ready' && <>
      {!enabled && <section className={styles.empty}><h3>Start your forward track record</h3><p>Add shares to your watchlist, then enable tracking. Fresh AI assessments will be recorded automatically for both horizons. Earlier assessments are never backdated into results.</p><div><Link href="/watchlists">Choose my shares</Link><button disabled={busy} onClick={() => void start()}>{busy ? 'Starting…' : 'Start tracking my AI picks'}</button></div></section>}
      {lab && <div className={styles.scorecard}><div><span>Published calls</span><strong>{score.published}</strong></div><div><span>Completed buy picks</span><strong>{score.completed}</strong></div><div><span>Profitable picks</span><strong>{score.completed ? `${score.wins} / ${score.completed}` : '—'}</strong></div><div><span>Beat benchmark</span><strong>{score.compared ? `${score.beatBenchmark} / ${score.compared}` : 'Not yet measured'}</strong></div></div>}
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={lab ? 'Prediction performance table' : 'Published prediction table'}><table><caption>{lab ? 'Original plans and observed results' : 'Published plans · fixed timing baseline'} — {horizon === 5 ? 'weekly' : 'monthly'}</caption><thead><tr><th scope="col">Share / published</th><th scope="col">AI call</th><th scope="col">When to buy</th><th scope="col">When to sell</th>{lab ? <><th scope="col">Status</th><th scope="col">Pick return</th><th scope="col">Benchmark</th></> : <th scope="col">Why this share</th>}</tr></thead><tbody>{visible.map(p => {
        const result = results.find(r => r.prediction_id === p.id)
        return <tr key={p.id}><th scope="row"><Link href={`/assessments/${encodeURIComponent(p.symbol)}`}>{p.symbol}</Link><small>{p.instrument_name}</small><time dateTime={p.published_at}>{date(p.published_at)}</time></th><td><strong>{p.action === 'AVOID' ? 'Avoid buying' : p.action === 'HOLD' ? 'Observe' : 'Buy candidate'}</strong><small>Source: {p.source_rating}</small></td><td>{p.action === 'BUY' ? <>Next full-session close after publication<small>Entry expires {date(p.entry_deadline)}</small>{lab && result?.entry_at && <small>Recorded: {date(result.entry_at)} · {p.currency} {result.entry_price}</small>}</> : 'No new position'}</td><td>{p.action === 'BUY' ? <>Close after {p.horizon_sessions} trading sessions from entry<small>Fixed holding period; no AI price target or stop supplied</small>{lab && result?.exit_at && <small>Recorded: {date(result.exit_at)} · {p.currency} {result.exit_price}</small>}</> : 'No exit scheduled'}</td>{lab ? <><td>{p.action !== 'BUY' ? 'Observation only' : predictionStatus(p, result)}{result?.reason && <small>{result.reason}</small>}</td><td>{result?.status === 'COMPLETE' ? formatPredictionReturn(result.net_return) : '—'}<small>{p.currency} · after modelled costs</small></td><td>{p.benchmark_symbol ?? 'Not assigned'}<small>{result?.status === 'COMPLETE' ? formatPredictionReturn(result.benchmark_return) : '—'}</small></td></> : <td><p>{p.thesis}</p><details><summary>Risks and original evidence</summary><p>{p.risks || 'No separate risks supplied.'}</p><small>Model: {p.model_identity}<br/>Evidence cutoff: {date(p.source_cutoff)}<br/>Record: {p.id}</small></details></td>}</tr>
      })}{visible.length === 0 && <tr><td colSpan={lab ? 7 : 5}>No published predictions yet. New calls will appear here automatically once tracking is enabled.</td></tr>}</tbody></table></div>
      {enabled && visible.length === 0 && <section className={styles.empty}><h3>Waiting for the next fresh assessment</h3><p>Your track record starts with new evidence. Nothing is filled using prices or outcomes already known.</p><Link href="/watchlists">Review my watched shares →</Link></section>}
    </>}
    <details className={styles.method}><summary>How the timing and scorecard work</summary><p>This first version tests AI ratings with fixed timing rules, not AI forecasts of an optimal entry or exit date. A buy uses the first completed daily close with a session date strictly after the UTC publication date, provided the price is loaded within seven days. The exit is the close 5 or 20 observed market sessions later. Missing market sessions or prices leave results incomplete. Non-buy calls stay visible as observations.</p><p>Both horizons preserve separate records. Modelled costs are 0.10% on entry and 0.10% on exit. Benchmark results use the same dates and currency, without trading costs. A missing benchmark is not a win. The scorecard measures individual picks, not a funded portfolio or proof of future returns.</p><p>Publication uses the server clock. Plans and recorded outcomes cannot be edited or deleted through the app. Later AI assessments become new records. Tracking runs every 15 minutes, including when this page is closed.</p></details>
  </div>
}

