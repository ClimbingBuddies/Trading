import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as watchlistRecommendations from '../lib/watchlist-recommendations.mjs';

// Actual TSX, JSX runtime and React renderer. Only data-loading hooks and
// unrelated panels are replaced; no browser, credentials or network is used.
// Optional baseline mode demonstrates these regressions against committed HEAD.
const now=Date.parse('2026-11-19T00:00:00Z');
const fresh='2026-11-18T23:00:00Z',old='2026-11-14T00:00:00Z';
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const baseline=process.env.DECISION_DELIVERY_BASELINE==='1';
function source(name){const path=`components/${name}.tsx`;return baseline?execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'}):readFileSync(new URL('../'+path,import.meta.url),'utf8');}
const styles=new Proxy({}, {get:(_,key)=>String(key)});
function load(name,{react=React,research}={}){
  const js=ts.transpileModule(source(name),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,Date:FixedDate,URL,console,require:specifier=>{
    if(specifier==='react')return react;
    if(specifier==='react/jsx-runtime')return jsxRuntime;
    if(specifier.endsWith('.module.css'))return {default:styles};
    if(specifier==='@/lib/watchlist-recommendations.mjs')return watchlistRecommendations;
    if(specifier==='@/lib/supabase-browser')return {getBrowserSupabase(){throw new Error('Unexpected data service access in rendering test');}};
    if(specifier==='./SharedResearchRecommendations')return research;
    if(specifier==='./TradingPipelineStatus')return {default:({children})=>React.createElement('section',{'aria-label':'Review status fixture'},children)};
    if(specifier==='./SharedAIPerformance')return {default:()=>null};
    throw new Error('Unconfigured component dependency: '+specifier);
  }},{filename:name+'.js'});
  return exports;
}
const researchModule=load('SharedResearchRecommendations');
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const instrument=(id='research-stock')=>({id,symbol:id==='research-stock'?'SYNTH':'OTHER',name:'Synthetic company',exchange:'ASX',currency:'AUD'});
const decision=(cutoff=old)=>({id:'saved-recommendation',action:'WAIT',publishedAt:fresh,sourceCutoff:cutoff,thesis:'Saved reasoning',risks:'Saved uncertainty',modelIdentity:'synthetic-model',assessmentId:'assessment'});
const item=(cutoff=old)=>({instrument:instrument(),original:{...decision(fresh),id:'original'},latest:decision(cutoff),history:[],sources:[],
  priceEvidence:{status:'ABSENT',latestAt:null,latestLoadedAt:null,providers:[],sampleRows:0,availableRows:0,omittedRows:0,caveat:'No execution evidence'},
  measurementStatus:'NOT_MEASURABLE',measurementBlocker:'A verified paper entry is unavailable.',includedInPerformance:false});
const blocker=(code,message,id='research-stock')=>({instrument:instrument(id),blocker:{code,message,stage:'research',lastAttemptAt:fresh,nextAction:'Resolve '+message}});
function workspace({items=[item()],blocked=[],error='',loading=false,selectResearch=false}={}){
  const payload={contractVersion:1,generatedAt:fresh,items:[],nextCursor:null,blockedItems:blocked,blockedNextCursor:null,
    counts:{trackedCalls:0,watching:0,awaitingEntry:0,open:0,exitSignal:0,closed:0,cancelled:0,blockedWithoutCall:blocked.length,callsNeedingAttention:0}};
  const state=['all',5,{cursor:null,blocked:null},0,null,selectResearch?items[0]:null,false,true,{warning:false,title:'Verified'},
    {key:'all:::0',payload,error:''},null];let stateIndex=0;
  const react={...React,useState:initial=>[stateIndex in state?state[stateIndex++]:typeof initial==='function'?initial():initial,()=>{}]};
  const module=load('SharedDecisionWorkspace',{react,research:{...researchModule,useSharedResearchRecommendations:()=>({payload:error||loading?null:{contractVersion:1,generatedAt:fresh,items},error,loading,retry(){}})}});
  return render(module.default,{});
}
function latestSection(markup){const sections=markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/g)||[];const latest=sections.find(s=>s.includes('Latest saved recommendation'));assert.ok(latest,'Latest drawer section is rendered');return latest;}
function savedTable(markup){const tables=markup.match(/<table\b[^>]*>[\s\S]*?<\/table>/g)||[];const table=tables.find(t=>t.includes('Saved AI decisions and selected-horizon action trials'));assert.ok(table,'Saved decisions table is rendered');return table;}

test('recent publication never makes an old source cutoff current in the actual saved row',()=>{
  const html=savedTable(workspace());assert.match(html,/Older assessment/);assert.match(html,/Research cutoff/);assert.ok(html.includes(old));assert.match(html,/Published/);assert.match(html,/Research only/);assert.doesNotMatch(html,/Matured|[+]\d+[.]\d+%/);
});
test('latest drawer section warns about old research independently of recent publication and original record',()=>{
  const html=latestSection(render(researchModule.default,{item:item(),onClose(){}}));assert.match(html,/Older assessment/);assert.ok(html.includes(old));assert.ok(html.includes(fresh));
});
test('actual workspace selection renders the research drawer with the same old-cutoff warning',()=>{
  const html=workspace({selectResearch:true});assert.match(html,/<dialog\b/);assert.match(latestSection(html),/Older assessment/);
});
for(const [name,cutoff,older] of [
  ['exactly 72 hours','2026-11-16T00:00:00.000Z',false],
  ['one millisecond older than 72 hours','2026-11-15T23:59:59.999Z',true],
  ['one millisecond younger than 72 hours','2026-11-16T00:00:00.001Z',false],
  ['cutoff equal to now','2026-11-19T00:00:00.000Z',false],
])test('ResearchRecency renders the '+name+' boundary',()=>{
  assert.equal(typeof researchModule.ResearchRecency,'function');const html=render(researchModule.ResearchRecency,{cutoff,now});
  assert.match(html,/Research cutoff/);assert.ok(html.includes(cutoff));assert.equal(html.includes('Older assessment'),older);assert.doesNotMatch(html,/unverified/);
});
for(const [name,cutoff] of [['missing',undefined],['null',null],['empty',''],['invalid','not-a-date'],['future','2026-11-19T00:00:00.001Z']])test(name+' cutoff is explicitly unverified without an Older or current label',()=>{
  assert.equal(typeof researchModule.ResearchRecency,'function');const html=render(researchModule.ResearchRecency,{cutoff,now});
  assert.match(html,/Research date unverified/);assert.doesNotMatch(html,/Older assessment|<time\b|Current assessment|Fresh assessment/);
});
test('nonfinite caller clock cannot certify research recency',()=>{
  for(const instant of [NaN,Infinity])assert.match(render(researchModule.ResearchRecency,{cutoff:fresh,now:instant}),/Research date unverified/);
});
test('latest fresh recommendation does not inherit an old original warning',()=>{
  const record=item(fresh);record.original=decision(old);const latest=latestSection(render(researchModule.default,{item:record,onClose(){}}));
  assert.doesNotMatch(latest,/Older assessment/);assert.ok(latest.includes(fresh));assert.doesNotMatch(savedTable(workspace({items:[record]})),/Older assessment/);
});
test('future latest cutoff stays explicitly unverified in both row and drawer',()=>{
  const record=item('2026-11-20T00:00:00Z');assert.match(savedTable(workspace({items:[record]})),/Research date unverified/);
  assert.match(latestSection(render(researchModule.default,{item:record,onClose(){}})),/Research date unverified/);
});
test('research suppresses only its own generic SHARED_CALL_PENDING placeholder',()=>{
  const html=workspace({blocked:[blocker('SHARED_CALL_PENDING','Generic redundant placeholder'),blocker('PRICE_SESSION_MISSING','Concrete session issue'),blocker('SOURCE_AUDIT_INVALID','Concrete source issue'),blocker('SHARED_CALL_PENDING','Other instrument placeholder','other-stock')]});
  assert.doesNotMatch(html,/Generic redundant placeholder/);for(const text of ['Concrete session issue','Concrete source issue','Other instrument placeholder','A verified paper entry is unavailable.'])assert.ok(html.includes(text),text);
});
test('unknown future blocker codes remain visible even when saved research exists',()=>{
  assert.match(workspace({blocked:[blocker('FUTURE_VALIDATION_BLOCKER','New validation issue')]}),/New validation issue/);
});
test('missing research cannot suppress the pending placeholder',()=>{
  assert.match(workspace({items:[],blocked:[blocker('SHARED_CALL_PENDING','Still pending without research')]}),/Still pending without research/);
});
for(const failure of [{error:'Research verification failed'},{loading:true}])test('unverified or loading research cannot suppress pending delivery ('+JSON.stringify(failure)+')',()=>{
  const html=workspace({...failure,blocked:[blocker('SHARED_CALL_PENDING','Pending until research is verified')]});assert.match(html,/Pending until research is verified/);assert.doesNotMatch(html,/saved decisions · 1 research only/);
});
