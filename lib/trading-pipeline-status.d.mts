export function describePipelineStatus(payload: unknown, now?: number): { warning: boolean; title: string; detail: string };
export type PipelineProblem = { code: string; message: string; nextAction: string }
export type PipelineStatus = {
  contractVersion: 1
  lastCompletedMorningAt: string | null
  incidents: (PipelineProblem & { id: string; date: string })[]
  snapshot: {
    checkedAt: string; deadline: string; nextExpectedAt: string; marketSession: string
    state: string; marketDue: boolean
    counts: { supported: number; blocked: number; researched: number; published: number; evaluated: number }
    lastResearchAt: string | null; controllerLastSeenAt: string | null; calendarExpiresAt: string | null
    problems: PipelineProblem[]
    instruments: { symbol: string; reason: string | null }[]
  } | null
}
export function isPipelineStatusPayload(payload: unknown): payload is PipelineStatus;
