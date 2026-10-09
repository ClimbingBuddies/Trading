'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { describePipelineStatus } from '@/lib/trading-pipeline-status.mjs'
import styles from './TradingPipelineStatus.module.css'

type Problem = { code: string; message: string; nextAction: string }
type Status = { contractVersion: number; lastCompletedMorningAt: string | null; incidents: (Problem & {id:string;date:string})[]; snapshot: {checkedAt:string;deadline:string;nextExpectedAt:string;marketSession:string;lastResearchAt:string|null;controllerLastSeenAt:string|null;calendarExpiresAt:string|null;problems:Problem[];instruments:{symbol:string;reason:string|null}[]} | null }
const when=(s?:string|null)=>s&&Number.isFinite(Date.parse(s))?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',dateStyle:'medium',timeStyle:'short'}).format(new Date(s)):'Not verified'
const nextAction=(p:Problem)=>p.code==='CONTROLLER_NOT_SEEN'?'Check the cloud Scheduled task, its latest run, connected plugins and usage limits.':p.nextAction

export default function TradingPipelineStatus({ compact = false, attentionCount = null, children, embedded = false, hidden = false, panelId, onStatusChange }: { compact?: boolean; attentionCount?: number | null; children?: ReactNode; embedded?: boolean; hidden?: boolean; panelId?: string; onStatusChange?: (value: { warning: boolean; title: string }) => void } = {}) {
 const [status,setStatus]=useState<Status|null>(null)
 const [failed,setFailed]=useState(false)
 const [now,setNow]=useState(Date.now())
 useEffect(()=>{
  let alive=true,loading=false
  const read=async()=>{
   if(loading||document.visibilityState==='hidden')return
   loading=true
   try {
    const client=getBrowserSupabase()
    const {data,error}=await client.rpc('trading_pipeline_status_v1')
    if(error||data?.contractVersion!==1||!Array.isArray(data.incidents))throw new Error('Invalid status')
    if(alive){setStatus(data as Status);setFailed(false)}
   }catch{if(alive)setFailed(true)}
   finally{loading=false;if(alive)setNow(Date.now())}
  }
  void read()
  const timer=setInterval(()=>{setNow(Date.now());void read()},60000)
  const focus=()=>{void read()}
  document.addEventListener('visibilitychange',focus)
  return ()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',focus)}
 },[])
 const view=describePipelineStatus(failed?null:status,now)
 useEffect(() => { onStatusChange?.({ warning: view.warning, title: view.title }) }, [onStatusChange, view.warning, view.title])
 const snapshot=status?.snapshot
 const Wrapper = embedded ? 'div' : 'details'
 return <Wrapper id={panelId} hidden={hidden} className={`${styles.status} ${view.warning?styles.warning:''}`}>
  {!embedded && <summary><strong>{compact ? 'Review status' : view.title}</strong><span>{compact ? `${attentionCount === null ? 'Record status unverified' : `${attentionCount} items need attention`} · ${view.title}` : view.detail}</span><span className={styles.more}>{compact ? 'View issues' : 'Run details'}</span></summary>}
  <div className={styles.details}>
   {(compact || embedded) && <p><strong>{view.title}</strong> · {view.detail}</p>}
   <p>Times below are Australia/Perth. Monitoring runs in Supabase, independently of the cloud controller task.</p>
   <dl><div><dt>Last fully completed morning</dt><dd>{when(status?.lastCompletedMorningAt)}</dd></div><div><dt>Last research saved</dt><dd>{when(snapshot?.lastResearchAt)}</dd></div><div><dt>Monitor checked</dt><dd>{when(snapshot?.checkedAt)}</dd></div><div><dt>Next completion deadline</dt><dd>{when(snapshot?.nextExpectedAt)}</dd></div><div><dt>Controller last seen</dt><dd>{when(snapshot?.controllerLastSeenAt)}</dd></div><div><dt>Calendar verification expires</dt><dd>{when(snapshot?.calendarExpiresAt)}</dd></div></dl>
   {snapshot?.problems.map(p=><p key={p.code}><strong>{p.message}</strong><br/>{nextAction(p)}</p>)}
   {!!status?.incidents.length&&<><h3>Unresolved run alerts</h3><ul>{status.incidents.map(i=><li key={i.id}><strong>{i.date}: {i.message}</strong><br/>{nextAction(i)}</li>)}</ul></>}
   {!!snapshot?.instruments.some(i=>i.reason)&&<><h3>Share coverage</h3><ul>{snapshot.instruments.filter(i=>i.reason).map(i=><li key={i.symbol}>{i.symbol}: {i.reason?.toLowerCase().replaceAll('_',' ')}</li>)}</ul></>}
   <p>Zero new Buy calls can be valid. Missing research or an unevaluated published call cannot count as a completed morning.</p>
   {children}
  </div>
 </Wrapper>
}
