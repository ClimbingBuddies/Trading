export function describeAsxConvergence(s,now=Date.now()) {
 const unverified={verified:false,warning:true,title:'ASX monitoring unverified',detail:'Current ASX coverage and alert processing cannot be verified.'};
 const checked=Date.parse(s?.checkedAt),c=s?.counts,a=s?.alerts;
 if(s?.contractVersion!==1||!Number.isFinite(checked)||checked>now+60000||now-checked>30*60000)return unverified;
 if(!c||!a||['active','current','blocked','ready','failed','running'].some(k=>!Number.isInteger(c[k])||c[k]<0)||
   ['configuredRules','pending','failed','exhausted'].some(k=>!Number.isInteger(a[k])||a[k]<0)||
   c.current+c.blocked+c.ready+c.failed+c.running!==c.active)return unverified;
 if(!Array.isArray(s.instruments)||s.instruments.length!==c.active||s.instruments.some(i=>typeof i.symbol!=='string'||typeof i.reason!=='string'))return unverified;
 const titles={CURRENT:'ASX coverage current',ATTENTION:'ASX signals need attention',NOT_DUE:'ASX check not due yet',DEFERRED:'ASX next-session check deferred'};
 if(!titles[s.state]||typeof s.dispatchDue!=='boolean'||(s.dispatchDue!==['CURRENT','ATTENTION'].includes(s.state)))return unverified;
 if(s.state==='CURRENT'&&(c.current!==c.active||a.pending+a.failed+a.exhausted>0||s.calendarExpiring!==false))return unverified;
 const unresolved=!!s.incidentOpenedAt&&!s.incidentResolvedAt;
 const alertFailure=a.failed+a.exhausted>0;
 return {verified:true,warning:s.state==='ATTENTION'||unresolved||alertFailure,title:alertFailure?'ASX alert processing needs attention':titles[s.state],
  detail:`${c.current}/${c.active} ASX inputs and results match · ${c.blocked} blocked · ${c.ready} ready to process · ${c.failed} failed · ${c.running} running. ${a.pending} alert checks pending · ${a.failed+a.exhausted} failed. ${a.configuredRules===0?'No ASX alert rules enabled.':`${a.configuredRules} ASX alert rules enabled.`}`};
}
export function describePipelineStatus(payload,now=Date.now()) {
 const s=payload?.snapshot,checked=Date.parse(s?.checkedAt);
 if(!s||!Number.isFinite(checked)||checked>now+60000||now-checked>30*60000)
  return {warning:true,title:'Daily monitor is unavailable or overdue',detail:'The latest check cannot be verified. Review the monitor before trusting the run status.'};
 const c=s.counts;
 if(!c||['supported','blocked','researched','published','evaluated'].some(k=>!Number.isInteger(c[k])||c[k]<0))
  return {warning:true,title:'Daily monitor returned incomplete evidence',detail:'Run status cannot be verified.'};
 const titles={SETUP:'Scheduled verification starts 5 October',PENDING:'Morning review pending',ATTENTION:'Morning review needs attention',PARTIAL:'Supported shares checked; coverage incomplete',COMPLETE:'Morning review completed'};
 if(!titles[s.state])return {warning:true,title:'Daily monitor returned an unknown status',detail:'Run status cannot be verified.'};
 const asx=describeAsxConvergence(s.asxConvergence,now);
 return {warning:s.state==='ATTENTION'||s.state==='PARTIAL'||(payload.incidents?.length??0)>0||asx.warning,
  title:s.state==='COMPLETE'&&asx.warning?`Morning records complete; ${asx.title.toLowerCase()}`:titles[s.state],
  detail:(s.marketDue?`${c.researched}/${c.supported} researched · ${c.published} published · ${c.evaluated} evaluated · ${c.blocked} unsupported`:'No US Decision Lab review due for this market date. Daily Opportunity research is checked separately.')+` · ${asx.title}`};
}
