export function ratingAction(rating) {
  const value = (rating ?? '').trim().toLowerCase()
  if (value === 'buy' || value === 'strong buy') return 'BUY'
  if (value === 'hold') return 'HOLD'
  if (value === 'sell' || value === 'strong sell') return 'AVOID'
  return 'UNKNOWN'
}

// A current research view must never silently borrow a different assessment's plan.
export function matchingPlan(plans, instrumentId, assessmentId, horizon) {
  if (!assessmentId) return null
  return plans.filter(p => p.instrument_id === instrumentId && p.assessment_id === assessmentId && p.horizon_sessions === horizon)
    .sort((a, b) => b.published_at.localeCompare(a.published_at) || b.id.localeCompare(a.id))[0] ?? null
}

export function olderAssessment(createdAt, now = Date.now()) {
  const timestamp = Date.parse(createdAt ?? '')
  return !Number.isFinite(timestamp) || timestamp > now || now - timestamp > 72 * 60 * 60 * 1000
}

export function timingText(plan) {
  if (plan.action !== 'BUY') return { buy: 'No entry planned', sell: 'No exit scheduled' }
  const ai = plan.entry_rule === 'AI_SESSION_OFFSET'
  const delay = ai ? plan.entry_delay_sessions : 1
  const hold = ai ? plan.holding_sessions : plan.horizon_sessions
  if (!Number.isInteger(delay) || delay < 1 || !Number.isInteger(hold) || hold < 1) return { buy: 'Timing unavailable', sell: 'Timing unavailable' }
  return { buy: ai ? `Session ${delay} close after publication` : 'Next full-session close', sell: `Close ${hold} session${hold === 1 ? '' : 's'} after entry` }
}