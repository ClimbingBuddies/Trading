// Privileged input boundary: manifests and trust records must never come from browser JSON.
import { createHash } from 'node:crypto';
const fail = message => { throw new Error('Market calendar: ' + message); };
const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : value && typeof value==='object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}' : JSON.stringify(value);
export const calendarManifestHash = manifest => createHash('sha256').update(canonical(manifest)).digest('hex');
const freeze = value => { if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; };
function date(value) { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) fail('invalid date');return value; }
function stamp(value) { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail('timezone required');return Date.parse(value); }
function localParts(value,zone) { return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value])); }
export function localSessionInstant(day,time,zone) {
 date(day);if(!/^\d{2}:\d{2}:\d{2}$/.test(time))fail('invalid local time');
 const wanted=day+'T'+time;let candidate=Date.parse(wanted+'Z');
 for(let n=0;n<4;n++){const p=localParts(candidate,zone);const seen=p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second;const delta=Date.parse(wanted+'Z')-Date.parse(seen+'Z');if(!delta)return new Date(candidate).toISOString();candidate+=delta;}
 fail('nonexistent local time');
}
export function loadCalendarManifest(input,trust,{asOf,requiredStart=asOf,requiredEnd=asOf}={}) {
 const m=structuredClone(input),now=stamp(asOf);
 if(m.version!==1||!m.exchange||!m.revision||!m.timeZone||!Array.isArray(m.days)||!m.days.length)fail('incomplete manifest');
 date(m.startDate);date(m.endDate);
 if(!trust||trust.manifestHash!==calendarManifestHash(m)||trust.exchange!==m.exchange||trust.revision!==m.revision||!trust.reference||stamp(trust.verifiedAt)>now||stamp(trust.validUntil)<=now)fail('missing, expired or mismatched trust record');
 if(!Array.isArray(m.sources)||!m.sources.length||m.sources.some(s=>typeof s!=='string'||!s.startsWith('https://')))fail('source references required');
 const sessions=[];let expected=m.startDate,lastClose=-Infinity;
 for(const d of m.days) {
  if(date(d.date)!==expected)fail('missing or duplicate calendar day');
  if(d.status==='CLOSED'){if(!d.reason||d.opens_at||d.closes_at)fail('invalid closed day');}
  else if(d.status==='OPEN'){
   const open=stamp(d.opens_at),close=stamp(d.closes_at);
   const p=localParts(open,m.timeZone),q=localParts(close,m.timeZone);
   if(p.year+'-'+p.month+'-'+p.day!==d.date||q.year+'-'+q.month+'-'+q.day!==d.date||close<=open||open<=lastClose)fail('invalid session boundaries');
   sessions.push({id:m.exchange+':'+d.date,opens_at:d.opens_at,closes_at:d.closes_at});lastClose=close;
  } else fail('unresolved calendar day');
  expected=new Date(Date.parse(expected+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 }
 if(m.days.at(-1).date!==m.endDate)fail('coverage end mismatch');
 const coverageStart=localSessionInstant(m.startDate,'00:00:00',m.timeZone),coverageEnd=localSessionInstant(expected,'00:00:00',m.timeZone);
 if(stamp(requiredStart)<stamp(coverageStart)||stamp(requiredEnd)>=stamp(coverageEnd)||stamp(requiredStart)>stamp(requiredEnd))fail('insufficient coverage');
 return freeze({exchange:m.exchange,complete:true,coverageStart,coverageEnd,provenance:{verified:true,verifiedAt:trust.verifiedAt,reference:trust.reference,revision:m.revision},sessions});
}
// A provider date is a date label, never an inferred exchange closing instant.
export function attributeDailyObservations(rows,calendar,mapping,{asOf}={}) {
 const now=stamp(asOf),ids=new Set(),pairs=new Set();
 if(!mapping||mapping.verified!==true||mapping.dateConvention!=='SESSION_DATE'||!mapping.reference||!mapping.instrumentId||!mapping.providerId||!mapping.currency||mapping.exchange!==calendar.exchange)fail('verified provider mapping required');
 const byDate=new Map(calendar.sessions.map(s=>[s.id.slice(s.id.lastIndexOf(':')+1),s]));
 return freeze(rows.map(row=>{
  if(typeof row.id!=='string'||(!/^[1-9]\d*$/.test(row.id)||BigInt(row.id)>9223372036854775807n)||ids.has(row.id))fail('invalid observation identity');
  if(row.instrument_id!==mapping.instrumentId||row.provider_id!==mapping.providerId||row.currency!==mapping.currency||row.interval_code!=='1day')fail('observation mapping mismatch');
  const session=byDate.get(date(row.session_date));if(!session)fail('observation outside trading sessions');
  if(pairs.has(row.session_date))fail('duplicate session observations');
  for(const value of [row.close,row.adjusted_close])if(typeof value!=='string'||! /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<=0)fail('positive close and adjusted close required');
  if(stamp(row.loaded_at)<stamp(session.closes_at)||stamp(row.loaded_at)>now)fail('observation not available at evaluation');
  ids.add(row.id);pairs.add(row.session_date);
  return {id:row.id,instrument_id:row.instrument_id,provider_id:row.provider_id,currency:row.currency,interval_code:row.interval_code,session_id:session.id,session_close:session.closes_at,loaded_at:row.loaded_at,close:row.close,adjusted_close:row.adjusted_close};
 }));
}

