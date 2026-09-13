'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { matchingPlan, olderAssessment, ratingAction } from '@/lib/watchlist-recommendations.mjs'
import WatchlistDialog from './WatchlistDialog'
import styles from './WatchlistsClient.module.css'

type Watchlist = { id: string; name: string; description: string | null; is_default: boolean }
type Item = { watchlist_id: string; instrument_id: string; sort_order: number; notes: string | null; added_at: string }
type Instrument = { id: string; symbol: string; instrument_name: string; asset_type: string | null; is_active: boolean }
type Assessment = { assessment_id: string; instrument_id: string; rating: string; assessment_date: string; created_at: string; summary: string | null; key_risks: string | null; model_version: string | null }
type Plan = { id: string; instrument_id: string; assessment_id: string; horizon_sessions: number; published_at: string; entry_deadline: string; action: string; thesis: string; risks: string; source_cutoff: string }
type Modal = 'create' | 'add' | 'edit' | 'details' | 'notes' | 'remove' | 'delete' | null
const date = (value: string) => new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const timestamp = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const actionLabel = { BUY: 'Buy candidate', HOLD: 'Wait', AVOID: 'Avoid for now', UNKNOWN: 'Not rated' }

export default function WatchlistsClient({ ownerId, embedded = false }: { ownerId?: string; embedded?: boolean }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!!ownerId)
  const [authError, setAuthError] = useState('')
  useEffect(() => {
    if (ownerId) return
    const client = getBrowserSupabase()
    let active = true, receivedEvent = false
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true
      if (!active) return
      setUser(session?.user && !session.user.is_anonymous ? session.user : null)
      setReady(true)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (!active || receivedEvent) return
      setUser(data.session?.user && !data.session.user.is_anonymous ? data.session.user : null)
      if (error) setAuthError('Your session could not be loaded. Please sign in again.')
      setReady(true)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [ownerId])
  const id = ownerId ?? user?.id
  if (!ready) return <p role="status">Loading your watchlist…</p>
  if (!id) return <section className={styles.empty}><h1>My watchlist</h1><p>{authError || 'Sign in to see your saved shares and AI recommendations.'}</p><Link href="/login">Sign in →</Link></section>
  return <WatchlistWorkspace key={id} ownerId={id} embedded={embedded} />
}

function WatchlistWorkspace({ ownerId, embedded }: { ownerId: string; embedded: boolean }) {
  const [lists, setLists] = useState<Watchlist[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [tracking, setTracking] = useState<boolean | null>(null)
  const [listId, setListId] = useState('')
  const [horizon, setHorizon] = useState(5)
  const [onlyBuy, setOnlyBuy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [researchLoading, setResearchLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [researchError, setResearchError] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [modal, setModal] = useState<Modal>(null)
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal, client = getBrowserSupabase()
    setLoading(true); setLoadError('')
    async function load() {
      const listRows: Watchlist[] = [], instrumentRows: Instrument[] = [], itemRows: Item[] = []
      await Promise.all([
        (async () => { for (let offset = 0; ; offset += 500) {
          const r = await client.from('watchlists').select('id,name,description,is_default').eq('owner_user_id', ownerId).order('created_at').order('id').range(offset, offset + 499).abortSignal(signal)
          if (r.error) throw r.error
          listRows.push(...r.data)
          if (r.data.length < 500) break
        } })(),
        (async () => { for (let offset = 0; ; offset += 500) {
          const r = await client.from('instruments').select('id,symbol,instrument_name,asset_type,is_active').order('symbol').order('id').range(offset, offset + 499).abortSignal(signal)
          if (r.error) throw r.error
          instrumentRows.push(...r.data)
          if (r.data.length < 500) break
        } })(),
      ])
      for (let batch = 0; batch < listRows.length; batch += 100) {
        for (let offset = 0; ; offset += 500) {
          const r = await client.from('watchlist_items').select('watchlist_id,instrument_id,sort_order,notes,added_at').in('watchlist_id', listRows.slice(batch, batch + 100).map(l => l.id)).order('watchlist_id').order('sort_order').order('instrument_id').range(offset, offset + 499).abortSignal(signal)
          if (r.error) throw r.error
          itemRows.push(...r.data)
          if (r.data.length < 500) break
        }
      }
      if (signal.aborted) return
      setLists(listRows); setItems(itemRows); setInstruments(instrumentRows)
      setListId(current => listRows.some(l => l.id === current) ? current : (listRows.find(l => l.is_default)?.id ?? listRows[0]?.id ?? ''))
      setLoading(false)
    }
    void load().catch(() => { if (!signal.aborted) { setLoadError('Your watchlist could not be loaded.'); setLoading(false) } })
    return () => controller.abort()
  }, [ownerId, revision])

  const activeList = lists.find(l => l.id === listId)
  const activeItems = useMemo(() => items.filter(i => i.watchlist_id === listId).sort((a, b) => a.sort_order - b.sort_order || a.added_at.localeCompare(b.added_at)), [items, listId])
  const instrumentMap = useMemo(() => new Map(instruments.map(i => [i.id, i])), [instruments])
  const assessmentMap = useMemo(() => new Map(assessments.map(a => [a.instrument_id, a])), [assessments])
  const researchIds = useMemo(() => [...new Set(activeItems.map(i => i.instrument_id))].sort(), [activeItems])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal, client = getBrowserSupabase()
    setResearchLoading(true); setResearchError(''); setAssessments([]); setPlans([]); setTracking(null)
    async function loadResearch() {
      const results: Assessment[] = [], published: Plan[] = []
      const readAssessments = async () => {
        for (let batch = 0; batch < researchIds.length; batch += 8) {
          const rows = await Promise.all(researchIds.slice(batch, batch + 8).map(async id => {
            const r = await client.from('gpt_market_assessments').select('assessment_id,instrument_id,rating,assessment_date,created_at,summary,key_risks,model_version,gpt_market_runs!inner(analysis_mode,status)')
              .eq('instrument_id', id).eq('technical_engine_input_used', false).eq('gpt_market_runs.analysis_mode', 'scheduled').in('gpt_market_runs.status', ['succeeded', 'partial'])
              .order('created_at', { ascending: false }).order('assessment_id').limit(1).abortSignal(signal).maybeSingle()
            if (r.error) throw r.error
            return r.data
          }))
          for (const row of rows) if (row) results.push(row)
        }
      }
      const readPlans = async () => {
        for (let batch = 0; batch < researchIds.length; batch += 100) {
          for (let offset = 0; ; offset += 500) {
            const r = await client.from('personal_prediction_plans').select('id,instrument_id,assessment_id,horizon_sessions,published_at,entry_deadline,action,thesis,risks,source_cutoff').eq('owner_user_id', ownerId).in('instrument_id', researchIds.slice(batch, batch + 100)).order('published_at', { ascending: false }).order('id').range(offset, offset + 499).abortSignal(signal)
            if (r.error) throw r.error
            published.push(...r.data)
            if (r.data.length < 500) break
          }
        }
      }
      const [research, planData, settings] = await Promise.allSettled([
        readAssessments(), readPlans(),
        client.from('personal_prediction_tracking').select('owner_user_id').eq('owner_user_id', ownerId).abortSignal(signal).maybeSingle(),
      ])
      if (signal.aborted) return
      if (research.status === 'fulfilled') setAssessments(results)
      if (planData.status === 'fulfilled') setPlans(published)
      if (settings.status === 'fulfilled' && !settings.value.error) setTracking(!!settings.value.data)
      if (research.status === 'rejected' || planData.status === 'rejected' || settings.status === 'rejected' || (settings.status === 'fulfilled' && settings.value.error)) setResearchError('Some AI research or tracking data could not be loaded. Your saved shares are still available.')
      setResearchLoading(false)
    }
    void loadResearch().catch(() => { if (!signal.aborted) { setResearchError('AI research could not be loaded.'); setResearchLoading(false) } })
    return () => controller.abort()
  }, [ownerId, researchIds, revision])

  const rows = activeItems.filter(i => !onlyBuy || ratingAction(assessmentMap.get(i.instrument_id)?.rating) === 'BUY')
  const selectedItem = activeItems.find(i => i.instrument_id === selectedId)
  const selectedInstrument = instrumentMap.get(selectedId)
  const selectedAssessment = assessmentMap.get(selectedId)
  const selectedPlan = matchingPlan(plans, selectedId, selectedAssessment?.assessment_id, horizon)
  const available = instruments.filter(i => i.is_active && !activeItems.some(item => item.instrument_id === i.id) && (i.symbol + ' ' + i.instrument_name).toLowerCase().includes(search.trim().toLowerCase()))
  const close = useCallback(() => { setModal(null); setError('') }, [])
  function open(next: Modal, item?: Item) {
    setError(''); setStatus(''); setSelectedId(item?.instrument_id ?? '')
    setName(next === 'edit' ? activeList?.name ?? '' : '')
    setDescription(next === 'edit' ? activeList?.description ?? '' : '')
    setNotes(item?.notes ?? ''); setSearch(''); setModal(next)
  }
  async function mutate(action: () => Promise<void>, message: string) {
    if (busy) return
    setBusy(true); setError(''); setStatus('')
    try { await action(); setModal(null); setStatus(message); setRevision(n => n + 1) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the change. Please try again.') }
    finally { setBusy(false) }
  }
  async function saveList(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    await mutate(async () => {
      const client = getBrowserSupabase()
      if (modal === 'create') {
        const r = await client.from('watchlists').insert({ owner_user_id: ownerId, name: name.trim(), description: description.trim() || null, is_default: !lists.some(l => l.is_default) }).select('id').single()
        if (r.error) throw r.error
        setListId(r.data.id)
      } else {
        const r = await client.from('watchlists').update({ name: name.trim(), description: description.trim() || null }).eq('id', listId).eq('owner_user_id', ownerId).select('id').single()
        if (r.error) throw r.error
      }
    }, 'Watchlist saved.')
  }
  async function add(id: string) {
    if (!activeList) return
    await mutate(async () => {
      const r = await getBrowserSupabase().from('watchlist_items').insert({ watchlist_id: activeList.id, instrument_id: id, sort_order: Math.max(0, ...activeItems.map(i => i.sort_order)) + 1 })
      if (r.error) throw r.error
    }, (instrumentMap.get(id)?.symbol ?? 'Share') + ' added.')
  }
  async function saveNotes() {
    if (!selectedItem) return
    await mutate(async () => {
      const r = await getBrowserSupabase().from('watchlist_items').update({ notes: notes.trim() || null }).eq('watchlist_id', listId).eq('instrument_id', selectedId).select('instrument_id').single()
      if (r.error) throw r.error
    }, 'Notes saved.')
  }
  async function remove() {
    await mutate(async () => {
      const client = getBrowserSupabase()
      const r = modal === 'delete'
        ? await client.from('watchlists').delete().eq('id', listId).eq('owner_user_id', ownerId).select('id').single()
        : await client.from('watchlist_items').delete().eq('watchlist_id', listId).eq('instrument_id', selectedId).select('instrument_id').single()
      if (r.error) throw r.error
    }, modal === 'delete' ? 'Watchlist deleted.' : 'Share removed.')
  }
  async function makeDefault() {
    await mutate(async () => {
      const r = await getBrowserSupabase().rpc('set_watchlist_default', { p_watchlist_id: listId })
      if (r.error) throw r.error
    }, 'Default watchlist updated.')
  }
  async function startTracking() {
    await mutate(async () => {
      const r = await getBrowserSupabase().rpc('start_personal_prediction_tracking_v1')
      if (r.error) throw r.error
    }, 'Tracking enabled for future assessments.')
  }

  const Heading = embedded ? 'h2' : 'h1'
  return <div className={styles.shell}>
    <header className={styles.hero}><Heading>My watchlist &amp; recommendations</Heading><div className={styles.actions}><button disabled={loading || busy} onClick={() => open('create')}>＋ Create watchlist</button><button className={styles.primary} disabled={!activeList || loading || busy} onClick={() => open('add')}>＋ Add share</button></div></header>
    {loadError && <div role="alert" className={styles.error}>{loadError}<button onClick={() => setRevision(n => n + 1)}>Retry</button></div>}
    {!modal && error && <p role="alert" className={styles.error}>{error}</p>}
    {status && <p role="status" className={styles.status}>{status}</p>}
    <div className={styles.toolbar}><div className={styles.actions}><select aria-label="Choose watchlist" value={listId} disabled={loading || busy || !lists.length} onChange={e => { setListId(e.target.value); setOnlyBuy(false); setStatus('') }}><option value="" disabled>Choose a watchlist</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' · Default' : ''}</option>)}</select>{activeList && <><span className={styles.muted}>{activeItems.length} shares</span><button aria-label="Watchlist settings" disabled={busy || loading} onClick={() => open('edit')}>⋯</button></>}</div><Link href="/my-dashboard?tab=decision-lab">View performance in Decision Lab →</Link></div>
    <div className={styles.filters}><div className={styles.segment} role="group" aria-label="Filter watched shares"><button aria-pressed={!onlyBuy} onClick={() => setOnlyBuy(false)}>All watched shares</button><button aria-pressed={onlyBuy} onClick={() => setOnlyBuy(true)}>AI buy candidates</button></div><div className={styles.segment} role="group" aria-label="Plan horizon"><button aria-pressed={horizon === 5} onClick={() => setHorizon(5)}>Weekly</button><button aria-pressed={horizon === 20} onClick={() => setHorizon(20)}>Monthly</button></div><span className={styles.muted}>Fixed timing rules · {horizon} market sessions</span></div>
    {researchError && <div role="alert" className={styles.error}>{researchError}<button onClick={() => setRevision(n => n + 1)}>Retry</button></div>}
    {loading ? <p role="status">Loading your watchlist…</p> : !loadError && <>
      {!activeList ? <section className={styles.empty}><h3>Create your first watchlist</h3><p>Use Create watchlist above, then add the shares you want to follow.</p></section> : !activeItems.length ? <section className={styles.empty}><h3>Your watchlist is empty</h3><p>Use Add share to search by ticker or company.</p></section> : <div className={styles.tableWrap} role="region" aria-label="Watchlist and AI recommendations" tabIndex={0}><table><caption className={styles.srOnly}>{activeList.name}: {horizon === 5 ? 'weekly' : 'monthly'} recommendations</caption><thead><tr><th scope="col">Share</th><th scope="col">AI view</th><th scope="col">Buy plan</th><th scope="col">Sell plan</th><th scope="col">Details</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{rows.map(item => {
        const instrument = instrumentMap.get(item.instrument_id)
        const assessment = assessmentMap.get(item.instrument_id)
        const action = ratingAction(assessment?.rating)
        const plan = matchingPlan(plans, item.instrument_id, assessment?.assessment_id, horizon)
        const expired = !!plan && Date.parse(plan.entry_deadline) < Date.now()
        return <tr key={item.instrument_id}><th scope="row"><Link href={'/markets/' + encodeURIComponent(instrument?.symbol ?? '')}>{instrument?.symbol ?? 'Unavailable share'}</Link><small>{instrument?.instrument_name ?? item.instrument_id}{instrument && !instrument.is_active ? ' · Inactive' : ''}</small></th><td>{researchLoading ? <span>Loading…</span> : assessment ? <><span className={[styles.badge, action === 'BUY' ? styles.buy : action === 'HOLD' ? styles.wait : styles.neutral].join(' ')}>{actionLabel[action]}</span><small>Assessed {date(assessment.assessment_date)}{olderAssessment(assessment.created_at) ? ' · Older assessment' : ''}</small></> : <span className={styles.muted}>{researchError ? 'Unavailable' : 'Not assessed yet'}</span>}</td><td>{researchLoading ? '—' : plan ? plan.action === 'BUY' ? <>{expired ? 'Entry window ended' : 'Next full-session close'}<small>{expired ? 'Ended' : 'After publication · expires'} {date(plan.entry_deadline)}</small></> : 'No entry planned' : <>No published plan{assessment && <small>Assessment only</small>}</>}</td><td>{plan?.action === 'BUY' ? <>Close {horizon} sessions after entry<small>Fixed holding rule</small></> : '—'}</td><td><button className={styles.textButton} aria-label={'View details for ' + (instrument?.symbol ?? 'share')} onClick={() => open('details', item)}>View details ↗</button></td><td><button aria-label={'Options for ' + (instrument?.symbol ?? 'share')} disabled={busy} onClick={() => open('notes', item)}>⋯</button></td></tr>
      })}{rows.length === 0 && <tr><td colSpan={6}>{researchLoading ? 'Loading AI views…' : 'No AI buy candidates in this watchlist.'}</td></tr>}</tbody></table></div>}
      <footer className={styles.footer}><span>{tracking === true ? 'Tracking on · Published plans stay in Decision Lab.' : tracking === false ? 'Tracking is off.' : researchError ? 'Tracking status unavailable.' : 'Checking tracking status…'}</span>{tracking === false && <button disabled={busy} onClick={startTracking}>Enable tracking</button>}</footer>
    </>}
    <details className={styles.method}><summary>How recommendations work</summary><p>AI views come from the latest saved scheduled assessment for each share. The assessment date is shown; views older than 72 hours are labelled. “Wait” means the source rating is Hold. These research views are the same for both horizons.</p><p>Weekly and monthly select separate published plans with fixed 5- or 20-session holding rules, not AI forecasts of the best entry or exit. A plan appears only when it matches the displayed assessment. The entry uses the first full-session daily close after publication, within seven days. No orders are placed. Full timing rules and outcomes are in Decision Lab.</p><p>Research can predate tracking. It is never backdated into your performance record. Removing a share or list does not remove published plans.</p></details>
    {modal && <WatchlistDialog title={modal === 'create' ? 'Create watchlist' : modal === 'add' ? 'Add share' : modal === 'edit' ? 'Watchlist settings' : modal === 'details' ? (selectedInstrument?.symbol ?? 'Share') + ' · AI view & plan' : modal === 'notes' ? (selectedInstrument?.symbol ?? 'Share') + ' · Options' : modal === 'delete' ? 'Delete watchlist?' : 'Remove share?'} onClose={close} busy={busy}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {(modal === 'create' || modal === 'edit') && <form onSubmit={saveList} className={styles.form}><label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} required maxLength={120} disabled={busy} /></label><details><summary>{description ? 'Description' : 'Add description'}</summary><label>Description (optional)<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} disabled={busy} /></label></details><div className={styles.actions}><button type="button" disabled={busy} onClick={close}>Cancel</button><button className={styles.primary} disabled={busy || !name.trim()}>{busy ? 'Saving…' : modal === 'create' ? 'Create' : 'Save'}</button></div>{modal === 'edit' && <div className={styles.settings}>{!activeList?.is_default && <button type="button" disabled={busy} onClick={makeDefault}>Make default</button>}<button className={styles.danger} type="button" disabled={busy} onClick={() => setModal('delete')}>Delete watchlist</button></div>}</form>}
      {modal === 'add' && <div className={styles.form}><label>Search ticker or company<input autoFocus type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. NVDA or NVIDIA" disabled={busy} /></label><ul className={styles.searchResults}>{available.slice(0, 30).map(i => <li key={i.id}><div><strong>{i.symbol}</strong><small>{i.instrument_name}</small></div><button aria-label={'Add ' + i.symbol} disabled={busy} onClick={() => add(i.id)}>＋ Add</button></li>)}</ul>{!available.length && <p>No matching shares available to add.</p>}{available.length > 30 && <p className={styles.muted}>Type a ticker or company to narrow the results.</p>}</div>}
      {modal === 'notes' && <div className={styles.form}><label>Private notes<textarea autoFocus value={notes} onChange={e => setNotes(e.target.value)} disabled={busy} /></label><div className={styles.actions}><button disabled={busy} onClick={close}>Cancel</button><button className={styles.primary} disabled={busy} onClick={saveNotes}>Save notes</button></div><button className={styles.danger} disabled={busy} onClick={() => setModal('remove')}>Remove from watchlist</button></div>}
      {(modal === 'remove' || modal === 'delete') && <div className={styles.form}><p>{modal === 'delete' ? 'Delete “' + activeList?.name + '” and its saved shares?' : 'Remove ' + selectedInstrument?.symbol + ' from this watchlist?'} Published predictions will remain in Decision Lab.</p><div className={styles.actions}><button autoFocus disabled={busy} onClick={close}>Cancel</button><button className={styles.danger} disabled={busy} onClick={remove}>{busy ? 'Removing…' : modal === 'delete' ? 'Delete watchlist' : 'Remove share'}</button></div></div>}
      {modal === 'details' && <div className={styles.detailBody}>{selectedAssessment ? <><p><strong>{selectedAssessment.rating}</strong> · Assessed {date(selectedAssessment.assessment_date)}{olderAssessment(selectedAssessment.created_at) ? ' · Older assessment' : ''}</p><h3>Why this share</h3><p>{selectedAssessment.summary || 'No summary supplied.'}</p><h3>Risks</h3><p>{selectedAssessment.key_risks || 'No separate risks supplied.'}</p><small>Model: {selectedAssessment.model_version ?? 'Not supplied'}</small></> : <p>No saved AI assessment is available for this share.</p>}<h3>{horizon === 5 ? 'Weekly' : 'Monthly'} plan</h3>{selectedPlan ? <><p>{selectedPlan.action === 'BUY' ? 'Fixed rule: next full-session close after publication, then exit after ' + horizon + ' market sessions from entry.' : 'No new entry planned.'}</p><p>Published {timestamp(selectedPlan.published_at)}<br/>Entry deadline {timestamp(selectedPlan.entry_deadline)}</p><small>Record: {selectedPlan.id}</small></> : <p>No published plan matches this assessment. Existing research has not been backdated into tracking.</p>}<Link href="/my-dashboard?tab=decision-lab">Open Decision Lab →</Link></div>}
    </WatchlistDialog>}
  </div>
}

