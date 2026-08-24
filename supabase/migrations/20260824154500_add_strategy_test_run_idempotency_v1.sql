alter table public.trading_test_runs
  add column if not exists run_key text,
  add column if not exists source_run_id text;

alter table public.trading_test_runs drop constraint if exists trading_test_runs_run_key_nonempty_check;
alter table public.trading_test_runs add constraint trading_test_runs_run_key_nonempty_check
  check (run_key is null or nullif(btrim(run_key),'') is not null);

create unique index if not exists trading_test_runs_owner_run_key_uidx
  on public.trading_test_runs(owner_user_id, run_key)
  where run_key is not null;

comment on column public.trading_test_runs.run_key is 'Stable owner-scoped idempotency key for one logical test run. Retries must reuse the same key.';
comment on column public.trading_test_runs.source_run_id is 'Optional external engine, paper account or broker run identifier; never store credentials.';