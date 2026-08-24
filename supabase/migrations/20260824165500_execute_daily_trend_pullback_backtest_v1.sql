create or replace function public.execute_daily_trend_pullback_backtest_v1(
  p_strategy_id uuid,
  p_run_key text default 'DAILY_TREND_PULLBACK:v1:backtest:2021-08-16_2026-08-14:daily-trend-pullback-backtest-v1:baseline'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_strategy record;
  v_run_id uuid;
  v_existing record;
  v_period_start date;
  v_period_end date;
  v_is_start date;
  v_is_end date;
  v_oos_start date;
  v_oos_end date;
  v_input_cutoff timestamptz;
  v_initial_equity numeric := 100000;
  v_cash numeric := 100000;
  v_equity numeric := 100000;
  v_ending_equity numeric;
  v_net_profit numeric;
  v_return_pct numeric;
  v_win_rate numeric;
  v_profit_factor numeric;
  v_expectancy numeric;
  v_max_drawdown numeric;
  v_sharpe numeric;
  v_oos_return numeric;
  v_trade_count integer;
  v_instrument_count integer;
  v_row_count bigint;
  v_gross_profit numeric;
  v_gross_loss numeric;
  v_oos_base numeric;
  v_current_exposure numeric;
  v_current_open_risk numeric;
  v_available_notional numeric;
  v_fill numeric;
  v_fee numeric;
  v_shares numeric;
  v_stop numeric;
  v_exit_base numeric;
  v_exit_fill numeric;
  v_exit_fee numeric;
  v_pnl numeric;
  v_reason text;
  v_positions integer;
  v_factor_ratio numeric;
  v_provider_ids jsonb;
  v_now timestamptz := clock_timestamp();
  d date;
  r record;
  p record;
begin
  if p_run_key is null or nullif(btrim(p_run_key),'') is null then
    raise exception 'run_key is required';
  end if;

  select * into v_strategy
  from public.trading_strategies
  where id = p_strategy_id;

  if not found then
    raise exception 'Unknown strategy_id %', p_strategy_id;
  end if;

  if v_strategy.strategy_code <> 'DAILY_TREND_PULLBACK'
     or v_strategy.strategy_version <> 1
     or v_strategy.methodology_version <> 'strategy-definition-v1' then
    raise exception 'This engine supports DAILY_TREND_PULLBACK v1 only';
  end if;

  if v_strategy.live_execution_enabled then
    raise exception 'Backtest strategy must not have live execution enabled';
  end if;

  select * into v_existing
  from public.trading_test_runs
  where owner_user_id = v_strategy.owner_user_id
    and run_key = p_run_key;

  if found and v_existing.run_status = 'succeeded' then
    return jsonb_build_object(
      'status','already_complete',
      'run_id',v_existing.id,
      'run_key',v_existing.run_key,
      'strategy_snapshot_hash',v_existing.strategy_snapshot_hash,
      'trade_count',v_existing.trade_count,
      'return_pct',v_existing.return_pct,
      'max_drawdown_pct',v_existing.max_drawdown_pct,
      'out_of_sample_return_pct',v_existing.out_of_sample_return_pct
    );
  end if;

  if found then
    if v_existing.strategy_id <> p_strategy_id or v_existing.test_type <> 'backtest' then
      raise exception 'Existing run_key belongs to a different strategy or test type';
    end if;
    v_run_id := v_existing.id;
    update public.trading_test_runs
       set run_status = 'running',
           started_at = coalesce(started_at, v_now),
           completed_at = null,
           failure_message = null,
           engine_version = 'daily-trend-pullback-backtest-v1'
     where id = v_run_id;
  else
    insert into public.trading_test_runs(
      strategy_id, run_key, run_name, test_type, run_status,
      engine_version, started_at, source_run_id
    ) values (
      p_strategy_id, p_run_key, 'Daily Trend Pullback v1 — five-year baseline backtest', 'backtest', 'running',
      'daily-trend-pullback-backtest-v1', v_now, p_run_key
    ) returning id into v_run_id;
  end if;

  drop table if exists pg_temp.bt_base;
  drop table if exists pg_temp.bt_indicators;
  drop table if exists pg_temp.bt_signals;
  drop table if exists pg_temp.bt_positions;
  drop table if exists pg_temp.bt_trades;
  drop table if exists pg_temp.bt_equity;

  create temp table bt_base on commit drop as
  with universe as (
    select i.id as instrument_id, i.symbol
    from public.instruments i
    where i.symbol in (
      select jsonb_array_elements_text(v_strategy.universe_definition->'symbols')
    )
  ), dedup as (
    select
      mo.id,
      mo.instrument_id,
      u.symbol,
      mo.provider_id,
      mo.observed_at,
      mo.open,
      mo.high,
      mo.low,
      mo.close,
      mo.adjusted_close,
      mo.loaded_at,
      row_number() over (
        partition by mo.instrument_id, mo.observed_at
        order by mo.loaded_at desc, mo.id desc
      ) as pick
    from public.market_observations mo
    join universe u on u.instrument_id = mo.instrument_id
    where mo.interval_code = '1day'
      and mo.adjusted_close > 0
      and mo.open > 0 and mo.high > 0 and mo.low > 0 and mo.close > 0
  ), ordered as (
    select
      id, instrument_id, symbol, provider_id, observed_at,
      observed_at::date as trade_date,
      open, high, low, close, adjusted_close,
      adjusted_close / nullif(close,0) as adj_factor,
      row_number() over (partition by instrument_id order by observed_at, loaded_at, id) as rn,
      lag(adjusted_close) over (partition by instrument_id order by observed_at, loaded_at, id) as prev_px
    from dedup
    where pick = 1
  )
  select *,
    greatest(adjusted_close - prev_px, 0) as gain,
    greatest(prev_px - adjusted_close, 0) as loss
  from ordered;

  select min(trade_date), max(trade_date), max(observed_at), count(*), count(distinct instrument_id),
         coalesce(jsonb_agg(distinct provider_id::text), '[]'::jsonb)
    into v_period_start, v_period_end, v_input_cutoff, v_row_count, v_instrument_count, v_provider_ids
  from bt_base;

  if v_instrument_count <> 20 then
    raise exception 'Expected 20 strategy instruments, found %', v_instrument_count;
  end if;

  if v_period_start is null or v_period_end is null or v_period_end <= v_period_start then
    raise exception 'Backtest source period is invalid';
  end if;

  v_oos_end := v_period_end;
  v_oos_start := (v_period_end - interval '1 year' + interval '1 day')::date;
  select min(trade_date) into v_oos_start from bt_base where trade_date >= v_oos_start;
  select max(trade_date) into v_is_end from bt_base where trade_date < v_oos_start;
  v_is_start := v_period_start;

  if v_oos_start is null or v_is_end is null then
    raise exception 'Unable to derive in-sample/out-of-sample periods';
  end if;

  create temp table bt_indicators on commit drop as
  with w as (
    select b.*,
      avg(adjusted_close) over (partition by instrument_id order by rn rows between 19 preceding and current row) as sma20_raw,
      count(*) over (partition by instrument_id order by rn rows between 19 preceding and current row) as sma20_n,
      avg(adjusted_close) over (partition by instrument_id order by rn rows between 49 preceding and current row) as sma50_raw,
      count(*) over (partition by instrument_id order by rn rows between 49 preceding and current row) as sma50_n,
      avg(adjusted_close) over (partition by instrument_id order by rn rows between 199 preceding and current row) as sma200_raw,
      count(*) over (partition by instrument_id order by rn rows between 199 preceding and current row) as sma200_n
    from bt_base b
  )
  select w.*,
    case when sma20_n = 20 then sma20_raw end as sma20,
    case when sma50_n = 50 then sma50_raw end as sma50,
    case when sma200_n = 200 then sma200_raw end as sma200,
    null::numeric as rsi14
  from w;

  with recursive rsi as (
    select
      b.instrument_id,
      b.rn,
      (select avg(x.gain) from bt_base x where x.instrument_id=b.instrument_id and x.rn between b.rn-13 and b.rn) as avg_gain,
      (select avg(x.loss) from bt_base x where x.instrument_id=b.instrument_id and x.rn between b.rn-13 and b.rn) as avg_loss
    from bt_base b
    where b.rn = 15
    union all
    select
      n.instrument_id,
      n.rn,
      ((r.avg_gain * 13) + n.gain) / 14,
      ((r.avg_loss * 13) + n.loss) / 14
    from rsi r
    join bt_base n
      on n.instrument_id = r.instrument_id
     and n.rn = r.rn + 1
  ), vals as (
    select instrument_id, rn,
      case
        when avg_loss = 0 and avg_gain > 0 then 100::numeric
        when avg_loss = 0 and avg_gain = 0 then 50::numeric
        when avg_gain = 0 and avg_loss > 0 then 0::numeric
        else 100 - (100 / (1 + (avg_gain / nullif(avg_loss,0))))
      end as rsi14
    from rsi
  )
  update bt_indicators i
     set rsi14 = v.rsi14
    from vals v
   where v.instrument_id=i.instrument_id and v.rn=i.rn;

  create temp table bt_signals on commit drop as
  with s as (
    select i.*,
      lag(adjusted_close) over (partition by instrument_id order by rn) as prev_close,
      lag(sma20) over (partition by instrument_id order by rn) as prev_sma20,
      lead(trade_date) over (partition by instrument_id order by rn) as entry_date,
      lead(open) over (partition by instrument_id order by rn) as entry_open
    from bt_indicators i
  )
  select
    instrument_id, symbol, trade_date as signal_date, entry_date, entry_open,
    adjusted_close as signal_close,
    sma50, sma200,
    (sma50 / nullif(sma200,0) - 1) as trend_strength
  from s
  where rn >= 200
    and sma50 > sma200
    and adjusted_close > sma200
    and rsi14 between 45 and 65
    and prev_close <= prev_sma20
    and adjusted_close > sma20
    and adjusted_close > prev_close
    and entry_date is not null
    and entry_open is not null;

  create temp table bt_positions (
    instrument_id uuid primary key,
    symbol text not null,
    entry_date date not null,
    entry_price numeric not null,
    shares numeric not null,
    stop_price numeric not null,
    entry_cost numeric not null,
    sessions_held integer not null default 0,
    exit_next boolean not null default false,
    exit_reason text,
    last_adj_factor numeric
  ) on commit drop;

  create temp table bt_trades (
    instrument_id uuid,
    symbol text,
    entry_date date,
    exit_date date,
    entry_price numeric,
    exit_price numeric,
    shares numeric,
    pnl numeric,
    exit_reason text
  ) on commit drop;

  create temp table bt_equity (
    trade_date date primary key,
    equity numeric not null
  ) on commit drop;

  for d in
    select distinct trade_date from bt_base where trade_date between v_period_start and v_period_end order by trade_date
  loop
    for p in
      select p0.instrument_id, p0.shares, p0.stop_price, p0.last_adj_factor, b.adj_factor
      from bt_positions p0
      join bt_base b on b.instrument_id=p0.instrument_id and b.trade_date=d
    loop
      if p.last_adj_factor is not null and p.adj_factor is not null and p.last_adj_factor <> 0 then
        v_factor_ratio := p.adj_factor / p.last_adj_factor;
        if v_factor_ratio >= 1.5 or v_factor_ratio <= (1.0/1.5) then
          update bt_positions
             set shares = shares * v_factor_ratio,
                 stop_price = stop_price / v_factor_ratio,
                 last_adj_factor = p.adj_factor
           where instrument_id=p.instrument_id;
        else
          update bt_positions set last_adj_factor=p.adj_factor where instrument_id=p.instrument_id;
        end if;
      end if;
    end loop;

    for p in
      select p0.*, b.open as day_open, b.low as day_low
      from bt_positions p0
      join bt_base b on b.instrument_id=p0.instrument_id and b.trade_date=d
      order by p0.symbol
    loop
      v_exit_base := null;
      v_reason := null;
      if p.day_open < p.stop_price then
        v_exit_base := p.day_open;
        v_reason := 'protective_stop_gap';
      elsif p.exit_next then
        v_exit_base := p.day_open;
        v_reason := p.exit_reason;
      elsif p.day_low <= p.stop_price then
        v_exit_base := p.stop_price;
        v_reason := 'protective_stop';
      end if;

      if v_exit_base is not null then
        v_exit_fill := v_exit_base * 0.999;
        v_exit_fee := (p.shares * v_exit_fill) * 0.0005;
        v_pnl := (p.shares * v_exit_fill) - v_exit_fee - p.entry_cost;
        v_cash := v_cash + (p.shares * v_exit_fill) - v_exit_fee;
        insert into bt_trades values(p.instrument_id,p.symbol,p.entry_date,d,p.entry_price,v_exit_fill,p.shares,v_pnl,v_reason);
        delete from bt_positions where instrument_id=p.instrument_id;
      end if;
    end loop;

    select v_cash + coalesce(sum(p0.shares * b.open),0), count(*)
      into v_equity, v_positions
    from bt_positions p0
    join bt_base b on b.instrument_id=p0.instrument_id and b.trade_date=d;

    select coalesce(sum(p0.shares * b.open),0), coalesce(sum((p0.entry_price - p0.stop_price) * p0.shares),0)
      into v_current_exposure, v_current_open_risk
    from bt_positions p0
    join bt_base b on b.instrument_id=p0.instrument_id and b.trade_date=d;

    for r in
      select s.*, b.adj_factor
      from bt_signals s
      join bt_base b on b.instrument_id=s.instrument_id and b.trade_date=d
      where s.entry_date=d
        and s.entry_open <= s.signal_close * 1.03
        and not exists (select 1 from bt_positions p0 where p0.instrument_id=s.instrument_id)
      order by s.trend_strength desc, s.symbol asc
    loop
      exit when v_positions >= 4;
      if v_equity <= 0 then exit; end if;

      v_available_notional := least(
        v_equity * 0.10,
        (v_equity * 0.0075) / 0.08,
        greatest(v_equity * 0.40 - v_current_exposure,0),
        greatest((v_equity * 0.03 - v_current_open_risk) / 0.08,0),
        greatest(v_cash / 1.0005,0)
      );

      if v_available_notional > 1 then
        v_fill := r.entry_open * 1.001;
        v_shares := v_available_notional / v_fill;
        v_fee := v_available_notional * 0.0005;
        v_stop := v_fill * 0.92;
        if v_shares > 0 and v_cash >= v_available_notional + v_fee then
          v_cash := v_cash - v_available_notional - v_fee;
          insert into bt_positions(instrument_id,symbol,entry_date,entry_price,shares,stop_price,entry_cost,sessions_held,exit_next,exit_reason,last_adj_factor)
          values(r.instrument_id,r.symbol,d,v_fill,v_shares,v_stop,v_available_notional+v_fee,0,false,null,r.adj_factor);
          v_positions := v_positions + 1;
          v_current_exposure := v_current_exposure + v_available_notional;
          v_current_open_risk := v_current_open_risk + ((v_fill-v_stop)*v_shares);
        end if;
      end if;
    end loop;

    for p in
      select p0.*, b.low as day_low
      from bt_positions p0
      join bt_base b on b.instrument_id=p0.instrument_id and b.trade_date=d
      where p0.entry_date=d and b.low <= p0.stop_price
      order by p0.symbol
    loop
      v_exit_fill := p.stop_price * 0.999;
      v_exit_fee := (p.shares * v_exit_fill) * 0.0005;
      v_pnl := (p.shares * v_exit_fill) - v_exit_fee - p.entry_cost;
      v_cash := v_cash + (p.shares * v_exit_fill) - v_exit_fee;
      insert into bt_trades values(p.instrument_id,p.symbol,p.entry_date,d,p.entry_price,v_exit_fill,p.shares,v_pnl,'protective_stop_same_session');
      delete from bt_positions where instrument_id=p.instrument_id;
    end loop;

    for p in
      select p0.instrument_id, p0.sessions_held, i.adjusted_close, i.sma50
      from bt_positions p0
      join bt_indicators i on i.instrument_id=p0.instrument_id and i.trade_date=d
    loop
      update bt_positions set sessions_held = sessions_held + 1 where instrument_id=p.instrument_id;
      if p.sma50 is not null and p.adjusted_close < p.sma50 then
        update bt_positions set exit_next=true, exit_reason='trend_exit' where instrument_id=p.instrument_id;
      elsif p.sessions_held + 1 >= 60 then
        update bt_positions set exit_next=true, exit_reason='time_exit' where instrument_id=p.instrument_id;
      end if;
    end loop;

    select v_cash + coalesce(sum(p0.shares * b.close),0)
      into v_equity
    from bt_positions p0
    join bt_base b on b.instrument_id=p0.instrument_id and b.trade_date=d;

    insert into bt_equity(trade_date,equity) values(d,v_equity);
  end loop;

  select equity into v_ending_equity from bt_equity order by trade_date desc limit 1;
  v_net_profit := v_ending_equity - v_initial_equity;
  v_return_pct := (v_net_profit / v_initial_equity) * 100;

  select count(*),
         coalesce(sum(case when pnl > 0 then pnl else 0 end),0),
         coalesce(sum(case when pnl < 0 then pnl else 0 end),0),
         case when count(*)>0 then (count(*) filter (where pnl>0))::numeric / count(*) * 100 end,
         case when count(*)>0 then avg(pnl) end
    into v_trade_count,v_gross_profit,v_gross_loss,v_win_rate,v_expectancy
  from bt_trades;

  if v_gross_loss < 0 then
    v_profit_factor := v_gross_profit / abs(v_gross_loss);
  else
    v_profit_factor := null;
  end if;

  with q as (
    select trade_date,equity,
           max(equity) over(order by trade_date rows unbounded preceding) as peak
    from bt_equity
  )
  select max(case when peak>0 then (peak-equity)/peak*100 else 0 end)
    into v_max_drawdown
  from q;

  with rets as (
    select trade_date, equity/lag(equity) over(order by trade_date)-1 as r
    from bt_equity
  )
  select case when stddev_samp(r) is null or stddev_samp(r)=0 then null
              else avg(r)/stddev_samp(r)*sqrt(252::numeric) end
    into v_sharpe
  from rets where r is not null;

  select equity into v_oos_base
  from bt_equity
  where trade_date < v_oos_start
  order by trade_date desc limit 1;
  if v_oos_base is null then
    select equity into v_oos_base from bt_equity where trade_date=v_oos_start;
  end if;
  if v_oos_base is not null and v_oos_base>0 then
    v_oos_return := (v_ending_equity/v_oos_base-1)*100;
  end if;

  if v_trade_count is null or v_trade_count <= 0 then
    raise exception 'Backtest produced no completed trades';
  end if;
  if v_ending_equity is null or v_return_pct is null or v_win_rate is null
     or v_expectancy is null or v_max_drawdown is null or v_oos_return is null then
    raise exception 'Backtest required metrics are incomplete';
  end if;
  if abs(v_net_profit - (v_ending_equity-v_initial_equity)) > 0.01 then
    raise exception 'Backtest net-profit consistency check failed';
  end if;
  if abs(v_return_pct - (v_net_profit/v_initial_equity*100)) > 0.0001 then
    raise exception 'Backtest return consistency check failed';
  end if;

  update public.trading_test_runs
     set period_start = v_period_start,
         period_end = v_period_end,
         instrument_count = v_instrument_count,
         trade_count = v_trade_count,
         net_profit = round(v_net_profit,6),
         return_pct = round(v_return_pct,6),
         win_rate_pct = round(v_win_rate,6),
         profit_factor = case when v_profit_factor is null then null else round(v_profit_factor,6) end,
         expectancy = round(v_expectancy,6),
         max_drawdown_pct = round(v_max_drawdown,6),
         sharpe_ratio = case when v_sharpe is null then null else round(v_sharpe,6) end,
         out_of_sample_return_pct = round(v_oos_return,6),
         ingestion_version = 'strategy-test-ingestion-v1',
         metric_definition_version = 'strategy-test-metrics-v1',
         engine_version = 'daily-trend-pullback-backtest-v1',
         input_data_cutoff = v_input_cutoff,
         in_sample_period_start = v_is_start,
         in_sample_period_end = v_is_end,
         out_of_sample_period_start = v_oos_start,
         out_of_sample_period_end = v_oos_end,
         initial_equity = v_initial_equity,
         ending_equity = round(v_ending_equity,6),
         base_currency = 'USD',
         data_provenance = jsonb_build_object(
           'source_table','public.market_observations',
           'interval_code','1day',
           'provider_ids',v_provider_ids,
           'source_row_count',v_row_count,
           'universe_mode','fixed_snapshot',
           'universe_snapshot_date',v_strategy.universe_definition->>'snapshot_date',
           'universe_symbols',v_strategy.universe_definition->'symbols',
           'input_data_cutoff',v_input_cutoff,
           'signal_price','adjusted_close',
           'execution_ohlc','recorded raw open/high/low/close',
           'missing_data_rule','skip incomplete sessions; no price imputation',
           'lookahead_prohibited',true,
           'survivorship_bias',v_strategy.universe_definition->>'survivorship_bias_note',
           'corporate_action_note','signals use adjusted close; raw OHLC execution is retained; large adjustment-factor jumps are treated as split events for open positions, while dividend-adjustment differences remain a disclosed limitation'
         ),
         execution_provenance = jsonb_build_object(
           'engine_version','daily-trend-pullback-backtest-v1',
           'signal_timing','after completed daily session',
           'entry_timing','next available session open',
           'slippage_bps_per_side',10,
           'fees_bps_per_side',5,
           'fractional_shares',true,
           'risk_per_trade_pct',0.75,
           'protective_stop_pct',8,
           'max_positions',4,
           'max_gross_long_exposure_pct',40,
           'max_total_initial_open_risk_pct',3,
           'portfolio_equity_curve_frequency','daily close',
           'sharpe_return_frequency','daily',
           'sharpe_annualization_factor','sqrt(252)',
           'risk_free_rate',0,
           'profit_factor_zero_loss_convention','NULL when no losing completed trades',
           'open_positions_at_cutoff',(select count(*) from bt_positions),
           'completed_trade_count',v_trade_count
         ),
         source_metadata = jsonb_build_object(
           'builder_task','STRAT-003',
           'strategy_code','DAILY_TREND_PULLBACK',
           'strategy_version',1,
           'backtest_engine','daily-trend-pullback-backtest-v1'
         ),
         notes = 'First real five-year baseline backtest. Fixed-current-universe survivorship bias is disclosed. No live trading is authorised.',
         run_status = 'succeeded',
         failure_message = null,
         completed_at = clock_timestamp()
   where id = v_run_id;

  if not found then
    raise exception 'Unable to finalise backtest run';
  end if;

  return (
    select jsonb_build_object(
      'status','succeeded',
      'run_id',t.id,
      'run_key',t.run_key,
      'strategy_snapshot_hash',t.strategy_snapshot_hash,
      'period_start',t.period_start,
      'period_end',t.period_end,
      'instrument_count',t.instrument_count,
      'trade_count',t.trade_count,
      'net_profit',t.net_profit,
      'return_pct',t.return_pct,
      'win_rate_pct',t.win_rate_pct,
      'profit_factor',t.profit_factor,
      'expectancy',t.expectancy,
      'max_drawdown_pct',t.max_drawdown_pct,
      'sharpe_ratio',t.sharpe_ratio,
      'out_of_sample_return_pct',t.out_of_sample_return_pct,
      'ending_equity',t.ending_equity,
      'completed_at',t.completed_at
    ) from public.trading_test_runs t where t.id=v_run_id
  );
exception when others then
  if v_run_id is not null then
    begin
      update public.trading_test_runs
         set run_status='failed',
             failure_message=sqlerrm,
             completed_at=clock_timestamp()
       where id=v_run_id and run_status <> 'succeeded';
    exception when others then
      null;
    end;
  end if;
  raise;
end;
$$;

revoke all on function public.execute_daily_trend_pullback_backtest_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.execute_daily_trend_pullback_backtest_v1(uuid,text) to service_role;
comment on function public.execute_daily_trend_pullback_backtest_v1(uuid,text) is 'STRAT-003 trusted atomic backtest/finalisation path for DAILY_TREND_PULLBACK v1. Service-role only.';