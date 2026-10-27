import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'
import * as statusHelpers from '../lib/trading-pipeline-status.mjs'
import { pipelineFixture, monitorNow } from './fixtures/trading-pipeline-status.mjs'

const source=fs.readFileSync(new URL('../components/TradingPipelineStatus.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function load(status=pipelineFixture(),response={data:pipelineFixture(),error:null},failed=false){
 let index=0;const values=[status,failed,monitorNow],writes=[],effects=[],exports={};let cleared=false,removed=false;
 class Clock extends Date{static now(){return monitorNow}}
 vm.runInNewContext(compiled,{exports,Date:Clock,setInterval:()=>1,clearInterval:()=>{cleared=true},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){removed=true}},require(name){
  if(name==='react')return{useState:value=>{const n=index++;return[values[n],value=>writes.push({n,value})]},useEffect:fn=>effects.push(fn)};
  if(name==='react/jsx-runtime')return jsxRuntime;
  if(name.includes('supabase-browser'))return{getBrowserSupabase:()=>({rpc:async()=>await response})};
  if(name.includes('trading-pipeline-status.mjs'))return statusHelpers;
  if(name.endsWith('.css'))return{default:new Proxy({},{get:(_,key)=>String(key)})};
  throw Error('Unexpected import '+name);
 }});
 return{render:props=>renderToStaticMarkup(exports.default(props)),writes,effects,cleaned:()=>cleared&&removed};
}

test('valid monitor contract renders its evidence and verified completion summary',()=>{
 const r=load();const html=r.render();assert.ok(html.includes('Morning review completed'));assert.ok(html.includes('4/4 researched'));assert.ok(html.includes('Share coverage')===false);
});

test('contradictory completion and unknown prototype states render warning text without crashing',()=>{
 const p=pipelineFixture();p.snapshot.counts={supported:4,blocked:0,researched:0,published:0,evaluated:0};
 let html=load(p).render();assert.ok(html.includes('Morning review completion is unverified'));assert.ok(!html.includes('Morning review completed'));
 p.snapshot.state='toString';html=load(p).render();assert.ok(html.includes('unknown status'));
});

test('malformed collections clear the last good response instead of crashing or showing cached success',async()=>{
 for(const change of [p=>p.snapshot.problems=null,p=>p.snapshot.instruments=[null],p=>p.incidents=null]){
  const malformed=pipelineFixture();change(malformed);const r=load(pipelineFixture(),{data:malformed,error:null});r.render();r.effects[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(r.writes.some(w=>w.n===0&&w.value===null));assert.ok(r.writes.some(w=>w.n===1&&w.value===true));
 }
 const html=load(null,undefined,true).render();assert.ok(html.includes('Daily monitor is unavailable or overdue'));assert.ok(!html.includes('Morning review completed'));
});

test('RPC failures clear stale successful evidence',async()=>{
 const r=load(pipelineFixture(),{data:null,error:{code:'UNAVAILABLE'}});r.render();r.effects[0]();await new Promise(resolve=>setImmediate(resolve));
 assert.ok(r.writes.some(w=>w.n===0&&w.value===null));assert.ok(r.writes.some(w=>w.n===1&&w.value===true));
});

test('null snapshot renders an explicit unavailable state without unsafe array access',()=>{
 const p=pipelineFixture();p.snapshot=null;const html=load(p).render();assert.ok(html.includes('Daily monitor is unavailable or overdue'));
});

test('unmounted panel removes timers/listeners and ignores late status responses',async()=>{
 let resolve;const pending=new Promise(done=>{resolve=done});const r=load(pipelineFixture(),pending);r.render();const cleanup=r.effects[0]();cleanup();resolve({data:pipelineFixture(),error:null});
 await new Promise(done=>setImmediate(done));assert.equal(r.writes.length,0);assert.equal(r.cleaned(),true);
});
