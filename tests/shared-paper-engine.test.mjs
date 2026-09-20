import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournal,appendCall,evaluateJournal} from '../lib/shared-paper-engine.mjs';
const event=(id,action,day)=>({id,assessmentId:id,model:'fixture-only',thesis:'Synthetic test call',risks:'Not market research',inputHash:'fixture-'+id,action,publishedAt:`2026-09-${day}T18:00:00Z`,sourceCutoff:`2026-09-${day}T17:00:00Z`});
const buy=event('buy','BUY','01'),hold=event('hold','HOLD','02'),sell=event('sell','SELL','03');
const sessions=['02','03','04'].map(day=>({id:day,opensAt:`2026-09-${day}T09:00:00Z`,closesAt:`2026-09-${day}T16:00:00Z`}));
const prices=sessions.flatMap((s,i)=>[['SHARE',[100,105,110][i]],['INDEX',[200,202,204][i]]].map(([instrument,close])=>({instrument,sessionId:s.id,close,adjustedClose:close,provider:'fixture',currency:'USD',loadedAt:s.closesAt})));
const journal=(events=[buy,hold,sell])=>createJournal({id:'trial',instrument:'SHARE',benchmark:'INDEX',currency:'USD',provider:'fixture',events});
const run=(j=journal(),overrides={})=>evaluateJournal(j,{sessions,prices,asOf:'2026-09-04T17:00:00Z',...overrides});
test('Buy -> Hold -> Sell pins 100 entry, 110 exit, costs and benchmark',()=>{
 const r=run(),entry=r.journal.outcomes.find(o=>o.kind==='ENTRY'),exit=r.journal.outcomes.find(o=>o.kind==='EXIT');
 assert.equal(r.state,'Closed');assert.equal(entry.price,100);assert.equal(exit.price,110);
 assert.ok(Math.abs(exit.netReturn-0.0978021978021979)<1e-12);assert.ok(Math.abs(exit.benchmarkReturn-.02)<1e-12);
 assert.equal(r.journal.outcomes.filter(o=>o.kind==='ENTRY').length,1);
});
test('hold retains one open position',()=>{const r=run(journal([buy,hold]));assert.equal(r.state,'Open');assert.equal(r.journal.outcomes.filter(o=>o.kind==='ENTRY').length,1);});
test('original calls are frozen and conflicting publication rejected',()=>{
 const j=journal();assert.throws(()=>{j.events[0].action='SELL'},TypeError);
 assert.throws(()=>appendCall(j,{...buy,action:'SELL'}),/cannot be changed/);assert.equal(appendCall(j,buy),j);
});
test('original input mutation cannot alter stored call',()=>{const e={...buy},j=journal([e]);e.action='SELL';assert.equal(j.events[0].action,'BUY');});
test('rerunning closed or open evaluations adds no duplicates',()=>{
 for(const j of [journal(),journal([buy,hold])]) {const a=run(j);const b=run(a.journal);assert.equal(b.added.length,0);assert.deepEqual(b.journal,a.journal);}
});
test('missing intended entry does not shift to later favourable price',()=>{
 const r=run(journal(),{prices:prices.filter(p=>!(p.instrument==='SHARE'&&p.sessionId==='02'))});assert.equal(r.state,'Missing data');assert.ok(!r.journal.outcomes.some(o=>o.kind==='ENTRY'));
});
test('missing intermediate bar withholds exit return',()=>{
 const r=run(journal(),{prices:prices.filter(p=>!(p.instrument==='SHARE'&&p.sessionId==='03'))});assert.equal(r.state,'Missing data');assert.ok(!r.journal.outcomes.some(o=>o.kind==='EXIT'));
});
test('duplicate, wrong currency and invalid prices fail closed',()=>{
 for(const changed of [[...prices,prices[0]],prices.map((p,i)=>i===0?{...p,currency:'AUD'}:p),prices.map((p,i)=>i===0?{...p,close:0}:p)]) assert.equal(run(journal(),{prices:changed}).state,'Missing data');
});
test('future loaded bars cannot be used',()=>{
 assert.equal(run(journal(),{prices:prices.map(p=>({...p,loadedAt:'2026-09-05T00:00:00Z'}))}).state,'Missing data');
});
test('sell before intended session cancels without entry',()=>{
 const s={...sell,publishedAt:'2026-09-02T08:00:00Z',sourceCutoff:'2026-09-02T07:00:00Z'};
 const r=run(journal([buy,s]));assert.equal(r.state,'Not entered');assert.deepEqual(r.journal.outcomes.map(o=>o.kind),['CANCELLED']);
});
test('WAIT and AVOID never manufacture positions',()=>{for(const action of ['WAIT','AVOID']) assert.equal(run(journal([event('wait',action,'01')])).journal.outcomes.length,0);});
test('corporate-action changes withhold results',()=>{
 assert.equal(run(journal(),{prices:prices.map(p=>p.sessionId==='03'?{...p,adjustedClose:p.close/2}:p)}).state,'Missing data');
});
test('pinned entry revision does not rewrite evidence',()=>{
 const first=run(journal([buy]),{asOf:'2026-09-02T17:00:00Z'});
 const r=run(first.journal,{prices:prices.map((p,i)=>i===0?{...p,close:99,adjustedClose:99}:p)});
 assert.equal(r.state,'Missing data');assert.equal(r.journal.outcomes.find(o=>o.kind==='ENTRY').price,100);
});
test('future signal and incomplete session are not executed',()=>{
 assert.equal(run(journal(),{asOf:'2026-09-02T12:00:00Z'}).state,'Awaiting entry');
 assert.equal(run(journal(),{asOf:'2026-09-01T12:00:00Z'}).state,'Watching');
});
test('calendar ambiguity rejected; missing future calendar explicit',()=>{
 assert.throws(()=>run(journal(),{sessions:[...sessions,sessions[0]]}),/calendar/);
 assert.equal(run(journal(),{sessions:[]}).state,'Calendar required');
});
test('losing trade is retained and costs increase the loss',()=>{
 const r=run(journal(),{prices:prices.map(p=>p.instrument==='SHARE'&&p.sessionId==='04'?{...p,close:90,adjustedClose:90}:p)});
 const exit=r.journal.outcomes.find(o=>o.kind==='EXIT');assert.ok(Math.abs(exit.netReturn-(-.10179820179820176))<1e-12);
});
test('missing exit cannot move sale into a later session',()=>{
 const r=run(journal(),{prices:prices.filter(p=>!(p.instrument==='SHARE'&&p.sessionId==='04'))});
 assert.equal(r.state,'Missing data');assert.ok(!r.journal.outcomes.some(o=>o.kind==='EXIT'));
});
test('5 and 20 session checkpoints measure without forcing a sale',()=>{
 const calendar=Array.from({length:21},(_,i)=>{const day=new Date(Date.UTC(2026,8,2+i)).toISOString().slice(0,10);return {id:day,opensAt:day+'T09:00:00Z',closesAt:day+'T16:00:00Z'};});
 // Intentionally synthetic daily calendar, not a claimed real exchange calendar.
 const tape=calendar.flatMap((s,i)=>['SHARE','INDEX'].map(instrument=>({instrument,sessionId:s.id,close:100+i,adjustedClose:100+i,provider:'fixture',currency:'USD',loadedAt:s.closesAt})));
 const r=run(journal([buy]),{sessions:calendar,prices:tape,asOf:'2026-10-01T00:00:00Z'});
 assert.equal(r.state,'Open');assert.equal(r.journal.outcomes.find(o=>o.kind==='CHECKPOINT_5').price,105);
 assert.equal(r.journal.outcomes.find(o=>o.kind==='CHECKPOINT_20').price,120);assert.ok(!r.journal.outcomes.some(o=>o.kind==='EXIT'));
});
test('late Sell cannot cancel or backdate an already evaluated position',()=>{
 const first=run(journal([buy]),{asOf:'2026-09-02T17:00:00Z'}).journal;
 assert.throws(()=>appendCall(first,{...sell,publishedAt:'2026-09-02T08:00:00Z',sourceCutoff:'2026-09-02T07:00:00Z'}),/predates evaluated/);
 assert.equal(appendCall(first,hold).events.at(-1).action,'HOLD');
});
test('evaluations cannot rewind open, closed or empty history',()=>{
 for(const first of [run(journal([buy])).journal,run().journal,run(journal([event('wait','WAIT','01')])).journal]) {
  assert.throws(()=>run(first,{asOf:'2026-09-01T12:00:00Z'}),/cannot rewind/);
 }
});
test('changed calendar cannot relocate an existing entry',()=>{
 const first=run(journal([buy]),{asOf:'2026-09-02T17:00:00Z'}).journal;
 assert.throws(()=>run(first,{sessions:sessions.slice(1)}),/Calendar conflicts/);
});

