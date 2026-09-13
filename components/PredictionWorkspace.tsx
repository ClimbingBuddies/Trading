'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { formatPredictionReturn } from '@/lib/prediction-results.mjs'
import { decisionRow, decisionLabel } from '@/lib/decision-journal.mjs'
import styles from './PredictionWorkspace.module.css'

type Plan = { id: string; symbol: string; instrument_name: string; published_at: string; source_cutoff: string; action: string; methodology: string; thesis: string; risks: string; model_identity: string; benchmark_symbol: string | null; currency: string; source_snapshot: unknown }
type Event = { id: string; prediction_id: string; actor: string; action: string; published_at: string; assessment_id: string | null; note: string; risks: string | null; model_identity: string | null; source_cutoff: string | null; source_snapshot: unknown }
type Outcome = { id: string; prediction_id: string; kind: string; as_of: string; recorded_at: string; price: number | null; net_return: number | null; benchmark_return: number | null; reason: string | null; evidence: unknown }
type Legacy = { prediction_id: string; evaluated_at: string; status: string; entry_at: string | null; exit_at: string | null; entry_price: number | null; exit_price: number | null; net_return: number | null; benchmark_return: number | null }
const date = (v?: string | null) => v ? new Date(v).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : '—'
const time = (v?: string | null) => v ? new Date(v).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : '—'
const money = (v: unknown, currency: string) => v == null ? '—' : currency+' '+Number(v).toFixed(2)
function Evidence({table,id,ownerId,column,title='Saved evidence',children}:{table:string;id:string;ownerId:string;column:string;title?:string;children?:ReactNode}) {
 const [value,setValue]=useState<unknown>(null),[state,setState]=useState('idle')
 const controller=useRef<AbortController|null>(null)
 useEffect(()=>()=>controller.current?.abort(),[])
 async function read(){
  if(state==='loading'||state==='ready')return
  controller.current?.abort();const next=new AbortController();controller.current=next;setState('loading')
  try{
   const r=await getBrowserSupabase().from(table).select(column).eq('id',id).eq('owner_user_id',ownerId).abortSignal(next.signal).single()
   if(next.signal.aborted)return
   if(r.error)throw r.error
   setValue((r.data as unknown as Record<string,unknown>)[column]);setState('ready')
  }catch{if(!next.signal.aborted)setState('error')}
 }
 return <details onToggle={e=>{if(e.currentTarget.open)void read()}}><summary>{title}</summary>{children}{state==='loading'?<p role="status">Loading saved evidence…</p>:state==='error'?<p role="alert">Evidence could not be loaded. <button onClick={()=>void read()}>Retry</button></p>:state==='ready'?<pre>{value==null?'No source snapshot for this personal note.':JSON.stringify(value,null,2)}</pre>:null}</details>
}
function Drawer({children,onClose,title}:{children:ReactNode;onClose:()=>void;title:string}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{ const previous=document.activeElement as HTMLElement|null; ref.current?.showModal(); return ()=>{ref.current?.close();previous?.focus()} },[])
  return <dialog ref={ref} className={styles.drawer} aria-labelledby="decision-detail-title" onCancel={e=>{e.preventDefault();onClose()}}>
    <header><h2 id="decision-detail-title">{title}</h2><button autoFocus aria-label="Close decision details" onClick={onClose}>×</button></header>{children}
  </dialog>
}
export default function PredictionWorkspace({ownerId}:{ownerId:string;mode:'recommendations'|'decision-lab'}) {
 const [plans,setPlans]=useState<Plan[]>([]),[events,setEvents]=useState<Event[]>([]),[outcomes,setOutcomes]=useState<Outcome[]>([]),[legacy,setLegacy]=useState<Legacy[]>([])
 const [enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [selected,setSelected]=useState(''),[filter,setFilter]=useState('all'),[checkpoint,setCheckpoint]=useState('MARK')
 const [adding,setAdding]=useState(false),[note,setNote]=useState(''),[action,setAction]=useState('NOTE'),[busy,setBusy]=useState(false),[noteError,setNoteError]=useState(''),[saved,setSaved]=useState('')
 const requestId=useRef(''),alive=useRef(true)
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false}},[])
 useEffect(()=>{
  const controller=new AbortController(),signal=controller.signal,client=getBrowserSupabase()
  setLoading(true);setError('')
  async function pages(table:string,order:string) {
   const rows:unknown[]=[]
   for(let offset=0;;offset+=500){
    const fields:Record<string,string>={
    personal_prediction_plans:'id,symbol,instrument_name,published_at,source_cutoff,action,methodology,thesis,risks,model_identity,benchmark_symbol,currency,horizon_sessions',
    personal_decision_events:'id,prediction_id,actor,action,published_at,assessment_id,note,risks,model_identity,source_cutoff',
    personal_decision_outcomes:'id,prediction_id,kind,as_of,recorded_at,price,net_return,benchmark_return,reason',
    personal_prediction_results:'id,prediction_id,evaluated_at,status,entry_at,exit_at,entry_price,exit_price,net_return,benchmark_return'
   }
   const r=await client.from(table).select(fields[table]).eq('owner_user_id',ownerId).order(order,{ascending:false}).order('id').range(offset,offset+499).abortSignal(signal)
    if(r.error)throw r.error
    rows.push(...r.data);if(r.data.length<500)return rows
   }
  }
  void Promise.all([pages('personal_prediction_plans','published_at'),pages('personal_decision_events','published_at'),pages('personal_decision_outcomes','recorded_at'),pages('personal_prediction_results','evaluated_at'),
   client.from('personal_prediction_tracking').select('owner_user_id').eq('owner_user_id',ownerId).abortSignal(signal).maybeSingle()
  ]).then(([p,e,o,l,t])=>{
   if(signal.aborted)return
   if(t.error)throw t.error
   setPlans(p as Plan[]);setEvents(e as Event[]);setOutcomes(o as Outcome[]);setLegacy(l as Legacy[]);setEnabled(!!t.data);setLoading(false)
  }).catch(()=>{if(!signal.aborted){setError('Decision history could not be loaded. Please retry.');setLoading(false);setPlans([]);setEvents([]);setOutcomes([]);setLegacy([])}})
  return ()=>controller.abort()
 },[ownerId,revision])
 const rows=plans.map(p=>({plan:p,...decisionRow(p,events,outcomes,legacy,checkpoint)}))
 const visible=rows.filter(r=>filter==='all'||(filter==='closed'?r.closed:!r.closed))
 const completed=plans.map(p=>decisionRow(p,events,outcomes,legacy,'MARK')).filter(r=>r.completed && r.result?.net_return!=null)
 const compared=completed.filter(r=>r.result.benchmark_return!=null)
 const row=rows.find(r=>r.plan.id===selected)
 const open=useCallback((id:string)=>{setSelected(id);setAdding(false);setNote('');setNoteError('');setSaved('')},[])
 async function start(){
  setBusy(true)
  const r=await getBrowserSupabase().rpc('start_personal_prediction_tracking_v1')
  if(!alive.current)return
  setBusy(false);if(r.error)setError('Tracking could not be enabled.');else setRevision(n=>n+1)
 }
 async function save(e:FormEvent){
  e.preventDefault();setBusy(true);setNoteError('')
  try {
   const r=await getBrowserSupabase().rpc('append_personal_decision_note_v3',{p_prediction:selected,p_action:action,p_note:note.trim(),p_request:requestId.current})
   if(r.error)throw r.error
   if(!alive.current)return
   setAdding(false);setNote('');setSaved('Your decision note was recorded. The original AI call is unchanged.');setRevision(n=>n+1)
  }catch{if(alive.current)setNoteError('Note could not be confirmed. Retry to check the same request without duplicating it.')}
  finally{if(alive.current)setBusy(false)}
 }
 return <section className={styles.workspace} aria-label="Decision Lab">
  <div className={styles.summary}><span><strong>{loading||error?'—':plans.length}</strong> calls tracked</span><span>Closed <strong>{completed.length}</strong></span><span>Profitable <strong>{completed.length?completed.filter(r=>Number(r.result.net_return)>0).length+' / '+completed.length:'—'}</strong></span><span>Beat benchmark <strong>{compared.length?compared.filter(r=>Number(r.result.net_return)>Number(r.result.benchmark_return)).length+' / '+compared.length:'—'}</strong></span><Link href="/my-dashboard?tab=recommendations">Recommendations →</Link></div>
  <div className={styles.toolbar}><div role="group" aria-label="Decision status">{[['all','All calls'],['open','Open / watching'],['closed','Closed / not entered']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><label>Performance <select value={checkpoint} onChange={e=>setCheckpoint(e.target.value)}><option value="MARK">Since entry</option><option value="CHECKPOINT_5">1-week checkpoint</option><option value="CHECKPOINT_20">1-month checkpoint</option></select></label></div>
  {error&&<div role="alert" className={styles.notice}>{error}<button onClick={()=>setRevision(n=>n+1)}>Retry</button></div>}
  {loading&&<p role="status">Loading decision history…</p>}
  {!loading&&!error&&<>
   {!enabled&&<div className={styles.notice}>Enable tracking to save future AI calls.<button disabled={busy} onClick={start}>Enable tracking</button></div>}
   <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Decisions and outcomes"><table><caption className={styles.srOnly}>Original calls, dated updates and measured outcomes</caption><thead><tr><th>Share</th><th>Original call 🔒</th><th>Latest AI view</th><th>Latest update</th><th>Status</th><th>{checkpoint==='MARK'?'Since entry':checkpoint==='CHECKPOINT_5'?'1-week return':'1-month return'}</th><th>Benchmark</th><th><span className={styles.srOnly}>Details</span></th></tr></thead><tbody>
    {visible.map(r=><tr key={r.plan.id} onClick={()=>open(r.plan.id)} className={selected===r.plan.id?styles.selected:undefined}>
     <th scope="row"><button className={styles.share} onClick={e=>{e.stopPropagation();open(r.plan.id)}}>{r.plan.symbol}</button><small>{r.plan.instrument_name}</small>{r.isLegacy&&<small>Legacy timing</small>}</th>
     <td>{decisionLabel(r.original)}<small>{date(r.plan.published_at)}</small></td><td><span className={styles.badge}>{decisionLabel(r.latest)}</span></td>
     <td><span className={styles.update}>{r.note}</span><small>{date(r.updated)}</small></td><td>{r.status}</td>
     <td className={r.result?.net_return!=null?Number(r.result.net_return)>=0?styles.gain:styles.loss:undefined}>{formatPredictionReturn(r.result?.net_return)}{r.result&&<small>{r.completed?'Final':'Provisional'} · after costs</small>}</td>
     <td>{formatPredictionReturn(r.result?.benchmark_return)}<small>{r.plan.benchmark_symbol??'Not assigned'} · before costs</small></td>
     <td><button aria-label={'View decision history for '+r.plan.symbol} onClick={e=>{e.stopPropagation();open(r.plan.id)}}>›</button></td>
    </tr>)}
    {!visible.length&&<tr><td colSpan={8}>{plans.length?'No calls match this filter.':'No published decisions yet. Fresh assessments and daily prices are required; no example returns are shown here.'}</td></tr>}
   </tbody></table></div>
  </>}
  <p className={styles.foot}>Click a share for its original call, dated updates and evidence. Missing returns stay blank.</p>
  <details className={styles.method}><summary>How decisions are tracked</summary><p>New AI calls and your personal notes are separate, permanent records. Personal notes never change the AI score. A Buy is tested at the next complete benchmark-observed session close after its publication date in UTC. A later Sell closes the paper position at a subsequent close. Reduce is advisory; no partial sale is assumed.</p><p>Weekly and monthly checkpoints measure returns without forcing an exit. If a call closes before a checkpoint, that checkpoint stays blank; its final return remains under Since entry. Open returns are provisional and include modelled entry and exit costs of 0.1% each. Benchmarks use the same dates before costs. Missing or revised evidence can withhold returns. Legacy timing records keep their original rules.</p></details>
  {row&&<Drawer title={row.plan.symbol+' · Decision history'} onClose={()=>{if(!busy)setSelected('')}}>
   <div className={styles.latest}>Latest AI view <strong>{decisionLabel(row.latest)}</strong><small>Updated {time(row.updated)}</small></div>
   <section className={styles.original}><h3>Original call · locked</h3><strong>{decisionLabel(row.original)} · {time(row.plan.published_at)}</strong><p>{row.plan.thesis}</p><p>{row.plan.risks}</p><small>Model: {row.plan.model_identity}</small>{row.isLegacy&&<small>Legacy timing rules remain unchanged.</small>}</section>
   <section><h3>Dated updates &amp; your decisions</h3><ol className={styles.timeline}>{row.history.map((event:Event)=><li key={event.id}><strong>{time(event.published_at)} · {event.actor==='USER'?'Your decision: ':'AI: '}{decisionLabel(event.action)}</strong><p>{event.note}</p>{event.risks&&<p>{event.risks}</p>}{event.assessment_id&&<Link href={'/assessments/'+encodeURIComponent(row.plan.symbol)}>Share research →</Link>}<Evidence table="personal_decision_events" id={event.id} ownerId={ownerId} column="source_snapshot"><small>Record {event.id}<br/>Evidence cutoff {time(event.source_cutoff)}<br/>Model {event.model_identity??'Personal note'}</small></Evidence></li>)}</ol>
    {!row.history.length&&<p>No linked updates. The original legacy record is preserved above.</p>}
    {!adding&&<button onClick={()=>{requestId.current=crypto.randomUUID();setAction('NOTE');setAdding(true);setSaved('')}}>Add my decision / note</button>}
    {saved&&<p role="status">{saved}</p>}
    {adding&&<form onSubmit={save} className={styles.form}><label>My decision<select value={action} disabled={busy} onChange={e=>setAction(e.target.value)}>{['NOTE','BUY','WAIT','HOLD','SELL','REDUCE'].map(a=><option key={a} value={a}>{decisionLabel(a)}</option>)}</select></label><label>Reason / note<textarea required minLength={3} maxLength={12000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label><small>Saved permanently with the current time. This records your view, not a trade execution.</small>{noteError&&<p role="alert">{noteError}</p>}<div><button type="button" disabled={busy} onClick={()=>setAdding(false)}>Cancel</button><button disabled={busy}>{busy?'Saving…':'Record my decision'}</button></div></form>}
   </section>
   <section><h3>Paper position</h3><dl><dt>Status</dt><dd>{row.status}</dd><dt>Entry recorded</dt><dd>{row.entry?date(row.entry.as_of)+' · '+money(row.entry.price,row.plan.currency):'Not entered'}</dd><dt>Exit recorded</dt><dd>{row.exit?date(row.exit.as_of)+' · '+money(row.exit.price,row.plan.currency):'No recorded exit'}</dd><dt>Selected return</dt><dd>{formatPredictionReturn(row.result?.net_return)}</dd><dt>Benchmark</dt><dd>{row.plan.benchmark_symbol??'Not assigned'} · {formatPredictionReturn(row.result?.benchmark_return)}</dd></dl><small>Returns include modelled costs; benchmark before costs.</small></section>
   <details><summary>Outcome evidence &amp; checkpoints</summary>{row.observations.map((o:Outcome)=><article key={o.id}><strong>{o.kind.replaceAll('_',' ')} · {date(o.as_of)}</strong><p>{formatPredictionReturn(o.net_return)} {o.reason}</p><small>Recorded {time(o.recorded_at)} · {o.id}</small><Evidence table="personal_decision_outcomes" id={o.id} ownerId={ownerId} column="evidence"/></article>)}{!row.observations.length&&<p>No new journal observations yet.</p>}</details>
   <Evidence table="personal_prediction_plans" id={row.plan.id} ownerId={ownerId} column="source_snapshot" title="Original evidence & model"><small>Original record {row.plan.id}<br/>Cutoff {time(row.plan.source_cutoff)}</small></Evidence>
  </Drawer>}
 </section>
}
