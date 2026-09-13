export function decisionRow(plan, events, outcomes, legacyResults, checkpoint = 'MARK') {
  const history = events.filter(e => e.prediction_id === plan.id).sort((a,b) => a.published_at.localeCompare(b.published_at) || a.id.localeCompare(b.id))
  const ai = history.filter(e => e.actor === 'AI')
  const observations = outcomes.filter(o => o.prediction_id === plan.id).sort((a,b) => b.as_of.localeCompare(a.as_of) || b.recorded_at.localeCompare(a.recorded_at))
  const find = kind => observations.find(o => o.kind === kind)
  const entry = find('ENTRY'), exit = find('EXIT'), cancelled = find('CANCELLED'), gap = find('DATA_GAP')
  const latest = ai.at(-1), original = ai[0]
  const isLegacy = plan.methodology !== 'decision-journal-v3'
  if (isLegacy) {
    const result = legacyResults.filter(r=>r.prediction_id===plan.id).sort((a,b)=>b.evaluated_at.localeCompare(a.evaluated_at))[0]
    const done = result?.status === 'COMPLETE'
    return { history, observations, original: plan.action, latest: plan.action, note: 'Legacy timing plan', updated: plan.published_at,
      status: done ? 'Closed' : result?.status === 'OPEN' ? 'Open' : result?.status === 'INCOMPLETE' ? 'Missing data' : plan.action !== 'BUY' ? 'Watching' : 'Awaiting entry',
      entry: result?.entry_at ? { as_of: result.entry_at, price: result.entry_price } : null,
      exit: done ? { as_of: result.exit_at, price: result.exit_price } : null,
      result: done && (checkpoint === 'MARK' || checkpoint === 'CHECKPOINT_'+plan.horizon_sessions) ? result : null, isLegacy, closed: done, completed: done }
  }
  const buy = ai.find(e=>e.action==='BUY')
  const sell = buy && ai.find(e=>e.action==='SELL' && e.published_at>buy.published_at)
  const status = exit ? 'Closed' : cancelled ? 'Not entered' : gap && (!find('MARK') || gap.as_of>find('MARK').as_of) ? 'Missing data' : entry ? sell ? 'Exit signal' : 'Open' : buy ? 'Awaiting entry' : 'Watching'
  const measured = checkpoint === 'MARK' ? exit ?? find('MARK') : find(checkpoint)
  const result = measured && !(gap && gap.as_of>=measured.as_of && !exit) ? measured : null
  return { history, observations, original: original?.action ?? plan.action, latest: latest?.action ?? plan.action,
    note: latest?.note ?? plan.thesis, updated: latest?.published_at ?? plan.published_at, status, entry, exit, result,
    isLegacy, closed: !!exit || !!cancelled, completed: !!exit }
}
export function decisionLabel(action) {
  return ({BUY:'Buy',WAIT:'Wait',HOLD:'Hold',SELL:'Sell',REDUCE:'Reduce',AVOID:'Avoid',NOTE:'Note'})[action] ?? 'Unavailable'
}
