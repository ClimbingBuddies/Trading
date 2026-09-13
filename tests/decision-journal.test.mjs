import test from 'node:test'
import assert from 'node:assert/strict'
import { decisionRow } from '../lib/decision-journal.mjs'
const p={id:'p',methodology:'decision-journal-v3',action:'HOLD',published_at:'2026-01-01',thesis:'Wait first'}
const events=[
{id:'a',prediction_id:'p',actor:'AI',action:'WAIT',published_at:'2026-01-01',note:'Original wait'},
{id:'b',prediction_id:'p',actor:'AI',action:'BUY',published_at:'2026-01-02',note:'New evidence'},
{id:'c',prediction_id:'p',actor:'USER',action:'SELL',published_at:'2026-01-04',note:'Personal decision'},
]
const outcome=(kind,date,extra={})=>({id:kind,prediction_id:'p',kind,as_of:date,recorded_at:date,...extra})
test('Original AI call survives updates and personal decisions do not become the latest AI view',()=>{
 const r=decisionRow(p,events,[],[])
 assert.equal(r.original,'WAIT');assert.equal(r.latest,'BUY');assert.equal(r.history.length,3);assert.equal(r.status,'Awaiting entry')
})
test('Checkpoints do not close positions; losses and zero returns stay visible',()=>{
 const out=[outcome('ENTRY','2026-01-03',{price:100}),outcome('MARK','2026-01-10',{net_return:-.05,benchmark_return:.01}),outcome('CHECKPOINT_5','2026-01-09',{net_return:0,benchmark_return:0})]
 assert.equal(decisionRow(p,events,out,[]).status,'Open')
 assert.equal(decisionRow(p,events,out,[]).result.net_return,-.05)
 assert.equal(decisionRow(p,events,out,[],'CHECKPOINT_5').result.net_return,0)
 assert.equal(decisionRow(p,events,out,[],'CHECKPOINT_20').result,null)
})
test('A later AI sell and an observed exit are separate events',()=>{
 const e=[...events,{id:'d',prediction_id:'p',actor:'AI',action:'SELL',published_at:'2026-01-06',note:'Exit thesis'}]
 const out=[outcome('ENTRY','2026-01-03',{price:100})]
 assert.equal(decisionRow(p,e,out,[]).status,'Exit signal')
 out.push(outcome('EXIT','2026-01-07',{price:90,net_return:-.102}))
 assert.equal(decisionRow(p,e,out,[]).status,'Closed')
 assert.equal(decisionRow(p,e,out,[]).result.net_return,-.102)
})
test('Unresolved evidence gaps withhold a provisional return',()=>{
 const out=[outcome('ENTRY','2026-01-03'),outcome('MARK','2026-01-10',{net_return:.2}),outcome('DATA_GAP','2026-01-10')]
 assert.equal(decisionRow(p,events,out,[]).result,null)
})
