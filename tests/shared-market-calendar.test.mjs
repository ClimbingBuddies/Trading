import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadCalendarManifest,calendarManifestHash,localSessionInstant,attributeDailyObservations} from '../lib/shared-market-calendar.mjs';
const m=JSON.parse(readFileSync(new URL('../data/shared-market-calendars/nasdaq-2026.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const trust=x=>({manifestHash:calendarManifestHash(x),exchange:x.exchange,revision:x.revision,verifiedAt:'2026-09-20T00:00:00Z',validUntil:'2026-09-22T00:00:00Z',reference:x.sources.join(' ')});
const load=(x=m,t=trust(x))=>loadCalendarManifest(x,t,{asOf:'2026-09-20T12:00:00Z'});
test('explicit full year contains 365 days and 251 sessions',()=>{assert.equal(m.days.length,365);assert.equal(load().sessions.length,251);assert.ok(Object.isFrozen(load()));});
test('Nasdaq DST changes UTC hours in March and November',()=>{for(const [d,open,close] of [['2026-03-06','14:30','21:00'],['2026-03-09','13:30','20:00'],['2026-11-02','14:30','21:00']]){const s=load().sessions.find(s=>s.id.endsWith(d));assert.equal(s.opens_at.slice(11,16),open);assert.equal(s.closes_at.slice(11,16),close);}});
test('holiday has no session and early close is 13:00 Eastern',()=>{assert.ok(!load().sessions.some(s=>s.id.endsWith('2026-07-03')));assert.equal(load().sessions.find(s=>s.id.endsWith('2026-11-27')).closes_at,'2026-11-27T18:00:00.000Z');});
test('Sydney date conversion handles opposite DST transition',()=>{assert.equal(localSessionInstant('2026-10-02','16:11:00','Australia/Sydney'),'2026-10-02T06:11:00.000Z');assert.equal(localSessionInstant('2026-10-05','16:11:00','Australia/Sydney'),'2026-10-05T05:11:00.000Z');});
test('missing explicit day rejected even with newly hashed manifest',()=>{const x=structuredClone(m);x.days.splice(30,1);assert.throws(()=>load(x),/missing or duplicate/);});
test('caller changed session cannot reuse trusted hash',()=>{const x=structuredClone(m);x.days[1].closes_at='2026-01-02T20:00:00Z';assert.throws(()=>load(x,trust(m)),/trust record/);});
test('expired trust and missing trust rejected',()=>{assert.throws(()=>load(m,{...trust(m),validUntil:'2026-09-19T00:00:00Z'}),/trust record/);assert.throws(()=>load(m,{}),/trust record/);});
test('partial date coverage rejected',()=>{assert.throws(()=>loadCalendarManifest(m,trust(m),{asOf:'2026-09-20T12:00:00Z',requiredStart:'2025-12-31T00:00:00Z'}),/coverage/);});
const mapping={verified:true,dateConvention:'SESSION_DATE',reference:'Fixture provider semantics',instrumentId:'stock',providerId:'provider',currency:'USD',exchange:'NASDAQ'};
const row={id:'1',instrument_id:'stock',provider_id:'provider',currency:'USD',interval_code:'1day',session_date:'2026-09-18',loaded_at:'2026-09-19T00:00:00Z',close:'100.10',adjusted_close:'100.10'};
const attribute=(r=[row],mp=mapping)=>attributeDailyObservations(r,load(),mp,{asOf:'2026-09-20T12:00:00Z'});
test('date label attributed to actual session close without copying midnight',()=>{assert.equal(attribute()[0].session_close,'2026-09-18T20:00:00.000Z');});
test('missing adjusted price never replaced with close',()=>assert.throws(()=>attribute([{...row,adjusted_close:null}]),/adjusted close/));
test('holiday date and duplicate observations rejected',()=>{assert.throws(()=>attribute([{...row,session_date:'2026-09-07'}]),/trading sessions/);assert.throws(()=>attribute([row,{...row,id:'2'}]),/duplicate session/);});
test('unverified provider or timestamp convention rejected',()=>{assert.throws(()=>attribute([row],{...mapping,verified:false}),/mapping/);assert.throws(()=>attribute([row],{...mapping,dateConvention:'UTC_TIMESTAMP'}),/mapping/);});
test('future and preclose observations rejected',()=>{for(const loaded_at of ['2026-09-18T00:00:00Z','2026-09-21T00:00:00Z'])assert.throws(()=>attribute([{...row,loaded_at}]),/evaluation/);});
test('wrong provider and invalid price rejected',()=>{assert.throws(()=>attribute([{...row,provider_id:'other'}]),/mapping/);assert.throws(()=>attribute([{...row,close:'NaN'}]),/positive/);});


test('trust expires exactly at boundary',()=>assert.throws(()=>load(m,{...trust(m),validUntil:'2026-09-20T12:00:00Z'}),/trust record/));
for(const id of ['00000000-0000-4000-8000-000000000001','9223372036854775808','01','0']) test('calendar helper rejects invalid bigint '+id,()=>assert.throws(()=>attribute([{...row,id}]),/identity/));
