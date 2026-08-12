import Link from 'next/link'
import { getStrategiesData } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

type DecisionNode = {
  id: string
  node_code: string
  node_type: string
  title: string
  description: string | null
  metric_code: string | null
  comparison_operator: string | null
  threshold_value: number | null
  outcome_code: string | null
  outcome_status: string | null
  sort_order: number
}

function metricLabel(node: DecisionNode) {
  if (!node.metric_code || !node.comparison_operator || node.threshold_value === null) return null
  const suffix = node.metric_code.includes('pct') ? '%' : ''
  return `${node.metric_code} ${node.comparison_operator} ${node.threshold_value}${suffix}`
}

export default async function StrategiesPage() {
  try {
    const data = await getStrategiesData()
    const nodes = data.nodes as unknown as DecisionNode[]
    const start = nodes.find((node) => node.node_type === 'start')
    const decisions = nodes.filter((node) => node.node_type === 'decision').sort((a, b) => a.sort_order - b.sort_order)
    const outcomes = nodes.filter((node) => node.node_type === 'outcome').sort((a, b) => a.sort_order - b.sort_order)
    const activeStrategies = data.strategies.filter((strategy) => strategy.status !== 'retired').length

    return (
      <div className="page">
        <header className="pageHeader">
          <div>
            <h1>Strategies / Overview</h1>
            <p className="subtitle">Strategy development, test evidence and decision outcomes.</p>
          </div>
          <button className="secondaryButton" type="button" disabled title="Strategy creation will be added in a later phase">+ New Strategy — future</button>
        </header>

        <section className="kpiGrid strategyKpis">
          <article className="kpi"><span>Total Strategies</span><strong className="number">{data.strategies.length}</strong><small>{activeStrategies} active</small></article>
          <article className="kpi"><span>Test Runs</span><strong className="number">{data.tests.length}</strong><small>Recorded tests</small></article>
          <article className="kpi"><span>Decision Framework</span><strong>{data.tree?.tree_name ?? '—'}</strong><small>{data.tree ? `Version ${data.tree.version}` : 'Waiting for accessible framework data'}</small></article>
        </section>

        {data.strategies.length === 0 ? (
          <section className="emptyStateLarge strategyEmpty">
            <div className="emptyIcon">⬡</div>
            <strong>No strategies created yet</strong>
            <span>The strategy workspace is built and ready. As strategies and test runs are added to Supabase, this area will automatically expand into the performance and review tables shown in the design concept.</span>
            <div className="lifecycleStrip"><span>Define</span><b>→</b><span>Backtest</span><b>→</b><span>Review</span><b>→</b><span>Validate</span><b>→</b><span>Promote</span></div>
          </section>
        ) : (
          <section className="panel tablePanel">
            <div className="panelHeader"><div><h2>Strategy Portfolio</h2><p className="panelHint">Current strategies stored in Supabase.</p></div></div>
            <div className="tableScroll">
              <table>
                <thead><tr><th>Strategy</th><th>Status</th><th>Description</th><th>Updated</th></tr></thead>
                <tbody>{data.strategies.map((strategy) => <tr key={strategy.id}><td><Link className="rowLink" href={`/strategies/${strategy.id}`}>{strategy.strategy_name}</Link></td><td><span className={`status status-${strategy.status}`}>{strategy.status}</span></td><td className="summaryCell">{strategy.description ?? '—'}</td><td>{new Date(strategy.updated_at).toLocaleDateString('en-AU')}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        <section className="panel decisionPanel">
          <div className="panelHeader">
            <div><h2>{data.tree?.tree_name ?? 'Standard Trading Strategy Review'}</h2><p className="panelHint">{data.tree?.description ?? 'Decision workflow will appear here when the decision-tree data is available to the dashboard.'}</p></div>
            {data.tree && <span className="status status-succeeded">Active · v{data.tree.version}</span>}
          </div>

          {nodes.length ? (
            <div className="decisionWorkflow">
              {start && <div className="decisionStart"><span>START</span><strong>{start.title}</strong><small>{start.description}</small></div>}
              {decisions.map((node) => (
                <div className="decisionStep" key={node.id}>
                  <div className="decisionArrow">↓</div>
                  <article>
                    <span className="stepNumber">{Math.max(1, Math.round(node.sort_order / 10))}</span>
                    <div><strong>{node.title}</strong><small>{node.description}</small>{metricLabel(node) && <code>{metricLabel(node)}</code>}</div>
                  </article>
                </div>
              ))}
              <div className="decisionArrow">↓</div>
              <div className="promoteOutcome">
                <span>PASS ALL GATES</span>
                <strong>{outcomes.find((node) => node.outcome_status === 'promote')?.title ?? 'Promote to next testing stage'}</strong>
              </div>

              <div className="alternativeOutcomes">
                <h3>Alternative outcomes</h3>
                <div>
                  {outcomes.filter((node) => node.outcome_status !== 'promote').map((node) => (
                    <article key={node.id}><span className={`status status-${node.outcome_status ?? 'partial'}`}>{node.outcome_status?.replaceAll('_', ' ') ?? 'outcome'}</span><strong>{node.title}</strong><small>{node.description}</small></article>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="emptyCompact">The Strategies page is fully built, but the decision-tree rows are not currently visible to the application role. No placeholder performance data has been fabricated.</div>
          )}
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader"><div><h2>Recent Test Runs</h2><p className="panelHint">Performance rows appear only after real test runs are stored.</p></div></div>
          <div className="tableScroll">
            <table>
              <thead><tr><th>Run</th><th>Test Type</th><th>Period</th><th>Trades</th><th>Return</th><th>Win Rate</th><th>Profit Factor</th><th>Max Drawdown</th><th>Sharpe</th></tr></thead>
              <tbody>
                {data.tests.length ? data.tests.slice(0, 10).map((run) => (
                  <tr key={run.id}><td><strong>{run.run_name}</strong></td><td>{run.test_type}</td><td>{run.period_start ?? '—'} – {run.period_end ?? '—'}</td><td className="numericCell">{run.trade_count}</td><td className="numericCell">{run.return_pct === null ? '—' : `${run.return_pct}%`}</td><td className="numericCell">{run.win_rate_pct === null ? '—' : `${run.win_rate_pct}%`}</td><td className="numericCell">{run.profit_factor ?? '—'}</td><td className="numericCell">{run.max_drawdown_pct === null ? '—' : `${run.max_drawdown_pct}%`}</td><td className="numericCell">{run.sharpe_ratio ?? '—'}</td></tr>
                )) : <tr><td colSpan={9}><div className="tableEmpty">No test runs have been loaded yet. This table will populate automatically when real strategy tests exist.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <header className="pageHeader"><div><h1>Strategies / Overview</h1><p className="subtitle">Strategy development, test evidence and decision outcomes.</p></div></header>
        <div className="emptyStateLarge"><strong>Strategy data is not available yet.</strong><span>{error instanceof Error ? error.message : 'The page layout is ready and will populate as strategy data becomes available.'}</span></div>
      </div>
    )
  }
}
