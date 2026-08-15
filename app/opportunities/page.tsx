import OpportunityCarousel from '@/components/OpportunityCarousel'
import { getCachedOpportunityOverview } from '@/lib/opportunity-cache'
import { getOpportunityDailySummary } from '@/lib/opportunity-daily-summary'
import styles from './opportunities.module.css'
import dailyStyles from './opportunity-daily-status.module.css'

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

function fmtRunDateTime(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  const day = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return `${day} · ${time} AWST`
}

function fmtRunTime(value: string | null | undefined) {
  if (!value) return '—'
  return `${new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))} AWST`
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

function runStatusLabel(status: string) {
  if (status === 'succeeded') return 'Complete'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export default async function OpportunitiesPage() {
  try {
    const [data, daily] = await Promise.all([
      getCachedOpportunityOverview(),
      getOpportunityDailySummary(),
    ])
    const runCompleted = fmtRunDateTime(daily.latestRun?.completed_at)

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
            <small>{runCompleted ? `Last assessment ${runCompleted}` : `As at ${fmtDate(data.latestDate)}`}</small>
          </div>
        </header>

        {daily.latestRun && (
          <section className={dailyStyles.dailyStrip} aria-label="Latest daily opportunity assessment status">
            <div className={dailyStyles.dailyStripLead}>
              <span className={dailyStyles.dailyStripLeadIcon} aria-hidden="true">{daily.latestRun.status === 'succeeded' ? '✓' : '!'}</span>
              <div>
                <span>{daily.isToday ? "Today's assessment" : 'Latest assessment'}</span>
                <strong className={daily.latestRun.status === 'succeeded' ? dailyStyles.runStatusSuccess : dailyStyles.runStatusWarning}>{runStatusLabel(daily.latestRun.status)}</strong>
              </div>
            </div>
            <div className={dailyStyles.dailyMetrics}>
              <div className={dailyStyles.dailyMetric}><span>Assessed</span><strong>{daily.assessedCount}/{daily.latestRun.themes_requested ?? data.rows.length} opportunities</strong></div>
              <div className={dailyStyles.dailyMetric}><span>Score changes</span><strong>{daily.scoreChangedCount}</strong></div>
              <div className={dailyStyles.dailyMetric}><span>New events</span><strong>{daily.newEventCount}</strong></div>
              <div className={dailyStyles.dailyMetric}><span>Evidence refreshed</span><strong>{daily.evidenceRefreshedCount} sets</strong></div>
              <div className={dailyStyles.dailyMetric}><span>Completed</span><strong>{fmtRunTime(daily.latestRun.completed_at)}</strong></div>
            </div>
          </section>
        )}

        <OpportunityCarousel rows={data.rows} dailyByTheme={daily.byTheme} latestRunIsToday={daily.isToday} />
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
