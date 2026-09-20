create or replace function private.build_shared_evaluation_snapshot_v1(p_call uuid,p_asof timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c record; s record; cal record; stock_cfg record; bench_cfg record; rv jsonb; outcomes jsonb; obs jsonb;
begin
 select sc.*,i.exchange_code instrument_exchange,b.exchange_code benchmark_exchange into c
 from public.shared_decision_calls sc join public.instruments i on i.id=sc.instrument_id
 join public.instruments b on b.id=sc.benchmark_instrument_id where sc.id=p_call;
 if not found then raise exception 'CALL_NOT_FOUND'; end if;
 select * into s from private.shared_decision_evaluation_state where call_id=p_call;
 if not found then raise exception 'EVALUATION_STATE_REQUIRED'; end if;
 select * into stock_cfg from private.shared_market_input_config where instrument_id=c.instrument_id and provider_id=c.provider_id and verified_at<=p_asof order by verified_at desc,id desc limit 1;
 select * into bench_cfg from private.shared_market_input_config where instrument_id=c.benchmark_instrument_id and provider_id=c.provider_id and verified_at<=p_asof order by verified_at desc,id desc limit 1;
 if stock_cfg.id is null or bench_cfg.id is null then raise exception 'VERIFIED_SESSION_ATTRIBUTION_REQUIRED'; end if;
 if stock_cfg.exchange_code<>c.instrument_exchange or bench_cfg.exchange_code<>c.benchmark_exchange or c.instrument_exchange<>c.benchmark_exchange then raise exception 'MATCHING_VERIFIED_EXCHANGE_REQUIRED'; end if;
 select * into cal from private.shared_market_calendars where exchange_code=c.instrument_exchange
 and coverage_start<=c.published_at and coverage_end>p_asof and verified_at<=p_asof and valid_until>p_asof
 order by verified_at desc,id desc limit 1;
 if not found then raise exception 'VERIFIED_CALENDAR_REQUIRED'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.published_at,r.id),'[]') into rv from public.shared_decision_reviews r where r.call_id=p_call;
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('price',o.price::text,'net_return',o.net_return::text,'benchmark_return',o.benchmark_return::text) order by o.recorded_at,o.as_of,o.id),'[]') into outcomes from public.shared_decision_outcomes o where o.call_id=p_call;
 -- UTC_SESSION_DATE is explicitly verified per mapping, never guessed from bars.
 -- Incomplete/bad bars are withheld so the engine records a gap, not a zero return.
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id::text,'instrument_id',o.instrument_id,'provider_id',o.provider_id,'currency',trim(o.currency_code),'interval_code',o.interval_code,
 'session_id',j->>'id','session_close',j->>'closes_at','loaded_at',o.loaded_at,'close',o.close::text,'adjusted_close',o.adjusted_close::text) order by o.observed_at,o.instrument_id,o.id),'[]') into obs
 from public.market_observations o join lateral jsonb_array_elements(cal.sessions) j on
 (o.observed_at at time zone 'UTC')::date=((j->>'opens_at')::timestamptz at time zone cal.time_zone)::date
 where o.instrument_id in(c.instrument_id,c.benchmark_instrument_id) and o.provider_id=c.provider_id
 and o.interval_code='1day' and trim(o.currency_code)=c.currency
 and exists(select 1 from public.data_providers dp where dp.id=o.provider_id and dp.provider_code='tiingo')
 and left(o.raw_payload->>'date',10)=(o.observed_at at time zone 'UTC')::date::text
 and case when coalesce(o.raw_payload->>'adjClose','') ~ '^[0-9]+(\.[0-9]+)?$' then (o.raw_payload->>'adjClose')::numeric=o.adjusted_close else false end
 and case when coalesce(o.raw_payload->>'close','') ~ '^[0-9]+(\.[0-9]+)?$' then (o.raw_payload->>'close')::numeric=o.close else false end
 and o.observed_at=date_trunc('day',o.observed_at at time zone 'UTC') at time zone 'UTC'
 and o.loaded_at<=p_asof and o.loaded_at>=(j->>'closes_at')::timestamptz
 and o.close>0 and o.adjusted_close>0 and o.close::text not in('NaN','Infinity','-Infinity') and o.adjusted_close::text not in('NaN','Infinity','-Infinity');
 return jsonb_build_object('contractVersion',1,'asOf',p_asof,'call',to_jsonb(c)-'instrument_exchange'-'benchmark_exchange'||jsonb_build_object('cost_per_side',c.cost_per_side::text),
 'reviews',rv,'state',jsonb_build_object('call_id',p_call,'version',s.version::text,'evaluated_through',s.evaluated_through),'outcomes',outcomes,
 'instrumentExchange',c.instrument_exchange,'benchmarkExchange',c.benchmark_exchange,'observations',obs,
 'calendar',jsonb_build_object('exchange',cal.exchange_code,'complete',true,'coverageStart',cal.coverage_start,'coverageEnd',cal.coverage_end,'sessions',cal.sessions,
 'provenance',jsonb_build_object('verified',true,'verifiedAt',cal.verified_at,'reference',cal.reference,'revision',cal.revision)),
 'inputVersions',jsonb_build_object('calendar',cal.id,'stock',stock_cfg.id,'benchmark',bench_cfg.id));
end $$;
