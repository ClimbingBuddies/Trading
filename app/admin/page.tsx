import Link from 'next/link'
import LoadChart from '@/components/LoadChart'
import { getAdminDashboardData } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

function fmtDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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

export default async function AdminPage() {
  const data = await getAdminDashboardData()
  const latestAgeMinutes = data.latestObservationAt
    ? Math.round((Date.now() - new Date(data.latestObservationAt).getTime()) / 60000)
    : null
  const health = data.failuresToday > 0 ? 'Warning' : latestAgeMinutes !== null && latestAgeMinutes > 90 ? 'Warning' : 'Healthy'

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">ADMIN</p>
          <h1>Data Load Monitoring</h1>
          <p className="subtitle">Twelve Data ingestion, refresh activity and recent loader health.</p>
        </div>
        <div className={`healthBadge ${health.toLowerCase()}`}>
          <span className="healthDot" />
          {health}
        </div>
      </header>

      <section className="freshnessBar">
        <span>Latest market observation</span>
        <strong>{fmtDate(data.latestObservationAt)}</strong>
        {latestAgeMinutes !== null && <small>{latestAgeMinutes} min ago</small>}
      </section>

      <section className="kpiGrid">
        <article className="kpi"><span>Last Load</span><strong>{fmtDate(data.lastRun?.started_at ?? null)}</strong><small>{data.lastRun?.status ?? 'No runs'}</small></article>
        <article className="kpi"><span>Last Successful Load</span><strong>{fmtDate(data.lastSuccessful?.finished_at ?? null)}</strong><small>Completed</small></article>
        <article className="kpi"><span>Loads Today</span><strong className="number">{data.loadsToday}</strong><small>Scheduled runs</small></article>
        <article className="kpi"><span>Observations Today</span><strong className="number">{data.observationsToday}</strong><small>Rows loaded</small></article>
        <article className="kpi"><span>Failed / Partial Today</span><strong className="number">{data.failuresToday}</strong><small>{data.failuresToday === 0 ? 'No issues' : 'Review required'}</small></article>
        <article className="kpi"><span>Active Instruments</span><strong className="number">{data.activeInstruments}</strong><small>Configured tickers</small></article>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div><p className="eyebrow">30 DAY VIEW</p><h2>Observations loaded per day</h2></div>
          <span className="muted">Inserted observations</span>
        </div>
        <LoadChart data={data.daily} />
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader">
          <div><p className="eyebrow">RECENT ACTIVITY</p><h2>Load history</h2></div>
          <span className="muted">Click a row for details</span>
        </div>
        <div className="tableScroll">
          <table>
            <thead>
              <tr>
                <th>Started</th><th>Finished</th><th>Status</th><th>Requested</th><th>Received</th><th>Inserted</th><th>Eligible</th><th>Skipped</th><th>Duration</th><th>Error</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRuns.map((run) => (
                <tr key={run.id}>
                  <td><Link className="rowLink" href={`/admin/loads/${run.id}`}>{fmtDate(run.started_at)}</Link></td>
                  <td>{fmtDate(run.finished_at)}</td>
                  <td><span className={`status status-${run.status}`}>{run.status}</span></td>
                  <td>{run.requested_count}</td>
                  <td>{run.received_count}</td>
                  <td>{run.inserted_count}</td>
                  <td>{metaNumber(run.metadata, 'eligible_count')}</td>
                  <td>{metaNumber(run.metadata, 'skipped_out_of_session')}</td>
                  <td>{duration(run.started_at, run.finished_at)}</td>
                  <td className="errorCell">{run.error_message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
