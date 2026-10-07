-- Compact table projection. Requires shared-action-performance.sql, including
-- private.shared_action_read_blocker_v1. Read-only: no evaluations or writes.
begin;
create or replace function public.shared_decision_action_status_v1(
 p_calls uuid[], p_scope text default 'all', p_horizon integer default 5
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 user_id uuid:=auth.uid(); row_value record; state_text text; reason text;
 action_return numeric; checkpoint timestamptz; items jsonb:='[]'::jsonb;
begin
 if user_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Permanent sign-in required';
 end if;
 if p_calls is null or cardinality(p_calls)>100 or coalesce(array_ndims(p_calls),1)<>1
  or array_position(p_calls,null) is not null
  or p_scope is null or p_scope not in('all','watched')
  or p_horizon is null or p_horizon not in(5,20) then
  raise exception 'Invalid filter';
 end if;
 for row_value in
  with requested as (
   select call_id,min(ord) position from unnest(p_calls) with ordinality r(call_id,ord) group by call_id
  )
  select c.id call_id,event.id event_id,t.status,t.blocker,t.result
  from requested request
  join public.shared_decision_calls c on c.id=request.call_id
  cross join lateral (
   select v.id from (
    select c.id,c.published_at
    union all
    select r.id,r.published_at from public.shared_decision_reviews r where r.call_id=c.id
   ) v order by v.published_at desc,v.id desc limit 1
  ) event
  left join private.shared_action_trials t on t.call_id=c.id and t.event_id=event.id and t.horizon=p_horizon
  where p_scope='all' or exists (
   select 1 from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id
   where wi.instrument_id=c.instrument_id and w.owner_user_id=user_id
  )
  order by request.position
 loop
  state_text:=coalesce(row_value.status,'pending');
  reason:=null;action_return:=null;checkpoint:=null;
  if state_text='matured' then
   reason:=private.shared_action_read_blocker_v1(row_value.call_id,row_value.event_id,p_horizon);
   if reason is null then
    begin
     if jsonb_typeof(row_value.result#>'{metrics,actionReturn}') is distinct from 'number'
      or jsonb_array_length(row_value.result->'path') is distinct from p_horizon+1 then
      raise exception 'ACTION_RESULT_UNVERIFIED';
     end if;
     action_return:=(row_value.result#>>'{metrics,actionReturn}')::numeric;
     checkpoint:=(row_value.result#>>array['path',p_horizon::text,'session','closes_at'])::timestamptz;
     if action_return is null or action_return::text in('NaN','Infinity','-Infinity')
      or checkpoint is null or checkpoint>statement_timestamp() then
      raise exception 'ACTION_RESULT_UNVERIFIED';
     end if;
    exception when others then
     reason:='ACTION_RESULT_UNVERIFIED';
    end;
   end if;
   if reason is not null then state_text:='blocked';end if;
  elsif state_text='blocked' then
   reason:=coalesce(row_value.blocker,'ACTION_EVIDENCE_UNVERIFIED');
  elsif state_text<>'pending' then
   state_text:='blocked';reason:='ACTION_RESULT_UNVERIFIED';
  end if;
  -- Only safe machine codes are public. Never expose exception detail or evidence.
  if reason is not null and reason !~ '^[A-Z0-9_]{1,100}$' then reason:='ACTION_EVIDENCE_UNVERIFIED';end if;
  items:=items||jsonb_build_array(jsonb_build_object(
   'callId',row_value.call_id,'eventId',row_value.event_id,'status',state_text,
   'actionReturn',case when state_text='matured' then action_return::text else null end,
   'asOf',case when state_text='matured' then to_char(checkpoint at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') else null end,
   'blocker',reason
  ));
 end loop;
 return jsonb_build_object('contractVersion',1,'horizon',p_horizon,'items',items);
end $$;
revoke all on function public.shared_decision_action_status_v1(uuid[],text,integer) from public,anon,authenticated,service_role;
grant execute on function public.shared_decision_action_status_v1(uuid[],text,integer) to authenticated;
commit;
