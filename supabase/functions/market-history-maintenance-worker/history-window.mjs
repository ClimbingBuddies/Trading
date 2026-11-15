const FIELDS = ['open', 'high', 'low', 'close', 'adjusted_close', 'volume'];
const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const shift = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const stable = value => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(item => JSON.parse(stable(item))) : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(stable(value[key]))]))
  : value);
const numeric = value => value === null || value === undefined || value === '' ? null : Number(value);

export function historyWindow(end, persisted = [], prior = {}) {
  if (!dateOnly(end)) throw new Error('Invalid Yahoo history end date');
  const floor = new Date(end + 'T00:00:00Z'); floor.setUTCFullYear(floor.getUTCFullYear() - 1);
  const horizonStart = floor.toISOString().slice(0, 10);
  const dates = persisted.map(row => String(row.observed_at ?? row.date).slice(0, 10))
    .filter(date => dateOnly(date) && date >= horizonStart && date <= end).sort();
  const latest = dates.at(-1) ?? null;
  const confirmed = prior.history_window_version === 1 && Array.isArray(prior.accepted_provider_dates)
    ? [...new Set(prior.accepted_provider_dates.filter(date => dateOnly(date) && date >= horizonStart && date <= end))].sort() : [];
  const stored = new Set(dates);
  return { horizonStart, end, latest, start: latest ? [horizonStart, shift(latest, -14)].sort().at(-1) : horizonStart,
    reason: latest ? 'RECENT_OVERLAP_AND_MISSING_TAIL' : 'NO_PERSISTED_HISTORY_ONE_YEAR_SEED',
    confirmedDates: confirmed, missingDates: confirmed.filter(date => !stored.has(date)), storedDates: [...stored] };
}

export function yahooEventManifest(events, start, end) {
  if (!events || typeof events !== 'object' || Array.isArray(events)) throw new Error('Yahoo corporate-action evidence is not an object');
  const output = {};
  for (const [kind, group] of Object.entries(events)) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error('Yahoo corporate-action group is unverified');
    for (const [key, event] of Object.entries(group)) {
      const timestamp = event?.date ?? Number(key);
      if (!event || typeof event !== 'object' || Array.isArray(event) || !Number.isFinite(timestamp)) throw new Error('Yahoo corporate-action date is unverified');
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp * 1000));
      if (date >= start && date <= end) output[`${kind}:${key}`] = { date, event };
    }
  }
  return output;
}

export function assessDailyRevision(window, persisted, response, prior = {}) {
  const stored = new Map(persisted.map(row => [String(row.observed_at ?? row.date).slice(0, 10), row]));
  const changed = response.rows.flatMap(row => {
    const previous = stored.get(row.date);
    const fields = previous ? FIELDS.filter(field => !Object.is(numeric(row[field]), numeric(previous[field]))) : [];
    return fields.length ? [{ date: row.date, fields, previous: Object.fromEntries(fields.map(field => [field, numeric(previous[field])])), current: Object.fromEntries(fields.map(field => [field, numeric(row[field])])) }] : [];
  });
  const priorEvents = prior.event_manifest ?? yahooEventManifest(prior.events ?? {}, window.horizonStart, window.end);
  const currentEvents = yahooEventManifest(response.events, window.start, window.end);
  const oldOverlap = Object.fromEntries(Object.entries(priorEvents).filter(([, value]) => value.date >= window.start && value.date <= window.end));
  const eventChanges = [...new Set([...Object.keys(oldOverlap), ...Object.keys(currentEvents)])].sort()
    .filter(key => stable(oldOverlap[key] ?? null) !== stable(currentEvents[key] ?? null));
  const reasons = [];
  if (window.missingDates.length) reasons.push('PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE');
  if (changed.length) reasons.push('OVERLAP_VALUES_REVISED');
  if (eventChanges.length) reasons.push('CORPORATE_ACTION_EVIDENCE_CHANGED');
  const unresolved = prior.correction && ['pending', 'unresolved', 'suppressed_unchanged_unresolved'].includes(prior.correction.state);
  const priorRevisionPending = unresolved && (prior.correction.reasons?.some(reason => reason !== 'PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE')
    || prior.correction.unresolved_dates?.some(date => date < window.horizonStart || !prior.correction.original_missing_dates?.includes(date)));
  if (!reasons.length && priorRevisionPending) reasons.push('PRIOR_CORRECTION_UNRESOLVED');
  const signature = reasons.length === 1 && reasons[0] === 'PRIOR_CORRECTION_UNRESOLVED'
    ? prior.correction.signature : stable({ missing_dates: window.missingDates, changed, event_changes: eventChanges.map(key => ({ key, current: currentEvents[key] ?? null, previous: oldOverlap[key] ?? null })) });
  const sameUnfillableGap = reasons.every(reason => reason === 'PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE')
    && prior.correction?.reasons?.every(reason => reason === 'PROVIDER_CONFIRMED_DATES_MISSING_FROM_STORAGE')
    && prior.correction?.unresolved_dates?.length > 0
    && new Set(prior.correction.unresolved_dates).size === window.missingDates.length
    && prior.correction.unresolved_dates.every(date => window.missingDates.includes(date));
  const suppressed = Boolean(reasons.length && ['unresolved', 'suppressed_unchanged_unresolved'].includes(prior.correction?.state)
    && prior.correction.completed_provider_attempt === true && (prior.correction.signature === signature || sameUnfillableGap));
  return { reasons, signature, suppressed, changed, eventChanges, currentEvents, priorEvents };
}

export function acceptedProviderDates(window, responses) {
  return [...new Set([...window.confirmedDates, ...responses.flatMap(response => response.rows.map(row => row.date))])]
    .filter(date => date >= window.horizonStart && date <= window.end).sort();
}

export function mergeEventManifest(previous, current, start, end, horizonStart) {
  return { ...Object.fromEntries(Object.entries(previous).filter(([, value]) => value.date >= horizonStart && (value.date < start || value.date > end))), ...current };
}
