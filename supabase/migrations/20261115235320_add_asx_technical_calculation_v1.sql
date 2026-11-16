-- Separately versioned Yahoo ASX calculations. Existing Tiingo v1 is unchanged.
-- All arithmetic consumes one admitted snapshot, never mutable observations by ID.
create table technical_engine.asx_input_snapshots (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id),
  source_hash text not null,
  cutoff_at timestamptz not null,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(instrument_id,source_hash,cutoff_at)
);
alter table technical_engine.asx_input_snapshots enable row level security;
revoke all on technical_engine.asx_input_snapshots from public,anon,authenticated;
grant select,insert on technical_engine.asx_input_snapshots to service_role;

create or replace function technical_engine.asx_calculate_v1(p_snapshot jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = 'pg_catalog'
as $$
declare
  v_interval text; v_code text; v_required integer; v_n integer;
  v_prices numeric[]; v_ids bigint[]; v_dates timestamptz[];
  v_value numeric; v_extra jsonb; v_indicators jsonb := '[]'; v_input jsonb := '{}';
  v_cutoff timestamptz := (p_snapshot->>'cutoff_at')::timestamptz;
  v_trend_sum numeric; v_trend_available numeric; v_trend numeric;
  v_momentum_sum numeric; v_momentum_available numeric; v_momentum numeric;
  v_volatility_sum numeric; v_volatility_available numeric; v_volatility numeric;
  v_volume numeric; v_volume_periods integer; v_current numeric; v_prior numeric;
  v_overall numeric; v_confidence numeric; v_status text;
begin
  if p_snapshot->>'status' is distinct from 'ready'
    or jsonb_typeof(p_snapshot->'observations') is distinct from 'array'
    or coalesce(jsonb_array_length(p_snapshot->'observations'),0)=0
    or v_cutoff is null or p_snapshot->>'source_hash' is null then
    raise exception 'ASX calculation requires a ready source snapshot';
  end if;
  foreach v_interval in array array['1day','1week'] loop
    with bars as (
      select id,observed_at,adjusted_close,
        date_trunc('week', observed_at at time zone 'UTC')::date as week_start
      from jsonb_to_recordset(p_snapshot->'observations')
        as b(id bigint, observed_at timestamptz, adjusted_close numeric)
    ), weeks as (
      select distinct on (week_start) id,observed_at,adjusted_close
      from bars where week_start+7 <= (v_cutoff at time zone 'Australia/Sydney')::date
      order by week_start,observed_at desc,id desc
    ), periods as (
      select id,observed_at,adjusted_close from bars where v_interval='1day'
      union all
      select id,observed_at,adjusted_close from weeks where v_interval='1week'
    )
    select array_agg(adjusted_close order by observed_at,id),
      array_agg(id order by observed_at,id),array_agg(observed_at order by observed_at,id)
    into v_prices,v_ids,v_dates from periods;
    v_n := coalesce(array_length(v_prices,1),0);
    v_input := v_input || jsonb_build_object(v_interval||'_price',v_prices[v_n],
      v_interval||'_observation_id',v_ids[v_n]);
    for v_code,v_required in select * from (values
      ('sma_20',20),('sma_50',50),('sma_200',200),('ema_12',12),('ema_26',26),
      ('rsi_14',15),('macd',34),('volatility_20',21)) x(code,required)
    loop
      v_value:=null; v_extra:='{}';
      if v_n >= v_required then
        case v_code
          when 'sma_20' then v_value:=technical_engine.sma(v_prices,20);
          when 'sma_50' then v_value:=technical_engine.sma(v_prices,50);
          when 'sma_200' then v_value:=technical_engine.sma(v_prices,200);
          when 'ema_12' then v_value:=technical_engine.ema(v_prices,12);
          when 'ema_26' then v_value:=technical_engine.ema(v_prices,26);
          when 'rsi_14' then v_value:=technical_engine.rsi_wilder(v_prices,14);
          when 'macd' then v_extra:=technical_engine.macd(v_prices); v_value:=(v_extra->>'macd_line')::numeric;
          when 'volatility_20' then v_value:=technical_engine.annualised_volatility(v_prices,20,case when v_interval='1day' then 252 else 52 end);
        end case;
      end if;
      -- Match the existing numeric(24,8) indicator storage boundary before
      -- scoring, while MACD signal metadata retains its native precision.
      v_value:=round(v_value,8);
      v_input:=v_input||jsonb_build_object(v_interval||'_'||v_code,v_value);
      if v_code='macd' then
        v_input:=v_input||jsonb_build_object(v_interval||'_signal',(v_extra->>'signal_line')::numeric);
      end if;
      v_indicators:=v_indicators||jsonb_build_array(jsonb_build_object(
        'observation_id',v_ids[v_n],'indicator_code',v_code,'interval_code',v_interval,'value',v_value,
        'values',jsonb_build_object('status',case when v_value is null then 'insufficient_history' else 'complete' end,
          'reason_code',case when v_value is null then 'insufficient_verified_history' else null end,
          'required_periods',v_required,'valid_periods',v_n,'source_provider','yahoo','source_interval','1day',
          'price_basis','adjusted_close','source_observed_from',v_dates[1],'source_observed_to',v_dates[v_n],
          'source_adjusted_close',v_prices[v_n],'source_hash',p_snapshot->>'source_hash',
          'cutoff_at',v_cutoff,'methodology_version','technical-engine-asx-v1',
          'window_start',p_snapshot->>'window_start','window_end',p_snapshot->>'window_end')||v_extra));
    end loop;
  end loop;

  -- Unchanged v1 weights; unavailable inputs reduce coverage, never become zero prices.
  with signals as (
    select * from (values
      ((v_input->>'1day_price')::numeric > (v_input->>'1day_sma_20')::numeric,10),
      ((v_input->>'1day_price')::numeric > (v_input->>'1day_sma_50')::numeric,15),
      ((v_input->>'1day_price')::numeric > (v_input->>'1day_sma_200')::numeric,20),
      ((v_input->>'1week_price')::numeric > (v_input->>'1week_sma_20')::numeric,10),
      ((v_input->>'1week_price')::numeric > (v_input->>'1week_sma_50')::numeric,10),
      ((v_input->>'1week_price')::numeric > (v_input->>'1week_sma_200')::numeric,15),
      ((v_input->>'1day_ema_12')::numeric > (v_input->>'1day_ema_26')::numeric,10),
      ((v_input->>'1week_ema_12')::numeric > (v_input->>'1week_ema_26')::numeric,10)) s(signal,weight)
  ) select coalesce(sum(weight) filter(where signal),0),coalesce(sum(weight) filter(where signal is not null),0)
    into v_trend_sum,v_trend_available from signals;
  with signals as (
    select * from (values
      (case when v_input->>'1day_rsi_14' is not null then greatest(0,least(100,((v_input->>'1day_rsi_14')::numeric-30)*2.5)) end,25),
      (case when v_input->>'1week_rsi_14' is not null then greatest(0,least(100,((v_input->>'1week_rsi_14')::numeric-30)*2.5)) end,25),
      (case when v_input->>'1day_macd' is null or v_input->>'1day_signal' is null then null when (v_input->>'1day_macd')::numeric>(v_input->>'1day_signal')::numeric then 100 else 0 end,20),
      (case when v_input->>'1week_macd' is null or v_input->>'1week_signal' is null then null when (v_input->>'1week_macd')::numeric>(v_input->>'1week_signal')::numeric then 100 else 0 end,20),
      (case when v_input->>'1day_macd' is null then null when (v_input->>'1day_macd')::numeric>0 then 100 else 0 end,5),
      (case when v_input->>'1week_macd' is null then null when (v_input->>'1week_macd')::numeric>0 then 100 else 0 end,5)) s(signal,weight)
  ) select coalesce(sum(signal*weight/100),0),coalesce(sum(weight) filter(where signal is not null),0)
    into v_momentum_sum,v_momentum_available from signals;
  with signals as (
    select * from (values
      (case when v_input->>'1day_volatility_20' is not null then greatest(0,least(100,100-200*(v_input->>'1day_volatility_20')::numeric)) end,60),
      (case when v_input->>'1week_volatility_20' is not null then greatest(0,least(100,100-200*(v_input->>'1week_volatility_20')::numeric)) end,40)) s(signal,weight)
  ) select coalesce(sum(signal*weight/100),0),coalesce(sum(weight) filter(where signal is not null),0)
    into v_volatility_sum,v_volatility_available from signals;
  v_trend:=round(100*v_trend_sum/nullif(v_trend_available,0),2);
  v_momentum:=round(100*v_momentum_sum/nullif(v_momentum_available,0),2);
  v_volatility:=round(100*v_volatility_sum/nullif(v_volatility_available,0),2);
  with ordered as (
    select volume,row_number() over(order by observed_at desc,id desc) n
    from jsonb_to_recordset(p_snapshot->'observations') as b(id bigint, observed_at timestamptz, volume numeric)
  ) select count(volume) filter(where n<=40),avg(volume) filter(where n<=20),avg(volume) filter(where n between 21 and 40)
    into v_volume_periods,v_current,v_prior from ordered;
  v_volume:=case when v_volume_periods=40 and v_prior>0 then round(greatest(0,least(100,50+50*(v_current/v_prior-1))),2) end;
  v_confidence:=round(40*v_trend_available/100+35*v_momentum_available/100+15*v_volatility_available/100+case when v_volume is null then 0 else 10 end,2);
  select round(sum(score*weight)/nullif(sum(weight) filter(where score is not null),0),2) into v_overall
    from (values(v_trend,40),(v_momentum,35),(v_volatility,15),(v_volume,10)) s(score,weight);
  v_status:=case when v_overall is null then 'insufficient_input' when v_confidence=100 then 'complete' else 'partial' end;
  return jsonb_build_object('indicators',v_indicators,'score',jsonb_build_object(
    'score_date',(select max(observed_at at time zone 'UTC')::date from jsonb_to_recordset(p_snapshot->'observations') b(observed_at timestamptz)),
    'trend_score',v_trend,'momentum_score',v_momentum,'volatility_score',v_volatility,'volume_score',v_volume,
    'overall_score',v_overall,'confidence_score',v_confidence,'score_status',v_status,
    'score_details',jsonb_build_object('status',v_status,'methodology_version','technical-score-asx-v1',
      'technical_calculation_version','technical-engine-asx-v1','source_provider','yahoo',
      'source_hash',p_snapshot->>'source_hash','cutoff_at',v_cutoff,'anchor_audit_id',p_snapshot->>'anchor_audit_id',
      'terminal_audit_id',p_snapshot->>'terminal_audit_id','audit_ids',p_snapshot->'audit_ids',
      'window_start',p_snapshot->>'window_start','window_end',p_snapshot->>'window_end',
      'history_scope','verified rolling one-year Yahoo window; older adjusted-price coherence unknown',
      'component_weights',jsonb_build_object('trend',40,'momentum',35,'volatility',15,'volume',10),
      'availability_weights',jsonb_build_object('trend',v_trend_available,'momentum',v_momentum_available,'volatility',v_volatility_available,'volume',case when v_volume is null then 0 else 100 end),
      'input_snapshot',v_input||jsonb_build_object('current_20_day_average_volume',v_current,'prior_20_day_average_volume',v_prior))));
end;
$$;

-- Both stages consume exactly the same admitted immutable-in-memory snapshot.
create or replace function technical_engine.refresh_asx_v1(p_instrument_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='pg_catalog'
as $$
declare
  v_id uuid; v_snapshot jsonb; v_recheck jsonb; v_result jsonb; v_row jsonb; v_score jsonb;
  v_cutoff timestamptz:=clock_timestamp(); v_batch uuid:=gen_random_uuid(); v_snapshot_id uuid;
  v_processed integer:=0; v_blocked integer:=0; v_indicators integer:=0; v_scores integer:=0;
  v_complete integer:=0; v_partial integer:=0; v_reasons jsonb:='{}'; v_reason text;
begin
  -- Same lock as the existing orchestrator; trusted direct calls cannot overlap it.
  if not pg_try_advisory_xact_lock(hashtextextended('technical_engine.run_v1',0)) then
    raise exception using errcode='55000',message='Technical Engine already running';
  end if;
  for v_id in select id from public.instruments where is_active and exchange_code='ASX'
    and (p_instrument_id is null or id=p_instrument_id) order by id
  loop
    v_processed:=v_processed+1;
    v_snapshot:=technical_engine.asx_source_snapshot_v1(v_id,v_cutoff);
    if v_snapshot->>'status'='ready' then
      v_result:=technical_engine.asx_calculate_v1(v_snapshot);
      v_recheck:=technical_engine.asx_source_snapshot_v1(v_id,clock_timestamp());
      if v_recheck->>'status' is distinct from 'ready' or v_recheck->>'source_hash' is distinct from v_snapshot->>'source_hash'
        or date_trunc('week',v_cutoff at time zone 'Australia/Sydney') <>
          date_trunc('week',clock_timestamp() at time zone 'Australia/Sydney') then
        v_snapshot:=jsonb_build_object('status','blocked','reason','source_changed_during_calculation');
      end if;
    end if;
    if v_snapshot->>'status' is distinct from 'ready' then
      v_blocked:=v_blocked+1; v_reason:=coalesce(v_snapshot->>'reason','source_unavailable');
      v_reasons:=jsonb_set(v_reasons,array[v_reason],to_jsonb(coalesce((v_reasons->>v_reason)::integer,0)+1));
      continue;
    end if;
    insert into technical_engine.asx_input_snapshots(instrument_id,source_hash,cutoff_at,snapshot)
      values(v_id,v_snapshot->>'source_hash',v_cutoff,v_snapshot)
      on conflict(instrument_id,source_hash,cutoff_at) do nothing;
    select id into strict v_snapshot_id from technical_engine.asx_input_snapshots
      where instrument_id=v_id and source_hash=v_snapshot->>'source_hash' and cutoff_at=v_cutoff;
    for v_row in select value from jsonb_array_elements(v_result->'indicators') loop
      -- No completed weekly source means no fabricated observation identity.
      if v_row->>'observation_id' is null then continue; end if;
      insert into public.technical_indicators(instrument_id,observation_id,indicator_code,interval_code,calculated_at,value,values,calculation_version)
      values(v_id,(v_row->>'observation_id')::bigint,v_row->>'indicator_code',v_row->>'interval_code',v_cutoff,(v_row->>'value')::numeric,
        (v_row->'values')||jsonb_build_object('refresh_batch_id',v_batch,'source_snapshot_id',v_snapshot_id),'technical-engine-asx-v1')
      on conflict on constraint technical_indicators_instrument_id_observation_id_indicator_key
      do update set calculated_at=excluded.calculated_at,value=excluded.value,values=excluded.values;
      v_indicators:=v_indicators+1;
    end loop;
    v_score:=v_result->'score';
    insert into public.market_scores(instrument_id,score_date,momentum_score,trend_score,volatility_score,volume_score,overall_score,confidence_score,
      methodology_version,technical_calculation_version,score_status,score_details,calculated_at)
    values(v_id,(v_score->>'score_date')::date,(v_score->>'momentum_score')::numeric,(v_score->>'trend_score')::numeric,
      (v_score->>'volatility_score')::numeric,(v_score->>'volume_score')::numeric,(v_score->>'overall_score')::numeric,
      (v_score->>'confidence_score')::numeric,'technical-score-asx-v1','technical-engine-asx-v1',v_score->>'score_status',
      (v_score->'score_details')||jsonb_build_object('refresh_batch_id',v_batch,'source_snapshot_id',v_snapshot_id),v_cutoff)
    on conflict on constraint market_scores_instrument_date_methodology_key do update set
      momentum_score=excluded.momentum_score,trend_score=excluded.trend_score,volatility_score=excluded.volatility_score,
      volume_score=excluded.volume_score,overall_score=excluded.overall_score,confidence_score=excluded.confidence_score,
      score_status=excluded.score_status,score_details=excluded.score_details,calculated_at=excluded.calculated_at;
    v_scores:=v_scores+1;
    if v_score->>'score_status'='complete' then v_complete:=v_complete+1; else v_partial:=v_partial+1; end if;
  end loop;
  return jsonb_build_object('calculation_version','technical-engine-asx-v1','methodology_version','technical-score-asx-v1',
    'refresh_batch_id',v_batch,'cutoff_at',v_cutoff,'instruments_processed',v_processed,'blocked_instruments',v_blocked,
    'blocker_counts',v_reasons,'indicator_rows_upserted',v_indicators,'score_rows_upserted',v_scores,
    'complete_scores',v_complete,'partial_scores',v_partial);
end;
$$;
revoke all on function technical_engine.asx_calculate_v1(jsonb),technical_engine.refresh_asx_v1(uuid) from public,anon,authenticated;
grant execute on function technical_engine.asx_calculate_v1(jsonb),technical_engine.refresh_asx_v1(uuid) to service_role;

-- Source consistency is separate from market-session freshness/eligibility.
create or replace function technical_engine.asx_score_source_matches_v1(p_score_id bigint)
returns boolean language plpgsql stable security invoker set search_path='pg_catalog'
as $$
declare v_score record; v_source jsonb;
begin
  select instrument_id,score_details into v_score from public.market_scores
    where id=p_score_id and methodology_version='technical-score-asx-v1'
      and technical_calculation_version='technical-engine-asx-v1';
  if not found then return false; end if;
  v_source:=technical_engine.asx_source_snapshot_v1(v_score.instrument_id,statement_timestamp());
  return coalesce(v_source->>'status'='ready'
    and v_source->>'source_hash'=v_score.score_details->>'source_hash'
    and date_trunc('week',(v_score.score_details->>'cutoff_at')::timestamptz at time zone 'Australia/Sydney')=
      date_trunc('week',statement_timestamp() at time zone 'Australia/Sydney'),false);
end;
$$;
revoke all on function technical_engine.asx_score_source_matches_v1(bigint) from public,anon,authenticated;
grant execute on function technical_engine.asx_score_source_matches_v1(bigint) to service_role;
