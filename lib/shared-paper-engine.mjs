// Deterministic paper evaluation only. No market fetching or database writes.
// Input sessions must come from a verified exchange calendar; never infer them from prices.
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = value => { const n=Date.parse(value); if(!Number.isFinite(n)) throw new Error('Invalid timestamp'); return n; };
const positive = value => typeof value==='number' && Number.isFinite(value) && value>0;
const actions = new Set(['BUY','WAIT','HOLD','SELL','REDUCE','AVOID']);
function freeze(value) { if(value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createJournal({id,instrument,benchmark,currency,provider,events}) {
 if(!id||!instrument||!benchmark||instrument===benchmark||!currency||!provider) throw new Error('Instrument, currency and benchmark required');
 if(!events?.length) throw new Error('Original call required');
 let journal={id,instrument,benchmark,currency,provider,costPerSide:0.001,events:[],outcomes:[]};
 for(const event of events) journal=appendCall(journal,event);
 return journal;
}

export function appendCall(journal,event) {
 if(!event.id||!event.assessmentId||!event.model||!event.thesis||!event.risks||!event.inputHash||!actions.has(event.action)) throw new Error('Complete AI call required');
 if(stamp(event.sourceCutoff)>stamp(event.publishedAt)) throw new Error('Future evidence rejected');
 const existing=journal.events.find(e=>e.id===event.id||e.assessmentId===event.assessmentId);
 if(existing) { if(hash(existing)!==hash(event)) throw new Error('Original call cannot be changed'); return journal; }
 const recordedThrough=Math.max(-Infinity,...journal.outcomes.map(o=>stamp(o.recordedAt)),journal.evaluatedThrough?stamp(journal.evaluatedThrough):-Infinity);
 if(stamp(event.publishedAt)<=recordedThrough) throw new Error('Call predates evaluated history');
 const last=journal.events.at(-1);
 if(last && (stamp(event.publishedAt)<=stamp(last.publishedAt)||stamp(event.sourceCutoff)<=stamp(last.sourceCutoff))) throw new Error('Review requires newer evidence and publication time');
 if(journal.outcomes.some(o=>['EXIT','CANCELLED'].includes(o.kind))) throw new Error('Closed journal requires a new cycle');
 return freeze({...structuredClone(journal),events:[...structuredClone(journal.events),structuredClone(event)]});
}

export function evaluateJournal(journal,{sessions,prices,asOf}) {
 const now=stamp(asOf);
 const recordedThrough=Math.max(-Infinity,...journal.outcomes.map(o=>stamp(o.recordedAt)),journal.evaluatedThrough?stamp(journal.evaluatedThrough):-Infinity);
 if(now<recordedThrough) throw new Error('Evaluation cannot rewind recorded history');
 const finish=(state,outcomes=journal.outcomes,added=[])=>({journal:freeze({...structuredClone(journal),outcomes:structuredClone(outcomes),evaluatedThrough:asOf}),added,state});
 const sorted=[...sessions].sort((a,b)=>stamp(a.opensAt)-stamp(b.opensAt));
 const ids=new Set();let previousClose=-Infinity;
 for(const s of sorted) {
  if(!s.id||ids.has(s.id)||stamp(s.opensAt)>=stamp(s.closesAt)||stamp(s.opensAt)<=previousClose) throw new Error('Invalid or duplicate calendar session');
  ids.add(s.id);previousClose=stamp(s.closesAt);
 }
 // A signal is executed at the close of the first session whose opening is AFTER publication.
 // This avoids fills from a session already in progress when a signal was issued.
 const nextSession=event=>sorted.find(s=>stamp(s.opensAt)>stamp(event.publishedAt));
 const complete=s=>s && stamp(s.closesAt)<=now;
 const outcomes=structuredClone(journal.outcomes);
 const added=[];
 function add(value) {
  const key=`${value.kind}:${value.sessionId}`;
  const previous=outcomes.find(o=>o.key===key);
  if(previous) return previous; // Pinned evidence is never rewritten.
  if(['ENTRY','EXIT','CANCELLED','CHECKPOINT_5','CHECKPOINT_20'].includes(value.kind)&&outcomes.some(o=>o.kind===value.kind)) return;
  const row={...value,key,recordedAt:asOf};outcomes.push(row);added.push(row);return row;
 }
 function gap(session,reason) {add({kind:'DATA_GAP',sessionId:session.id,asOf:session.closesAt,reason});}
 function pair(session) {
  const get=symbol=>prices.filter(p=>p.instrument===symbol&&p.sessionId===session.id&&p.provider===journal.provider&&stamp(p.loadedAt)<=now);
  const stock=get(journal.instrument),benchmark=get(journal.benchmark);
  if(stock.length!==1||benchmark.length!==1) return null;
  if([...stock,...benchmark].some(p=>p.currency!==journal.currency||!positive(p.close)||!positive(p.adjustedClose)||stamp(p.loadedAt)<stamp(session.closesAt))) return null;
  return {stock:stock[0],benchmark:benchmark[0]};
 }
 const done=outcomes.find(o=>o.kind==='EXIT'||o.kind==='CANCELLED');
 if(done) return finish(done.kind==='EXIT'?'Closed':'Not entered');
 const events=journal.events.filter(e=>stamp(e.publishedAt)<=now);
 const buy=events.find(e=>e.action==='BUY');
 if(!buy) return finish('Watching');
 const entrySession=nextSession(buy);
 if(!entrySession) return finish('Calendar required');
 const pinnedEntry=outcomes.find(o=>o.kind==='ENTRY');
 if(pinnedEntry && (pinnedEntry.sessionId!==entrySession.id||pinnedEntry.asOf!==entrySession.closesAt)) throw new Error('Calendar conflicts with pinned entry');
 const sell=events.find(e=>e.action==='SELL'&&stamp(e.publishedAt)>stamp(buy.publishedAt));
 if(sell && stamp(sell.publishedAt)<stamp(entrySession.opensAt)) {
  if(pinnedEntry) throw new Error('Cancellation conflicts with pinned entry');
  add({kind:'CANCELLED',sessionId:entrySession.id,asOf:sell.publishedAt,eventId:sell.id,reason:'Buy withdrawn before intended entry session opened'});
  return finish('Not entered',outcomes,added);
 }
 if(!complete(entrySession)) return finish('Awaiting entry');
 let entry=outcomes.find(o=>o.kind==='ENTRY');
 let blocked=false;
 const currentEntry=pair(entrySession);
 if(!currentEntry) {gap(entrySession,'Intended entry price or benchmark missing/invalid; entry not shifted');blocked=true;}
 else if(entry && hash(entry.evidence)!==hash(currentEntry)) {gap(entrySession,'Pinned entry evidence changed; return withheld');blocked=true;}
 else if(!entry) entry=add({kind:'ENTRY',sessionId:entrySession.id,asOf:entrySession.closesAt,eventId:buy.id,price:currentEntry.stock.close,evidence:currentEntry});
 if(!blocked) {
  const exitSession=sell?nextSession(sell):null;
  if(sell&&!exitSession) return finish('Calendar required',outcomes,added);
  const tape=sorted.filter(s=>stamp(s.opensAt)>=stamp(entrySession.opensAt)&&complete(s)&&(!exitSession||stamp(s.opensAt)<=stamp(exitSession.opensAt)));
  for(let i=0;i<tape.length;i++) {
   const s=tape[i],evidence=pair(s);
   if(!evidence) {gap(s,'Missing or duplicate session prices; return withheld');blocked=true;break;}
   const pinned=outcomes.find(o=>o.kind==='MARK'&&o.sessionId===s.id);
   if(pinned && hash(pinned.evidence)!==hash(evidence)) {gap(s,'Previously measured price evidence changed; return withheld');blocked=true;break;}
   const stockRatio=evidence.stock.adjustedClose/evidence.stock.close;
   const benchmarkRatio=evidence.benchmark.adjustedClose/evidence.benchmark.close;
   if(Math.abs(stockRatio-entry.evidence.stock.adjustedClose/entry.price)>1e-6||Math.abs(benchmarkRatio-entry.evidence.benchmark.adjustedClose/entry.evidence.benchmark.close)>1e-6) {
    gap(s,'Corporate-action adjustment changed; return withheld');blocked=true;break;
   }
   const measured={sessionId:s.id,asOf:s.closesAt,price:evidence.stock.close,
    netReturn:evidence.stock.close*(1-journal.costPerSide)/(entry.price*(1+journal.costPerSide))-1,
    benchmarkReturn:evidence.benchmark.close/entry.evidence.benchmark.close-1,evidence};
   add({kind:'MARK',...measured});
   if(i===5||i===20) add({kind:`CHECKPOINT_${i}`,...measured});
   if(exitSession?.id===s.id) {add({kind:'EXIT',eventId:sell.id,...measured});break;}
  }
 }
 return finish(blocked?'Missing data':outcomes.some(o=>o.kind==='EXIT')?'Closed':sell?'Exit signal':'Open',outcomes,added);
}
