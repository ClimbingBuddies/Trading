'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './SharedDecisionWorkspace.module.css'
import TradingPipelineStatus from './TradingPipelineStatus'
import SharedAIPerformance from './SharedAIPerformance'
import ResearchDecisionDrawer, { useSharedResearchRecommendations, type ResearchItem } from './SharedResearchRecommendations'

type Instrument = { id: string; symbol: string; name: string; exchange: string; currency: string }
type Decision = { id: string; action: string; publishedAt: string; sourceCutoff: string; thesis: string; risks: string; modelIdentity: string; assessmentId: string }
type Blocker = { code: string; message: string; stage: string; lastAttemptAt: string | null; nextAction: string }
type Fill = { outcomeId: string; at: string; price: string; currency: string }
type Item = { callId: string; instrument: Instrument; original: Decision; latestReview: Decision | null; lastReviewedAt: string; state: string; dataStatus: string; entry: Fill | null; exit: Fill | null; pricesAsOf: string | null; blocker: Blocker | null; performance: { outcomeId: string; asOf: string; netReturn: string | null; benchmarkReturn: string | null; costPerSide: string; benchmark: Instrument; kind: string } | null }
type Payload = { contractVersion: number; generatedAt: string; items: Item[]; nextCursor: string | null; blockedItems: { instrument: Instrument; blocker: Blocker }[]; blockedNextCursor: string | null; counts: { trackedCalls: number; watching: number; awaitingEntry: number; open: number; exitSignal: number; closed: number; cancelled: number; blockedWithoutCall: number; callsNeedingAttention: number }; scheduledRun?: { state: string | null; lastAttemptAt: string | null; lastCompletedAt: string | null } | null }
type Detail = { item: Item; reviews: Decision[]; outcomes: { id: string; kind?: string; outcome_type?: string; asOf: string; recordedAt?: string; recorded_at?: string }[]; evidence: { status?: string; message?: string; methodology?: string; costPerSide?: string }; reviewNextCursor?: string | null; outcomeNextCursor?: string | null }
type Note = { id: string; action: string; note: string; created_at: string }
const latestDecision = (item: Item) => {
  const originalTime = Date.parse(item.original.publishedAt)
  const review = item.latestReview
  return review && (Date.parse(review.publishedAt) > originalTime || Date.parse(review.publishedAt) === originalTime && review.id.localeCompare(item.original.id) > 0) ? review : item.original
}
const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ')
const percent = (value?: string | null) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? `${Number(value) > 0 ? '+' : ''}${(Number(value) * 100).toFixed(2)}%` : '—'
const colour = (value?: string | null) => value == null ? '' : Number(value) > 0 ? styles.positive : Number(value) < 0 ? styles.negative : ''
const readError = 'Shared Decision Lab is unavailable. Its data service may not be installed yet, or access could not be verified. No results have been substituted.'

export default function SharedDecisionWorkspace() {
  const [scope, setScope] = useState<'all' | 'watched'>('all')
  const [horizon, setHorizon] = useState<5 | 20>(5)
  const [page, setPage] = useState({ cursor: null as string | null, blocked: null as string | null })
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<{ callId: string; eventId?: string } | null>(null)
  const [selectedResearch, setSelectedResearch] = useState<ResearchItem | null>(null)
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [pipelineSignal, setPipelineSignal] = useState({ warning: true, title: 'Unverified' })
  const updatePipelineSignal = useCallback((value: { warning: boolean; title: string }) => setPipelineSignal(current => current.warning === value.warning && current.title === value.title ? current : value), [])
  const requestKey = `${scope}:${page.cursor || ''}:${page.blocked || ''}:${revision}`
  const [dashboard, setDashboard] = useState<{ key: string; payload: Payload | null; error: string } | null>(null)
  const research = useSharedResearchRecommendations(scope, revision)
  const current = dashboard?.key === requestKey ? dashboard : null
  const payload = current?.payload
  const loading = !current
  const error = current?.error || ''
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const client = getBrowserSupabase()
        if (!client) throw new Error('Unavailable')
        const { data, error: failure } = await client.rpc('shared_decision_dashboard_v1', { p_scope: scope, p_checkpoint: 'latest', p_cursor: page.cursor, p_blocked_cursor: page.blocked, p_limit: 50 })
        if (failure || !data || data.contractVersion !== 1 || !Array.isArray(data.items) || !Array.isArray(data.blockedItems) || !data.counts) throw new Error('Invalid response')
        if (!cancelled) setDashboard({ key: requestKey, payload: data as Payload, error: '' })
      } catch { if (!cancelled) setDashboard({ key: requestKey, payload: null, error: readError }) }
    })()
    return () => { cancelled = true }
  }, [scope, page.cursor, page.blocked, requestKey])
  const calls = payload?.items || []
  const eventKey = calls.map(item => `${item.callId}:${latestDecision(item).id}`).join('|')
  const trialKey = `${scope}:${horizon}:${revision}:${eventKey}`
  const [trials, setTrials] = useState<{ key: string; items: ActionStatus[]; error: boolean } | null>(null)
  useEffect(() => {
    if (!calls.length) return
    let cancelled = false
    void (async () => {
      try {
        const client = getBrowserSupabase()
        if (!client) throw new Error('Unavailable')
        const { data, error: failure } = await client.rpc('shared_decision_action_status_v1', { p_calls: calls.map(item => item.callId), p_scope: scope, p_horizon: horizon })
        if (failure || !validActionStatus(data, horizon)) throw new Error('Unverified trial status')
        if (!cancelled) setTrials({ key: trialKey, items: data.items, error: false })
      } catch { if (!cancelled) setTrials({ key: trialKey, items: [], error: true }) }
    })()
    return () => { cancelled = true }
  }, [scope, horizon, trialKey, eventKey])
  const trialResult = trials?.key === trialKey ? trials : null
  const trialMap = new Map((trialResult?.items || []).map(item => [`${item.callId}:${item.eventId}`, item]))
  const reset = () => { setPage({ cursor: null, blocked: null }); setRevision(value => value + 1) }
  const attention = payload ? payload.counts.callsNeedingAttention + payload.counts.blockedWithoutCall : null
  const researchIds = new Set((research.payload?.items || []).map(item => item.instrument.id))
  const verifiedPage = !!trialResult && !trialResult.error && calls.every(item => trialMap.has(`${item.callId}:${latestDecision(item).id}`))
  const pendingOnPage = verifiedPage ? calls.filter(item => trialMap.get(`${item.callId}:${latestDecision(item).id}`)?.status === 'pending').length : null
  const noMatureOnPage = calls.length > 0 && verifiedPage && calls.every(item => trialMap.get(`${item.callId}:${latestDecision(item).id}`)?.status !== 'matured')
  const actionIssues = trialResult ? calls.flatMap(item => {
    const latest = latestDecision(item)
    const trial = trialMap.get(`${item.callId}:${latest.id}`)
    if (!trialResult.error && trial && trial.status !== 'blocked') return []
    return [{ item, eventId: latest.id, status: trial?.status === 'blocked' ? 'Blocked' : 'Unverified', reason: trialResult.error ? 'Selected-horizon trial status could not be verified.' : !trial ? 'No verified result matches this call and its latest saved event.' : trial.blocker ? label(trial.blocker) : 'The selected-horizon action trial is blocked; no verified return is available.' }]
  }) : []
  const combined: ({ kind: 'call'; item: Item } | { kind: 'research'; item: ResearchItem })[] = [
    ...calls.map(item => ({ kind: 'call' as const, item })),
    ...(research.payload?.items || []).map(item => ({ kind: 'research' as const, item }))
  ]
  combined.sort((a, b) => a.kind === b.kind ? a.item.instrument.symbol.localeCompare(b.item.instrument.symbol) : a.kind === 'call' ? -1 : 1)
  return <div className={styles.workspace}>
    <h1 className={styles.srOnly}>Decision Lab</h1>
    <div className={styles.compactSummary}><span title="Full scoped call cycles plus published research-only instruments; historical cycles can share a symbol.">{payload && research.payload ? `${payload.counts.trackedCalls + research.payload.items.length} saved decisions · ${research.payload.items.length} research only` : 'Scoped decision count unverified'}{pendingOnPage !== null && pendingOnPage > 0 ? ` · ${pendingOnPage} pending on page` : ''}</span><div><button aria-expanded={performanceOpen} aria-controls="decision-performance-details" onClick={() => setPerformanceOpen(value => !value)}>Performance details <span aria-hidden="true">⌄</span></button><button className={pipelineSignal.warning || attention === null || attention > 0 || actionIssues.length > 0 ? styles.attentionButton : undefined} aria-expanded={reviewOpen} aria-controls="decision-review-details" title={pipelineSignal.title} onClick={() => setReviewOpen(value => !value)}>Review status · {attention === null ? 'Unverified' : `${attention} items`}{pipelineSignal.warning || actionIssues.length > 0 ? ' · Attention' : ''} <span aria-hidden="true">⌄</span></button></div></div>
    {performanceOpen && <div id="decision-performance-details"><SharedAIPerformance scope={scope} revision={revision} horizon={horizon} onOpenDecision={(callId, eventId) => setSelected({ callId, eventId })} /></div>}
    <TradingPipelineStatus embedded hidden={!reviewOpen} onStatusChange={updatePipelineSignal} panelId="decision-review-details">
      {attention === null ? <p>Per-record review status is unverified.</p> : <p>{attention} items need attention in the full selected scope. These can overlap call cycles; this is not a count of distinct shares.</p>}
      {!payload ? <p>Current-page action-trial issue count is unverified because saved calls could not be loaded.</p> : calls.length > 0 && !trialResult ? <p role="status">Checking {horizon}-session action-trial issues on the current calls page…</p> : <><p>{actionIssues.length} {horizon}-session action-trial issues on the current calls page only. This is separate from the full-scope paper-cycle count above; pending trials are not attention issues.</p>{actionIssues.length > 0 && <div className={styles.table}><table><caption>Latest-event action-trial issues · Current page</caption><thead><tr><th>Share / saved event</th><th>Status / blocker</th><th>Next step</th></tr></thead><tbody>{actionIssues.map(issue => <tr key={issue.item.callId}><td>{issue.item.instrument.symbol}<small>{issue.eventId} · {horizon} sessions</small></td><td>{issue.status}<small>{issue.reason}</small></td><td>Refresh after verified evidence is available and the controller has evaluated this saved event.</td></tr>)}</tbody></table></div>}</>}
      <div className={styles.table}><table><caption>Research and data issues · Current calls and blocker pages</caption><thead><tr><th>Share</th><th>Issue</th><th>Next step</th></tr></thead><tbody>{[...calls.filter(item => item.blocker || item.dataStatus !== 'READY').map(item => ({ instrument: item.instrument, blocker: item.blocker || { code: item.dataStatus, message: label(item.dataStatus), stage: 'evaluation', lastAttemptAt: null, nextAction: 'Await verified evidence.' } })), ...(payload?.blockedItems || []).filter(item => !researchIds.has(item.instrument.id))].map((item, index) => <tr key={`${item.instrument.id}:${index}`}><td>{item.instrument.symbol}</td><td>{item.blocker.message}<small>{item.blocker.stage} · {date(item.blocker.lastAttemptAt)}</small></td><td>{item.blocker.nextAction}</td></tr>)}{(research.payload?.items || []).map(item => <tr key={`research:${item.instrument.id}`}><td>{item.instrument.symbol}</td><td>Research only · Excluded from performance</td><td>{item.measurementBlocker}</td></tr>)}</tbody></table></div>
      {payload?.blockedNextCursor && <button onClick={() => setPage(value => ({ ...value, blocked: payload.blockedNextCursor }))}>Next issues</button>}{page.blocked && <button onClick={() => setPage(value => ({ ...value, blocked: null }))}>First issues</button>}
    </TradingPipelineStatus>
    <div className={styles.compactToolbar}><label>Scope <select value={scope} onChange={event => { setScope(event.target.value as 'all' | 'watched'); setPage({ cursor: null, blocked: null }); setSelected(null); setSelectedResearch(null) }}><option value="all">All AI calls</option><option value="watched">My watched shares</option></select></label><label>Horizon <select value={horizon} onChange={event => setHorizon(Number(event.target.value) as 5 | 20)}><option value={5}>5 sessions</option><option value={20}>20 sessions</option></select></label><button onClick={reset}>Refresh</button></div>
    {(loading || research.loading) && <p className={styles.muted} role="status">Loading {loading ? 'shared calls' : ''}{loading && research.loading ? ' and ' : ''}{research.loading ? 'research records' : ''}…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {research.error && <p className={styles.error} role="alert">{research.error} Refresh to retry.</p>}
    {trialResult?.error && calls.length > 0 && <p className={styles.error} role="alert">Selected-horizon trial results could not be verified. No paper-cycle returns have been substituted. Refresh to retry.</p>}
    <div className={styles.table}><table><caption className={styles.srOnly}>Saved AI decisions and selected-horizon action trials</caption><thead><tr><th>Share</th><th>Latest AI call</th><th>Trial status</th><th>{horizon}-session trial return</th><th><span className={styles.srOnly}>Decision history</span></th></tr></thead><tbody>{combined.map(row => {
      if (row.kind === 'research') { const item = row.item; return <tr key={`research:${item.instrument.id}`}><td><strong>{item.instrument.symbol}</strong><small>{item.instrument.name}</small></td><td><span className={`${styles.action} ${item.latest.action === 'BUY' ? styles.buyAction : item.latest.action === 'WAIT' ? styles.waitAction : ''}`}>{item.latest.action}</span><small>{date(item.latest.publishedAt)}</small></td><td><span className={styles.researchPill}>Research only</span></td><td>—</td><td><button className={styles.historyArrow} onClick={() => setSelectedResearch(item)} aria-label={`View decision history for ${item.instrument.symbol}`}><span aria-hidden="true">›</span></button></td></tr> }
      const item = row.item
      const latest = latestDecision(item)
      const trial = trialMap.get(`${item.callId}:${latest.id}`)
      const trialLoading = !trialResult
      const status = trialLoading ? 'Loading…' : trialResult.error || !trial ? 'Unverified' : trial.status === 'matured' ? 'Matured' : trial.status === 'blocked' ? 'Blocked' : 'Pending'
      return <tr key={item.callId}><td><strong>{item.instrument.symbol}</strong><small>{item.instrument.name}</small></td><td><span className={`${styles.action} ${latest.action === 'BUY' ? styles.buyAction : latest.action === 'WAIT' ? styles.waitAction : ''}`}>{latest.action}</span><small>{date(latest.publishedAt)}{item.state === 'CLOSED' || item.state === 'CANCELLED' ? ` · ${label(item.state)} cycle` : ''}</small></td><td><span className={styles.trialPill}>{status}</span>{!trialLoading && !trial && <small>Latest event not verified</small>}</td><td className={colour(trial?.status === 'matured' ? trial.actionReturn : null)}>{trial?.status === 'matured' ? percent(trial.actionReturn) : '—'}{trial?.asOf && <small>{date(trial.asOf)}</small>}</td><td><button className={styles.historyArrow} onClick={() => setSelected({ callId: item.callId, eventId: latest.id })} aria-label={`View decision history for ${item.instrument.symbol}`}><span aria-hidden="true">›</span></button></td></tr>
    })}{combined.length === 0 && !loading && !research.loading && <tr><td colSpan={5}>{error || research.error ? 'Decision records could not be verified.' : 'No saved AI decisions in this scope.'}</td></tr>}</tbody></table></div>
    {(payload?.nextCursor || page.cursor || error || research.error) && <div className={styles.pageFooter}><span>{calls.length} call cycles on this page · {research.payload?.items.length ?? 'Unverified'} research-only records. Scoped counts include other calls pages.</span><div>{payload?.nextCursor && <button onClick={() => setPage(value => ({ ...value, cursor: payload.nextCursor }))}>Next calls</button>}{page.cursor && <button onClick={() => setPage(value => ({ ...value, cursor: null }))}>First calls</button>}</div></div>}
    <p className={styles.minimalFootnote}>Research-only decisions are excluded from performance.{noMatureOnPage ? ' No mature trial results on the current page yet.' : ''}</p>

    {selected && <DecisionDrawer key={`${selected.callId}:${selected.eventId || ''}`} callId={selected.callId} eventId={selected.eventId} onClose={() => setSelected(null)} />}
    {selectedResearch && <ResearchDecisionDrawer key={selectedResearch.latest.id} item={selectedResearch} onClose={() => setSelectedResearch(null)} />}
  </div>
}

type ActionStatus = { callId: string; eventId: string; status: 'pending' | 'blocked' | 'matured'; actionReturn: string | null; asOf: string | null; blocker: string | null }
function validActionStatus(value: unknown, horizon: number): value is { contractVersion: 1; horizon: number; items: ActionStatus[] } {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  if (payload.contractVersion !== 1 || payload.horizon !== horizon || !Array.isArray(payload.items)) return false
  const ids = new Set<string>()
  return payload.items.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false
    const item = entry as Record<string, unknown>
    if (typeof item.callId !== 'string' || !item.callId || typeof item.eventId !== 'string' || !item.eventId || !['pending', 'blocked', 'matured'].includes(String(item.status))) return false
    if (ids.has(item.callId)) return false
    ids.add(item.callId)
    if (item.blocker !== null && typeof item.blocker !== 'string') return false
    if (item.asOf !== null && (typeof item.asOf !== 'string' || !Number.isFinite(Date.parse(item.asOf)))) return false
    if (item.status === 'matured') return item.blocker === null && typeof item.actionReturn === 'string' && item.actionReturn.trim() !== '' && Number.isFinite(Number(item.actionReturn)) && item.asOf !== null
    if (item.actionReturn !== null || item.asOf !== null) return false
    return item.status === 'pending' ? item.blocker === null : typeof item.blocker === 'string' && /^[A-Z][A-Z0-9_]*$/.test(item.blocker)
  })
}


function DecisionDrawer({ callId, eventId, onClose }: { callId: string; eventId?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
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
    let cancelled = false
    void (async () => { try {
      const client = getBrowserSupabase(); if (!client) throw new Error()
      const { data, error: failure } = await client.rpc('shared_decision_detail_v1', { p_call: callId })
      if (failure || !data?.item || data.item.callId !== callId || !Array.isArray(data.reviews) || !Array.isArray(data.outcomes)) throw new Error()
      if (!cancelled) setDetail(data)
    } catch { if (!cancelled) setError('This shared call could not be loaded. It may be unavailable or you may not have access.') } })()
    return () => { cancelled = true }
  }, [callId])
  const loadNotes = useCallback(async (page: number) => {
    const token = ++notesRequest.current
    try {
      const client = getBrowserSupabase(); if (!client) throw new Error()
      const { data, error: failure } = await client.from('shared_decision_private_notes').select('id,action,note,created_at').eq('call_id', callId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 20, page * 20 + 20)
      if (failure) throw new Error()
      if (token !== notesRequest.current) return
      setNoteError(''); setNotes((data || []).slice(0, 20)); setHasMoreNotes((data || []).length > 20)
    } catch { if (token === notesRequest.current) setNoteError('Your private notes could not be loaded. Previous notes may still be shown.') }
  }, [callId])
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
    event.preventDefault(); if (saving || note.trim().length < 3) return
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
    {error && <p role="alert">{error}</p>}{!detail && !error && <p role="status">Loading decision evidence...</p>}
    {item && detail && <>
      <section><div className={styles.sectionHeading}><h3>Shared AI record</h3><span>Visible to signed-in users</span></div>
        <div className={styles.notice}><strong>Original call &middot; <span className={actionColour(item.original.action)}>{label(item.original.action)}</span></strong><p className={styles.muted}>{date(item.original.publishedAt)} &middot; Locked</p><p>{item.original.thesis.length > 160 ? `${item.original.thesis.slice(0, 160)}…` : item.original.thesis}</p><details><summary>Read original reasoning</summary><p>{item.original.thesis}</p><p><strong>Original risks:</strong> {item.original.risks}</p><p className={styles.muted}>Published: {date(item.original.publishedAt)}<br />Research cutoff: {date(item.original.sourceCutoff)}<br />Model: {item.original.modelIdentity}<br />Assessment: {item.original.assessmentId}<br />Original event: {item.original.id} · Locked</p></details></div>
        <p className={styles.currentStatus}><strong>Now: {label(latestDecision(item).action)}</strong><span>{label(item.state)}</span></p>
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
      <details className={styles.privateNotes}><summary>Your private notes · Only you can see this</summary><section><div className={styles.sectionHeading}><h3>Your private notes</h3><span>Only you can see this</span></div>
<form onSubmit={save}><fieldset disabled={saving} className={styles.noteFields}><label>Your view (notes only)<select value={action} disabled={saving} onChange={e => setAction(e.target.value)}><option value="NOTE">Note</option><option value="WAIT">Watching</option><option value="BUY">Bought</option><option value="HOLD">Holding</option><option value="SELL">Sold</option><option value="REDUCE">Reduced</option></select></label><label>Private note<textarea value={note} disabled={saving} onChange={e => setNote(e.target.value)} maxLength={12000} minLength={3} required /></label><button disabled={saving || note.trim().length < 3}>{saving ? 'Saving…' : 'Save private note'}</button></fieldset></form>{message && <p role="status">{message}</p>}{noteError && <p role="alert">{noteError}</p>}<ul>{notes.map(n => <li key={n.id}><small>{date(n.created_at)} · {label(n.action)}</small><p>{n.note}</p></li>)}</ul>{notePage > 0 && <button onClick={() => setNotePage(n => n - 1)}>Newer notes</button>}{hasMoreNotes && <button onClick={() => setNotePage(n => n + 1)}>Older notes</button>}
        <p className={styles.muted}>Your notes do not change the shared AI record or its performance.</p>
      </section></details>
    </>}
  </dialog>
}
