import { getSupabase } from './supabase'

export type OpportunityAssessmentRun = {
  run_id: string
  assessment_date: string
  started_at: string
  completed_at: string | null
  status: string
  execution_source: string
  task_id: string | null
  model_reported: string
  reasoning_level_reported: string | null
  github_spec_version: string | null
  github_spec_sha: string | null
  themes_requested: number
  themes_completed: number
  notes: string | null
  error_message: string | null
}

export async function getLatestOpportunityAssessmentRun(): Promise<OpportunityAssessmentRun | null> {
  const supabase = getSupabase()
  const result = await supabase
    .from('opportunity_assessment_runs')
    .select('run_id,assessment_date,started_at,completed_at,status,execution_source,task_id,model_reported,reasoning_level_reported,github_spec_version,github_spec_sha,themes_requested,themes_completed,notes,error_message')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) throw result.error
  return (result.data as OpportunityAssessmentRun | null) ?? null
}
