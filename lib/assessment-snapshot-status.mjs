// Describes saved dates and exact source lineage, not forecast validity or a trading calendar.
function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86400000 : null
}

function marketDay(now) {
  const date = new Date(now)
  if (!Number.isFinite(date.getTime())) return null
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(part => [part.type, part.value]))
  return dayNumber(`${parts.year}-${parts.month}-${parts.day}`)
}

function dateStatus(value, today) {
  const day = dayNumber(value)
  if (day === null || today === null) return { ageDays: null, label: 'Date not verified' }
  const ageDays = today - day
  if (ageDays < 0) return { ageDays, label: 'Future date — not verified' }
  return { ageDays, label: ageDays === 0 ? 'Dated today (New York)' : `${ageDays} calendar ${ageDays === 1 ? 'day' : 'days'} old` }
}

export function describeAssessmentSnapshot(row, now = Date.now()) {
  const today = marketDay(now)
  const ai = dateStatus(row?.assessment_date, today)
  const convergence = row?.convergence
  const saved = convergence ? dateStatus(convergence.assessment_date, today) : null
  let source = 'missing'
  if (convergence) {
    const validDates = ai.ageDays !== null && ai.ageDays >= 0 && saved.ageDays !== null && saved.ageDays >= 0
    const validIdentity = typeof row.assessment_id === 'string' && row.assessment_id.length > 0 &&
      typeof row.instrument_id === 'string' && row.instrument_id.length > 0 &&
      convergence.instrument_id === row.instrument_id && typeof convergence.ai_assessment_id === 'string' && convergence.ai_assessment_id.length > 0
    source = !validDates || !validIdentity ? 'unverified' : convergence.ai_assessment_id === row.assessment_id ? 'matched' : 'different-ai'
  }
  const sourceLabels = {
    missing: 'No saved Convergence', matched: 'Matches this saved AI assessment',
    'different-ai': 'Historical — different AI assessment', unverified: 'Source link not verified',
  }
  return { ai, convergence: saved, source, sourceLabel: sourceLabels[source], matchesDisplayedAI: source === 'matched' }
}
