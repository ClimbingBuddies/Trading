export type CriticalMarketRow = {
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
  session_status: 'open' | 'closed' | '24h'
  data_status: 'current' | 'due' | 'stale' | 'market_closed' | 'no_data'
}

export function scoreDelta(current: number | null | undefined, previous: number | null | undefined): number | null
export function buildMarketRows(
  instruments: Array<Record<string, any>>,
  providerRows: Array<Record<string, any>>,
  statusRows: Array<Record<string, any>>,
): CriticalMarketRow[]
export function summariseMarketRows(rows: CriticalMarketRow[]): {
  counts: { total: number; equity: number; etf: number; forex: number; crypto: number }
  statusSummary: { current: number; due: number; stale: number; marketClosed: number; noObservation: number }
  latestObservationAt: string | null
}
export function shouldShowEmptyState(loading: boolean, itemCount: number): boolean
