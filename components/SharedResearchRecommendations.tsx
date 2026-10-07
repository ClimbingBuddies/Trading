'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './SharedResearchRecommendations.module.css'

type Decision = { id: string; action: string; thesis: string; risks: string; modelIdentity: string; publishedAt: string; sourceCutoff: string; assessmentId: string }
type Source = { name: string; url: string | null; text: string; availableAt: string; sourcePublishedAt: string | null }
type PriceEvidence = { status: 'AVAILABLE' | 'ABSENT'; latestAt: string | null; latestLoadedAt: string | null; providers: string[]; sampleRows: number; availableRows: number; omittedRows: number; caveat: string }
export type ResearchItem = { instrument: { id: string; symbol: string; name: string; exchange: string; currency: string }; original: Decision; latest: Decision; history: Decision[]; sources: Source[]; priceEvidence: PriceEvidence; measurementStatus: 'NOT_MEASURABLE'; measurementBlocker: string; includedInPerformance: false }
type Payload = { contractVersion: 1; generatedAt: string; items: ResearchItem[] }
const actions = new Set(['BUY', 'WAIT', 'HOLD', 'SELL', 'REDUCE', 'AVOID'])
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonempty = (value: unknown) => typeof value === 'string' && value.trim() !== ''
const timestamp = (value: unknown) => nonempty(value) && Number.isFinite(Date.parse(String(value)))
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
function validPriceEvidence(value: unknown) {
  if (!record(value) || !['AVAILABLE', 'ABSENT'].includes(String(value.status)) || !nonempty(value.caveat)) return false
  return ['latestAt', 'latestLoadedAt'].every(key => value[key] === null || timestamp(value[key])) && Array.isArray(value.providers) && value.providers.every(nonempty) && ['sampleRows', 'availableRows', 'omittedRows'].every(key => count(value[key]))
}
const validDecision = (value: unknown) => record(value) && ['id', 'thesis', 'risks', 'modelIdentity', 'assessmentId'].every(key => nonempty(value[key])) && typeof value.action === 'string' && actions.has(value.action) && timestamp(value.publishedAt) && timestamp(value.sourceCutoff)
function validPayload(value: unknown): value is Payload {
  return record(value) && value.contractVersion === 1 && timestamp(value.generatedAt) && Array.isArray(value.items) && value.items.every(item => {
    if (!record(item) || item.measurementStatus !== 'NOT_MEASURABLE' || item.includedInPerformance !== false || !nonempty(item.measurementBlocker) || !validPriceEvidence(item.priceEvidence)) return false
    const instrument = item.instrument
    return record(instrument) && ['id', 'symbol', 'name', 'exchange', 'currency'].every(key => nonempty(instrument[key])) && validDecision(item.original) && validDecision(item.latest) && Array.isArray(item.history) && item.history.every(validDecision) && Array.isArray(item.sources) && item.sources.every(source => record(source) && nonempty(source.name) && (source.url === null || typeof source.url === 'string') && typeof source.text === 'string' && timestamp(source.availableAt) && (source.sourcePublishedAt === null || timestamp(source.sourcePublishedAt)))
  })
}
function safeHref(value: string | null) {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function DecisionEvidence({ decision, title }: { decision: Decision; title: string }) {
  return <section className={styles.decision}><h4>{title} · {decision.action}</h4><p className={styles.timestamps}>Published <time dateTime={decision.publishedAt}>{date(decision.publishedAt)}</time><br />Research cutoff <time dateTime={decision.sourceCutoff}>{date(decision.sourceCutoff)}</time> · Model: {decision.modelIdentity}</p><p><strong>Thesis:</strong> {decision.thesis}</p><p><strong>Risks:</strong> {decision.risks}</p><p className={styles.identity}>Saved recommendation {decision.id} · Assessment {decision.assessmentId}</p></section>
}

export function useSharedResearchRecommendations(scope: 'all' | 'watched', revision = 0) {
  const [retry, setRetry] = useState(0)
  const requestKey = `${scope}:${revision}:${retry}`
  const [result, setResult] = useState<{ key: string; payload: Payload | null; error: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const client = getBrowserSupabase()
        if (!client) throw new Error('Unavailable')
        const { data, error } = await client.rpc('shared_research_recommendations_v1', { p_scope: scope })
        if (error || !validPayload(data)) throw new Error('Unverified research response')
        if (!cancelled) setResult({ key: requestKey, payload: data, error: false })
      } catch { if (!cancelled) setResult({ key: requestKey, payload: null, error: true }) }
    })()
    return () => { cancelled = true }
  }, [scope, requestKey])
  const current = result?.key === requestKey ? result : null
  const payload = current?.payload
  return { payload, loading: !current, error: current?.error ? 'Saved research recommendations could not be verified. No recommendations have been substituted.' : '', retry: () => setRetry(value => value + 1) }
}

export default function ResearchDecisionDrawer({ item, onClose }: { item: ResearchItem; onClose: () => void }) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  return <dialog ref={dialog} className={styles.drawer} aria-labelledby={`${id}-title`} onCancel={onClose}>
        <header className={styles.heading}><div><h2 id={`${id}-title`}>{item.instrument.symbol} · Decision history</h2><p>{item.instrument.name} · {item.instrument.exchange} · {item.instrument.currency}</p></div><button onClick={onClose} aria-label="Close research decision history">Close</button></header><p className={styles.notice}>Research only · Not measurable · Excluded from performance. No paper trial or private-note journal exists for this research record.</p>
        <DecisionEvidence decision={item.latest} title="Latest saved recommendation" />
        <p className={styles.blocker}><strong>Measurement blocker:</strong> {item.measurementBlocker}</p>
        <details><summary>Original recommendation, history and sources</summary>
          <details open><summary>Read original reasoning</summary><DecisionEvidence decision={item.original} title="Original saved recommendation · Locked" /></details>
          <h4>Immutable recommendation history</h4>{item.history.length === 0 ? <p>No additional history was returned.</p> : <ol className={styles.history}>{item.history.map(decision => <li key={decision.id}><DecisionEvidence decision={decision} title="Saved recommendation" /></li>)}</ol>}
          <h4>Saved source evidence</h4>{item.sources.length === 0 ? <p>No source references were returned.</p> : <ul className={styles.sources}>{item.sources.map((source, index) => { const href = safeHref(source.url); return <li key={`${source.name}-${index}`}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.name}</a> : <strong>{source.name}</strong>}<p>{source.text || 'No additional source text was recorded.'}</p><p className={styles.timestamps}>Available / verified <time dateTime={source.availableAt}>{date(source.availableAt)}</time><br />Source published {source.sourcePublishedAt ? <time dateTime={source.sourcePublishedAt}>{date(source.sourcePublishedAt)}</time> : 'Unknown'}</p>{source.url && !href && <small>No safe HTTPS source link is available.</small>}</li> })}</ul>}
          <h4>Frozen price evidence · {item.priceEvidence.status === 'AVAILABLE' ? 'Available' : 'Absent'}</h4>
          <dl className={styles.priceEvidence}><div><dt>Latest observation</dt><dd>{item.priceEvidence.latestAt ? <time dateTime={item.priceEvidence.latestAt}>{date(item.priceEvidence.latestAt)}</time> : 'Not available'}</dd></div><div><dt>Latest load</dt><dd>{item.priceEvidence.latestLoadedAt ? <time dateTime={item.priceEvidence.latestLoadedAt}>{date(item.priceEvidence.latestLoadedAt)}</time> : 'Not available'}</dd></div><div><dt>Providers</dt><dd>{item.priceEvidence.providers.length ? item.priceEvidence.providers.join(', ') : 'None recorded'}</dd></div><div><dt>Frozen sample</dt><dd>{item.priceEvidence.sampleRows} rows · {item.priceEvidence.availableRows} available · {item.priceEvidence.omittedRows} omitted from the saved sample</dd></div></dl>
          <p className={styles.blocker}><strong>Price evidence and sample limitations:</strong> {item.priceEvidence.caveat}</p>
          <p className={styles.muted}>This frozen price evidence supports research provenance only. It is not an entry, return or performance result.</p>
          <p className={styles.muted}>Recommendations and their research cutoffs remain as published. Source text describes evidence dates and any price-provider limitations; raw price observations alone do not establish verified paper performance.</p>
        </details>

  </dialog>
}
