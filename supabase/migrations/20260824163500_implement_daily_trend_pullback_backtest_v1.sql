create schema if not exists strategy_lab;
revoke all on schema strategy_lab from public;
grant usage on schema strategy_lab to service_role;

create or replace function strategy_lab.run_daily_trend_pullback_v1(p_implementation_commit text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_strategy record;
  v_existing record;
  v_pos record;
  v_entry record;
  v_run_id uuid;
  v_owner_user_id uuid;
  v_provider_id uuid;
  v_run_key text := 'DAILY_TREND_PULLBACK:v1:backtest:2022-06-01_2026-08-14:daily-trend-pullback-backtest-v1:baseline';
  v_engine_version text := 'daily-trend-pullback-backtest-v1';
  v_design_commit text := '2ac3997e80b4f63f342d189729e87c238029acbe';
  v_source_start date := date '2021-08-16';
  v_test_start date := date '2022-06-01';
  v_test_end date := date '2026-08-14';
  v_in_sample_end date := date '2025-08-14';
  v_out_sample_start date := date '2025-08-15';
  v_input_cutoff timestamptz := timestamptz '2026-08-14 00:00:00+00';
  v_initial_equity numeric := 100000;
  v_cash numeric := 100000;
  v_fee_rate numeric := 0.0005;
  v_slippage_rate numeric := 0.0010;
  v_stop_pct numeric := 0.08;
  v_date date;
  v_equity_open numeric;
  v_equity_close numeric;
  v_gross_exposure numeric;
  v_open_risk numeric;
  v_entry_fill numeric;
  v_entry_fee numeric;
  v_qty numeric;
  v_qty_risk numeric;
  v_qty_notional numeric;
  v_qty_gross numeric;
  v_qty_openrisk numeric;
  v_qty_cash numeric;
  v_exit_base numeric;
  v_exit_fill numeric;
  v_exit_fee numeric;
  v_trade_pnl numeric;
  v_exit_reason text;
  v_source_count bigint;
  v_source_instruments integer;
  v_invalid_count bigint;
  v_data_hash text;
  v_trade_hash text;
  v_equity_hash text;
  v_current_snapshot jsonb;
  v_current_snapshot_hash text;
  v_run_snapshot_hash text;
  v_instrument_count integer;
  v_trade_count integer;
  v_win_count integer;
  v_gross_profit numeric;
  v_gross_loss numeric;
  v_net_profit numeric;
  v_return_pct numeric;
  v_win_rate numeric;
  v_profit_factor numeric;
  v_expectancy numeric;
  v_max_drawdown numeric;
  v_sharpe numeric;
  v_avg_daily_return numeric;
  v_std_daily_return numeric;
  v_daily_return_count integer;
  v_ending_equity numeric;
  v_oos_start_equity numeric;
  v_oos_return numeric;
  v_in_sample_return numeric;
  v_open_positions integer;
  v_pending_signals integer;
  v_signal_count integer := 0;
  v_entries_opened integer := 0;
  v_skipped_gap integer := 0;
  v_skipped_capacity integer := 0;
  v_stop_gap_exits integer := 0;
  v_stop_touch_exits integer := 0;
  v_trend_exits integer := 0;
  v_time_exits integer := 0;
  v_rows integer;
  v_data_provenance jsonb;
  v_execution_provenance jsonb;
  v_source_metadata jsonb;
  v_error text;
begin
  if p_implementation_commit is null or p_implementation_commit !~ '^[0-9a-f]{40}$' then
    raise exception 'p_implementation_commit must be a 40-character lowercase Git commit SHA';
  end if;

  select * into v_strategy
  from public.trading_strategies
  where strategy_code = 'DAILY_TREND_PULLBACK'
    and strategy_version = 1;

  if not found then
    raise exception 'DAILY_TREND_PULLBACK v1 strategy not found';
  end if;

  if v_strategy.live_execution_enabled then
    raise exception 'Backtest runner refuses a strategy with live_execution_enabled=true';
  end if;

  v_owner_user_id := v_strategy.owner_user_id;
  v_instrument_count := jsonb_array_length(v_strategy.universe_definition->'symbols');
  if v_instrument_count <> 20 then
    raise exception 'Expected fixed 20-symbol strategy universe, found %', v_instrument_count;
  end if;

  select id into v_provider_id
  from public.data_providers
  where provider_code = 'tiingo';
  if not found then
    raise exception 'Tiingo provider not found';
  end if;

  v_current_snapshot := jsonb_build_object(
    'strategy_id', v_strategy.id,
    'strategy_code', v_strategy.strategy_code,
    'strategy_version', v_strategy.strategy_version,
    'methodology_version', v_strategy.methodology_version,
    'universe_definition', v_strategy.universe_definition,
    'entry_rules', v_strategy.entry_rules,
    'exit_rules', v_strategy.exit_rules,
    'risk_rules', v_strategy.risk_rules,
    'execution_rules', v_strategy.execution_rules,
    'data_requirements', v_strategy.data_requirements,
    'live_execution_enabled', v_strategy.live_execution_enabled
  );
  v_current_snapshot_hash := encode(extensions.digest(v_current_snapshot::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_run_key, 0));

  select * into v_existing
  from public.trading_test_runs
  where owner_user_id = v_owner_user_id
    and run_key = v_run_key;

  if found and v_existing.run_status = 'succeeded' then
    return jsonb_build_object(
      'status', 'already_complete',
      'run_id', v_existing.id,
      'run_key', v_existing.run_key,
      'strategy_snapshot_hash', v_existing.strategy_snapshot_hash,
      'trade_count', v_existing.trade_count,
      'return_pct', v_existing.return_pct,
      'out_of_sample_return_pct', v_existing.out_of_sample_return_pct
    );
  end if;

  if found then
    if v_existing.strategy_snapshot_hash <> v_current_snapshot_hash then
      update public.trading_test_runs
      set run_status = 'failed',
          completed_at = clock_timestamp(),
          failure_message = 'Current strategy definition no longer matches the immutable snapshot captured by this logical run.'
      where id = v_existing.id;
      return jsonb_build_object('status','failed','run_id',v_existing.id,'reason','strategy_snapshot_changed');
    end if;

    v_run_id := v_existing.id;
    v_run_snapshot_hash := v_existing.strategy_snapshot_hash;
    update public.trading_test_runs
    set run_status = 'running',
        completed_at = null,
        failure_message = null,
        started_at = clock_timestamp(),
        engine_version = v_engine_version,
        source_run_id = 'strat003-baseline-v1',
        input_data_cutoff = v_input_cutoff,
        period_start = v_test_start,
        period_end = v_test_end,
        in_sample_period_start = v_test_start,
        in_sample_period_end = v_in_sample_end,
        out_of_sample_period_start = v_out_sample_start,
        out_of_sample_period_end = v_test_end,
        initial_equity = v_initial_equity,
        base_currency = 'USD'
    where id = v_run_id;
  else
    insert into public.trading_test_runs (
      strategy_id, run_key, run_name, test_type, run_status,
      engine_version, source_run_id, input_data_cutoff,
      period_start, period_end,
      in_sample_period_start, in_sample_period_end,
      out_of_sample_period_start, out_of_sample_period_end,
      initial_equity, base_currency, started_at
    ) values (
      v_strategy.id, v_run_key, 'Daily Trend Pullback v1 — baseline backtest', 'backtest', 'running',
      v_engine_version, 'strat003-baseline-v1', v_input_cutoff,
      v_test_start, v_test_end,
      v_test_start, v_in_sample_end,
      v_out_sample_start, v_test_end,
      v_initial_equity, 'USD', clock_timestamp()
    ) returning id, strategy_snapshot_hash into v_run_id, v_run_snapshot_hash;
  end if;

  if v_run_snapshot_hash <> v_current_snapshot_hash then
    update public.trading_test_runs
    set run_status='failed', completed_at=clock_timestamp(), failure_message='Captured strategy snapshot hash did not match current strategy definition.'
    where id=v_run_id;
    return jsonb_build_object('status','failed','run_id',v_run_id,'reason','snapshot_hash_mismatch');
  end if;

  begin
    with universe as (
      select jsonb_array_elements_text(v_strategy.universe_definition->'symbols') as symbol
    )
    select count(*), count(distinct mo.instrument_id),
           count(*) filter (
             where mo.adjusted_close is null or mo.adjusted_close <= 0
                or mo.close is null or mo.close <= 0
                or mo.open is null or mo.open <= 0
                or mo.high is null or mo.high <= 0
                or mo.low is null or mo.low <= 0
                or mo.high < mo.low or mo.high < mo.open or mo.high < mo.close
                or mo.low > mo.open or mo.low > mo.close
           )
      into v_source_count, v_source_instruments, v_invalid_count
    from public.market_observations mo
    join public.instruments i on i.id = mo.instrument_id
    join universe u on u.symbol = i.symbol
    where mo.provider_id = v_provider_id
      and mo.interval_code = '1day'
      and mo.observed_at::date between v_source_start and v_test_end
      and mo.observed_at <= v_input_cutoff;

    if v_source_count <> 24388 then
      raise exception 'Baseline source row count changed from locked 24388 to %', v_source_count;
    end if;
    if v_source_instruments <> 20 then
      raise exception 'Expected source rows for 20 instruments, found %', v_source_instruments;
    end if;
    if v_invalid_count <> 0 then
      raise exception 'Found % invalid source rows in locked baseline input', v_invalid_count;
    end if;

    create temporary table bt_bars on commit drop as
    with universe as (
      select jsonb_array_elements_text(v_strategy.universe_definition->'symbols') as symbol
    ), candidates as (
      select
        mo.id as observation_id,
        mo.instrument_id,
        i.symbol,
        mo.observed_at,
        mo.loaded_at,
        mo.open as raw_open,
        mo.high as raw_high,
        mo.low as raw_low,
        mo.close as raw_close,
        mo.adjusted_close,
        row_number() over (
          partition by mo.instrument_id, mo.observed_at
          order by mo.loaded_at desc, mo.id desc
        ) as source_rank
      from public.market_observations mo
      join public.instruments i on i.id = mo.instrument_id
      join universe u on u.symbol = i.symbol
      where mo.provider_id = v_provider_id
        and mo.interval_code = '1day'
        and mo.observed_at::date between v_source_start and v_test_end
        and mo.observed_at <= v_input_cutoff
    ), base as (
      select
        observation_id,
        instrument_id,
        symbol,
        observed_at,
        observed_at::date as d,
        loaded_at,
        raw_open,
        raw_high,
        raw_low,
        raw_close,
        adjusted_close as adj_close,
        adjusted_close / raw_close as adjustment_factor,
        raw_open * (adjusted_close / raw_close) as adj_open,
        raw_high * (adjusted_close / raw_close) as adj_high,
        raw_low * (adjusted_close / raw_close) as adj_low
      from candidates
      where source_rank = 1
    ), windows as (
      select
        base.*,
        row_number() over (
          partition by instrument_id
          order by observed_at, loaded_at, observation_id
        ) as bar_num,
        case when count(*) over (
          partition by instrument_id order by observed_at, loaded_at, observation_id
          rows between 19 preceding and current row
        ) = 20 then avg(adj_close) over (
          partition by instrument_id order by observed_at, loaded_at, observation_id
          rows between 19 preceding and current row
        ) end as sma20,
        case when count(*) over (
          partition by instrument_id order by observed_at, loaded_at, observation_id
          rows between 49 preceding and current row
        ) = 50 then avg(adj_close) over (
          partition by instrument_id order by observed_at, loaded_at, observation_id
          rows between 49 preceding and current row
        ) end as sma50,
        case when count(*) over (
          partition by instrument_id order by observed_at, loaded_at, observation_id
          rows between 199 preceding and current row
        ) = 200 then avg(adj_close) over (
          partition by instrument_id order by observed_at, loaded_at, observation_id
          rows between 199 preceding and current row
        ) end as sma200,
        array_agg(adj_close) over (
          partition by instrument_id order by observed_at, loaded_at, observation_id
          rows between unbounded preceding and current row
        ) as price_history
      from base
    ), indicators as (
      select windows.*,
             technical_engine.rsi_wilder(price_history, 14) as rsi14
      from windows
    )
    select
      indicators.*,
      lag(adj_close) over (
        partition by instrument_id order by observed_at, loaded_at, observation_id
      ) as prev_adj_close,
      lag(sma20) over (
        partition by instrument_id order by observed_at, loaded_at, observation_id
      ) as prev_sma20
    from indicators;

    create index on bt_bars(d, instrument_id);
    create index on bt_bars(instrument_id, d);

    select encode(extensions.digest(
      string_agg(
        concat_ws('|', symbol, observation_id::text,
          to_char(observed_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US'),
          raw_open::text, raw_high::text, raw_low::text, raw_close::text, adj_close::text,
          to_char(loaded_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US')
        ), E'\n' order by symbol, observed_at, loaded_at, observation_id
      ), 'sha256'), 'hex')
      into v_data_hash
    from bt_bars;

    if v_data_hash is null or length(v_data_hash) <> 64 then
      raise exception 'Could not produce deterministic source hash';
    end if;

    create temporary table bt_positions (
      instrument_id uuid primary key,
      symbol text not null,
      signal_date date not null,
      entry_date date not null,
      qty numeric not null,
      entry_fill numeric not null,
      entry_fee numeric not null,
      stop_price numeric not null,
      initial_risk numeric not null,
      hold_sessions integer not null default 0,
      scheduled_exit text
    ) on commit drop;

    create temporary table bt_entry_queue (
      instrument_id uuid primary key,
      symbol text not null,
      signal_date date not null,
      signal_close numeric not null,
      strength numeric not null
    ) on commit drop;

    create temporary table bt_trades (
      trade_seq bigserial primary key,
      instrument_id uuid not null,
      symbol text not null,
      signal_date date not null,
      entry_date date not null,
      exit_date date not null,
      qty numeric not null,
      entry_fill numeric not null,
      exit_fill numeric not null,
      entry_fee numeric not null,
      exit_fee numeric not null,
      net_pnl numeric not null,
      exit_reason text not null
    ) on commit drop;

    create temporary table bt_equity (
      d date primary key,
      equity numeric not null,
      cash numeric not null,
      open_positions integer not null
    ) on commit drop;

    for v_date in
      select distinct d
      from bt_bars
      where d between v_test_start and v_test_end
      order by d
    loop
      if exists (
        select 1 from bt_positions p
        left join bt_bars b on b.instrument_id=p.instrument_id and b.d=v_date
        where b.instrument_id is null
      ) then
        raise exception 'Held position missing a daily bar on %', v_date;
      end if;

      for v_pos in
        select p.*, b.adj_open
        from bt_positions p
        join bt_bars b on b.instrument_id=p.instrument_id and b.d=v_date
        order by p.symbol
      loop
        v_exit_reason := null;
        if v_pos.adj_open < v_pos.stop_price then
          v_exit_base := v_pos.adj_open;
          v_exit_reason := 'protective_stop_gap';
        elsif v_pos.scheduled_exit is not null then
          v_exit_base := v_pos.adj_open;
          v_exit_reason := v_pos.scheduled_exit;
        end if;

        if v_exit_reason is not null then
          v_exit_fill := v_exit_base * (1 - v_slippage_rate);
          v_exit_fee := v_pos.qty * v_exit_fill * v_fee_rate;
          v_trade_pnl := v_pos.qty * (v_exit_fill - v_pos.entry_fill) - v_pos.entry_fee - v_exit_fee;
          v_cash := v_cash + (v_pos.qty * v_exit_fill) - v_exit_fee;

          insert into bt_trades(
            instrument_id,symbol,signal_date,entry_date,exit_date,qty,
            entry_fill,exit_fill,entry_fee,exit_fee,net_pnl,exit_reason
          ) values (
            v_pos.instrument_id,v_pos.symbol,v_pos.signal_date,v_pos.entry_date,v_date,v_pos.qty,
            v_pos.entry_fill,v_exit_fill,v_pos.entry_fee,v_exit_fee,v_trade_pnl,v_exit_reason
          );

          delete from bt_positions where instrument_id=v_pos.instrument_id;
          if v_exit_reason='protective_stop_gap' then v_stop_gap_exits := v_stop_gap_exits + 1;
          elsif v_exit_reason='trend_exit' then v_trend_exits := v_trend_exits + 1;
          elsif v_exit_reason='time_exit' then v_time_exits := v_time_exits + 1;
          end if;
        end if;
      end loop;

      for v_entry in
        select q.*, b.adj_open
        from bt_entry_queue q
        join bt_bars b on b.instrument_id=q.instrument_id and b.d=v_date
        order by q.strength desc, q.symbol asc
      loop
        if v_entry.adj_open > v_entry.signal_close * 1.03 then
          v_skipped_gap := v_skipped_gap + 1;
          delete from bt_entry_queue where instrument_id=v_entry.instrument_id;
          continue;
        end if;

        select count(*), coalesce(sum(initial_risk),0)
          into v_rows, v_open_risk
        from bt_positions;

        if v_rows >= 4 then
          v_skipped_capacity := v_skipped_capacity + 1;
          delete from bt_entry_queue where instrument_id=v_entry.instrument_id;
          continue;
        end if;

        select coalesce(sum(p.qty*b.adj_open),0)
          into v_gross_exposure
        from bt_positions p
        join bt_bars b on b.instrument_id=p.instrument_id and b.d=v_date;

        v_equity_open := v_cash + v_gross_exposure;
        if v_equity_open <= 0 then
          raise exception 'Non-positive portfolio equity at open on %', v_date;
        end if;

        v_entry_fill := v_entry.adj_open * (1 + v_slippage_rate);
        v_qty_risk := (v_equity_open * 0.0075) / (v_entry_fill * v_stop_pct);
        v_qty_notional := (v_equity_open * 0.10) / v_entry_fill;
        v_qty_gross := greatest((v_equity_open * 0.40) - v_gross_exposure,0) / v_entry_fill;
        v_qty_openrisk := greatest((v_equity_open * 0.03) - v_open_risk,0) / (v_entry_fill * v_stop_pct);
        v_qty_cash := greatest(v_cash,0) / (v_entry_fill * (1 + v_fee_rate));
        v_qty := least(v_qty_risk, v_qty_notional, v_qty_gross, v_qty_openrisk, v_qty_cash);

        if v_qty is null or v_qty <= 0.00000001 then
          v_skipped_capacity := v_skipped_capacity + 1;
          delete from bt_entry_queue where instrument_id=v_entry.instrument_id;
          continue;
        end if;

        v_entry_fee := v_qty * v_entry_fill * v_fee_rate;
        v_cash := v_cash - (v_qty * v_entry_fill) - v_entry_fee;

        insert into bt_positions(
          instrument_id,symbol,signal_date,entry_date,qty,entry_fill,entry_fee,stop_price,initial_risk
        ) values (
          v_entry.instrument_id,v_entry.symbol,v_entry.signal_date,v_date,v_qty,v_entry_fill,v_entry_fee,
          v_entry_fill * (1 - v_stop_pct), v_qty * v_entry_fill * v_stop_pct
        );
        v_entries_opened := v_entries_opened + 1;
        delete from bt_entry_queue where instrument_id=v_entry.instrument_id;
      end loop;

      for v_pos in
        select p.*, b.adj_low
        from bt_positions p
        join bt_bars b on b.instrument_id=p.instrument_id and b.d=v_date
        where b.adj_low <= p.stop_price
        order by p.symbol
      loop
        v_exit_base := v_pos.stop_price;
        v_exit_fill := v_exit_base * (1 - v_slippage_rate);
        v_exit_fee := v_pos.qty * v_exit_fill * v_fee_rate;
        v_trade_pnl := v_pos.qty * (v_exit_fill - v_pos.entry_fill) - v_pos.entry_fee - v_exit_fee;
        v_cash := v_cash + (v_pos.qty * v_exit_fill) - v_exit_fee;

        insert into bt_trades(
          instrument_id,symbol,signal_date,entry_date,exit_date,qty,
          entry_fill,exit_fill,entry_fee,exit_fee,net_pnl,exit_reason
        ) values (
          v_pos.instrument_id,v_pos.symbol,v_pos.signal_date,v_pos.entry_date,v_date,v_pos.qty,
          v_pos.entry_fill,v_exit_fill,v_pos.entry_fee,v_exit_fee,v_trade_pnl,'protective_stop_touch'
        );

        delete from bt_positions where instrument_id=v_pos.instrument_id;
        v_stop_touch_exits := v_stop_touch_exits + 1;
      end loop;

      select v_cash + coalesce(sum(p.qty*b.adj_close),0)
        into v_equity_close
      from bt_positions p
      join bt_bars b on b.instrument_id=p.instrument_id and b.d=v_date;

      if v_equity_close is null or v_equity_close <= 0 then
        raise exception 'Non-positive or missing close equity on %', v_date;
      end if;

      insert into bt_equity(d,equity,cash,open_positions)
      values (v_date,v_equity_close,v_cash,(select count(*) from bt_positions));

      update bt_positions p
      set hold_sessions = p.hold_sessions + 1,
          scheduled_exit = case
            when b.sma50 is not null and b.adj_close < b.sma50 then 'trend_exit'
            when p.hold_sessions + 1 >= 60 then 'time_exit'
            else null
          end
      from bt_bars b
      where b.instrument_id=p.instrument_id and b.d=v_date;

      insert into bt_entry_queue(instrument_id,symbol,signal_date,signal_close,strength)
      select b.instrument_id,b.symbol,v_date,b.adj_close,(b.sma50/b.sma200)-1
      from bt_bars b
      left join bt_positions p on p.instrument_id=b.instrument_id
      where b.d=v_date
        and p.instrument_id is null
        and b.bar_num >= 200
        and b.sma20 is not null and b.sma50 is not null and b.sma200 is not null and b.rsi14 is not null
        and b.sma50 > b.sma200
        and b.adj_close > b.sma200
        and b.rsi14 between 45 and 65
        and b.prev_adj_close is not null and b.prev_sma20 is not null
        and b.prev_adj_close <= b.prev_sma20
        and b.adj_close > b.sma20
        and b.adj_close > b.prev_adj_close
      on conflict (instrument_id) do nothing;
      get diagnostics v_rows = row_count;
      v_signal_count := v_signal_count + v_rows;
    end loop;

    select count(*),
           count(*) filter (where net_pnl > 0),
           coalesce(sum(net_pnl) filter (where net_pnl > 0),0),
           coalesce(sum(net_pnl) filter (where net_pnl < 0),0),
           case when count(*) > 0 then sum(net_pnl)/count(*) else null end
      into v_trade_count,v_win_count,v_gross_profit,v_gross_loss,v_expectancy
    from bt_trades;

    select equity into v_ending_equity
    from bt_equity where d=v_test_end;

    select equity into v_oos_start_equity
    from bt_equity
    where d < v_out_sample_start
    order by d desc limit 1;

    if v_ending_equity is null or v_oos_start_equity is null then
      raise exception 'Missing ending or out-of-sample baseline equity';
    end if;

    v_net_profit := v_ending_equity - v_initial_equity;
    v_return_pct := (v_net_profit / v_initial_equity) * 100;
    v_in_sample_return := ((v_oos_start_equity / v_initial_equity) - 1) * 100;
    v_oos_return := ((v_ending_equity / v_oos_start_equity) - 1) * 100;

    if v_trade_count > 0 then
      v_win_rate := (v_win_count::numeric / v_trade_count::numeric) * 100;
    else
      v_win_rate := null;
    end if;

    if v_gross_loss < 0 then
      v_profit_factor := v_gross_profit / abs(v_gross_loss);
    else
      v_profit_factor := null;
    end if;

    with e as (
      select d,equity,max(equity) over(order by d) as peak
      from bt_equity
    )
    select coalesce(max(((peak-equity)/peak)*100),0)
      into v_max_drawdown
    from e where peak > 0;

    with r as (
      select d,(equity/lag(equity) over(order by d))-1 as daily_return
      from bt_equity
    )
    select avg(daily_return),stddev_samp(daily_return),count(daily_return)
      into v_avg_daily_return,v_std_daily_return,v_daily_return_count
    from r where daily_return is not null;

    if v_std_daily_return is not null and v_std_daily_return > 0 and v_daily_return_count >= 2 then
      v_sharpe := (v_avg_daily_return / v_std_daily_return) * sqrt(252::numeric);
    else
      v_sharpe := null;
    end if;

    select encode(extensions.digest(
      string_agg(concat_ws('|',trade_seq::text,symbol,signal_date::text,entry_date::text,exit_date::text,
        qty::text,entry_fill::text,exit_fill::text,entry_fee::text,exit_fee::text,net_pnl::text,exit_reason),
        E'\n' order by trade_seq), 'sha256'),'hex')
      into v_trade_hash
    from bt_trades;

    select encode(extensions.digest(
      string_agg(concat_ws('|',d::text,equity::text,cash::text,open_positions::text),E'\n' order by d),
      'sha256'),'hex')
      into v_equity_hash
    from bt_equity;

    select count(*) into v_open_positions from bt_positions;
    select count(*) into v_pending_signals from bt_entry_queue;

    v_data_provenance := jsonb_build_object(
      'source_table','public.market_observations',
      'provider_code','tiingo',
      'provider_id',v_provider_id,
      'interval_code','1day',
      'source_query_version','daily-trend-pullback-source-v1',
      'source_period_start',v_source_start,
      'source_period_end',v_test_end,
      'input_data_cutoff',v_input_cutoff,
      'source_row_count',v_source_count,
      'instrument_count',v_source_instruments,
      'source_rows_sha256',v_data_hash,
      'source_hash_method','sha256-source-rows-v1',
      'universe_snapshot',v_strategy.universe_definition,
      'missing_data_handling','Fail on invalid included OHLC/adjusted-close input; do not impute missing values; instrument signals remain ineligible until required point-in-time history exists.',
      'price_adjustment_convention','Signals use adjusted_close. Raw open/high/low are multiplied by adjusted_close/raw_close for execution simulation.',
      'survivorship_bias_disclosure','Fixed active universe snapshot as at 24-Aug-2026 used retrospectively; results are not survivorship-bias-free.',
      'lookahead_prohibited',true
    );

    v_execution_provenance := jsonb_build_object(
      'engine_version',v_engine_version,
      'implementation_commit',p_implementation_commit,
      'design_commit',v_design_commit,
      'indicator_methodology','technical-engine-v1 point-in-time SMA20/SMA50/SMA200 and Wilder RSI14',
      'event_order_version','daily-trend-pullback-event-order-v1',
      'signal_timing','completed daily close only',
      'entry_model','next adjusted open; skip when adjusted open > 103% of signal adjusted close',
      'entry_slippage_bps',10,
      'exit_slippage_bps',10,
      'fee_bps_per_side',5,
      'fractional_shares',true,
      'protective_stop','8% below actual entry fill; opening gap through stop exits at adjusted open, otherwise low touch exits at stop',
      'trend_exit','completed adjusted close below SMA50, exit next adjusted open',
      'time_exit','after 60 completed holding sessions, exit next adjusted open',
      'portfolio_ranking','descending SMA50/SMA200-1 then ascending symbol',
      'risk_per_trade_pct',0.75,
      'position_notional_cap_pct',10,
      'max_positions',4,
      'max_gross_long_exposure_pct',40,
      'max_total_initial_open_risk_pct',3,
      'equity_curve_sampling','daily close',
      'sharpe_return_frequency','daily',
      'sharpe_annualisation_factor','sqrt(252)',
      'sharpe_risk_free_rate',0,
      'trade_ledger_sha256',v_trade_hash,
      'equity_curve_sha256',v_equity_hash,
      'random_seed',null
    );

    v_source_metadata := jsonb_build_object(
      'signals_generated',v_signal_count,
      'entries_opened',v_entries_opened,
      'signals_skipped_gap',v_skipped_gap,
      'signals_skipped_capacity_or_risk',v_skipped_capacity,
      'closed_trades',v_trade_count,
      'open_positions_at_cutoff',v_open_positions,
      'pending_signals_at_cutoff',v_pending_signals,
      'protective_stop_gap_exits',v_stop_gap_exits,
      'protective_stop_touch_exits',v_stop_touch_exits,
      'trend_exits',v_trend_exits,
      'time_exits',v_time_exits,
      'in_sample_return_pct',v_in_sample_return,
      'out_of_sample_start_equity',v_oos_start_equity,
      'profit_factor_no_loss_convention',case when v_trade_count > 0 and v_gross_loss = 0 then 'NULL because there were no losing completed trades' else null end,
      'open_position_valuation','Open positions at cutoff are marked at final adjusted close; no hypothetical exit fee/slippage is deducted until an exit occurs.'
    );

    if v_trade_count <= 0 then
      raise exception 'Baseline backtest produced no completed trades; cannot finalise review evidence';
    end if;
    if v_win_rate is null or v_expectancy is null or v_max_drawdown is null or v_oos_return is null then
      raise exception 'Required strategy-test-metrics-v1 values are incomplete';
    end if;
    if v_sharpe is null then
      raise exception 'Sharpe ratio was not calculable for baseline despite sufficient daily equity observations';
    end if;
    if v_gross_loss < 0 and v_profit_factor is null then
      raise exception 'Profit factor missing despite losing trades';
    end if;
    if abs(v_net_profit - (v_ending_equity-v_initial_equity)) > 0.000001 then
      raise exception 'Net profit failed accounting consistency check';
    end if;
    if abs(v_return_pct - ((v_net_profit/v_initial_equity)*100)) > 0.000001 then
      raise exception 'Return percentage failed accounting consistency check';
    end if;
    if jsonb_typeof(v_data_provenance) <> 'object' or v_data_provenance='{}'::jsonb
       or jsonb_typeof(v_execution_provenance) <> 'object' or v_execution_provenance='{}'::jsonb then
      raise exception 'Required provenance is empty';
    end if;

    update public.trading_test_runs
    set run_status='succeeded',
        instrument_count=v_instrument_count,
        trade_count=v_trade_count,
        net_profit=v_net_profit,
        return_pct=v_return_pct,
        win_rate_pct=v_win_rate,
        profit_factor=v_profit_factor,
        expectancy=v_expectancy,
        max_drawdown_pct=v_max_drawdown,
        sharpe_ratio=v_sharpe,
        out_of_sample_return_pct=v_oos_return,
        ending_equity=v_ending_equity,
        data_provenance=v_data_provenance,
        execution_provenance=v_execution_provenance,
        source_metadata=coalesce(source_metadata,'{}'::jsonb) || v_source_metadata,
        notes='First real baseline backtest for DAILY_TREND_PULLBACK v1. Fixed-current-universe survivorship bias is disclosed. Execution OHLC is explicitly normalised to the adjusted-close basis. No live trading is authorised.',
        completed_at=clock_timestamp(),
        failure_message=null
    where id=v_run_id;

    return jsonb_build_object(
      'status','succeeded',
      'run_id',v_run_id,
      'run_key',v_run_key,
      'strategy_snapshot_hash',v_run_snapshot_hash,
      'source_rows_sha256',v_data_hash,
      'trade_ledger_sha256',v_trade_hash,
      'equity_curve_sha256',v_equity_hash,
      'instrument_count',v_instrument_count,
      'trade_count',v_trade_count,
      'ending_equity',v_ending_equity,
      'net_profit',v_net_profit,
      'return_pct',v_return_pct,
      'win_rate_pct',v_win_rate,
      'profit_factor',v_profit_factor,
      'expectancy',v_expectancy,
      'max_drawdown_pct',v_max_drawdown,
      'sharpe_ratio',v_sharpe,
      'out_of_sample_return_pct',v_oos_return,
      'open_positions_at_cutoff',v_open_positions
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    update public.trading_test_runs
    set run_status='failed',
        completed_at=clock_timestamp(),
        failure_message=left(v_error,2000)
    where id=v_run_id;
    return jsonb_build_object('status','failed','run_id',v_run_id,'error',v_error);
  end;
end;
$$;

revoke all on function strategy_lab.run_daily_trend_pullback_v1(text) from public, anon, authenticated;
grant execute on function strategy_lab.run_daily_trend_pullback_v1(text) to service_role;

comment on function strategy_lab.run_daily_trend_pullback_v1(text) is
'STRAT-003 trusted idempotent baseline runner for DAILY_TREND_PULLBACK v1. Uses real Tiingo daily history, persists one strategy-test-ingestion-v1 result, and records failure instead of partial success.';