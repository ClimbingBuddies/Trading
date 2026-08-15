import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type RangeKey = '1D' | '5D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX'

const VALID_RANGES: RangeKey[] = ['1D', '5D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX']

function decodeSymbol(value: string) {
  return decodeURIComponent(value).toUpperCase().replaceAll('-', '/')
}

function rangeStart(range: RangeKey) {
  if (range === 'MAX') return null
  const days = {
    '1D': 1,
    '5D': 5,
    '1W': 7,
    '1M': 31,
    '3M': 93,
    '6M': 186,
    '1Y': 365,
    '5Y': 1825,
  }[range]
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeSymbol(rawSymbol)
  const requestedRange = new URL(request.url).searchParams.get('range')?.toUpperCase() as RangeKey | undefined
  const range: RangeKey = requestedRange && VALID_RANGES.includes(requestedRange) ? requestedRange : '1D'
  const supabase = getSupabase()

  const instrumentRes = await supabase
    .from('instruments')
    .select('id,symbol,instrument_name,currency_code')
    .eq('symbol', symbol)
    .maybeSingle()

  if (instrumentRes.error) return NextResponse.json({ error: instrumentRes.error.message }, { status: 500 })
  if (!instrumentRes.data) return NextResponse.json({ tracked: false, symbol }, { status: 404 })

  let query = supabase
    .from('market_observations')
    .select('observed_at,open,high,low,close,volume,currency_code')
    .eq('instrument_id', instrumentRes.data.id)
    .not('close', 'is', null)
    .order('observed_at', { ascending: false })
    .limit(1500)

  const start = rangeStart(range)
  if (start) query = query.gte('observed_at', start)

  const observationsRes = await query
  if (observationsRes.error) return NextResponse.json({ error: observationsRes.error.message }, { status: 500 })

  const rows = observationsRes.data ?? []
  const latest = rows[0] ?? null
  const oldest = rows[rows.length - 1] ?? null
  const latestClose = latest?.close == null ? null : Number(latest.close)
  const oldestClose = oldest?.close == null ? null : Number(oldest.close)
  const change = latestClose == null || oldestClose == null ? null : latestClose - oldestClose
  const changePercent = change == null || oldestClose == null || oldestClose === 0 ? null : (change / oldestClose) * 100

  const rawOpen = oldest?.open
  const periodOpen = rawOpen == null ? oldestClose : Number(rawOpen)
  const highs = rows.map((row) => row.high == null ? null : Number(row.high)).filter((value): value is number => value !== null)
  const lows = rows.map((row) => row.low == null ? null : Number(row.low)).filter((value): value is number => value !== null)
  const volume = rows.reduce((sum, row) => sum + Number(row.volume ?? 0), 0)

  return NextResponse.json({
    tracked: true,
    range,
    symbol: instrumentRes.data.symbol,
    instrument_name: instrumentRes.data.instrument_name,
    currency_code: latest?.currency_code?.trim() || instrumentRes.data.currency_code?.trim() || null,
    latest_price: latestClose,
    latest_observation: latest?.observed_at ?? null,
    period_start: oldest?.observed_at ?? null,
    open: periodOpen,
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
    volume: volume || null,
    change,
    change_percent: changePercent,
    points: rows.map((row) => ({ observed_at: row.observed_at, close: Number(row.close) })),
  })
}
