-- Pure synthetic reference checks; no persistent fixtures.
begin;
do $$
declare base jsonb; s jsonb:='[]'; prices jsonb:='[]'; d text; i int; r jsonb; x jsonb; entry jsonb; terminal jsonb; persisted jsonb; altered jsonb; caught boolean:=false;
begin
 for i in 1..22 loop
  d:='2026-09-'||lpad(i::text,2,'0');
  s:=s||jsonb_build_array(jsonb_build_object('id',i::text,'opens_at',d||'T09:00:00Z','closes_at',d||'T16:00:00Z'));
  prices:=prices||jsonb_build_array(
   jsonb_build_object('id',(i*2)::text,'instrument_id','stock','provider_id','provider','currency','USD','interval_code','1day','session_id',i::text,'loaded_at',d||'T17:00:00Z','close',(99+i)::text,'adjusted_close',(99+i)::text),
   jsonb_build_object('id',(i*2+1)::text,'instrument_id','benchmark','provider_id','provider','currency','USD','interval_code','1day','session_id',i::text,'loaded_at',d||'T17:00:00Z','close','200','adjusted_close','200'));
 end loop;
 base:=jsonb_build_object('asOf','2026-09-22T18:00:00Z','call',jsonb_build_object('id','buy','action','BUY','published_at','2026-08-31T18:00:00Z','instrument_id','stock','benchmark_instrument_id','benchmark','provider_id','provider','currency','USD','cost_per_side','0.001'),
 'reviews','[]'::jsonb,'outcomes','[]'::jsonb,'observations',prices,'calendar',jsonb_build_object('sessions',s));
 r:=private.shared_paper_reference_v1(base);
 if r->>'state'<>'Open' or jsonb_array_length(r->'added')<>25 then raise exception 'OPEN_CHECKPOINT_COUNT_FAILED: %',r;end if;
 if not exists(select 1 from jsonb_array_elements(r->'added') o where o->>'kind'='CHECKPOINT_5' and o->>'sessionId'='6')
 or not exists(select 1 from jsonb_array_elements(r->'added') o where o->>'kind'='CHECKPOINT_20' and o->>'sessionId'='21') then raise exception 'CHECKPOINT_INDEX_FAILED';end if;
 -- A real Buy/Hold/Sell chronology: next opening after Sell is session 3.
 x:=jsonb_set(base,'{reviews}',jsonb_build_array(jsonb_build_object('id','hold','action','HOLD','published_at','2026-09-01T18:00:00Z'),jsonb_build_object('id','sell','action','SELL','published_at','2026-09-02T18:00:00Z')));
 r:=private.shared_paper_reference_v1(x);terminal:=r->'added'->(jsonb_array_length(r->'added')-1);
 if r->>'state'<>'Closed' or terminal->>'kind'<>'EXIT' or terminal->>'sessionId'<>'3' or jsonb_array_length(r->'added')<>5
 or abs((terminal->>'netReturn')::double precision-(102::double precision*0.999/(100::double precision*1.001)-1))>1e-12
 or (terminal->>'benchmarkReturn')::double precision<>0 then raise exception 'BUY_HOLD_SELL_RETURN_FAILED: %',r;end if;
 select jsonb_agg(jsonb_build_object('evidence',jsonb_build_object('engine',o))) into persisted from jsonb_array_elements(r->'added') o;
 r:=private.shared_paper_reference_v1(jsonb_set(x,'{outcomes}',persisted));
 if r->>'state'<>'Closed' or r->'added'<>'[]'::jsonb then raise exception 'CLOSED_IDEMPOTENCY_FAILED';end if;
 -- Wait cannot manufacture a simulated position.
 r:=private.shared_paper_reference_v1(jsonb_set(base,'{call,action}','"WAIT"'));
 if r->>'state'<>'Watching' or r->'added'<>'[]'::jsonb then raise exception 'WAIT_FAILED';end if;
 r:=private.shared_paper_reference_v1(jsonb_set(base,'{asOf}','"2026-09-01T10:00:00Z"'));
 if r->>'state'<>'Awaiting entry' or r->'added'<>'[]'::jsonb then raise exception 'AWAITING_ENTRY_FAILED';end if;
 r:=private.shared_paper_reference_v1(jsonb_set(base,'{calendar,sessions}','[]'));
 if r->>'state'<>'Calendar required' then raise exception 'CALENDAR_REQUIRED_FAILED';end if;
 select jsonb_agg(o) into altered from jsonb_array_elements(prices) o where not(o->>'instrument_id'='stock' and o->>'session_id'='1');
 r:=private.shared_paper_reference_v1(jsonb_set(base,'{observations}',altered));
 if r->>'state'<>'Missing data' or jsonb_array_length(r->'added')<>1 or r#>>'{added,0,kind}'<>'DATA_GAP' or r#>>'{added,0,sessionId}'<>'1' then raise exception 'ENTRY_NOT_SHIFTED_FAILED';end if;
 -- Before-opening withdrawal produces only cancellation.
 x:=jsonb_set(base,'{reviews}',jsonb_build_array(jsonb_build_object('id','sell','action','SELL','published_at','2026-09-01T08:00:00Z')));
 r:=private.shared_paper_reference_v1(x);
 if r->>'state'<>'Not entered' or r#>>'{added,0,kind}'<>'CANCELLED' or jsonb_array_length(r->'added')<>1 then raise exception 'WITHDRAWAL_FAILED';end if;
 -- Persist one genuine entry+mark, then change the source price.
 r:=private.shared_paper_reference_v1(jsonb_set(base,'{asOf}','"2026-09-01T18:00:00Z"'));
 select jsonb_agg(jsonb_build_object('evidence',jsonb_build_object('engine',o))) into persisted from jsonb_array_elements(r->'added') o;
 x:=jsonb_set(jsonb_set(base,'{outcomes}',persisted),'{observations,0,close}','"999"');
 r:=private.shared_paper_reference_v1(x);
 if r->>'state'<>'Missing data' or r#>>'{added,0,reason}'<>'Pinned entry evidence changed; return withheld' then raise exception 'PINNED_REVISION_FAILED';end if;
 x:=jsonb_set(base,'{observations,2,adjusted_close}','"50"');
 r:=private.shared_paper_reference_v1(x);
 if r->>'state'<>'Missing data' or r#>>'{added,2,reason}'<>'Corporate-action adjustment changed; return withheld' then raise exception 'CORPORATE_ACTION_FAILED';end if;
 -- Existing open history is idempotent, new later sessions alone are appended.
 r:=private.shared_paper_reference_v1(jsonb_set(base,'{outcomes}',persisted));
 if r->>'state'<>'Open' or jsonb_array_length(r->'added')<>23 then raise exception 'OPEN_IDEMPOTENCY_FAILED';end if;
 raise notice 'PASS: SQL reference open/checkpoints, buy-hold-sell/costs, terminal replay, wait, pending, no calendar, missing entry, withdrawal, pinned revision, corporate action, open replay';
end $$;
rollback;

