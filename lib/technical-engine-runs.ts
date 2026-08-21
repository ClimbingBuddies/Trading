import { getSupabase } from './supabase'

export type TechnicalEngineRun = {
  id: string
  scheduled_for: string
  execution_source: 'scheduled' | 'manual' | 'retry'
  retry_of_run_id: string | null
  attempt_number: number
  started_at: string
  finished_at: string | null
  status: 'running' | 'succeeded' | 'failed' | 'skipped'
  instruments_processed: number
  indicator_rows_upserted: number
  indicator_complete_rows: number
  indicator_incomplete_rows: number
  score_rows_upserted: number
  complete_scores: number
  partial_scores: number
  calculation_version: string | null
  methodology_version: string | null
  error_code: string | null
  error_message: string | null
}

export async function getTechnicalEngineRuns(limit = 12): Promise<TechnicalEngineRun[]> {
  const supabase = getSupabase()
  const result = await supabase
    .from('technical_engine_runs')
    .select(
      'id,scheduled_for,execution_source,retry_of_run_id,attempt_number,started_at,finished_at,status,instruments_processed,indicator_rows_upserted,indicator_complete_rows,indicator_incomplete_rows,score_rows_upserted,complete_scores,partial_scores,calculation_version,methodology_version,error_code,error_message',
    )
    .order('started_at', { ascending: false })
    .limit(limit)

  if (result.error) throw result.error
  return (result.data ?? []) as TechnicalEngineRun[]
}
