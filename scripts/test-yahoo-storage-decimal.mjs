// Independent parity against actual PostgreSQL typmod casts. Synthetic only.
// Run from repo root with optional PGLITE_MODULE identifying a local install.
import assert from 'node:assert/strict';
import { storageDecimal } from '../supabase/functions/market-history-maintenance-worker/storage-decimal.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let cases=0,overflows=0;
const types={open:[20,8],high:[20,8],low:[20,8],close:[20,8],adjusted_close:[20,8],volume:[24,4]};
const boundary=['0','-0',null,0,-0,1,-1,'+000001.2300','0e400','1e-400','-1e-400',
  '5e-9','-5e-9','4.999999999999e-9','5.000000000001e-9','5e-5','-5e-5',
  '1.234567895','-1.234567895',1.234567895,1.000000005,0.1+0.2,Number.MIN_VALUE,
  '999999999999.999999994','999999999999.999999995','-999999999999.999999995',
  '99999999999999999999.99994','99999999999999999999.99995','-99999999999999999999.99995',
  '1e12','1e20','1e400','-1e400','12345678901234567890e-20',
  '1234567890123456789012345678901234567890e-35','0.'+'0'.repeat(390)+'5'];
let seed=189721n;
function next(){seed=(seed*48271n)%2147483647n;return seed;}
const generated=[];
for(let i=0;i<200;i++) {
  const sign=next()%2n?'':'-';const coefficient=String(next())+String(next());
  const point=Number(next()%BigInt(coefficient.length-1))+1;
  const exponent=Number(next()%51n)-35;
  generated.push(`${sign}${coefficient.slice(0,point)}.${coefficient.slice(point)}e${exponent}`);
}
try {
  for(const [field,[precision,scale]] of Object.entries(types)) {
    for(const value of [...boundary,...generated]) {
      let actual,error;
      try{actual=storageDecimal(value,field);}catch(e){error=e;}
      let expected,pgError;
      try{
        // Cast first to the real declared column type, then scale the stored
        // result with PostgreSQL arithmetic; no JS rounding in this oracle.
        expected=(await db.query(`select (($1::numeric(${precision},${scale}))*${10**scale})::numeric(${precision},0)::text result`,
          [value===null?null:String(value)])).rows[0].result;
      }catch(e){pgError=e;}
      if(pgError){assert.equal(pgError.code,'22003',`${field} ${value}`);assert.ok(error,`Expected overflow: ${field} ${value}`);overflows++;}
      else{assert.equal(error,undefined,`${field} ${value}: unexpected JS rejection`);assert.equal(actual,expected,`${field} ${value}`);}
      cases++;
    }
  }
  console.log(`PASS: ${cases} PostgreSQL parity cases, including ${overflows} matching overflow rejections; six real numeric typmods.`);
  console.log('storage-decimal.mjs SHA256 '+createHash('sha256').update(await readFile('supabase/functions/market-history-maintenance-worker/storage-decimal.mjs')).digest('hex'));
}finally{await db.close();}
