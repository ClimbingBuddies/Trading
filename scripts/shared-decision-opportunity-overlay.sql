-- Upgrade existing production publication input; frozen evidence and calls remain unchanged.
-- Optional downstream context: Opportunity remains independent from the Market
-- Assessment. Only rows already completed at the frozen Market cutoff enter the
-- private, hash-pinned publication bundle.
create or replace function private.shared_opportunity_context_v1(p_instrument uuid,p_cutoff timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare mapped_count integer; assessed_count integer; themes jsonb; context_status text;
begin
 if p_instrument is null or p_cutoff is null or p_cutoff>clock_timestamp()
 then raise exception 'INVALID_OPPORTUNITY_CONTEXT_CUTOFF'; end if;
 with mapped as (
  select m.theme_id,m.exposure_type,m.exposure_score,m.rationale,m.created_at mapping_created_at,
   m.updated_at mapping_updated_at,t.theme_name
  from public.opportunity_theme_instruments m
  join public.opportunity_themes t on t.id=m.theme_id
  where m.instrument_id=p_instrument and m.is_active
   and m.created_at<=p_cutoff and m.updated_at<=p_cutoff
   and t.created_at<=p_cutoff and t.updated_at<=p_cutoff
 ), available as (
  select m.*,a.id assessment_id,a.assessment_date,a.opportunity_score,
   a.opportunity_confidence,a.opportunity_level,a.commercial_readiness,a.time_horizon,
   a.assessment_run_id,r.completed_at run_completed_at
  from mapped m left join lateral (
   select a.* from public.opportunity_assessments a
   join public.opportunity_assessment_runs r on r.run_id=a.assessment_run_id
   where a.theme_id=m.theme_id and a.methodology_version='opportunity-convergence-v1'
    and r.assessment_date=a.assessment_date and r.status in ('succeeded','partial')
    and r.completed_at is not null and r.completed_at<=p_cutoff
    and a.created_at<=p_cutoff and a.updated_at<=p_cutoff
    and a.assessment_date between (p_cutoff at time zone 'Australia/Perth')::date-6
      and (p_cutoff at time zone 'Australia/Perth')::date
   order by a.assessment_date desc,a.updated_at desc,a.id desc limit 1
  ) a on true
  left join public.opportunity_assessment_runs r on r.run_id=a.assessment_run_id
 )
 select count(*)::integer,count(assessment_id)::integer,
  coalesce(jsonb_agg(jsonb_build_object(
   'theme_id',theme_id,'theme_name',theme_name,'exposure_type',exposure_type,
   'exposure_score',exposure_score,'exposure_rationale',rationale,
   'mapping_created_at',mapping_created_at,'mapping_updated_at',mapping_updated_at,
   'assessment_id',assessment_id,'assessment_date',assessment_date,
   'opportunity_score',opportunity_score,'opportunity_confidence',opportunity_confidence,
   'opportunity_level',opportunity_level,'commercial_readiness',commercial_readiness,
   'time_horizon',time_horizon,'assessment_run_id',assessment_run_id,
   'run_completed_at',run_completed_at) order by theme_name,theme_id),'[]'::jsonb)
 into mapped_count,assessed_count,themes from available;
 context_status:=case when mapped_count=0 then 'NO_MAPPED_THEME'
  when assessed_count=0 then 'NO_AS_OF_ASSESSMENT'
  when assessed_count<mapped_count then 'PARTIAL' else 'AVAILABLE' end;
 return jsonb_build_object('version','opportunity-context-v1','status',context_status,'as_of_cutoff',p_cutoff,
  'lookback_days',7,'mapped_count',mapped_count,'assessed_count',assessed_count,
  'themes',themes);
end $$;

create or replace function private.shared_decision_input_v1(p_assessment uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record; cfg record; prices jsonb; benchmarks jsonb; history jsonb;
begin
 select ass.*,r.analysis_cutoff_time,r.completed_at,trim(i.currency_code) currency
 into a from public.gpt_market_assessments ass
 join public.gpt_market_runs r on r.run_id=ass.run_id
 join public.instruments i on i.id=ass.instrument_id
 where ass.assessment_id=p_assessment and not ass.technical_engine_input_used
 and i.is_active and i.asset_type in ('equity','etf') and i.currency_code is not null
 and r.analysis_mode='scheduled' and r.status in ('succeeded','partial')
 and r.completed_at<=clock_timestamp() and ass.created_at<=clock_timestamp()
 and r.analysis_cutoff_time between clock_timestamp()-interval '24 hours' and r.completed_at;
 if a.assessment_id is null then raise exception 'FRESH_PUBLISHED_ASSESSMENT_REQUIRED'; end if;
 if not exists(select 1 from public.watchlist_items where instrument_id=a.instrument_id)
 and not exists(select 1 from public.shared_decision_calls c where c.instrument_id=a.instrument_id
  and not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in ('EXIT','CANCELLED')))
 then raise exception 'WATCHED_OR_OPEN_INSTRUMENT_REQUIRED'; end if;
 if exists(select 1 from public.gpt_market_assessments n join public.gpt_market_runs r on r.run_id=n.run_id
 where n.instrument_id=a.instrument_id and n.created_at>a.created_at and not n.technical_engine_input_used
 and r.analysis_mode='scheduled' and r.status in ('succeeded','partial') and r.completed_at is not null)
 then raise exception 'NEWER_ASSESSMENT_AVAILABLE'; end if;
 select * into cfg from private.shared_decision_config where instrument_id=a.instrument_id and enabled;
 if cfg.instrument_id is null then raise exception 'VERIFIED_PROVIDER_BENCHMARK_CONFIGURATION_REQUIRED'; end if;
 if not exists(select 1 from public.data_providers where id=cfg.provider_id and is_active)
 or not exists(select 1 from public.instruments where id=cfg.benchmark_instrument_id and is_active and trim(currency_code)=a.currency)
 or (select count(*) from public.provider_instruments where instrument_id=a.instrument_id and provider_id=cfg.provider_id and is_active)<>1
 or (select count(*) from public.provider_instruments where instrument_id=cfg.benchmark_instrument_id and provider_id=cfg.provider_id and is_active)<>1
 then raise exception 'CANONICAL_MAPPING_OR_CURRENCY_INVALID'; end if;
 select jsonb_agg(to_jsonb(x) order by x.observed_at,x.id) into prices from (
 select id,instrument_id,provider_id,observed_at,loaded_at,currency_code,close,adjusted_close from public.market_observations
 where instrument_id=a.instrument_id and provider_id=cfg.provider_id and interval_code='1day'
 and trim(currency_code)=a.currency and close>0 and adjusted_close>0 and close::text not in ('NaN','Infinity','-Infinity')
 and adjusted_close::text not in ('NaN','Infinity','-Infinity') and loaded_at<=a.analysis_cutoff_time
 and observed_at<date_trunc('day',a.analysis_cutoff_time at time zone 'UTC') at time zone 'UTC'
 order by observed_at desc,id limit 60) x;
 select jsonb_agg(to_jsonb(x) order by x.observed_at,x.id) into benchmarks from (
 select id,instrument_id,provider_id,observed_at,loaded_at,currency_code,close,adjusted_close from public.market_observations
 where instrument_id=cfg.benchmark_instrument_id and provider_id=cfg.provider_id and interval_code='1day'
 and trim(currency_code)=a.currency and close>0 and adjusted_close>0 and close::text not in ('NaN','Infinity','-Infinity')
 and adjusted_close::text not in ('NaN','Infinity','-Infinity') and loaded_at<=a.analysis_cutoff_time
 and observed_at<date_trunc('day',a.analysis_cutoff_time at time zone 'UTC') at time zone 'UTC'
 order by observed_at desc,id limit 60) x;
 if coalesce(jsonb_array_length(prices),0)<20 or coalesce(jsonb_array_length(benchmarks),0)<20
 then raise exception 'TWENTY_DAILY_OBSERVATIONS_REQUIRED'; end if;
 if (prices->-1->>'observed_at')::timestamptz<clock_timestamp()-interval '4 days'
 or (benchmarks->-1->>'observed_at')::timestamptz<clock_timestamp()-interval '4 days'
 then raise exception 'DAILY_EVIDENCE_STALE'; end if;
 if exists(select 1 from jsonb_array_elements(prices) x group by x->>'observed_at' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(benchmarks) x group by x->>'observed_at' having count(*)>1)
 then raise exception 'DUPLICATE_DAILY_EVIDENCE'; end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.published_at,e.id),'[]'::jsonb) into history from (
 select id,assessment_id,published_at,source_cutoff,action,thesis,risks from public.shared_decision_calls where instrument_id=a.instrument_id
 union all select r.id,r.assessment_id,r.published_at,r.source_cutoff,r.action,r.thesis,r.risks from public.shared_decision_reviews r
 join public.shared_decision_calls c on c.id=r.call_id where c.instrument_id=a.instrument_id) e;
 return jsonb_build_object('assessment',to_jsonb(a),'configuration',to_jsonb(cfg),
 'prices',prices,'benchmark_prices',benchmarks,'history',history,
 'opportunity_context',private.shared_opportunity_context_v1(a.instrument_id,a.analysis_cutoff_time),
 'methodology','shared-decision-lab-v1');
end $$;

revoke all on function private.shared_opportunity_context_v1(uuid,timestamptz) from public,anon,authenticated,service_role;
