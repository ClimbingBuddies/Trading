// Produces SQL for a privileged, independently reviewed manifest import. No network.
import {readFileSync,writeFileSync} from 'node:fs';
import {calendarManifestHash,loadCalendarManifest} from '../lib/shared-market-calendar.mjs';
const [manifestPath,trustPath,outputPath]=process.argv.slice(2);
if(!manifestPath||!trustPath||!outputPath)throw Error('Usage: manifest.json reviewed-trust.json output.sql');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));
const trust=JSON.parse(readFileSync(trustPath,'utf8'));
const calendar=loadCalendarManifest(manifest,trust,{asOf:trust.verifiedAt});
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const sql=`begin;\ninsert into private.shared_market_calendars(exchange_code,revision,time_zone,coverage_start,coverage_end,verified_at,valid_until,reference,manifest_hash,days,sessions)\nvalues(${[manifest.exchange,manifest.revision,manifest.timeZone,calendar.coverageStart,calendar.coverageEnd,trust.verifiedAt,trust.validUntil,trust.reference,calendarManifestHash(manifest)].map(quote).join(',')},${quote(JSON.stringify(manifest.days))}::jsonb,${quote(JSON.stringify(calendar.sessions))}::jsonb);\ncommit;\n`;
writeFileSync(outputPath,sql,'utf8');console.log(`Prepared ${manifest.exchange} ${calendar.sessions.length} sessions; reviewed hash ${calendarManifestHash(manifest)}`);
