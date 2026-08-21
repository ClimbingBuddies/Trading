import Link from 'next/link'
import LoadChart from '@/components/LoadChart'
import { getAdminDashboardData } from '@/lib/dashboard'
import { getLatestOpportunityAssessmentRun } from '@/lib/opportunity-runs'
import { getTechnicalEngineRuns } from '@/lib/technical-engine-runs'

export const dynamic = 'force-dynamic'

function fmtDate(value: string | null, includeDate = true) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    ...(includeDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function duration(start: string, finish: string | null) {
  if (!finish) return 'Running'
  const seconds = Math.max(0, Math.round((new Date(finish).getTime() - new Date(start).getTime()) / 1000))
  return `${seconds}s`
}

function metaNumber(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  return typeof value === 'number' ? value : '—'
}

function freshnessPercent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : '0%'
}

export default async function AdminPage() {
  try {
    const [data, opportunityRun, technicalRuns] = await Promise.all([
      getAdminDashboardData(),
      getLatestOpportunityAssessmentRun(),
      getTechnicalEngineRuns(),
    ])
    const latestAgeMinutes = data.latestObservationAt
      ? Math.max(0, Math.round((Date.now() - new Date(data.latestObservationAt).getTime()) / 60000))
      : null
    const health = data.failuresToday > 0 ? 'Warning' : latestAgeMinutes !== null && latestAgeMinutes > 90 ? 'Warning' : data.lastRun ? 'Healthy' : 'No data'

    const opportunityModel = opportunityRun
      ? `${opportunityRun.model_reported === 'unknown' ? 'Model not captured' : opportunityRun.model_reported}${opportunityRun.reasoning_level_reported ? ` · ${opportunityRun.reasoning_level_reported}` : ''}`
      : 'No audited runs yet'
    const technicalRun = technicalRuns[0] ?? null

    return (
      <div className="page">
        <header className="pageHeader">
          <div>
            <h1>Admin / Data Load Monitoring</h1>
            <p className="subtitle">Real-time overview of the market-data loading pipeline.</p>
          </div>
          <div className="headerActions">
            <span className="contextText">Live data on page refresh</span>
            <div className={`healthBadge ${health === 'Healthy' ? 'healthy' : health === 'Warning' ? 'warning' : ''}`}>
              <span className="healthDot" /> Loader Health: {health}
            </div>
          </div>
        </header>

        <section className="kpiGrid">
          <article className="kpi"><span>Last Load</span><strong>{fmtDate(data.lastRun?.started_at ?? null, false)}</strong><small>{data.lastRun ? fmtDate(data.lastRun.started_at).split(',')[0] : 'No runs loaded'}</small></article>
          <article className="kpi"><span>Last Successful</span><strong>{fmtDate(data.lastSuccessful?.finished_at ?? null, false)}</strong><small>{data.lastSuccessful ? 'Succeeded' : 'No successful run yet'}</small></article>
          <article className="kpi"><span>Loads Today</span><strong className="number">{data.loadsToday}</strong><small>Since midnight UTC</small></article>
          <article className="kpi"><span>Observations Today</span><strong className="number">{data.observationsToday}</strong><small>Inserted rows</small></article>
          <article className="kpi"><span>Failed / Partial Runs</span><strong className="number">{data.failuresToday}</strong><small>{data.failuresToday === 0 ? 'No issues today' : 'Review required'}</small></article>
          <article className="kpi"><span>Active Instruments</span><strong className="number">{data.activeInstruments}</strong><small>Currently tracked</small></article>
        </section>

        <section className="freshnessBar">
          <span>DATA FRESHNESS</span>
          <strong>Latest Market Observation: {fmtDate(data.latestObservationAt)}</strong>
          <small>{latestAgeMinutes === null ? 'No observations loaded' : `Age: ${latestAgeMinutes} min`}</small>
        </section>

        <section className="freshnessBar">
          <span>OPPORTUNITY ENGINE</span>
          <strong>{opportunityModel}</strong>
          <small>
            {opportunityRun
              ? `${opportunityRun.status} · ${opportunityRun.execution_source} · ${opportunityRun.themes_completed}/${opportunityRun.themes_requested} themes · Spec ${opportunityRun.github_spec_version ?? '—'} · ${fmtDate(opportunityRun.completed_at ?? opportunityRun.started_at)}`
              : 'Run telemetry will appear after the next Opportunity Assessment'}
          </small>
        </section>

        <section className="freshnessBar">
          <span>TECHNICAL ENGINE</span>
          <strong>
            {technicalRun
              ? `${technicalRun.status} · ${technicalRun.indicator_rows_upserted} indicators · ${technicalRun.score_rows_upserted} scores`
              : 'No monitored runs yet'}
          </strong>
          <small>
            {technicalRun
              ? `${technicalRun.execution_source} attempt ${technicalRun.attempt_number} · ${technicalRun.calculation_version ?? '—'} · ${technicalRun.methodology_version ?? '—'} · ${fmtDate(technicalRun.finished_at ?? technicalRun.started_at)}${technicalRun.error_message ? ` · ${technicalRun.error_message}` : ''}`
              : 'Daily 07:15 AWST; one bounded automatic retry at 07:45 AWST'}
          </small>
        </section>

        <section className="analyticsGrid adminAnalytics">
          <article className="panel analyticsPanel">
            <div className="panelHeader">
              <div><h2>Observations Inserted per Day</h2><p className="panelHint">Last 14 days</p></div>
            </div>
            <LoadChart data={data.daily} />
          </article>

          <aside className="panel freshnessPanel">
            <div className="panelHeader"><div><h2>Instrument Coverage</h2><p className="panelHint">By latest observation</p></div></div>
            <div className="freshnessList">
              <div><span>&lt; 15 min ago</span><strong className="toneGood">{data.freshness.under15} <small>{freshnessPercent(data.freshness.under15, data.activeInstruments)}</small></strong></div>
              <div><span>15 min – 1 hour</span><strong className="toneBlue">{data.freshness.under60} <small>{freshnessPercent(data.freshness.under60, data.activeInstruments)}</small></strong></div>
              <div><span>1 – 4 hours</span><strong className="toneWarn">{data.freshness.under240} <small>{freshnessPercent(data.freshness.under240, data.activeInstruments)}</small></strong></div>
              <div><span>&gt; 4 hours</span><strong>{data.freshness.over240} <small>{freshnessPercent(data.freshness.over240, data.activeInstruments)}</small></strong></div>
              {data.freshness.noObservation > 0 && <div><span>No observation yet</span><strong>{data.freshness.noObservation}</strong></div>}
            </div>
            <div className="freshnessTotal"><span>Total instruments</span><strong>{data.activeInstruments}</strong></div>
            <p className="panelNote">Freshness is informational. Equities and ETFs may be older while US markets are closed.</p>
          </aside>
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader">
            <div><h2>Technical Engine Run History</h2><p className="panelHint">Daily 07:15 AWST · automatic retry at 07:45 AWST · maximum three attempts</p></div>
          </div>
          <div className="tableScroll">
            <table>
              <thead>
                <tr><th>Started At</th><th>Status</th><th>Trigger / Attempt</th><th>Indicators</th><th>Scores</th><th>Complete / Partial</th><th>Versions</th><th>Duration</th><th>Error</th></tr>
              </thead>
              <tbody>
                {technicalRuns.length ? technicalRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{fmtDate(run.started_at)}</td>
                    <td><span className={`status status-${run.status}`}>{run.status}</span></td>
                    <td>{run.execution_source} / {run.attempt_number}</td>
                    <td className="numericCell">{run.indicator_rows_upserted}</td>
                    <td className="numericCell">{run.score_rows_upserted}</td>
                    <td>{run.complete_scores} / {run.partial_scores}</td>
                    <td>{run.calculation_version ?? '—'}<br /><small>{run.methodology_version ?? '—'}</small></td>
                    <td>{duration(run.started_at, run.finished_at)}</td>
                    <td className="errorCell">{run.error_message ?? '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={9}><div className="tableEmpty">No Technical Engine run history is visible yet.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader">
            <div><h2>Recent Load History</h2><p className="panelHint">Click a load to inspect execution details</p></div>
          </div>
          <div className="tableScroll">
            <table>
              <thead>
                <tr><th>Started At</th><th>Finished At</th><th>Status</th><th>Requested</th><th>Received</th><th>Inserted</th><th>Eligible</th><th>Skipped Out of Session</th><th>Duration</th><th>Error Message</th></tr>
              </thead>
              <tbody>
                {data.recentRuns.length ? data.recentRuns.slice(0, 12).map((run) => (
                  <tr key={run.id}>
                    <td><Link className="rowLink" href={`/admin/loads/${run.id}`}>{fmtDate(run.started_at)}</Link></td>
                    <td>{fmtDate(run.finished_at)}</td>
                    <td><span className={`status status-${run.status}`}>{run.status}</span></td>
                    <td className="numericCell">{run.requested_count}</td>
                    <td className="numericCell">{run.received_count}</td>
                    <td className="numericCell">{run.inserted_count}</td>
                    <td className="numericCell">{metaNumber(run.metadata, 'eligible_count')}</td>
                    <td className="numericCell">{metaNumber(run.metadata, 'skipped_out_of_session')}</td>
                    <td>{duration(run.started_at, run.finished_at)}</td>
                    <td className="errorCell">{run.error_message ?? '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={10}><div className="tableEmpty">No load history is visible yet. The dashboard will populate automatically when sync runs become available to the application.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <header className="pageHeader"><div><h1>Admin / Data Load Monitoring</h1><p className="subtitle">Real-time overview of the market-data loading pipeline.</p></div></header>
        <div className="errorState"><strong>Admin data is not available to the dashboard yet.</strong><span>{error instanceof Error ? error.message : 'The page structure is ready and will populate when data access is available.'}</span></div>
      </div>
    )
  }
}
