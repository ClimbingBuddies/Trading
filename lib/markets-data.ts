import { getSupabase } from './supabase'
import { buildMarketRows, summariseMarketRows } from './quality-critical.mjs'

export type MarketSessionStatus = 'open' | 'closed' | '24h'
export type MarketDataStatus = 'current' | 'due' | 'stale' | 'market_closed' | 'no_data'

type CanonicalStatusRow = {
  instrument_id: string
  close: number | null
  observed_at: string | null
  loaded_at: string | null
  currency_code: string | null
  age_minutes: number | null
  session_status: MarketSessionStatus
  data_status: MarketDataStatus
}

export type MarketRow = {
  id: string
  symbol: string
  instrument_name: string
  asset_type: string
  exchange_code: string
  currency_code: string
  latest_price: number | null
  observed_at: string | null
  loaded_at: string | null
  provider_name: string | null
  provider_code: string | null
  age_minutes: number | null
  session_status: MarketSessionStatus
  data_status: MarketDataStatus
}

export async function getMarketsData() {
  const supabase = getSupabase()
  const [instrumentsRes, providersRes, statusRes] = await Promise.all([
    supabase
      .from('instruments')
      .select('id,symbol,instrument_name,exchange_code,asset_type,currency_code,is_active')
      .eq('is_active', true)
      .order('asset_type')
      .order('symbol'),
    supabase
      .from('provider_instruments')
      .select('instrument_id,is_active,data_providers(provider_name,provider_code)')
      .eq('is_active', true),
    supabase
      .from('latest_market_status')
      .select('instrument_id,close,observed_at,loaded_at,currency_code,age_minutes,session_status,data_status'),
  ])

  if (instrumentsRes.error) throw instrumentsRes.error
  if (providersRes.error) throw providersRes.error
  if (statusRes.error) throw statusRes.error

  const rows = buildMarketRows(
    instrumentsRes.data ?? [],
    providersRes.data ?? [],
    (statusRes.data ?? []) as unknown as CanonicalStatusRow[],
  ) as MarketRow[]
  const { counts, statusSummary, latestObservationAt } = summariseMarketRows(rows)

  return { rows, counts, statusSummary, latestObservationAt }
}
