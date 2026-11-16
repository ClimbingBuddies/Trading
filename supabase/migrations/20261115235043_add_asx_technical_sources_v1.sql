-- Private, read-only source adapter. No provider requests or observation writes.
create schema if not exists technical_engine;
revoke all on schema technical_engine from public, anon, authenticated;
grant usage on schema technical_engine to service_role;

create or replace function technical_engine.asx_source_snapshot_v1(
  p_instrument_id uuid, p_cutoff_at timestamptz
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_inst record; v_provider uuid; v_count integer; v_symbol text;
  v_a record; v_m jsonb; v_attempt jsonb; v_correction jsonb;
  v_start date; v_end date; v_retrieved timestamptz; v_full boolean;
  v_expected uuid; v_newer_start timestamptz; v_newer_end date; v_newer_window_start date;
  v_anchor jsonb; v_terminal uuid; v_audits jsonb := '[]'; v_ids jsonb := '[]';
  v_last_end date; v_floor date; v_anchor_start date; v_anchor_end date;
  v_row record; v_raw jsonb; v_backfill jsonb; v_match jsonb;
  v_rows jsonb := '[]'; v_all_dates jsonb := '[]'; v_seen_dates date[] := '{}';
  v_date date; v_field text; v_snapshot jsonb; v_n integer := 0;
  v_reason text := 'INVALID_SOURCE_METADATA';
  v_basis constant text := 'Yahoo native OHLC plus separately supplied adjusted close';
begin
  if p_cutoff_at is null or not isfinite(p_cutoff_at) or p_cutoff_at > clock_timestamp() then
    return jsonb_build_object('status','blocked','reason','INVALID_CUTOFF','cutoff_at',p_cutoff_at);
  end if;
  select * into v_inst from public.instruments where id = p_instrument_id;
  if not found or v_inst.is_active is distinct from true or v_inst.exchange_code is distinct from 'ASX'
    or v_inst.asset_type is distinct from 'equity' or btrim(v_inst.currency_code) is distinct from 'AUD' or nullif(v_inst.symbol,'') is null then
    return jsonb_build_object('status','blocked','reason','INELIGIBLE_INSTRUMENT','cutoff_at',p_cutoff_at);
  end if;
  select count(*), (array_agg(id order by id))[1] into v_count,v_provider
    from public.data_providers where provider_code = 'yahoo' and is_active;
  if v_count <> 1 then
    return jsonb_build_object('status','blocked','reason','AMBIGUOUS_YAHOO_PROVIDER','cutoff_at',p_cutoff_at);
  end if;
  v_symbol := case when right(v_inst.symbol,3) = '.AX' then v_inst.symbol else v_inst.symbol || '.AX' end;

  -- Read newest first. An intervening bad audit cannot be skipped in favour of
  -- an older success. Once a clean full anchor is found, older episodes are irrelevant.
  v_reason := 'NO_VERIFIED_FULL_ANCHOR';
  for v_a in select a.* from public.sync_runs a
    where a.provider_id = v_provider and a.started_at <= p_cutoff_at
      and (a.metadata->>'instrument_id' = p_instrument_id::text
        or a.metadata->>'provider_symbol' = v_symbol or a.metadata->>'symbol' = v_inst.symbol)
    order by a.started_at desc, a.id desc
  loop
    v_n := v_n + 1;
    if v_n > 400 then v_reason := 'AUDIT_CHAIN_LIMIT'; raise exception 'blocked'; end if;
    v_m := v_a.metadata;
    v_reason := 'AUDIT_NOT_TERMINAL_SUCCESS';
    if v_a.status is distinct from 'succeeded' or v_a.finished_at is null or not isfinite(v_a.started_at)
      or not isfinite(v_a.finished_at) or v_a.finished_at < v_a.started_at or v_a.finished_at > p_cutoff_at then raise exception 'blocked'; end if;
    v_reason := 'INVALID_AUDIT_IDENTITY';
    if jsonb_typeof(v_m) is distinct from 'object'
      or v_m->>'function' is distinct from 'asx-yahoo-market-history'
      or v_m->>'provider' is distinct from 'yahoo' or v_m->>'symbol' is distinct from v_inst.symbol
      or v_m->>'provider_symbol' is distinct from v_symbol or v_m->>'exchange' is distinct from 'ASX'
      or v_m->>'price_basis' is distinct from v_basis
      or (v_m ? 'instrument_id' and v_m->>'instrument_id' is distinct from p_instrument_id::text)
      then raise exception 'blocked'; end if;
    v_reason := 'INVALID_AUDIT_WINDOW';
    if coalesce(v_m->>'requested_start_date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(v_m->>'requested_end_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'blocked'; end if;
    v_start := (v_m->>'requested_start_date')::date; v_end := (v_m->>'requested_end_date')::date;
    v_retrieved := (v_m->>'retrieved_at')::timestamptz;
    if v_start > v_end or v_end >= (p_cutoff_at at time zone 'Australia/Sydney')::date
      or v_end - v_start > 3660 or v_retrieved is null or not isfinite(v_retrieved)
      or v_retrieved < v_a.started_at or v_retrieved > v_a.finished_at then raise exception 'blocked'; end if;
    v_reason := 'UNRESOLVED_SOURCE_QUALITY';
    if jsonb_typeof(v_m->'rejected_bars') is distinct from 'array' or jsonb_array_length(v_m->'rejected_bars') <> 0
      or v_m->'coverage_has_rejected_bars' is distinct from 'false'::jsonb
      or coalesce(v_m->'daily_closes_preserved_while_gap_unresolved','false'::jsonb) <> 'false'::jsonb
      or jsonb_typeof(v_m->'duplicate_bars') is distinct from 'array'
      or jsonb_typeof(v_m->'events') is distinct from 'object'
      or coalesce(v_m->>'valid_rows','') !~ '^[1-9][0-9]*$'
      then raise exception 'blocked'; end if;
    if v_a.received_count is distinct from (v_m->>'valid_rows')::integer
      or v_a.requested_count is distinct from 1 or v_a.inserted_count is null
      or v_a.inserted_count < 0 or v_a.inserted_count > v_a.received_count then raise exception 'blocked'; end if;
    v_correction := v_m->'correction';
    if v_correction is not null and v_correction <> 'null'::jsonb then
      if jsonb_typeof(v_correction) <> 'object' or v_correction->>'state' is distinct from 'resolved'
        or v_correction->'completed_provider_attempt' is distinct from 'true'::jsonb
        or v_correction->'unresolved_dates' is distinct from '[]'::jsonb
        or coalesce(v_correction->'conflicting_dates','[]'::jsonb) <> '[]'::jsonb then raise exception 'blocked'; end if;
    end if;
    v_full := v_end - v_start >= 300;
    if v_m ? 'history_window_version' then
      v_reason := 'INVALID_V1_AUDIT';
      if v_m->'history_window_version' is distinct from '1'::jsonb
        or jsonb_typeof(v_m->'fetch_attempts') is distinct from 'array'
        or jsonb_array_length(v_m->'fetch_attempts') not between 1 and 2
        or jsonb_typeof(v_m->'accepted_provider_dates') is distinct from 'array'
        or v_m->>'instrument_id' is distinct from p_instrument_id::text
        or v_m->>'previous_audit_id' = v_a.id::text then raise exception 'blocked'; end if;
      for v_attempt in select value from jsonb_array_elements(v_m->'fetch_attempts') loop
        if jsonb_typeof(v_attempt) <> 'object' or v_attempt->'rejected_bars' is distinct from '[]'::jsonb
          or jsonb_typeof(v_attempt->'duplicate_bars') is distinct from 'array'
          or jsonb_typeof(v_attempt->'events') is distinct from 'object'
          or coalesce(v_attempt->>'valid_rows','') !~ '^[1-9][0-9]*$'
          or coalesce(v_attempt->>'requested_start_date','') !~ '^\d{4}-\d{2}-\d{2}$'
          or v_attempt->>'retrieved_at' is null or not isfinite((v_attempt->>'retrieved_at')::timestamptz)
          or (v_attempt->>'requested_start_date')::date < v_start
          or (v_attempt->>'requested_start_date')::date > v_end
          or v_attempt->>'requested_end_date' is distinct from v_m->>'requested_end_date'
          or (v_attempt->>'retrieved_at')::timestamptz < v_a.started_at
          or (v_attempt->>'retrieved_at')::timestamptz > v_a.finished_at then raise exception 'blocked'; end if;
      end loop;
      -- The final response must substantiate the written window and its counts.
      v_attempt := (v_m->'fetch_attempts')->-1;
      if v_attempt->>'requested_start_date' is distinct from v_m->>'requested_start_date'
        or v_attempt->>'retrieved_at' is distinct from v_m->>'retrieved_at'
        or v_attempt->'valid_rows' is distinct from v_m->'valid_rows' then raise exception 'blocked'; end if;
    elsif not v_full then
      v_reason := 'UNSUPPORTED_LEGACY_DESCENDANT'; raise exception 'blocked';
    end if;
    v_reason := 'BROKEN_AUDIT_CHAIN';
    if v_expected is not null and (v_a.id <> v_expected or v_a.finished_at > v_newer_start
      or v_end > v_newer_end or v_newer_window_start > v_end) then raise exception 'blocked'; end if;
    if v_terminal is null then v_terminal := v_a.id; v_last_end := v_end; end if;
    v_audits := jsonb_build_array(to_jsonb(v_a)) || v_audits;
    v_ids := jsonb_build_array(v_a.id) || v_ids;
    if v_full then
      -- A full refresh resets older quality episodes, but its declared parent
      -- must still be an older real receipt, never a future/cyclic reference.
      if v_m->>'previous_audit_id' is not null and not exists (
        select 1 from public.sync_runs parent where parent.id = (v_m->>'previous_audit_id')::uuid
          and parent.provider_id = v_provider and parent.started_at < v_a.started_at
          and parent.finished_at <= v_a.started_at
          and (parent.metadata->>'instrument_id' = p_instrument_id::text
            or parent.metadata->>'provider_symbol' = v_symbol or parent.metadata->>'symbol' = v_inst.symbol)
      ) then raise exception 'blocked'; end if;
      v_anchor := to_jsonb(v_a); v_anchor_start := v_start; v_anchor_end := v_end; exit;
    end if;
    v_expected := (v_m->>'previous_audit_id')::uuid;
    if v_expected is null then raise exception 'blocked'; end if;
    v_newer_start := v_a.started_at; v_newer_end := v_end; v_newer_window_start := v_start;
  end loop;
  if v_anchor is null then v_reason := 'NO_VERIFIED_FULL_ANCHOR'; raise exception 'blocked'; end if;
  -- A full audit cannot safely reset an older invocation that was still running.
  v_reason := 'OVERLAPPING_AUDIT';
  if exists(select 1 from public.sync_runs a where a.provider_id = v_provider
    and a.id <> (v_anchor->>'id')::uuid and a.started_at <= (v_anchor->>'started_at')::timestamptz
    and (a.finished_at is null or a.finished_at > (v_anchor->>'started_at')::timestamptz)
    and (a.metadata->>'instrument_id' = p_instrument_id::text or a.metadata->>'provider_symbol' = v_symbol or a.metadata->>'symbol' = v_inst.symbol)) then raise exception 'blocked'; end if;
  v_floor := greatest(v_anchor_start, (v_last_end - interval '1 year')::date);

  -- Inspect the complete anchor range for legacy-count reconciliation, then
  -- return only the bounded one-year window. Old unrelated history stays unused.
  for v_row in select o.* from public.market_observations o
    where o.instrument_id = p_instrument_id and o.provider_id = v_provider and o.interval_code = '1day'
      and o.observed_at >= v_anchor_start::timestamp at time zone 'UTC'
      and o.observed_at < (v_last_end + 1)::timestamp at time zone 'UTC'
    order by o.observed_at, o.id
  loop
    v_reason := 'INVALID_OBSERVATION';
    v_date := (v_row.observed_at at time zone 'UTC')::date;
    if not isfinite(v_row.observed_at) or v_row.observed_at <> v_date::timestamp at time zone 'UTC'
      or v_row.loaded_at is null or not isfinite(v_row.loaded_at) or v_row.loaded_at > p_cutoff_at
      or v_date = any(v_seen_dates) or btrim(v_row.currency_code) is distinct from 'AUD' then raise exception 'blocked'; end if;
    v_seen_dates := array_append(v_seen_dates,v_date);
    v_raw := v_row.raw_payload; v_backfill := v_raw->'_backfill';
    if jsonb_typeof(v_raw) is distinct from 'object' or jsonb_typeof(v_backfill) is distinct from 'object'
      or v_raw->>'date' is distinct from v_date::text or v_backfill->>'function' is distinct from 'asx-yahoo-market-history'
      or v_backfill->>'provider' is distinct from 'yahoo' or v_backfill->>'symbol' is distinct from v_inst.symbol
      or v_backfill->>'provider_symbol' is distinct from v_symbol or v_backfill->>'exchange' is distinct from 'ASX'
      or v_backfill->>'price_basis' is distinct from v_basis or v_backfill->>'source' is distinct from 'Yahoo Finance'
      then raise exception 'blocked'; end if;
    foreach v_field in array array['open','high','low','close','adjusted_close','volume'] loop
      if v_field = 'volume' and (to_jsonb(v_row)->v_field) = 'null'::jsonb and v_raw->v_field = 'null'::jsonb then continue; end if;
      if jsonb_typeof(v_raw->v_field) is distinct from 'number'
        or (to_jsonb(v_row)->>v_field) is null or (to_jsonb(v_row)->>v_field) in ('NaN','Infinity','-Infinity')
        -- Match the database's declared typmods exactly; do not invent an
        -- epsilon or demand unavailable precision from the persisted columns.
        or (to_jsonb(v_row)->>v_field)::numeric is distinct from round((v_raw->>v_field)::numeric, case when v_field = 'volume' then 4 else 8 end)
        or (v_field <> 'volume' and (v_raw->>v_field)::numeric <= 0)
        or (v_field = 'volume' and (v_raw->>v_field)::numeric < 0)
        or (v_field <> 'volume' and (to_jsonb(v_row)->>v_field)::numeric <= 0)
        or (v_field = 'volume' and (to_jsonb(v_row)->>v_field)::numeric < 0) then raise exception 'blocked'; end if;
    end loop;
    if (v_raw->>'high')::numeric < greatest((v_raw->>'open')::numeric,(v_raw->>'close')::numeric,(v_raw->>'low')::numeric)
      or (v_raw->>'low')::numeric > least((v_raw->>'open')::numeric,(v_raw->>'close')::numeric,(v_raw->>'high')::numeric) then raise exception 'blocked'; end if;
    if v_row.high < greatest(v_row.open,v_row.close,v_row.low) or v_row.low > least(v_row.open,v_row.close,v_row.high) then raise exception 'blocked'; end if;
    v_reason := 'UNVERIFIED_ROW_PROVENANCE';
    select count(*), (jsonb_agg(a))->0 into v_count,v_match from jsonb_array_elements(v_audits) a
      where a->'metadata'->>'requested_start_date' = v_backfill->>'requested_start_date'
        and a->'metadata'->>'requested_end_date' = v_backfill->>'requested_end_date'
        and a->'metadata'->>'retrieved_at' = v_backfill->>'retrieved_at';
    if v_count <> 1 or v_date < (v_backfill->>'requested_start_date')::date
      or v_date > (v_backfill->>'requested_end_date')::date then raise exception 'blocked'; end if;
    if v_match->'metadata' ? 'history_window_version'
      and not (v_match->'metadata'->'accepted_provider_dates') @> jsonb_build_array(v_date) then raise exception 'blocked'; end if;
    v_all_dates := v_all_dates || jsonb_build_array(v_date);
    if v_date >= v_floor then v_rows := v_rows || jsonb_build_array(to_jsonb(v_row)); end if;
  end loop;
  if jsonb_array_length(v_rows) = 0 then v_reason := 'NO_ELIGIBLE_OBSERVATIONS'; raise exception 'blocked'; end if;
  v_reason := 'UNCONFIRMED_DATE_COVERAGE';
  for v_m in select value->'metadata' from jsonb_array_elements(v_audits) loop
    select count(*) into v_count from jsonb_array_elements_text(v_all_dates) d
      where d::date between (v_m->>'requested_start_date')::date and (v_m->>'requested_end_date')::date;
    if v_count <> (v_m->>'valid_rows')::integer then raise exception 'blocked'; end if;
    if v_m ? 'history_window_version' then
      for v_attempt in select value from jsonb_array_elements(v_m->'accepted_provider_dates') loop
        if jsonb_typeof(v_attempt) <> 'string' or (v_attempt #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'blocked'; end if;
        v_date := (v_attempt #>> '{}')::date;
        if v_date > (v_m->>'requested_end_date')::date then raise exception 'blocked'; end if;
        if v_date >= v_anchor_start and v_date <= v_last_end and not v_all_dates @> jsonb_build_array(v_date) then raise exception 'blocked'; end if;
      end loop;
    end if;
  end loop;
  -- A fresh anchor needs its actual returned count, not inserted_count (upserts).
  select count(*) into v_count from jsonb_array_elements_text(v_all_dates) d where d::date <= v_anchor_end;
  if v_count <> (v_anchor->'metadata'->>'valid_rows')::integer then raise exception 'blocked'; end if;
  if v_anchor->'metadata' ? 'history_window_version' and exists(
    select 1 from jsonb_array_elements_text(v_all_dates) d where d::date <= v_anchor_end
      and not (v_anchor->'metadata'->'accepted_provider_dates') @> jsonb_build_array(d)) then raise exception 'blocked'; end if;
  v_snapshot := jsonb_build_object('status','ready','reason','VERIFIED_YAHOO_WINDOW','instrument_id',p_instrument_id,
    'provider_id',v_provider,'source_contract','asx-yahoo-adjusted-window-v1',
    'anchor_audit_id',v_anchor->>'id','terminal_audit_id',v_terminal,'window_start',v_floor,'window_end',v_last_end,
    'audit_ids',v_ids,'audits',v_audits,'observations',v_rows);
  return v_snapshot || jsonb_build_object('cutoff_at',p_cutoff_at,'source_hash',
    encode(sha256(convert_to(v_snapshot::text,'UTF8')),'hex'));
exception when others then
  return jsonb_build_object('status','blocked','reason',v_reason,'cutoff_at',p_cutoff_at);
end;
$$;
revoke all on function technical_engine.asx_source_snapshot_v1(uuid,timestamptz) from public, anon, authenticated;
grant execute on function technical_engine.asx_source_snapshot_v1(uuid,timestamptz) to service_role;
