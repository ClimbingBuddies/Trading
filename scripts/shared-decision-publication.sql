-- SOURCE ONLY. Apply after scripts/shared-decision-lab.sql in a reviewed migration.
-- No provider mappings are inferred. Evaluator persistence deliberately fails closed.
begin;
create table private.shared_decision_config (
 instrument_id uuid primary key references public.instruments(id),
 provider_id uuid not null references public.data_providers(id),
 benchmark_instrument_id uuid not null references public.instruments(id),
 verified_at timestamptz not null check(verified_at<=clock_timestamp()),
 verification_reference text not null check(length(trim(verification_reference))>=20),
 enabled boolean not null default false,
 check(instrument_id<>benchmark_instrument_id)
);
create table private.shared_decision_evaluation_state (
 call_id uuid primary key references public.shared_decision_calls(id),
 evaluated_through timestamptz,
 version bigint not null default 0 check(version>=0),
 data_status text not null default 'UNVERIFIED' check(data_status in ('READY','MISSING_DATA','CALENDAR_REQUIRED','UNVERIFIED')),
 last_attempt_at timestamptz,
 blocker_code text
);
alter table private.shared_decision_config enable row level security;
alter table private.shared_decision_evaluation_state enable row level security;
revoke all on private.shared_decision_config,private.shared_decision_evaluation_state from public,anon,authenticated,service_role;

-- Cross-table uniqueness: an assessment can be consumed exactly once.
create table private.shared_decision_assessment_usage (
 assessment_id uuid primary key references public.gpt_market_assessments(assessment_id),
 call_id uuid not null references public.shared_decision_calls(id),
 event_id uuid not null unique,
 event_kind text not null check(event_kind in ('CALL','REVIEW'))
);
alter table private.shared_decision_assessment_usage enable row level security;
revoke all on private.shared_decision_assessment_usage from public,anon,authenticated,service_role;
insert into private.shared_decision_assessment_usage
 select assessment_id,id,id,'CALL' from public.shared_decision_calls
 union all select assessment_id,call_id,id,'REVIEW' from public.shared_decision_reviews;
-- Existing cross-table duplicates abort this migration rather than discarding history.
create function private.register_shared_assessment_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_TABLE_NAME='shared_decision_calls' then
  insert into private.shared_decision_assessment_usage values(new.assessment_id,new.id,new.id,'CALL');
 else
  insert into private.shared_decision_assessment_usage values(new.assessment_id,new.call_id,new.id,'REVIEW');
 end if;
 return new;
end $$;
create trigger shared_call_assessment_usage after insert on public.shared_decision_calls
 for each row execute function private.register_shared_assessment_v1();
create trigger shared_review_assessment_usage after insert on public.shared_decision_reviews
 for each row execute function private.register_shared_assessment_v1();

create function private.shared_decision_input_v1(p_assessment uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record; cfg record; prices jsonb; benchmarks jsonb; history jsonb;
begin
 select ass.*,r.analysis_cutoff_time,r.completed_at,trim(i.currency_code) currency
 into a from public.gpt_market_assessments ass
 join public.gpt_market_runs r on r.run_id=ass.run_id
 join public.instruments i on i.id=ass.instrument_id
 where ass.assessment_id=p_assessment and not ass.technical_engine_input_used
 and i.is_active and i.asset_type in ('equity','etf') and i.currency_code is not null
 and r.analysis_mode='scheduled' and r.status in ('succeeded','partial')
 and r.completed_at<=clock_timestamp() and ass.created_at<=clock_timestamp()
 and r.analysis_cutoff_time between clock_timestamp()-interval '24 hours' and r.completed_at;
 if a.assessment_id is null then raise exception 'FRESH_PUBLISHED_ASSESSMENT_REQUIRED'; end if;
 if not exists(select 1 from public.watchlist_items where instrument_id=a.instrument_id)
 and not exists(select 1 from public.shared_decision_calls c where c.instrument_id=a.instrument_id
  and not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in ('EXIT','CANCELLED')))
 then raise exception 'WATCHED_OR_OPEN_INSTRUMENT_REQUIRED'; end if;
 if exists(select 1 from public.gpt_market_assessments n join public.gpt_market_runs r on r.run_id=n.run_id
 where n.instrument_id=a.instrument_id and n.created_at>a.created_at and not n.technical_engine_input_used
 and r.analysis_mode='scheduled' and r.status in ('succeeded','partial') and r.completed_at is not null)
 then raise exception 'NEWER_ASSESSMENT_AVAILABLE'; end if;
 select * into cfg from private.shared_decision_config where instrument_id=a.instrument_id and enabled;
 if cfg.instrument_id is null then raise exception 'VERIFIED_PROVIDER_BENCHMARK_CONFIGURATION_REQUIRED'; end if;
 if not exists(select 1 from public.data_providers where id=cfg.provider_id and is_active)
 or not exists(select 1 from public.instruments where id=cfg.benchmark_instrument_id and is_active and trim(currency_code)=a.currency)
 or (select count(*) from public.provider_instruments where instrument_id=a.instrument_id and provider_id=cfg.provider_id and is_active)<>1
 or (select count(*) from public.provider_instruments where instrument_id=cfg.benchmark_instrument_id and provider_id=cfg.provider_id and is_active)<>1
 then raise exception 'CANONICAL_MAPPING_OR_CURRENCY_INVALID'; end if;
 select jsonb_agg(to_jsonb(x) order by x.observed_at,x.id) into prices from (
 select id,instrument_id,provider_id,observed_at,loaded_at,currency_code,close,adjusted_close from public.market_observations
 where instrument_id=a.instrument_id and provider_id=cfg.provider_id and interval_code='1day'
 and trim(currency_code)=a.currency and close>0 and adjusted_close>0 and close::text not in ('NaN','Infinity','-Infinity')
 and adjusted_close::text not in ('NaN','Infinity','-Infinity') and loaded_at<=a.analysis_cutoff_time
 and observed_at<date_trunc('day',a.analysis_cutoff_time at time zone 'UTC') at time zone 'UTC'
 order by observed_at desc,id limit 60) x;
 select jsonb_agg(to_jsonb(x) order by x.observed_at,x.id) into benchmarks from (
 select id,instrument_id,provider_id,observed_at,loaded_at,currency_code,close,adjusted_close from public.market_observations
 where instrument_id=cfg.benchmark_instrument_id and provider_id=cfg.provider_id and interval_code='1day'
 and trim(currency_code)=a.currency and close>0 and adjusted_close>0 and close::text not in ('NaN','Infinity','-Infinity')
 and adjusted_close::text not in ('NaN','Infinity','-Infinity') and loaded_at<=a.analysis_cutoff_time
 and observed_at<date_trunc('day',a.analysis_cutoff_time at time zone 'UTC') at time zone 'UTC'
 order by observed_at desc,id limit 60) x;
 if coalesce(jsonb_array_length(prices),0)<20 or coalesce(jsonb_array_length(benchmarks),0)<20
 then raise exception 'TWENTY_DAILY_OBSERVATIONS_REQUIRED'; end if;
 if (prices->-1->>'observed_at')::timestamptz<clock_timestamp()-interval '4 days'
 or (benchmarks->-1->>'observed_at')::timestamptz<clock_timestamp()-interval '4 days'
 then raise exception 'DAILY_EVIDENCE_STALE'; end if;
 if exists(select 1 from jsonb_array_elements(prices) x group by x->>'observed_at' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(benchmarks) x group by x->>'observed_at' having count(*)>1)
 then raise exception 'DUPLICATE_DAILY_EVIDENCE'; end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.published_at,e.id),'[]'::jsonb) into history from (
 select id,assessment_id,published_at,source_cutoff,action,thesis,risks from public.shared_decision_calls where instrument_id=a.instrument_id
 union all select r.id,r.assessment_id,r.published_at,r.source_cutoff,r.action,r.thesis,r.risks from public.shared_decision_reviews r
 join public.shared_decision_calls c on c.id=r.call_id where c.instrument_id=a.instrument_id) e;
 return jsonb_build_object('assessment',to_jsonb(a),'configuration',to_jsonb(cfg),
 'prices',prices,'benchmark_prices',benchmarks,'history',history,'methodology','shared-decision-lab-v1');
end $$;

create function private.publish_shared_decision_v1(p_assessment uuid,p_action text,p_thesis text,p_risks text,p_model text,p_input_hash text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare instrument uuid; bundle jsonb; computed text; cycle public.shared_decision_calls%rowtype;
 old_event record; ident uuid; pub timestamptz; cutoff timestamptz; watermark timestamptz;
begin
 select instrument_id into instrument from public.gpt_market_assessments where assessment_id=p_assessment;
 if instrument is null then raise exception 'ASSESSMENT_NOT_FOUND'; end if;
 -- All publishers and future evaluators must share this instrument lock.
 perform pg_advisory_xact_lock(hashtextextended('shared-decision:'||instrument::text,0));
 select u.call_id,e.* into old_event from private.shared_decision_assessment_usage u join lateral (
 select action,thesis,risks,model_identity,input_hash from public.shared_decision_calls where id=u.event_id
 union all select action,thesis,risks,model_identity,input_hash from public.shared_decision_reviews where id=u.event_id) e on true
 where u.assessment_id=p_assessment;
 if found then
  if old_event.action is distinct from p_action or old_event.thesis is distinct from trim(p_thesis)
  or old_event.risks is distinct from trim(p_risks) or old_event.model_identity is distinct from trim(p_model)
  or old_event.input_hash is distinct from p_input_hash then raise exception 'ASSESSMENT_RETRY_PAYLOAD_MISMATCH'; end if;
  return old_event.call_id;
 end if;
 bundle:=private.shared_decision_input_v1(p_assessment);
 computed:=encode(sha256(convert_to(bundle::text,'UTF8')),'hex');
 if p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$' or p_input_hash<>computed then raise exception 'INPUT_HASH_MISMATCH'; end if;
 cutoff:=(bundle->'assessment'->>'analysis_cutoff_time')::timestamptz;
 pub:=clock_timestamp();
 select * into cycle from public.shared_decision_calls c where c.instrument_id=instrument
 and not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in ('EXIT','CANCELLED'))
 order by published_at desc,id desc limit 1 for update;
 if (select count(*) from public.shared_decision_calls c where c.instrument_id=instrument
 and not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in ('EXIT','CANCELLED')))>1
 then raise exception 'MULTIPLE_OPEN_CYCLES_REQUIRE_REVIEW'; end if;
 select max(t) into watermark from (
 select published_at t from public.shared_decision_calls where instrument_id=instrument
 union all select r.published_at from public.shared_decision_reviews r join public.shared_decision_calls c on c.id=r.call_id where c.instrument_id=instrument
 union all select s.evaluated_through from private.shared_decision_evaluation_state s join public.shared_decision_calls c on c.id=s.call_id where c.instrument_id=instrument
 union all select o.recorded_at from public.shared_decision_outcomes o join public.shared_decision_calls c on c.id=o.call_id where c.instrument_id=instrument) q;
 if pub<=watermark then raise exception 'PUBLICATION_BEHIND_EVALUATION_WATERMARK'; end if;
 if cycle.id is not null then
  if cutoff<=greatest(cycle.source_cutoff,(select max(source_cutoff) from public.shared_decision_reviews where call_id=cycle.id)) then raise exception 'NEWER_EVIDENCE_REQUIRED'; end if;
  if cycle.provider_id<>(bundle->'configuration'->>'provider_id')::uuid
  or cycle.benchmark_instrument_id<>(bundle->'configuration'->>'benchmark_instrument_id')::uuid
  or cycle.currency<>bundle->'assessment'->>'currency' then raise exception 'CYCLE_CONFIGURATION_CHANGED'; end if;
  insert into public.shared_decision_reviews(call_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash)
  values(cycle.id,p_assessment,pub,cutoff,p_action,trim(p_thesis),trim(p_risks),trim(p_model),p_input_hash);
  update private.shared_decision_evaluation_state set data_status='UNVERIFIED', blocker_code='NEW_REVIEW_REQUIRES_EVALUATION' where call_id=cycle.id;
  ident:=cycle.id;
 else
  insert into public.shared_decision_calls(instrument_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
  values(instrument,p_assessment,pub,cutoff,p_action,trim(p_thesis),trim(p_risks),trim(p_model),p_input_hash,
  (bundle->'configuration'->>'provider_id')::uuid,(bundle->'configuration'->>'benchmark_instrument_id')::uuid,bundle->'assessment'->>'currency') returning id into ident;
  insert into private.shared_decision_evaluation_state(call_id) values(ident);
 end if;
 insert into private.shared_decision_evidence(assessment_id,input_hash,snapshot) values(p_assessment,p_input_hash,bundle);
 return ident;
end $$;

-- This gate is intentionally unconditional. A reviewed database-owned evaluator must
-- replace it, validate stored source observations/calendar, and advance the watermark
-- atomically under the publisher's instrument lock. No unchecked JSON write API exists.
create function private.shared_outcome_gate_v1() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED'; end $$;
create trigger shared_outcome_adapter_gate before insert on public.shared_decision_outcomes
 for each row execute function private.shared_outcome_gate_v1();
create function private.shared_decision_candidates_v1()
returns table(instrument_id uuid,symbol text,assessment_id uuid,input_hash text,input jsonb,block_reason text)
language plpgsql security definer set search_path=pg_catalog as $$
declare item record;
begin
 for item in select i.id,i.symbol::text symbol from public.instruments i where i.is_active and (
 exists(select 1 from public.watchlist_items w where w.instrument_id=i.id) or
 exists(select 1 from public.shared_decision_calls c where c.instrument_id=i.id and not exists(
 select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in ('EXIT','CANCELLED')))) order by i.id
 loop
  instrument_id:=item.id; symbol:=item.symbol; assessment_id:=null; input_hash:=null; input:=null; block_reason:=null;
  select a.assessment_id into assessment_id from public.gpt_market_assessments a join public.gpt_market_runs r on r.run_id=a.run_id
  where a.instrument_id=item.id and not a.technical_engine_input_used and r.analysis_mode='scheduled'
  and r.status in ('succeeded','partial') and r.completed_at is not null order by a.created_at desc,a.assessment_id desc limit 1;
  if assessment_id is null then block_reason:='FRESH_PUBLISHED_ASSESSMENT_REQUIRED';
  else
   begin
    input:=private.shared_decision_input_v1(assessment_id);
    input_hash:=encode(sha256(convert_to(input::text,'UTF8')),'hex');
    if exists(select 1 from private.shared_decision_assessment_usage u where u.assessment_id=shared_decision_candidates_v1.assessment_id)
    then block_reason:='ASSESSMENT_ALREADY_PUBLISHED'; end if;
   exception when others then block_reason:=SQLERRM; input:=null; input_hash:=null;
   end;
  end if;
  return next;
 end loop;
end $$;
revoke all on function private.shared_decision_input_v1(uuid),private.publish_shared_decision_v1(uuid,text,text,text,text,text),
 private.shared_decision_candidates_v1(),private.register_shared_assessment_v1(),private.shared_outcome_gate_v1() from public,anon,authenticated,service_role;
commit;
