-- Read-only reference: live Trading definitions captured 17 November 2026.
-- Do not apply blindly; controlled recovery restores only reviewed changed functions.
-- market_history.enqueue_daily_jobs; MD5 c81a6dc84d0d495fcf5a6d69fe3af28d; ACL {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION market_history.enqueue_daily_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v record;v_count int:=0;
begin
 for v in
  with eligible as(
   select i.id,i.symbol from public.instruments i where i.is_active
   union select i.id,i.symbol from public.watchlist_items wi join public.instruments i on i.id=wi.instrument_id
   union select i.id,i.symbol from public.opportunity_theme_external_instruments oe join public.instruments i on upper(i.symbol)=upper(btrim(oe.symbol)) and(oe.exchange_code='UNKNOWN' or upper(i.exchange_code)=upper(oe.exchange_code)) where oe.is_active)
  select distinct id,symbol from eligible
 loop
  perform market_history.enqueue_job('daily_incremental','active_universe','daily:'||v.id::text,v.id,v.symbol,1,jsonb_build_object('enqueued_for',(clock_timestamp() at time zone 'UTC')::date));
  v_count:=v_count+1;
 end loop; return v_count;
end$function$
;

-- public.claim_market_history_job; MD5 da04210e797ca4b5b6668834def76ca6; ACL {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.claim_market_history_job()
 RETURNS SETOF market_history_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_id uuid;
begin
 select j.id into v_id from public.market_history_jobs j where j.status='pending' and j.next_attempt_at<=clock_timestamp()
 order by case j.job_type when 'initial_backfill' then 0 else 1 end,j.next_attempt_at,j.created_at for update skip locked limit 1;
 if v_id is null then return; end if;
 return query update public.market_history_jobs j set status='running',attempts=j.attempts+1,started_at=coalesce(j.started_at,clock_timestamp()),updated_at=clock_timestamp()
 where j.id=v_id and j.status='pending' returning j.*;
end$function$
;

-- market_history.enqueue_job; MD5 519b5c19fd5bbd92a838b7ef4cc99541; ACL {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION market_history.enqueue_job(p_job_type text, p_source_scope text, p_source_key text, p_instrument_id uuid, p_symbol text, p_years integer DEFAULT 5, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_id uuid; v_symbol text:=upper(btrim(p_symbol));
begin
 if p_job_type not in('initial_backfill','daily_incremental') or p_source_scope not in('active_universe','watchlist','opportunity','manual') or v_symbol='' or btrim(p_source_key)='' then raise exception 'Invalid market history job'; end if;
 if p_instrument_id is not null then
  select j.id into v_id from public.market_history_jobs j where j.job_type=p_job_type and j.instrument_id=p_instrument_id and j.status in('pending','running') order by j.created_at desc limit 1;
 else
  select j.id into v_id from public.market_history_jobs j where j.job_type=p_job_type and j.source_scope=p_source_scope and j.source_key=p_source_key and j.status in('pending','running','mapping_required') order by j.created_at desc limit 1;
 end if;
 if v_id is not null then return v_id; end if;
 insert into public.market_history_jobs(job_type,source_scope,source_key,instrument_id,symbol,years,status,metadata)
 values(p_job_type,p_source_scope,p_source_key,p_instrument_id,v_symbol,greatest(1,least(coalesce(p_years,5),5)),case when p_instrument_id is null then 'mapping_required' else 'pending' end,coalesce(p_metadata,'{}'))
 returning id into v_id; return v_id;
end$function$
;
