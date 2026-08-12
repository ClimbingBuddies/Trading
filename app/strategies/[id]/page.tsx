import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStrategiesData } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const data = await getStrategiesData()
    const strategy = data.strategies.find((item) => item.id === id)
    if (!strategy) notFound()
    const tests = data.tests.filter((item) => item.strategy_id === id)

    return (
      <div className="page">
        <div className="detailTopline"><Link href="/strategies">← Back to Strategies</Link><span className={`status status-${strategy.status}`}>{strategy.status}</span></div>
        <header className="pageHeader"><div><h1>{strategy.strategy_name}</h1><p className="subtitle">{strategy.description ?? 'No description has been added yet.'}</p></div></header>

        <section className="kpiGrid detailKpis">
          <article className="kpi"><span>Strategy Code</span><strong>{strategy.strategy_code}</strong><small>System identifier</small></article>
          <article className="kpi"><span>Status</span><strong>{strategy.status}</strong><small>Current lifecycle state</small></article>
          <article className="kpi"><span>Test Runs</span><strong className="number">{tests.length}</strong><small>Recorded tests</small></article>
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader"><div><h2>Test History</h2><p className="panelHint">Click a run for detailed test evidence.</p></div></div>
          <div className="tableScroll"><table><thead><tr><th>Run</th><th>Type</th><th>Trades</th><th>Return</th><th>Win Rate</th><th>Drawdown</th><th>Sharpe</th></tr></thead><tbody>
            {tests.length ? tests.map((run) => <tr key={run.id}><td><Link className="rowLink" href={`/strategies/${id}/tests/${run.id}`}>{run.run_name}</Link></td><td>{run.test_type}</td><td>{run.trade_count}</td><td>{run.return_pct === null ? '—' : `${run.return_pct}%`}</td><td>{run.win_rate_pct === null ? '—' : `${run.win_rate_pct}%`}</td><td>{run.max_drawdown_pct === null ? '—' : `${run.max_drawdown_pct}%`}</td><td>{run.sharpe_ratio ?? '—'}</td></tr>) : <tr><td colSpan={7}><div className="tableEmpty">No test runs exist for this strategy yet.</div></td></tr>}
          </tbody></table></div>
        </section>
      </div>
    )
  } catch (error) {
    return <div className="page"><div className="detailTopline"><Link href="/strategies">← Back to Strategies</Link></div><div className="errorState"><strong>Strategy detail is not available yet.</strong><span>{error instanceof Error ? error.message : 'This route will populate when strategy data is available.'}</span></div></div>
  }
}
