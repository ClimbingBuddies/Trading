-- Additive shared Decision Lab foundation. Existing personal history is untouched.
-- Publication/evaluation must be wired before the UI switches to these tables.
create table public.shared_decision_calls (
 id uuid primary key default gen_random_uuid(),
 instrument_id uuid not null references public.instruments(id),
 assessment_id uuid not null unique references public.gpt_market_assessments(assessment_id),
 published_at timestamptz not null default clock_timestamp(),
 source_cutoff timestamptz not null check(source_cutoff<=published_at),
 action text not null check(action in ('BUY','WAIT','HOLD','SELL','REDUCE','AVOID')),
 thesis text not null check(length(trim(thesis)) between 20 and 8000),
 risks text not null check(length(trim(risks)) between 20 and 8000),
 model_identity text not null check(length(trim(model_identity)) between 1 and 200),
 input_hash text not null check(length(input_hash)=64),
 provider_id uuid not null references public.data_providers(id),
 benchmark_instrument_id uuid not null references public.instruments(id),
 currency text not null check(length(currency)=3),
 methodology text not null default 'shared-decision-lab-v1' check(methodology='shared-decision-lab-v1'),
 cost_per_side numeric not null default 0.001 check(cost_per_side=0.001),
 check(instrument_id<>benchmark_instrument_id)
);
create index shared_calls_instrument on public.shared_decision_calls(instrument_id,published_at desc);

-- Reviews append to an original call; unchanged views still have a dated review.
create table public.shared_decision_reviews (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null references public.shared_decision_calls(id),
 assessment_id uuid not null unique references public.gpt_market_assessments(assessment_id),
 published_at timestamptz not null default clock_timestamp(),
 source_cutoff timestamptz not null check(source_cutoff<=published_at),
 action text not null check(action in ('BUY','WAIT','HOLD','SELL','REDUCE','AVOID')),
 thesis text not null check(length(trim(thesis)) between 20 and 8000),
 risks text not null check(length(trim(risks)) between 20 and 8000),
 model_identity text not null check(length(trim(model_identity)) between 1 and 200),
 input_hash text not null check(length(input_hash)=64)
);
create index shared_reviews_call on public.shared_decision_reviews(call_id,published_at);

create table public.shared_decision_outcomes (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null references public.shared_decision_calls(id),
 kind text not null check(kind in ('ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20','DATA_GAP','CANCELLED')),
 as_of timestamptz not null, recorded_at timestamptz not null default clock_timestamp(),
 price numeric check(price>0), net_return numeric, benchmark_return numeric,
 reason text, evidence jsonb not null default '{}',
 unique(call_id,kind,as_of), check(as_of<=recorded_at),
 check(kind not in ('ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20') or price is not null),
 check(kind not in ('EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20') or (net_return is not null and benchmark_return is not null)),
 check(kind not in ('DATA_GAP','CANCELLED') or (net_return is null and benchmark_return is null))
);
create unique index shared_outcome_once on public.shared_decision_outcomes(call_id,kind)
 where kind in ('ENTRY','EXIT','CHECKPOINT_5','CHECKPOINT_20','CANCELLED');

-- No private notes or user identifiers belong in shared snapshots.
-- Keep raw generation evidence private until a safe display projection is implemented.
create table private.shared_decision_evidence (
 assessment_id uuid primary key references public.gpt_market_assessments(assessment_id),
 input_hash text not null check(length(input_hash)=64),
 snapshot jsonb not null, recorded_at timestamptz not null default clock_timestamp()
);
alter table private.shared_decision_evidence enable row level security;
revoke all on private.shared_decision_evidence from public,anon,authenticated,service_role;

create table public.shared_decision_private_notes (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null references public.shared_decision_calls(id),
 owner_user_id uuid not null references auth.users(id),
 action text not null check(action in ('BUY','WAIT','HOLD','SELL','REDUCE','NOTE')),
 note text not null check(length(trim(note)) between 3 and 12000),
 created_at timestamptz not null default clock_timestamp(),
 request_id uuid not null, unique(owner_user_id,request_id)
);
create index shared_notes_owner_call on public.shared_decision_private_notes(owner_user_id,call_id,created_at);

alter table public.shared_decision_calls enable row level security;
alter table public.shared_decision_reviews enable row level security;
alter table public.shared_decision_outcomes enable row level security;
alter table public.shared_decision_private_notes enable row level security;
revoke all on public.shared_decision_calls,public.shared_decision_reviews,public.shared_decision_outcomes,public.shared_decision_private_notes from public,anon,authenticated,service_role;
grant select on public.shared_decision_calls,public.shared_decision_reviews,public.shared_decision_outcomes,public.shared_decision_private_notes to authenticated;
create policy shared_calls_read on public.shared_decision_calls for select to authenticated
 using((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy shared_reviews_read on public.shared_decision_reviews for select to authenticated
 using((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy shared_outcomes_read on public.shared_decision_outcomes for select to authenticated
 using((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy shared_private_notes_read on public.shared_decision_private_notes for select to authenticated
 using(owner_user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));

create trigger shared_calls_immutable before update or delete on public.shared_decision_calls
 for each row execute function private.reject_prediction_change_v1();
create trigger shared_reviews_immutable before update or delete on public.shared_decision_reviews
 for each row execute function private.reject_prediction_change_v1();
create trigger shared_outcomes_immutable before update or delete on public.shared_decision_outcomes
 for each row execute function private.reject_prediction_change_v1();
create trigger shared_notes_immutable before update or delete on public.shared_decision_private_notes
 for each row execute function private.reject_prediction_change_v1();
create trigger shared_evidence_immutable before update or delete on private.shared_decision_evidence
 for each row execute function private.reject_prediction_change_v1();

create function public.append_shared_decision_private_note(p_call uuid,p_action text,p_note text,p_request uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare ident uuid; owner_id uuid:=auth.uid();
begin
 if owner_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Permanent sign-in required';
 end if;
 if p_action is null or p_action not in ('BUY','WAIT','HOLD','SELL','REDUCE','NOTE')
  or coalesce(length(trim(p_note)),0) not between 3 and 12000 or p_request is null then
  raise exception 'Choose a view and provide a note';
 end if;
 if not exists(select 1 from public.shared_decision_calls where id=p_call) then raise exception 'Shared call not found'; end if;
 insert into public.shared_decision_private_notes(call_id,owner_user_id,action,note,request_id)
 values(p_call,owner_id,p_action,trim(p_note),p_request)
 on conflict(owner_user_id,request_id) do nothing returning id into ident;
 if ident is null then
  select id into ident from public.shared_decision_private_notes
  where owner_user_id=owner_id and request_id=p_request and call_id=p_call and action=p_action and note=trim(p_note);
 end if;
 if ident is null then raise exception 'Request identifier already used'; end if;
 return ident;
end $$;
revoke all on function public.append_shared_decision_private_note(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.append_shared_decision_private_note(uuid,text,text,uuid) to authenticated;
