import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateAsxResearchCalendar} from '../lib/asx-research-calendar.mjs';
import {prepareAsxResearchReadiness} from '../scripts/prepare-asx-research-readiness.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manifest=JSON.parse(read('data/shared-market-calendars/asx-research-2026-20261118.json'));
const trust=JSON.parse(read('data/shared-market-calendars/asx-research-2026-20261118.trust.json'));
const template=read('scripts/asx-research-readiness.template.sql');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'
  ?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=m=>createHash('sha256').update(canonical(m)).digest('hex');
const copy=()=>[structuredClone(manifest),structuredClone(trust)];
const reject=(change,pattern)=>{const [m,t]=copy();change(m,t);assert.throws(()=>validateAsxResearchCalendar(m,t),pattern);};
test('reviewed manifest has exact bounded contiguous date coverage and independently reproduced hash',()=>{
  assert.equal(hash(manifest),'0880fe1d9a18236844eb6bf788d2dfb8e1f54ef316975d26b6478710194aeb1a');
  assert.equal(trust.manifestHash,hash(manifest));assert.equal(manifest.days.length,67);
  assert.equal(manifest.days.filter(d=>d.status==='OPEN').length,47);
  assert.equal(manifest.days.filter(d=>d.status==='CLOSED').length,20);
  const expected=[];for(let t=Date.parse('2026-10-15T00:00:00Z');t<=Date.parse('2026-12-20T00:00:00Z');t+=86400000){
    const date=new Date(t);expected.push({date:date.toISOString().slice(0,10),status:[0,6].includes(date.getUTCDay())?'CLOSED':'OPEN'});
  }
  assert.deepEqual(manifest.days.map(({date,status})=>({date,status})),expected);
  assert.equal(Date.parse(trust.validUntil)-Date.parse(trust.verifiedAt),7*86400000);
  assert.deepEqual(validateAsxResearchCalendar(manifest,trust),{manifestHash:hash(manifest),verifiedAt:trust.verifiedAt,validUntil:trust.validUntil});
});
test('checked-in SQL exactly matches offline compiler output',()=>{
  const generated=prepareAsxResearchReadiness(manifest,trust,template);
  assert.equal(generated.replaceAll('\r\n','\n'),read('scripts/asx-research-readiness.sql').replaceAll('\r\n','\n'));
  assert.equal(generated.includes('{{'),false);assert.match(generated,/statement_timestamp\(\)/);
});
test('manifest changes without fresh trusted hash fail before generation',()=>{
  for(const change of [m=>m.days[0].status='CLOSED',m=>m.limitations.push('changed'),m=>m.sources.push('https://example.invalid/new')]){
    const [m,t]=copy();change(m);if(m.days[0].status==='CLOSED')m.days[0].reason='test';
    assert.throws(()=>prepareAsxResearchReadiness(m,t,template),/trust identity\/hash/);
  }
});
test('independent canonical hash does not depend on JSON object insertion order',()=>{
  const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
  const m=reverse(manifest);assert.equal(hash(m),trust.manifestHash);validateAsxResearchCalendar(m,trust);
});
test('missing duplicate reordered invalid and truncated calendar dates fail closed',()=>{
  for(const change of [m=>m.days.splice(2,1),m=>m.days.splice(2,0,m.days[1]),m=>m.days.reverse(),
    m=>m.days[0].date='2026-02-30',m=>m.endDate='2026-12-21',m=>m.days=[]])reject((m,t)=>{change(m);t.manifestHash=hash(m);});
});
test('wrong purpose exchange zone or version cannot become a research calendar',()=>{
  for(const [key,value] of [['purpose','EXECUTION'],['exchange','NASDAQ'],['timeZone','UTC'],['version',2]])
    reject((m,t)=>{m[key]=value;t[key]=value;t.manifestHash=hash(m);},/identity/);
});
test('no session instants inferred: OPEN timestamps and unresolved statuses rejected',()=>{
  for(const change of [m=>m.days[0].opens_at='2026-10-15T00:00:00Z',m=>m.days[0].closes_at='2026-10-15T06:00:00Z',
    m=>m.days[0].status='UNKNOWN',m=>delete m.days[2].reason])reject((m,t)=>{change(m);t.manifestHash=hash(m);},/invalid date-only/);
});
test('source references and limitations remain mandatory',()=>{
  for(const change of [m=>m.sources=[],m=>m.sources=['http://example.invalid'],m=>m.limitations=[]])reject((m,t)=>{change(m);t.manifestHash=hash(m);});
});
test('mismatched missing or unreferenced trust fails closed',()=>{
  for(const [key,value] of [['revision','other'],['exchange','OTHER'],['purpose','OTHER'],['manifestHash','0'.repeat(64)],['reference','']])
    reject((m,t)=>t[key]=value,/trust identity\/hash/);
  assert.throws(()=>validateAsxResearchCalendar(manifest,null));
});
test('trust window accepts seven days exactly and rejects longer empty reversed or timezone-free windows',()=>{
  const [m,t]=copy();assert.doesNotThrow(()=>validateAsxResearchCalendar(m,t));
  for(const until of [new Date(Date.parse(t.verifiedAt)+7*86400000+1).toISOString(),t.verifiedAt,
    new Date(Date.parse(t.verifiedAt)-1).toISOString(),'2026-11-25T02:34:21','not-a-date'])
    reject((m,t)=>t.validUntil=until);
  reject((m,t)=>t.verifiedAt='2026-11-18');
});
test('compiler escapes quoted provenance and rejects unknown template tokens',()=>{
  const [m,t]=copy();m.revision="reviewer's revision";t.revision=m.revision;t.manifestHash=hash(m);
  assert.match(prepareAsxResearchReadiness(m,t,template),/'reviewer''s revision'/);
  assert.throws(()=>prepareAsxResearchReadiness(manifest,trust,'{{UNRECOGNIZED_TOKEN}}'),/Unknown template token/);
});
