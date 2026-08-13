import Link from 'next/link'
import { notFound } from 'next/navigation'
import OpportunityThemeSelect from '@/components/OpportunityThemeSelect'
import { getOpportunityDetail } from '@/lib/opportunities'
import styles from '../opportunities.module.css'

export const dynamic = 'force-dynamic'

type OpportunityDetailData = NonNullable<Awaited<ReturnType<typeof getOpportunityDetail>>>
type DetailView = 'overview' | 'investment-case' | 'synergies' | 'exposure' | 'events' | 'ai-recommendation'

const DETAIL_TABS: Array<{ key: DetailView; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'investment-case', label: 'Investment Case' },
  { key: 'synergies', label: 'Synergies' },
  { key: 'exposure', label: 'Exposure' },
  { key: 'events', label: 'Events' },
  { key: 'ai-recommendation', label: 'AI Recommendation' },
]

function fmtDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

function fmtScore(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : Math.round(value).toString()
}

function titleCase(value: string | null | undefined) {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function symbolSlug(symbol: string) {
  return symbol.replaceAll('/', '-').toLowerCase()
}

function themeHref(code: string) {
  return `/opportunities/${encodeURIComponent(code.toLowerCase())}`
}

function normalizeView(value: string | string[] | undefined): DetailView {
  const candidate = Array.isArray(value) ? value[0] : value
  return DETAIL_TABS.some((tab) => tab.key === candidate) ? candidate as DetailView : 'overview'
}

function cleanSummary(value: string | null | undefined) {
  if (!value) return ''
  const withoutMarkdownUrls = value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
  const beforeSources = withoutMarkdownUrls.split(/\b(?:Supporting evidence|Evidence):/i)[0]
  return beforeSources.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim()
}

function shortText(value: string | null | undefined, max = 160) {
  const text = cleanSummary(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function getEvidenceItems(data: OpportunityDetailData) {
  const sources = data.latestStructural?.evidence_summary?.sources
  if (!Array.isArray(sources)) return []
  return sources.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const evidence = typeof record.evidence === 'string' ? record.evidence : null
    const sourceName = typeof record.source_name === 'string' ? record.source_name : null
    const sourceUrl = typeof record.source_url === 'string' ? record.source_url : null
    if (!evidence && !sourceName) return []
    return [{ evidence, sourceName, sourceUrl }]
  })
}

function extractRisks(text: string | null | undefined) {
  if (!text) return []
  const match = text.match(/Risks include\s+(.+?)(?:\.\s|\n|$)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(/,\s*/)
    .map((item) => item.replace(/^and\s+/i, '').trim())
    .filter(Boolean)
}

function sourceEmbeds(data: OpportunityDetailData) {
  return data.researchEmbeds.filter((embed) => Boolean(embed.source_url) && ['article', 'external_link', 'evidence'].includes(embed.embed_type))
}

function confidenceLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Unrated'
  if (value >= 90) return 'Very High'
  if (value >= 80) return 'High'
  if (value >= 65) return 'Moderate'
  return 'Developing'
}

function recommendationHeadline(score: number | null | undefined, confidence: number | null | undefined) {
  if ((score ?? 0) >= 85 && (confidence ?? 0) >= 80) return 'High-conviction opportunity to monitor'
  if ((score ?? 0) >= 70) return 'Strong long-term opportunity to monitor'
  if ((score ?? 0) >= 55) return 'Developing opportunity worth monitoring'
  return 'Emerging opportunity to watch'
}

function priorityLabel(score: number | null | undefined) {
  if ((score ?? 0) >= 85) return { value: 'High', note: 'Top Tier' }
  if ((score ?? 0) >= 70) return { value: 'Medium', note: 'Priority Watch' }
  return { value: 'Watch', note: 'Developing' }
}

function TopExposureStrip({ data }: { data: OpportunityDetailData }) {
  return (
    <section className={styles.exposureStrip}>
      <div><strong>Top Exposed Instruments</strong><span>Opportunity exposure scores, not Buy/Sell signals.</span></div>
      <div className={styles.exposureStripTickers}>
        {data.exposures.slice(0, 5).map((exposure) => exposure.instruments?.symbol ? (
          <Link href={`/markets/${symbolSlug(exposure.instruments.symbol)}`} key={`${exposure.instrument_id}-${exposure.exposure_type}`}>
            <strong>{exposure.instruments.symbol}</strong><span>{fmtScore(exposure.exposure_score)}</span>
          </Link>
        ) : null)}
        {!data.exposures.length && <span className={styles.noTicker}>No tracked exposure mapped yet</span>}
      </div>
      {data.exposures.length > 0 && <Link className={styles.inlineAction} href={`${themeHref(data.theme.theme_code)}?view=exposure`}>View exposure ›</Link>}
    </section>
  )
}

function SourceChips({ data }: { data: OpportunityDetailData }) {
  const sources = sourceEmbeds(data).slice(0, 4)
  if (!sources.length) return null
  return (
    <div className={styles.sourceChips}>
      <span>Key sources</span>
      {sources.map((source) => (
        <a href={source.source_url ?? '#'} target="_blank" rel="noreferrer" key={source.id}>{source.source_name ?? source.title ?? 'Source'} ↗</a>
      ))}
    </div>
  )
}

function DetailTabs({ data, view }: { data: OpportunityDetailData; view: DetailView }) {
  const base = themeHref(data.theme.theme_code)
  return (
    <nav className={styles.detailTabs} aria-label="Opportunity analysis views">
      {DETAIL_TABS.map((tab) => (
        <Link
          key={tab.key}
          className={view === tab.key ? styles.detailTabActive : styles.detailTab}
          href={tab.key === 'overview' ? base : `${base}?view=${tab.key}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

function OverviewView({ data }: { data: OpportunityDetailData }) {
  if (!data.latest) return <div className={styles.darkEmpty}>No Opportunity Assessment has been created for this theme yet.</div>

  return (
    <>
      <section className={styles.summarySignalGrid}>
        <article className={styles.signalSummaryCard}>
          <div className={`${styles.roundIcon} ${styles.blueIcon}`}>⌂</div>
          <div><span>Structural Opportunity</span><h2>Real-world adoption</h2><p>{shortText(data.latestStructural?.summary, 190) || 'Structural assessment detail is not available yet.'}</p></div>
          <div className={styles.signalSummaryScore}><strong>{fmtScore(data.latestStructural?.overall_score ?? data.latest.structural_score)}</strong><span>/100</span><small>{titleCase(data.latestStructural?.signal_label)}</small></div>
        </article>
        <article className={styles.signalSummaryCard}>
          <div className={`${styles.roundIcon} ${styles.purpleIcon}`}>◇</div>
          <div><span>Technology Inflection</span><h2>Bottleneck unlock</h2><p>{shortText(data.latestTechnology?.summary, 190) || 'Technology assessment detail is not available yet.'}</p></div>
          <div className={styles.signalSummaryScore}><strong>{fmtScore(data.latestTechnology?.overall_score ?? data.latest.technology_inflection_score)}</strong><span>/100</span><small>{titleCase(data.latestTechnology?.signal_label)}</small></div>
        </article>
        <article className={styles.signalSummaryCard}>
          <div className={`${styles.roundIcon} ${styles.greenIcon}`}>◎</div>
          <div><span>Opportunity Convergence</span><h2>Signals aligned</h2><p>{shortText(data.latest.summary, 190) || 'Combined Opportunity Assessment summary is not available yet.'}</p></div>
          <div className={styles.signalSummaryScore}><strong>{fmtScore(data.latest.opportunity_score)}</strong><span>/100</span><small>{titleCase(data.latest.opportunity_level)}</small></div>
        </article>
      </section>

      <section className={styles.overviewContentGrid}>
        <article className={styles.darkCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.blueIcon}`}>i</span><div><h2>Why this matters</h2><p>Plain-language investment context</p></div></div>
          <p className={styles.leadText}>{data.theme.description ?? cleanSummary(data.latest.summary)}</p>
          {data.latestTechnology?.unlock_description && <p>{data.latestTechnology.unlock_description}</p>}
          <SourceChips data={data} />
        </article>
        <article className={styles.darkCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.purpleIcon}`}>◷</span><div><h2>Current profile</h2><p>Latest assessment measures</p></div></div>
          <div className={styles.profileMeasures}>
            <div><span>Confidence</span><strong>{data.latest.opportunity_confidence == null ? '—' : `${Math.round(data.latest.opportunity_confidence)}%`}</strong><small>{confidenceLabel(data.latest.opportunity_confidence)}</small></div>
            <div><span>Readiness</span><strong>{titleCase(data.latest.commercial_readiness)}</strong><small>{titleCase(data.latestTechnology?.maturity_stage)}</small></div>
            <div><span>Horizon</span><strong>{data.latest.time_horizon ?? '—'}</strong><small>Long-term theme</small></div>
          </div>
        </article>
      </section>

      <TopExposureStrip data={data} />
    </>
  )
}

function InvestmentCaseView({ data }: { data: OpportunityDetailData }) {
  if (!data.latest) return <div className={styles.darkEmpty}>No Investment Case can be shown until an Opportunity Assessment exists.</div>
  const evidence = getEvidenceItems(data)
  const risks = extractRisks(data.researchDocument?.plain_text)
  const drivers = [
    ...evidence.map((item) => item.evidence).filter((item): item is string => Boolean(item)),
    data.latestTechnology?.unlock_description,
  ].filter((item): item is string => Boolean(item)).slice(0, 5)

  return (
    <>
      <section className={styles.threeColumnGrid}>
        <article className={styles.caseCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.blueIcon}`}>▤</span><h2>Investment Thesis</h2></div>
          <p className={styles.caseThesis}>{cleanSummary(data.latest.summary) || data.theme.description}</p>
          {data.latestTechnology?.unlock_description && <p>{data.latestTechnology.unlock_description}</p>}
        </article>
        <article className={styles.caseCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.greenIcon}`}>↗</span><h2>Key Drivers</h2></div>
          {drivers.length ? <ul className={`${styles.caseList} ${styles.positiveList}`}>{drivers.map((driver, index) => <li key={index}>{driver}</li>)}</ul> : <div className={styles.darkEmpty}>No driver evidence has been stored yet.</div>}
        </article>
        <article className={styles.caseCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.orangeIcon}`}>!</span><h2>Key Risks</h2></div>
          {risks.length ? <ul className={`${styles.caseList} ${styles.riskList}`}>{risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul> : <p>{data.latestTechnology?.bottleneck ?? 'No explicit risk summary has been stored yet.'}</p>}
        </article>
      </section>

      <section className={styles.readinessBand}>
        <div className={`${styles.roundIcon} ${styles.purpleIcon}`}>◷</div>
        <div><span>Time Horizon</span><strong>{data.latest.time_horizon ?? '—'}</strong><small>{data.theme.horizon_years_min != null && data.theme.horizon_years_max != null ? `Theme range ${data.theme.horizon_years_min}–${data.theme.horizon_years_max} years` : 'Long-term opportunity'}</small></div>
        <div className={styles.bandDivider} />
        <div><span>Commercial Readiness</span><strong>{titleCase(data.latest.commercial_readiness)}</strong><small>{titleCase(data.latestTechnology?.maturity_stage)}</small></div>
      </section>

      <TopExposureStrip data={data} />
    </>
  )
}

function SynergiesView({ data }: { data: OpportunityDetailData }) {
  const linkedSymbols: string[] = Array.from(new Set(data.exposures.map((exposure) => exposure.instruments?.symbol).filter((symbol): symbol is string => Boolean(symbol))))

  return (
    <>
      <section className={styles.sectionIntro}>
        <h2>Synergy Landscape</h2>
        <p>Related active opportunities identified through shared tracked instrument exposure. This is a real-data relationship view, not a manually invented theme map.</p>
      </section>

      {data.relatedThemes.length ? (
        <section className={styles.synergyGrid}>
          {data.relatedThemes.map((related, index) => (
            <Link className={styles.synergyCard} href={themeHref(related.theme.theme_code)} key={related.theme.id}>
              <div className={styles.synergyTop}>
                <span className={`${styles.roundIcon} ${index % 2 === 0 ? styles.greenIcon : styles.cyanIcon}`}>{index % 2 === 0 ? '⌁' : '≋'}</span>
                <div><h3>{related.theme.theme_name}</h3><span>{related.sharedExposures.length} shared tracked {related.sharedExposures.length === 1 ? 'instrument' : 'instruments'}</span></div>
                <div className={styles.synergyScore}><strong>{fmtScore(related.latest?.opportunity_score)}</strong><span>/100</span></div>
              </div>
              <p>{related.theme.description ?? cleanSummary(related.latest?.summary)}</p>
              <div className={styles.tickerRow}>
                {related.sharedExposures.map((shared) => <span className={styles.tickerChip} key={shared.symbol}>{shared.symbol}<span>{fmtScore(shared.relatedExposureScore)}</span></span>)}
              </div>
            </Link>
          ))}
        </section>
      ) : <div className={styles.darkEmpty}>No other active Opportunity theme currently shares a tracked instrument with this theme.</div>}

      <section className={styles.whyMattersBand}>
        <span className={`${styles.smallIcon} ${styles.blueIcon}`}>☆</span>
        <div><h3>Why this matters</h3><p>{data.relatedThemes.length ? `${data.theme.theme_name} currently overlaps with ${data.relatedThemes.map((row) => row.theme.theme_name).join(', ')} through shared instrument exposure. Shared beneficiaries can help show where long-term themes reinforce or concentrate portfolio exposure.` : 'As more themes and exposure mappings are added, this view will surface real overlaps and concentration across the Opportunity universe.'}</p></div>
      </section>

      <section className={styles.linkedTickerBand}>
        <div><strong>Linked Tickers</strong><span>Current tracked exposure for this theme.</span></div>
        <div className={styles.tickerRow}>{linkedSymbols.map((symbol) => <Link className={styles.tickerChip} href={`/markets/${symbolSlug(symbol)}`} key={symbol}>{symbol}</Link>)}</div>
      </section>
    </>
  )
}

function ExposureView({ data }: { data: OpportunityDetailData }) {
  const top = data.exposures[0]
  const exposureTypes = Array.from(new Set(data.exposures.map((row) => titleCase(row.exposure_type))))

  return (
    <>
      <section className={styles.sectionIntro}>
        <h2>Top Exposed Instruments</h2>
        <p>Companies and ETFs with the greatest mapped exposure to this long-term theme. Exposure scores are theme relevance measures, not trading recommendations.</p>
      </section>

      <section className={styles.exposureLayout}>
        <div className={styles.exposureList}>
          {data.exposures.length ? data.exposures.map((exposure) => exposure.instruments?.symbol ? (
            <article className={styles.exposureRow} key={`${exposure.instrument_id}-${exposure.exposure_type}`}>
              <div className={styles.instrumentIdentity}><span className={styles.instrumentBadge}>{exposure.instruments.symbol.slice(0, 4)}</span><div><strong>{exposure.instruments.symbol}</strong><span>{exposure.instruments.instrument_name}</span></div></div>
              <div className={styles.exposureScoreBlock}><span>Exposure Score</span><strong>{fmtScore(exposure.exposure_score)}<small>/100</small></strong></div>
              <div className={styles.exposureTypeBlock}><span>Type</span><strong>{titleCase(exposure.exposure_type)}</strong></div>
              <div className={styles.exposureRationale}><span>Rationale</span><p>{exposure.rationale ?? 'No exposure rationale supplied.'}</p></div>
              <Link className={styles.viewButton} href={`/markets/${symbolSlug(exposure.instruments.symbol)}`}>View market ↗</Link>
            </article>
          ) : null) : <div className={styles.darkEmpty}>No tracked instruments are currently linked to this theme.</div>}
        </div>

        <aside className={styles.exposureTakeaway}>
          <span className={`${styles.roundIcon} ${styles.blueIcon}`}>◎</span>
          <h3>Exposure Takeaway</h3>
          {top?.instruments ? <p><strong>{top.instruments.symbol}</strong> currently has the highest mapped exposure at {fmtScore(top.exposure_score)}/100, classified as {titleCase(top.exposure_type)}.</p> : <p>No exposure mapping is available yet.</p>}
          <div className={styles.takeawayDivider} />
          <span>Mapped types</span>
          <p>{exposureTypes.length ? exposureTypes.join(' · ') : '—'}</p>
          <span>Tracked instruments</span>
          <p>{data.exposures.length}</p>
        </aside>
      </section>
    </>
  )
}

function EventsView({ data }: { data: OpportunityDetailData }) {
  const evidenceScores = data.events.map((event) => event.evidence_strength).filter((score): score is number => score !== null)
  const averageEvidence = evidenceScores.length ? evidenceScores.reduce((sum, score) => sum + score, 0) / evidenceScores.length : null
  const risks = extractRisks(data.researchDocument?.plain_text)
  const watchNext = [data.latestTechnology?.bottleneck, data.latestTechnology?.unlock_description, risks[0]].filter((item): item is string => Boolean(item)).slice(0, 3)

  return (
    <section className={styles.eventsLayout}>
      <div className={styles.timelinePanel}>
        <div className={styles.sectionIntro}><h2>Opportunity Events Timeline</h2><p>Stored milestones and commercial evidence shaping this opportunity.</p></div>
        {data.events.length ? (
          <div className={styles.timelineList}>
            {data.events.map((event, index) => (
              <article className={styles.timelineItem} key={event.id}>
                <div className={styles.timelineMarker}>{index + 1}</div>
                <div className={styles.timelineCard}>
                  <div><span className={styles.darkLevelPill}>{titleCase(event.event_type)}</span><h3>{event.title}</h3><p>{event.description}</p></div>
                  <div className={styles.timelineMeta}><strong>{fmtDate(event.event_date)}</strong>{event.source_name && <span>{event.source_name}</span>}{event.evidence_strength !== null && <small>Evidence {Math.round(event.evidence_strength)}/100</small>}{event.source_url && <a href={event.source_url} target="_blank" rel="noreferrer">Open source ↗</a>}</div>
                </div>
              </article>
            ))}
          </div>
        ) : <div className={styles.darkEmpty}>No Technology Inflection events have been recorded for this theme yet.</div>}
      </div>

      <aside className={styles.eventsAside}>
        <article className={styles.metricSideCard}>
          <span className={`${styles.smallIcon} ${styles.greenIcon}`}>↗</span><div><h3>Evidence Strength</h3><strong>{averageEvidence === null ? '—' : `${Math.round(averageEvidence)}/100`}</strong><p>{data.events.length} stored {data.events.length === 1 ? 'event' : 'events'} in the current signal history.</p></div>
        </article>
        <article className={styles.metricSideCard}>
          <span className={`${styles.smallIcon} ${styles.purpleIcon}`}>◷</span><div><h3>Commercial Readiness</h3><strong>{titleCase(data.latest?.commercial_readiness)}</strong><p>{titleCase(data.latestTechnology?.maturity_stage)}</p></div>
        </article>
        <article className={styles.metricSideCard}>
          <span className={`${styles.smallIcon} ${styles.blueIcon}`}>◉</span><div><h3>Watch Next</h3>{watchNext.length ? <ul>{watchNext.map((item, index) => <li key={index}>{shortText(item, 120)}</li>)}</ul> : <p>No explicit watch items are stored yet.</p>}</div>
        </article>
      </aside>
    </section>
  )
}

function AIRecommendationView({ data }: { data: OpportunityDetailData }) {
  if (!data.latest) return <div className={styles.darkEmpty}>No AI Recommendation can be produced until an Opportunity Assessment exists.</div>
  const priority = priorityLabel(data.latest.opportunity_score)
  const evidence = getEvidenceItems(data)
  const risks = extractRisks(data.researchDocument?.plain_text)
  const monitor = [
    data.latestTechnology?.bottleneck,
    data.latestTechnology?.unlock_description,
    data.latestStructural?.capacity_constraint_score == null ? null : `Capacity-constraint score is ${fmtScore(data.latestStructural.capacity_constraint_score)}/100.`,
    data.events[0]?.title ? `Latest stored event: ${data.events[0].title}.` : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 5)
  const upside = [
    ...evidence.map((item) => item.evidence).filter((item): item is string => Boolean(item)),
    data.latestTechnology?.unlock_description,
  ].filter((item): item is string => Boolean(item)).slice(0, 5)

  return (
    <>
      <section className={styles.recommendationHero}>
        <div className={`${styles.bigThemeIcon} ${styles.blueIcon}`}>◇</div>
        <div className={styles.recommendationCopy}>
          <h2>AI Recommendation: {recommendationHeadline(data.latest.opportunity_score, data.latest.opportunity_confidence)}</h2>
          <p>{cleanSummary(data.latest.summary) || data.theme.description}</p>
        </div>
        <div className={styles.recommendationMetrics}>
          <div><span>Opportunity Strength</span><strong>{fmtScore(data.latest.opportunity_score)}<small>/100</small></strong><em>{titleCase(data.latest.opportunity_level)}</em></div>
          <div><span>Confidence</span><strong>{confidenceLabel(data.latest.opportunity_confidence)}</strong><em>{data.latest.opportunity_confidence == null ? '—' : `${Math.round(data.latest.opportunity_confidence)}%`}</em></div>
          <div><span>Commercial Readiness</span><strong>{titleCase(data.latest.commercial_readiness)}</strong><em>{titleCase(data.latestTechnology?.maturity_stage)}</em></div>
          <div><span>Priority</span><strong>{priority.value}</strong><em>{priority.note}</em></div>
        </div>
      </section>

      <section className={styles.threeColumnGrid}>
        <article className={styles.recommendationCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.blueIcon}`}>◉</span><h2>What to monitor</h2></div>
          {monitor.length ? <ul className={styles.caseList}>{monitor.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No monitoring points are stored yet.</p>}
        </article>
        <article className={styles.recommendationCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.greenIcon}`}>↗</span><h2>What could go right</h2></div>
          {upside.length ? <ul className={`${styles.caseList} ${styles.positiveList}`}>{upside.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No positive evidence statements are stored yet.</p>}
        </article>
        <article className={styles.recommendationCard}>
          <div className={styles.cardHeading}><span className={`${styles.smallIcon} ${styles.redIcon}`}>!</span><h2>What could go wrong</h2></div>
          {risks.length ? <ul className={`${styles.caseList} ${styles.riskList}`}>{risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul> : <p>{data.latestTechnology?.bottleneck ?? 'No explicit risk summary has been stored yet.'}</p>}
        </article>
      </section>

      <TopExposureStrip data={data} />
      <div className={styles.independenceNote}>AI Recommendation summarises the long-term Opportunity Assessment only. Review the independent current Market Assessment before taking any trading action.</div>
    </>
  )
}

function renderView(data: OpportunityDetailData, view: DetailView) {
  switch (view) {
    case 'investment-case': return <InvestmentCaseView data={data} />
    case 'synergies': return <SynergiesView data={data} />
    case 'exposure': return <ExposureView data={data} />
    case 'events': return <EventsView data={data} />
    case 'ai-recommendation': return <AIRecommendationView data={data} />
    default: return <OverviewView data={data} />
  }
}

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ theme: string }>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { theme: themeCode } = await params
  const query = await searchParams
  const view = normalizeView(query.view)

  try {
    const data = await getOpportunityDetail(themeCode)
    if (!data) notFound()

    return (
      <div className={`page ${styles.opportunityPage}`}>
        <div className={styles.crumbs}><Link href="/opportunities">Opportunities</Link><span>/</span><span>{data.theme.theme_name}</span></div>

        <header className={styles.detailHero}>
          <div>
            <h1>{data.theme.theme_name}</h1>
            <p>Long-term discovery, not a Buy/Sell signal.</p>
          </div>
          <div className={styles.detailActions}>
            <OpportunityThemeSelect themes={data.themeOptions} currentCode={data.theme.theme_code} currentView={view} className={styles.themeSelect} />
            <div className={styles.detailHeroScore}>
              <span>Opportunity Score</span>
              <div><strong>{fmtScore(data.latest?.opportunity_score)}</strong><small>/100</small></div>
              <em>{titleCase(data.latest?.opportunity_level ?? data.theme.status)}</em>
              <small>Updated {fmtDate(data.latest?.assessment_date ?? null)}</small>
            </div>
          </div>
        </header>

        <DetailTabs data={data} view={view} />
        <div className={styles.viewContent}>{renderView(data, view)}</div>
      </div>
    )
  } catch (error) {
    return (
      <div className={`page ${styles.opportunityPage}`}>
        <div className={styles.crumbs}><Link href="/opportunities">Opportunities</Link><span>/</span><span>Detail</span></div>
        <div className={styles.darkEmpty}><strong>Opportunity detail is not available yet.</strong><span>{error instanceof Error ? error.message : 'The page will populate when Supabase data is accessible.'}</span></div>
      </div>
    )
  }
}
