'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { MarketRow } from '@/lib/dashboard'
import { getBrowserSupabase } from '@/lib/supabase-browser'

const filters = [
  { key: 'all', label: 'All' },
  { key: 'equity', label: 'Equities' },
  { key: 'etf', label: 'ETFs' },
  { key: 'forex', label: 'Forex' },
  { key: 'crypto', label: 'Crypto' },
]

function fmtTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function fmtPrice(value: number | null, currency: string) {
  if (value === null) return '—'
  const digits = Math.abs(value) < 10 ? 5 : 2
  return `${value.toLocaleString('en-AU', { maximumFractionDigits: digits })} ${currency}`
}

function ageLabel(ageMinutes: number | null) {
  if (ageMinutes === null) return '—'
  if (ageMinutes < 60) return `${ageMinutes} min`
  if (ageMinutes < 24 * 60) return `${Math.round(ageMinutes / 60)} hr`
  return `${Math.round(ageMinutes / (24 * 60))} d`
}

function statusDisplay(row: MarketRow) {
  if (row.data_status === 'current') return { label: 'Current', tone: 'healthy' }
  if (row.data_status === 'due') return { label: 'Due', tone: 'warning' }
  if (row.data_status === 'stale') return { label: 'Stale', tone: 'toneBad' }
  if (row.data_status === 'market_closed') return { label: 'Market closed', tone: 'neutral' }
  return { label: 'No data', tone: 'neutral' }
}

function sessionDisplay(row: MarketRow) {
  if (row.session_status === '24h') return { label: '24h', tone: 'status-running' }
  if (row.session_status === 'open') return { label: 'Open', tone: 'status-succeeded' }
  return { label: 'Closed', tone: '' }
}

function symbolSlug(symbol: string) {
  return symbol.replaceAll('/', '-').toLowerCase()
}

export default function MarketsTable({ rows }: { rows: MarketRow[] }) {
  const [asset, setAsset] = useState('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'tracked' | 'watchlist'>('tracked')
  const [watchlistIds, setWatchlistIds] = useState<string[]>([])
  const [watchlistState, setWatchlistState] = useState<'loading' | 'signed_out' | 'ready' | 'error'>('loading')
  const [watchlistError, setWatchlistError] = useState('')

  useEffect(() => {
    let mounted = true
    const supabase = getBrowserSupabase()

    async function loadWatchlist() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const user = sessionData.session?.user
        if (!user || user.is_anonymous) {
          if (!mounted) return
          setWatchlistIds([])
          setWatchlistError('')
          setWatchlistState('signed_out')
          return
        }

        const { data: listRows, error: listError } = await supabase
          .from('watchlists')
          .select('id')
          .eq('owner_user_id', user.id)
        if (listError) throw listError

        const listIds = (listRows ?? []).map((list) => list.id as string)
        if (!listIds.length) {
          if (!mounted) return
          setWatchlistIds([])
          setWatchlistError('')
          setWatchlistState('ready')
          return
        }

        const { data: itemRows, error: itemError } = await supabase
          .from('watchlist_items')
          .select('instrument_id')
          .in('watchlist_id', listIds)
        if (itemError) throw itemError

        if (!mounted) return
        setWatchlistIds((itemRows ?? []).map((item) => item.instrument_id as string))
        setWatchlistError('')
        setWatchlistState('ready')
      } catch (loadError) {
        if (!mounted) return
        setWatchlistIds([])
        setWatchlistError(loadError instanceof Error ? loadError.message : 'Watchlist data could not be loaded.')
        setWatchlistState('error')
      }
    }

    loadWatchlist()
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => { void loadWatchlist() }, 0)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const sourceRows = view === 'watchlist' ? rows.filter((row) => watchlistIds.includes(row.id)) : rows

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sourceRows.filter((row) => {
      const matchesAsset = asset === 'all' || row.asset_type === asset
      const matchesSearch = !q || row.symbol.toLowerCase().includes(q) || row.instrument_name.toLowerCase().includes(q)
      return matchesAsset && matchesSearch
    })
  }, [asset, search, sourceRows])

  return (
    <>
      <div className="tableTools">
        <div className="tableFilterStack">
          <div className="viewTabs" aria-label="Instrument view">
            <button
              className={view === 'tracked' ? 'viewTab viewTabActive' : 'viewTab'}
              onClick={() => { setView('tracked'); setAsset('all') }}
              type="button"
              aria-pressed={view === 'tracked'}
            >
              Tracked <span>{rows.length}</span>
            </button>
            <button
              className={view === 'watchlist' ? 'viewTab viewTabActive' : 'viewTab'}
              onClick={() => { setView('watchlist'); setAsset('all') }}
              type="button"
              aria-pressed={view === 'watchlist'}
            >
              Watchlist <span>{watchlistState === 'ready' ? watchlistIds.length : '—'}</span>
            </button>
          </div>
          <div className="filterTabs" aria-label="Asset class filter">
          {filters.map((filter) => {
            const count = filter.key === 'all' ? sourceRows.length : sourceRows.filter((row) => row.asset_type === filter.key).length
            return (
              <button
                className={asset === filter.key ? 'filterTab filterTabActive' : 'filterTab'}
                key={filter.key}
                onClick={() => setAsset(filter.key)}
                type="button"
              >
                {filter.label} <span>{count}</span>
              </button>
            )
          })}
          </div>
        </div>
        <label className="searchBox">
          <span className="srOnly">Search instruments</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === 'watchlist' ? 'Search watchlist…' : 'Search instruments…'} />
        </label>
      </div>

      <div className="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Symbol</th><th>Name</th><th>Asset class</th><th>Exchange</th><th>Latest price</th><th>Last observation</th><th>Market</th><th>Data status</th><th>Provider</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((row) => {
              const status = statusDisplay(row)
              const session = sessionDisplay(row)
              return (
                <tr key={row.id}>
                  <td><Link className="rowLink" href={`/markets/${symbolSlug(row.symbol)}`}>{row.symbol}</Link></td>
                  <td>{row.instrument_name}</td>
                  <td><span className="assetTag">{row.asset_type}</span></td>
                  <td>{row.exchange_code}</td>
                  <td className="numericCell">{fmtPrice(row.latest_price, row.currency_code)}</td>
                  <td>{fmtTime(row.observed_at)}</td>
                  <td><span className={`status ${session.tone}`}>{session.label}</span></td>
                  <td><span className={`freshnessState ${status.tone}`}>{status.label}</span> <span className="contextText">{ageLabel(row.age_minutes)}</span></td>
                  <td>{row.provider_code ?? row.provider_name ?? '—'}</td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={9}>
                  <div className="tableEmpty">
                    {view === 'watchlist' ? (
                      watchlistState === 'signed_out' ? (
                        <>Sign in to view your private watchlist. <Link className="inlineLink" href="/watchlists">Open Watchlists</Link></>
                      ) : watchlistState === 'loading' ? (
                        'Loading your watchlist…'
                      ) : watchlistState === 'error' ? (
                        <>Watchlist unavailable{watchlistError ? ': ' + watchlistError : '.'} <Link className="inlineLink" href="/watchlists">Open Watchlists</Link></>
                      ) : (
                        <>Your watchlist is empty. <Link className="inlineLink" href="/watchlists">Add instruments in Watchlists</Link>.</>
                      )
                    ) : (
                      'No instruments match this filter yet.'
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
