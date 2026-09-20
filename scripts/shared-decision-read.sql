-- Authenticated, explicit read projections. No raw generation snapshots or user notes.
create or replace function private.shared_decision_item_v1(p_call uuid,p_checkpoint text default 'latest') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare c record; rv record; en record; ex record; measured record; gap record; eval record; first_buy timestamptz; pending_sell boolean;
 state text; health text:='UNVERIFIED'; problem jsonb; original jsonb; latest jsonb; result jsonb;
begin
 select sc.*,i.symbol,i.instrument_name,i.exchange_code,b.symbol benchmark_symbol,b.instrument_name benchmark_name
 into c from public.shared_decision_calls sc join public.instruments i on i.id=sc.instrument_id
 join public.instruments b on b.id=sc.benchmark_instrument_id where sc.id=p_call;
 if c.id is null then return null; end if;
 select * into rv from public.shared_decision_reviews where call_id=c.id order by published_at desc,id desc limit 1;
 select * into en from public.shared_decision_outcomes where call_id=c.id and kind='ENTRY';
 select * into ex from public.shared_decision_outcomes where call_id=c.id and kind in ('EXIT','CANCELLED') order by recorded_at desc limit 1;
 select * into gap from public.shared_decision_outcomes where call_id=c.id and kind='DATA_GAP' order by recorded_at desc,id desc limit 1;
 select min(at_time) into first_buy from (
  select c.action action,c.published_at at_time,c.id id
  union all select r.action,r.published_at,r.id from public.shared_decision_reviews r where r.call_id=c.id
 )x where action='BUY';
 select exists(select 1 from public.shared_decision_reviews where call_id=c.id and action='SELL' and published_at>first_buy) into pending_sell;
 state:=case when ex.kind='EXIT' then 'CLOSED' when ex.kind='CANCELLED' then 'CANCELLED'
  when en.id is not null then case when pending_sell then 'EXIT_SIGNAL' else 'OPEN' end
  when c.action='BUY' or exists(select 1 from public.shared_decision_reviews where call_id=c.id and action='BUY') then 'AWAITING_ENTRY'
  else 'WATCHING' end;
 select * into measured from public.shared_decision_outcomes where call_id=c.id
 and (case when p_checkpoint='5' then kind='CHECKPOINT_5' when p_checkpoint='20' then kind='CHECKPOINT_20' else kind in ('EXIT','MARK') end)
 order by as_of desc,recorded_at desc,id desc limit 1;
 select * into eval from private.shared_decision_evaluation_state where call_id=c.id;
 health:=coalesce(eval.data_status,'UNVERIFIED');
 if gap.id is not null and (eval.evaluated_through is null or gap.recorded_at>=eval.evaluated_through) then
  health:='MISSING_DATA';
  problem:=jsonb_build_object('code','PRICE_EVIDENCE_GAP','message',gap.reason,'stage','evaluation','lastAttemptAt',gap.recorded_at,'nextAction','Recover and validate source prices before calculating another result');
 end if;
 if problem is null and health<>'READY' then problem:=jsonb_build_object('code',case when health='CALENDAR_REQUIRED' then 'CALENDAR_REQUIRED' else 'EVALUATION_UNVERIFIED' end,'message',case when health='CALENDAR_REQUIRED' then 'Verified trading sessions are required' else 'Shared outcome evaluation has not been verified' end,'stage','evaluation','lastAttemptAt',eval.last_attempt_at,'nextAction','Complete trusted calendar and outcome evaluation');end if;
 original:=jsonb_build_object('id',c.id,'action',c.action,'publishedAt',c.published_at,'sourceCutoff',c.source_cutoff,'thesis',c.thesis,'risks',c.risks,'modelIdentity',c.model_identity,'assessmentId',c.assessment_id);
 if rv.id is not null then latest:=jsonb_build_object('id',rv.id,'action',rv.action,'publishedAt',rv.published_at,'sourceCutoff',rv.source_cutoff,'thesis',rv.thesis,'risks',rv.risks,'modelIdentity',rv.model_identity,'assessmentId',rv.assessment_id); end if;
 if measured.id is not null and health='READY' then result:=jsonb_build_object('outcomeId',measured.id,'asOf',measured.as_of,'netReturn',measured.net_return::text,'benchmarkReturn',measured.benchmark_return::text,'costPerSide',c.cost_per_side::text,'kind',measured.kind,
 'benchmark',jsonb_build_object('id',c.benchmark_instrument_id,'symbol',c.benchmark_symbol,'name',c.benchmark_name,'currency',c.currency)); end if;
 return jsonb_build_object('callId',c.id,'instrument',jsonb_build_object('id',c.instrument_id,'symbol',c.symbol,'name',c.instrument_name,'exchange',c.exchange_code,'currency',c.currency),
 'original',original,'latestReview',latest,'lastReviewedAt',coalesce(rv.published_at,c.published_at),'state',state,'dataStatus',health,
 'entry',case when en.id is null then null else jsonb_build_object('outcomeId',en.id,'at',en.as_of,'price',en.price::text,'currency',c.currency) end,
 'exit',case when ex.kind='EXIT' then jsonb_build_object('outcomeId',ex.id,'at',ex.as_of,'price',ex.price::text,'currency',c.currency) else null end,
 'performance',result,'pricesAsOf',case when result is null then null else measured.as_of end,'blocker',problem);
end $$;
revoke all on function private.shared_decision_item_v1(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.shared_decision_dashboard_v1(p_scope text default 'all',p_checkpoint text default 'latest',p_cursor text default null,p_blocked_cursor text default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare user_id uuid:=auth.uid(); n integer:=least(greatest(coalesce(p_limit,50),1),100); result jsonb; after_at timestamptz; after_id uuid; blocked_id uuid;
begin
 if user_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Permanent sign-in required'; end if;
 if p_scope is null or p_scope not in ('all','watched') or p_checkpoint is null or p_checkpoint not in ('latest','5','20') then raise exception 'Invalid filter'; end if;
 if p_cursor is not null then after_at:=(p_cursor::jsonb->>'at')::timestamptz; after_id:=(p_cursor::jsonb->>'id')::uuid; if after_at is null or after_id is null then raise exception 'Invalid cursor'; end if; end if;
 if p_blocked_cursor is not null then blocked_id:=p_blocked_cursor::uuid; end if;
 with watched as materialized (
  select distinct wi.instrument_id from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id where w.owner_user_id=user_id
 ), scoped as materialized (
  select c.id,c.published_at,private.shared_decision_item_v1(c.id,p_checkpoint) item from public.shared_decision_calls c
  where p_scope='all' or c.instrument_id in (select instrument_id from watched)
 ), page as materialized (
  select * from scoped where after_at is null or (published_at,id)<(after_at,after_id) order by published_at desc,id desc limit n
 ), blocked as materialized (
  select i.id,jsonb_build_object('instrument',jsonb_build_object('id',i.id,'symbol',i.symbol,'name',i.instrument_name,'exchange',i.exchange_code,'currency',trim(i.currency_code)),
   'blocker',jsonb_build_object('code','SHARED_CALL_PENDING','message','No shared AI call has been published for this share','stage','publication','lastAttemptAt',null,'nextAction','Complete validated research and shared publication')) item
  from public.instruments i where not exists(select 1 from public.shared_decision_calls c where c.instrument_id=i.id)
   and (case when p_scope='watched' then i.id in(select instrument_id from watched)
     else exists(select 1 from public.watchlist_items wi where wi.instrument_id=i.id) end)
 ), blocked_page as materialized (select * from blocked where blocked_id is null or id>blocked_id order by id limit n)
 select jsonb_build_object('contractVersion',1,'generatedAt',statement_timestamp(),
 'items',coalesce((select jsonb_agg(item order by published_at desc,id desc) from page),'[]'::jsonb),
 'nextCursor',case when exists(select 1 from scoped s where (s.published_at,s.id)<(select p.published_at,p.id from page p order by p.published_at,p.id limit 1))
 then (select jsonb_build_object('at',published_at,'id',id)::text from page order by published_at,id limit 1) else null end,
 'blockedItems',coalesce((select jsonb_agg(item order by id) from blocked_page),'[]'::jsonb),
 'blockedNextCursor',case when exists(select 1 from blocked b where b.id>(select id from blocked_page order by id desc limit 1)) then (select id::text from blocked_page order by id desc limit 1) else null end,
 'counts',jsonb_build_object('trackedCalls',(select count(*) from scoped),'watching',(select count(*) from scoped where item->>'state'='WATCHING'),
 'awaitingEntry',(select count(*) from scoped where item->>'state'='AWAITING_ENTRY'),'open',(select count(*) from scoped where item->>'state'='OPEN'),
 'exitSignal',(select count(*) from scoped where item->>'state'='EXIT_SIGNAL'),'closed',(select count(*) from scoped where item->>'state'='CLOSED'),
 'cancelled',(select count(*) from scoped where item->>'state'='CANCELLED'),'blockedWithoutCall',(select count(*) from blocked),
 'callsNeedingAttention',(select count(*) from scoped where item->>'dataStatus'<>'READY' or item->'blocker'<>'null'::jsonb)),
 'scheduledRun',jsonb_build_object('state','unverified','lastAttemptAt',null,'lastCompletedAt',null,'message','Shared scheduled publication has not been verified')) into result;
 return result;
end $$;
revoke all on function public.shared_decision_dashboard_v1(text,text,text,text,integer) from public,anon,service_role;
grant execute on function public.shared_decision_dashboard_v1(text,text,text,text,integer) to authenticated;

create or replace function public.shared_decision_detail_v1(p_call uuid,p_review_cursor text default null,p_outcome_cursor text default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; item jsonb; n integer:=least(greatest(coalesce(p_limit,50),1),100);
 ra timestamptz; ri uuid; oa timestamptz; oi uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Permanent sign-in required'; end if;
 item:=private.shared_decision_item_v1(p_call,'latest'); if item is null then raise exception 'Shared call not found'; end if;
 if p_review_cursor is not null then ra:=(p_review_cursor::jsonb->>'at')::timestamptz;ri:=(p_review_cursor::jsonb->>'id')::uuid; if ra is null or ri is null then raise exception 'Invalid review cursor';end if;end if;
 if p_outcome_cursor is not null then oa:=(p_outcome_cursor::jsonb->>'at')::timestamptz;oi:=(p_outcome_cursor::jsonb->>'id')::uuid; if oa is null or oi is null then raise exception 'Invalid outcome cursor';end if;end if;
 with reviews as materialized (select * from public.shared_decision_reviews where call_id=p_call and (ra is null or (published_at,id)>(ra,ri)) order by published_at,id limit n),
 outcomes as materialized (select * from public.shared_decision_outcomes where call_id=p_call and (oa is null or (as_of,id)>(oa,oi)) order by as_of,id limit n)
 select jsonb_build_object('item',item,
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'publishedAt',published_at,'sourceCutoff',source_cutoff,'thesis',thesis,'risks',risks,'modelIdentity',model_identity,'assessmentId',assessment_id) order by published_at,id) from reviews),'[]'::jsonb),
 'outcomes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'asOf',as_of,'recordedAt',recorded_at,'price',price::text,'netReturn',net_return::text,'benchmarkReturn',benchmark_return::text,'reason',reason) order by as_of,id) from outcomes),'[]'::jsonb),
 'reviewNextCursor',case when exists(select 1 from public.shared_decision_reviews r where r.call_id=p_call and (r.published_at,r.id)>(select published_at,id from reviews order by published_at desc,id desc limit 1)) then (select jsonb_build_object('at',published_at,'id',id)::text from reviews order by published_at desc,id desc limit 1) else null end,
 'outcomeNextCursor',case when exists(select 1 from public.shared_decision_outcomes o where o.call_id=p_call and (o.as_of,o.id)>(select as_of,id from outcomes order by as_of desc,id desc limit 1)) then (select jsonb_build_object('at',as_of,'id',id)::text from outcomes order by as_of desc,id desc limit 1) else null end,
 'evidence',jsonb_build_object('status','unverified','message','Sanitized source and price evidence projection is pending; raw inputs remain private','methodology','shared-decision-lab-v1','costPerSide','0.001')) into result;
 return result;
end $$;
revoke all on function public.shared_decision_detail_v1(uuid,text,text,integer) from public,anon,service_role;
grant execute on function public.shared_decision_detail_v1(uuid,text,text,integer) to authenticated;
