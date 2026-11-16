-- Preserve the existing service-only history-worker RPC and Tiingo behavior.
-- Recovery: scripts/rollback-asx-history-technical-refresh.sql (no data deletion).
CREATE OR REPLACE FUNCTION public.refresh_market_trends_for_instrument(p_instrument_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_ind record;v_score record;v_asx jsonb;v_complete bigint;
begin
 if not exists(select 1 from public.instruments where id=p_instrument_id) then raise exception 'Unknown instrument'; end if;
 if exists(select 1 from public.instruments where id=p_instrument_id and exchange_code='ASX') then
   v_asx := technical_engine.refresh_asx_v1(p_instrument_id);
   select count(*) into v_complete from public.technical_indicators
   where instrument_id=p_instrument_id and calculation_version='technical-engine-asx-v1'
     and values->>'refresh_batch_id'=v_asx->>'refresh_batch_id' and values->>'status'='complete';
   return jsonb_build_object('instrument_id',p_instrument_id,
     'indicator_rows',coalesce((v_asx->>'indicator_rows_upserted')::bigint,0),
     'complete_indicators',v_complete,
     'score_rows',coalesce((v_asx->>'score_rows_upserted')::bigint,0),
     'complete_scores',coalesce((v_asx->>'complete_scores')::bigint,0),'asx',v_asx);
 end if;
 select * into v_ind from technical_engine.refresh_v1(p_instrument_id);
 select * into v_score from technical_engine.refresh_scores_v1(p_instrument_id);
 return jsonb_build_object('instrument_id',p_instrument_id,'indicator_rows',coalesce(v_ind.rows_upserted,0),'complete_indicators',coalesce(v_ind.complete_rows,0),'score_rows',coalesce(v_score.rows_upserted,0),'complete_scores',coalesce(v_score.complete_scores,0));
end$function$;
REVOKE ALL ON FUNCTION public.refresh_market_trends_for_instrument(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_market_trends_for_instrument(uuid) TO service_role;
