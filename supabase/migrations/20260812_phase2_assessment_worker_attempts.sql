-- Phase 2: assessment worker retry accounting
-- Applied to Supabase project glvbqcplgjdfgjyknzsa on 2026-08-12.

create or replace function public.begin_market_assessment_attempt(p_queue_id bigint)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_attempt_count integer;
begin
  update public.market_assessment_queue
     set attempt_count = attempt_count + 1,
         updated_at = now()
   where id = p_queue_id
     and status = 'processing'
   returning attempt_count into v_attempt_count;

  if v_attempt_count is null then
    raise exception 'Queue item % is not in processing state', p_queue_id;
  end if;

  return v_attempt_count;
end;
$$;

revoke all on function public.begin_market_assessment_attempt(bigint) from public, anon, authenticated;
grant execute on function public.begin_market_assessment_attempt(bigint) to service_role;
