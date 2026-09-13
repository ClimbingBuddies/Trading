export function ratingAction(rating: string | null | undefined): 'BUY' | 'HOLD' | 'AVOID' | 'UNKNOWN'
export function matchingPlan<T extends { id: string; instrument_id: string; assessment_id: string; horizon_sessions: number; published_at: string }>(plans: T[], instrumentId: string, assessmentId: string | undefined, horizon: number): T | null
export function olderAssessment(createdAt: string | undefined, now?: number): boolean

