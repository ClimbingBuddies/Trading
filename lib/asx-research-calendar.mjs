// Privileged, date-only research calendar. Never an evaluator/fill calendar.
import {calendarManifestHash} from './shared-market-calendar.mjs';
const fail = reason => { throw new Error('ASX research calendar: '+reason); };
const day = value => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||
    new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) fail('invalid date');
  return value;
};
const stamp = value => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value))) fail('invalid timestamp');
  return Date.parse(value);
};
export function validateAsxResearchCalendar(manifest,trust) {
  if(manifest.version!==1||manifest.purpose!=='ASX_RESEARCH_SESSION_DATES_ONLY'||manifest.exchange!=='ASX'||
    manifest.timeZone!=='Australia/Sydney'||!manifest.revision||!Array.isArray(manifest.days)||!manifest.days.length) fail('identity');
  if(!Array.isArray(manifest.sources)||!manifest.sources.length||manifest.sources.some(s=>typeof s!=='string'||!s.startsWith('https://'))) fail('sources');
  if(!Array.isArray(manifest.limitations)||!manifest.limitations.length) fail('limitations');
  day(manifest.startDate);day(manifest.endDate);
  let expected=manifest.startDate;
  for(const d of manifest.days) {
    if(day(d.date)!==expected) fail('missing or duplicate day');
    if(!['OPEN','CLOSED'].includes(d.status)||d.opens_at||d.closes_at||d.status==='CLOSED'&&!d.reason) fail('invalid date-only day');
    expected=new Date(Date.parse(expected+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  }
  if(manifest.days.at(-1).date!==manifest.endDate) fail('coverage end');
  if(!trust||trust.purpose!==manifest.purpose||trust.revision!==manifest.revision||trust.exchange!==manifest.exchange||
    trust.manifestHash!==calendarManifestHash(manifest)||!trust.reference) fail('trust identity/hash');
  const verified=stamp(trust.verifiedAt),until=stamp(trust.validUntil);
  if(until<=verified||until-verified>7*86400000) fail('review window must be at most seven days');
  return {manifestHash:trust.manifestHash,verifiedAt:trust.verifiedAt,validUntil:trust.validUntil};
}
