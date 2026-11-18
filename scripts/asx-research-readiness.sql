-- Generated from reviewed ASX date-only manifest and trust; do not hand-edit output.
-- Raw-price/session readiness ONLY. No research, publication, provider-rights or fill permission.
-- One current statement cutoff; current Sydney date excluded at every time of day.
with calendar_dates(session_date,day_status) as (values
    ('2026-10-15'::date,'OPEN'),
    ('2026-10-16'::date,'OPEN'),
    ('2026-10-17'::date,'CLOSED'),
    ('2026-10-18'::date,'CLOSED'),
    ('2026-10-19'::date,'OPEN'),
    ('2026-10-20'::date,'OPEN'),
    ('2026-10-21'::date,'OPEN'),
    ('2026-10-22'::date,'OPEN'),
    ('2026-10-23'::date,'OPEN'),
    ('2026-10-24'::date,'CLOSED'),
    ('2026-10-25'::date,'CLOSED'),
    ('2026-10-26'::date,'OPEN'),
    ('2026-10-27'::date,'OPEN'),
    ('2026-10-28'::date,'OPEN'),
    ('2026-10-29'::date,'OPEN'),
    ('2026-10-30'::date,'OPEN'),
    ('2026-10-31'::date,'CLOSED'),
    ('2026-11-01'::date,'CLOSED'),
    ('2026-11-02'::date,'OPEN'),
    ('2026-11-03'::date,'OPEN'),
    ('2026-11-04'::date,'OPEN'),
    ('2026-11-05'::date,'OPEN'),
    ('2026-11-06'::date,'OPEN'),
    ('2026-11-07'::date,'CLOSED'),
    ('2026-11-08'::date,'CLOSED'),
    ('2026-11-09'::date,'OPEN'),
    ('2026-11-10'::date,'OPEN'),
    ('2026-11-11'::date,'OPEN'),
    ('2026-11-12'::date,'OPEN'),
    ('2026-11-13'::date,'OPEN'),
    ('2026-11-14'::date,'CLOSED'),
    ('2026-11-15'::date,'CLOSED'),
    ('2026-11-16'::date,'OPEN'),
    ('2026-11-17'::date,'OPEN'),
    ('2026-11-18'::date,'OPEN'),
    ('2026-11-19'::date,'OPEN'),
    ('2026-11-20'::date,'OPEN'),
    ('2026-11-21'::date,'CLOSED'),
    ('2026-11-22'::date,'CLOSED'),
    ('2026-11-23'::date,'OPEN'),
    ('2026-11-24'::date,'OPEN'),
    ('2026-11-25'::date,'OPEN'),
    ('2026-11-26'::date,'OPEN'),
    ('2026-11-27'::date,'OPEN'),
    ('2026-11-28'::date,'CLOSED'),
    ('2026-11-29'::date,'CLOSED'),
    ('2026-11-30'::date,'OPEN'),
    ('2026-12-01'::date,'OPEN'),
    ('2026-12-02'::date,'OPEN'),
    ('2026-12-03'::date,'OPEN'),
    ('2026-12-04'::date,'OPEN'),
    ('2026-12-05'::date,'CLOSED'),
    ('2026-12-06'::date,'CLOSED'),
    ('2026-12-07'::date,'OPEN'),
    ('2026-12-08'::date,'OPEN'),
    ('2026-12-09'::date,'OPEN'),
    ('2026-12-10'::date,'OPEN'),
    ('2026-12-11'::date,'OPEN'),
    ('2026-12-12'::date,'CLOSED'),
    ('2026-12-13'::date,'CLOSED'),
    ('2026-12-14'::date,'OPEN'),
    ('2026-12-15'::date,'OPEN'),
    ('2026-12-16'::date,'OPEN'),
    ('2026-12-17'::date,'OPEN'),
    ('2026-12-18'::date,'OPEN'),
    ('2026-12-19'::date,'CLOSED'),
    ('2026-12-20'::date,'CLOSED')
), context as materialized (
  select statement_timestamp() cutoff_at,
    (statement_timestamp() at time zone 'Australia/Sydney')::date sydney_today,
    'asx-research-2026-20261118'::text calendar_revision,'0880fe1d9a18236844eb6bf788d2dfb8e1f54ef316975d26b6478710194aeb1a'::text calendar_hash,
    '2026-11-18T02:34:21Z'::timestamptz verified_at,'2026-11-25T02:34:21Z'::timestamptz valid_until,
    '2026-10-15'::date coverage_start,'2026-12-20'::date coverage_end
), calendar as materialized (
  select c.*, (select max(session_date) from calendar_dates
      where day_status='OPEN' and session_date<c.sydney_today) target_session,
    case when cutoff_at<verified_at or cutoff_at>=valid_until then 'CALENDAR_REVIEW_EXPIRED_OR_NOT_YET_VALID'
      when sydney_today-1 not between coverage_start and coverage_end then 'CALENDAR_COVERAGE_MISSING'
      else 'READY' end calendar_status
  from context c
), scope as (
  select i.id,i.symbol,i.is_active,i.asset_type,i.currency_code,
    exists(select 1 from public.watchlist_items w where w.instrument_id=i.id) is_watched,
    exists(select 1 from public.shared_decision_calls d where d.instrument_id=i.id and not exists(
      select 1 from public.shared_decision_outcomes o where o.call_id=d.id and o.kind in ('EXIT','CANCELLED'))) has_open_shared_call
  from public.instruments i where i.exchange_code='ASX' and (
    i.is_active or exists(select 1 from public.watchlist_items w where w.instrument_id=i.id)
    or exists(select 1 from public.shared_decision_calls d where d.instrument_id=i.id and not exists(
      select 1 from public.shared_decision_outcomes o where o.call_id=d.id and o.kind in ('EXIT','CANCELLED'))))
), sources as materialized (
  select i.*,c.*,
    case when i.is_active and i.asset_type='equity' and btrim(i.currency_code)='AUD'
      and c.calendar_status='READY' and c.target_session is not null
      then technical_engine.asx_source_snapshot_v1(i.id,c.cutoff_at) end source
  from scope i cross join calendar c
), checked as (
  select s.*, bars.*
  from sources s left join lateral (
    select count(distinct d.session_date) filter(where d.day_status='OPEN') admitted_open_dates,
      max(d.session_date) filter(where d.day_status='OPEN') latest_admitted_session,
      coalesce(bool_or(d.session_date=s.target_session and d.day_status='OPEN'),false) target_present,
      count(*) filter(where d.day_status='CLOSED') closed_date_bars,
      count(*) filter(where b.loaded_at>s.cutoff_at or b.loaded_at is null
        or (b.observed_at at time zone 'UTC')::date>=s.sydney_today) invalid_cutoff_bars
    from jsonb_to_recordset(case when s.source->>'status'='ready' then s.source->'observations' else '[]'::jsonb end)
      b(observed_at timestamptz,loaded_at timestamptz)
    left join calendar_dates d on d.session_date=(b.observed_at at time zone 'UTC')::date
  ) bars on true
)
select id instrument_id,symbol,'yahoo'::text provider,is_active,is_watched,has_open_shared_call,
  cutoff_at,sydney_today,calendar_revision,calendar_hash,valid_until calendar_valid_until,
  case when calendar_status='READY' then target_session end target_session,
  source->>'status' source_status,source->>'reason' source_reason,
  source->>'anchor_audit_id' anchor_audit_id,source->>'terminal_audit_id' terminal_audit_id,
  source->>'source_hash' source_hash,latest_admitted_session,admitted_open_dates,target_present,
  closed_date_bars,invalid_cutoff_bars,
  case when is_active is not true then 'INACTIVE_INSTRUMENT'
    when asset_type is distinct from 'equity' or btrim(currency_code) is distinct from 'AUD' then 'UNSUPPORTED_IDENTITY'
    when calendar_status<>'READY' then calendar_status
    when target_session is null then 'CALENDAR_TARGET_MISSING'
    when source->>'status' is distinct from 'ready' then 'SOURCE_BLOCKED'
    when invalid_cutoff_bars>0 then 'SOURCE_CUTOFF_CONFLICT'
    when closed_date_bars>0 then 'SOURCE_ON_CLOSED_DATE'
    when not target_present then 'TARGET_SESSION_MISSING'
    when admitted_open_dates<20 then 'INSUFFICIENT_REVIEWED_OPEN_OBSERVATIONS'
    else 'RAW_PRICE_SESSION_READY' end readiness
from checked order by has_open_shared_call desc,is_watched desc,id;
