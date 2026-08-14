import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type RangeKey = '1D' | '5D' | '1M' | '1Y' | '5Y' | 'MAX'

type YahooChartResult = {
  meta?: {
    currency?: string
    regularMarketPrice?: number
  }
  timestamp?: number[]
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>
      high?: Array<number | null>
      low?: Array<number | null>
      close?: Array<number | null>
      volume?: Array<number | null>
    }>
  }
}

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[] | null
    error?: { description?: string } | null
  }
}

function decodeSymbol(value: string) {
  return decodeURIComponent(value).toUpperCase().replaceAll('-', '/')
}

function rangeStart(range: RangeKey) {
  if (range === 'MAX') return null
  const days = range === '1D' ? 1 : range === '5D' ? 5 : range === '1M' ? 31 : range === '1Y' ? 365 : 1825
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function yahooRange(range: RangeKey) {
  if (range === '1D') return { range: '1d', interval: '5m' }
  if (range === '5D') return { range: '5d', interval: '15m' }
  if (range === '1M') return { range: '1mo', interval: '1d' }
  if (range === '1Y') return { range: '1y', interval: '1d' }
  if (range === '5Y') return { range: '5y', interval: '1wk' }
  return { range: 'max', interval: '1mo' }
}

function yahooSymbol(symbol: string, exchangeCode: string | null | undefined) {
  const exchange = exchangeCode?.trim().toUpperCase()
  if (exchange === 'ASX') return `${symbol}.AX`
  if (exchange === 'LSE' || exchange === 'LON') return `${symbol}.L`
  if (exchange === 'TSX') return `${symbol}.TO`
  if (exchange === 'TSXV') return `${symbol}.V`
  if (exchange === 'HKEX' || exchange === 'HKG') return symbol.padStart(4, '0') + '.HK'
  return symbol
}

function numeric(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function getExternalTrend(symbol: string, range: RangeKey) {
  const supabase = getSupabase()
  const externalRes = await supabase
    .from('opportunity_theme_external_instruments')
    .select('symbol,instrument_name,exchange_code,asset_type,market_source,external_market_url')
    .eq('symbol', symbol)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (externalRes.error) return NextResponse.json({ error: externalRes.error.message }, { status: 500 })
  if (!externalRes.data) return NextResponse.json({ tracked: false, available: false, symbol }, { status: 404 })

  const yahoo = yahooRange(range)
  const quoteSymbol = yahooSymbol(externalRes.data.symbol, externalRes.data.exchange_code)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(quoteSymbol)}?range=${yahoo.range}&interval=${yahoo.interval}&includePrePost=false&events=div%2Csplits`

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 DiscoverBouldersMarkets/1.0' },
    })
    if (!response.ok) {
      return NextResponse.json({
        tracked: false,
        available: false,
        symbol,
        external_market_url: externalRes.data.external_market_url,
      }, { status: 502 })
    }

    const payload = await response.json() as YahooChartResponse
    const result = payload.chart?.result?.[0]
    const quote = result?.indicators?.quote?.[0]
    const timestamps = result?.timestamp ?? []
    const closes = quote?.close ?? []

    const rows = timestamps.flatMap((timestamp, index) => {
      const close = numeric(closes[index])
      if (close === null) return []
      return [{
        observed_at: new Date(timestamp * 1000).toISOString(),
        close,
        open: numeric(quote?.open?.[index]),
        high: numeric(quote?.high?.[index]),
        low: numeric(quote?.low?.[index]),
        volume: numeric(quote?.volume?.[index]),
      }]
    })

    if (!rows.length) {
      return NextResponse.json({
        tracked: false,
        available: false,
        symbol,
        external_market_url: externalRes.data.external_market_url,
      }, { status: 404 })
    }

    const oldest = rows[0]
    const latest = rows[rows.length - 1]
    const change = latest.close - oldest.close
    const changePercent = oldest.close === 0 ? null : (change / oldest.close) * 100
    const highs = rows.map((row) => row.high).filter((value): value is number => value !== null)
    const lows = rows.map((row) => row.low).filter((value): value is number => value !== null)
    const volume = rows.reduce((sum, row) => sum + (row.volume ?? 0), 0)

    return NextResponse.json({
      tracked: false,
      available: true,
      source: 'yahoo_finance',
      source_label: 'Yahoo Finance',
      range,
      symbol: externalRes.data.symbol,
      instrument_name: externalRes.data.instrument_name,
      currency_code: result?.meta?.currency?.trim() || null,
      latest_price: numeric(result?.meta?.regularMarketPrice) ?? latest.close,
      latest_observation: latest.observed_at,
      open: oldest.open ?? oldest.close,
      high: highs.length ? Math.max(...highs) : null,
      low: lows.length ? Math.min(...lows) : null,
      volume: volume || null,
      change,
      change_percent: changePercent,
      external_market_url: externalRes.data.external_market_url,
      points: rows.map((row) => ({ observed_at: row.observed_at, close: row.close })),
    })
  } catch {
    return NextResponse.json({
      tracked: false,
      available: false,
      symbol,
      external_market_url: externalRes.data.external_market_url,
    }, { status: 502 })
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeSymbol(rawSymbol)
  const requestedRange = new URL(request.url).searchParams.get('range')?.toUpperCase() as RangeKey | undefined
  const range: RangeKey = requestedRange && ['1D', '5D', '1M', '1Y', '5Y', 'MAX'].includes(requestedRange) ? requestedRange : '1D'
  const supabase = getSupabase()

  const instrumentRes = await supabase
    .from('instruments')
    .select('id,symbol,instrument_name,currency_code')
    .eq('symbol', symbol)
    .maybeSingle()

  if (instrumentRes.error) return NextResponse.json({ error: instrumentRes.error.message }, { status: 500 })
  if (!instrumentRes.data) return getExternalTrend(symbol, range)

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
    available: rows.length > 0,
    source: 'internal',
    source_label: 'Discover Boulders Markets',
    range,
    symbol: instrumentRes.data.symbol,
    instrument_name: instrumentRes.data.instrument_name,
    currency_code: latest?.currency_code?.trim() || instrumentRes.data.currency_code?.trim() || null,
    latest_price: latestClose,
    latest_observation: latest?.observed_at ?? null,
    open: periodOpen,
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
    volume: volume || null,
    change,
    change_percent: changePercent,
    points: rows.map((row) => ({ observed_at: row.observed_at, close: Number(row.close) })),
  })
}
