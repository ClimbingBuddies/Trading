-- Run after migration as an administrative DB role. No persistent test records.
begin;
do $$
declare f text;
begin
 foreach f in array array['private.shared_decision_input_v1(uuid)',
 'private.publish_shared_decision_v1(uuid,text,text,text,text,text)',
 'private.shared_decision_candidates_v1()'] loop
  if has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE')
  or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'Unexpected publication capability: %',f; end if;
 end loop;
 if exists(select assessment_id from (
 select assessment_id from public.shared_decision_calls union all select assessment_id from public.shared_decision_reviews) q
 group by assessment_id having count(*)>1) then raise exception 'Cross-table duplicate'; end if;
 if (select count(*) from private.shared_decision_assessment_usage)<>(
 (select count(*) from public.shared_decision_calls)+(select count(*) from public.shared_decision_reviews))
 then raise exception 'Assessment registry mismatch'; end if;
 if not exists(select 1 from pg_trigger where tgname='shared_outcome_adapter_gate' and tgenabled='O')
 then raise exception 'Unverified evaluator writes not gated'; end if;
 begin
  perform private.publish_shared_decision_v1('00000000-0000-0000-0000-000000000000','BUY','Test thesis only, never published','Test risks only, never published','test',repeat('0',64));
  raise exception 'Missing assessment accepted';
 exception when others then if SQLERRM<>'ASSESSMENT_NOT_FOUND' then raise; end if;
 end;
end $$;
rollback;
