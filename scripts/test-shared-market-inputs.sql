begin;
do $$
declare days jsonb; sessions jsonb; calendar_id uuid; rejected boolean;
begin
 days:='[{"date":"2026-09-19","status":"CLOSED","reason":"Fixture weekend"},{"date":"2026-09-20","status":"CLOSED","reason":"Fixture weekend"},{"date":"2026-09-21","status":"OPEN","opens_at":"2026-09-21T13:30:00Z","closes_at":"2026-09-21T20:00:00Z"}]';
 sessions:='[{"id":"FIXTURE:2026-09-21","opens_at":"2026-09-21T13:30:00Z","closes_at":"2026-09-21T20:00:00Z"}]';
 insert into private.shared_market_calendars(exchange_code,revision,time_zone,coverage_start,coverage_end,verified_at,valid_until,reference,manifest_hash,days,sessions)
 values('FIXTURE','rollback-calendar-test','America/New_York','2026-09-19T04:00:00Z','2026-09-22T04:00:00Z',now()-interval '1 minute',now()+interval '1 day','Rollback-only synthetic source',repeat('0',64),days,sessions) returning id into calendar_id;
 rejected:=false;
 begin
  update private.shared_market_calendars set reference='Changed source cannot rewrite revision' where id=calendar_id;
 exception when raise_exception then if sqlerrm<>'IMMUTABLE_CALENDAR_REVISION' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'IMMUTABILITY_FAILED';end if;
 rejected:=false;
 begin
  insert into private.shared_market_calendars(exchange_code,revision,time_zone,coverage_start,coverage_end,verified_at,valid_until,reference,manifest_hash,days,sessions)
  values('FIXTURE','bad-missing-day','America/New_York','2026-09-19T04:00:00Z','2026-09-22T04:00:00Z',now(),now()+interval '1 day','Rollback-only synthetic source',repeat('0',64),days-1,sessions);
 exception when raise_exception then if sqlerrm<>'INCOMPLETE_CALENDAR_DAYS' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'MISSING_DAY_ACCEPTED';end if;
 rejected:=false;
 begin
  insert into private.shared_market_calendars(exchange_code,revision,time_zone,coverage_start,coverage_end,verified_at,valid_until,reference,manifest_hash,days,sessions)
  values('FIXTURE','bad-no-zone','America/New_York','2026-09-19T04:00:00Z','2026-09-22T04:00:00Z',now(),now()+interval '1 day','Rollback-only synthetic source',repeat('0',64),jsonb_set(days,'{2,opens_at}','"2026-09-21T13:30:00"'),sessions);
 exception when raise_exception then if sqlerrm<>'EXPLICIT_SESSION_TIMEZONE_REQUIRED' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'TIMEZONE_LESS_ACCEPTED';end if;
 if has_table_privilege('authenticated','private.shared_market_calendars','SELECT') or has_function_privilege('authenticated','private.shared_evaluation_snapshot_v1(uuid)','EXECUTE') or has_function_privilege('service_role','private.shared_evaluation_snapshot_v1(uuid)','EXECUTE') then raise exception 'PRIVATE_BOUNDARY_FAILED';end if;
end $$;
rollback;
select 'PASS: calendar completeness, immutability, timezone and permissions; fixtures rolled back' result;
