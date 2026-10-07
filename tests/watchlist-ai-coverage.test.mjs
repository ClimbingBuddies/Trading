import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as mechanics from '../lib/watchlist-recommendations.mjs';
const source=fs.readFileSync(new URL('../components/WatchlistsClient.tsx',import.meta.url),'utf8');
const js=ts.transpileModule(source+'\nexport {savedAction,currentPlan,validRecommendations,WatchlistWorkspace};',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function boundary(react={},client={}) {
 const exports={};const jsx=(_type,props)=>props;
 vm.runInNewContext(js,{exports,require:name=>name==='react'?react:name.includes('watchlist-recommendations')?mechanics:name.includes('supabase-browser')?{getBrowserSupabase:()=>client}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}: {default:{}},Set,Map,Date,Number,AbortController});return exports;
}
const api=boundary();
const view=()=>({assessment_id:'a',instrument_id:'i',rating:'Hold',assessment_date:'2026-10-07',created_at:'2026-10-07T03:00:00Z',summary:'Saved thesis',key_risks:'Saved risks',model_version:'model',ai_action:'WAIT',source_kind:'RESEARCH_ONLY',source_cutoff:'2026-10-07T02:00:00Z',saved_record_id:'r',measurement_blocker:'No verified benchmark/session attribution.'});
const payload=()=>({contractVersion:1,items:[view()]});
const plan=(changes={})=>({id:'p',instrument_id:'i',assessment_id:'a',horizon_sessions:5,action:'WAIT',published_at:'2026-10-07T03:00:00Z',...changes});
test('saved WAIT overrides underlying Hold assessment rating',()=>assert.equal(api.savedAction(view()),'WAIT'));
test('scheduled assessment with null saved action uses rating',()=>assert.equal(api.savedAction({...view(),ai_action:null,source_kind:'SCHEDULED_ASSESSMENT'}),'HOLD'));
test('missing recommendation does not become WAIT',()=>assert.equal(api.savedAction(undefined),'UNKNOWN'));
for(const action of ['BUY','HOLD','WAIT','SELL','REDUCE','AVOID']) test(`research-only ${action} never inherits matching personal plan`,()=>{const v={...view(),ai_action:action};for(const h of [5,20]) assert.equal(api.currentPlan([plan({action,horizon_sessions:h})],'i',v,h),null);});
test('shared-call plan requires identical assessment, horizon and action',()=>{const v={...view(),source_kind:'SHARED_CALL'};assert.equal(api.currentPlan([plan()],'i',v,5).id,'p');for(const changes of [{assessment_id:'old'},{instrument_id:'other'},{horizon_sessions:20},{action:'BUY'}])assert.equal(api.currentPlan([plan(changes)],'i',v,5),null);});
test('valid research and scheduled shapes accepted without fake saved record',()=>{assert.equal(api.validRecommendations(payload()),true);const p=payload();Object.assign(p.items[0],{source_kind:'SCHEDULED_ASSESSMENT',ai_action:null,saved_record_id:null,measurement_blocker:null});assert.equal(api.validRecommendations(p),true);});
for(const [name,mutate] of [['duplicate instrument',p=>p.items.push(view())],['missing source cutoff',p=>delete p.items[0].source_cutoff],['unknown source',p=>p.items[0].source_kind='MANUAL'],['unsaved research',p=>p.items[0].saved_record_id=null],['missing action',p=>p.items[0].ai_action=null],['unknown action',p=>p.items[0].ai_action='STRONG_BUY'],['missing blocker',p=>p.items[0].measurement_blocker=null],['malformed saved time',p=>p.items[0].created_at='invalid']])test(`invalid coverage rejects ${name}`,()=>{const p=payload();mutate(p);assert.equal(api.validRecommendations(p),false);});
test('72-hour label uses frozen cutoff, including future/missing rejection',()=>{const now=Date.parse('2026-10-07T12:00:00Z');assert.equal(mechanics.olderAssessment('2026-10-04T12:00:00Z',now),false);assert.equal(mechanics.olderAssessment('2026-10-04T11:59:59Z',now),true);assert.equal(mechanics.olderAssessment('2026-10-08T12:00:00Z',now),true);});

function hooks(client) {
 const effects=[],writes=[];let index=0;
 const initial=[[{id:'l',name:'List'}],[{watchlist_id:'l',instrument_id:'i',sort_order:0,added_at:'2026-10-07',notes:null}],[],[],[],null,'l'];
 const react={useState:v=>{const n=index++;return [n<initial.length?initial[n]:v,value=>writes.push({n,value})]},useMemo:f=>f(),useCallback:f=>f,useEffect:f=>effects.push(f)};
 const exports=boundary(react,client);exports.WatchlistWorkspace({ownerId:'owner',embedded:true});return {effects,writes};
}
const chain=value=>{const o={then:(ok,bad)=>Promise.resolve(value).then(ok,bad)};for(const key of ['select','eq','in','order','range','abortSignal','maybeSingle'])o[key]=()=>o;return o;};
test('aborted older recommendation response cannot replace current state',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const client={rpc:()=>({abortSignal:()=>pending}),from:()=>chain({data:[],error:null})};
 const {effects,writes}=hooks(client);const cleanup=effects[1]();const baseline=writes.length;cleanup();resolve({data:payload(),error:null});await new Promise(r=>setTimeout(r,0));assert.equal(writes.length,baseline);
});
test('invalid RPC response sets error and never substitutes recommendation',async()=>{
 const client={rpc:()=>({abortSignal:()=>Promise.resolve({data:{contractVersion:9,items:[]},error:null})}),from:()=>chain({data:[],error:null})};
 const {effects,writes}=hooks(client);effects[1]();await new Promise(r=>setTimeout(r,0));assert.ok(writes.some(w=>typeof w.value==='string'&&w.value.includes('could not be loaded')));assert.equal(writes.some(w=>w.n===3&&Array.isArray(w.value)&&w.value.length>0),false);
});
