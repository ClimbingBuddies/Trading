export function describePipelineStatus(payload,now=Date.now()) {
 const s=payload?.snapshot,checked=Date.parse(s?.checkedAt);
 if(!s||!Number.isFinite(checked)||checked>now+60000||now-checked>30*60000)
  return {warning:true,title:'Daily monitor is unavailable or overdue',detail:'The latest check cannot be verified. Review the monitor before trusting the run status.'};
 const c=s.counts;
 if(!c||['supported','blocked','researched','published','evaluated'].some(k=>!Number.isInteger(c[k])||c[k]<0))
  return {warning:true,title:'Daily monitor returned incomplete evidence',detail:'Run status cannot be verified.'};
 const titles={SETUP:'Scheduled verification starts 5 October',PENDING:'Morning review pending',ATTENTION:'Morning review needs attention',PARTIAL:'Supported shares checked; coverage incomplete',COMPLETE:'Morning review completed'};
 if(!titles[s.state])return {warning:true,title:'Daily monitor returned an unknown status',detail:'Run status cannot be verified.'};
 return {warning:s.state==='ATTENTION'||s.state==='PARTIAL'||(payload.incidents?.length??0)>0,
  title:titles[s.state],detail:s.marketDue?`${c.researched}/${c.supported} researched · ${c.published} published · ${c.evaluated} evaluated · ${c.blocked} unsupported`:'No US Decision Lab review due for this market date. Daily Opportunity research is checked separately.'};
}
