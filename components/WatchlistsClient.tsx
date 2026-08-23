'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import styles from './WatchlistsClient.module.css'

type Watchlist = {
  id: string
  owner_user_id: string
  name: string
  description: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

type WatchlistItem = {
  watchlist_id: string
  instrument_id: string
  sort_order: number
  notes: string | null
  added_at: string
}

type Instrument = {
  id: string
  symbol: string
  instrument_name: string
  asset_type: string | null
  exchange_code: string | null
}

function permanentUser(user: User | null | undefined) {
  return user && user.is_anonymous !== true ? user : null
}

export default function WatchlistsClient() {
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async (userId: string, preferredListId?: string | null) => {
    const supabase = getBrowserSupabase()
    const { data: listRows, error: listError } = await supabase
      .from('watchlists')
      .select('id,owner_user_id,name,description,is_default,created_at,updated_at')
      .eq('owner_user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    if (listError) throw listError

    const lists = (listRows ?? []) as Watchlist[]
    const listIds = lists.map((list) => list.id)

    const instrumentRequest = supabase
      .from('instruments')
      .select('id,symbol,instrument_name,asset_type,exchange_code')
      .eq('is_active', true)
      .order('symbol', { ascending: true })

    const itemRequest = listIds.length
      ? supabase
          .from('watchlist_items')
          .select('watchlist_id,instrument_id,sort_order,notes,added_at')
          .in('watchlist_id', listIds)
          .order('sort_order', { ascending: true })
          .order('added_at', { ascending: true })
      : Promise.resolve({ data: [], error: null })

    const [{ data: instrumentRows, error: instrumentError }, itemResult] = await Promise.all([
      instrumentRequest,
      itemRequest,
    ])

    if (instrumentError) throw instrumentError
    if (itemResult.error) throw itemResult.error

    setWatchlists(lists)
    setItems((itemResult.data ?? []) as WatchlistItem[])
    setInstruments((instrumentRows ?? []) as Instrument[])

    const selected =
      (preferredListId && lists.some((list) => list.id === preferredListId) && preferredListId) ||
      lists.find((list) => list.is_default)?.id ||
      lists[0]?.id ||
      null
    setActiveListId(selected)
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
        setError('Anonymous sessions cannot use private watchlists. Sign in with a permanent email account.')
      }
      if (current) {
        loadData(current.id).catch((loadError) => setError(loadError.message))
      }
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
        setWatchlists([])
        setItems([])
        setActiveListId(null)
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadData])

  const activeList = useMemo(
    () => watchlists.find((list) => list.id === activeListId) ?? null,
    [watchlists, activeListId],
  )

  const activeItems = useMemo(
    () => items
      .filter((item) => item.watchlist_id === activeListId)
      .sort((left, right) => left.sort_order - right.sort_order || left.added_at.localeCompare(right.added_at)),
    [items, activeListId],
  )

  const instrumentMap = useMemo(
    () => new Map(instruments.map((instrument) => [instrument.id, instrument])),
    [instruments],
  )

  const availableInstruments = useMemo(() => {
    const existing = new Set(activeItems.map((item) => item.instrument_id))
    return instruments.filter((instrument) => !existing.has(instrument.id))
  }, [activeItems, instruments])

  useEffect(() => {
    setEditName(activeList?.name ?? '')
    setEditDescription(activeList?.description ?? '')
    setSelectedInstrumentId('')
  }, [activeList])

  async function runAction(action: () => Promise<void>, successMessage?: string) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await action()
      if (successMessage) setStatus(successMessage)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Watchlist action failed.')
    } finally {
      setBusy(false)
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    await runAction(async () => {
      const supabase = getBrowserSupabase()
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/watchlists`,
          shouldCreateUser: true,
        },
      })
      if (authError) throw authError
      setStatus('Check your email for the secure sign-in link. The public dashboard remains available while signed out.')
    })
  }

  async function signOut() {
    await runAction(async () => {
      const { error: authError } = await getBrowserSupabase().auth.signOut()
      if (authError) throw authError
      setStatus('Signed out.')
    })
  }

  async function createWatchlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !newListName.trim()) return

    await runAction(async () => {
      const supabase = getBrowserSupabase()
      const { data, error: insertError } = await supabase
        .from('watchlists')
        .insert({
          owner_user_id: user.id,
          name: newListName.trim(),
          description: newListDescription.trim() || null,
          is_default: !watchlists.some((list) => list.is_default),
        })
        .select('id')
        .single()
      if (insertError) throw insertError
      setNewListName('')
      setNewListDescription('')
      await loadData(user.id, data.id)
    }, 'Watchlist created.')
  }

  async function saveWatchlist() {
    if (!user || !activeList || !editName.trim()) return
    await runAction(async () => {
      const { error: updateError } = await getBrowserSupabase()
        .from('watchlists')
        .update({ name: editName.trim(), description: editDescription.trim() || null })
        .eq('id', activeList.id)
        .eq('owner_user_id', user.id)
      if (updateError) throw updateError
      await loadData(user.id, activeList.id)
    }, 'Watchlist details saved.')
  }

  async function setDefault() {
    if (!user || !activeList) return
    await runAction(async () => {
      const { error: rpcError } = await getBrowserSupabase().rpc('set_watchlist_default', {
        p_watchlist_id: activeList.id,
      })
      if (rpcError) throw rpcError
      await loadData(user.id, activeList.id)
    }, 'Default watchlist updated.')
  }

  async function deleteWatchlist() {
    if (!user || !activeList) return
    if (!window.confirm(`Delete “${activeList.name}” and all of its items?`)) return

    await runAction(async () => {
      const { error: deleteError } = await getBrowserSupabase()
        .from('watchlists')
        .delete()
        .eq('id', activeList.id)
        .eq('owner_user_id', user.id)
      if (deleteError) throw deleteError
      await loadData(user.id)
    }, 'Watchlist deleted.')
  }

  async function addInstrument() {
    if (!user || !activeList || !selectedInstrumentId) return
    const nextOrder = activeItems.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1

    await runAction(async () => {
      const { error: insertError } = await getBrowserSupabase()
        .from('watchlist_items')
        .insert({
          watchlist_id: activeList.id,
          instrument_id: selectedInstrumentId,
          sort_order: nextOrder,
        })
      if (insertError) throw insertError
      setSelectedInstrumentId('')
      await loadData(user.id, activeList.id)
    }, 'Instrument added.')
  }

  async function saveNotes(item: WatchlistItem, notes: string) {
    if (!user || !activeList) return
    await runAction(async () => {
      const { error: updateError } = await getBrowserSupabase()
        .from('watchlist_items')
        .update({ notes: notes.trim() || null })
        .eq('watchlist_id', activeList.id)
        .eq('instrument_id', item.instrument_id)
      if (updateError) throw updateError
      await loadData(user.id, activeList.id)
    }, 'Notes saved.')
  }

  async function moveItem(item: WatchlistItem, direction: -1 | 1) {
    if (!user || !activeList) return
    const index = activeItems.findIndex((candidate) => candidate.instrument_id === item.instrument_id)
    const target = activeItems[index + direction]
    if (!target) return

    await runAction(async () => {
      const supabase = getBrowserSupabase()
      const first = await supabase
        .from('watchlist_items')
        .update({ sort_order: target.sort_order })
        .eq('watchlist_id', activeList.id)
        .eq('instrument_id', item.instrument_id)
      if (first.error) throw first.error

      const second = await supabase
        .from('watchlist_items')
        .update({ sort_order: item.sort_order })
        .eq('watchlist_id', activeList.id)
        .eq('instrument_id', target.instrument_id)
      if (second.error) throw second.error

      await loadData(user.id, activeList.id)
    })
  }

  async function removeItem(item: WatchlistItem) {
    if (!user || !activeList) return
    await runAction(async () => {
      const { error: deleteError } = await getBrowserSupabase()
        .from('watchlist_items')
        .delete()
        .eq('watchlist_id', activeList.id)
        .eq('instrument_id', item.instrument_id)
      if (deleteError) throw deleteError
      await loadData(user.id, activeList.id)
    }, 'Instrument removed.')
  }

  if (!authReady) {
    return <div className={styles.authCard}>Checking secure watchlist session…</div>
  }

  if (!user) {
    return (
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <h1>Watchlists</h1>
            <p>Private instrument lists backed by Supabase Auth and row-level security.</p>
          </div>
        </header>
        {error ? <p className={styles.error}>{error}</p> : null}
        {status ? <p className={styles.status}>{status}</p> : null}
        <section className={styles.authCard}>
          <h2>Sign in to use watchlists</h2>
          <p>
            The Markets, Assessments and Opportunities dashboards stay public. Watchlists are private and require a permanent email account.
          </p>
          <form className={styles.formGrid} onSubmit={signIn}>
            <label className={styles.field}>
              Email address
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={busy}>Send secure sign-in link</button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <h1>Watchlists</h1>
          <p>Maintain private instrument lists. Database RLS remains authoritative for every read and write.</p>
        </div>
        <div className={styles.signedIn}>
          <span>{user.email ?? 'Authenticated user'}</span>
          <button className={styles.secondaryButton} type="button" onClick={signOut} disabled={busy}>Sign out</button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {status ? <p className={styles.status}>{status}</p> : null}

      <form className={styles.panel} onSubmit={createWatchlist}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Create a watchlist</h2>
            <p>New lists are owned by your authenticated user ID. The first list becomes your default automatically.</p>
          </div>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            Name
            <input className={styles.input} value={newListName} onChange={(event) => setNewListName(event.target.value)} required />
          </label>
          <label className={styles.field}>
            Description
            <input className={styles.input} value={newListDescription} onChange={(event) => setNewListDescription(event.target.value)} />
          </label>
          <div className={styles.buttonRow}>
            <button className={styles.primaryButton} type="submit" disabled={busy || !newListName.trim()}>Create watchlist</button>
          </div>
        </div>
      </form>

      <div className={styles.workspace}>
        <aside className={styles.listRail} aria-label="Your watchlists">
          <div className={styles.listRailHeader}>
            <h2>Your lists</h2>
            <span className={styles.muted}>{watchlists.length}</span>
          </div>
          {watchlists.length ? watchlists.map((list) => (
            <button
              key={list.id}
              type="button"
              className={`${styles.listButton} ${list.id === activeListId ? styles.listButtonActive : ''}`}
              onClick={() => setActiveListId(list.id)}
            >
              <strong>{list.name}</strong>
              <span>{items.filter((item) => item.watchlist_id === list.id).length} instruments</span>
              {list.is_default ? <span className={styles.badge}>Default</span> : null}
            </button>
          )) : <div className={styles.empty}>Create your first watchlist to begin.</div>}
        </aside>

        {activeList ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{activeList.name}</h2>
                <p>{activeList.is_default ? 'Default watchlist' : 'Private watchlist'}</p>
              </div>
              <div className={styles.toolbar}>
                {!activeList.is_default ? (
                  <button className={styles.secondaryButton} type="button" onClick={setDefault} disabled={busy}>Make default</button>
                ) : null}
                <button className={styles.dangerButton} type="button" onClick={deleteWatchlist} disabled={busy}>Delete list</button>
              </div>
            </div>

            <div className={styles.section}>
              <h3>List details</h3>
              <label className={styles.field}>
                Name
                <input className={styles.input} value={editName} onChange={(event) => setEditName(event.target.value)} />
              </label>
              <label className={styles.field}>
                Description
                <input className={styles.input} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
              </label>
              <div className={styles.buttonRow}>
                <button className={styles.secondaryButton} type="button" onClick={saveWatchlist} disabled={busy || !editName.trim()}>Save details</button>
              </div>
            </div>

            <div className={styles.section}>
              <h3>Add an instrument</h3>
              <div className={styles.addRow}>
                <label className={styles.field}>
                  Available tracked instrument
                  <select className={styles.select} value={selectedInstrumentId} onChange={(event) => setSelectedInstrumentId(event.target.value)}>
                    <option value="">Select an instrument…</option>
                    {availableInstruments.map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {instrument.symbol} — {instrument.instrument_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={styles.primaryButton} type="button" onClick={addInstrument} disabled={busy || !selectedInstrumentId}>Add</button>
              </div>
              {!availableInstruments.length && instruments.length ? <p className={styles.helper}>All active tracked instruments are already in this list.</p> : null}
            </div>

            <div className={styles.section}>
              <h3>Instruments</h3>
              {activeItems.length ? (
                <div className={styles.itemList}>
                  {activeItems.map((item, index) => {
                    const instrument = instrumentMap.get(item.instrument_id)
                    return (
                      <article className={styles.itemCard} key={`${item.watchlist_id}-${item.instrument_id}`}>
                        <div className={styles.instrument}>
                          <strong>{instrument?.symbol ?? item.instrument_id}</strong>
                          <span>{instrument?.instrument_name ?? 'Tracked instrument'}</span>
                        </div>
                        <span className={styles.muted}>{instrument?.asset_type ?? 'instrument'}{instrument?.exchange_code ? ` · ${instrument.exchange_code}` : ''}</span>
                        <label className={styles.field}>
                          Private notes
                          <textarea
                            className={styles.textarea}
                            defaultValue={item.notes ?? ''}
                            onBlur={(event) => {
                              if ((item.notes ?? '') !== event.target.value.trim()) saveNotes(item, event.target.value)
                            }}
                            disabled={busy}
                          />
                        </label>
                        <div className={styles.itemActions}>
                          <button className={styles.iconButton} type="button" onClick={() => moveItem(item, -1)} disabled={busy || index === 0} aria-label={`Move ${instrument?.symbol ?? 'instrument'} up`}>↑</button>
                          <button className={styles.iconButton} type="button" onClick={() => moveItem(item, 1)} disabled={busy || index === activeItems.length - 1} aria-label={`Move ${instrument?.symbol ?? 'instrument'} down`}>↓</button>
                          <button className={styles.dangerButton} type="button" onClick={() => removeItem(item)} disabled={busy}>Remove</button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : <div className={styles.empty}>No instruments yet. Add one from the tracked universe above.</div>}
            </div>
          </section>
        ) : (
          <section className={styles.panel}>
            <div className={styles.empty}>Create or choose a watchlist to maintain its instruments.</div>
          </section>
        )}
      </div>
    </div>
  )
}
