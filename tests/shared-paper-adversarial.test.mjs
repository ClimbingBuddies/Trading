import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournal,appendCall,evaluateJournal} from '../lib/shared-paper-engine.mjs';
const event=(id,action,day)=>({id,assessmentId:id,model:'synthetic',thesis:'Synthetic only',risks:'Synthetic only',inputHash:id,action,publishedAt:`2026-09-${day}T18:00:00Z`,sourceCutoff:`2026-09-${day}T17:00:00Z`});
const sessions=['02','03','04','05'].map(day=>({id:day,opensAt:`2026-09-${day}T09:00:00Z`,closesAt:`2026-09-${day}T16:00:00Z`}));
const prices=sessions.flatMap((s,i)=>['S','B'].map(instrument=>({instrument,sessionId:s.id,close:100+i*5,adjustedClose:100+i*5,provider:'fixture',currency:'USD',loadedAt:s.closesAt})));
const make=(events=[event('buy','BUY','01')])=>createJournal({id:'j',instrument:'S',benchmark:'B',currency:'USD',provider:'fixture',events});
const run=(journal,extra={})=>evaluateJournal(journal,{sessions,prices,asOf:'2026-09-05T17:00:00Z',...extra});

test('pinned entry must not be cancelled when later evaluation omits original calendar session',()=>{
 const first=run(make(),{asOf:'2026-09-02T17:00:00Z'});
 const j=appendCall(first.journal,event('sell','SELL','03'));
 assert.throws(()=>run(j,{sessions:sessions.slice(2)}),/Calendar conflicts with pinned entry/);
 assert.ok(!j.outcomes.some(o=>o.kind==='CANCELLED'),'existing entry incorrectly cancelled');
});

test('calendar change must not silently change return or exit price from pinned entry',()=>{
 const first=run(make(),{asOf:'2026-09-02T17:00:00Z'});
 assert.throws(()=>run(first.journal,{sessions:sessions.slice(1)}),/Calendar conflicts with pinned entry/);
 assert.equal(first.journal.outcomes.find(o=>o.kind==='ENTRY').sessionId,'02');
});

test('chronological rewind cannot report a future closed position as currently closed',()=>{
 const closed=run(make([event('buy','BUY','01'),event('sell','SELL','03')]));
 assert.throws(()=>run(closed.journal,{asOf:'2026-09-02T17:00:00Z'}),/chronolog|rewind|earlier|asOf/i);
});

test('SELL without next calendar session must explicitly request a calendar',()=>{
 const j=make([event('buy','BUY','01'),event('sell','SELL','05')]);
 const r=run(j,{asOf:'2026-09-06T17:00:00Z'});
 assert.equal(r.state,'Calendar required');
});

test('missing exit remains pinned to intended session after a later session appears',()=>{
 const j=make([event('buy','BUY','01'),event('sell','SELL','03')]);
 const r=run(j,{prices:prices.filter(p=>!(p.instrument==='S'&&p.sessionId==='04'))});
 assert.equal(r.state,'Missing data');
 assert.ok(!r.journal.outcomes.some(o=>o.kind==='EXIT'));
 const retry=run(r.journal,{prices:prices.filter(p=>!(p.instrument==='S'&&p.sessionId==='04'))});
 assert.equal(retry.added.length,0);
 const recovered=run(retry.journal);
 assert.equal(recovered.journal.outcomes.find(o=>o.kind==='EXIT').sessionId,'04');
});

test('revised intermediate evidence blocks new marks and preserves old measurements',()=>{
 const first=run(make(),{asOf:'2026-09-03T17:00:00Z'});
 const r=run(first.journal,{prices:prices.map(p=>p.sessionId==='03'?{...p,close:90,adjustedClose:90}:p)});
 assert.equal(r.state,'Missing data');
 assert.equal(r.journal.outcomes.find(o=>o.kind==='MARK'&&o.sessionId==='03').price,105);
 assert.ok(!r.journal.outcomes.some(o=>o.kind==='MARK'&&o.sessionId==='04'));
});

test('a backdated SELL cannot be appended behind already measured outcomes',()=>{
 const measured=run(make());
 assert.throws(()=>appendCall(measured.journal,event('late-sell','SELL','03')),/chronolog|backdat|outcome|publication|predates evaluated history/i);
});

