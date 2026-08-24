alter table public.trading_test_runs
  alter column run_key set not null,
  alter column strategy_code set not null,
  alter column strategy_version set not null,
  alter column strategy_methodology_version set not null,
  alter column strategy_snapshot set not null,
  alter column strategy_snapshot_hash set not null,
  alter column strategy_snapshot_captured_at set not null;