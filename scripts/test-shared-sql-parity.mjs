// Generates rollback-only SQL assertions from the independently tested Node engine.
import {writeFileSync} from 'node:fs';
import {prepareSharedEvaluation} from '../lib/shared-paper-adapter.mjs';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const event=(n,action,published)=>({id:uuid(n),call_id:uuid(1),assessment_id:uuid(n+100),action,published_at:published,source_cutoff:new Date(Date.parse(published)-3600000).toISOString(),model_identity:'rollback-fixture',thesis:'Synthetic mechanics fixture only',risks:'Synthetic mechanics risks only',input_hash:'a'.repeat(64)});
function fixture(){
 const sessions=Array.from({length:22},(_,i)=>{const day=String(i+1).padStart(2,'0');return {id:`FIXTURE:${day}`,opens_at:`2026-09-${day}T09:00:00Z`,closes_at:`2026-09-${day}T16:00:00Z`};});
 return {contractVersion:1,asOf:'2026-09-22T18:00:00Z',call:{...event(1,'BUY','2026-08-31T18:00:00Z'),instrument_id:uuid(2),benchmark_instrument_id:uuid(3),provider_id:uuid(4),currency:'USD',methodology:'shared-decision-lab-v1',cost_per_side:'0.001'},reviews:[],outcomes:[],state:{call_id:uuid(1),version:'0',evaluated_through:null},instrumentExchange:'FIXTURE',benchmarkExchange:'FIXTURE',calendar:{exchange:'FIXTURE',complete:true,coverageStart:'2026-08-31T00:00:00Z',coverageEnd:'2026-09-24T00:00:00Z',provenance:{verified:true,verifiedAt:'2026-08-30T00:00:00Z',reference:'rollback-only explicit calendar',revision:'fixture-v1'},sessions},observations:sessions.flatMap((s,i)=>[2,3].map((n,j)=>({id:String(1000+i*2+j),instrument_id:uuid(n),provider_id:uuid(4),currency:'USD',interval_code:'1day',session_id:s.id,session_close:s.closes_at,loaded_at:s.closes_at,close:String(j?200+i:100+i),adjusted_close:String(j?200+i:100+i)})))};
}
const pin=(s,p)=>{s.outcomes=p.added.map((o,i)=>({...o,id:uuid(200+i),recorded_at:o.evidence.engine.recordedAt}));s.state.evaluated_through=p.evaluatedThrough;return s;};
const cases=[];
function add(name,fn){const s=fixture();fn?.(s);cases.push({name,s,expected:prepareSharedEvaluation(s)});}
add('open checkpoints');add('wait',s=>s.call.action='WAIT');add('hold without position',s=>s.call.action='HOLD');
add('buy hold sell',s=>s.reviews=[event(5,'HOLD','2026-09-01T18:00:00Z'),event(6,'SELL','2026-09-02T18:00:00Z')]);
add('withdrawal',s=>s.reviews=[event(6,'SELL','2026-09-01T08:00:00Z')]);
add('missing entry',s=>s.observations.shift());
add('duplicate prices',s=>s.observations.push({...s.observations[0],id:'9999'}));
add('corporate action',s=>s.observations[2].adjusted_close='50');
add('missing exit',s=>{s.reviews=[event(6,'SELL','2026-09-02T18:00:00Z')];s.observations=s.observations.filter(o=>o.session_id!=='FIXTURE:03');});
add('no future calendar',s=>{s.reviews=[event(6,'SELL','2026-09-22T17:00:00Z')];});
add('awaiting entry',s=>{s.asOf='2026-09-01T10:00:00Z';s.observations=[];});
add('pinned revision',s=>{const first=structuredClone(s);first.asOf='2026-09-01T18:00:00Z';first.observations=first.observations.filter(o=>o.session_id==='FIXTURE:01');pin(s,prepareSharedEvaluation(first));s.observations[0].close='999';});
add('terminal replay',s=>{s.reviews=[event(6,'SELL','2026-09-02T18:00:00Z')];pin(s,prepareSharedEvaluation(s));});
let sql='begin;\n';
for(const {name,s,expected} of cases){
 const refExpected={state:expected.state,added:expected.added.map(o=>o.evidence.engine)};
 sql+=`do $check$ declare actual jsonb; expected jsonb:=$fixture$${JSON.stringify(refExpected)}$fixture$; a jsonb; e jsonb; n int:=0; k text; begin\n actual:=private.shared_paper_reference_v1($fixture$${JSON.stringify(s)}$fixture$);\n if actual->>'state' is distinct from expected->>'state' or jsonb_array_length(actual->'added')<>jsonb_array_length(expected->'added') then raise exception 'PARITY ${name} shape'; end if;\n for a in select value from jsonb_array_elements(actual->'added') loop e:=expected->'added'->n;n:=n+1;\n if a-'netReturn'-'benchmarkReturn' is distinct from e-'netReturn'-'benchmarkReturn' then raise exception 'PARITY ${name} evidence';end if;\n foreach k in array array['netReturn','benchmarkReturn'] loop if (a->>k is null)<>(e->>k is null) or abs((a->>k)::numeric-(e->>k)::numeric)>0.000000000001 then raise exception 'PARITY ${name} return';end if;end loop;end loop;end $check$;\n`;
}
sql+="rollback;select 'PASS: 13 Node/Postgres parity scenarios; no saved fixtures' result;\n";
if(!process.argv[2])throw Error('Output SQL path required');writeFileSync(process.argv[2],sql,'utf8');
console.log(`Generated ${cases.length} parity cases`);
