// Yahoo's unofficial chart endpoint. No credentials or paid subscription required.
export function sydneyDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
export function addDays(date, days) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function normalizeYahoo(payload, symbol, currency, start, end) {
  if (payload?.chart?.error) throw new Error('Yahoo: ' + payload.chart.error.description);
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  if (meta?.symbol !== symbol || meta?.exchangeName !== 'ASX' || meta?.currency !== currency || meta?.exchangeTimezoneName !== 'Australia/Sydney' || meta?.dataGranularity !== '1d') {
    throw new Error('Yahoo identity, exchange, currency, timezone or interval mismatch');
  }
  const timestamps = result.timestamp;
  const quotes = result.indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || !quotes) throw new Error('Yahoo returned no price series');
  const rows = [], rejected = [], seen = new Set();
  let skipped = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (!Number.isFinite(timestamps[i])) throw new Error('Yahoo invalid timestamp');
    const date = sydneyDate(new Date(timestamps[i] * 1000));
    // Exclude today's partial session and any bars outside the requested window.
    if (date < start || date > end) continue;
    if (seen.has(date)) throw new Error('Yahoo duplicate trading date: ' + date);
    seen.add(date);
    const values = ['open', 'high', 'low', 'close'].map(k => quotes[k]?.[i]);
    if (values.every(v => v == null)) { skipped++; continue; }
    const [open, high, low, close] = values;
    const volume = quotes.volume?.[i] ?? null;
    const adjusted_close = result.indicators?.adjclose?.[0]?.adjclose?.[i] ?? null;
    const tolerance = Math.max(...values) * 1e-6;
    if (values.some(v => !Number.isFinite(v) || v <= 0) || high + tolerance < Math.max(open, close, low) || low - tolerance > Math.min(open, close, high) || (volume !== null && (!Number.isFinite(volume) || volume < 0)) || (adjusted_close !== null && (!Number.isFinite(adjusted_close) || adjusted_close <= 0))) {
      rejected.push({ date, open, high, low, close, adjusted_close, volume, reason: 'Invalid OHLC or volume; original provider values preserved, excluded from observations' });
      continue;
    }
    rows.push({ date, open, high, low, close, adjusted_close, volume });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, rejected, skipped, meta, events: result.events ?? {} };
}
export async function fetchYahoo(symbol, currency, start, end) {
  const endpoint = new URL('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol));
  // A one-day buffer includes ASX sessions whose UTC open falls on the prior date.
  endpoint.searchParams.set('period1', String(Date.parse(addDays(start, -1) + 'T00:00:00Z') / 1000));
  endpoint.searchParams.set('period2', String(Date.parse(addDays(end, 1) + 'T00:00:00Z') / 1000));
  endpoint.searchParams.set('interval', '1d');
  endpoint.searchParams.set('events', 'div,splits');
  const response = await fetch(endpoint, { headers: { 'User-Agent': 'TradingDashboard/1.0 (personal research)', 'Accept': 'application/json' }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Yahoo HTTP ' + response.status + (response.status === 429 ? ': rate limited; retry later' : ''));
  return normalizeYahoo(await response.json(), symbol, currency, start, end);
}

export async function backfillYahoo(db, inst, job) {
  const { data: provider, error: pe } = await db.from('data_providers').select('id').eq('provider_code', 'yahoo').eq('is_active', true).single();
  if (pe || !provider) throw new Error('Yahoo provider unavailable');
  const symbol = inst.symbol.endsWith('.AX') ? inst.symbol : inst.symbol + '.AX';
  const end = addDays(sydneyDate(), -1);
  const years = Math.min(10, Math.max(1, Number(job.years) || 5));
  const since = new Date(end + 'T00:00:00Z');
  since.setUTCFullYear(since.getUTCFullYear() - years);
  const start = since.toISOString().slice(0, 10);
  // Re-fetch the full bounded window: fills internal gaps and refreshes corporate-action adjustments.
  const metadata = { function: 'asx-yahoo-market-history', provider: 'yahoo', symbol: inst.symbol, provider_symbol: symbol, exchange: 'ASX', requested_start_date: start, requested_end_date: end, price_basis: 'Yahoo native OHLC plus separately supplied adjusted close' };
  const { data: run, error: re } = await db.from('sync_runs').insert({ provider_id: provider.id, requested_count: 1, status: 'running', metadata }).select('id').single();
  if (re || !run) throw new Error(re?.message ?? 'Could not create Yahoo sync run');
  try {
    const result = await fetchYahoo(symbol, inst.currency_code.trim(), start, end);
    if (!result.rows.length) throw new Error('Yahoo returned no usable daily bars');
    const retrieved_at = new Date().toISOString();
    let inserted = 0;
    for (let offset = 0; offset < result.rows.length; offset += 250) {
      const rows = result.rows.slice(offset, offset + 250).map(row => ({
        instrument_id: inst.id, provider_id: provider.id, interval_code: '1day', observed_at: row.date + 'T00:00:00.000Z',
        open: row.open, high: row.high, low: row.low, close: row.close, adjusted_close: row.adjusted_close, volume: row.volume,
        currency_code: inst.currency_code, is_delayed: true,
        raw_payload: { ...row, _backfill: { ...metadata, retrieved_at, source: 'Yahoo Finance' } }
      }));
      const { data: existing, error: ee } = await db.from('market_observations').select('observed_at').eq('instrument_id', inst.id).eq('provider_id', provider.id).eq('interval_code', '1day').in('observed_at', rows.map(r => r.observed_at));
      if (ee) throw new Error(ee.message);
      const seen = new Set((existing ?? []).map(r => new Date(r.observed_at).toISOString()));
      const { error } = await db.from('market_observations').upsert(rows, { onConflict: 'instrument_id,provider_id,interval_code,observed_at' });
      if (error) throw new Error(error.message);
      inserted += rows.filter(r => !seen.has(r.observed_at)).length;
    }
    const coverage_start = result.rows[0].date + 'T00:00:00Z';
    const coverage_end = result.rows.at(-1).date + 'T00:00:00Z';
    const warning = result.rejected.length ? `Loaded valid history; ${result.rejected.length} invalid Yahoo bars excluded. See sync_runs metadata.rejected_bars.` : null;
    const { error: auditError } = await db.from('sync_runs').update({ status: 'succeeded', finished_at: new Date().toISOString(), received_count: result.rows.length + result.rejected.length, inserted_count: inserted, metadata: { ...metadata, coverage_start, coverage_end, valid_rows: result.rows.length, rejected_bars: result.rejected, coverage_has_rejected_bars: result.rejected.length > 0, skipped_empty_bars: result.skipped, events: result.events, retrieved_at } }).eq('id', run.id);
    if (auditError) throw new Error(auditError.message);
    return { sync_run_id: run.id, requested_start: start, requested_end: end, coverage_start, coverage_end, received_count: result.rows.length + result.rejected.length, inserted_count: inserted, last_error: warning };
  } catch (error) {
    await db.from('sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error_message: String(error).slice(0, 2000) }).eq('id', run.id);
    throw error;
  }
}
