import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStrategiesData } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

function metric(label: string, value: string | number | null) {
  return <article className="kpi"><span>{label}</span><strong className="number">{value ?? '—'}</strong></article>
}

export default async function StrategyTestPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  try {
    const data = await getStrategiesData()
    const strategy = data.strategies.find((item) => item.id === id)
    const run = data.tests.find((item) => item.id === runId && item.strategy_id === id)
    if (!strategy || !run) notFound()

    return (
      <div className="page">
        <div className="detailTopline"><Link href={`/strategies/${id}`}>← Back to {strategy.strategy_name}</Link></div>
        <header className="pageHeader"><div><h1>{run.run_name}</h1><p className="subtitle">{run.test_type} test evidence for {strategy.strategy_name}.</p></div></header>

        <section className="kpiGrid">
          {metric('Trades', run.trade_count)}
          {metric('Return', run.return_pct === null ? null : `${run.return_pct}%`)}
          {metric('Win Rate', run.win_rate_pct === null ? null : `${run.win_rate_pct}%`)}
          {metric('Profit Factor', run.profit_factor)}
          {metric('Max Drawdown', run.max_drawdown_pct === null ? null : `${run.max_drawdown_pct}%`)}
          {metric('Sharpe Ratio', run.sharpe_ratio)}
        </section>

        <section className="detailGrid">
          <article className="panel detailCard"><h2>Test Parameters</h2><dl>
            <div><dt>Type</dt><dd>{run.test_type}</dd></div><div><dt>Period Start</dt><dd>{run.period_start ?? '—'}</dd></div><div><dt>Period End</dt><dd>{run.period_end ?? '—'}</dd></div><div><dt>Instruments</dt><dd>{run.instrument_count}</dd></div><div><dt>Completed</dt><dd>{run.completed_at ?? '—'}</dd></div>
          </dl></article>
          <article className="panel detailCard"><h2>Review Metrics</h2><dl>
            <div><dt>Expectancy</dt><dd>{run.expectancy ?? '—'}</dd></div><div><dt>Out-of-sample return</dt><dd>{run.out_of_sample_return_pct === null ? '—' : `${run.out_of_sample_return_pct}%`}</dd></div><div><dt>Net profit</dt><dd>{run.net_profit ?? '—'}</dd></div>
          </dl></article>
        </section>
      </div>
    )
  } catch (error) {
    return <div className="page"><div className="detailTopline"><Link href={`/strategies/${id}`}>← Back to Strategy</Link></div><div className="errorState"><strong>Test-run detail is not available yet.</strong><span>{error instanceof Error ? error.message : 'This route will populate when test data is available.'}</span></div></div>
  }
}
