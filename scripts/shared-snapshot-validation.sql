-- Independent server-side adapter contract validation. Does not write outcomes.
begin;
create function private.validate_shared_snapshot_v1(s jsonb) returns void
language plpgsql immutable set search_path=pg_catalog as $$
declare
 c jsonb:=s->'call'; state jsonb:=s->'state'; cal jsonb:=s->'calendar';
 now_at timestamptz:=(s->>'asOf')::timestamptz; watermark timestamptz;
 v jsonb; e jsonb; p jsonb; ses jsonb; events jsonb; entry jsonb; terminal jsonb; buy jsonb; sell jsonb;
 entry_session jsonb; exit_session jsonb; ids text[]:='{}'; keys text[]:='{}'; singletons text[]:='{}';
 last_publication timestamptz; last_source timestamptz; last_close timestamptz;
 k text; value_text text; n numeric; idx int; entry_idx int; expected_idx int;
 uuid_pattern text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
 if s->>'contractVersion' is distinct from '1' or now_at is null
 or jsonb_typeof(s->'reviews') is distinct from 'array' or jsonb_typeof(s->'outcomes') is distinct from 'array'
 or jsonb_typeof(s->'observations') is distinct from 'array' or jsonb_typeof(cal->'sessions') is distinct from 'array'
 then raise exception 'INVALID_SNAPSHOT_SHAPE'; end if;
 foreach k in array array['id','instrument_id','benchmark_instrument_id','provider_id'] loop
  if coalesce(c->>k,'') !~ uuid_pattern then raise exception 'INVALID_CALL_ID'; end if;
 end loop;
 if c->>'instrument_id'=c->>'benchmark_instrument_id' or c->>'methodology' is distinct from 'shared-decision-lab-v1'
 or coalesce(c->>'currency','') !~ '^[A-Z]{3}$' or (c->>'cost_per_side')::numeric is distinct from 0.001
 or state->>'call_id' is distinct from c->>'id' or coalesce(state->>'version','') !~ '^(0|[1-9][0-9]*)$'
 then raise exception 'INVALID_CALL_CONFIGURATION'; end if;
 watermark:=(state->>'evaluated_through')::timestamptz;
 if watermark>now_at then raise exception 'WATERMARK_REWIND'; end if;
 if (cal->>'coverageStart')::timestamptz is null or (cal->>'coverageEnd')::timestamptz is null or (cal#>>'{provenance,verifiedAt}')::timestamptz is null or nullif(cal->>'exchange','') is null
 or cal->>'complete' is distinct from 'true' or cal#>>'{provenance,verified}' is distinct from 'true'
 or nullif(trim(cal#>>'{provenance,reference}'),'') is null or nullif(trim(cal#>>'{provenance,revision}'),'') is null
 or cal->>'exchange' is distinct from s->>'instrumentExchange' or cal->>'exchange' is distinct from s->>'benchmarkExchange'
 or (cal#>>'{provenance,verifiedAt}')::timestamptz>now_at
 or (cal->>'coverageStart')::timestamptz>(c->>'published_at')::timestamptz
 or (cal->>'coverageEnd')::timestamptz<now_at then raise exception 'INVALID_CALENDAR_PROVENANCE'; end if;
 for ses in select value from jsonb_array_elements(cal->'sessions') loop
  if nullif(ses->>'id','') is null or ses->>'id'=any(ids)
  or (ses->>'opens_at')::timestamptz is null or (ses->>'closes_at')::timestamptz is null
  or (ses->>'opens_at')::timestamptz>=(ses->>'closes_at')::timestamptz
  or (ses->>'opens_at')::timestamptz<=last_close
  or (ses->>'opens_at')::timestamptz<(cal->>'coverageStart')::timestamptz
  or (ses->>'closes_at')::timestamptz>(cal->>'coverageEnd')::timestamptz then raise exception 'INVALID_CALENDAR_SESSION'; end if;
  ids:=array_append(ids,ses->>'id');last_close:=(ses->>'closes_at')::timestamptz;
 end loop;
 events:=jsonb_build_array(c)||(s->'reviews');ids:='{}';
 for v in select value from jsonb_array_elements(events) loop
  if coalesce(v->>'id','') !~ uuid_pattern or coalesce(v->>'assessment_id','') !~ uuid_pattern
  or v->>'id'=any(ids) or v->>'assessment_id'=any(ids)
  or coalesce(v->>'input_hash','') !~ '^[0-9a-f]{64}$'
  or v->>'action' not in('BUY','WAIT','HOLD','SELL','REDUCE','AVOID')
  or nullif(v->>'action','') is null or nullif(v->>'thesis','') is null or nullif(v->>'risks','') is null or nullif(v->>'model_identity','') is null
  or (v->>'id'<>c->>'id' and v->>'call_id' is distinct from c->>'id')
  or (v->>'published_at')::timestamptz is null or (v->>'source_cutoff')::timestamptz is null
  or (v->>'source_cutoff')::timestamptz>(v->>'published_at')::timestamptz
  or (v->>'published_at')::timestamptz>now_at or (v->>'published_at')::timestamptz<=last_publication
  or (v->>'source_cutoff')::timestamptz<=last_source then raise exception 'INVALID_EVENT_CHRONOLOGY'; end if;
  ids:=array_append(array_append(ids,v->>'id'),v->>'assessment_id');last_publication:=(v->>'published_at')::timestamptz;last_source:=(v->>'source_cutoff')::timestamptz;
 end loop;
 ids:='{}';
 -- Validate current prices and pinned price evidence using the same decimal limits.
 for p in select value from jsonb_array_elements(s->'observations') loop
  if jsonb_typeof(p->'id') is distinct from 'string' or coalesce(p->>'id','') !~ '^[1-9][0-9]*$' or (p->>'id')::numeric>9223372036854775807 or p->>'id'=any(ids)
  or p->>'instrument_id' is null or p->>'instrument_id' not in(c->>'instrument_id',c->>'benchmark_instrument_id')
  or p->>'provider_id' is distinct from c->>'provider_id' or p->>'currency' is distinct from c->>'currency'
  or p->>'interval_code' is distinct from '1day' then raise exception 'INVALID_OBSERVATION'; end if;
  select value into ses from jsonb_array_elements(cal->'sessions') where value->>'id'=p->>'session_id';
  if ses is null or (p->>'session_close')::timestamptz is distinct from (ses->>'closes_at')::timestamptz
  or (p->>'loaded_at')::timestamptz is null or (p->>'loaded_at')::timestamptz<(ses->>'closes_at')::timestamptz
  or (p->>'loaded_at')::timestamptz>now_at then raise exception 'INVALID_OBSERVATION_TIME'; end if;
  foreach k in array array['close','adjusted_close'] loop
   value_text:=p->>k;
   if jsonb_typeof(p->k) is distinct from 'string' or coalesce(value_text,'') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' then raise exception 'INVALID_PRICE_DECIMAL'; end if;
   n:=value_text::numeric;
   if n<=0 or n>9007199254740991 or length(trim(both '0' from replace(value_text,'.','')))>15 then raise exception 'UNSUPPORTED_PRICE_PRECISION'; end if;
  end loop;ids:=array_append(ids,p->>'id');
 end loop;
 select value into buy from jsonb_array_elements(events) where value->>'action'='BUY' limit 1;
 select value into sell from jsonb_array_elements(events) where value->>'action'='SELL' and (value->>'published_at')::timestamptz>(buy->>'published_at')::timestamptz limit 1;
 select value into entry_session from jsonb_array_elements(cal->'sessions') where (value->>'opens_at')::timestamptz>(buy->>'published_at')::timestamptz limit 1;
 select value into exit_session from jsonb_array_elements(cal->'sessions') where (value->>'opens_at')::timestamptz>(sell->>'published_at')::timestamptz limit 1;
 select value->'evidence'->'engine' into entry from jsonb_array_elements(s->'outcomes') where value->>'kind'='ENTRY';
 select value->'evidence'->'engine' into terminal from jsonb_array_elements(s->'outcomes') where value->>'kind' in('EXIT','CANCELLED') limit 1;
 ids:='{}';
 for v in select value from jsonb_array_elements(s->'outcomes') loop
  e:=v->'evidence'->'engine';k:=e->>'kind';
  select value into ses from jsonb_array_elements(cal->'sessions') where value->>'id'=e->>'sessionId';
  if coalesce(v->>'id','') !~ uuid_pattern or v->>'id'=any(ids) or v->>'call_id' is distinct from c->>'id'
  or e is null or ses is null or k not in('ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20','DATA_GAP','CANCELLED')
  or k is null or v->>'kind' is distinct from k or e->>'key' is distinct from k||':'||(e->>'sessionId') or e->>'key'=any(keys)
  or (k in('ENTRY','EXIT','CHECKPOINT_5','CHECKPOINT_20','CANCELLED') and k=any(singletons))
  or watermark is null or (v->>'as_of')::timestamptz is distinct from (e->>'asOf')::timestamptz
  or (v->>'recorded_at')::timestamptz is distinct from (e->>'recordedAt')::timestamptz
  or (e->>'asOf')::timestamptz is null or (e->>'recordedAt')::timestamptz is null
  or (e->>'asOf')::timestamptz>(e->>'recordedAt')::timestamptz or (e->>'recordedAt')::timestamptz>watermark
  or (e->>'asOf')::timestamptz<(c->>'published_at')::timestamptz
  or (e->>'recordedAt')::timestamptz<(c->>'published_at')::timestamptz
  or (k<>'CANCELLED' and (e->>'asOf')::timestamptz<>(ses->>'closes_at')::timestamptz)
  or (e->>'recordedAt')::timestamptz>(terminal->>'recordedAt')::timestamptz
  or v->>'reason' is distinct from e->>'reason' then raise exception 'INVALID_PINNED_OUTCOME'; end if;

  if k in('ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20') and
   (v->>'price' is null or jsonb_typeof(e->'price') is distinct from 'number' or (e->>'price')::numeric<=0 or (e->>'price')::numeric>9007199254740991)
  then raise exception 'REQUIRED_PINNED_PRICE'; end if;
  if k in('EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20') and
   (v->>'net_return' is null or v->>'benchmark_return' is null
    or jsonb_typeof(e->'netReturn') is distinct from 'number' or jsonb_typeof(e->'benchmarkReturn') is distinct from 'number'
    or abs((e->>'netReturn')::numeric)>9007199254740991 or abs((e->>'benchmarkReturn')::numeric)>9007199254740991)
  then raise exception 'REQUIRED_PINNED_RETURNS'; end if;
  if k in('DATA_GAP','CANCELLED') and
   (v->>'net_return' is not null or v->>'benchmark_return' is not null or e ? 'netReturn' or e ? 'benchmarkReturn')
  then raise exception 'NONPERFORMANCE_RETURNS'; end if;
  if (v->>'price')::numeric is distinct from (e->>'price')::numeric or (v->>'net_return')::numeric is distinct from (e->>'netReturn')::numeric
  or (v->>'benchmark_return')::numeric is distinct from (e->>'benchmarkReturn')::numeric then raise exception 'PINNED_NUMERIC_MISMATCH'; end if;
  if k in('EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20') and entry is null then raise exception 'ENTRY_REQUIRED'; end if;
  if terminal->>'kind'='CANCELLED' and k in('ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20') then raise exception 'CANCELLED_POSITION'; end if;
  if k='ENTRY' and (buy is null or entry_session is null or e->>'eventId' is distinct from buy->>'id' or e->>'sessionId' is distinct from entry_session->>'id') then raise exception 'ENTRY_CHRONOLOGY'; end if;
  if k='EXIT' and (sell is null or exit_session is null or e->>'eventId' is distinct from sell->>'id' or e->>'sessionId' is distinct from exit_session->>'id'
   or (e->>'recordedAt')::timestamptz<(entry->>'recordedAt')::timestamptz or (e->>'asOf')::timestamptz<(entry->>'asOf')::timestamptz) then raise exception 'EXIT_CHRONOLOGY'; end if;
  if k='CANCELLED' and (sell is null or entry_session is null or e->>'eventId' is distinct from sell->>'id' or e->>'sessionId' is distinct from entry_session->>'id'
   or (e->>'asOf')::timestamptz is distinct from (sell->>'published_at')::timestamptz or (sell->>'published_at')::timestamptz>=(entry_session->>'opens_at')::timestamptz) then raise exception 'CANCELLATION_CHRONOLOGY'; end if;
  if k in('MARK','CHECKPOINT_5','CHECKPOINT_20') then
   if (e->>'asOf')::timestamptz<(entry->>'asOf')::timestamptz or (e->>'recordedAt')::timestamptz<(entry->>'recordedAt')::timestamptz
   or (terminal->>'kind'='EXIT' and (e->>'asOf')::timestamptz>(terminal->>'asOf')::timestamptz) then raise exception 'PERFORMANCE_CHRONOLOGY'; end if;
   if k like 'CHECKPOINT_%' then
    select ord into idx from jsonb_array_elements(cal->'sessions') with ordinality t(value,ord) where value->>'id'=e->>'sessionId';
    select ord into entry_idx from jsonb_array_elements(cal->'sessions') with ordinality t(value,ord) where value->>'id'=entry->>'sessionId';
    expected_idx:=substring(k from 12)::int;
    if idx-entry_idx<>expected_idx then raise exception 'CHECKPOINT_CHRONOLOGY'; end if;
   end if;
  end if;
  if k in('ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20') then
   foreach value_text in array array['stock','benchmark'] loop
    p:=e->'evidence'->value_text;
    if p is null or coalesce(p->>'id','') !~ '^[1-9][0-9]*$' or (p->>'id')::numeric>9223372036854775807
    or p->>'instrument' is distinct from (case value_text when 'stock' then c->>'instrument_id' else c->>'benchmark_instrument_id' end)
    or p->>'provider' is distinct from c->>'provider_id' or p->>'currency' is distinct from c->>'currency'
    or p->>'sessionId' is distinct from e->>'sessionId'
    or jsonb_typeof(p->'close') is distinct from 'number' or jsonb_typeof(p->'adjustedClose') is distinct from 'number'
    or (p->>'close')::numeric<=0 or (p->>'adjustedClose')::numeric<=0
    or (p->>'close')::numeric>9007199254740991 or (p->>'adjustedClose')::numeric>9007199254740991
    or (p->>'loadedAt')::timestamptz is null or (p->>'loadedAt')::timestamptz<(e->>'asOf')::timestamptz
    or (p->>'loadedAt')::timestamptz>(e->>'recordedAt')::timestamptz then raise exception 'INVALID_PINNED_PRICE_EVIDENCE'; end if;
   end loop;
  end if;
  ids:=array_append(ids,v->>'id');keys:=array_append(keys,e->>'key');singletons:=array_append(singletons,k);
 end loop;
end $$;
revoke all on function private.validate_shared_snapshot_v1(jsonb) from public,anon,authenticated,service_role;
commit;
