import test from 'node:test';
import assert from 'node:assert/strict';
import {describePipelineStatus,isPipelineStatusPayload} from '../lib/trading-pipeline-status.mjs';
import {pipelineFixture as fixture,pipelineProblem,monitorNow as now} from './fixtures/trading-pipeline-status.mjs';
test('verified completed review reports saved counts, not Buy count',()=>{const p=fixture();assert.equal(describePipelineStatus(p,now).warning,false);assert.match(describePipelineStatus(p,now).detail,/4\/4 researched/)});
test('missing, future and stale monitor evidence never reads healthy',()=>{for(const p of [null,{snapshot:{}},{snapshot:{...fixture().snapshot,checkedAt:'2026-10-07T00:00:00Z'}},{snapshot:{...fixture().snapshot,checkedAt:'2026-10-06T01:00:00Z'}}])assert.equal(describePipelineStatus(p,now).warning,true)});
test('unresolved previous incident remains visible after todays success',()=>{const p=fixture();p.incidents=[{...pipelineProblem(),id:'missed',date:'2026-10-05'}];assert.equal(describePipelineStatus(p,now).warning,true)});
test('weekend has no invented research count',()=>{const p=fixture();p.snapshot.marketDue=false;assert.match(describePipelineStatus(p,now).detail,/No US Decision Lab review due/)});
test('partial, unknown and malformed evidence fail visibly',()=>{for(const s of ['PARTIAL','garbage']){const p=fixture();p.snapshot.state=s;assert.equal(describePipelineStatus(p,now).warning,true)}const p=fixture();p.snapshot.counts.evaluated=-1;assert.equal(describePipelineStatus(p,now).warning,true)});

test('a completed label cannot override incomplete due-stage counts or zero supported instruments',()=>{
 for(const counts of [{supported:4,blocked:0,researched:0,published:0,evaluated:0},{supported:4,blocked:0,researched:4,published:3,evaluated:2},{supported:0,blocked:0,researched:0,published:0,evaluated:0}]){
  const p=fixture();p.snapshot.counts=counts;const view=describePipelineStatus(p,now);
  assert.equal(view.warning,true);assert.equal(view.title,'Morning review completion is unverified');
 }
});

test('impossible stage progression and unsafe counters are never healthy',()=>{
 for(const changes of [{researched:5},{published:5},{evaluated:5},{researched:1.5},{evaluated:Infinity},{supported:Number.MAX_SAFE_INTEGER+1}]){
  const p=fixture();Object.assign(p.snapshot.counts,changes);assert.equal(describePipelineStatus(p,now).warning,true);
 }
});

test('completion needs recorded completion, controller, calendar and no unresolved current blockers',()=>{
 const mutations=[p=>p.lastCompletedMorningAt=null,p=>p.lastCompletedMorningAt='2026-10-06T02:00:00Z',p=>p.snapshot.controllerLastSeenAt=null,p=>p.snapshot.lastResearchAt=null,p=>p.snapshot.calendarExpiresAt=null,p=>p.snapshot.calendarExpiresAt='2026-10-06T02:15:00Z',p=>p.snapshot.counts.blocked=1,p=>p.snapshot.problems=[pipelineProblem()],p=>p.snapshot.deadline='2026-10-06T02:30:00Z'];
 for(const mutate of mutations){const p=fixture();mutate(p);assert.equal(describePipelineStatus(p,now).warning,true)}
});

test('before-deadline pending work is not falsely declared failed; after deadline completion remains unverified',()=>{
 const p=fixture();p.lastCompletedMorningAt=null;p.snapshot.state='PENDING';p.snapshot.deadline='2026-10-06T02:30:00Z';p.snapshot.counts={supported:4,blocked:0,researched:0,published:0,evaluated:0};
 assert.equal(describePipelineStatus(p,now).title,'Morning review pending');assert.equal(describePipelineStatus(p,now).warning,false);
 const overdue=describePipelineStatus(p,Date.parse('2026-10-06T02:31:00Z'));
 assert.equal(overdue.warning,true);assert.match(overdue.detail,/not proof that the controller failed/);
});

test('current problems warn even during a pending review',()=>{
 const p=fixture();p.snapshot.state='PENDING';p.snapshot.deadline='2026-10-06T02:30:00Z';p.snapshot.problems=[pipelineProblem()];
 assert.equal(describePipelineStatus(p,now).warning,true);
});

test('a verified non-session day does not require invented US research counts',()=>{
 const p=fixture();p.snapshot.marketDue=false;p.snapshot.counts={supported:4,blocked:0,researched:0,published:0,evaluated:0};p.snapshot.lastResearchAt=null;
 const view=describePipelineStatus(p,now);assert.equal(view.warning,false);assert.match(view.detail,/No US Decision Lab review due/);
});

test('missing calendar trust cannot masquerade as a successful non-session skip',()=>{
 const p=fixture();p.snapshot.marketDue=false;p.snapshot.calendarExpiresAt=null;
 assert.equal(describePipelineStatus(p,now).warning,true);
});

test('calendar trust that expires after a valid snapshot stops being healthy without waiting for the next poll',()=>{
 const p=fixture();p.snapshot.calendarExpiresAt='2026-10-06T02:25:00Z';
 assert.equal(describePipelineStatus(p,Date.parse('2026-10-06T02:26:00Z')).warning,true);
});

test('prototype property names are unknown states, never functions rendered as titles',()=>{
 for(const state of ['toString','constructor','__proto__']){const p=fixture();p.snapshot.state=state;const view=describePipelineStatus(p,now);assert.equal(view.warning,true);assert.equal(typeof view.title,'string');assert.match(view.title,/unknown status/)}
});

test('malformed rendered collections and contract fields fail validation without throwing',()=>{
 const mutations=[p=>p.contractVersion=2,p=>p.incidents=null,p=>p.incidents=[null],p=>p.incidents=[{...pipelineProblem(),id:'i',date:'2026-02-30'}],p=>p.snapshot.problems=null,p=>p.snapshot.problems=[{code:'BAD',message:{},nextAction:'Inspect'}],p=>p.snapshot.instruments=null,p=>p.snapshot.instruments=[null],p=>p.snapshot.instruments=[{symbol:'TEST',reason:{}}],p=>p.snapshot.marketDue='false',p=>p.snapshot.marketSession='2026-02-30',p=>p.snapshot.deadline='yesterday',p=>p.snapshot.nextExpectedAt=null,p=>delete p.snapshot.lastResearchAt];
 for(const mutate of mutations){const p=fixture();mutate(p);assert.equal(isPipelineStatusPayload(p),false);assert.equal(describePipelineStatus(p,now).warning,true)}
});

test('null snapshots are allowed structurally but never treated as verified run status',()=>{
 const p=fixture();p.snapshot=null;assert.equal(isPipelineStatusPayload(p),true);assert.equal(describePipelineStatus(p,now).warning,true);
});

test('future receipts and invalid clocks cannot report success',()=>{
 for(const field of ['lastCompletedMorningAt','lastResearchAt','controllerLastSeenAt']){const p=fixture();(field==='lastCompletedMorningAt'?p:p.snapshot)[field]='2026-10-07T00:00:00Z';assert.equal(describePipelineStatus(p,now).warning,true)}
 assert.equal(describePipelineStatus(fixture(),NaN).warning,true);
});
