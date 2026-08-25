export function scoreDelta(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null
  return current - previous
}

export function buildMarketRows(instruments, providerRows, statusRows) {
  const providerMap = new Map()
  for (const row of providerRows) {
    const provider = row.data_providers ?? null
    providerMap.set(row.instrument_id, {
      provider_name: provider?.provider_name ?? null,
      provider_code: provider?.provider_code ?? null,
    })
  }

  const statusMap = new Map(statusRows.map((row) => [row.instrument_id, row]))

  return instruments.map((instrument) => {
    const canonical = statusMap.get(instrument.id)
    const provider = providerMap.get(instrument.id)
    return {
      id: instrument.id,
      symbol: instrument.symbol,
      instrument_name: instrument.instrument_name,
      asset_type: instrument.asset_type,
      exchange_code: instrument.exchange_code,
      currency_code: String(canonical?.currency_code ?? instrument.currency_code ?? '').trim(),
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
}

export function summariseMarketRows(rows) {
  const counts = { total: 0, equity: 0, etf: 0, forex: 0, crypto: 0 }
  const statusSummary = { current: 0, due: 0, stale: 0, marketClosed: 0, noObservation: 0 }

  for (const row of rows) {
    counts.total += 1
    if (row.asset_type === 'equity') counts.equity += 1
    else if (row.asset_type === 'etf') counts.etf += 1
    else if (row.asset_type === 'forex') counts.forex += 1
    else if (row.asset_type === 'crypto') counts.crypto += 1

    if (row.data_status === 'current') statusSummary.current += 1
    else if (row.data_status === 'due') statusSummary.due += 1
    else if (row.data_status === 'stale') statusSummary.stale += 1
    else if (row.data_status === 'market_closed') statusSummary.marketClosed += 1
    else statusSummary.noObservation += 1
  }

  const latestObservationAt = rows
    .map((row) => row.observed_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  return { counts, statusSummary, latestObservationAt }
}

export function shouldShowEmptyState(loading, itemCount) {
  return !loading && itemCount === 0
}
