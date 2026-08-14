'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useSearchParams } from 'next/navigation'

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

type SelectedExposure = {
  symbol: string
  name: string
  score: string
}

function symbolFromHref(href: string) {
  const slug = href.split('/').filter(Boolean).at(-1) ?? ''
  return decodeURIComponent(slug).replaceAll('-', '/').toUpperCase()
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
  if (points.length < 2) return <div className="oppTrendEmpty">Not enough internal observations to draw a trend yet.</div>

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
    <div className="oppTrendChartWrap">
      <svg className="oppTrendChart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Recent internal price trend">
        <polyline points={coords} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="oppTrendRange"><span>{formatPrice(min)}</span><strong>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</strong><span>{formatPrice(max)}</span></div>
    </div>
  )
}

export default function OpportunityExposurePanel() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [takeawayHtml, setTakeawayHtml] = useState('')
  const [selected, setSelected] = useState<SelectedExposure | null>(null)
  const [tab, setTab] = useState<'trend' | 'takeaway'>('trend')
  const [trend, setTrend] = useState<TrendPayload | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pathname.startsWith('/opportunities/') || searchParams.get('view') !== 'exposure') {
      setMount(null)
      return
    }

    const aside = document.querySelector<HTMLElement>('[class*="exposureTakeaway"]')
    if (!aside) return
    const layout = aside.parentElement
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[class*="exposureRow"]'))
    if (!layout || !rows.length) return

    layout.classList.add('oppExposureInspectorLayout')
    aside.classList.add('oppExposureInspector')
    const originalHtml = aside.innerHTML
    setTakeawayHtml(originalHtml)

    let portalMount = aside.querySelector<HTMLElement>(':scope > .oppExposureMount')
    if (!portalMount) {
      portalMount = document.createElement('div')
      portalMount.className = 'oppExposureMount'
      aside.appendChild(portalMount)
    }
    setMount(portalMount)

    const cleanups: Array<() => void> = []
    const selectRow = (row: HTMLElement) => {
      rows.forEach((item) => item.classList.remove('oppExposureSelected'))
      row.classList.add('oppExposureSelected')
      const link = row.querySelector<HTMLAnchorElement>('a[href^="/markets/"]')
      const identity = row.querySelector<HTMLElement>('[class*="instrumentIdentity"]')
      const scoreBlock = row.querySelector<HTMLElement>('[class*="exposureScoreBlock"]')
      if (!link) return
      const symbol = symbolFromHref(link.getAttribute('href') ?? '')
      const name = identity?.querySelector('span:last-child')?.textContent?.trim() ?? ''
      const score = scoreBlock?.querySelector('strong')?.textContent?.replace('/100', '').trim() ?? '—'
      setSelected({ symbol, name, score })
      setTab('trend')
    }

    rows.forEach((row, index) => {
      row.classList.add('oppExposureSelectable')
      const handler = (event: Event) => {
        const target = event.target as HTMLElement
        if (target.closest('a')) return
        selectRow(row)
      }
      row.addEventListener('click', handler)
      cleanups.push(() => row.removeEventListener('click', handler))
      if (index === 0) selectRow(row)
    })

    return () => {
      cleanups.forEach((cleanup) => cleanup())
      layout.classList.remove('oppExposureInspectorLayout')
      aside.classList.remove('oppExposureInspector')
      rows.forEach((row) => row.classList.remove('oppExposureSelectable', 'oppExposureSelected'))
      portalMount?.remove()
      setMount(null)
    }
  }, [pathname, searchParams])

  useEffect(() => {
    if (!selected?.symbol) return
    const controller = new AbortController()
    setLoading(true)
    setTrend(null)
    const slug = selected.symbol.replaceAll('/', '-').toLowerCase()
    void fetch(`/api/market-trend/${encodeURIComponent(slug)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return { tracked: false, symbol: selected.symbol } as TrendPayload
        if (!response.ok) throw new Error(`Trend request failed: ${response.status}`)
        return response.json() as Promise<TrendPayload>
      })
      .then((payload) => setTrend(payload))
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('Unable to load Opportunity ticker trend', error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [selected])

  if (!mount) return null

  return createPortal(
    <div className="oppExposureInspectorInner">
      <div className="oppInspectorTabs" role="tablist" aria-label="Exposure context">
        <button type="button" className={tab === 'trend' ? 'active' : ''} onClick={() => setTab('trend')}>Ticker Trend</button>
        <button type="button" className={tab === 'takeaway' ? 'active' : ''} onClick={() => setTab('takeaway')}>Exposure Takeaway</button>
      </div>

      {tab === 'takeaway' ? (
        <div className="oppTakeawayOriginal" dangerouslySetInnerHTML={{ __html: takeawayHtml }} />
      ) : selected ? (
        <div className="oppTrendPanel">
          <div className="oppTrendHeading">
            <div><span>Selected instrument</span><h3>{selected.symbol}</h3><p>{selected.name}</p></div>
            <strong>{selected.score}<small>/100 exposure</small></strong>
          </div>

          {loading ? <div className="oppTrendEmpty">Loading internal market history…</div> : trend?.tracked ? <>
            <div className="oppTrendPrice"><strong>{formatPrice(trend.latest_price)}</strong><span>{trend.currency_code ?? ''}</span><small>Latest observation {formatDate(trend.latest_observation)}</small></div>
            <Sparkline points={trend.points ?? []} />
            <a className="oppInspectorAction" href={`/markets/${selected.symbol.replaceAll('/', '-').toLowerCase()}`}>Open market →</a>
          </> : <>
            <div className="oppTrendEmpty">This ticker is not currently available in our internal market database.</div>
            <a className="oppInspectorAction" href={externalMarketUrl(selected.symbol)} target="_blank" rel="noreferrer noopener">View external ↗</a>
          </>}
        </div>
      ) : <div className="oppTrendEmpty">Select an exposure to inspect its market trend.</div>}
    </div>,
    mount,
  )
}
