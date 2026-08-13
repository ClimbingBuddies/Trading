import Link from 'next/link'
import { getOpportunityOverview } from '@/lib/opportunities'
import styles from './opportunities.module.css'

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

function fmtScore(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : Math.round(value).toString()
}

function themeHref(code: string) {
  return `/opportunities/${encodeURIComponent(code.toLowerCase())}`
}

export default async function OpportunitiesPage() {
  try {
    const data = await getOpportunityOverview()
    const withAssessment = data.rows.filter((row) => row.latest)
    const exposureTotal = data.rows.reduce((sum, row) => sum + row.exposureCount, 0)

    return (
      <div className="page">
        <header className="pageHeader">
          <div>
            <h1>Opportunity Assessment</h1>
            <p className="subtitle">Long-term structural change and technology inflection — independent from the short-term Market Assessment.</p>
          </div>
          <div className="headerActions">
            <span className="contextText">Latest assessment: {fmtDate(data.latestDate)}</span>
          </div>
        </header>

        <section className={styles.heroGrid}>
          <article className={styles.heroCard}><span>Opportunity Themes</span><strong>{data.rows.length}</strong><small>Active and watch themes</small></article>
          <article className={styles.heroCard}><span>Assessed Themes</span><strong>{withAssessment.length}</strong><small>Latest Opportunity Assessment available</small></article>
          <article className={styles.heroCard}><span>Average Opportunity</span><strong>{data.averageScore === null ? '—' : Math.round(data.averageScore)}</strong><small>0–100 across assessed themes</small></article>
          <article className={styles.heroCard}><span>Major / Transformational</span><strong>{data.majorCount}</strong><small>Highest long-term opportunity levels</small></article>
        </section>

        <section className={styles.layoutGrid}>
          <article className="panel">
            <div className="panelHeader"><div><h2>Highest Opportunity Convergence</h2><p className="panelHint">Structural opportunity and technology inflection combined only after both are assessed independently.</p></div></div>
            {data.highest.length ? (
              <div className={styles.themeGrid}>
                {data.highest.map((row) => (
                  <Link className={styles.themeCard} href={themeHref(row.theme.theme_code)} key={row.theme.id}>
                    <div className={styles.themeCardHeader}>
                      <div><h3>{row.theme.theme_name}</h3><span className={styles.levelPill}>{row.latest?.opportunity_level ?? 'unrated'}</span></div>
                      <div className={styles.themeScore}>{fmtScore(row.latest?.opportunity_score)}</div>
                    </div>
                    <p>{row.latest?.summary ?? row.theme.description ?? 'Assessment detail will appear after the scheduled Opportunity Assessment runs.'}</p>
                    <div className={styles.themeMeta}>
                      <span>Structural {fmtScore(row.latest?.structural_score)}</span>
                      <span>Technology {fmtScore(row.latest?.technology_inflection_score)}</span>
                      <span>Confidence {row.latest?.opportunity_confidence == null ? '—' : `${Math.round(row.latest.opportunity_confidence)}%`}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <div className="emptyCompact">No Opportunity Assessments have been created yet. The dashboard is ready for the first scheduled run.</div>}
          </article>

          <article className="panel">
            <div className="panelHeader"><div><h2>Assessment Model</h2><p className="panelHint">Long-term discovery, not a Buy/Sell signal.</p></div></div>
            <div className={styles.signalGrid} style={{ gridTemplateColumns: '1fr' }}>
              <div className={styles.signalCard}>
                <span>Structural Opportunity</span>
                <h3>Real-world adoption</h3>
                <p>Demand, adoption, capital investment, capacity constraints and improving economics.</p>
              </div>
              <div className={styles.signalCard}>
                <span>Technology Inflection</span>
                <h3>Bottleneck unlock</h3>
                <p>Evidence that a limiting technical constraint is becoming materially easier to solve and commercialise.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader"><div><h2>All Opportunity Themes</h2><p className="panelHint">Open a theme for signal drill-through, exposure, history, technology events and Research &amp; Evidence.</p></div><span className="contextText">{exposureTotal} linked exposures</span></div>
          <div className="tableScroll">
            <table>
              <thead><tr><th>Theme</th><th>Opportunity</th><th>Level</th><th>Structural</th><th>Technology</th><th>Confidence</th><th>Readiness</th><th>Exposure</th><th>Date</th></tr></thead>
              <tbody>
                {data.rows.length ? data.rows.map((row) => (
                  <tr key={row.theme.id}>
                    <td><Link className="rowLink" href={themeHref(row.theme.theme_code)}>{row.theme.theme_name}</Link><div className="contextText">{row.theme.theme_code}</div></td>
                    <td className="numericCell"><strong>{fmtScore(row.latest?.opportunity_score)}</strong></td>
                    <td>{row.latest?.opportunity_level ? <span className={styles.levelPill}>{row.latest.opportunity_level}</span> : '—'}</td>
                    <td className="numericCell">{fmtScore(row.latest?.structural_score)}</td>
                    <td className="numericCell">{fmtScore(row.latest?.technology_inflection_score)}</td>
                    <td className="numericCell">{row.latest?.opportunity_confidence == null ? '—' : `${Math.round(row.latest.opportunity_confidence)}%`}</td>
                    <td>{row.latest?.commercial_readiness ?? '—'}</td>
                    <td className="numericCell">{row.exposureCount}</td>
                    <td>{fmtDate(row.latest?.assessment_date ?? null)}</td>
                  </tr>
                )) : <tr><td colSpan={9}><div className="tableEmpty">No Opportunity Themes exist yet. The daily task can create themes when credible long-term opportunities are identified.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <header className="pageHeader"><div><h1>Opportunity Assessment</h1><p className="subtitle">Long-term structural change and technology inflection.</p></div></header>
        <div className="errorState"><strong>Opportunity Assessment data is not available to the dashboard yet.</strong><span>{error instanceof Error ? error.message : 'The page will populate when Supabase data is accessible.'}</span></div>
      </div>
    )
  }
}
