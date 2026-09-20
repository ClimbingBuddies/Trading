// Server-only transport adapter. It neither authenticates a caller nor enables SQL writes.
import { createHash } from 'node:crypto';
import { createJournal, evaluateJournal } from './shared-paper-engine.mjs';

function fail(message) { throw new Error(`Shared evaluator: ${message}`); }
function canonical(value) {
 if (value === null || typeof value !== 'object') {
  if (value === undefined || typeof value === 'bigint' || typeof value === 'function' ||
      (typeof value === 'number' && !Number.isFinite(value))) fail('non-JSON snapshot value');
  return JSON.stringify(value);
 }
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const sharedSnapshotHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function instant(value) {
 if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail('explicit timezone timestamp required');
 return Date.parse(value);
}
function decimal(value, positive=false) {
 if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) fail('database decimal string required');
 const number=Number(value);
 if (!Number.isFinite(number) || Math.abs(number)>Number.MAX_SAFE_INTEGER || (positive && number<=0)) fail('unsupported numeric range');
 // Engine uses IEEE doubles. Never claim arbitrary PostgreSQL numeric precision.
 if (positive && value.replace(/[-.]/g,'').replace(/^0+/,'').replace(/0+$/,'').length>15) fail('price exceeds supported 15 significant digits');
 return number;
}
function event(row, callId, original=false) {
 if (!uuid(row.id)||!uuid(row.assessment_id)||(!original && row.call_id!==callId)||
 !/^[0-9a-f]{64}$/.test(row.input_hash??'')) fail('invalid decision identity');
 instant(row.published_at); instant(row.source_cutoff);
 return {id:row.id,assessmentId:row.assessment_id,action:row.action,publishedAt:row.published_at,
 sourceCutoff:row.source_cutoff,model:row.model_identity,thesis:row.thesis,risks:row.risks,inputHash:row.input_hash};
}
function freeze(value) { if(value && typeof value==='object') { Object.values(value).forEach(freeze);Object.freeze(value); }return value; }

/** Read transport must supply one consistent database snapshot, never browser input. */
export function prepareSharedEvaluation(source) {
 const snapshot=structuredClone(source);
 const {call,reviews,outcomes,observations,calendar,state,asOf}=snapshot;
 if(snapshot.contractVersion!==1 || !call || !state || !calendar ||
 !Array.isArray(reviews)||!Array.isArray(outcomes)||!Array.isArray(observations)) fail('incomplete snapshot');
 const now=instant(asOf);
 if(!uuid(call.id)||!uuid(call.instrument_id)||!uuid(call.benchmark_instrument_id)||!uuid(call.provider_id)||
 !/^[A-Z]{3}$/.test(call.currency??'')||call.methodology!=='shared-decision-lab-v1'||decimal(call.cost_per_side)!==0.001) fail('unsupported pinned cycle configuration');
 if(state.call_id!==call.id || typeof state.version!=='string'|| !/^(0|[1-9]\d*)$/.test(state.version)) fail('invalid evaluation version');
 if(state.evaluated_through!==null && instant(state.evaluated_through)>now) fail('evaluation would rewind');
 if(!calendar.provenance || calendar.provenance.verified!==true || !calendar.provenance.reference?.trim() ||
 !calendar.provenance.revision?.trim() || !calendar.exchange?.trim() || !Array.isArray(calendar.sessions) ||
 calendar.complete!==true || calendar.exchange!==snapshot.instrumentExchange ||
 calendar.exchange!==snapshot.benchmarkExchange) fail('verified complete matching exchange calendar required');
 if(instant(calendar.provenance.verifiedAt)>now || instant(calendar.coverageStart)>instant(call.published_at) ||
 instant(calendar.coverageEnd)<now) fail('calendar provenance or coverage invalid');
 const sessions=calendar.sessions.map(s=>({id:s.id,opensAt:s.opens_at,closesAt:s.closes_at}));
 const sessionMap=new Map(); let lastClose=-Infinity;
 for(const s of sessions) {
  const open=instant(s.opensAt),close=instant(s.closesAt);
  if(typeof s.id!=='string'||!s.id||sessionMap.has(s.id)||open<=lastClose||close<=open||
   open<instant(calendar.coverageStart)||close>instant(calendar.coverageEnd)) fail('invalid or unordered calendar');
  sessionMap.set(s.id,s);lastClose=close;
 }
 const events=[event(call,call.id,true),...reviews.map(r=>event(r,call.id))];
 if(events.some(e=>instant(e.publishedAt)>now)) fail('future publication in snapshot');
 let journal=createJournal({id:call.id,instrument:call.instrument_id,benchmark:call.benchmark_instrument_id,
 currency:call.currency,provider:call.provider_id,events});
 const priceIds=new Set();
 const prices=observations.map(p=>{
  if(!uuid(p.id)||priceIds.has(p.id)||![call.instrument_id,call.benchmark_instrument_id].includes(p.instrument_id)||
   p.provider_id!==call.provider_id||p.currency!==call.currency||p.interval_code!=='1day'||!sessionMap.has(p.session_id)) fail('invalid observation identity');
  priceIds.add(p.id);
  const session=sessionMap.get(p.session_id);
  if(instant(p.session_close)!==instant(session.closesAt)||instant(p.loaded_at)<instant(session.closesAt)||instant(p.loaded_at)>now) fail('invalid observation session or load time');
  return {id:p.id,instrument:p.instrument_id,provider:p.provider_id,sessionId:p.session_id,currency:p.currency,
   close:decimal(p.close,true),adjustedClose:decimal(p.adjusted_close,true),loadedAt:p.loaded_at};
 });
 const ids=new Set(),keys=new Set(),singletons=new Set();
 const pinned=outcomes.map(row=>{
  const o=row.evidence?.engine;
  if(!uuid(row.id)||ids.has(row.id)||row.call_id!==call.id||!o||!sessionMap.has(o.sessionId)||
   o.key!==`${o.kind}:${o.sessionId}`||keys.has(o.key)||row.kind!==o.kind||
   instant(row.as_of)!==instant(o.asOf)||instant(row.recorded_at)!==instant(o.recordedAt)||
   instant(o.asOf)>instant(o.recordedAt)||instant(o.recordedAt)>now||
   (state.evaluated_through!==null && instant(o.recordedAt)>instant(state.evaluated_through))) fail('invalid pinned outcome');
  if(!['ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20','DATA_GAP','CANCELLED'].includes(o.kind)) fail('unsupported outcome');
  if(['ENTRY','EXIT','CHECKPOINT_5','CHECKPOINT_20','CANCELLED'].includes(o.kind)) {
   if(singletons.has(o.kind)) fail('duplicate singleton outcome');singletons.add(o.kind);
  }
  for(const [db,key] of [['price','price'],['net_return','netReturn'],['benchmark_return','benchmarkReturn']]) {
   if(row[db]===null) { if(o[key]!==undefined) fail('pinned numeric mismatch'); }
   else if(decimal(row[db],db==='price')!==o[key]) fail('pinned numeric mismatch');
  }
  if(row.reason!==null && row.reason!==o.reason) fail('pinned reason mismatch');
  if(row.reason===null && o.reason!==undefined) fail('pinned reason mismatch');
  if(o.kind!=='CANCELLED' && instant(o.asOf)!==instant(sessionMap.get(o.sessionId).closesAt)) fail('pinned session mismatch');
  const saved=structuredClone(o);
  if(['ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20'].includes(o.kind)) {
   if(!o.evidence?.stock||!o.evidence?.benchmark) fail('pinned price evidence required');
   const normalize=(p,instrument)=>{
    if(!uuid(p.id)||p.instrument!==instrument||p.provider!==call.provider_id||p.currency!==call.currency||
     p.sessionId!==o.sessionId||typeof p.close!=='number'||!Number.isFinite(p.close)||p.close<=0||
     typeof p.adjustedClose!=='number'||!Number.isFinite(p.adjustedClose)||p.adjustedClose<=0||
     instant(p.loadedAt)>instant(o.recordedAt)||instant(p.loadedAt)<instant(o.asOf)) fail('invalid pinned price evidence');
    // JSONB does not preserve object key order; restore the engine price shape.
    return {id:p.id,instrument:p.instrument,provider:p.provider,sessionId:p.sessionId,currency:p.currency,
     close:p.close,adjustedClose:p.adjustedClose,loadedAt:p.loadedAt};
   };
   saved.evidence={stock:normalize(o.evidence.stock,call.instrument_id),benchmark:normalize(o.evidence.benchmark,call.benchmark_instrument_id)};
  }
  ids.add(row.id);keys.add(o.key);return saved;
 });
 if(pinned.length && state.evaluated_through===null) fail('pinned outcomes require evaluation watermark');
 const entry=pinned.find(o=>o.kind==='ENTRY'),exit=pinned.find(o=>o.kind==='EXIT'),cancel=pinned.find(o=>o.kind==='CANCELLED');
 const buy=events.find(e=>e.action==='BUY');
 const sell=buy?events.find(e=>e.action==='SELL'&&instant(e.publishedAt)>instant(buy.publishedAt)):null;
 const intendedEntry=buy?sessions.find(s=>instant(s.opensAt)>instant(buy.publishedAt)):null;
 const intendedExit=sell?sessions.find(s=>instant(s.opensAt)>instant(sell.publishedAt)):null;
 if(cancel && pinned.some(o=>['ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20'].includes(o.kind))) fail('cancelled cycle contains position outcomes');
 if(!entry && pinned.some(o=>['EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20'].includes(o.kind))) fail('position outcome has no entry');
 if(entry && (!buy||!intendedEntry||entry.eventId!==buy.id||entry.sessionId!==intendedEntry.id||
   instant(entry.recordedAt)<instant(buy.publishedAt))) fail('entry does not match Buy chronology');
 if(exit && (!sell||!intendedExit||exit.eventId!==sell.id||exit.sessionId!==intendedExit.id||
   instant(exit.asOf)<instant(entry.asOf)||instant(exit.recordedAt)<instant(entry.recordedAt)||
   instant(exit.recordedAt)<instant(sell.publishedAt))) fail('exit does not match Sell chronology');
 if(cancel && (!sell||!intendedEntry||cancel.eventId!==sell.id||cancel.sessionId!==intendedEntry.id||
   instant(cancel.asOf)!==instant(sell.publishedAt)||instant(sell.publishedAt)>=instant(intendedEntry.opensAt))) fail('cancellation does not match withdrawn Buy');
 for(const o of pinned) {
  if(instant(o.recordedAt)<instant(call.published_at)||instant(o.asOf)<instant(call.published_at)) fail('outcome predates original call');
  if(['MARK','CHECKPOINT_5','CHECKPOINT_20'].includes(o.kind)) {
   if(instant(o.asOf)<instant(entry.asOf)||instant(o.recordedAt)<instant(entry.recordedAt)||
     (exit && instant(o.asOf)>instant(exit.asOf))) fail('performance outside position chronology');
   if(o.kind.startsWith('CHECKPOINT_')) {
    const expectedIndex=Number(o.kind.slice(11));
    if(sessions.findIndex(s=>s.id===o.sessionId)-sessions.findIndex(s=>s.id===entry.sessionId)!==expectedIndex) fail('checkpoint session is inconsistent');
   }
  }
  const terminal=exit??cancel;
  if(terminal && instant(o.recordedAt)>instant(terminal.recordedAt)) fail('outcome recorded after terminal outcome');
 }
 journal={...journal,outcomes:pinned,...(state.evaluated_through===null?{}:{evaluatedThrough:state.evaluated_through})};
 const result=evaluateJournal(journal,{sessions,prices,asOf});
 if(sharedSnapshotHash(result.journal.outcomes.slice(0,pinned.length))!==sharedSnapshotHash(pinned)) fail('engine changed pinned outcomes');
 const added=result.added.map(o=>({call_id:call.id,kind:o.kind,as_of:o.asOf,
  price:o.price===undefined?null:String(o.price),net_return:o.netReturn===undefined?null:String(o.netReturn),
  benchmark_return:o.benchmarkReturn===undefined?null:String(o.benchmarkReturn),reason:o.reason??null,
  evidence:{adapterVersion:1,engine:o,calendarReference:calendar.provenance.reference,calendarRevision:calendar.provenance.revision}}));
 const proposal={adapterVersion:1,callId:call.id,expectedVersion:state.version,
  snapshotHash:sharedSnapshotHash(snapshot),baseOutcomesHash:sharedSnapshotHash(outcomes),
  evaluatedThrough:asOf,state:result.state,added};
 return freeze({...proposal,proposalHash:sharedSnapshotHash(proposal)});
}

/** Only explicit optimistic-conflict acknowledgements are retried. Network errors propagate. */
export async function evaluateSharedCall(callId,{readSnapshot,commitProposal,maxConflictRetries=1}) {
 if(!uuid(callId)||typeof readSnapshot!=='function'||typeof commitProposal!=='function'||
 !Number.isInteger(maxConflictRetries)||maxConflictRetries<0||maxConflictRetries>3) fail('invalid transport options');
 for(let attempt=0;attempt<=maxConflictRetries;attempt++) {
  const snapshot=await readSnapshot(callId);
  if(snapshot?.call?.id!==callId) fail('read returned another cycle');
  const proposal=prepareSharedEvaluation(snapshot);
  const receipt=await commitProposal(proposal);
  if(receipt?.status==='VERSION_CONFLICT') {
   if(attempt<maxConflictRetries) continue;
   fail('optimistic conflict retry limit reached');
  }
  if(receipt?.status!=='COMMITTED'||receipt.callId!==callId||receipt.proposalHash!==proposal.proposalHash||
    typeof receipt.version!=='string'||!/^\d+$/.test(receipt.version)||BigInt(receipt.version)!==BigInt(proposal.expectedVersion)+1n||
    receipt.evaluatedThrough!==proposal.evaluatedThrough) fail('invalid commit acknowledgement');
  return {proposal,receipt};
 }
}
