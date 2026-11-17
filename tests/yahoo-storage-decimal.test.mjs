import test from 'node:test';
import assert from 'node:assert/strict';
import { storageDecimal } from '../supabase/functions/market-history-maintenance-worker/storage-decimal.mjs';
import { assessDailyRevision,historyWindow,mergeConsistentDailyRows } from '../supabase/functions/market-history-maintenance-worker/history-window.mjs';
import { normalizeYahoo } from '../supabase/functions/market-history-maintenance-worker/yahoo.mjs';

test('price decimals use eight places and PostgreSQL ties away from zero',()=>{
  for(const field of ['open','high','low','close','adjusted_close']) {
    for(const [value,expected] of [['1.0000000049','100000000'],['1.000000005','100000001'],
      ['-1.000000005','-100000001'],['-1.0000000049','-100000000'],['5e-9','1'],['-5e-9','-1'],
      ['4.9999999999e-9','0'],['-4.9999999999e-9','0'],['0','0'],[-0,'0'],['-0.00000000','0'],
      ['1e-400','0'],['+000001.2300000000','123000000'],[1.234567895,'123456790']]) {
      assert.equal(storageDecimal(value,field),expected,`${field}: ${value}`);
    }
  }
});
test('volume uses four places independently from price precision',()=>{
  for(const [value,expected] of [['100.00004999','1000000'],['100.00005','1000001'],['-100.00005','-1000001'],
    ['5e-5','1'],['-5e-5','-1'],['4.99999999e-5','0'],['1.23456789','12346'],[1e15,'10000000000000000000']])
    assert.equal(storageDecimal(value,'volume'),expected);
  assert.notEqual(storageDecimal('1.23456789','close'),storageDecimal('1.23456789','volume'));
});
test('large decimal strings retain exact units and round into overflow only at true column boundary',()=>{
  assert.equal(storageDecimal('999999999999.999999994','close'),'99999999999999999999');
  assert.equal(storageDecimal('-999999999999.999999994','close'),'-99999999999999999999');
  assert.equal(storageDecimal('99999999999999999999.99994','volume'),'999999999999999999999999');
  for(const value of ['999999999999.999999995','-999999999999.999999995','1e12','-1e12','1e400'])
    assert.throws(()=>storageDecimal(value,'close'),/precision/);
  for(const value of ['99999999999999999999.99995','-99999999999999999999.99995','1e20'])
    assert.throws(()=>storageDecimal(value,'volume'),/precision/);
});
test('null is distinct from zero and malformed/nonfinite values fail closed',()=>{
  assert.equal(storageDecimal(null,'close'),null);assert.equal(storageDecimal(null,'volume'),null);
  assert.notEqual(storageDecimal(null,'volume'),storageDecimal(0,'volume'));
  for(const value of [undefined,true,false,{},[],NaN,Infinity,-Infinity,'',' ',' 1','1 ','NaN','Infinity',
    '-Infinity','1_000','0x10','1.2.3','1e','1e401','1e-401','1'.repeat(513)])
    assert.throws(()=>storageDecimal(value,'close'),/decimal/);
  for(const field of ['constructor','toString','__proto__','unknown'])assert.throws(()=>storageDecimal(1,field),/Unknown/);
});

const date='2026-11-13';
const bar=(patch={})=>({date,open:10,high:12,low:9,close:11,adjusted_close:10.5,volume:100,...patch});
test('only provider-to-storage comparisons ignore rounding; real units and missing volume remain revisions',()=>{
  const previous=bar({open:'10.12345679',high:'12.12345679',low:'9.12345679',close:'11.12345679',adjusted_close:'10.50000001',volume:'100.0001'});
  const provider=bar({open:10.123456789,high:12.123456789,low:9.123456789,close:11.123456789,adjusted_close:10.500000009,volume:100.00005});
  const window=historyWindow(date,[previous]);
  assert.deepEqual(assessDailyRevision(window,[previous],{rows:[provider],events:{}}).reasons,[]);
  for(const field of ['open','high','low','close','adjusted_close','volume']) {
    const changed={...provider,[field]:field==='volume'?100.0002:Number(previous[field])+0.00000001};
    assert.deepEqual(assessDailyRevision(window,[previous],{rows:[changed],events:{}}).changed[0].fields,[field]);
  }
  assert.deepEqual(assessDailyRevision(window,[bar({volume:null})],{rows:[bar({volume:0})],events:{}}).changed[0].fields,['volume']);
});
test('provider-to-provider sub-storage-unit differences remain strict conflicts and duplicate quarantine',()=>{
  const first=bar({close:11.000000001}),second=bar({close:11.000000002});
  assert.equal(storageDecimal(first.close,'close'),storageDecimal(second.close,'close'));
  assert.deepEqual(mergeConsistentDailyRows({rows:[first]},{rows:[second]}).conflicts,[date]);
  const payload={chart:{result:[{meta:{symbol:'TEST.AX',exchangeName:'ASX',currency:'AUD',exchangeTimezoneName:'Australia/Sydney',dataGranularity:'1d'},
    timestamp:[Date.parse(date+'T00:00:00Z')/1000,Date.parse(date+'T01:00:00Z')/1000],
    indicators:{quote:[{open:[10,10],high:[12,12],low:[9,9],close:[first.close,second.close],volume:[100,100]}],adjclose:[{adjclose:[10.5,10.5]}]}}]}};
  const result=normalizeYahoo(payload,'TEST.AX','AUD',date,date);
  assert.deepEqual(result.rows,[]);assert.equal(result.rejected.length,1);
  assert.equal(result.rejected[0].source_bars[0].close,first.close);assert.equal(result.rejected[0].source_bars[1].close,second.close);
});
