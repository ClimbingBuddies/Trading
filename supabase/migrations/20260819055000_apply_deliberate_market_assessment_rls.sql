-- Apply the SEC-001 Market Assessment access classification.
--
-- Public clients may read only terminal scheduled output and the approved fields.
-- Service-role orchestration retains its existing trusted access.

alter table public.gpt_market_runs enable row level security;
alter table public.gpt_market_assessments enable row level security;
alter table public.gpt_market_evidence enable row level security;
alter table public.market_assessment_queue enable row level security;
alter table public.market_assessment_schedule_log enable row level security;

-- Remove inherited/table-wide client privileges before adding explicit read allowlists.
revoke all privileges on table public.gpt_market_runs from public, anon, authenticated;
revoke all privileges on table public.gpt_market_assessments from public, anon, authenticated;
revoke all privileges on table public.gpt_market_evidence from public, anon, authenticated;
revoke all privileges on table public.market_assessment_queue from public, anon, authenticated;
revoke all privileges on table public.market_assessment_schedule_log from public, anon, authenticated;

grant select (
  run_id,
  started_at,
  completed_at,
  status,
  analysis_cutoff_time,
  tickers_requested,
  tickers_completed
) on table public.gpt_market_runs to anon, authenticated;

grant select (
  assessment_id,
  run_id,
  instrument_id,
  assessment_date,
  rating,
  confidence,
  score,
  summary,
  bull_case,
  bear_case,
  technical_view,
  macro_view,
  valuation_view,
  key_catalysts,
  key_risks,
  evidence_summary,
  model_version,
  methodology_version,
  technical_engine_input_used,
  created_at
) on table public.gpt_market_assessments to anon, authenticated;

grant select (
  evidence_id,
  assessment_id,
  evidence_type,
  source_name,
  source_url,
  evidence_text,
  relevance_score,
  confidence,
  created_at
) on table public.gpt_market_evidence to anon, authenticated;

drop policy if exists "public_read_gpt_market_runs" on public.gpt_market_runs;
drop policy if exists "public_read_published_gpt_market_runs" on public.gpt_market_runs;
create policy "public_read_published_gpt_market_runs"
on public.gpt_market_runs
for select
to anon, authenticated
using (
  analysis_mode = 'scheduled'
  and status in ('succeeded', 'partial')
  and completed_at is not null
);

drop policy if exists "public_read_gpt_market_assessments" on public.gpt_market_assessments;
drop policy if exists "public_read_published_gpt_market_assessments" on public.gpt_market_assessments;
create policy "public_read_published_gpt_market_assessments"
on public.gpt_market_assessments
for select
to anon, authenticated
using (
  run_id in (
    select published_run.run_id
    from public.gpt_market_runs as published_run
  )
);

drop policy if exists "public_read_gpt_market_evidence" on public.gpt_market_evidence;
drop policy if exists "public_read_published_gpt_market_evidence" on public.gpt_market_evidence;
create policy "public_read_published_gpt_market_evidence"
on public.gpt_market_evidence
for select
to anon, authenticated
using (
  assessment_id in (
    select published_assessment.assessment_id
    from public.gpt_market_assessments as published_assessment
  )
);

-- Internal queue and scheduler state has no client grants; deny policies remain
-- as defense in depth for the exposed public schema.
drop policy if exists "block_client_market_assessment_queue" on public.market_assessment_queue;
create policy "block_client_market_assessment_queue"
on public.market_assessment_queue
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "block_client_market_assessment_schedule_log" on public.market_assessment_schedule_log;
create policy "block_client_market_assessment_schedule_log"
on public.market_assessment_schedule_log
for all
to anon, authenticated
using (false)
with check (false);

-- Orchestration is reserved for the trusted backend.
revoke execute on function public.prepare_chatgpt_market_assessment(date, text, text) from public, anon, authenticated;
revoke execute on function public.finalize_chatgpt_market_assessment(bigint, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_market_assessment_queue(text) from public, anon, authenticated;
revoke execute on function public.begin_market_assessment_attempt(bigint) from public, anon, authenticated;
revoke execute on function public.finalize_market_assessment_queue(bigint, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.queue_daily_market_assessment() from public, anon, authenticated;
revoke execute on function public.process_market_assessment_queue() from public, anon, authenticated;

grant execute on function public.prepare_chatgpt_market_assessment(date, text, text) to service_role;
grant execute on function public.finalize_chatgpt_market_assessment(bigint, uuid, text) to service_role;
grant execute on function public.claim_market_assessment_queue(text) to service_role;
grant execute on function public.begin_market_assessment_attempt(bigint) to service_role;
grant execute on function public.finalize_market_assessment_queue(bigint, text, uuid, text) to service_role;
grant execute on function public.queue_daily_market_assessment() to service_role;
grant execute on function public.process_market_assessment_queue() to service_role;
