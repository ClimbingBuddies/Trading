const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' && value.trim().length > 0
const code = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(value)
const day = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
const timestamp = value => typeof value === 'string' && day(value.slice(0, 10)) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const optionalTime = value => value === null || timestamp(value)
const problem = value => record(value) && code(value.code) && text(value.message) && text(value.nextAction)
const countKeys = ['supported', 'blocked', 'researched', 'published', 'evaluated']

// Validate every collection rendered by the panel, not only the summary counters.
export function isPipelineStatusPayload(value) {
  if (!record(value) || value.contractVersion !== 1 || !optionalTime(value.lastCompletedMorningAt) ||
      !Array.isArray(value.incidents) || !value.incidents.every(item => problem(item) && text(item.id) && day(item.date))) return false
  const s = value.snapshot
  if (s === null) return true
  return record(s) && timestamp(s.checkedAt) && timestamp(s.deadline) && timestamp(s.nextExpectedAt) && day(s.marketSession) &&
    typeof s.marketDue === 'boolean' && text(s.state) && record(s.counts) &&
    countKeys.every(key => Number.isSafeInteger(s.counts[key]) && s.counts[key] >= 0) &&
    ['lastResearchAt', 'controllerLastSeenAt', 'calendarExpiresAt'].every(key => optionalTime(s[key])) &&
    Array.isArray(s.problems) && s.problems.every(problem) &&
    Array.isArray(s.instruments) && s.instruments.every(item => record(item) && text(item.symbol) && (item.reason === null || code(item.reason)))
}

const titles = new Map([
  ['SETUP', 'Scheduled verification has not started'], ['PENDING', 'Morning review pending'],
  ['ATTENTION', 'Morning review needs attention'], ['PARTIAL', 'Supported shares checked; coverage incomplete'],
  ['COMPLETE', 'Morning review completed'],
])
const warning = (title, detail) => ({ warning: true, title, detail })

export function describePipelineStatus(payload, now = Date.now()) {
  const s = payload?.snapshot
  const checked = timestamp(s?.checkedAt) ? Date.parse(s.checkedAt) : NaN
  if (!Number.isFinite(now) || !s || !Number.isFinite(checked) || checked > now + 60000 || now - checked > 30 * 60000) {
    return warning('Daily monitor is unavailable or overdue', 'The latest check cannot be verified. Review the monitor before trusting the run status.')
  }
  if (!isPipelineStatusPayload(payload)) return warning('Daily monitor returned incomplete evidence', 'Run status cannot be verified.')
  if (!titles.has(s.state)) return warning('Daily monitor returned an unknown status', 'Run status cannot be verified.')

  const c = s.counts
  const hasFutureReceipt = [payload.lastCompletedMorningAt, s.lastResearchAt, s.controllerLastSeenAt]
    .some(value => value !== null && Date.parse(value) > now + 60000)
  const invalidCounts = c.researched > c.supported || c.published > c.researched || c.evaluated > c.published
  if (hasFutureReceipt || invalidCounts) return warning('Daily monitor returned inconsistent evidence', 'Saved dates or stage counts contradict the reported review status.')

  if (s.state === 'COMPLETE') {
    const dueCoverageComplete = !s.marketDue || (c.supported > 0 && c.researched === c.supported && c.published === c.supported && c.evaluated === c.supported)
    const completedAt = payload.lastCompletedMorningAt === null ? NaN : Date.parse(payload.lastCompletedMorningAt)
    const hasCompletionReceipt = Number.isFinite(completedAt) && completedAt >= checked && s.controllerLastSeenAt !== null
    const hasResearchEvidence = !s.marketDue || s.lastResearchAt !== null
    // A non-session skip also needs a trusted calendar; missing trust is not a holiday.
    const calendarVerified = s.calendarExpiresAt !== null && Date.parse(s.calendarExpiresAt) > now
    if (!dueCoverageComplete || !hasCompletionReceipt || !hasResearchEvidence || !calendarVerified || c.blocked > 0 || s.problems.length > 0 || checked < Date.parse(s.deadline)) {
      return warning('Morning review completion is unverified', 'The completed label is not supported by consistent coverage, calendar and completion evidence. Review the saved run details.')
    }
  }
  if (s.state === 'PENDING' && now >= Date.parse(s.deadline)) {
    return warning('Morning review completion is unverified', 'The completion deadline has passed without a verified post-deadline completion check. This is not proof that the controller failed.')
  }
  return {
    warning: s.state === 'ATTENTION' || s.state === 'PARTIAL' || s.problems.length > 0 || payload.incidents.length > 0,
    title: titles.get(s.state),
    detail: s.marketDue ? `${c.researched}/${c.supported} researched · ${c.published} published · ${c.evaluated} evaluated · ${c.blocked} unsupported`
      : 'No US Decision Lab review due for this market date. Daily Opportunity research is checked separately.',
  }
}
