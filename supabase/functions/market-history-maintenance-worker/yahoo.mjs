// Yahoo's unofficial chart endpoint. No credentials or paid subscription required.
import { acceptedProviderDates, assessDailyRevision, historyWindow, mergeConsistentDailyRows, mergeEventManifest, yahooEventManifest } from './history-window.mjs';
import { JobStateUnconfirmed } from './job-state.mjs';
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
  const rows = [], rejected = [], duplicates = [], byDate = new Map();
  const fields = ['open', 'high', 'low', 'close', 'adjusted_close', 'volume'];
  let skipped = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (!Number.isFinite(timestamps[i])) throw new Error('Yahoo invalid timestamp');
    const date = sydneyDate(new Date(timestamps[i] * 1000));
    // Exclude today's partial session and any bars outside the requested window.
    if (date < start || date > end) continue;
    const bar = { date, source_timestamp: timestamps[i],
      ...Object.fromEntries(['open', 'high', 'low', 'close', 'volume'].map(k => [k, quotes[k]?.[i] ?? null])),
      adjusted_close: result.indicators?.adjclose?.[0]?.adjclose?.[i] ?? null };
    const group = byDate.get(date) ?? [];
    group.push(bar);
    byDate.set(date, group);
  }
  for (const [date, bars] of byDate) {
    // Yahoo can append a complete close alongside a same-session placeholder
    // whose close AND adjusted close are null. Select an entire complete bar
    // only when every other populated field agrees exactly. Never merge fields,
    // round provider comparisons, or select between competing complete values.
    const complete = bars.find(bar => Number.isFinite(bar.close) && bar.close > 0
      && Number.isFinite(bar.adjusted_close) && bar.adjusted_close > 0);
    const placeholder = bar => bar.close === null && bar.adjusted_close === null;
    const reconciled = bars.length > 1 && complete && Number.isFinite(complete.volume) && complete.volume >= 0 && bars.some(placeholder)
      && bars.every(bar => fields.every(key => Object.is(bar[key], complete[key])
        || (placeholder(bar) && (key === 'close' || key === 'adjusted_close'))));
    const first = reconciled ? complete : bars[0];
    if (!reconciled && bars.some(bar => fields.some(key => !Object.is(bar[key], first[key])))) {
      rejected.push({ date, reason: 'Conflicting duplicate daily bars; entire session excluded', source_bars: bars });
      continue;
    }
    if (bars.length > 1) duplicates.push({ date, count: bars.length, source_bars: bars,
      reason: reconciled ? 'Complete bar with exactly matching close-null placeholder' : 'Identical daily values collapsed',
      ...(reconciled ? { selected_source_timestamp: first.source_timestamp, normalization_version: 2 } : {}) });
    const { open, high, low, close, volume, adjusted_close } = first;
    const values = [open, high, low, close];
    if (values.every(v => v == null)) { skipped += bars.length; continue; }
    const tolerance = Math.max(...values) * 1e-6;
    if (values.some(v => !Number.isFinite(v) || v <= 0) || high + tolerance < Math.max(open, close, low) || low - tolerance > Math.min(open, close, high) || (volume !== null && (!Number.isFinite(volume) || volume < 0)) || (adjusted_close !== null && (!Number.isFinite(adjusted_close) || adjusted_close <= 0))) {
      rejected.push({ date, open, high, low, close, adjusted_close, volume, reason: 'Invalid OHLC or volume; original provider values preserved, excluded from observations' });
      continue;
    }
    rows.push({ date, open, high, low, close, adjusted_close, volume });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, rejected, skipped, duplicates, meta, events: result.events ?? {} };
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
  let start = since.toISOString().slice(0, 10), persisted = [], prior = {}, priorAuditId = null, revalidation = null;
  const daily = job.job_type === 'daily_incremental';
  let window = historyWindow(end);
  if (daily) {
    const { data: stored, error: storedError } = await db.from('market_observations')
      .select('observed_at,open,high,low,close,adjusted_close,volume')
      .eq('instrument_id', inst.id).eq('provider_id', provider.id).eq('interval_code', '1day')
      .gte('observed_at', window.horizonStart + 'T00:00:00.000Z').lte('observed_at', end + 'T00:00:00.000Z');
    if (storedError || !Array.isArray(stored)) throw new Error('Could not verify persisted Yahoo daily history');
    persisted = stored;
    const { data: audit, error: auditError } = await db.from('sync_runs').select('id,metadata')
      .eq('provider_id', provider.id).eq('metadata->>function', 'asx-yahoo-market-history')
      .eq('metadata->>provider_symbol', symbol).in('status', ['succeeded', 'failed'])
      .order('finished_at', { ascending: false }).limit(1).maybeSingle();
    if (auditError) throw new Error('Could not verify Yahoo provider-date audit');
    prior = audit?.metadata ?? {}; priorAuditId = audit?.id ?? null;
    window = historyWindow(end, persisted, prior); start = window.start;
    // One bounded revalidation after upgrading a quarantined legacy audit.
    // A clean full fetch is required by the Technical source contract; an
    // overlap cannot erase the earlier rejected audit from its lineage.
    // Transport/write failures retain pending state for the existing bounded
    // retry policy. A completed but incomplete response is quarantined rather
    // than repeatedly downloading a year with no new recovery authorization.
    const rejectedDates = [...new Set([...(prior.rejected_bars ?? []),
      ...(prior.fetch_attempts ?? []).flatMap(attempt => attempt.rejected_bars ?? [])]
      .map(bar => bar.date).filter(date => typeof date === 'string' && date >= window.horizonStart && date <= end))].sort();
    revalidation = prior.normalization_revalidation ?? null;
    if ((prior.normalization_version !== 2 && rejectedDates.length) || revalidation?.state === 'pending') {
      revalidation = { version: 2, state: 'pending', required_dates: [...new Set([...(revalidation?.required_dates ?? []), ...rejectedDates])].sort() };
      start = window.horizonStart;
      window = { ...window, start, reason: 'NORMALIZER_V2_QUARANTINE_REVALIDATION' };
    }
  }
  const metadata = { function: 'asx-yahoo-market-history', provider: 'yahoo', instrument_id: inst.id,
    symbol: inst.symbol, provider_symbol: symbol, exchange: 'ASX', job_type: job.job_type ?? 'initial_backfill',
    requested_start_date: start, requested_end_date: end, price_basis: 'Yahoo native OHLC plus separately supplied adjusted close',
    history_window_version: 1, storage_comparison_version: 1, normalization_version: 2, normalization_revalidation: revalidation,
    accepted_provider_dates: window.confirmedDates, previous_audit_id: priorAuditId,
    history_coverage_claim: 'Only provider-confirmed dates within the rolling one-year horizon; older/internal completeness is not asserted',
    ...(daily ? { daily_window_reason: window.reason, known_missing_provider_dates: window.missingDates, correction: prior.correction ?? null,
      event_manifest: prior.event_manifest ?? yahooEventManifest(prior.events ?? {}, window.horizonStart, end) } : {}) };
  let run;
  try {
    const { data, error } = await db.from('sync_runs').insert({ provider_id: provider.id, requested_count: 1, status: 'running', metadata }).select('id').single();
    if (error || !data?.id) throw new Error('Audit creation not confirmed');
    run = data;
  } catch {
    throw new JobStateUnconfirmed('Could not confirm Yahoo sync run creation');
  }
  let auditMetadata = metadata;
  let inserted = 0, received = 0;
  const persistAudit = async values => {
    try {
      const { data, error } = await db.from('sync_runs').update(values).eq('id', run.id).eq('status', 'running').select('id').single();
      if (error || data?.id !== run.id) throw new Error('Audit receipt not confirmed');
    } catch {
      throw new JobStateUnconfirmed('Yahoo sync run state unconfirmed');
    }
  };
  try {
    if (revalidation?.state === 'unresolved') throw new Error('Yahoo normalization revalidation remains unresolved; reviewed recovery required. No repeated full fetch.');
    const responses = [], attempts = [];
    const fetchWindow = async requestedStart => {
      const response = await fetchYahoo(symbol, inst.currency_code.trim(), requestedStart, end);
      responses.push(response);
      attempts.push({ requested_start_date: requestedStart, requested_end_date: end, valid_rows: response.rows.length,
        rejected_bars: response.rejected, duplicate_bars: response.duplicates, skipped_empty_bars: response.skipped,
        events: response.events, retrieved_at: new Date().toISOString() });
      auditMetadata = { ...auditMetadata, fetch_attempts: attempts, accepted_provider_dates: acceptedProviderDates(window, responses),
        valid_rows: response.rows.length, rejected_bars: response.rejected, coverage_has_rejected_bars: response.rejected.length > 0,
        duplicate_bars: response.duplicates, skipped_empty_bars: response.skipped, events: response.events,
        retrieved_at: attempts.at(-1).retrieved_at };
      return response;
    };
    let result = await fetchWindow(start), decision = null, correctionAttempted = false, unresolvedDates = [];
    if (revalidation?.state === 'pending') {
      const returned = new Set(result.rows.map(row => row.date));
      const missing = revalidation.required_dates.filter(date => !returned.has(date));
      if (missing.length) {
        auditMetadata = { ...auditMetadata, normalization_revalidation: { ...revalidation, state: 'unresolved', missing_dates: missing } };
        throw new Error('Yahoo normalization revalidation omitted or rejected quarantined sessions; no observations written');
      }
    }
    const recentResult = result, recentStart = start;
    let unresolvedError = null, nextEventManifest;
    if (!result.rows.length) throw new Error('Yahoo returned no usable daily bars');
    if (daily) {
      decision = assessDailyRevision(window, persisted, result, prior);
      if (decision.reasons.length) {
        auditMetadata = { ...auditMetadata, correction: { reasons: decision.reasons, signature: decision.signature,
          state: decision.suppressed ? 'suppressed_unchanged_unresolved' : 'pending',
          completed_provider_attempt: decision.suppressed,
          changed_overlap: decision.changed, changed_event_keys: decision.eventChanges,
          original_missing_dates: window.missingDates,
          unresolved_dates: prior.correction?.unresolved_dates ?? window.missingDates } };
        if (!decision.suppressed) {
          if (start !== window.horizonStart) result = await fetchWindow(window.horizonStart);
          correctionAttempted = true;
          if (!result.rows.length) throw new Error('Yahoo correction returned no usable daily bars');
          start = window.horizonStart;
          const expanded = assessDailyRevision({ ...window, start }, persisted, result, prior);
          decision.reasons = [...new Set([...decision.reasons, ...expanded.reasons])];
          const returned = new Set(result.rows.map(row => row.date));
          unresolvedDates = [...new Set([...window.confirmedDates, ...window.storedDates, ...recentResult.rows.map(row => row.date), ...result.rejected.map(row => row.date),
            ...(prior.correction?.unresolved_dates ?? []).filter(date => date < window.horizonStart)])]
            .filter(date => !returned.has(date)).sort();
          auditMetadata = { ...auditMetadata, requested_start_date: start,
            correction: { ...auditMetadata.correction, reasons: decision.reasons,
              expanded_changed_overlap: expanded.changed, expanded_changed_event_keys: expanded.eventChanges,
              completed_provider_attempt: true, unresolved_dates: unresolvedDates } };
        }
      } else if (prior.correction && ['pending', 'unresolved', 'suppressed_unchanged_unresolved'].includes(prior.correction.state)) {
        auditMetadata = { ...auditMetadata, correction: { ...prior.correction, state: 'resolved_from_persisted_dates' } };
      }
      nextEventManifest = mergeEventManifest(decision.priorEvents,
        yahooEventManifest(result.events, start, end), start, end, window.horizonStart);
    } else {
      nextEventManifest = yahooEventManifest(result.events, window.horizonStart, end);
    }
    received = result.rows.length + result.rejected.length;
    if (decision?.suppressed) unresolvedError = new Error('Yahoo prior correction remains unresolved; unchanged repair signature suppressed. See sync_runs metadata.correction.');
    if (correctionAttempted && unresolvedDates.length) {
      auditMetadata = { ...auditMetadata, correction: { ...auditMetadata.correction, state: 'unresolved' } };
      unresolvedError = new Error('Yahoo correction remains incomplete; provider-confirmed or rejected dates are unresolved. See sync_runs metadata.correction.');
    }
    if (unresolvedError) {
      const gapOnly = decision.reasons.every(reason => reason === 'PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE')
        && !(prior.correction?.reasons ?? []).some(reason => reason !== 'PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE');
      if (!gapOnly) throw unresolvedError;
      // Expanded revision checks above establish that existing prices/events
      // agree. Retain recovered gaps as well as recent closes, but never choose
      // between conflicting valid values from the two provider responses.
      const merged = mergeConsistentDailyRows(result, recentResult);
      if (merged.conflicts.length) {
        auditMetadata = { ...auditMetadata, correction: { ...auditMetadata.correction,
          reasons: [...auditMetadata.correction.reasons, 'CONFLICTING_PROVIDER_RESPONSES'], conflicting_dates: merged.conflicts } };
        throw new Error('Yahoo recent and correction responses disagree; no prices written');
      }
      result = { ...result, rows: merged.rows };
      start = correctionAttempted ? window.horizonStart : recentStart;
      auditMetadata = { ...auditMetadata, daily_closes_preserved_while_gap_unresolved: true,
        written_start_date: start, written_end_date: end };
    }
    const retrieved_at = auditMetadata.retrieved_at;
    // A daily correction covers at most one calendar year and uses one atomic
    // upsert request. Explicit multi-year initial backfills retain bounded chunks.
    const batchSize = daily ? 400 : 250;
    for (let offset = 0; offset < result.rows.length; offset += batchSize) {
      const rows = result.rows.slice(offset, offset + batchSize).map(row => ({
        instrument_id: inst.id, provider_id: provider.id, interval_code: '1day', observed_at: row.date + 'T00:00:00.000Z',
        open: row.open, high: row.high, low: row.low, close: row.close, adjusted_close: row.adjusted_close, volume: row.volume,
        currency_code: inst.currency_code, is_delayed: true,
        raw_payload: { ...row, _backfill: { function: metadata.function, provider: 'yahoo', symbol: inst.symbol, provider_symbol: symbol,
          exchange: 'ASX', requested_start_date: start, requested_end_date: end, price_basis: metadata.price_basis,
          retrieved_at, source: 'Yahoo Finance' } }
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
    auditMetadata = { ...auditMetadata, coverage_start, coverage_end };
    if (revalidation?.state === 'pending') auditMetadata.normalization_revalidation = { ...revalidation, state: 'completed' };
    if (!unresolvedError) auditMetadata = { ...auditMetadata, event_manifest: nextEventManifest };
    if (correctionAttempted && !unresolvedError) {
      auditMetadata = { ...auditMetadata, correction: { ...auditMetadata.correction, state: 'resolved' } };
    }
    const warning = [unresolvedError ? String(unresolvedError) : null,
      result.rejected.length ? `Loaded valid history; ${result.rejected.length} invalid or ambiguous Yahoo sessions excluded. See sync_runs metadata.rejected_bars.` : null].filter(Boolean).join(' ') || null;
    await persistAudit({ status: 'succeeded', finished_at: new Date().toISOString(), received_count: received, inserted_count: inserted, metadata: auditMetadata });
    return { sync_run_id: run.id, requested_start: start, requested_end: end, coverage_start, coverage_end, received_count: result.rows.length + result.rejected.length, inserted_count: inserted, last_error: warning };
  } catch (error) {
    if (error instanceof JobStateUnconfirmed) throw error;
    await persistAudit({ status: 'failed', finished_at: new Date().toISOString(), received_count: received, inserted_count: inserted,
      error_message: String(error).slice(0, 2000), metadata: auditMetadata });
    throw error;
  }
}
