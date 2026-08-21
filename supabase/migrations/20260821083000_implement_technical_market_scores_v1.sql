-- TECH-003: reproducible independent Technical Engine market scoring.
--
-- Scores use only technical-engine-v1 indicators plus canonical Tiingo price
-- and volume observations. They do not read GPT Market Assessment, Opportunity
-- Assessment, market convergence or any downstream conclusion.

alter table public.market_scores
  add column confidence_score numeric not null,
  add column methodology_version text not null,
  add column technical_calculation_version text not null,
  add column score_status text not null,
  add column score_details jsonb not null default '{}'::jsonb,
  add column calculated_at timestamptz not null default now();

alter table public.market_scores
  drop constraint market_scores_instrument_id_score_date_key;

alter table public.market_scores
  add constraint market_scores_instrument_date_methodology_key
  unique (instrument_id, score_date, methodology_version);

alter table public.market_scores
  add constraint market_scores_component_range_check
  check (
    (momentum_score is null or momentum_score between 0 and 100)
    and (trend_score is null or trend_score between 0 and 100)
    and (volatility_score is null or volatility_score between 0 and 100)
    and (volume_score is null or volume_score between 0 and 100)
    and (overall_score is null or overall_score between 0 and 100)
    and confidence_score between 0 and 100
  ),
  add constraint market_scores_status_check
  check (score_status in ('complete', 'partial', 'insufficient_input')),
  add constraint market_scores_versions_check
  check (
    btrim(methodology_version) <> ''
    and btrim(technical_calculation_version) <> ''
  );

create or replace function technical_engine.refresh_scores_v1(
  p_instrument_id uuid default null
)
returns table (
  instruments_processed integer,
  rows_upserted integer,
  complete_scores integer,
  partial_scores integer,
  methodology_version text
)
language plpgsql
security invoker
set search_path = 'pg_catalog'
as $$
declare
  v_instrument_id uuid;
  v_daily_observation_id bigint;
  v_weekly_observation_id bigint;
  v_score_date date;
  v_daily_price numeric;
  v_weekly_price numeric;

  v_d_sma20 numeric;
  v_d_sma50 numeric;
  v_d_sma200 numeric;
  v_d_ema12 numeric;
  v_d_ema26 numeric;
  v_d_rsi numeric;
  v_d_macd numeric;
  v_d_signal numeric;
  v_d_volatility numeric;

  v_w_sma20 numeric;
  v_w_sma50 numeric;
  v_w_sma200 numeric;
  v_w_ema12 numeric;
  v_w_ema26 numeric;
  v_w_rsi numeric;
  v_w_macd numeric;
  v_w_signal numeric;
  v_w_volatility numeric;

  v_current_volume numeric;
  v_prior_volume numeric;
  v_volume_periods integer;
  v_volume_ratio numeric;

  v_trend_sum numeric;
  v_trend_available numeric;
  v_momentum_sum numeric;
  v_momentum_available numeric;
  v_volatility_sum numeric;
  v_volatility_available numeric;
  v_signal_score numeric;

  v_trend_score numeric;
  v_momentum_score numeric;
  v_volatility_score numeric;
  v_volume_score numeric;
  v_overall_sum numeric;
  v_overall_weight numeric;
  v_overall_score numeric;
  v_confidence_score numeric;
  v_score_status text;
  v_details jsonb;
  v_calculated_at timestamptz;

  v_instruments_processed integer := 0;
  v_rows_upserted integer := 0;
  v_complete_scores integer := 0;
  v_partial_scores integer := 0;

  v_methodology constant text := 'technical-score-v1';
  v_calculation_version constant text := 'technical-engine-v1';
begin
  for v_instrument_id in
    select distinct ti.instrument_id
    from public.technical_indicators ti
    where ti.calculation_version = v_calculation_version
      and (p_instrument_id is null or ti.instrument_id = p_instrument_id)
    order by ti.instrument_id
  loop
    v_instruments_processed := v_instruments_processed + 1;
    v_calculated_at := clock_timestamp();

    v_daily_observation_id := null;
    v_weekly_observation_id := null;
    v_score_date := null;
    v_daily_price := null;
    v_weekly_price := null;

    v_d_sma20 := null;
    v_d_sma50 := null;
    v_d_sma200 := null;
    v_d_ema12 := null;
    v_d_ema26 := null;
    v_d_rsi := null;
    v_d_macd := null;
    v_d_signal := null;
    v_d_volatility := null;
    v_w_sma20 := null;
    v_w_sma50 := null;
    v_w_sma200 := null;
    v_w_ema12 := null;
    v_w_ema26 := null;
    v_w_rsi := null;
    v_w_macd := null;
    v_w_signal := null;
    v_w_volatility := null;

    with latest as (
      select x.*
      from (
        select
          ti.*,
          row_number() over (
            partition by ti.interval_code, ti.indicator_code
            order by ti.calculated_at desc, ti.observation_id desc, ti.id desc
          ) as latest_rank
        from public.technical_indicators ti
        where ti.instrument_id = v_instrument_id
          and ti.calculation_version = v_calculation_version
      ) x
      where x.latest_rank = 1
    )
    select
      max(l.observation_id) filter (
        where l.interval_code = '1day' and l.indicator_code = 'sma_20'
      ),
      max(l.observation_id) filter (
        where l.interval_code = '1week' and l.indicator_code = 'sma_20'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'sma_20'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'sma_50'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'sma_200'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'ema_12'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'ema_26'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'rsi_14'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'macd'
      ),
      max((l.values ->> 'signal_line')::numeric) filter (
        where l.interval_code = '1day' and l.indicator_code = 'macd'
      ),
      max(l.value) filter (
        where l.interval_code = '1day' and l.indicator_code = 'volatility_20'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'sma_20'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'sma_50'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'sma_200'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'ema_12'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'ema_26'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'rsi_14'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'macd'
      ),
      max((l.values ->> 'signal_line')::numeric) filter (
        where l.interval_code = '1week' and l.indicator_code = 'macd'
      ),
      max(l.value) filter (
        where l.interval_code = '1week' and l.indicator_code = 'volatility_20'
      )
    into
      v_daily_observation_id,
      v_weekly_observation_id,
      v_d_sma20,
      v_d_sma50,
      v_d_sma200,
      v_d_ema12,
      v_d_ema26,
      v_d_rsi,
      v_d_macd,
      v_d_signal,
      v_d_volatility,
      v_w_sma20,
      v_w_sma50,
      v_w_sma200,
      v_w_ema12,
      v_w_ema26,
      v_w_rsi,
      v_w_macd,
      v_w_signal,
      v_w_volatility
    from latest l;

    select mo.adjusted_close, mo.observed_at::date
    into v_daily_price, v_score_date
    from public.market_observations mo
    where mo.id = v_daily_observation_id;

    select mo.adjusted_close
    into v_weekly_price
    from public.market_observations mo
    where mo.id = v_weekly_observation_id;

    if v_score_date is null or v_daily_price is null or v_daily_price <= 0 then
      continue;
    end if;

    v_trend_sum := 0;
    v_trend_available := 0;

    if v_d_sma20 is not null then
      v_trend_available := v_trend_available + 10;
      if v_daily_price > v_d_sma20 then v_trend_sum := v_trend_sum + 10; end if;
    end if;
    if v_d_sma50 is not null then
      v_trend_available := v_trend_available + 15;
      if v_daily_price > v_d_sma50 then v_trend_sum := v_trend_sum + 15; end if;
    end if;
    if v_d_sma200 is not null then
      v_trend_available := v_trend_available + 20;
      if v_daily_price > v_d_sma200 then v_trend_sum := v_trend_sum + 20; end if;
    end if;
    if v_weekly_price is not null and v_w_sma20 is not null then
      v_trend_available := v_trend_available + 10;
      if v_weekly_price > v_w_sma20 then v_trend_sum := v_trend_sum + 10; end if;
    end if;
    if v_weekly_price is not null and v_w_sma50 is not null then
      v_trend_available := v_trend_available + 10;
      if v_weekly_price > v_w_sma50 then v_trend_sum := v_trend_sum + 10; end if;
    end if;
    if v_weekly_price is not null and v_w_sma200 is not null then
      v_trend_available := v_trend_available + 15;
      if v_weekly_price > v_w_sma200 then v_trend_sum := v_trend_sum + 15; end if;
    end if;
    if v_d_ema12 is not null and v_d_ema26 is not null then
      v_trend_available := v_trend_available + 10;
      if v_d_ema12 > v_d_ema26 then v_trend_sum := v_trend_sum + 10; end if;
    end if;
    if v_w_ema12 is not null and v_w_ema26 is not null then
      v_trend_available := v_trend_available + 10;
      if v_w_ema12 > v_w_ema26 then v_trend_sum := v_trend_sum + 10; end if;
    end if;

    v_trend_score := case
      when v_trend_available > 0
        then round(100 * v_trend_sum / v_trend_available, 2)
      else null
    end;

    v_momentum_sum := 0;
    v_momentum_available := 0;

    if v_d_rsi is not null then
      v_signal_score := greatest(0::numeric, least(100::numeric, (v_d_rsi - 30) * 2.5));
      v_momentum_sum := v_momentum_sum + (25 * v_signal_score / 100);
      v_momentum_available := v_momentum_available + 25;
    end if;
    if v_w_rsi is not null then
      v_signal_score := greatest(0::numeric, least(100::numeric, (v_w_rsi - 30) * 2.5));
      v_momentum_sum := v_momentum_sum + (25 * v_signal_score / 100);
      v_momentum_available := v_momentum_available + 25;
    end if;
    if v_d_macd is not null and v_d_signal is not null then
      v_momentum_available := v_momentum_available + 20;
      if v_d_macd > v_d_signal then v_momentum_sum := v_momentum_sum + 20; end if;
    end if;
    if v_w_macd is not null and v_w_signal is not null then
      v_momentum_available := v_momentum_available + 20;
      if v_w_macd > v_w_signal then v_momentum_sum := v_momentum_sum + 20; end if;
    end if;
    if v_d_macd is not null then
      v_momentum_available := v_momentum_available + 5;
      if v_d_macd > 0 then v_momentum_sum := v_momentum_sum + 5; end if;
    end if;
    if v_w_macd is not null then
      v_momentum_available := v_momentum_available + 5;
      if v_w_macd > 0 then v_momentum_sum := v_momentum_sum + 5; end if;
    end if;

    v_momentum_score := case
      when v_momentum_available > 0
        then round(100 * v_momentum_sum / v_momentum_available, 2)
      else null
    end;

    v_volatility_sum := 0;
    v_volatility_available := 0;

    if v_d_volatility is not null then
      v_signal_score := greatest(0::numeric, least(100::numeric, 100 - (200 * v_d_volatility)));
      v_volatility_sum := v_volatility_sum + (60 * v_signal_score / 100);
      v_volatility_available := v_volatility_available + 60;
    end if;
    if v_w_volatility is not null then
      v_signal_score := greatest(0::numeric, least(100::numeric, 100 - (200 * v_w_volatility)));
      v_volatility_sum := v_volatility_sum + (40 * v_signal_score / 100);
      v_volatility_available := v_volatility_available + 40;
    end if;

    v_volatility_score := case
      when v_volatility_available > 0
        then round(100 * v_volatility_sum / v_volatility_available, 2)
      else null
    end;

    v_current_volume := null;
    v_prior_volume := null;
    v_volume_periods := 0;
    v_volume_ratio := null;
    v_volume_score := null;

    with ranked as (
      select
        mo.volume,
        mo.observed_at,
        mo.loaded_at,
        mo.id,
        row_number() over (
          partition by mo.observed_at
          order by mo.loaded_at desc, mo.id desc
        ) as dedupe_rank
      from public.market_observations mo
      join public.data_providers dp on dp.id = mo.provider_id
      where mo.instrument_id = v_instrument_id
        and dp.provider_code = 'tiingo'
        and mo.interval_code = '1day'
        and mo.observed_at::date <= v_score_date
    ),
    ordered as (
      select
        case when r.volume >= 0 then r.volume else null end as valid_volume,
        row_number() over (
          order by r.observed_at desc, r.loaded_at desc, r.id desc
        ) as recent_order
      from ranked r
      where r.dedupe_rank = 1
    )
    select
      avg(o.valid_volume) filter (where o.recent_order between 1 and 20),
      avg(o.valid_volume) filter (where o.recent_order between 21 and 40),
      count(o.valid_volume) filter (where o.recent_order <= 40)
    into v_current_volume, v_prior_volume, v_volume_periods
    from ordered o;

    if v_volume_periods = 40 and v_prior_volume > 0 then
      v_volume_ratio := v_current_volume / v_prior_volume;
      v_volume_score := round(
        greatest(0::numeric, least(100::numeric, 50 + (50 * (v_volume_ratio - 1)))),
        2
      );
    end if;

    v_confidence_score := round(
      (40 * v_trend_available / 100)
      + (35 * v_momentum_available / 100)
      + (15 * v_volatility_available / 100)
      + case when v_volume_score is not null then 10 else 0 end,
      2
    );

    v_overall_sum := 0;
    v_overall_weight := 0;
    if v_trend_score is not null then
      v_overall_sum := v_overall_sum + (40 * v_trend_score);
      v_overall_weight := v_overall_weight + 40;
    end if;
    if v_momentum_score is not null then
      v_overall_sum := v_overall_sum + (35 * v_momentum_score);
      v_overall_weight := v_overall_weight + 35;
    end if;
    if v_volatility_score is not null then
      v_overall_sum := v_overall_sum + (15 * v_volatility_score);
      v_overall_weight := v_overall_weight + 15;
    end if;
    if v_volume_score is not null then
      v_overall_sum := v_overall_sum + (10 * v_volume_score);
      v_overall_weight := v_overall_weight + 10;
    end if;

    v_overall_score := case
      when v_overall_weight > 0
        then round(v_overall_sum / v_overall_weight, 2)
      else null
    end;

    v_score_status := case
      when v_overall_score is null then 'insufficient_input'
      when v_confidence_score = 100 then 'complete'
      else 'partial'
    end;

    v_details := jsonb_build_object(
      'status', v_score_status,
      'methodology_version', v_methodology,
      'technical_calculation_version', v_calculation_version,
      'source_observation_ids', jsonb_build_object(
        'daily', v_daily_observation_id,
        'weekly', v_weekly_observation_id
      ),
      'component_weights', jsonb_build_object(
        'trend', 40,
        'momentum', 35,
        'volatility', 15,
        'volume', 10
      ),
      'availability_weights', jsonb_build_object(
        'trend', v_trend_available,
        'momentum', v_momentum_available,
        'volatility', v_volatility_available,
        'volume', case when v_volume_score is not null then 100 else 0 end
      ),
      'input_snapshot', jsonb_build_object(
        'daily_price', v_daily_price,
        'weekly_price', v_weekly_price,
        'daily_rsi_14', v_d_rsi,
        'weekly_rsi_14', v_w_rsi,
        'daily_macd_line', v_d_macd,
        'daily_macd_signal', v_d_signal,
        'weekly_macd_line', v_w_macd,
        'weekly_macd_signal', v_w_signal,
        'daily_annualised_volatility', v_d_volatility,
        'weekly_annualised_volatility', v_w_volatility,
        'current_20_day_average_volume', v_current_volume,
        'prior_20_day_average_volume', v_prior_volume,
        'volume_ratio', v_volume_ratio
      )
    );

    insert into public.market_scores (
      instrument_id,
      score_date,
      momentum_score,
      trend_score,
      volatility_score,
      volume_score,
      overall_score,
      confidence_score,
      methodology_version,
      technical_calculation_version,
      score_status,
      score_details,
      calculated_at
    ) values (
      v_instrument_id,
      v_score_date,
      v_momentum_score,
      v_trend_score,
      v_volatility_score,
      v_volume_score,
      v_overall_score,
      v_confidence_score,
      v_methodology,
      v_calculation_version,
      v_score_status,
      v_details,
      v_calculated_at
    )
    on conflict on constraint market_scores_instrument_date_methodology_key
    do update set
      momentum_score = excluded.momentum_score,
      trend_score = excluded.trend_score,
      volatility_score = excluded.volatility_score,
      volume_score = excluded.volume_score,
      overall_score = excluded.overall_score,
      confidence_score = excluded.confidence_score,
      technical_calculation_version = excluded.technical_calculation_version,
      score_status = excluded.score_status,
      score_details = excluded.score_details,
      calculated_at = excluded.calculated_at;

    v_rows_upserted := v_rows_upserted + 1;
    if v_score_status = 'complete' then
      v_complete_scores := v_complete_scores + 1;
    else
      v_partial_scores := v_partial_scores + 1;
    end if;
  end loop;

  instruments_processed := v_instruments_processed;
  rows_upserted := v_rows_upserted;
  complete_scores := v_complete_scores;
  partial_scores := v_partial_scores;
  methodology_version := v_methodology;
  return next;
end;
$$;

revoke all on function technical_engine.refresh_scores_v1(uuid)
  from public, anon, authenticated;
grant execute on function technical_engine.refresh_scores_v1(uuid)
  to service_role;

comment on function technical_engine.refresh_scores_v1(uuid) is
  'Idempotently writes technical-score-v1 component, overall and confidence scores using only technical-engine-v1 indicators and canonical Tiingo observations.';

comment on table public.market_scores is
  'Independent, versioned Technical Engine scores. GPT, Opportunity Assessment and convergence outputs are not inputs.';

comment on column public.market_scores.confidence_score is
  '0-100 input-coverage confidence derived from available component signal weights.';
comment on column public.market_scores.methodology_version is
  'Technical scoring methodology identity; technical-score-v1 for TECH-003.';
comment on column public.market_scores.technical_calculation_version is
  'Indicator methodology consumed by the score, currently technical-engine-v1.';
comment on column public.market_scores.score_status is
  'complete when all intended inputs are available, partial when scored with explicit missing inputs, or insufficient_input.';
comment on column public.market_scores.score_details is
  'Reproducibility metadata: source observations, component/availability weights and the numeric input snapshot.';
