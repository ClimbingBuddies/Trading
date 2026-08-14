import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function decodeSymbol(value: string) {
  return decodeURIComponent(value).toUpperCase().replaceAll('-', '/')
}

export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeSymbol(rawSymbol)
  const supabase = getSupabase()

  const instrumentRes = await supabase
    .from('instruments')
    .select('id,symbol,instrument_name,currency_code')
    .eq('symbol', symbol)
    .maybeSingle()

  if (instrumentRes.error) {
    return NextResponse.json({ error: instrumentRes.error.message }, { status: 500 })
  }

  if (!instrumentRes.data) {
    return NextResponse.json({ tracked: false, symbol }, { status: 404 })
  }

  const observationsRes = await supabase
    .from('market_observations')
    .select('observed_at,close,currency_code')
    .eq('instrument_id', instrumentRes.data.id)
    .not('close', 'is', null)
    .order('observed_at', { ascending: false })
    .limit(80)

  if (observationsRes.error) {
    return NextResponse.json({ error: observationsRes.error.message }, { status: 500 })
  }

  const rows = observationsRes.data ?? []
  const latest = rows[0] ?? null

  return NextResponse.json({
    tracked: true,
    symbol: instrumentRes.data.symbol,
    instrument_name: instrumentRes.data.instrument_name,
    currency_code: latest?.currency_code?.trim() || instrumentRes.data.currency_code?.trim() || null,
    latest_price: latest?.close ?? null,
    latest_observation: latest?.observed_at ?? null,
    points: rows.map((row) => ({ observed_at: row.observed_at, close: row.close })),
  })
}
