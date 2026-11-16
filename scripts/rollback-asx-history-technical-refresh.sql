-- Restore the pre-ASX history hook only. Preserve scores, snapshots and migrations.
CREATE OR REPLACE FUNCTION public.refresh_market_trends_for_instrument(p_instrument_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_ind record;v_score record;
begin
 if not exists(select 1 from public.instruments where id=p_instrument_id) then raise exception 'Unknown instrument'; end if;
 select * into v_ind from technical_engine.refresh_v1(p_instrument_id);
 select * into v_score from technical_engine.refresh_scores_v1(p_instrument_id);
 return jsonb_build_object('instrument_id',p_instrument_id,'indicator_rows',coalesce(v_ind.rows_upserted,0),'complete_indicators',coalesce(v_ind.complete_rows,0),'score_rows',coalesce(v_score.rows_upserted,0),'complete_scores',coalesce(v_score.complete_scores,0));
end$function$;
REVOKE ALL ON FUNCTION public.refresh_market_trends_for_instrument(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_market_trends_for_instrument(uuid) TO service_role;
