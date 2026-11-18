import test from 'node:test';
import assert from 'node:assert/strict';
import {describeAsxConvergence,describePipelineStatus} from '../lib/trading-pipeline-status.mjs';
const now=Date.parse('2026-10-06T02:20:00Z');
const asx=()=>({contractVersion:1,checkedAt:'2026-10-06T02:15:00Z',state:'CURRENT',dispatchDue:true,calendarExpiring:false,
 counts:{active:1,current:1,blocked:0,ready:0,failed:0,running:0},alerts:{configuredRules:0,pending:0,failed:0,exhausted:0},instruments:[{symbol:'TEST',reason:'CURRENT'}]});
const fixture=()=>({snapshot:{checkedAt:'2026-10-06T02:15:00Z',state:'COMPLETE',marketDue:true,counts:{supported:4,blocked:0,researched:4,published:4,evaluated:4},asxConvergence:asx()},incidents:[]});
test('verified completed review reports saved counts, not Buy count',()=>{const p=fixture();assert.equal(describePipelineStatus(p,now).warning,false);assert.match(describePipelineStatus(p,now).detail,/4\/4 researched/)});
test('missing, future and stale monitor evidence never reads healthy',()=>{for(const p of [null,{snapshot:{}},{snapshot:{...fixture().snapshot,checkedAt:'2026-10-07T00:00:00Z'}},{snapshot:{...fixture().snapshot,checkedAt:'2026-10-06T01:00:00Z'}}])assert.equal(describePipelineStatus(p,now).warning,true)});
test('unresolved previous incident remains visible after todays success',()=>{const p=fixture();p.incidents=[{id:'missed'}];assert.equal(describePipelineStatus(p,now).warning,true)});
test('weekend has no invented research count',()=>{const p=fixture();p.snapshot.marketDue=false;assert.match(describePipelineStatus(p,now).detail,/No US Decision Lab review due/)});
test('partial, unknown and malformed evidence fail visibly',()=>{for(const s of ['PARTIAL','garbage']){const p=fixture();p.snapshot.state=s;assert.equal(describePipelineStatus(p,now).warning,true)}const p=fixture();p.snapshot.counts.evaluated=-1;assert.equal(describePipelineStatus(p,now).warning,true)});
test('missing ASX evidence cannot certify a complete morning as fully healthy',()=>{
 const p=fixture();delete p.snapshot.asxConvergence;assert.equal(describePipelineStatus(p,now).warning,true);
 assert.match(describePipelineStatus(p,now).title,/ASX monitoring unverified/i);
});
test('ASX incomplete coverage remains visible on a US non-trading day',()=>{
 const p=fixture();p.snapshot.marketDue=false;p.snapshot.asxConvergence={...asx(),state:'ATTENTION',counts:{active:1,current:0,blocked:1,ready:0,failed:0,running:0},instruments:[{symbol:'TEST',reason:'AI_INPUT_MISSING'}]};
 assert.equal(describePipelineStatus(p,now).warning,true);assert.match(describePipelineStatus(p,now).detail,/ASX signals need attention/);
 assert.match(describeAsxConvergence(p.snapshot.asxConvergence,now).detail,/1 blocked/);
});
test('outside due window blockers remain visible and unresolved incident stays open',()=>{
 const p={...asx(),state:'DEFERRED',dispatchDue:false,incidentOpenedAt:'2026-10-06T02:00:00Z',incidentResolvedAt:null};
 assert.equal(describeAsxConvergence(p,now).warning,true);assert.match(describeAsxConvergence(p,now).title,/deferred/);
});
test('no configured rules is explicit and does not claim delivery',()=>{
 const v=describeAsxConvergence(asx(),now);assert.equal(v.verified,true);assert.match(v.detail,/No ASX alert rules enabled/);assert.doesNotMatch(v.detail,/delivered/);
});
test('overnight alert failures warn even when current coverage is deferred',()=>{
 for(const state of ['NOT_DUE','DEFERRED']){
  const s={...asx(),state,dispatchDue:false};s.alerts.exhausted=1;
  const v=describeAsxConvergence(s,now);assert.equal(v.verified,true);assert.equal(v.warning,true);
  assert.equal(v.title,'ASX alert processing needs attention');
 }
});
test('ASX timestamps counts and contradictory CURRENT claims fail closed',()=>{
 for(const modify of [s=>s.checkedAt='2026-10-06T01:00:00Z',s=>s.checkedAt='2026-10-07T00:00:00Z',s=>s.counts.current=2,
  s=>s.alerts.pending=1,s=>s.calendarExpiring=true,s=>s.dispatchDue=false,s=>s.instruments=[],s=>s.alerts.failed=-1,s=>s.state='UNVERIFIED']){
  const s=asx();modify(s);const v=describeAsxConvergence(s,now);assert.equal(v.verified,false);assert.equal(v.warning,true);
 }
});
