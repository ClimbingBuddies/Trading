type SavedDate = { ageDays: number | null; label: string }
export function describeAssessmentSnapshot(row: {
  assessment_id: string
  instrument_id: string
  assessment_date: string
  convergence?: { instrument_id: string; ai_assessment_id: string; assessment_date: string } | null
}, now?: number | string | Date): {
  ai: SavedDate
  convergence: SavedDate | null
  source: 'missing' | 'matched' | 'different-ai' | 'unverified'
  sourceLabel: string
  matchesDisplayedAI: boolean
}
