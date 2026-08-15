'use client'

import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import styles from './PriceHistoryChart.module.css'

type Point = { observed_at: string; close: number }
type RangeKey = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y'

type TrendPayload = {
  tracked: boolean
  range: RangeKey
  points?: Point[]
  period_start?: string | null
  latest_observation?: string | null
}

const RANGES: RangeKey[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y']

function rangeLabel(range: RangeKey) {
  return {
    '1D': '1 day',
    '1W': '1 week',
    '1M': '1 month',
    '3M': '3 months',
    '6M': '6 months',
    '1Y': '1 year',
    '5Y': '5 years',
  }[range]
}

function axisTick(value: string, range: RangeKey) {
  const date = new Date(value)
  if (range === '1D') {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Perth',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  }
  if (range === '1W') {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Perth',
      weekday: 'short',
      day: '2-digit',
    }).format(date)
  }
  if (range === '1Y') {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Perth',
      month: 'short',
    }).format(date)
  }
  if (range === '5Y') {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Perth',
      month: 'short',
      year: '2-digit',
    }).format(date)
  }
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function weekKey(value: string) {
  const date = new Date(value)
  const utcDay = date.getUTCDay() || 7
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - utcDay + 1)
  return monday.toISOString().slice(0, 10)
}

function visualPoints(points: Point[], range: RangeKey) {
  const ordered = [...points].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime())

  // Short ranges retain the intraday shape. Longer ranges deliberately collapse
  // dense quote data so the chart stays smooth while the underlying data remains untouched.
  if (range === '1D' || range === '1W' || range === '1M') return ordered

  const grouped = new Map<string, Point>()
  for (const point of ordered) {
    const key = range === '5Y' ? weekKey(point.observed_at) : new Date(point.observed_at).toISOString().slice(0, 10)
    grouped.set(key, point)
  }

  return [...grouped.values()]
}

export default function PriceHistoryChart({ symbol, data }: { symbol: string; data: Point[] }) {
  const [range, setRange] = useState<RangeKey>('1Y')
  const [points, setPoints] = useState<Point[]>(data)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const slug = symbol.replaceAll('/', '-').toLowerCase()
    setLoading(true)
    setError(null)

    void fetch(`/api/market-trend/${encodeURIComponent(slug)}?range=${range}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`History request failed: ${response.status}`)
        return response.json() as Promise<TrendPayload>
      })
      .then((payload) => setPoints(payload.points ?? []))
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load price history')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [range, symbol])

  const ordered = useMemo(() => visualPoints(points, range), [points, range])

  return (
    <div>
      <div className={styles.rangeBar} aria-label="Price history period">
        {RANGES.map((item) => (
          <button
            key={item}
            type="button"
            className={range === item ? styles.rangeActive : styles.rangeButton}
            onClick={() => setRange(item)}
            aria-pressed={range === item}
          >
            {item}
          </button>
        ))}
      </div>

      <div className={styles.rangeMeta}>
        <span>{rangeLabel(range)}</span>
        {loading && <span className={styles.loadingMeta}>Updating chart…</span>}
        {!loading && error && <span>Unable to refresh this period.</span>}
        {!loading && !error && ordered.length > 0 && (
          <span>{ordered.length.toLocaleString('en-AU')} plotted points</span>
        )}
      </div>

      {ordered.length < 2 ? (
        <div className="chartEmpty">{loading ? 'Loading price history…' : 'Not enough Supabase history is available for this period yet.'}</div>
      ) : (
        <div className={`${styles.chartFrame} ${loading ? styles.chartUpdating : ''}`}>
          <div className="chartWrap">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ordered} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="observed_at"
                  tickFormatter={(value) => axisTick(String(value), range)}
                  minTickGap={range === '1D' ? 34 : 42}
                  fontSize={12}
                />
                <YAxis domain={['auto', 'auto']} fontSize={12} width={62} />
                <Tooltip
                  labelFormatter={(value) => new Intl.DateTimeFormat('en-AU', {
                    timeZone: 'Australia/Perth',
                    dateStyle: 'medium',
                    timeStyle: range === '1D' || range === '1W' || range === '1M' ? 'short' : undefined,
                  }).format(new Date(String(value)))}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  name="Close"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {loading && <div className={styles.chartProgress} aria-hidden="true" />}
        </div>
      )}
    </div>
  )
}
