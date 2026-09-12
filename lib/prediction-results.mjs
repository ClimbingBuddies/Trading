// Published plans are inputs, never reconstructed from subsequent prices.
export function predictionStatus(prediction, result) {
  if (!result) return 'Awaiting prices'
  return ({ PENDING_ENTRY: 'Awaiting entry', OPEN: 'Tracking', COMPLETE: 'Completed', NOT_ENTERED: 'Not entered', INCOMPLETE: 'Data incomplete' })[result.status] ?? 'Data incomplete'
}

export function predictionScorecard(predictions, results, horizon) {
  const selected = predictions.filter(p => p.horizon_sessions === horizon)
  const latest = new Map()
  for (const result of results) {
    const previous = latest.get(result.prediction_id)
    if (!previous || Date.parse(result.evaluated_at) > Date.parse(previous.evaluated_at)) latest.set(result.prediction_id, result)
  }
  const completed = selected.filter(p => p.action === 'BUY').map(p => latest.get(p.id))
    .filter(r => r?.status === 'COMPLETE' && r.net_return !== null && Number.isFinite(Number(r.net_return)))
  const compared = completed.filter(r => r.benchmark_return !== null && Number.isFinite(Number(r.benchmark_return)))
  return {
    published: selected.length,
    completed: completed.length,
    wins: completed.filter(r => Number(r.net_return) > 0).length,
    compared: compared.length,
    beatBenchmark: compared.filter(r => Number(r.net_return) > Number(r.benchmark_return)).length,
    meanReturn: completed.length ? completed.reduce((sum, r) => sum + Number(r.net_return), 0) / completed.length : null,
  }
}

export function formatPredictionReturn(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  const n = Number(value) * 100
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

