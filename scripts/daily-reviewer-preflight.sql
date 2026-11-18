-- Read-only shared-controller inventory. Run before freezing a new research cutoff.
-- No personal candidates/notes, publication bundles or mutation functions are read.
-- Row counts are not a session-calendar, provider-entitlement or admission check.
-- assessment_id is latest completed independent scheduled-row inventory, not a
-- score-quality/freshness certificate. Do not fall back around a bad latest row.
with universe as (
  select id from public.instruments where is_active
  union select instrument_id from public.watchlist_items
  union select instrument_id from public.shared_decision_calls c
    where not exists (
      select 1 from public.shared_decision_outcomes o
      where o.call_id=c.id and o.kind in ('EXIT','CANCELLED'))
), scope as (
  select i.*,exists(select 1 from public.watchlist_items w where w.instrument_id=i.id) is_watched,
    exists(select 1 from public.shared_decision_calls c where c.instrument_id=i.id and not exists(
      select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in ('EXIT','CANCELLED'))) has_open_shared_call
  from universe u join public.instruments i on i.id=u.id
)
select i.id instrument_id,i.symbol,i.exchange_code,i.currency_code,i.is_active,
  i.is_watched,i.has_open_shared_call,
  case when i.has_open_shared_call then 0 when i.is_watched then 1 else 2 end research_priority,
  p.provider_code, coalesce(prices.daily_rows,0) daily_rows,
  prices.first_date,prices.last_date,prices.last_loaded_at,
  coalesce(mappings.mapping_count,0) active_mapping_count,
  jobs.status history_status,jobs.requested_end history_requested_end,
  jobs.coverage_end history_coverage_end,
  audit.id history_audit_id,audit.status history_audit_status,
  coalesce(audit.id=jobs.sync_run_id,false) history_audit_job_linked,
  case when p.provider_code='yahoo' then audit.rejected_count end yahoo_rejected_sessions,
  case when p.provider_code='yahoo' then audit.revalidation_state end yahoo_revalidation_state,
  a.assessment_id,a.assessment_date,a.created_at assessment_created_at,
  coalesce(cfg.enabled,false) measurable_config_enabled,
  case when not (i.is_watched or i.has_open_shared_call) then 'not_in_shared_publication_scope'
    when i.is_active is not true then 'inactive_instrument'
    when cfg.enabled then 'measurable_candidate_check_after_research'
    when i.is_watched and i.asset_type='equity' and i.exchange_code in ('ASX','NYSE','NASDAQ')
      then 'research_only_proof_required_before_cutoff'
    else 'publication_path_unsupported' end publication_path,
  case
    when i.is_active is not true then 'inactive_instrument'
    when p.id is null then 'provider_missing'
    when coalesce(prices.daily_rows,0)<20 then 'history_insufficient'
    when p.provider_code='yahoo' and (audit.rejected_count>0 or audit.revalidation_state='unresolved')
      then 'yahoo_quarantined_sessions_require_recovery'
    -- Yahoo's reviewed adapter validates canonical .AX identity in response/audit
    -- lineage; it does not depend on a provider_instruments mapping row.
    when p.provider_code='yahoo' then 'requires_yahoo_identity_session_and_cutoff_validation'
    when coalesce(mappings.mapping_count,0)<>1 then 'mapping_missing_or_ambiguous'
    else 'requires_session_and_cutoff_validation'
  end data_status
from scope i
left join private.shared_decision_config cfg on cfg.instrument_id=i.id
left join public.data_providers p on p.is_active and p.provider_code=
  case when upper(i.exchange_code)='ASX' then 'yahoo' else 'tiingo' end
left join lateral (
  select count(*) daily_rows,min(observed_at::date) first_date,
    max(observed_at::date) last_date,max(loaded_at) last_loaded_at
  from public.market_observations m
  where m.instrument_id=i.id and m.provider_id=p.id and m.interval_code='1day'
    and m.close>0 and m.adjusted_close>0 and trim(m.currency_code)=trim(i.currency_code)
    and m.close::text not in ('NaN','Infinity','-Infinity')
    and m.adjusted_close::text not in ('NaN','Infinity','-Infinity')
    and m.loaded_at<=statement_timestamp() and m.observed_at<statement_timestamp()
) prices on true
left join lateral (
  select count(*) mapping_count from public.provider_instruments pi
  where pi.instrument_id=i.id and pi.provider_id=p.id and pi.is_active
) mappings on true
left join lateral (
  select status,requested_end,coverage_end,sync_run_id from public.market_history_jobs j
  -- Jobs are instrument-scoped; the worker routes by venue, not a provider_id column.
  where j.instrument_id=i.id and j.created_at<=statement_timestamp()
  order by created_at desc,id desc limit 1
) jobs on true
left join lateral (
  select s.id,s.status,
    case when jsonb_typeof(s.metadata->'rejected_bars')='array'
      then jsonb_array_length(s.metadata->'rejected_bars') end rejected_count,
    case when s.metadata->'normalization_revalidation'->>'state' in ('pending','completed','unresolved')
      then s.metadata->'normalization_revalidation'->>'state'
      when s.metadata->'normalization_revalidation'->>'state' is not null then 'UNKNOWN'
      else null end revalidation_state
  from public.sync_runs s
  where s.provider_id=p.id
    and s.metadata->>'instrument_id'=i.id::text
    and s.started_at<=statement_timestamp()
    and (p.provider_code<>'yahoo' and s.id=jobs.sync_run_id
      or p.provider_code='yahoo' and s.metadata->>'function'='asx-yahoo-market-history'
        and s.metadata->>'provider_symbol'=case when right(i.symbol,3)='.AX' then i.symbol else i.symbol||'.AX' end)
  order by s.started_at desc,s.id desc limit 1
) audit on true
left join lateral (
  select a.assessment_id,a.assessment_date,a.created_at
  from public.gpt_market_assessments a join public.gpt_market_runs r on r.run_id=a.run_id
  where a.instrument_id=i.id and r.analysis_mode='scheduled'
    and r.status in ('partial','succeeded') and r.completed_at is not null
    and r.completed_at<=statement_timestamp() and a.created_at<=statement_timestamp()
    and a.technical_engine_input_used=false and a.methodology_version='independent-market-ai-v1'
  order by a.created_at desc,a.assessment_id limit 1
) a on true
order by research_priority,i.id;
