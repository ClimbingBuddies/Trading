create table public.opportunity_assessment_runs (
  run_id uuid primary key default gen_random_uuid(),
  assessment_date date not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','succeeded','partial','failed','skipped')),
  execution_source text not null default 'manual-chat',
  task_id text,
  model_reported text not null default 'unknown',
  reasoning_level_reported text,
  github_spec_version text,
  github_spec_sha text,
  themes_requested integer not null default 0 check (themes_requested >= 0),
  themes_completed integer not null default 0 check (themes_completed >= 0),
  notes text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opportunity_assessment_runs_assessment_date_idx
  on public.opportunity_assessment_runs (assessment_date desc, started_at desc);

create index opportunity_assessment_runs_started_at_idx
  on public.opportunity_assessment_runs (started_at desc);

alter table public.structural_opportunity_signals
  add column assessment_run_id uuid references public.opportunity_assessment_runs(run_id) on delete set null;

alter table public.technology_inflection_signals
  add column assessment_run_id uuid references public.opportunity_assessment_runs(run_id) on delete set null;

alter table public.opportunity_assessments
  add column assessment_run_id uuid references public.opportunity_assessment_runs(run_id) on delete set null;

create index structural_opportunity_signals_run_idx
  on public.structural_opportunity_signals (assessment_run_id);

create index technology_inflection_signals_run_idx
  on public.technology_inflection_signals (assessment_run_id);

create index opportunity_assessments_run_idx
  on public.opportunity_assessments (assessment_run_id);

alter table public.opportunity_assessment_runs enable row level security;

revoke all on public.opportunity_assessment_runs from anon, authenticated;
grant select on public.opportunity_assessment_runs to anon, authenticated;
grant select, insert, update, delete on public.opportunity_assessment_runs to service_role;

create policy "Public can read opportunity assessment runs"
  on public.opportunity_assessment_runs
  for select
  to anon, authenticated
  using (true);

comment on table public.opportunity_assessment_runs is
  'Execution audit for manual and scheduled Daily Opportunity Assessment runs. Model and reasoning fields are self-reported operational telemetry, not authoritative platform telemetry.';

comment on column public.opportunity_assessment_runs.model_reported is
  'Model identity reported by the executing ChatGPT runtime. Use unknown when unavailable; not authoritative platform telemetry.';

comment on column public.opportunity_assessment_runs.reasoning_level_reported is
  'Reasoning mode/level reported by the executing runtime when available.';

comment on column public.opportunity_assessment_runs.github_spec_sha is
  'GitHub blob SHA for the canonical Daily Opportunity Assessment specification retrieved for the run.';

do $$
declare
  v_run_id uuid;
begin
  select run_id into v_run_id
  from public.opportunity_assessment_runs
  where assessment_date = date '2026-08-14'
    and execution_source = 'scheduled-task'
    and task_id = '6a7d49a185988191a6998cb4e236a28f'
  order by started_at desc
  limit 1;

  if v_run_id is null then
    insert into public.opportunity_assessment_runs (
      assessment_date,
      started_at,
      completed_at,
      status,
      execution_source,
      task_id,
      model_reported,
      reasoning_level_reported,
      github_spec_version,
      github_spec_sha,
      themes_requested,
      themes_completed,
      notes
    ) values (
      date '2026-08-14',
      timestamptz '2026-08-14 00:34:41.953572+00',
      timestamptz '2026-08-14 00:42:46.622876+00',
      'succeeded',
      'scheduled-task',
      '6a7d49a185988191a6998cb4e236a28f',
      'unknown',
      null,
      '1.0',
      '9aab564adca7d2e6e595e421ee035c6b4f5b9dc9',
      3,
      3,
      'Backfilled from the pre-audit scheduled run. Start/end times are approximated from the first assessment creation and final assessment update timestamps. The model was not captured for this run.'
    ) returning run_id into v_run_id;
  end if;

  update public.structural_opportunity_signals
  set assessment_run_id = v_run_id
  where signal_date = date '2026-08-14'
    and methodology_version = 'structural-signal-v1';

  update public.technology_inflection_signals
  set assessment_run_id = v_run_id
  where signal_date = date '2026-08-14'
    and methodology_version = 'technology-inflection-v1';

  update public.opportunity_assessments
  set assessment_run_id = v_run_id
  where assessment_date = date '2026-08-14'
    and methodology_version = 'opportunity-convergence-v1';
end $$;
