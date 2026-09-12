import test from 'node:test'
import assert from 'node:assert/strict'
import { predictionScorecard, predictionStatus, formatPredictionReturn } from '../lib/prediction-results.mjs'

test('keeps losing picks and excludes missing, open, and non-buy outcomes', () => {
  const predictions = ['winner','loser','pending','observe'].map(id => ({ id, action: id === 'observe' ? 'HOLD' : 'BUY', horizon_sessions: 5 }))
  const results = [
    { prediction_id:'winner', status:'COMPLETE', net_return:0.1, benchmark_return:0.15, evaluated_at:'2026-10-01' },
    { prediction_id:'loser', status:'COMPLETE', net_return:-0.1, benchmark_return:null, evaluated_at:'2026-10-01' },
    { prediction_id:'pending', status:'OPEN', net_return:0.5, benchmark_return:0, evaluated_at:'2026-10-01' },
    { prediction_id:'observe', status:'COMPLETE', net_return:0.5, benchmark_return:0, evaluated_at:'2026-10-01' },
  ]
  assert.deepEqual(predictionScorecard(predictions, results, 5), {published:4,completed:2,wins:1,compared:1,beatBenchmark:0,meanReturn:0})
  assert.equal(predictionScorecard(predictions, results, 20).completed, 0)
})
test('uses latest outcome and preserves null versus zero', () => {
  const p = [{id:'a',action:'BUY',horizon_sessions:20}]
  const r = [{prediction_id:'a',status:'OPEN',net_return:0.9,evaluated_at:'2026-09-01'}, {prediction_id:'a',status:'COMPLETE',net_return:0,benchmark_return:0,evaluated_at:'2026-10-01'}]
  assert.equal(predictionScorecard(p,r,20).wins,0)
  assert.equal(formatPredictionReturn(null),'—')
  assert.equal(formatPredictionReturn(0),'0.00%')
  assert.equal(predictionStatus(p[0],null),'Awaiting prices')
})

