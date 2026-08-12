-- Phase 2: daily market assessment queue lifecycle
-- Applied to Supabase project glvbqcplgjdfgjyknzsa on 2026-08-12.

alter table public.market_assessment_queue
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists attempt_count integer not null default 0,
  add column if not exists error_message text,
  add column if not exists gpt_run_id uuid references public.gpt_market_runs(run_id) on delete set null;

alter table public.market_assessment_queue
  drop constraint if exists market_assessment_queue_attempt_count_check;

alter table public.market_assessment_queue
  add constraint market_assessment_queue_attempt_count_check check (attempt_count >= 0);

create index if not exists market_assessment_queue_status_run_date_idx
  on public.market_assessment_queue(status, run_date, id);

create or replace function public.claim_market_assessment_queue(
  p_process_name text default 'daily_market_assessment'
)
returns table(
  id bigint,
  run_date date,
  process_name text,
  attempt_count integer
)
language plpgsql
set search_path = public
as $$
declare
  v_id bigint;
begin
  select q.id
    into v_id
  from public.market_assessment_queue q
  where q.process_name = p_process_name
    and q.status in ('pending', 'ready_for_analysis')
    and q.run_date <= (now() at time zone 'America/New_York')::date
  order by q.run_date, q.id
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update public.market_assessment_queue q
     set status = 'processing',
         started_at = now(),
         updated_at = now(),
         processed_at = null,
         error_message = null,
         attempt_count = q.attempt_count + 1
   where q.id = v_id
   returning q.id, q.run_date, q.process_name, q.attempt_count;
end;
$$;

revoke all on function public.claim_market_assessment_queue(text) from public, anon, authenticated;
grant execute on function public.claim_market_assessment_queue(text) to service_role;

create or replace function public.finalize_market_assessment_queue(
  p_queue_id bigint,
  p_status text,
  p_gpt_run_id uuid default null,
  p_error_message text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'partial', 'failed') then
    raise exception 'Invalid final queue status: %', p_status;
  end if;

  update public.market_assessment_queue
     set status = p_status,
         processed_at = now(),
         updated_at = now(),
         gpt_run_id = coalesce(p_gpt_run_id, gpt_run_id),
         error_message = p_error_message
   where id = p_queue_id
     and status = 'processing';

  if not found then
    raise exception 'Queue item % is not in processing state', p_queue_id;
  end if;
end;
$$;

revoke all on function public.finalize_market_assessment_queue(bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.finalize_market_assessment_queue(bigint,text,uuid,text) to service_role;

create or replace function public.queue_daily_market_assessment()
returns void
language plpgsql
set search_path = public
as $$
declare
  ny_now timestamp := now() at time zone 'America/New_York';
  ny_date date := (now() at time zone 'America/New_York')::date;
  ny_hour integer := extract(hour from ny_now)::integer;
begin
  if ny_hour <> 18 then
    return;
  end if;

  insert into public.market_assessment_queue (status, process_name, run_date, updated_at)
  values ('pending', 'daily_market_assessment', ny_date, now())
  on conflict (run_date, process_name) do nothing;

  insert into public.market_assessment_schedule_log (status, notes)
  values ('triggered', 'Daily 6:00pm America/New_York assessment request created.');
end;
$$;

create or replace function public.process_market_assessment_queue()
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.market_assessment_queue
     set status = 'ready_for_analysis',
         updated_at = now()
   where status = 'pending'
     and run_date = current_date;

  insert into public.market_assessment_schedule_log (status, notes)
  values ('ready', 'Daily assessment handed to analysis stage.');
end;
$$;
