alter table public.trading_test_runs
  add column if not exists ingestion_version text not null default 'strategy-test-ingestion-v1',
  add column if not exists run_status text not null default 'draft',
  add column if not exists strategy_code text,
  add column if not exists strategy_version integer,
  add column if not exists strategy_methodology_version text,
  add column if not exists strategy_snapshot jsonb,
  add column if not exists strategy_snapshot_hash text,
  add column if not exists strategy_hash_method text not null default 'sha256-jsonb-v1',
  add column if not exists strategy_snapshot_captured_at timestamptz,
  add column if not exists metric_definition_version text not null default 'strategy-test-metrics-v1',
  add column if not exists engine_version text,
  add column if not exists input_data_cutoff timestamptz,
  add column if not exists in_sample_period_start date,
  add column if not exists in_sample_period_end date,
  add column if not exists out_of_sample_period_start date,
  add column if not exists out_of_sample_period_end date,
  add column if not exists initial_equity numeric,
  add column if not exists ending_equity numeric,
  add column if not exists base_currency text not null default 'USD',
  add column if not exists data_provenance jsonb not null default '{}'::jsonb,
  add column if not exists execution_provenance jsonb not null default '{}'::jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists failure_message text;

alter table public.trading_test_runs drop constraint if exists trading_test_runs_run_status_check;
alter table public.trading_test_runs add constraint trading_test_runs_run_status_check
  check (run_status in ('draft','running','succeeded','failed','cancelled'));

alter table public.trading_test_runs drop constraint if exists trading_test_runs_strategy_version_check;
alter table public.trading_test_runs add constraint trading_test_runs_strategy_version_check
  check (strategy_version is null or strategy_version >= 1);

alter table public.trading_test_runs drop constraint if exists trading_test_runs_strategy_snapshot_object_check;
alter table public.trading_test_runs add constraint trading_test_runs_strategy_snapshot_object_check
  check (strategy_snapshot is null or jsonb_typeof(strategy_snapshot) = 'object');

alter table public.trading_test_runs drop constraint if exists trading_test_runs_data_provenance_object_check;
alter table public.trading_test_runs add constraint trading_test_runs_data_provenance_object_check
  check (jsonb_typeof(data_provenance) = 'object');

alter table public.trading_test_runs drop constraint if exists trading_test_runs_execution_provenance_object_check;
alter table public.trading_test_runs add constraint trading_test_runs_execution_provenance_object_check
  check (jsonb_typeof(execution_provenance) = 'object');

alter table public.trading_test_runs drop constraint if exists trading_test_runs_snapshot_hash_check;
alter table public.trading_test_runs add constraint trading_test_runs_snapshot_hash_check
  check (strategy_snapshot_hash is null or strategy_snapshot_hash ~ '^[0-9a-f]{64}$');

alter table public.trading_test_runs drop constraint if exists trading_test_runs_period_order_check;
alter table public.trading_test_runs add constraint trading_test_runs_period_order_check
  check (period_start is null or period_end is null or period_start <= period_end);

alter table public.trading_test_runs drop constraint if exists trading_test_runs_in_sample_period_order_check;
alter table public.trading_test_runs add constraint trading_test_runs_in_sample_period_order_check
  check (in_sample_period_start is null or in_sample_period_end is null or in_sample_period_start <= in_sample_period_end);

alter table public.trading_test_runs drop constraint if exists trading_test_runs_out_sample_period_order_check;
alter table public.trading_test_runs add constraint trading_test_runs_out_sample_period_order_check
  check (out_of_sample_period_start is null or out_of_sample_period_end is null or out_of_sample_period_start <= out_of_sample_period_end);

alter table public.trading_test_runs drop constraint if exists trading_test_runs_equity_positive_check;
alter table public.trading_test_runs add constraint trading_test_runs_equity_positive_check
  check ((initial_equity is null or initial_equity > 0) and (ending_equity is null or ending_equity >= 0));

alter table public.trading_test_runs drop constraint if exists trading_test_runs_terminal_time_check;
alter table public.trading_test_runs add constraint trading_test_runs_terminal_time_check
  check ((run_status in ('succeeded','failed','cancelled') and completed_at is not null) or (run_status in ('draft','running') and completed_at is null));

alter table public.trading_test_runs drop constraint if exists trading_test_runs_failed_message_check;
alter table public.trading_test_runs add constraint trading_test_runs_failed_message_check
  check (run_status <> 'failed' or nullif(btrim(failure_message),'') is not null);

create or replace function public.capture_trading_test_run_provenance_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  snap jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.strategy_id is distinct from old.strategy_id
       or new.strategy_code is distinct from old.strategy_code
       or new.strategy_version is distinct from old.strategy_version
       or new.strategy_methodology_version is distinct from old.strategy_methodology_version
       or new.strategy_snapshot is distinct from old.strategy_snapshot
       or new.strategy_snapshot_hash is distinct from old.strategy_snapshot_hash
       or new.strategy_hash_method is distinct from old.strategy_hash_method
       or new.strategy_snapshot_captured_at is distinct from old.strategy_snapshot_captured_at then
      raise exception 'Test-run strategy provenance is immutable after insert';
    end if;
    return new;
  end if;

  select
    id, owner_user_id, strategy_code, strategy_version, methodology_version,
    universe_definition, entry_rules, exit_rules, risk_rules, execution_rules,
    data_requirements, live_execution_enabled
  into s
  from public.trading_strategies
  where id = new.strategy_id;

  if not found then
    raise exception 'Unknown strategy_id';
  end if;

  snap := jsonb_build_object(
    'strategy_id', s.id,
    'strategy_code', s.strategy_code,
    'strategy_version', s.strategy_version,
    'methodology_version', s.methodology_version,
    'universe_definition', s.universe_definition,
    'entry_rules', s.entry_rules,
    'exit_rules', s.exit_rules,
    'risk_rules', s.risk_rules,
    'execution_rules', s.execution_rules,
    'data_requirements', s.data_requirements,
    'live_execution_enabled', s.live_execution_enabled
  );

  new.owner_user_id := s.owner_user_id;
  new.strategy_code := s.strategy_code;
  new.strategy_version := s.strategy_version;
  new.strategy_methodology_version := s.methodology_version;
  new.strategy_snapshot := snap;
  new.strategy_snapshot_hash := encode(extensions.digest(snap::text, 'sha256'), 'hex');
  new.strategy_hash_method := 'sha256-jsonb-v1';
  new.strategy_snapshot_captured_at := now();

  if new.run_status = 'running' and new.started_at is null then
    new.started_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.capture_trading_test_run_provenance_v1() from public, anon, authenticated;
grant execute on function public.capture_trading_test_run_provenance_v1() to service_role;

drop trigger if exists trading_test_runs_capture_provenance_v1 on public.trading_test_runs;
create trigger trading_test_runs_capture_provenance_v1
before insert or update of strategy_id, strategy_code, strategy_version, strategy_methodology_version,
  strategy_snapshot, strategy_snapshot_hash, strategy_hash_method, strategy_snapshot_captured_at
on public.trading_test_runs
for each row execute function public.capture_trading_test_run_provenance_v1();

create index if not exists trading_test_runs_strategy_version_idx
  on public.trading_test_runs(strategy_id, strategy_version, created_at desc);
create index if not exists trading_test_runs_snapshot_hash_idx
  on public.trading_test_runs(strategy_snapshot_hash) where strategy_snapshot_hash is not null;

comment on column public.trading_test_runs.ingestion_version is 'Version of the test-run persistence contract.';
comment on column public.trading_test_runs.run_status is 'Lifecycle state for an individual strategy test run.';
comment on column public.trading_test_runs.strategy_snapshot is 'Immutable JSONB snapshot of the exact persisted strategy definition used by the run.';
comment on column public.trading_test_runs.strategy_snapshot_hash is 'SHA-256 identity of strategy_snapshot using strategy_hash_method.';
comment on column public.trading_test_runs.data_provenance is 'Type-specific input-data provenance. Must not contain credentials or secrets.';
comment on column public.trading_test_runs.execution_provenance is 'Type-specific engine/broker/order/fill provenance. Must not contain credentials or secrets.';
comment on column public.trading_test_runs.metric_definition_version is 'Version of the metric calculation definitions used for the stored result.';