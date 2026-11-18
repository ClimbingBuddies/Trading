// Offline compiler; no provider calls, SQL execution, schema or scheduler changes.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateAsxResearchCalendar} from '../lib/asx-research-calendar.mjs';
export function prepareAsxResearchReadiness(manifest,trust,template) {
  validateAsxResearchCalendar(manifest,trust);
  const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
  const replacements={
    CALENDAR_DAYS:manifest.days.map(d=>`    (${quote(d.date)}::date,${quote(d.status)})`).join(',\n'),
    CALENDAR_REVISION:quote(manifest.revision),CALENDAR_HASH:quote(trust.manifestHash),
    VERIFIED_AT:quote(trust.verifiedAt),VALID_UNTIL:quote(trust.validUntil),
    START_DATE:quote(manifest.startDate),END_DATE:quote(manifest.endDate)
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{
    if(!(key in replacements))throw Error('Unknown template token '+key);
    return replacements[key];
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [manifestPath,trustPath,outputPath]=process.argv.slice(2);
  if(!manifestPath||!trustPath||!outputPath)throw Error('Usage: manifest.json reviewed-trust.json output.sql');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const trust=JSON.parse(readFileSync(trustPath,'utf8'));
  const template=readFileSync(new URL('./asx-research-readiness.template.sql',import.meta.url),'utf8');
  writeFileSync(outputPath,prepareAsxResearchReadiness(manifest,trust,template),'utf8');
  console.log(`Prepared read-only ${manifest.revision}; hash ${trust.manifestHash}`);
}
