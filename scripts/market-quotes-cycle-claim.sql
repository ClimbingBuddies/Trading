-- Apply before deploying the atomic-claim quote worker. No history is deleted.
-- The worker retains market-session eligibility and passes its sorted unique IDs.
begin;

create or replace function public.claim_twelve_data_cycle_batch_v1(
  p_provider_id uuid, p_instrument_ids uuid[]
)
returns table (
  sync_run_id uuid, selected_instrument_ids uuid[], cycle_started_at timestamptz,
  cycle_ends_at timestamptz, claim_status text, eligible_count integer, remaining_count integer
)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_cycle_key text;
  v_seen uuid[] := array[]::uuid[];
  v_pending uuid[];
  v_selected uuid[];
  v_receipt jsonb;
  v_run_id uuid;
  v_last_finish timestamptz;
  v_count integer;
  v_active_count integer;
begin
  if p_instrument_ids is null or array_position(p_instrument_ids, null) is not null then
    raise exception 'Invalid quote instrument selection';
  end if;
  v_count := cardinality(p_instrument_ids);
  if v_count > 64 or v_count <> (select count(distinct x) from unnest(p_instrument_ids) x) then
    raise exception 'Quote selection requires at most 64 unique instruments';
  end if;

  -- One database transaction owns read/select/receipt creation. Network/provider
  -- work occurs only after this RPC commits; a running receipt blocks new claims.
  perform pg_advisory_xact_lock(hashtextextended('public.claim_twelve_data_cycle_batch_v1', 0));
  v_now := clock_timestamp();
  v_start := to_timestamp(floor((extract(epoch from v_now) - 10800) / 14400) * 14400 + 10800);
  v_end := v_start + interval '4 hours';
  v_cycle_key := to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if not exists (select 1 from public.data_providers p
    where p.id = p_provider_id and p.provider_code = 'twelvedata') then
    raise exception 'Invalid Twelve Data provider';
  end if;
  if exists (select 1 from unnest(p_instrument_ids) requested(id)
    where not exists (
      select 1 from public.provider_instruments pi join public.instruments i on i.id = pi.instrument_id
      where pi.provider_id = p_provider_id and pi.instrument_id = requested.id
        and pi.is_active is true and i.is_active is true
    )) then
    raise exception 'Quote selection contains inactive or unmapped instruments';
  end if;

  if v_now >= v_start + interval '15 minutes' then
    return query select null::uuid, array[]::uuid[], v_start, v_end, 'outside_refresh_window'::text, v_count, v_count;
    return;
  end if;
  -- Never infer completion from elapsed time, even across cycle boundaries.
  -- Only these two reviewed, pre-cutover legacy runs are excluded: their runtime
  -- has expired, but completion counts remain unknown and history stays intact.
  -- Deployment must drain the old worker first. Every other unfinished run blocks.
  if exists (select 1 from public.sync_runs r where r.provider_id = p_provider_id
    and r.metadata->>'function' = 'full-twelve-data-load' and r.status = 'running'
    and not (r.id in ('73413e90-8ef8-46fa-a0d8-50d662296c3c'::uuid,
                     '9ae8f9f4-9125-4ebb-8913-bd51fc163838'::uuid)
      and r.started_at < '2026-11-08T00:00:00Z'::timestamptz
      and not (r.metadata ? 'cycle_started_at'))) then
    return query select null::uuid, array[]::uuid[], v_start, v_end, 'batch_running'::text, v_count, v_count;
    return;
  end if;
  select max(r.finished_at) into v_last_finish from public.sync_runs r
    where r.provider_id = p_provider_id and r.metadata->>'function' = 'full-twelve-data-load';
  if v_last_finish is not null and v_now < v_last_finish + interval '60 seconds' then
    return query select null::uuid, array[]::uuid[], v_start, v_end, 'batch_cooldown'::text, v_count, v_count;
    return;
  end if;

  for v_receipt in select r.metadata from public.sync_runs r
    where r.provider_id = p_provider_id and r.metadata->>'function' = 'full-twelve-data-load'
      and r.metadata->>'cycle_started_at' = v_cycle_key
  loop
    if jsonb_typeof(v_receipt->'selected_instrument_ids') is distinct from 'array' then
      raise exception 'Invalid quote cycle receipt';
    end if;
    -- Invalid/non-UUID receipt members fail closed; no ignored partial evidence.
    v_seen := v_seen || array(select value::uuid from jsonb_array_elements_text(v_receipt->'selected_instrument_ids'));
    if array_position(v_seen, null) is not null then raise exception 'Invalid quote cycle receipt'; end if;
  end loop;
  select coalesce(array_agg(item.id order by item.position), array[]::uuid[]) into v_pending
    from unnest(p_instrument_ids) with ordinality item(id, position)
    where not (item.id = any(v_seen));
  v_selected := coalesce(v_pending[1:8], array[]::uuid[]);
  if cardinality(v_selected) = 0 then
    return query select null::uuid, v_selected, v_start, v_end, 'no_unattempted_eligible_instruments'::text, v_count, 0;
    return;
  end if;
  select count(*) into v_active_count from public.provider_instruments pi
    join public.instruments i on i.id = pi.instrument_id
    where pi.provider_id = p_provider_id and pi.is_active is true and i.is_active is true;
  insert into public.sync_runs(provider_id, requested_count, status, metadata)
  values (p_provider_id, cardinality(v_selected), 'running', jsonb_build_object(
    'function', 'full-twelve-data-load', 'batch_size', 8, 'cycle_version', 2,
    'cycle_started_at', v_cycle_key,
    'cycle_ends_at', to_char(v_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'selected_instrument_ids', to_jsonb(v_selected), 'market_hours_aware', true,
    'eligible_count', v_count, 'skipped_out_of_session', greatest(0, v_active_count - v_count),
    'evaluated_at', v_now
  )) returning id into v_run_id;
  return query select v_run_id, v_selected, v_start, v_end, 'claimed'::text, v_count,
    cardinality(v_pending) - cardinality(v_selected);
end;
$$;

alter function public.claim_twelve_data_cycle_batch_v1(uuid, uuid[]) owner to postgres;
revoke all on function public.claim_twelve_data_cycle_batch_v1(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_twelve_data_cycle_batch_v1(uuid, uuid[]) to service_role;
comment on function public.claim_twelve_data_cycle_batch_v1(uuid, uuid[]) is
  'Service-only atomic quote batch receipt; UTC 03/07/11/15/19/23 cycles, running-receipt exclusion and 60-second finish cooldown.';
commit;
