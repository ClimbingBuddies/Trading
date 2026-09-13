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

