import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateActionTrial} from '../lib/shared-action-performance.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function actionFixture(action='BUY') {
 const sessions=Array.from({length:22},(_,i)=>{const d=String(i+2).padStart(2,'0');return {id:d,opens_at:`2026-09-${d}T09:00:00Z`,closes_at:`2026-09-${d}T16:00:00Z`};});
 const event={id:id(1),assessment_id:id(100),action,published_at:'2026-09-01T18:00:00Z',source_cutoff:'2026-09-01T17:00:00Z',model_identity:'fixture-only',thesis:'Synthetic evidence',risks:'Synthetic risks',input_hash:'a'.repeat(64)};
 return {contractVersion:1,asOf:'2026-09-23T17:00:00Z',call:{...event,instrument_id:id(2),benchmark_instrument_id:id(3),provider_id:id(4),currency:'USD',methodology:'shared-decision-lab-v1',cost_per_side:'0.001'},reviews:[],outcomes:[],state:{call_id:id(1),version:'0',evaluated_through:null},instrumentExchange:'FIXTURE',benchmarkExchange:'FIXTURE',inputVersions:{calendar:id(8),stock:id(9),benchmark:id(10)},calendar:{exchange:'FIXTURE',complete:true,coverageStart:'2026-09-01T00:00:00Z',coverageEnd:'2026-09-24T00:00:00Z',provenance:{verified:true,verifiedAt:'2026-09-01T00:00:00Z',reference:'synthetic-calendar',revision:'1'},sessions},observations:sessions.flatMap((s,i)=>[2,3].map((n,j)=>({id:String(20+i*2+j),instrument_id:id(n),provider_id:id(4),currency:'USD',interval_code:'1day',session_id:s.id,session_close:s.closes_at,loaded_at:s.closes_at,close:String(j?200+i:100+2*i),adjusted_close:String(j?200+i:100+2*i)})))};
}
for(const [action,weight] of [['BUY',1],['HOLD',1],['REDUCE',.5],['WAIT',0],['AVOID',0],['SELL',0]]) test(`${action} prospective weighted checkpoint and matching comparator costs`,()=>{
 const r=evaluateActionTrial(actionFixture(action),id(1),5);assert.equal(r.status,'matured');
 assert.equal(r.path.length,6);assert.equal(r.path[0].session.id,'02');
 assert.ok(Math.abs(r.metrics.stockReturn-(110*.999/(100*1.001)-1))<1e-12);
 assert.ok(Math.abs(r.metrics.benchmarkReturn-(205*.999/(200*1.001)-1))<1e-12);
 assert.equal(r.metrics.actionReturn,weight*r.metrics.stockReturn);
 assert.ok(Math.abs(r.metrics.maxDrawdown-weight*(.999/1.001-1))<1e-12);
});
test('20-session horizon, not 20 calendar days or entry-inclusive count',()=>{const r=evaluateActionTrial(actionFixture(),id(1),20);assert.equal(r.path.length,21);assert.equal(r.path.at(-1).session.id,'22');});
test('future outcomes remain null',()=>{const s=actionFixture('WAIT');s.asOf='2026-09-05T17:00:00Z';s.observations=s.observations.filter(o=>Date.parse(o.loaded_at)<=Date.parse(s.asOf));const r=evaluateActionTrial(s,id(1),5);assert.equal(r.status,'pending');assert.equal(r.metrics,null);});
test('missing daily intermediate price blocks even with endpoints',()=>{const s=actionFixture();s.observations=s.observations.filter(o=>o.session_id!=='04');const r=evaluateActionTrial(s,id(1),5);assert.equal(r.status,'blocked');assert.equal(r.metrics,null);});
test('revised observation or config blocks pinned results',()=>{const s=actionFixture();const pins=evaluateActionTrial(s,id(1),5).path;s.observations[0].close='101';s.observations[0].adjusted_close='101';assert.equal(evaluateActionTrial(s,id(1),5,pins).blocker,'PINNED_EVIDENCE_REVISED');s.observations[0].close='100';s.observations[0].adjusted_close='100';s.inputVersions.stock=id(99);assert.equal(evaluateActionTrial(s,id(1),5,pins).blocker,'PINNED_EVIDENCE_REVISED');});
test('corporate adjustment blocks cash trials too',()=>{const s=actionFixture('AVOID');s.observations[4].adjusted_close='50';assert.equal(evaluateActionTrial(s,id(1),5).blocker,'CORPORATE_ACTION_REQUIRED');});
test('review is distinct event with its own prospective entry',()=>{const s=actionFixture('WAIT');s.reviews=[{...s.call,id:id(5),assessment_id:id(105),call_id:id(1),action:'REDUCE',published_at:'2026-09-03T09:00:00Z',source_cutoff:'2026-09-03T08:00:00Z',model_identity:'second-model'}];const r=evaluateActionTrial(s,id(5),5);assert.equal(r.path[0].session.id,'04');assert.equal(r.weight,.5);});
test('reruns deterministic and preserve input',()=>{const s=actionFixture();const original=structuredClone(s);const r=evaluateActionTrial(s,id(1),5);assert.deepEqual(evaluateActionTrial(s,id(1),5,r.path),r);assert.deepEqual(s,original);});
test('reject unknown event and unsupported horizon',()=>{assert.throws(()=>evaluateActionTrial(actionFixture(),id(99),5));assert.throws(()=>evaluateActionTrial(actionFixture(),id(1),6));});

test('equivalent calendar renewal preserves all pinned evidence',()=>{const s=actionFixture();const r=evaluateActionTrial(s,id(1),5);s.inputVersions.calendar=id(99);s.calendar.provenance.revision='renewed';assert.deepEqual(evaluateActionTrial(s,id(1),5,r.path),r);});
test('calendar renewal with relocated entry blocks',()=>{const s=actionFixture();const pins=evaluateActionTrial(s,id(1),5).path;s.inputVersions.calendar=id(99);s.calendar.sessions[0].opens_at='2026-09-02T10:00:00Z';assert.equal(evaluateActionTrial(s,id(1),5,pins).blocker,'PINNED_CALENDAR_REVISED');});
