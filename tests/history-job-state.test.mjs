import test from 'node:test';
import assert from 'node:assert/strict';
import {persistJobState,JobStateUnconfirmed} from '../supabase/functions/market-history-maintenance-worker/job-state.mjs';
const job={id:'job-1',attempts:2};
function mock(result){const calls=[];const q={update(v){calls.push(['update',v]);return q},eq(...v){calls.push(v);return q},async select(){if(result instanceof Error)throw result;return result}};return {db:{from(t){assert.equal(t,'market_history_jobs');return q}},calls};}
test('acknowledged transition requires exact running claim and attempt',async()=>{const {db,calls}=mock({data:[{id:job.id}],error:null});await persistJobState(db,job,{status:'succeeded'});assert.deepEqual(calls.slice(1),[['id',job.id],['status','running'],['attempts',2]]);});
for(const [name,result] of [['DB error',{data:null,error:{message:'unavailable'}}],['lost claim',{data:[],error:null}],['wrong receipt',{data:[{id:'different'}],error:null}],['duplicate receipt',{data:[{id:job.id},{id:job.id}],error:null}],['transport ambiguity',new Error('timeout')]])test(name+' does not claim success',async()=>{const {db,calls}=mock(result);await assert.rejects(persistJobState(db,job,{status:'pending'}),JobStateUnconfirmed);assert.equal(calls.filter(x=>x[0]==='update').length,1);});
