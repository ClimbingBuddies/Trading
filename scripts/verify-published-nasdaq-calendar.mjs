// Compare a manifest with the official 2026 schedule checked on 4 October 2026.
// Running this file is a consistency check, not a new official-source verification.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localSessionInstant} from '../lib/shared-market-calendar.mjs';
const path=process.argv[2] ?? 'data/shared-market-calendars/nasdaq-2026.json';
const m=JSON.parse(readFileSync(path,'utf8'));
const holidays=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25']);
const early=new Set(['2026-11-27','2026-12-24']);
assert.equal(m.exchange,'NASDAQ'); assert.equal(m.timeZone,'America/New_York');
assert.equal(m.days.length,365);
for(let n=0;n<365;n++){
 const date=new Date(Date.UTC(2026,0,1+n)).toISOString().slice(0,10),d=m.days[n];
 assert.equal(d.date,date);
 const dow=new Date(date+'T12:00:00Z').getUTCDay(),closed=dow===0||dow===6||holidays.has(date);
 assert.equal(d.status,closed?'CLOSED':'OPEN',date);
 if(!closed){
  assert.equal(Date.parse(d.opens_at),Date.parse(localSessionInstant(date,'09:30:00',m.timeZone)),date+' open');
  assert.equal(Date.parse(d.closes_at),Date.parse(localSessionInstant(date,early.has(date)?'13:00:00':'16:00:00',m.timeZone)),date+' close');
 }
}
console.log('PASS: all 365 dates, holidays, early closes and DST session times match the reviewed official schedule');
