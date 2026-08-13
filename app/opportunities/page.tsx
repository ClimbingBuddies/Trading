import Link from 'next/link'
import OpportunityCarousel from '@/components/OpportunityCarousel'
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

function symbolSlug(symbol: string) {
  return symbol.replaceAll('/', '-').toLowerCase()
}

function toneClass(index: number) {
  return index % 3 === 0 ? styles.tone0 : index % 3 === 1 ? styles.tone1 : styles.tone2
}

function scoreLevel(score: number | null) {
  if (score === null) return 'Unrated'
  if (score >= 85) return 'Transformational'
  if (score >= 70) return 'Major'
  if (score >= 55) return 'High'
  if (score >= 35) return 'Watch'
  return 'Emerging'
}

export default async function OpportunitiesPage() {
  try {
    const data = await getOpportunityOverview()

    return (
      <div className={`page ${styles.opportunityPage}`}>
        <div className={styles.crumbs}><strong>Opportunities</strong><span>/</span><span>Overview</span></div>

        <header className={styles.overviewHeader}>
          <div>
            <h1>Opportunity Assessment</h1>
            <p>Long-term discovery, not a Buy/Sell signal.</p>
          </div>
          <div className={styles.overallScore}>
            <span>Average Opportunity Score</span>
            <div><strong>{fmtScore(data.averageScore)}</strong><small>/100</small></div>
            <em>{scoreLevel(data.averageScore)}</em>
            <small>As at {fmtDate(data.latestDate)}</small>
          </div>
        </header>

        <OpportunityCarousel rows={data.rows} />

        <section className={styles.darkTablePanel}>
          <div className={styles.sectionHeading}>
            <div><h2>All Opportunities</h2><p>Ranked long-term themes using the latest independent Opportunity Assessment.</p></div>
            <span>{data.rows.length} themes</span>
          </div>
          <div className={styles.darkTableScroll}>
            <table className={styles.darkTable}>
              <thead>
                <tr><th>Theme</th><th>Score</th><th>Horizon</th><th>Top Exposed Tickers</th><th>Action</th></tr>
              </thead>
              <tbody>
                {data.rows.length ? data.rows.map((row, index) => (
                  <tr key={row.theme.id}>
                    <td>
                      <div className={styles.tableTheme}>
                        <span className={`${styles.tableThemeIcon} ${toneClass(index)}`}>{index % 3 === 0 ? '◇' : index % 3 === 1 ? '⌁' : '▣'}</span>
                        <div><Link href={themeHref(row.theme.theme_code)}>{row.theme.theme_name}</Link><small>{row.latest?.opportunity_level?.replaceAll('_', ' ') ?? row.theme.status}</small></div>
                      </div>
                    </td>
                    <td><div className={styles.tableScore}><strong>{fmtScore(row.latest?.opportunity_score)}</strong><span>/100</span></div></td>
                    <td>{row.latest?.time_horizon ?? (row.theme.horizon_years_min != null && row.theme.horizon_years_max != null ? `${row.theme.horizon_years_min}–${row.theme.horizon_years_max} years` : '—')}</td>
                    <td>
                      <div className={styles.tickerRow}>
                        {row.exposures.slice(0, 4).map((exposure) => exposure.instruments?.symbol ? (
                          <Link key={`${row.theme.id}-${exposure.instrument_id}`} className={styles.tickerChip} href={`/markets/${symbolSlug(exposure.instruments.symbol)}`}>
                            {exposure.instruments.symbol}<span>{fmtScore(exposure.exposure_score)}</span>
                          </Link>
                        ) : null)}
                        {!row.exposures.length && <span className={styles.noTicker}>—</span>}
                      </div>
                    </td>
                    <td><Link className={styles.viewButton} href={themeHref(row.theme.theme_code)}>View details <span>›</span></Link></td>
                  </tr>
                )) : (
                  <tr><td colSpan={5}><div className={styles.darkEmpty}>No Opportunity themes exist yet.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className={`page ${styles.opportunityPage}`}>
        <header className={styles.overviewHeader}><div><h1>Opportunity Assessment</h1><p>Long-term discovery, not a Buy/Sell signal.</p></div></header>
        <div className={styles.darkEmpty}><strong>Opportunity Assessment data is not available yet.</strong><span>{error instanceof Error ? error.message : 'The page will populate when Supabase data is accessible.'}</span></div>
      </div>
    )
  }
}
