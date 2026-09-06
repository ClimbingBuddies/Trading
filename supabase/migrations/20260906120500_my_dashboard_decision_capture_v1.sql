-- MYDASH-006 phase 1: immutable, owner-scoped decision capture.
-- Authenticated callers may capture paper decisions or persisted AI signals only
-- through constrained RPCs. This migration does not evaluate returns or trade.

create table public.personal_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  source_type text not null,
  source_action text not null,
  action text not null,
  horizon_sessions smallint not null,
  decision_at timestamptz not null,
  source_table text not null,
  source_record_key text not null,
  source_snapshot jsonb not null,
  source_hash text not null,
  source_cutoff timestamptz not null,
  entry_rule text not null default 'NEXT_DAILY_CLOSE',
  benchmark_mode text not null default 'NONE',
  benchmark_instrument_id uuid references public.instruments(id) on delete restrict,
  notional_amount numeric(30,12) not null default 1000,
  entry_fee_bps numeric(9,4) not null default 0,
  exit_fee_bps numeric(9,4) not null default 0,
  entry_slippage_bps numeric(9,4) not null default 0,
  exit_slippage_bps numeric(9,4) not null default 0,
  base_currency character(3) not null,
  instrument_currency character(3) not null,
  calculation_version text not null default 'personal-forward-return-v1',
  created_at timestamptz not null default clock_timestamp(),
  constraint personal_decisions_owner_identity_key unique (id, owner_user_id),
  constraint personal_decisions_source_type_check check (source_type in ('AI_SIGNAL', 'USER_PAPER')),
  constraint personal_decisions_action_check check (action in ('BUY', 'WATCH', 'HOLD', 'PASS', 'AVOID')),
  constraint personal_decisions_horizon_check check (horizon_sessions in (5, 20, 60)),
  constraint personal_decisions_snapshot_check check (jsonb_typeof(source_snapshot) = 'object'),
  constraint personal_decisions_cutoff_check check (source_cutoff <= decision_at),
  constraint personal_decisions_entry_rule_check check (entry_rule = 'NEXT_DAILY_CLOSE'),
  constraint personal_decisions_benchmark_check check (
    (benchmark_mode = 'NONE' and benchmark_instrument_id is null) or
    (benchmark_mode in ('OWNER_SELECTED', 'APPROVED_MAPPING') and benchmark_instrument_id is not null)
  ),
  constraint personal_decisions_notional_check check (notional_amount > 0),
  constraint personal_decisions_entry_fee_check check (entry_fee_bps between 0 and 1000),
  constraint personal_decisions_exit_fee_check check (exit_fee_bps between 0 and 1000),
  constraint personal_decisions_entry_slippage_check check (entry_slippage_bps between 0 and 1000),
  constraint personal_decisions_exit_slippage_check check (exit_slippage_bps between 0 and 1000),
  constraint personal_decisions_base_currency_check check (base_currency = upper(base_currency) and base_currency ~ '^[A-Z]{3}$'),
  constraint personal_decisions_instrument_currency_check check (instrument_currency = upper(instrument_currency) and instrument_currency ~ '^[A-Z]{3}$'),
  constraint personal_decisions_source_contract_check check (
    (source_type = 'AI_SIGNAL' and source_table = 'gpt_market_assessments' and decision_at = source_cutoff) or
    (source_type = 'USER_PAPER' and source_table = 'user_action_snapshot' and decision_at = source_cutoff)
  )
);

create index personal_decisions_owner_decision_idx
  on public.personal_decisions (owner_user_id, decision_at desc);
create index personal_decisions_instrument_idx
  on public.personal_decisions (instrument_id, decision_at desc);
create unique index personal_decisions_ai_source_key
  on public.personal_decisions (owner_user_id, source_type, source_table, source_record_key)
  where source_type = 'AI_SIGNAL';

create table public.personal_decision_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null,
  event_type text not null,
  event_at timestamptz not null default clock_timestamp(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint personal_decision_events_parent_owner_fk foreign key (decision_id, owner_user_id)
    references public.personal_decisions(id, owner_user_id) on delete cascade,
  constraint personal_decision_events_type_check check (event_type in ('EXIT', 'CANCEL', 'NOTE', 'REVIEW')),
  constraint personal_decision_events_payload_check check (jsonb_typeof(payload) = 'object')
);

create index personal_decision_events_owner_decision_idx
  on public.personal_decision_events (owner_user_id, decision_id, event_at desc);
create unique index personal_decision_events_one_terminal_idx
  on public.personal_decision_events (decision_id)
  where event_type in ('EXIT', 'CANCEL');

alter table public.portfolio_positions
  add constraint portfolio_positions_source_decision_fk
  foreign key (source_decision_id, owner_user_id)
  references public.personal_decisions(id, owner_user_id)
  on delete restrict;

create or replace function public.reject_personal_decision_mutation_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Personal decision evidence is immutable';
end;
$$;

create trigger personal_decisions_immutable
before update or delete on public.personal_decisions
for each row execute function public.reject_personal_decision_mutation_v1();

create trigger personal_decision_events_immutable
before update or delete on public.personal_decision_events
for each row execute function public.reject_personal_decision_mutation_v1();

alter table public.personal_decisions enable row level security;
alter table public.personal_decision_events enable row level security;

create policy personal_decisions_owner_select on public.personal_decisions for select to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));

create policy personal_decision_events_owner_select on public.personal_decision_events for select to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
  and exists (
    select 1 from public.personal_decisions d
    where d.id = decision_id and d.owner_user_id = owner_user_id
  )
);

revoke all on table public.personal_decisions from public, anon, authenticated;
revoke all on table public.personal_decision_events from public, anon, authenticated;
grant select on table public.personal_decisions to authenticated;
grant select on table public.personal_decision_events to authenticated;
grant all on table public.personal_decisions to service_role;
grant all on table public.personal_decision_events to service_role;

create or replace function public.list_eligible_personal_ai_decision_sources_v1()
returns table (assessment_id uuid)
language sql
security definer
set search_path = pg_catalog
stable
as $$
  select a.assessment_id
  from public.gpt_market_assessments a
  join public.gpt_market_runs r on r.run_id = a.run_id
  where auth.uid() is not null
    and coalesce(((auth.jwt()->>'is_anonymous')::boolean), false) = false
    and r.status = 'succeeded'
    and r.completed_at is not null and r.completed_at <= statement_timestamp()
    and r.analysis_cutoff_time is not null and r.analysis_cutoff_time <= r.completed_at
    and a.technical_engine_input_used is false
    and (select count(*) from public.data_providers dp
      join public.provider_instruments pi on pi.provider_id = dp.id
      where dp.provider_code = 'tiingo' and dp.is_active and pi.is_active
        and pi.instrument_id = a.instrument_id) = 1
    and not exists (
      select 1 from public.market_observations mo
      join public.data_providers dp on dp.id = mo.provider_id
      join public.provider_instruments pi on pi.provider_id = dp.id and pi.instrument_id = a.instrument_id
      where dp.provider_code = 'tiingo' and dp.is_active and pi.is_active
        and mo.instrument_id = a.instrument_id and mo.interval_code = '1day'
        and mo.observed_at > r.analysis_cutoff_time and mo.observed_at <= statement_timestamp()
    )
    and not exists (
      select 1 from public.personal_decisions d
      where d.owner_user_id = auth.uid() and d.source_type = 'AI_SIGNAL'
        and d.source_table = 'gpt_market_assessments' and d.source_record_key = a.assessment_id::text
    );
$$;

create or replace function public.capture_personal_decision_v1(
  p_source_type text,
  p_instrument_id uuid,
  p_ai_assessment_id uuid,
  p_action text,
  p_horizon_sessions smallint,
  p_benchmark_mode text,
  p_benchmark_instrument_id uuid,
  p_notional_amount numeric,
  p_entry_fee_bps numeric,
  p_exit_fee_bps numeric,
  p_entry_slippage_bps numeric,
  p_exit_slippage_bps numeric,
  p_base_currency text,
  p_note text
)
returns public.personal_decisions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_anonymous boolean := coalesce(((auth.jwt()->>'is_anonymous')::boolean), false);
  v_instrument_id uuid;
  v_instrument_currency text;
  v_source_action text;
  v_action text;
  v_source_table text;
  v_source_record_key text;
  v_source_snapshot jsonb;
  v_source_cutoff timestamptz;
  v_decision_at timestamptz;
  v_source_hash text;
  v_result public.personal_decisions;
begin
  if v_owner is null or v_anonymous then raise exception 'Permanent authentication required'; end if;
  if p_source_type not in ('AI_SIGNAL', 'USER_PAPER') then raise exception 'Unsupported decision source'; end if;
  if p_horizon_sessions not in (5, 20, 60) then raise exception 'Unsupported horizon'; end if;
  if p_benchmark_mode not in ('NONE', 'OWNER_SELECTED') then raise exception 'Unsupported browser benchmark mode'; end if;
  if (p_benchmark_mode = 'NONE') <> (p_benchmark_instrument_id is null) then raise exception 'Benchmark mode and instrument disagree'; end if;
  if p_notional_amount <= 0 or p_entry_fee_bps not between 0 and 1000 or p_exit_fee_bps not between 0 and 1000
    or p_entry_slippage_bps not between 0 and 1000 or p_exit_slippage_bps not between 0 and 1000 then
    raise exception 'Invalid simulation assumptions';
  end if;
  if upper(p_base_currency) !~ '^[A-Z]{3}$' then raise exception 'Invalid base currency'; end if;
  if p_note is not null and (length(p_note) > 500 or p_note <> btrim(p_note)) then raise exception 'Invalid note'; end if;

  if p_source_type = 'AI_SIGNAL' then
    if p_ai_assessment_id is null or p_instrument_id is not null or p_action is not null or p_note is not null then
      raise exception 'AI signal inputs must come only from the persisted assessment';
    end if;
    select a.instrument_id, i.currency_code, a.rating, r.analysis_cutoff_time,
      jsonb_build_object(
        'assessment_id', a.assessment_id, 'run_id', a.run_id, 'instrument_id', a.instrument_id,
        'rating', a.rating, 'confidence', a.confidence, 'score', a.score,
        'summary', a.summary, 'bull_case', a.bull_case, 'bear_case', a.bear_case,
        'key_catalysts', a.key_catalysts, 'key_risks', a.key_risks,
        'model_version', a.model_version, 'methodology_version', a.methodology_version,
        'analysis_cutoff_time', r.analysis_cutoff_time, 'run_completed_at', r.completed_at,
        'capture_eligibility', 'BEFORE_FIRST_CANONICAL_DAILY_OBSERVATION_V1'
      )
    into v_instrument_id, v_instrument_currency, v_source_action, v_source_cutoff, v_source_snapshot
    from public.gpt_market_assessments a
    join public.gpt_market_runs r on r.run_id = a.run_id
    join public.instruments i on i.id = a.instrument_id
    where a.assessment_id = p_ai_assessment_id and r.status = 'succeeded'
      and r.analysis_cutoff_time is not null
      and a.technical_engine_input_used is false
      and (
        exists (select 1 from public.personal_decisions d
          where d.owner_user_id = v_owner and d.source_type = 'AI_SIGNAL'
            and d.source_table = 'gpt_market_assessments' and d.source_record_key = a.assessment_id::text)
        or (
          r.completed_at is not null and r.completed_at <= v_now
          and r.analysis_cutoff_time <= r.completed_at
          and (select count(*) from public.data_providers dp
            join public.provider_instruments pi on pi.provider_id = dp.id
            where dp.provider_code = 'tiingo' and dp.is_active and pi.is_active
              and pi.instrument_id = a.instrument_id) = 1
          and not exists (
            select 1 from public.market_observations mo
            join public.data_providers dp on dp.id = mo.provider_id
            join public.provider_instruments pi on pi.provider_id = dp.id and pi.instrument_id = a.instrument_id
            where dp.provider_code = 'tiingo' and dp.is_active and pi.is_active
              and mo.instrument_id = a.instrument_id and mo.interval_code = '1day'
              and mo.observed_at > r.analysis_cutoff_time and mo.observed_at <= v_now
          )
        )
      );
    if v_source_snapshot is null then raise exception 'Eligible independent AI assessment not found'; end if;
    v_action := case lower(v_source_action)
      when 'strong buy' then 'BUY' when 'buy' then 'BUY' when 'hold' then 'HOLD'
      when 'sell' then 'AVOID' when 'strong sell' then 'AVOID' else null end;
    if v_action is null then raise exception 'Unsupported AI action'; end if;
    v_decision_at := v_source_cutoff;
    v_source_table := 'gpt_market_assessments';
    v_source_record_key := p_ai_assessment_id::text;
  else
    if p_instrument_id is null or p_ai_assessment_id is not null or p_action not in ('BUY', 'WATCH', 'HOLD', 'PASS', 'AVOID') then
      raise exception 'Invalid user paper decision inputs';
    end if;
    select i.id, i.currency_code into v_instrument_id, v_instrument_currency
    from public.instruments i where i.id = p_instrument_id and i.is_active;
    if v_instrument_id is null then raise exception 'Active instrument not found'; end if;
    v_source_action := p_action;
    v_action := p_action;
    v_source_cutoff := v_now;
    v_decision_at := v_now;
    v_source_table := 'user_action_snapshot';
    v_source_record_key := gen_random_uuid()::text;
    v_source_snapshot := jsonb_build_object(
      'instrument_id', v_instrument_id, 'action', v_action, 'horizon_sessions', p_horizon_sessions,
      'captured_at', v_now, 'note', p_note
    );
  end if;

  if v_instrument_currency is null or upper(v_instrument_currency) !~ '^[A-Z]{3}$' then raise exception 'Instrument currency unavailable'; end if;
  if p_benchmark_instrument_id is not null and not exists (
    select 1 from public.instruments i where i.id = p_benchmark_instrument_id and i.is_active
  ) then raise exception 'Active benchmark instrument not found'; end if;

  v_source_hash := encode(extensions.digest(convert_to(v_source_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.personal_decisions (
    owner_user_id, instrument_id, source_type, source_action, action, horizon_sessions,
    decision_at, source_table, source_record_key, source_snapshot, source_hash, source_cutoff,
    benchmark_mode, benchmark_instrument_id, notional_amount, entry_fee_bps, exit_fee_bps,
    entry_slippage_bps, exit_slippage_bps, base_currency, instrument_currency, calculation_version
  ) values (
    v_owner, v_instrument_id, p_source_type, v_source_action, v_action, p_horizon_sessions,
    v_decision_at, v_source_table, v_source_record_key, v_source_snapshot,
    v_source_hash, v_source_cutoff,
    p_benchmark_mode, p_benchmark_instrument_id, p_notional_amount, p_entry_fee_bps, p_exit_fee_bps,
    p_entry_slippage_bps, p_exit_slippage_bps, upper(p_base_currency), upper(v_instrument_currency), 'personal-forward-return-v1'
  )
  on conflict (owner_user_id, source_type, source_table, source_record_key)
    where source_type = 'AI_SIGNAL' do nothing
  returning * into v_result;

  if v_result.id is null and p_source_type = 'AI_SIGNAL' then
    select * into v_result from public.personal_decisions d
    where d.owner_user_id = v_owner and d.source_type = 'AI_SIGNAL'
      and d.source_table = v_source_table and d.source_record_key = v_source_record_key;
    if v_result.source_hash <> v_source_hash or v_result.instrument_id <> v_instrument_id
      or v_result.action <> v_action or v_result.horizon_sessions <> p_horizon_sessions
      or v_result.benchmark_mode <> p_benchmark_mode
      or v_result.benchmark_instrument_id is distinct from p_benchmark_instrument_id
      or v_result.notional_amount <> p_notional_amount or v_result.entry_fee_bps <> p_entry_fee_bps
      or v_result.exit_fee_bps <> p_exit_fee_bps or v_result.entry_slippage_bps <> p_entry_slippage_bps
      or v_result.exit_slippage_bps <> p_exit_slippage_bps or btrim(v_result.base_currency) <> upper(p_base_currency)
      or v_result.calculation_version <> 'personal-forward-return-v1' then
      raise exception 'AI decision source already captured with different immutable assumptions';
    end if;
  end if;
  return v_result;
end;
$$;

create or replace function public.append_personal_decision_event_v1(
  p_decision_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns public.personal_decision_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_anonymous boolean := coalesce(((auth.jwt()->>'is_anonymous')::boolean), false);
  v_result public.personal_decision_events;
begin
  if v_owner is null or v_anonymous then raise exception 'Permanent authentication required'; end if;
  if p_event_type not in ('EXIT', 'CANCEL', 'NOTE', 'REVIEW') then raise exception 'Unsupported decision event'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 4096 then raise exception 'Invalid event payload'; end if;
  if not exists (select 1 from public.personal_decisions d where d.id = p_decision_id and d.owner_user_id = v_owner) then
    raise exception 'Decision not found';
  end if;
  if p_event_type in ('EXIT', 'CANCEL') and exists (
    select 1 from public.personal_decision_events e where e.decision_id = p_decision_id and e.event_type in ('EXIT', 'CANCEL')
  ) then raise exception 'Decision already has a terminal event'; end if;
  insert into public.personal_decision_events (owner_user_id, decision_id, event_type, payload)
  values (v_owner, p_decision_id, p_event_type, p_payload) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.capture_personal_decision_v1(text, uuid, uuid, text, smallint, text, uuid, numeric, numeric, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.capture_personal_decision_v1(text, uuid, uuid, text, smallint, text, uuid, numeric, numeric, numeric, numeric, numeric, text, text) to authenticated;
revoke all on function public.list_eligible_personal_ai_decision_sources_v1() from public, anon;
grant execute on function public.list_eligible_personal_ai_decision_sources_v1() to authenticated;
revoke all on function public.append_personal_decision_event_v1(uuid, text, jsonb) from public, anon;
grant execute on function public.append_personal_decision_event_v1(uuid, text, jsonb) to authenticated;
revoke all on function public.reject_personal_decision_mutation_v1() from public, anon, authenticated;

comment on table public.personal_decisions is 'Immutable owner-scoped AI-signal and user-paper decision snapshots. No broker or execution authority.';
comment on table public.personal_decision_events is 'Append-only owner-scoped decision notes, reviews, exits and cancellations.';
comment on function public.capture_personal_decision_v1(text, uuid, uuid, text, smallint, text, uuid, numeric, numeric, numeric, numeric, numeric, text, text) is 'Captures a permanent user decision with a server-controlled clock and immutable source snapshot; never places a trade.';
