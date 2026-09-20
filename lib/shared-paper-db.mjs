// Privileged server-only pg-compatible transport. No dependency or credential loading.
import { prepareSharedEvaluation } from './shared-paper-adapter.mjs';
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function requireClient(client) { if (!client || typeof client.query !== 'function') throw new Error('Dedicated pg client required'); }
function receiptValid(r,p) {
 return r?.status==='COMMITTED' && r.callId===p.callId && r.proposalHash===p.proposalHash &&
 typeof r.version==='string' && /^(0|[1-9]\d*)$/.test(r.version) &&
 BigInt(r.version)===BigInt(p.expectedVersion)+1n && r.evaluatedThrough===p.evaluatedThrough;
}
export class SharedCommitUncertainError extends Error {
 constructor(cause, callId, snapshotToken, proposal) {
  super('Shared evaluation commit acknowledgement lost; reconcile on a fresh connection before retrying', {cause});
  this.name='SharedCommitUncertainError'; this.callId=callId; this.snapshotToken=snapshotToken;
  this.proposalHash=proposal.proposalHash; this.expectedVersion=proposal.expectedVersion;
  this.evaluatedThrough=proposal.evaluatedThrough;
 }
}
/** Owns transaction on a dedicated idle client; never pass a pool.query facade. */
export async function evaluateSharedCallInDatabase(client,callId) {
 requireClient(client); if(!uuid(callId)) throw new Error('Invalid call ID');
 let begun=false,commitStarted=false,token,proposal;
 try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); begun=true;
  await client.query("SET LOCAL statement_timeout = '30s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  const identity=await client.query('SELECT instrument_id::text FROM public.shared_decision_calls WHERE id=$1::uuid',[callId]);
  if(identity.rows.length!==1 || !uuid(identity.rows[0].instrument_id)) throw new Error('Shared call not found');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shared-decision:'||$1::text,0))",[identity.rows[0].instrument_id]);
  const read=await client.query('SELECT private.shared_evaluation_snapshot_v1($1::uuid) AS payload',[callId]);
  const payload=read.rows[0]?.payload; token=payload?.snapshotToken;
  if(!uuid(token)||payload?.snapshot?.call?.id!==callId) throw new Error('Invalid database snapshot envelope');
  proposal=prepareSharedEvaluation(payload.snapshot);
  const written=await client.query('SELECT private.commit_shared_evaluation_v1($1::uuid,$2::uuid,$3::jsonb) AS receipt',[callId,token,JSON.stringify(proposal)]);
  const receipt=written.rows[0]?.receipt;
  if(!receiptValid(receipt,proposal)) throw new Error('Invalid database commit receipt');
  commitStarted=true; await client.query('COMMIT'); begun=false;
  return {snapshotToken:token,proposal,receipt};
 } catch(error) {
  if(commitStarted) throw new SharedCommitUncertainError(error,callId,token,proposal);
  if(begun) { try { await client.query('ROLLBACK'); } catch(rollbackError) { throw new AggregateError([error,rollbackError],'Evaluation failed and rollback was not acknowledged; discard connection'); } }
  throw error;
 }
}
/** Use a NEW healthy connection after uncertainty. NOT_FOUND never authorizes retry. */
export async function reconcileSharedEvaluation(client,uncertain) {
 requireClient(client);
 if(!(uncertain instanceof SharedCommitUncertainError)) throw new Error('Uncertain commit context required');
 const result=await client.query('SELECT private.shared_evaluation_receipt_v1($1::uuid,$2::uuid) AS receipt',[uncertain.callId,uncertain.snapshotToken]);
 const receipt=result.rows[0]?.receipt;
 if(receipt===null) return {status:'UNRESOLVED',snapshotToken:uncertain.snapshotToken};
 if(!receiptValid(receipt,{callId:uncertain.callId,proposalHash:uncertain.proposalHash,expectedVersion:uncertain.expectedVersion,evaluatedThrough:uncertain.evaluatedThrough})) throw new Error('Reconciliation receipt mismatch');
 return receipt;
}
