'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import styles from '@/app/opportunities/opportunities.module.css'

type Exposure = {
  theme_id: string
  instrument_id: string
  exposure_type: string
  exposure_score: number | null
  rationale: string | null
  is_active: boolean
  instruments: {
    symbol: string
    instrument_name: string
    asset_type: string
    exchange_code: string
  } | null
}

type TrendPoint = { observed_at: string; close: number }
type TrendPayload = {
  tracked: boolean
  symbol: string
  instrument_name?: string
  currency_code?: string
  latest_price?: number | null
  latest_observation?: string | null
  points?: TrendPoint[]
}

type SideTab = 'trend' | 'takeaway'

function fmtScore(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : Math.round(value).toString()
}

function titleCase(value: string | null | undefined) {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function symbolSlug(symbol: string) {
  return symbol.replaceAll('/', '-').toLowerCase()
}

function externalMarketUrl(symbol: string) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol.toUpperCase())}`
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('en-AU', { maximumFractionDigits: Math.abs(value) < 10 ? 4 : 2 })
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <div className={styles.trendEmpty}>Not enough internal observations to draw a trend yet.</div>

  const chronological = [...points].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime())
  const values = chronological.map((point) => point.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const coords = chronological.map((point, index) => {
    const x = (index / (chronological.length - 1)) * 100
    const y = 88 - ((point.close - min) / span) * 72
    return `${x},${y}`
  }).join(' ')

  const change = values[0] === 0 ? 0 : ((values[values.length - 1] - values[0]) / values[0]) * 100

  return (
    <div className={styles.trendChartWrap}>
      <svg className={styles.trendChart} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Recent internal price trend">
        <polyline points={coords} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={styles.trendRange}><span>{formatPrice(min)}</span><strong>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</strong><span>{formatPrice(max)}</span></div>
    </div>
  )
}

export default function OpportunityExposurePanel({ exposures }: { exposures: Exposure[] }) {
  const valid = useMemo(() => exposures.filter((row) => Boolean(row.instruments?.symbol)), [exposures])
  const [selectedId, setSelectedId] = useState(valid[0]?.instrument_id ?? '')
  const [tab, setTab] = useState<SideTab>('trend')
  const [trend, setTrend] = useState<TrendPayload | null>(null)
  const [loading, setLoading] = useState(false)

  const selected = valid.find((row) => row.instrument_id === selectedId) ?? valid[0]
  const symbol = selected?.instruments?.symbol ?? ''
  const top = valid[0]
  const exposureTypes = Array.from(new Set(valid.map((row) => titleCase(row.exposure_type))))

  useEffect(() => {
    if (!symbol) {
      setTrend(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setTrend(null)
    void fetch(`/api/market-trend/${encodeURIComponent(symbolSlug(symbol))}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return { tracked: false, symbol } as TrendPayload
        if (!response.ok) throw new Error(`Trend request failed: ${response.status}`)
        return response.json() as Promise<TrendPayload>
      })
      .then((payload) => setTrend(payload))
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('Unable to load internal ticker trend', error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [symbol])

  return (
    <section className={styles.exposureLayout}>
      <div className={styles.exposureList}>
        {valid.length ? valid.map((exposure) => {
          const itemSymbol = exposure.instruments?.symbol ?? ''
          const isSelected = exposure.instrument_id === selected?.instrument_id
          return (
            <article
              className={`${styles.exposureRow} ${isSelected ? styles.exposureRowSelected : ''}`}
              key={`${exposure.instrument_id}-${exposure.exposure_type}`}
              onClick={() => { setSelectedId(exposure.instrument_id); setTab('trend') }}
            >
              <div className={styles.instrumentIdentity}><span className={styles.instrumentBadge}>{itemSymbol.slice(0, 4)}</span><div><strong>{itemSymbol}</strong><span>{exposure.instruments?.instrument_name}</span></div></div>
              <div className={styles.exposureScoreBlock}><span>Exposure Score</span><strong>{fmtScore(exposure.exposure_score)}<small>/100</small></strong></div>
              <div className={styles.exposureTypeBlock}><span>Type</span><strong>{titleCase(exposure.exposure_type)}</strong></div>
              <div className={styles.exposureRationale}><span>Rationale</span><p>{exposure.rationale ?? 'No exposure rationale supplied.'}</p></div>
              <Link className={styles.viewButton} href={`/markets/${symbolSlug(itemSymbol)}`} onClick={(event) => event.stopPropagation()}>Market ↗</Link>
            </article>
          )
        }) : <div className={styles.darkEmpty}>No tracked instruments are currently linked to this theme.</div>}
      </div>

      <aside className={styles.exposureInspector}>
        <div className={styles.inspectorTabs} role="tablist" aria-label="Exposure context">
          <button className={tab === 'trend' ? styles.inspectorTabActive : styles.inspectorTab} onClick={() => setTab('trend')} type="button">Ticker Trend</button>
          <button className={tab === 'takeaway' ? styles.inspectorTabActive : styles.inspectorTab} onClick={() => setTab('takeaway')} type="button">Exposure Takeaway</button>
        </div>

        {tab === 'trend' ? (
          <div className={styles.trendPanel}>
            {selected?.instruments ? <>
              <div className={styles.trendHeading}><div><span>Selected instrument</span><h3>{selected.instruments.symbol}</h3><p>{selected.instruments.instrument_name}</p></div><strong>{fmtScore(selected.exposure_score)}<small>/100 exposure</small></strong></div>
              {loading ? <div className={styles.trendEmpty}>Loading internal market history…</div> : trend?.tracked ? <>
                <div className={styles.trendPrice}><strong>{formatPrice(trend.latest_price)}</strong><span>{trend.currency_code ?? ''}</span><small>Latest observation {formatDate(trend.latest_observation)}</small></div>
                <Sparkline points={trend.points ?? []} />
                <Link className={styles.inspectorAction} href={`/markets/${symbolSlug(selected.instruments.symbol)}`}>Open market →</Link>
              </> : <>
                <div className={styles.trendEmpty}>This ticker does not currently have an internal market record or price history.</div>
                <a className={styles.inspectorAction} href={externalMarketUrl(selected.instruments.symbol)} target="_blank" rel="noreferrer noopener">View external ↗</a>
              </>}
            </> : <div className={styles.trendEmpty}>Select an exposure to inspect its ticker trend.</div>}
          </div>
        ) : (
          <div className={styles.takeawayPanel}>
            <span className={`${styles.roundIcon} ${styles.blueIcon}`}>◎</span>
            <h3>Exposure Takeaway</h3>
            {top?.instruments ? <p><strong>{top.instruments.symbol}</strong> currently has the highest mapped exposure at {fmtScore(top.exposure_score)}/100, classified as {titleCase(top.exposure_type)}.</p> : <p>No exposure mapping is available yet.</p>}
            <div className={styles.takeawayDivider} />
            <span>Mapped types</span>
            <p>{exposureTypes.length ? exposureTypes.join(' · ') : '—'}</p>
            <span>Mapped instruments</span>
            <p>{valid.length}</p>
          </div>
        )}
      </aside>
    </section>
  )
}
