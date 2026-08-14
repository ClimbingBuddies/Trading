'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

type TrendPoint = { observed_at: string; close: number }
type RangeKey = '1D' | '5D' | '1M' | '1Y' | '5Y' | 'MAX'
type TrendPayload = {
  tracked: boolean
  symbol: string
  instrument_name?: string
  currency_code?: string
  latest_price?: number | null
  latest_observation?: string | null
  open?: number | null
  high?: number | null
  low?: number | null
  volume?: number | null
  change?: number | null
  change_percent?: number | null
  points?: TrendPoint[]
}

type SelectedExposure = {
  symbol: string
  name: string
  score: string
}

const RANGES: RangeKey[] = ['1D', '5D', '1M', '1Y', '5Y', 'MAX']

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

function formatVolume(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function TrendChart({ points, positive }: { points: TrendPoint[]; positive: boolean }) {
  if (points.length < 2) return <div className="oppTrendEmpty">Not enough internal observations to draw this period yet.</div>

  const chronological = [...points].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime())
  const values = chronological.map((point) => point.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const coords = chronological.map((point, index) => {
    const x = 3 + (index / (chronological.length - 1)) * 94
    const y = 86 - ((point.close - min) / span) * 68
    return `${x},${y}`
  }).join(' ')
  const area = `3,92 ${coords} 97,92`

  return (
    <div className={`oppTrendChartWrap ${positive ? 'positive' : 'negative'}`}>
      <svg className="oppTrendChart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Internal price trend">
        <line x1="3" y1="25" x2="97" y2="25" className="grid" />
        <line x1="3" y1="55" x2="97" y2="55" className="grid" />
        <line x1="3" y1="85" x2="97" y2="85" className="grid" />
        <polygon points={area} className="area" />
        <polyline points={coords} className="line" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="oppTrendRange"><span>{formatPrice(min)}</span><span>{formatPrice(max)}</span></div>
    </div>
  )
}

export default function OpportunityExposurePanel() {
  const pathname = usePathname()
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [takeawayHtml, setTakeawayHtml] = useState('')
  const [selected, setSelected] = useState<SelectedExposure | null>(null)
  const [tab, setTab] = useState<'trend' | 'takeaway'>('takeaway')
  const [range, setRange] = useState<RangeKey>('1Y')
  const [trend, setTrend] = useState<TrendPayload | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get('view')
    if (!pathname.startsWith('/opportunities/') || view !== 'exposure') {
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
    setTakeawayHtml(aside.innerHTML.replace('Tracked instruments', 'Mapped instruments'))

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
      setRange('1Y')
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
      if (index === 0) {
        const link = row.querySelector<HTMLAnchorElement>('a[href^="/markets/"]')
        const identity = row.querySelector<HTMLElement>('[class*="instrumentIdentity"]')
        const scoreBlock = row.querySelector<HTMLElement>('[class*="exposureScoreBlock"]')
        if (link) {
          const symbol = symbolFromHref(link.getAttribute('href') ?? '')
          const name = identity?.querySelector('span:last-child')?.textContent?.trim() ?? ''
          const score = scoreBlock?.querySelector('strong')?.textContent?.replace('/100', '').trim() ?? '—'
          setSelected({ symbol, name, score })
        }
      }
    })

    return () => {
      cleanups.forEach((cleanup) => cleanup())
      layout.classList.remove('oppExposureInspectorLayout')
      aside.classList.remove('oppExposureInspector')
      rows.forEach((row) => row.classList.remove('oppExposureSelectable', 'oppExposureSelected'))
      portalMount?.remove()
      setMount(null)
    }
  }, [pathname])

  useEffect(() => {
    if (!selected?.symbol || tab !== 'trend') return
    const controller = new AbortController()
    setLoading(true)
    setTrend(null)
    const slug = selected.symbol.replaceAll('/', '-').toLowerCase()
    void fetch(`/api/market-trend/${encodeURIComponent(slug)}?range=${range}`, { cache: 'no-store', signal: controller.signal })
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
  }, [selected, range, tab])

  if (!mount) return null

  const positive = (trend?.change ?? 0) >= 0

  return createPortal(
    <div className="oppExposureInspectorInner">
      <div className="oppInspectorTabs" role="tablist" aria-label="Exposure context">
        <button type="button" className={tab === 'takeaway' ? 'active' : ''} onClick={() => setTab('takeaway')}>Exposure Takeaway</button>
        <button type="button" className={tab === 'trend' ? 'active' : ''} onClick={() => setTab('trend')}>Ticker Trend</button>
      </div>

      {tab === 'takeaway' ? (
        <div className="oppTakeawayOriginal" dangerouslySetInnerHTML={{ __html: takeawayHtml }} />
      ) : selected ? (
        <div className="oppTrendPanel">
          <div className="oppTrendHeading">
            <div><span>{selected.symbol}</span><h3>{selected.name || selected.symbol}</h3></div>
            <strong>{selected.score}<small>/100 exposure</small></strong>
          </div>

          {loading ? <div className="oppTrendEmpty">Loading market history…</div> : trend?.tracked ? <>
            <div className="oppTrendPriceLine">
              <div className="oppTrendPrice"><strong>{formatPrice(trend.latest_price)}</strong><span>{trend.currency_code ?? ''}</span></div>
              <div className={`oppTrendChange ${positive ? 'positive' : 'negative'}`}>
                <strong>{positive ? '+' : ''}{formatPrice(trend.change)}</strong>
                <span>({positive ? '+' : ''}{(trend.change_percent ?? 0).toFixed(2)}%)</span>
              </div>
            </div>
            <div className="oppTrendObserved">Latest internal observation · {formatDate(trend.latest_observation)}</div>

            <div className="oppTrendRanges" aria-label="Trend period">
              {RANGES.map((item) => <button key={item} type="button" className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}
            </div>

            <TrendChart points={trend.points ?? []} positive={positive} />

            <div className="oppTrendStats">
              <div><span>Open</span><strong>{formatPrice(trend.open)}</strong></div>
              <div><span>High</span><strong>{formatPrice(trend.high)}</strong></div>
              <div><span>Low</span><strong>{formatPrice(trend.low)}</strong></div>
              <div><span>Volume</span><strong>{formatVolume(trend.volume)}</strong></div>
            </div>
            <a className="oppInspectorAction" href={`/markets/${selected.symbol.replaceAll('/', '-').toLowerCase()}`}>Open full market →</a>
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