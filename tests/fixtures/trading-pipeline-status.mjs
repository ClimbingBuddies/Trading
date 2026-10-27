export const monitorNow = Date.parse('2026-10-06T02:20:00Z')
export const pipelineProblem = () => ({ code: 'CONTROLLER_NOT_SEEN', message: 'Controller receipt missing', nextAction: 'Inspect the existing task.' })
export const pipelineFixture = () => ({
  contractVersion: 1,
  lastCompletedMorningAt: '2026-10-06T02:15:00Z',
  snapshot: {
    checkedAt: '2026-10-06T02:15:00Z', deadline: '2026-10-06T02:15:00Z', nextExpectedAt: '2026-10-07T02:15:00Z',
    marketSession: '2026-10-05', state: 'COMPLETE', marketDue: true,
    counts: { supported: 4, blocked: 0, researched: 4, published: 4, evaluated: 4 },
    lastResearchAt: '2026-10-06T00:00:00Z', controllerLastSeenAt: '2026-10-06T00:00:00Z', calendarExpiresAt: '2026-10-09T00:00:00Z',
    problems: [], instruments: [{ symbol: 'TEST', reason: null }],
  },
  incidents: [],
})
