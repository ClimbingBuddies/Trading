import Link from 'next/link'
import AssessmentDonut from '@/components/AssessmentDonut'
import { getAssessmentsData, type AssessmentRow } from '@/lib/dashboard'
import { describeAssessmentSnapshot } from '@/lib/assessment-snapshot-status.mjs'

export const dynamic = 'force-dynamic'

function fmtDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00Z`))
}

function symbolSlug(symbol: string) {
  return symbol.replaceAll('/', '-').toLowerCase()
}

function fmtScore(value: number | null) {
  return value === null ? '—' : Number(value).toFixed(1)
}

function fmtLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function convictionRow(row: AssessmentRow, index: number) {
  return (
    <Link className="convictionRow" href={`/assessments/${symbolSlug(row.symbol)}`} key={row.assessment_id}>
      <span className="rankBadge">{index + 1}</span>
      <strong>{row.symbol}</strong>
      <span>{row.rating}</span>
      <span className="convictionScore">{row.confidence ?? '—'}%</span>
      <span>{row.score ?? '—'}</span>
    </Link>
  )
}

export default async function AssessmentsPage() {
  try {
    const data = await getAssessmentsData()
    const buy = data.distribution.find((item) => item.rating.toLowerCase() === 'buy')?.count ?? 0
    const hold = data.distribution.find((item) => item.rating.toLowerCase() === 'hold')?.count ?? 0
    const other = Math.max(0, data.rows.length - buy - hold)
    const convergenceCoverage = data.rows.filter((row) => row.convergence).length
    const now = Date.now()
    const snapshots = new Map(data.rows.map((row) => [row.assessment_id, describeAssessmentSnapshot(row, now)]))
    const matchingCoverage = [...snapshots.values()].filter((snapshot) => snapshot.matchesDisplayedAI).length
    const unmatchedCoverage = convergenceCoverage - matchingCoverage

    return (
      <div className="page">
        <header className="pageHeader">
          <div>
            <h1>Assessments / Market Overview</h1>
            <p className="subtitle">Saved Technical and AI research with dated Market Convergence history.</p>
          </div>
          <div className="headerActions">
            {data.latestRun ? <><span className="contextText">Latest run: {data.latestRun.status}</span><span className={`status status-${data.latestRun.status}`}>{data.latestRun.status}</span></> : <span className="contextText">No assessment run loaded</span>}
          </div>
        </header>

        <section className="signalSourceGrid" aria-label="Market signal sources">
          <article className="signalSourceCard technicalSource"><span>Technical Engine</span><strong>{convergenceCoverage} saved snapshots</strong><small>Historical Technical inputs captured by Convergence; check their dates.</small></article>
          <article className="signalSourceCard aiSource"><span>AI Market Assessment</span><strong>{data.rows.length} saved results</strong><small>Latest saved research set; availability does not establish freshness.</small></article>
          <article className="signalSourceCard convergenceSource"><span>Market Convergence</span><strong>{matchingCoverage} match displayed AI</strong><small>{unmatchedCoverage} other saved snapshots. A source match does not establish a current signal.</small></article>
        </section>

        {data.rows.length > 0 && <div className="dataQualityCallout" role="status">
          <strong>Saved research — check source dates before use</strong>
          <span>Age is measured in New York calendar days, not trading sessions. Different or unverified AI inputs are labelled separately; they are not a combined view of the displayed assessment. Model confidence is not a verified prediction success rate.</span>
        </div>}

        <section className="kpiGrid">
          <article className="kpi"><span>Latest Assessment</span><strong>{fmtDate(data.latestDate)}</strong><small>Latest assessment date</small></article>
          <article className="kpi"><span>Instruments Assessed</span><strong className="number">{data.rows.length}</strong><small>Latest assessment set</small></article>
          <article className="kpi"><span>Buy</span><strong className="number toneGood">{buy}</strong><small>Saved rating, not a new call</small></article>
          <article className="kpi"><span>Hold</span><strong className="number toneBlue">{hold}</strong><small>Saved rating, not a new call</small></article>
          <article className="kpi"><span>Other Ratings</span><strong className="number">{other}</strong><small>Dynamic categories</small></article>
          <article className="kpi"><span>Average Confidence</span><strong className="number">{data.averageConfidence === null ? '—' : `${Math.round(data.averageConfidence)}%`}</strong><small>Latest assessment set</small></article>
        </section>

        {data.latestRun && data.latestRun.status === 'running' && data.rows.length > 0 && (
          <div className="dataQualityCallout">
            <strong>Run status needs attention</strong>
            <span>The latest run is still marked “running” even though assessment records are available. Results are shown without relabelling the run as completed.</span>
          </div>
        )}

        <section className="assessmentGrid">
          <article className="panel assessmentPanel">
            <div className="panelHeader"><div><h2>AI Ratings Distribution</h2><p className="panelHint">GPT rating categories from the latest independent AI assessment set.</p></div></div>
            <AssessmentDonut data={data.distribution} />
          </article>

          <article className="panel assessmentPanel">
            <div className="panelHeader"><div><h2>Highest Saved AI Confidence</h2><p className="panelHint">Historical results ranked by reported confidence, then score. This is not a current Buy shortlist.</p></div></div>
            <div className="convictionList">
              {data.highest.length ? data.highest.map(convictionRow) : <div className="emptyCompact">No assessments loaded yet.</div>}
            </div>
          </article>

          <article className="panel assessmentPanel">
            <div className="panelHeader"><div><h2>Lowest Saved AI Confidence</h2><p className="panelHint">Lowest saved model confidence, without inferring a bearish rating.</p></div></div>
            <div className="convictionList">
              {data.lowest.length ? data.lowest.map(convictionRow) : <div className="emptyCompact">No assessments loaded yet.</div>}
            </div>
          </article>
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader"><div><h2>Saved Signal Comparison</h2><p className="panelHint">Each column is a dated saved result. Convergence is linked to an exact AI assessment, which may differ from the one displayed here.</p></div></div>
          <div className="tableScroll">
            <table>
              <thead><tr><th>Symbol</th><th>Technical Engine</th><th>AI Market Assessment</th><th>Market Convergence</th><th>AI Summary</th></tr></thead>
              <tbody>
                {data.rows.length ? data.rows.map((row) => {
                  const snapshot = snapshots.get(row.assessment_id)!
                  return (
                  <tr key={row.assessment_id}>
                    <td><Link className="rowLink" href={`/assessments/${symbolSlug(row.symbol)}`}>{row.symbol}</Link></td>
                    <td><div className="signalTableCell"><span className="sourceBadge technicalBadge">Saved Technical snapshot</span><strong>{row.convergence ? `${fmtLabel(row.convergence.technical_signal)} · ${fmtScore(row.convergence.technical_score)}` : 'Not available'}</strong><small>{row.convergence ? `${fmtScore(row.convergence.technical_confidence)}% confidence · Convergence dated ${fmtDate(row.convergence.assessment_date)}` : 'No saved Convergence source snapshot'}</small><small>{row.convergence ? snapshot.sourceLabel : ''}</small></div></td>
                    <td><div className="signalTableCell"><span className="sourceBadge aiBadge">Saved AI assessment</span><strong>{row.rating} · {fmtScore(row.score)} / 100</strong><small>{row.confidence === null ? 'Confidence unavailable' : `${row.confidence}% confidence`} · {fmtDate(row.assessment_date)}</small><small>{snapshot.ai.label}</small></div></td>
                    <td><div className="signalTableCell"><span className="sourceBadge convergenceBadge">{row.convergence ? snapshot.sourceLabel : 'Convergence'}</span><strong>{row.convergence ? `${fmtLabel(row.convergence.convergence_label)} · ${fmtScore(row.convergence.convergence_score)}` : 'Not available'}</strong><small>{row.convergence ? `${fmtScore(row.convergence.convergence_confidence)}% confidence · ${fmtDate(row.convergence.assessment_date)}` : 'Requires eligible Technical and AI inputs'}</small><small>{snapshot.convergence?.label}</small></div></td>
                    <td className="summaryCell">{row.summary ?? '—'}</td>
                  </tr>
                )}) : <tr><td colSpan={5}><div className="tableEmpty">No assessment data has been loaded yet. The dashboard layout is ready and will populate automatically.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <header className="pageHeader"><div><h1>Assessments / Market Overview</h1><p className="subtitle">Independent Technical and AI results, plus their persisted Market Convergence output.</p></div></header>
        <div className="errorState"><strong>Assessment data is not available to the dashboard yet.</strong><span>{error instanceof Error ? error.message : 'The page is ready and will populate when assessment data becomes available.'}</span></div>
      </div>
    )
  }
}
