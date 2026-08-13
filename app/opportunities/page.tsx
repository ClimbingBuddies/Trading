import OpportunityCarousel from '@/components/OpportunityCarousel'
import { getCachedOpportunityOverview } from '@/lib/opportunity-cache'
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
    const data = await getCachedOpportunityOverview()

    return (
      <div className={`page ${styles.opportunityPage} ${styles.opportunityOverviewPage}`}>
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
