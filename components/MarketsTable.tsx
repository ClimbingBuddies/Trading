'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { MarketRow } from '@/lib/dashboard'

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

function freshness(row: MarketRow) {
  if (row.age_minutes === null) return { label: 'No data', tone: 'neutral' }
  if (row.age_minutes < 15) return { label: '< 15 min', tone: 'healthy' }
  if (row.age_minutes < 60) return { label: `${row.age_minutes} min`, tone: 'healthy' }
  if (row.age_minutes < 240) return { label: `${Math.round(row.age_minutes / 60)} hr`, tone: 'warning' }
  return { label: `${Math.round(row.age_minutes / 60)} hr`, tone: 'neutral' }
}

function symbolSlug(symbol: string) {
  return symbol.replaceAll('/', '-').toLowerCase()
}

export default function MarketsTable({ rows }: { rows: MarketRow[] }) {
  const [asset, setAsset] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesAsset = asset === 'all' || row.asset_type === asset
      const matchesSearch = !q || row.symbol.toLowerCase().includes(q) || row.instrument_name.toLowerCase().includes(q)
      return matchesAsset && matchesSearch
    })
  }, [asset, rows, search])

  return (
    <>
      <div className="tableTools">
        <div className="filterTabs" aria-label="Asset class filter">
          {filters.map((filter) => {
            const count = filter.key === 'all' ? rows.length : rows.filter((row) => row.asset_type === filter.key).length
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
        <label className="searchBox">
          <span className="srOnly">Search instruments</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search instruments…" />
        </label>
      </div>

      <div className="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Symbol</th><th>Name</th><th>Asset class</th><th>Exchange</th><th>Latest price</th><th>Last observation</th><th>Age</th><th>Provider</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((row) => {
              const fresh = freshness(row)
              return (
                <tr key={row.id}>
                  <td><Link className="rowLink" href={`/markets/${symbolSlug(row.symbol)}`}>{row.symbol}</Link></td>
                  <td>{row.instrument_name}</td>
                  <td><span className="assetTag">{row.asset_type}</span></td>
                  <td>{row.exchange_code}</td>
                  <td className="numericCell">{fmtPrice(row.latest_price, row.currency_code)}</td>
                  <td>{fmtTime(row.loaded_at)}</td>
                  <td><span className={`freshnessState ${fresh.tone}`}>{fresh.label}</span></td>
                  <td>{row.provider_code ?? row.provider_name ?? '—'}</td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={8}>
                  <div className="tableEmpty">No instruments match this filter yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
