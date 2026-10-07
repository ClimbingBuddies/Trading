'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './SharedDecisionWorkspace.module.css'
import TradingPipelineStatus from './TradingPipelineStatus'
import SharedAIPerformance from './SharedAIPerformance'
import SharedResearchRecommendations from './SharedResearchRecommendations'

type Instrument = { id: string; symbol: string; name: string; exchange: string; currency: string }
type Decision = { id: string; action: string; publishedAt: string; sourceCutoff: string; thesis: string; risks: string; modelIdentity: string; assessmentId: string }
type Blocker = { code: string; message: string; stage: string; lastAttemptAt: string | null; nextAction: string }
type Fill = { outcomeId: string; at: string; price: string; currency: string }
type Item = { callId: string; instrument: Instrument; original: Decision; latestReview: Decision | null; lastReviewedAt: string; state: string; dataStatus: string; entry: Fill | null; exit: Fill | null; pricesAsOf: string | null; blocker: Blocker | null; performance: { outcomeId: string; asOf: string; netReturn: string | null; benchmarkReturn: string | null; costPerSide: string; benchmark: Instrument; kind: string } | null }
type Payload = { contractVersion: number; generatedAt: string; items: Item[]; nextCursor: string | null; blockedItems: { instrument: Instrument; blocker: Blocker }[]; blockedNextCursor: string | null; counts: { trackedCalls: number; watching: number; awaitingEntry: number; open: number; exitSignal: number; closed: number; cancelled: number; blockedWithoutCall: number; callsNeedingAttention: number }; scheduledRun?: { state: string | null; lastAttemptAt: string | null; lastCompletedAt: string | null } | null }
type Detail = { item: Item; reviews: Decision[]; outcomes: { id: string; kind?: string; outcome_type?: string; asOf: string; recordedAt?: string; recorded_at?: string }[]; evidence: { status?: string; message?: string; methodology?: string; costPerSide?: string }; reviewNextCursor?: string | null; outcomeNextCursor?: string | null }
type Note = { id: string; action: string; note: string; created_at: string }
const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ')
const percent = (value?: string | null) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? `${Number(value) > 0 ? '+' : ''}${(Number(value) * 100).toFixed(2)}%` : '—'
const colour = (value?: string | null) => value == null ? '' : Number(value) > 0 ? styles.positive : Number(value) < 0 ? styles.negative : ''
const readError = 'Shared Decision Lab is unavailable. Its data service may not be installed yet, or access could not be verified. No results have been substituted.'

// Display-only fixture. Never passed to database reads or writes.
const previewOriginal: Decision = { id: 'preview-original', action: 'BUY', publishedAt: '2026-09-02T08:00:00Z', sourceCutoff: '2026-09-02T07:00:00Z', thesis: 'Revenue growth supports entry; valuation remains a risk.', risks: 'Illustrative example only.', modelIdentity: 'Preview', assessmentId: 'preview' }
const previewReview: Decision = { ...previewOriginal, id: 'preview-review', action: 'HOLD', publishedAt: '2026-09-09T08:00:00Z', thesis: 'Thesis unchanged.' }
const previewDetail: Detail = { item: { callId: 'preview', instrument: { id: 'preview', symbol: 'AVGO', name: 'Broadcom', exchange: 'NASDAQ', currency: 'USD' }, original: previewOriginal, latestReview: previewReview, lastReviewedAt: previewReview.publishedAt, state: 'OPEN', dataStatus: 'READY', entry: { outcomeId: 'preview-entry', at: '2026-09-03T20:00:00Z', price: '100', currency: 'USD' }, exit: null, pricesAsOf: previewReview.publishedAt, blocker: null, performance: { outcomeId: 'preview-mark', asOf: previewReview.publishedAt, netReturn: '0.042', benchmarkReturn: '0.028', costPerSide: '0.001', kind: 'MARK', benchmark: { id: 'preview-benchmark', symbol: 'QQQ', name: 'Sample benchmark', exchange: 'NASDAQ', currency: 'USD' } } }, reviews: [previewReview], outcomes: [{ id: 'preview-entry', kind: 'ENTRY', asOf: '2026-09-03T20:00:00Z', recordedAt: '2026-09-03T21:00:00Z' }], evidence: { status: 'sample', message: 'Illustrative layout only. Figures are from the design concept, not calculated market results.' } }

export default function SharedDecisionWorkspace() {
  const [scope, setScope] = useState<'all' | 'watched'>('all')
  const [checkpoint, setCheckpoint] = useState('latest')
  const [page, setPage] = useState({ cursor: null as string | null, blocked: null as string | null })
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<{ callId: string; eventId?: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPayload(null)
    void (async () => {
      try {
        const client = getBrowserSupabase()
        if (!client) throw new Error('Unavailable')
        const { data, error: failure } = await client.rpc('shared_decision_dashboard_v1', { p_scope: scope, p_checkpoint: checkpoint, p_cursor: page.cursor, p_blocked_cursor: page.blocked, p_limit: 50 })
        if (failure || !data || data.contractVersion !== 1 || !Array.isArray(data.items) || !Array.isArray(data.blockedItems) || !data.counts) throw new Error('Invalid response')
        if (!cancelled) setPayload(data as Payload)
      } catch { if (!cancelled) setError(readError) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [scope, checkpoint, page, revision])
  const reset = () => { setPage({ cursor: null, blocked: null }); setRevision(x => x + 1) }
  const needs = payload ? payload.counts.callsNeedingAttention + payload.counts.blockedWithoutCall : null
  return <div className={styles.workspace}>
    <TradingPipelineStatus />
    {payload && payload.counts.trackedCalls > 0 && <div className={styles.summary}><span>{payload.counts.open + payload.counts.exitSignal} open</span><span>{payload.counts.closed} closed</span><span>{payload.counts.watching + payload.counts.awaitingEntry} waiting</span></div>}
    <div className={styles.toolbar}><div><button aria-pressed={scope === 'all'} onClick={() => { setScope('all'); setPage({ cursor: null, blocked: null }) }}>All AI calls</button><button aria-pressed={scope === 'watched'} onClick={() => { setScope('watched'); setPage({ cursor: null, blocked: null }) }}>My watched shares</button></div><label>Performance <select value={checkpoint} onChange={e => { setCheckpoint(e.target.value); setPage({ cursor: null, blocked: null }) }}><option value="latest">Latest</option><option value="5">5 sessions</option><option value="20">20 sessions</option></select></label><button disabled={loading} onClick={reset}>Refresh</button></div>
    <SharedAIPerformance scope={scope} revision={revision} savedDecisions={(payload?.items || []).map(item => ({ callId: item.callId, symbol: item.instrument.symbol, action: item.original.action, publishedAt: item.original.publishedAt }))} savedDecisionsLoading={loading} savedDecisionsError={error} onOpenDecision={(callId, eventId) => setSelected({ callId, eventId })} />
    <SharedResearchRecommendations scope={scope} revision={revision} />
    {loading && <p role="status">Loading shared records…</p>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {payload && <>
      {payload.counts.trackedCalls === 0 ? <div className={styles.empty}><h3>No shared AI calls published yet</h3><p>{payload.counts.blockedWithoutCall > 0 ? `${payload.counts.blockedWithoutCall} shares have no shared AI call yet.` : 'Published AI calls and their results will appear here.'}</p></div> : <>
      <div className={styles.table}><table><caption className={styles.srOnly}>Shared AI calls</caption><thead><tr><th>Share</th><th>Original AI call</th><th>Latest update</th><th>Paper return</th><th>Benchmark</th><th>Status</th><th>Decision history</th></tr></thead><tbody>{payload.items.map(item => <tr key={item.callId}><td><button className={styles.share} onClick={() => setSelected({ callId: item.callId })} aria-label={`View ${item.instrument.symbol} decision details`}>{item.instrument.symbol}</button><small>{item.instrument.name} · {item.instrument.exchange}</small></td><td>{item.original.action}<small>{date(item.original.publishedAt)}</small></td><td>{item.latestReview?.action || 'Original call'}<small>Reviewed {date(item.lastReviewedAt)}</small></td><td className={colour(item.performance?.netReturn)}>{percent(item.performance?.netReturn)}<small>{item.performance ? `${item.dataStatus !== 'READY' ? 'Historical · ' : ''}${date(item.performance.asOf)}` : item.dataStatus === 'READY' && checkpoint !== 'latest' ? 'Checkpoint not reached' : item.state === 'WATCHING' ? 'No entry' : item.state === 'AWAITING_ENTRY' ? 'Awaiting entry' : 'Awaiting evidence'}</small></td><td className={colour(item.performance?.benchmarkReturn)}>{percent(item.performance?.benchmarkReturn)}<small>{item.performance?.benchmark?.symbol || 'Not available'}</small></td><td><span className={styles.pill}>{label(item.state)}</span>{item.dataStatus !== 'READY' && <small>{label(item.dataStatus)}</small>}</td><td><button className={styles.historyArrow} onClick={() => setSelected({ callId: item.callId })} aria-label={`View decision history for ${item.instrument.symbol}`}><span aria-hidden="true">›</span></button></td></tr>)}</tbody></table></div>
      {!payload.items.length && <p>No calls on this page. Return to the first page to see results.</p>}
      <div className={styles.toolbar}><span className={styles.muted}>Paper returns after costs  |  Benchmark before costs</span>{payload.nextCursor && <button onClick={() => setPage(p => ({ ...p, cursor: payload.nextCursor }))}>Next calls</button>}{page.cursor && <button onClick={() => setPage(p => ({ ...p, cursor: null }))}>First calls</button>}</div>
      </>}
      <details className={styles.disclosure}><summary>{payload.counts.callsNeedingAttention > 0 ? `Research and data issues (${needs})` : `View shares without an AI call (${payload.counts.blockedWithoutCall})`}</summary><p className={styles.muted}>These are research or data-processing issues, not buy or sell alerts. The research controller or an administrator must resolve them.</p><div className={styles.table}><table><thead><tr><th>Share</th><th>Issue</th><th>Next step</th></tr></thead><tbody>{[...payload.items.filter(i => i.blocker || i.dataStatus !== 'READY').map(i => ({ instrument: i.instrument, blocker: i.blocker || { code: i.dataStatus, message: label(i.dataStatus), stage: 'evaluation', lastAttemptAt: null, nextAction: 'Await verified evidence.' } })), ...payload.blockedItems].map((i, index) => <tr key={`${i.instrument.id}-${index}`}><td><strong>{i.instrument.symbol}</strong><small>{i.instrument.exchange}</small></td><td>{i.blocker.message}<small>{i.blocker.stage} · Last attempt: {date(i.blocker.lastAttemptAt)}</small></td><td>{i.blocker.nextAction}</td></tr>)}</tbody></table></div>{needs === 0 && <p>No recorded blockers in this scope.</p>}{payload.blockedNextCursor && <button onClick={() => setPage(p => ({ ...p, blocked: payload.blockedNextCursor }))}>Next blocked shares</button>}{page.blocked && <button onClick={() => setPage(p => ({ ...p, blocked: null }))}>First blocked shares</button>}</details>
    </>}
    {selected && <DecisionDrawer key={`${selected.callId}:${selected.eventId || ''}`} callId={selected.callId} eventId={selected.eventId} onClose={() => setSelected(null)} />}
  </div>
}

function DecisionDrawer({ callId, eventId, onClose, preview = false }: { callId: string; eventId?: string; onClose: () => void; preview?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [detail, setDetail] = useState<Detail | null>(preview ? previewDetail : null)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [noteError, setNoteError] = useState('')
  const [notePage, setNotePage] = useState(0)
  const [hasMoreNotes, setHasMoreNotes] = useState(false)
  const [note, setNote] = useState('')
  const [action, setAction] = useState('NOTE')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const notesRequest = useRef(0)
  const request = useRef<{ id: string; action: string; note: string } | null>(null)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  useEffect(() => {
    if (preview) return
    let cancelled = false
    void (async () => { try {
      const client = getBrowserSupabase(); if (!client) throw new Error()
      const { data, error: failure } = await client.rpc('shared_decision_detail_v1', { p_call: callId })
      if (failure || !data?.item || data.item.callId !== callId || !Array.isArray(data.reviews) || !Array.isArray(data.outcomes)) throw new Error()
      if (!cancelled) setDetail(data)
    } catch { if (!cancelled) setError('This shared call could not be loaded. It may be unavailable or you may not have access.') } })()
    return () => { cancelled = true }
  }, [callId, preview])
  const loadNotes = useCallback(async (page: number) => {
    if (preview) return
    const token = ++notesRequest.current
    try {
      const client = getBrowserSupabase(); if (!client) throw new Error()
      const { data, error: failure } = await client.from('shared_decision_private_notes').select('id,action,note,created_at').eq('call_id', callId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 20, page * 20 + 20)
      if (failure) throw new Error()
      if (token !== notesRequest.current) return
      setNoteError(''); setNotes((data || []).slice(0, 20)); setHasMoreNotes((data || []).length > 20)
    } catch { if (token === notesRequest.current) setNoteError('Your private notes could not be loaded. Previous notes may still be shown.') }
  }, [callId, preview])
  useEffect(() => { void loadNotes(notePage) }, [loadNotes, notePage])
  async function moreHistory() {
    if (!detail || historyLoading) return
    setHistoryLoading(true); setHistoryError('')
    try {
      const client = getBrowserSupabase(); if (!client) throw new Error()
      const { data, error: failure } = await client.rpc('shared_decision_detail_v1', { p_call: callId, p_review_cursor: detail.reviewNextCursor || null, p_outcome_cursor: detail.outcomeNextCursor || null, p_limit: 50 })
      if (failure || data?.item?.callId !== callId || !Array.isArray(data.reviews) || !Array.isArray(data.outcomes)) throw new Error()
      const merge = <T extends { id: string }>(old: T[], next: T[]) => [...new Map([...old, ...next].map(row => [row.id, row])).values()]
      setDetail(current => current ? { ...current, reviews: merge(current.reviews, detail.reviewNextCursor ? data.reviews : []), outcomes: merge(current.outcomes, detail.outcomeNextCursor ? data.outcomes : []), reviewNextCursor: detail.reviewNextCursor ? data.reviewNextCursor : null, outcomeNextCursor: detail.outcomeNextCursor ? data.outcomeNextCursor : null } : current)
    } catch { setHistoryError('More history could not be loaded. The timeline below is incomplete; please retry.') }
    finally { setHistoryLoading(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (preview || saving || note.trim().length < 3) return
    setSaving(true); setMessage('')
    const trimmed = note.trim()
    if (!request.current || request.current.note !== trimmed || request.current.action !== action) request.current = { id: crypto.randomUUID(), note: trimmed, action }
    try {
      const client = getBrowserSupabase(); if (!client) throw new Error()
      const { error: failure } = await client.rpc('append_shared_decision_private_note', { p_call: callId, p_action: request.current.action, p_note: request.current.note, p_request: request.current.id })
      if (failure) throw new Error()
      request.current = null; setNote(''); setMessage('Private note saved.'); setNotePage(0); await loadNotes(0)
    } catch { setMessage('Save not confirmed. Retry with the same text to avoid duplicate notes.') }
    finally { setSaving(false) }
  }
  const item = detail?.item
  const selectedReview = eventId ? detail?.reviews.find(review => review.id === eventId) : undefined
  const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
  const actionColour = (value: string) => value === 'BUY' ? styles.positive : value === 'SELL' || value === 'AVOID' ? styles.negative : styles.muted
  const outcomeLabel = (kind: string) => ({ ENTRY: 'Paper entry recorded', EXIT: 'Paper exit recorded', MARK: 'Performance updated', CHECKPOINT_5: '5-session result recorded', CHECKPOINT_20: '20-session result recorded', DATA_GAP: 'Price data missing', CANCELLED: 'Paper trade cancelled' }[kind] || label(kind))
  const events = item && detail ? [
    { id: item.original.id, at: item.original.publishedAt, action: item.original.action, text: 'Original call' },
    ...detail.reviews.map(r => ({ id: r.id, at: r.publishedAt, action: r.action, text: r.thesis.length <= 70 ? r.thesis : 'AI review', reason: r.thesis.length > 70 ? r.thesis : undefined })),
    ...detail.outcomes.map(o => ({ id: o.id, at: o.asOf, action: '', text: outcomeLabel(o.kind || o.outcome_type || '') }))
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)) : []
  return <dialog ref={dialog} className={styles.drawer} aria-labelledby="shared-call-title" onCancel={onClose}>
    <header><div><h2 id="shared-call-title">{item?.instrument.symbol || 'Shared AI record'} · Decision history</h2>{item && <p className={styles.muted}>{item.instrument.name}</p>}</div><button onClick={onClose} aria-label="Close decision details">Close</button></header>
    {preview && <p className={styles.previewNotice}>SAMPLE DATA - layout preview only. Nothing is saved.</p>}
    {error && <p role="alert">{error}</p>}{!detail && !error && <p role="status">Loading decision evidence...</p>}
    {item && detail && <>
      <section><div className={styles.sectionHeading}><h3>Shared AI record</h3><span>Visible to signed-in users</span></div>
        <div className={styles.notice}><strong>Original call &middot; <span className={actionColour(item.original.action)}>{label(item.original.action)}</span></strong><p className={styles.muted}>{date(item.original.publishedAt)} &middot; Locked</p><p>{item.original.thesis.length > 160 ? `${item.original.thesis.slice(0, 160)}…` : item.original.thesis}</p><details><summary>Read original reasoning</summary><p>{item.original.thesis}</p><p><strong>Original risks:</strong> {item.original.risks}</p><p className={styles.muted}>Published: {date(item.original.publishedAt)}<br />Research cutoff: {date(item.original.sourceCutoff)}<br />Model: {item.original.modelIdentity}<br />Assessment: {item.original.assessmentId}<br />Original event: {item.original.id} · Locked</p></details></div>
        <p className={styles.currentStatus}><strong>Now: {label(item.latestReview?.action || item.original.action)}</strong><span>{label(item.state)}</span></p>
      </section>
      {eventId && <section aria-label="Selected performance decision event"><h3>Selected performance decision</h3>{eventId === item.original.id ? <p>The selected trial uses original event {eventId}. Its locked reasoning is available above.</p> : selectedReview ? <><p><strong>{selectedReview.action}</strong> · Published {date(selectedReview.publishedAt)} · Locked</p><p>{selectedReview.thesis}</p><p><strong>Risks:</strong> {selectedReview.risks}</p><p className={styles.muted}>Research cutoff: {date(selectedReview.sourceCutoff)}<br />Model: {selectedReview.modelIdentity}<br />Assessment: {selectedReview.assessmentId}<br />Review event: {selectedReview.id}</p></> : <p className={styles.notice} role="status">Requested event {eventId} is not in the loaded review history. {detail.reviewNextCursor ? 'Load more history below to locate its saved reasoning.' : 'Its saved reasoning could not be verified in the returned history.'} The original call is shown separately and has not been substituted for this event.</p>}</section>}
      <section><h3>Timeline</h3><ol className={styles.timeline}>{events.map(event => <li key={event.id}><time dateTime={event.at} title={date(event.at)}>{shortDate(event.at)}</time><div>{event.action && <strong className={actionColour(event.action)}>{label(event.action)} &middot; </strong>}{event.text}{'reason' in event && event.reason && <details><summary>Why this changed</summary><p>{event.reason}</p></details>}</div></li>)}</ol>
        {(detail.reviewNextCursor || detail.outcomeNextCursor) && <p className={styles.muted}>More events are available.</p>}{historyError && <p role="alert">{historyError}</p>}{(detail.reviewNextCursor || detail.outcomeNextCursor) && <button disabled={historyLoading} onClick={() => void moreHistory()}>{historyLoading ? 'Loading...' : 'Load more history'}</button>}
      </section>
      <section><h3>Paper cycle performance</h3><p className={styles.muted}>These are the existing Buy-to-Sell paper-cycle figures. Standalone 5/20-session action-trial results are shown separately in AI performance and may use different exposure and benchmark costs.</p><div className={styles.metrics}><div>Paper return<strong className={colour(item.performance?.netReturn)}>{item.performance?.netReturn != null ? percent(item.performance.netReturn) : <small>Not available yet</small>}</strong></div><div>{item.performance?.benchmark?.symbol || 'Benchmark'}<strong className={colour(item.performance?.benchmarkReturn)}>{item.performance?.benchmarkReturn != null ? percent(item.performance.benchmarkReturn) : <small>Not available yet</small>}</strong></div></div>
        <p className={styles.muted}>{item.performance ? `As of ${date(item.performance.asOf)}. Paper return includes modelled costs.` : item.entry ? 'A verified price update is needed to calculate the return.' : 'Returns start after a paper entry is recorded.'}</p>
        {item.blocker && <p className={styles.notice} role="status">{item.blocker.message}</p>}
        <details><summary>View evidence and calculation</summary><p><strong>Original risks:</strong> {item.original.risks}</p><p>{detail.evidence?.message || 'Supporting evidence is not available yet.'}</p><p className={styles.muted}>Evidence: {label(detail.evidence?.status || 'unverified')}<br />Last reviewed: {date(item.lastReviewedAt)}<br />Prices as of: {date(item.pricesAsOf)}<br />Research cutoff: {date(item.original.sourceCutoff)}<br />Methodology: {detail.evidence?.methodology || 'Not available'}<br />Cost per side: {detail.evidence?.costPerSide != null ? percent(detail.evidence.costPerSide) : 'Not available'}</p>
          {(['entry', 'exit'] as const).map(key => <p key={key}>Paper {key}: {item[key] ? `${item[key]!.currency} ${item[key]!.price} at ${date(item[key]!.at)}` : 'Not recorded'}</p>)}
          {detail.outcomes.length > 0 && <details><summary>Recording dates</summary>{detail.outcomes.map(o => <p key={o.id}>{outcomeLabel(o.kind || o.outcome_type || '')}: session {date(o.asOf)}; recorded {date(o.recordedAt || o.recorded_at)}</p>)}</details>}
          {item.blocker && <p>Next step: {item.blocker.nextAction}</p>}
        </details>
      </section>
      <section className={styles.privateNotes}><div className={styles.sectionHeading}><h3>Your private notes</h3><span>Only you can see this</span></div>
<form onSubmit={save}><fieldset disabled={preview || saving} className={styles.noteFields}><label>Your view (notes only)<select value={action} disabled={saving} onChange={e => setAction(e.target.value)}><option value="NOTE">Note</option><option value="WAIT">Watching</option><option value="BUY">Bought</option><option value="HOLD">Holding</option><option value="SELL">Sold</option><option value="REDUCE">Reduced</option></select></label><label>Private note<textarea value={note} disabled={saving} onChange={e => setNote(e.target.value)} maxLength={12000} minLength={3} required /></label><button disabled={saving || note.trim().length < 3}>{saving ? 'Saving…' : 'Save private note'}</button></fieldset></form>{message && <p role="status">{message}</p>}{noteError && <p role="alert">{noteError}</p>}<ul>{notes.map(n => <li key={n.id}><small>{date(n.created_at)} · {label(n.action)}</small><p>{n.note}</p></li>)}</ul>{notePage > 0 && <button onClick={() => setNotePage(n => n - 1)}>Newer notes</button>}{hasMoreNotes && <button onClick={() => setNotePage(n => n + 1)}>Older notes</button>}
        <p className={styles.muted}>Your notes do not change the shared AI record or its performance.</p>
      </section>
    </>}
  </dialog>
}
