import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const jsx=(type,props,key)=>({type,props:props||{},key});
function render(file,fn,props={},states=[],client={}) {
 const effects=[],writes=[];let index=0,refs=0;const modal={showCount:0,closeCount:0,showModal(){this.showCount++},close(){this.closeCount++}};
 const react={useId:()=> 'test',useState:value=>{const n=index++;return [n in states?states[n]:value,v=>writes.push({n,value:v})]},useEffect:f=>effects.push(f),useCallback:f=>f,useRef:value=>({current:refs++===0?modal:value})};
 const source=fs.readFileSync(new URL('../components/'+file+'.tsx',import.meta.url),'utf8');
 const js=ts.transpileModule(source+(fn==='DecisionDrawer'?'\nexport {DecisionDrawer};':''),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name.includes('supabase-browser')?{getBrowserSupabase:()=>client}:{default:name},Set,Map,Date,Number,crypto:{randomUUID:()=> 'request'}});
 return {tree:exports[fn](props),effects,writes,modal};
}
function nodes(tree,predicate=()=>true) { const found=[];function visit(n){if(Array.isArray(n)){n.forEach(visit);return;}if(n&&typeof n==='object'&&n.props){if(predicate(n))found.push(n);visit(n.props.children);}}visit(tree);return found; }
function text(tree){if(tree===null||tree===undefined||typeof tree==='boolean')return '';if(Array.isArray(tree))return tree.map(text).join(' ');if(typeof tree==='object')return text(tree.props?.children);return String(tree);}
const original={id:'original-event',action:'BUY',publishedAt:'2026-10-01T02:00:00Z',sourceCutoff:'2026-10-01T01:00:00Z',thesis:'Original immutable reasoning. '.repeat(15),risks:'Original immutable risk.',modelIdentity:'original-model',assessmentId:'original-assessment'};
const review={id:'review-event',action:'REDUCE',publishedAt:'2026-10-03T02:00:00Z',sourceCutoff:'2026-10-03T01:00:00Z',thesis:'Distinct saved review reasoning.',risks:'Distinct review risk.',modelIdentity:'review-model',assessmentId:'review-assessment'};
const item={callId:'call-id',instrument:{id:'stock',symbol:'AVGO',name:'Broadcom',exchange:'NASDAQ',currency:'USD'},original,latestReview:review,lastReviewedAt:review.publishedAt,state:'WATCHING',dataStatus:'READY',entry:null,exit:null,pricesAsOf:null,blocker:null,performance:null};
const detail=()=>({item:structuredClone(item),reviews:[structuredClone(review)],outcomes:[],evidence:{status:'unverified',methodology:'paper-cycle-v1'}});
const saved=['AVGO','BEAM','MRVL','NVDA'].map((symbol,n)=>({callId:'call-'+n,symbol,action:n?'WAIT':'BUY',publishedAt:original.publishedAt}));
const metrics={sampleSize:0,meanActionReturn:null,meanStockReturn:null,meanBenchmarkReturn:null,meanExcessStock:null,meanExcessBenchmark:null,benchmarkBeatRate:null,stockBeatRate:null,worstActionReturn:null,maxDrawdown:null};
const performance=()=>({contractVersion:1,methodology:'shared-action-trial-v1',generatedAt:review.publishedAt,horizon:5,counts:{events:4,matured:0,pending:4,blocked:0},overall:metrics,byModel:[],byAction:[],recent:[],limitations:[]});
const perfStates=p=>[5,0,{key:'all:5:0:0',payload:p,error:false}];
test('four visible saved-history arrows remain when zero trials have matured',()=>{
 const opened=[];const {tree}=render('SharedAIPerformance','default',{scope:'all',savedDecisions:saved,onOpenDecision:(...args)=>opened.push(args)},perfStates(performance()));
 const buttons=nodes(tree,n=>n.type==='button'&&n.props['aria-label']?.startsWith('View decision history'));
 assert.equal(buttons.length,4);for(const b of buttons){assert.ok(text(b).includes('›'));b.props.onClick();}assert.deepEqual(opened,saved.map(s=>[s.callId]));
 assert.match(text(tree),/Current calls page/);assert.match(text(tree),/performance metrics cover the full cohort/);assert.match(text(tree),/4\s+pending/);assert.match(text(tree),/No verified mature trials/);
});
test('saved arrows are independent of performance loading and service error',()=>{
 for(const states of [[5,0,null],[5,0,{key:'all:5:0:0',payload:null,error:true}]]){const {tree}=render('SharedAIPerformance','default',{scope:'all',savedDecisions:saved,onOpenDecision:()=>{}},states);assert.equal(nodes(tree,n=>n.type==='button'&&n.props['aria-label']?.startsWith('View decision history')).length,4);}
});
for(const [name,props,message] of [['loading',{savedDecisionsLoading:true},'Loading saved decision controls'],['error',{savedDecisionsError:'Guarded service failed.'},'Saved decision controls could not be loaded'],['empty',{savedDecisions:[]},'No saved calls on the current page']])test(`saved controls ${name} has explicit current-page state`,()=>{const {tree}=render('SharedAIPerformance','default',{scope:'all',savedDecisions:saved,onOpenDecision:()=>{},...props},perfStates(performance()));assert.match(text(tree),new RegExp(message));assert.equal(nodes(tree,n=>n.type==='button'&&n.props['aria-label']?.startsWith('View decision history')).length,0);});
test('verified review trial arrow passes exact distinct call and review event IDs',()=>{
 const p=performance();p.recent=[{eventId:review.id,callId:item.callId,symbol:'AVGO',action:'REDUCE',modelIdentity:review.modelIdentity,publishedAt:review.publishedAt,entryAt:null,asOf:null,actionReturn:'0.01',stockReturn:'0.02',benchmarkReturn:'0.015',excessStock:'-0.01',excessBenchmark:'-0.005',maxDrawdown:'-0.003'}];let opened;
 const {tree}=render('SharedAIPerformance','default',{scope:'all',onOpenDecision:(...args)=>opened=args},perfStates(p));const b=nodes(tree,n=>n.type==='button'&&n.props['aria-label']?.includes('event review-event'))[0];assert.ok(b);b.props.onClick();assert.deepEqual(opened,['call-id','review-event']);
});
test('shared table arrow and performance callback route through the same parent drawer',()=>{
 const p={contractVersion:1,items:[item],blockedItems:[],nextCursor:null,blockedNextCursor:null,counts:{trackedCalls:1,open:0,closed:0,watching:1,awaitingEntry:0,callsNeedingAttention:0,blockedWithoutCall:0}};
 const {tree,writes}=render('SharedDecisionWorkspace','default',{},['all','latest',{cursor:null,blocked:null},p,'',false,0,null]);
 nodes(tree,n=>n.type==='button'&&n.props['aria-label']==='View decision history for AVGO')[0].props.onClick();assert.equal(writes.at(-1).value.callId,'call-id');
 const perf=nodes(tree,n=>n.type==='./SharedAIPerformance')[0];assert.ok(perf);perf.props.onOpenDecision('call-id','review-event');assert.equal(writes.at(-1).value.eventId,'review-event');assert.equal(perf.props.savedDecisions[0].callId,'call-id');
});
test('drawer original disclosure preserves full reasoning and locked metadata',()=>{
 const {tree}=render('SharedDecisionWorkspace','DecisionDrawer',{callId:item.callId,onClose:()=>{}},[detail()]);const disclosure=nodes(tree,n=>n.type==='details'&&text(n).includes('Read original reasoning'))[0];assert.ok(disclosure);const t=text(disclosure);for(const value of [original.thesis,original.risks,original.modelIdentity,original.assessmentId,original.id,'Locked'])assert.ok(t.includes(value));assert.match(text(tree),/AVGO.*Decision history/);assert.match(text(tree),/Paper cycle performance/);assert.match(text(tree),/Standalone 5\/20-session action-trial results are shown separately/);
});
test('selected review displays its own immutable thesis, risks and identifiers',()=>{
 const {tree}=render('SharedDecisionWorkspace','DecisionDrawer',{callId:item.callId,eventId:review.id,onClose:()=>{}},[detail()]);const selected=nodes(tree,n=>n.props['aria-label']==='Selected performance decision event')[0];for(const value of [review.thesis,review.risks,review.modelIdentity,review.assessmentId,review.id])assert.ok(text(selected).includes(value));assert.equal(text(selected).includes(original.thesis),false);
});
test('selected original event is explicitly identified without inventing a review',()=>{const {tree}=render('SharedDecisionWorkspace','DecisionDrawer',{callId:item.callId,eventId:original.id,onClose:()=>{}},[detail()]);const selected=nodes(tree,n=>n.props['aria-label']==='Selected performance decision event')[0];assert.match(text(selected),/selected trial uses original event/);assert.ok(text(selected).includes(original.id));assert.equal(text(selected).includes(review.thesis),false);});
test('selected review call/event identity is preserved in parent drawer props and key',()=>{const selected={callId:item.callId,eventId:review.id};const {tree}=render('SharedDecisionWorkspace','default',{},['all','latest',{cursor:null,blocked:null},null,'',true,0,selected]);const drawer=nodes(tree,n=>typeof n.type==='function'&&n.type.name==='DecisionDrawer')[0];assert.ok(drawer);assert.equal(drawer.props.callId,item.callId);assert.equal(drawer.props.eventId,review.id);assert.equal(drawer.key,'call-id:review-event');});
for(const cursor of ['more-reviews',null])test(`unloaded selected review never substitutes original (cursor=${cursor})`,()=>{const d=detail();d.reviews=[];d.reviewNextCursor=cursor;const {tree}=render('SharedDecisionWorkspace','DecisionDrawer',{callId:item.callId,eventId:review.id,onClose:()=>{}},[d]);const selected=nodes(tree,n=>n.props['aria-label']==='Selected performance decision event')[0];assert.match(text(selected),/not in the loaded review history/);assert.match(text(selected),/has not been substituted/);assert.equal(text(selected).includes(original.thesis),false);assert.equal(nodes(tree,n=>n.type==='button'&&text(n)==='Load more history').length,cursor?1:0);});
test('drawer loading and error do not fabricate original/review evidence',()=>{for(const [states,message] of [[[null,''],'Loading decision evidence'],[[null,'Not available'],'Not available']]){const {tree}=render('SharedDecisionWorkspace','DecisionDrawer',{callId:item.callId,eventId:review.id,onClose:()=>{}},states);assert.match(text(tree),new RegExp(message));assert.equal(text(tree).includes(original.thesis),false);}});
test('Close and native cancel handlers dismiss; native modal lifecycle cleanup closes',()=>{
 let count=0;const {tree,effects,modal}=render('SharedDecisionWorkspace','DecisionDrawer',{callId:item.callId,onClose:()=>count++},[detail()]);tree.props.onCancel();nodes(tree,n=>n.type==='button'&&n.props['aria-label']==='Close decision details')[0].props.onClick();assert.equal(count,2);const cleanup=effects[0]();assert.equal(modal.showCount,1);cleanup();assert.equal(modal.closeCount,1);
});
