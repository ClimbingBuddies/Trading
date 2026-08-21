-- TECH-002: deterministic core Technical Engine calculations.
--
-- The calculation helpers live outside the exposed public schema. The refresh
-- entry point is intentionally SECURITY INVOKER and callable only by trusted
-- server roles. It writes latest daily and completed-week snapshots; later
-- refreshes retain prior observation/version rows through the table's existing
-- deterministic unique key.

create schema if not exists technical_engine;

revoke all on schema technical_engine from public, anon, authenticated;
grant usage on schema technical_engine to service_role;

create or replace function technical_engine.sma(
  p_prices numeric[],
  p_period integer
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_length integer := coalesce(array_length(p_prices, 1), 0);
  v_total numeric := 0;
  v_index integer;
begin
  if p_period <= 0 or v_length < p_period then
    return null;
  end if;

  for v_index in (v_length - p_period + 1)..v_length loop
    v_total := v_total + p_prices[v_index];
  end loop;

  return v_total / p_period;
end;
$$;

create or replace function technical_engine.ema(
  p_prices numeric[],
  p_period integer
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_length integer := coalesce(array_length(p_prices, 1), 0);
  v_multiplier numeric;
  v_ema numeric := 0;
  v_index integer;
begin
  if p_period <= 0 or v_length < p_period then
    return null;
  end if;

  for v_index in 1..p_period loop
    v_ema := v_ema + p_prices[v_index];
  end loop;
  v_ema := v_ema / p_period;
  v_multiplier := 2::numeric / (p_period + 1);

  if v_length > p_period then
    for v_index in (p_period + 1)..v_length loop
      v_ema := (p_prices[v_index] * v_multiplier)
        + (v_ema * (1 - v_multiplier));
    end loop;
  end if;

  return v_ema;
end;
$$;

create or replace function technical_engine.rsi_wilder(
  p_prices numeric[],
  p_period integer default 14
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_length integer := coalesce(array_length(p_prices, 1), 0);
  v_average_gain numeric := 0;
  v_average_loss numeric := 0;
  v_change numeric;
  v_gain numeric;
  v_loss numeric;
  v_index integer;
begin
  if p_period <= 0 or v_length < p_period + 1 then
    return null;
  end if;

  for v_index in 2..(p_period + 1) loop
    v_change := p_prices[v_index] - p_prices[v_index - 1];
    v_average_gain := v_average_gain + greatest(v_change, 0);
    v_average_loss := v_average_loss + greatest(-v_change, 0);
  end loop;
  v_average_gain := v_average_gain / p_period;
  v_average_loss := v_average_loss / p_period;

  if v_length > p_period + 1 then
    for v_index in (p_period + 2)..v_length loop
      v_change := p_prices[v_index] - p_prices[v_index - 1];
      v_gain := greatest(v_change, 0);
      v_loss := greatest(-v_change, 0);
      v_average_gain := ((v_average_gain * (p_period - 1)) + v_gain) / p_period;
      v_average_loss := ((v_average_loss * (p_period - 1)) + v_loss) / p_period;
    end loop;
  end if;

  if v_average_loss = 0 and v_average_gain > 0 then
    return 100;
  elsif v_average_loss = 0 and v_average_gain = 0 then
    return 50;
  elsif v_average_gain = 0 then
    return 0;
  end if;

  return 100 - (100 / (1 + (v_average_gain / v_average_loss)));
end;
$$;

create or replace function technical_engine.macd(
  p_prices numeric[]
)
returns jsonb
language plpgsql
immutable
set search_path = 'pg_catalog'
as $$
declare
  v_length integer := coalesce(array_length(p_prices, 1), 0);
  v_ema_12 numeric := 0;
  v_ema_26 numeric := 0;
  v_macd_line numeric;
  v_signal_line numeric;
  v_macd_seed_total numeric := 0;
  v_macd_count integer := 0;
  v_index integer;
begin
  if v_length < 26 then
    return jsonb_build_object(
      'macd_line', null,
      'signal_line', null,
      'histogram', null
    );
  end if;

  for v_index in 1..v_length loop
    if v_index <= 12 then
      v_ema_12 := v_ema_12 + p_prices[v_index];
      if v_index = 12 then
        v_ema_12 := v_ema_12 / 12;
      end if;
    else
      v_ema_12 := (p_prices[v_index] * (2::numeric / 13))
        + (v_ema_12 * (11::numeric / 13));
    end if;

    if v_index <= 26 then
      v_ema_26 := v_ema_26 + p_prices[v_index];
      if v_index = 26 then
        v_ema_26 := v_ema_26 / 26;
      end if;
    else
      v_ema_26 := (p_prices[v_index] * (2::numeric / 27))
        + (v_ema_26 * (25::numeric / 27));
    end if;

    if v_index >= 26 then
      v_macd_line := v_ema_12 - v_ema_26;
      v_macd_count := v_macd_count + 1;

      if v_macd_count <= 9 then
        v_macd_seed_total := v_macd_seed_total + v_macd_line;
        if v_macd_count = 9 then
          v_signal_line := v_macd_seed_total / 9;
        end if;
      else
        v_signal_line := (v_macd_line * (2::numeric / 10))
          + (v_signal_line * (8::numeric / 10));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'macd_line', v_macd_line,
    'signal_line', v_signal_line,
    'histogram', case
      when v_signal_line is null then null
      else v_macd_line - v_signal_line
    end
  );
end;
$$;

create or replace function technical_engine.annualised_volatility(
  p_prices numeric[],
  p_return_periods integer,
  p_periods_per_year integer
)
returns numeric
language plpgsql
immutable
set search_path = 'pg_catalog'
as $$
declare
  v_length integer := coalesce(array_length(p_prices, 1), 0);
  v_first integer;
  v_index integer;
  v_return numeric;
  v_total numeric := 0;
  v_mean numeric;
  v_squared_total numeric := 0;
begin
  if p_return_periods < 2
    or p_periods_per_year <= 0
    or v_length < p_return_periods + 1 then
    return null;
  end if;

  v_first := v_length - p_return_periods + 1;
  for v_index in v_first..v_length loop
    v_return := (p_prices[v_index] / p_prices[v_index - 1]) - 1;
    v_total := v_total + v_return;
  end loop;
  v_mean := v_total / p_return_periods;

  for v_index in v_first..v_length loop
    v_return := (p_prices[v_index] / p_prices[v_index - 1]) - 1;
    v_squared_total := v_squared_total + power(v_return - v_mean, 2);
  end loop;

  return sqrt(v_squared_total / (p_return_periods - 1))
    * sqrt(p_periods_per_year::numeric);
end;
$$;

create or replace function technical_engine.refresh_v1(
  p_instrument_id uuid default null
)
returns table (
  instruments_processed integer,
  rows_upserted integer,
  complete_rows integer,
  incomplete_rows integer,
  calculation_version text
)
language plpgsql
security invoker
set search_path = 'pg_catalog'
as $$
declare
  v_instrument_id uuid;
  v_interval_code text;
  v_indicator_code text;
  v_required_periods integer;
  v_prices numeric[];
  v_observation_ids bigint[];
  v_observed_times timestamptz[];
  v_length integer;
  v_latest_observation_id bigint;
  v_latest_observed_at timestamptz;
  v_last_invalid_order bigint;
  v_latest_invalid_id bigint;
  v_status text;
  v_reason_code text;
  v_value numeric;
  v_source_from timestamptz;
  v_values jsonb;
  v_extra jsonb;
  v_calculated_at timestamptz := clock_timestamp();
  v_version constant text := 'technical-engine-v1';
  v_instruments_processed integer := 0;
  v_rows_upserted integer := 0;
  v_complete_rows integer := 0;
  v_incomplete_rows integer := 0;
begin
  create temporary table if not exists technical_engine_source_work (
    period_order bigint not null,
    observation_id bigint not null,
    observed_at timestamptz not null,
    adjusted_close numeric,
    is_valid boolean not null
  ) on commit drop;

  for v_instrument_id in
    select distinct mo.instrument_id
    from public.market_observations mo
    join public.data_providers dp on dp.id = mo.provider_id
    where dp.provider_code = 'tiingo'
      and mo.interval_code = '1day'
      and (p_instrument_id is null or mo.instrument_id = p_instrument_id)
    order by mo.instrument_id
  loop
    v_instruments_processed := v_instruments_processed + 1;

    foreach v_interval_code in array array['1day'::text, '1week'::text] loop
      truncate technical_engine_source_work;

      if v_interval_code = '1day' then
        insert into technical_engine_source_work (
          period_order,
          observation_id,
          observed_at,
          adjusted_close,
          is_valid
        )
        with ranked as (
          select
            mo.*,
            row_number() over (
              partition by mo.instrument_id, mo.observed_at
              order by mo.loaded_at desc, mo.id desc
            ) as dedupe_rank
          from public.market_observations mo
          join public.data_providers dp on dp.id = mo.provider_id
          where mo.instrument_id = v_instrument_id
            and dp.provider_code = 'tiingo'
            and mo.interval_code = '1day'
        ), canonical as (
          select
            r.id,
            r.observed_at,
            r.adjusted_close,
            r.open,
            r.high,
            r.low,
            r.close,
            r.volume,
            r.loaded_at
          from ranked r
          where r.dedupe_rank = 1
        )
        select
          row_number() over (order by c.observed_at, c.loaded_at, c.id),
          c.id,
          c.observed_at,
          c.adjusted_close,
          c.adjusted_close is not null
            and c.adjusted_close > 0
            and c.adjusted_close::text not in ('NaN', 'Infinity', '-Infinity')
            and c.open is not null and c.open > 0
            and c.high is not null and c.high > 0
            and c.low is not null and c.low > 0
            and c.close > 0
            and c.high >= c.low
            and c.high >= c.open
            and c.high >= c.close
            and c.low <= c.open
            and c.low <= c.close
            and (c.volume is null or c.volume >= 0)
          as is_valid
        from canonical c
        order by c.observed_at, c.loaded_at, c.id;
      else
        insert into technical_engine_source_work (
          period_order,
          observation_id,
          observed_at,
          adjusted_close,
          is_valid
        )
        with ranked as (
          select
            mo.*,
            row_number() over (
              partition by mo.instrument_id, mo.observed_at
              order by mo.loaded_at desc, mo.id desc
            ) as dedupe_rank
          from public.market_observations mo
          join public.data_providers dp on dp.id = mo.provider_id
          where mo.instrument_id = v_instrument_id
            and dp.provider_code = 'tiingo'
            and mo.interval_code = '1day'
        ), canonical as (
          select
            r.*,
            date_trunc('week', r.observed_at at time zone 'UTC')::date as week_start,
            r.adjusted_close is not null
              and r.adjusted_close > 0
              and r.adjusted_close::text not in ('NaN', 'Infinity', '-Infinity')
              and r.open is not null and r.open > 0
              and r.high is not null and r.high > 0
              and r.low is not null and r.low > 0
              and r.close > 0
              and r.high >= r.low
              and r.high >= r.open
              and r.high >= r.close
              and r.low <= r.open
              and r.low <= r.close
              and (r.volume is null or r.volume >= 0)
            as row_is_valid
          from ranked r
          where r.dedupe_rank = 1
        ), weekly as (
          select
            c.week_start,
            (array_agg(c.id order by c.observed_at desc, c.loaded_at desc, c.id desc))[1]
              as observation_id,
            (array_agg(c.observed_at order by c.observed_at desc, c.loaded_at desc, c.id desc))[1]
              as observed_at,
            (array_agg(c.adjusted_close order by c.observed_at desc, c.loaded_at desc, c.id desc))[1]
              as adjusted_close,
            bool_and(c.row_is_valid) as is_valid
          from canonical c
          where c.week_start + 7 <= (clock_timestamp() at time zone 'UTC')::date
          group by c.week_start
        )
        select
          row_number() over (order by w.week_start),
          w.observation_id,
          w.observed_at,
          w.adjusted_close,
          w.is_valid
        from weekly w
        order by w.week_start;
      end if;

      select s.observation_id, s.observed_at
      into v_latest_observation_id, v_latest_observed_at
      from technical_engine_source_work s
      order by s.period_order desc
      limit 1;

      select max(s.period_order),
        (array_agg(s.observation_id order by s.period_order desc))[1]
      into v_last_invalid_order, v_latest_invalid_id
      from technical_engine_source_work s
      where not s.is_valid;

      select
        array_agg(s.adjusted_close order by s.period_order),
        array_agg(s.observation_id order by s.period_order),
        array_agg(s.observed_at order by s.period_order)
      into v_prices, v_observation_ids, v_observed_times
      from technical_engine_source_work s
      where s.is_valid
        and (v_last_invalid_order is null or s.period_order > v_last_invalid_order);

      v_length := coalesce(array_length(v_prices, 1), 0);

      for v_indicator_code, v_required_periods in
        select x.indicator_code, x.required_periods
        from (values
          ('sma_20'::text, 20),
          ('sma_50'::text, 50),
          ('sma_200'::text, 200),
          ('ema_12'::text, 12),
          ('ema_26'::text, 26),
          ('rsi_14'::text, 15),
          ('macd'::text, 34),
          ('volatility_20'::text, 21)
        ) as x(indicator_code, required_periods)
      loop
        v_value := null;
        v_extra := '{}'::jsonb;
        v_reason_code := null;

        if v_length >= v_required_periods then
          v_status := 'complete';

          case v_indicator_code
            when 'sma_20' then
              v_value := technical_engine.sma(v_prices, 20);
              v_source_from := v_observed_times[v_length - 20 + 1];
            when 'sma_50' then
              v_value := technical_engine.sma(v_prices, 50);
              v_source_from := v_observed_times[v_length - 50 + 1];
            when 'sma_200' then
              v_value := technical_engine.sma(v_prices, 200);
              v_source_from := v_observed_times[v_length - 200 + 1];
            when 'ema_12' then
              v_value := technical_engine.ema(v_prices, 12);
              v_source_from := v_observed_times[1];
            when 'ema_26' then
              v_value := technical_engine.ema(v_prices, 26);
              v_source_from := v_observed_times[1];
            when 'rsi_14' then
              v_value := technical_engine.rsi_wilder(v_prices, 14);
              v_source_from := v_observed_times[1];
            when 'macd' then
              v_extra := technical_engine.macd(v_prices);
              v_value := (v_extra ->> 'macd_line')::numeric;
              v_source_from := v_observed_times[1];
            when 'volatility_20' then
              v_value := technical_engine.annualised_volatility(
                v_prices,
                20,
                case when v_interval_code = '1day' then 252 else 52 end
              );
              v_source_from := v_observed_times[v_length - 21 + 1];
          end case;

          v_complete_rows := v_complete_rows + 1;
        else
          v_source_from := case
            when v_length > 0 then v_observed_times[1]
            else null
          end;

          if v_last_invalid_order is not null then
            v_status := 'data_quality_failure';
            v_reason_code := 'invalid_observation_in_required_history';
          else
            v_status := 'insufficient_history';
            v_reason_code := 'insufficient_history';
          end if;

          v_incomplete_rows := v_incomplete_rows + 1;
        end if;

        v_values := jsonb_build_object(
          'status', v_status,
          'source_provider', 'tiingo',
          'source_interval', '1day',
          'source_observed_from', v_source_from,
          'source_observed_to', v_latest_observed_at,
          'required_periods', v_required_periods,
          'valid_periods', v_length,
          'price_basis', 'adjusted_close',
          'methodology_version', v_version
        ) || v_extra;

        if v_reason_code is not null then
          v_values := v_values || jsonb_build_object(
            'reason_code', v_reason_code,
            'affected_observation_ids', case
              when v_latest_invalid_id is null then '[]'::jsonb
              else jsonb_build_array(v_latest_invalid_id)
            end
          );
        end if;

        insert into public.technical_indicators (
          instrument_id,
          observation_id,
          indicator_code,
          interval_code,
          calculated_at,
          value,
          values,
          calculation_version
        ) values (
          v_instrument_id,
          v_latest_observation_id,
          v_indicator_code,
          v_interval_code,
          v_calculated_at,
          v_value,
          v_values,
          v_version
        )
        on conflict on constraint technical_indicators_instrument_id_observation_id_indicator_key
        do update set
          interval_code = excluded.interval_code,
          calculated_at = excluded.calculated_at,
          value = excluded.value,
          values = excluded.values;

        v_rows_upserted := v_rows_upserted + 1;
      end loop;
    end loop;
  end loop;

  instruments_processed := v_instruments_processed;
  rows_upserted := v_rows_upserted;
  complete_rows := v_complete_rows;
  incomplete_rows := v_incomplete_rows;
  calculation_version := v_version;
  return next;
end;
$$;

revoke all on all functions in schema technical_engine from public, anon, authenticated;
grant execute on function technical_engine.refresh_v1(uuid) to service_role;

comment on schema technical_engine is
  'Private, versioned Technical Engine calculations. Not exposed through the public Data API.';

comment on function technical_engine.refresh_v1(uuid) is
  'Idempotently refreshes technical-engine-v1 daily and completed-week indicator snapshots from canonical Tiingo 1day observations.';
