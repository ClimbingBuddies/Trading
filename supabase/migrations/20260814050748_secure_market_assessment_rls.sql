-- Secure public market-assessment tables while preserving the current public read-only dashboard.

alter table public.gpt_market_runs enable row level security;
alter table public.gpt_market_assessments enable row level security;
alter table public.gpt_market_evidence enable row level security;
alter table public.market_assessment_queue enable row level security;
alter table public.market_assessment_schedule_log enable row level security;

-- Remove broad client-side CRUD inherited from historical default grants.
revoke all privileges on table public.gpt_market_runs from anon, authenticated;
revoke all privileges on table public.gpt_market_assessments from anon, authenticated;
revoke all privileges on table public.gpt_market_evidence from anon, authenticated;
revoke all privileges on table public.market_assessment_queue from anon, authenticated;
revoke all privileges on table public.market_assessment_schedule_log from anon, authenticated;

-- The public dashboard is intentionally read-only for published assessment data.
grant select on table public.gpt_market_runs to anon, authenticated;
grant select on table public.gpt_market_assessments to anon, authenticated;
grant select on table public.gpt_market_evidence to anon, authenticated;

drop policy if exists "public_read_gpt_market_runs" on public.gpt_market_runs;
create policy "public_read_gpt_market_runs"
on public.gpt_market_runs
for select
to anon, authenticated
using (true);

drop policy if exists "public_read_gpt_market_assessments" on public.gpt_market_assessments;
create policy "public_read_gpt_market_assessments"
on public.gpt_market_assessments
for select
to anon, authenticated
using (true);

drop policy if exists "public_read_gpt_market_evidence" on public.gpt_market_evidence;
create policy "public_read_gpt_market_evidence"
on public.gpt_market_evidence
for select
to anon, authenticated
using (true);

-- Queue and scheduler audit tables are operational internals and are not client-readable/writable.
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
