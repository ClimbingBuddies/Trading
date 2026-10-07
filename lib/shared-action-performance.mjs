import { prepareSharedEvaluation, sharedSnapshotHash } from './shared-paper-adapter.mjs';

/** Independent deterministic reference; no persistence or browser submission. */
export function evaluateActionTrial(snapshot, eventId, horizon, pinned = []) {
  prepareSharedEvaluation(snapshot);
  if (![5, 20].includes(horizon)) throw new Error('UNSUPPORTED_HORIZON');
  const event = [snapshot.call, ...snapshot.reviews].find(e => e.id === eventId);
  if (!event) throw new Error('SAVED_EVENT_REQUIRED');
  const weight = { BUY: 1, HOLD: 1, REDUCE: .5, WAIT: 0, AVOID: 0, SELL: 0 }[event.action];
  const sessions = snapshot.calendar.sessions.filter(s => Date.parse(s.opens_at) > Date.parse(event.published_at)).slice(0, horizon + 1);
  const path = []; let peak = 1, drawdown = 0, entry;
  const facts = mark => ({session:mark.session,pair:mark.pair,stock:mark.inputVersions.stock,benchmark:mark.inputVersions.benchmark});
  const result = (status, blocker = null, metrics = null) => ({status, blocker, eventId, horizon, weight, path, metrics});
  if (!sessions.length) return result('blocked', 'CALENDAR_REQUIRED');
  if (pinned.length && sharedSnapshotHash(pinned[0].session) !== sharedSnapshotHash(sessions[0])) return result('blocked','PINNED_CALENDAR_REVISED');
  for (const session of sessions) {
    if (Date.parse(session.closes_at) > Date.parse(snapshot.asOf)) break;
    const pair = {};
    for (const [kind, instrument] of [['stock', snapshot.call.instrument_id], ['benchmark', snapshot.call.benchmark_instrument_id]]) {
      const rows = snapshot.observations.filter(o => o.instrument_id === instrument && o.session_id === session.id);
      if (rows.length !== 1) return result('blocked', 'MISSING_OR_DUPLICATE_PRICE');
      pair[kind] = rows[0];
    }
    const mark = structuredClone({session, pair, inputVersions: snapshot.inputVersions});
    const prior = pinned.find(p => p.session.id === session.id);
    if (prior && sharedSnapshotHash(facts(prior)) !== sharedSnapshotHash(facts(mark))) return result('blocked', 'PINNED_EVIDENCE_REVISED');
    path.push(prior ? structuredClone(prior) : mark); entry ??= pair;
    for (const kind of ['stock', 'benchmark']) {
      if (Math.abs(Number(pair[kind].adjusted_close) / Number(pair[kind].close) - Number(entry[kind].adjusted_close) / Number(entry[kind].close)) > 1e-6) return result('blocked', 'CORPORATE_ACTION_REQUIRED');
    }
    const stock = Number(pair.stock.close) * .999 / (Number(entry.stock.close) * 1.001) - 1;
    const value = 1 + weight * stock;
    peak = Math.max(peak, value); drawdown = Math.min(drawdown, value / peak - 1);
  }
  if (pinned.some(p => !path.some(m => m.session.id === p.session.id))) return result('blocked', 'PINNED_CALENDAR_REVISED');
  if (path.length !== horizon + 1) return result('pending');
  const last = path.at(-1).pair;
  const stockReturn = Number(last.stock.close) * .999 / (Number(entry.stock.close) * 1.001) - 1;
  const benchmarkReturn = Number(last.benchmark.close) * .999 / (Number(entry.benchmark.close) * 1.001) - 1;
  const actionReturn = weight * stockReturn;
  return result('matured', null, {actionReturn, stockReturn, benchmarkReturn, excessStock: actionReturn-stockReturn, excessBenchmark: actionReturn-benchmarkReturn, maxDrawdown: drawdown});
}
