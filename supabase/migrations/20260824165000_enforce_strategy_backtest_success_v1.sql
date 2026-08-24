create or replace function strategy_lab.validate_trading_test_run_success_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.run_status = 'succeeded'
     and new.test_type = 'backtest'
     and new.ingestion_version = 'strategy-test-ingestion-v1' then

    if new.completed_at is null then
      raise exception 'Successful backtest requires completed_at';
    end if;
    if new.engine_version is null or nullif(btrim(new.engine_version),'') is null then
      raise exception 'Successful backtest requires engine_version';
    end if;
    if new.input_data_cutoff is null then
      raise exception 'Successful backtest requires input_data_cutoff';
    end if;
    if new.period_start is null or new.period_end is null
       or new.in_sample_period_start is null or new.in_sample_period_end is null
       or new.out_of_sample_period_start is null or new.out_of_sample_period_end is null then
      raise exception 'Successful backtest requires overall, in-sample and out-of-sample periods';
    end if;
    if new.initial_equity is null or new.initial_equity <= 0 or new.ending_equity is null then
      raise exception 'Successful backtest requires positive initial_equity and ending_equity';
    end if;
    if new.instrument_count is null or new.instrument_count <= 0 or new.trade_count is null or new.trade_count < 0 then
      raise exception 'Successful backtest requires instrument_count and trade_count';
    end if;
    if new.net_profit is null or new.return_pct is null or new.max_drawdown_pct is null
       or new.out_of_sample_return_pct is null then
      raise exception 'Successful backtest requires core portfolio metrics';
    end if;
    if new.trade_count > 0 and (new.win_rate_pct is null or new.expectancy is null) then
      raise exception 'Successful backtest with completed trades requires win_rate_pct and expectancy';
    end if;
    if new.profit_factor is null
       and coalesce(new.source_metadata->>'profit_factor_no_loss_convention','') = '' then
      raise exception 'Successful backtest requires profit_factor or an explicit no-loss convention';
    end if;
    if new.sharpe_ratio is null
       and coalesce(new.execution_provenance->>'sharpe_null_reason','') = '' then
      raise exception 'Successful backtest requires sharpe_ratio or an explicit null reason';
    end if;
    if jsonb_typeof(new.data_provenance) <> 'object' or new.data_provenance = '{}'::jsonb
       or jsonb_typeof(new.execution_provenance) <> 'object' or new.execution_provenance = '{}'::jsonb then
      raise exception 'Successful backtest requires non-empty data and execution provenance';
    end if;
    if coalesce(new.data_provenance->>'source_rows_sha256','') !~ '^[0-9a-f]{64}$' then
      raise exception 'Successful backtest requires a valid source_rows_sha256';
    end if;
    if coalesce(new.execution_provenance->>'implementation_commit','') !~ '^[0-9a-f]{40}$' then
      raise exception 'Successful backtest requires a valid implementation_commit';
    end if;
    if coalesce(new.strategy_snapshot_hash,'') !~ '^[0-9a-f]{64}$' then
      raise exception 'Successful backtest requires a valid immutable strategy snapshot hash';
    end if;
    if abs(new.net_profit - (new.ending_equity - new.initial_equity)) > 0.000001 then
      raise exception 'Successful backtest net_profit is inconsistent with initial/ending equity';
    end if;
    if abs(new.return_pct - (((new.ending_equity - new.initial_equity) / new.initial_equity) * 100)) > 0.000001 then
      raise exception 'Successful backtest return_pct is inconsistent with initial/ending equity';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function strategy_lab.validate_trading_test_run_success_v1() from public, anon, authenticated;
grant execute on function strategy_lab.validate_trading_test_run_success_v1() to service_role;

drop trigger if exists trading_test_runs_validate_success_v1 on public.trading_test_runs;
create trigger trading_test_runs_validate_success_v1
before insert or update on public.trading_test_runs
for each row execute function strategy_lab.validate_trading_test_run_success_v1();

comment on function strategy_lab.validate_trading_test_run_success_v1() is
'STRAT-003 evidence-integrity gate: strategy-test-ingestion-v1 backtests cannot be persisted as succeeded unless required metrics, immutable/source provenance, periods and accounting identities are present and consistent.';