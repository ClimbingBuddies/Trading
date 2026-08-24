import { getSupabase } from './supabase'

export type MarketSessionStatus = 'open' | 'closed' | '24h'
export type MarketDataStatus = 'current' | 'due' | 'stale' | 'market_closed' | 'no_data'

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

  const providerMap = new Map<string, { provider_name: string | null; provider_code: string | null }>()
  for (const row of providersRes.data ?? []) {
    const provider = (row as unknown as { data_providers: { provider_name: string; provider_code: string } | null }).data_providers
    providerMap.set(row.instrument_id, {
      provider_name: provider?.provider_name ?? null,
      provider_code: provider?.provider_code ?? null,
    })
  }

  const statusMap = new Map<string, {
    close: number | null
    observed_at: string | null
    loaded_at: string | null
    currency_code: string | null
    age_minutes: number | null
    session_status: MarketSessionStatus
    data_status: MarketDataStatus
  }>()
  for (const row of statusRes.data ?? []) {
    statusMap.set(row.instrument_id, row as unknown as ReturnType<typeof statusMap.get> extends infer _T ? never : never)
  }

  // Type the map values explicitly without trusting generated view typings.
  const rows: MarketRow[] = (instrumentsRes.data ?? []).map((instrument) => {
    const canonical = (statusRes.data ?? []).find((row) => row.instrument_id === instrument.id) as unknown as {
      close: number | null
      observed_at: string | null
      loaded_at: string | null
      currency_code: string | null
      age_minutes: number | null
      session_status: MarketSessionStatus
      data_status: MarketDataStatus
    } | undefined
    const provider = providerMap.get(instrument.id)
    return {
      id: instrument.id,
      symbol: instrument.symbol,
      instrument_name: instrument.instrument_name,
      asset_type: instrument.asset_type,
      exchange_code: instrument.exchange_code,
      currency_code: (canonical?.currency_code ?? instrument.currency_code).trim(),
      latest_price: canonical?.close ?? null,
      observed_at: canonical?.observed_at ?? null,
      loaded_at: canonical?.loaded_at ?? null,
      provider_name: provider?.provider_name ?? null,
      provider_code: provider?.provider_code ?? null,
      age_minutes: canonical?.age_minutes ?? null,
      session_status: canonical?.session_status ?? '24h',
      data_status: canonical?.data_status ?? 'no_data',
    }
  })

  const counts = rows.reduce(
    (acc, row) => {
      acc.total += 1
      if (row.asset_type === 'equity') acc.equity += 1
      else if (row.asset_type === 'etf') acc.etf += 1
      else if (row.asset_type === 'forex') acc.forex += 1
      else if (row.asset_type === 'crypto') acc.crypto += 1
      return acc
    },
    { total: 0, equity: 0, etf: 0, forex: 0, crypto: 0 },
  )

  const statusSummary = { current: 0, due: 0, stale: 0, marketClosed: 0, noObservation: 0 }
  for (const row of rows) {
    if (row.data_status === 'current') statusSummary.current += 1
    else if (row.data_status === 'due') statusSummary.due += 1
    else if (row.data_status === 'stale') statusSummary.stale += 1
    else if (row.data_status === 'market_closed') statusSummary.marketClosed += 1
    else statusSummary.noObservation += 1
  }

  const latestObservationAt = rows
    .map((row) => row.observed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null

  return { rows, counts, statusSummary, latestObservationAt }
}
