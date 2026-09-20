-- Additive trusted calendar/input storage. Does not enable outcome writes.
begin;
create table private.shared_market_calendars (
 id uuid primary key default gen_random_uuid(), exchange_code text not null,
 revision text not null, time_zone text not null,
 coverage_start timestamptz not null, coverage_end timestamptz not null,
 verified_at timestamptz not null, valid_until timestamptz not null,
 reference text not null check(length(trim(reference))>=20),
 manifest_hash text not null check(manifest_hash ~ '^[0-9a-f]{64}$'),
 days jsonb not null check(jsonb_typeof(days)='array'),
 sessions jsonb not null check(jsonb_typeof(sessions)='array'),
 unique(exchange_code,revision), check(coverage_start<coverage_end),
 check(verified_at<=valid_until)
);
create table private.shared_market_input_config (
 id uuid primary key default gen_random_uuid(),
 instrument_id uuid not null references public.instruments(id),
 provider_id uuid not null references public.data_providers(id),
 exchange_code text not null, revision text not null,
 timestamp_convention text not null check(timestamp_convention='UTC_SESSION_DATE'),
 verified_at timestamptz not null, reference text not null check(length(trim(reference))>=20),
 unique(instrument_id,provider_id,revision)
);
create table private.shared_evaluation_snapshots (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null references public.shared_decision_calls(id),
 created_at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null, receipt jsonb,
 check(jsonb_typeof(snapshot)='object')
);
alter table private.shared_market_calendars enable row level security;
alter table private.shared_market_input_config enable row level security;
alter table private.shared_evaluation_snapshots enable row level security;
revoke all on private.shared_market_calendars,private.shared_market_input_config,private.shared_evaluation_snapshots from public,anon,authenticated,service_role;
create index shared_snapshot_call on private.shared_evaluation_snapshots(call_id,created_at);

create function private.validate_shared_calendar_v1() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare d jsonb; day_date date; expected date; last_date date; generated jsonb:='[]'; op timestamptz; cl timestamptz;
begin
 if TG_OP<>'INSERT' then raise exception 'IMMUTABLE_CALENDAR_REVISION'; end if;
 if not exists(select 1 from pg_timezone_names where name=new.time_zone) then raise exception 'INVALID_CALENDAR_TIMEZONE'; end if;
 if new.verified_at>clock_timestamp() or new.valid_until<=new.verified_at then raise exception 'INVALID_CALENDAR_REVIEW_TIME'; end if;
 expected:=(new.coverage_start at time zone new.time_zone)::date;
 last_date:=(new.coverage_end at time zone new.time_zone)::date;
 if new.coverage_start<>(expected::timestamp at time zone new.time_zone)
 or new.coverage_end<>(last_date::timestamp at time zone new.time_zone)
 or jsonb_array_length(new.days)<>last_date-expected then raise exception 'INCOMPLETE_CALENDAR_DAYS'; end if;
 for d in select value from jsonb_array_elements(new.days) loop
  day_date:=(d->>'date')::date;
  if day_date is distinct from expected then raise exception 'NONCONTIGUOUS_CALENDAR'; end if;
  if d->>'status'='OPEN' then
   if coalesce(d->>'opens_at','') !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(d->>'closes_at','') !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'EXPLICIT_SESSION_TIMEZONE_REQUIRED'; end if;
   op:=(d->>'opens_at')::timestamptz; cl:=(d->>'closes_at')::timestamptz;
   if op is null or cl is null or op>=cl or (op at time zone new.time_zone)::date<>day_date
   or (cl at time zone new.time_zone)::date<>day_date then raise exception 'INVALID_SESSION_HOURS'; end if;
   generated:=generated||jsonb_build_array(jsonb_build_object('id',new.exchange_code||':'||day_date::text,'opens_at',d->>'opens_at','closes_at',d->>'closes_at'));
  elsif d->>'status'='CLOSED' then
   if nullif(trim(d->>'reason'),'') is null or d->>'opens_at' is not null or d->>'closes_at' is not null then raise exception 'INVALID_CLOSED_DAY'; end if;
  else raise exception 'INVALID_CALENDAR_DAY_STATUS'; end if;
  expected:=expected+1;
 end loop;
 if new.sessions is distinct from generated then raise exception 'SESSION_MANIFEST_MISMATCH'; end if;
 return new;
end $$;
create trigger validate_shared_calendar before insert or update or delete on private.shared_market_calendars
for each row execute function private.validate_shared_calendar_v1();
create function private.immutable_shared_input_config_v1() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'IMMUTABLE_INPUT_CONFIGURATION'; end $$;
create trigger immutable_shared_input_config before update or delete on private.shared_market_input_config
for each row execute function private.immutable_shared_input_config_v1();

-- Internal builder accepts only a database-owned evaluation clock from snapshot_v1.
create function private.build_shared_evaluation_snapshot_v1(p_call uuid,p_asof timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c record; s record; cal record; stock_cfg record; bench_cfg record; rv jsonb; outcomes jsonb; obs jsonb;
begin
 select sc.*,i.exchange_code instrument_exchange,b.exchange_code benchmark_exchange into c
 from public.shared_decision_calls sc join public.instruments i on i.id=sc.instrument_id
 join public.instruments b on b.id=sc.benchmark_instrument_id where sc.id=p_call;
 if not found then raise exception 'CALL_NOT_FOUND'; end if;
 select * into s from private.shared_decision_evaluation_state where call_id=p_call;
 if not found then raise exception 'EVALUATION_STATE_REQUIRED'; end if;
 select * into stock_cfg from private.shared_market_input_config where instrument_id=c.instrument_id and provider_id=c.provider_id and verified_at<=p_asof order by verified_at desc,id desc limit 1;
 select * into bench_cfg from private.shared_market_input_config where instrument_id=c.benchmark_instrument_id and provider_id=c.provider_id and verified_at<=p_asof order by verified_at desc,id desc limit 1;
 if stock_cfg.id is null or bench_cfg.id is null then raise exception 'VERIFIED_SESSION_ATTRIBUTION_REQUIRED'; end if;
 if stock_cfg.exchange_code<>c.instrument_exchange or bench_cfg.exchange_code<>c.benchmark_exchange or c.instrument_exchange<>c.benchmark_exchange then raise exception 'MATCHING_VERIFIED_EXCHANGE_REQUIRED'; end if;
 select * into cal from private.shared_market_calendars where exchange_code=c.instrument_exchange
 and coverage_start<=c.published_at and coverage_end>p_asof and verified_at<=p_asof and valid_until>p_asof
 order by verified_at desc,id desc limit 1;
 if not found then raise exception 'VERIFIED_CALENDAR_REQUIRED'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.published_at,r.id),'[]') into rv from public.shared_decision_reviews r where r.call_id=p_call;
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('price',o.price::text,'net_return',o.net_return::text,'benchmark_return',o.benchmark_return::text) order by o.recorded_at,o.as_of,o.id),'[]') into outcomes from public.shared_decision_outcomes o where o.call_id=p_call;
 -- UTC_SESSION_DATE is explicitly verified per mapping, never guessed from bars.
 -- Incomplete/bad bars are withheld so the engine records a gap, not a zero return.
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id::text,'instrument_id',o.instrument_id,'provider_id',o.provider_id,'currency',trim(o.currency_code),'interval_code',o.interval_code,
 'session_id',j->>'id','session_close',j->>'closes_at','loaded_at',o.loaded_at,'close',o.close::text,'adjusted_close',o.adjusted_close::text) order by o.observed_at,o.instrument_id,o.id),'[]') into obs
 from public.market_observations o join lateral jsonb_array_elements(cal.sessions) j on
 (o.observed_at at time zone 'UTC')::date=((j->>'opens_at')::timestamptz at time zone cal.time_zone)::date
 where o.instrument_id in(c.instrument_id,c.benchmark_instrument_id) and o.provider_id=c.provider_id
 and o.interval_code='1day' and trim(o.currency_code)=c.currency
 and exists(select 1 from public.data_providers dp where dp.id=o.provider_id and dp.provider_code='tiingo')
 and left(o.raw_payload->>'date',10)=(o.observed_at at time zone 'UTC')::date::text
 and case when coalesce(o.raw_payload->>'adjClose','') ~ '^[0-9]+(\.[0-9]+)?$' then (o.raw_payload->>'adjClose')::numeric=o.adjusted_close else false end
 and case when coalesce(o.raw_payload->>'close','') ~ '^[0-9]+(\.[0-9]+)?$' then (o.raw_payload->>'close')::numeric=o.close else false end
 and o.observed_at=date_trunc('day',o.observed_at at time zone 'UTC') at time zone 'UTC'
 and o.loaded_at<=p_asof and o.loaded_at>=(j->>'closes_at')::timestamptz
 and o.close>0 and o.adjusted_close>0 and o.close::text not in('NaN','Infinity','-Infinity') and o.adjusted_close::text not in('NaN','Infinity','-Infinity');
 return jsonb_build_object('contractVersion',1,'asOf',p_asof,'call',to_jsonb(c)-'instrument_exchange'-'benchmark_exchange'||jsonb_build_object('cost_per_side',c.cost_per_side::text),
 'reviews',rv,'state',jsonb_build_object('call_id',p_call,'version',s.version::text,'evaluated_through',s.evaluated_through),'outcomes',outcomes,
 'instrumentExchange',c.instrument_exchange,'benchmarkExchange',c.benchmark_exchange,'observations',obs,
 'calendar',jsonb_build_object('exchange',cal.exchange_code,'complete',true,'coverageStart',cal.coverage_start,'coverageEnd',cal.coverage_end,'sessions',cal.sessions,
 'provenance',jsonb_build_object('verified',true,'verifiedAt',cal.verified_at,'reference',cal.reference,'revision',cal.revision)),
 'inputVersions',jsonb_build_object('calendar',cal.id,'stock',stock_cfg.id,'benchmark',bench_cfg.id));
end $$;
create function private.shared_evaluation_snapshot_v1(p_call uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare instrument uuid; snap jsonb; token uuid;
begin
 select instrument_id into instrument from public.shared_decision_calls where id=p_call;
 if instrument is null then raise exception 'CALL_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-decision:'||instrument::text,0));
 snap:=private.build_shared_evaluation_snapshot_v1(p_call,date_trunc('milliseconds',clock_timestamp()));
 insert into private.shared_evaluation_snapshots(call_id,snapshot) values(p_call,snap) returning id into token;
 return jsonb_build_object('snapshotToken',token,'snapshot',snap);
end $$;
create function private.shared_evaluation_receipt_v1(p_call uuid,p_token uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select receipt from private.shared_evaluation_snapshots where id=p_token and call_id=p_call;
$$;
revoke all on function private.validate_shared_calendar_v1(),private.immutable_shared_input_config_v1(),
private.build_shared_evaluation_snapshot_v1(uuid,timestamptz),private.shared_evaluation_snapshot_v1(uuid),private.shared_evaluation_receipt_v1(uuid,uuid) from public,anon,authenticated,service_role;
commit;
