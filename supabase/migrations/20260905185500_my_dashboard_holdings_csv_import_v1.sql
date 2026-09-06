-- MYDASH-004: atomic, owner-scoped persistence for a confirmed CSV holdings preview.
-- Authored locally only; this migration is not applied by its creation cycle.

create function public.import_portfolio_holdings_csv_v1(
  p_portfolio_id uuid,
  p_preview_revision text,
  p_rows jsonb
)
returns table(inserted_count integer, updated_count integer, position_ids uuid[])
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_row jsonb;
  v_resolved_rows jsonb := '[]'::jsonb;
  v_instrument_id uuid;
  v_instrument_count integer;
  v_existing public.portfolio_positions%rowtype;
  v_position_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_ids uuid[] := '{}'::uuid[];
begin
  if v_owner_id is null or coalesce(((auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception using errcode = '42501', message = 'PERMANENT_USER_REQUIRED';
  end if;

  if p_preview_revision is null or p_preview_revision !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_PREVIEW_REVISION';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'INVALID_IMPORT_ROWS';
  end if;

  perform 1
  from public.portfolios p
  where p.id = p_portfolio_id
    and p.owner_user_id = v_owner_id
    and p.status = 'active'
    and p.portfolio_kind = 'manual'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'PORTFOLIO_NOT_IMPORTABLE';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(v_row) key
         where key not in (
           'symbol', 'exchange_code', 'quantity', 'average_cost_per_unit',
           'cost_currency', 'acquired_at', 'notes', 'expected_instrument_id',
           'expected_position_id', 'expected_position_updated_at'
         )
       )
       or not (v_row ?& array['symbol', 'exchange_code', 'quantity', 'average_cost_per_unit',
                              'cost_currency', 'acquired_at', 'notes', 'expected_instrument_id',
                              'expected_position_id', 'expected_position_updated_at']) then
      raise exception using errcode = '22023', message = 'INVALID_IMPORT_ROW_SHAPE';
    end if;

    if (v_row->>'symbol') !~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'
       or (v_row->>'exchange_code') !~ '^[A-Z0-9][A-Z0-9_.-]{0,15}$'
       or (v_row->>'quantity') !~ '^(?:0*[1-9][0-9]*(?:\.[0-9]{1,12})?|0*\.0*[1-9][0-9]{0,11})$'
       or length(replace(split_part(v_row->>'quantity', '.', 1), '+', ''))
          + length(split_part(v_row->>'quantity', '.', 2)) > 30
       or (v_row->>'cost_currency') !~ '^[A-Z]{3}$'
       or (v_row->>'average_cost_per_unit') is not null and (
         (v_row->>'average_cost_per_unit') !~ '^(?:[0-9]+(?:\.[0-9]{1,12})?|\.[0-9]{1,12})$'
         or length(split_part(v_row->>'average_cost_per_unit', '.', 1))
            + length(split_part(v_row->>'average_cost_per_unit', '.', 2)) > 30
       )
       or (v_row->>'acquired_at') is not null and (
         (v_row->>'acquired_at') !~ '^\d{4}-\d{2}-\d{2}$'
         or (v_row->>'acquired_at')::date > current_date
       )
       or (v_row->>'notes') is not null and (
         length(v_row->>'notes') > 500
         or v_row->>'notes' <> btrim(v_row->>'notes')
         or v_row->>'notes' ~ '[[:cntrl:]]'
       ) then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_VALIDATION_FAILED';
    end if;

    select count(*)
      into v_instrument_count
    from public.instruments i
    where i.symbol = v_row->>'symbol'
      and i.exchange_code = v_row->>'exchange_code'
      and i.is_active = true;

    select i.id into v_instrument_id
    from public.instruments i
    where i.symbol = v_row->>'symbol'
      and i.exchange_code = v_row->>'exchange_code'
      and i.is_active = true
    order by i.id
    limit 1;

    if v_instrument_count <> 1
       or v_instrument_id::text is distinct from v_row->>'expected_instrument_id' then
      raise exception using errcode = '40001', message = 'PREVIEW_STALE';
    end if;

    select pp.* into v_existing
    from public.portfolio_positions pp
    where pp.portfolio_id = p_portfolio_id
      and pp.owner_user_id = v_owner_id
      and pp.instrument_id = v_instrument_id
    for update;

    if found then
      if v_existing.id::text is distinct from v_row->>'expected_position_id'
         or v_existing.updated_at is distinct from (v_row->>'expected_position_updated_at')::timestamptz then
        raise exception using errcode = '40001', message = 'PREVIEW_STALE';
      end if;
    elsif (v_row->>'expected_position_id') is not null
       or (v_row->>'expected_position_updated_at') is not null then
      raise exception using errcode = '40001', message = 'PREVIEW_STALE';
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_resolved_rows) prior
      where prior->>'instrument_id' = v_instrument_id::text
    ) then
      raise exception using errcode = '22023', message = 'DUPLICATE_IN_FILE';
    end if;

    v_resolved_rows := v_resolved_rows || jsonb_build_array(
      v_row || jsonb_build_object('instrument_id', v_instrument_id, 'is_update', found)
    );
  end loop;

  for v_row in select value from jsonb_array_elements(v_resolved_rows)
  loop
    if (v_row->>'is_update')::boolean then
      update public.portfolio_positions pp set
        quantity = (v_row->>'quantity')::numeric(30,12),
        average_cost_per_unit = (v_row->>'average_cost_per_unit')::numeric(30,12),
        cost_currency = v_row->>'cost_currency',
        acquired_at = (v_row->>'acquired_at')::date,
        position_source = 'manual',
        source_decision_id = null,
        notes = v_row->>'notes'
      where pp.id = (v_row->>'expected_position_id')::uuid
        and pp.owner_user_id = v_owner_id
        and pp.portfolio_id = p_portfolio_id
        and pp.instrument_id = (v_row->>'instrument_id')::uuid
        and pp.updated_at = (v_row->>'expected_position_updated_at')::timestamptz
      returning pp.id into v_position_id;

      if not found then
        raise exception using errcode = '40001', message = 'PREVIEW_STALE';
      end if;
      v_updated := v_updated + 1;
    else
      insert into public.portfolio_positions (
        owner_user_id, portfolio_id, instrument_id, quantity, average_cost_per_unit,
        cost_currency, acquired_at, position_source, source_decision_id, notes
      ) values (
        v_owner_id,
        p_portfolio_id,
        (v_row->>'instrument_id')::uuid,
        (v_row->>'quantity')::numeric(30,12),
        (v_row->>'average_cost_per_unit')::numeric(30,12),
        v_row->>'cost_currency',
        (v_row->>'acquired_at')::date,
        'manual',
        null,
        v_row->>'notes'
      )
      on conflict (portfolio_id, instrument_id) do nothing
      returning id into v_position_id;

      if not found then
        raise exception using errcode = '40001', message = 'PREVIEW_STALE';
      end if;
      v_inserted := v_inserted + 1;
    end if;
    v_ids := array_append(v_ids, v_position_id);
  end loop;

  return query select v_inserted, v_updated, v_ids;
end;
$$;

revoke all on function public.import_portfolio_holdings_csv_v1(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_portfolio_holdings_csv_v1(uuid, text, jsonb)
  to authenticated;

comment on function public.import_portfolio_holdings_csv_v1(uuid, text, jsonb) is
  'Atomically confirms a private holdings CSV preview for one active manual portfolio owned by the permanent caller.';
