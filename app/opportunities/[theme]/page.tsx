import Link from 'next/link'
import { notFound } from 'next/navigation'
import OpportunityHistoryChart from '@/components/OpportunityHistoryChart'
import ResearchDocument from '@/components/ResearchDocument'
import { getOpportunityDetail } from '@/lib/opportunities'
import styles from '../opportunities.module.css'

export const dynamic = 'force-dynamic'

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

export default async function OpportunityDetailPage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme: themeCode } = await params

  try {
    const data = await getOpportunityDetail(themeCode)
    if (!data) notFound()

    const history = [...data.assessments].reverse().map((row) => ({
      date: fmtDate(row.assessment_date),
      opportunity: row.opportunity_score,
      structural: row.structural_score,
      technology: row.technology_inflection_score,
    }))

    return (
      <div className="page">
        <div className="detailTopline"><Link href="/opportunities">← Back to Opportunity Assessment</Link><span className="contextText">{data.theme.theme_code}</span></div>

        <header className={`pageHeader ${styles.detailHeader}`}>
          <div>
            <h1>{data.theme.theme_name}</h1>
            <p className="subtitle">{data.theme.description ?? 'Long-term Opportunity Assessment theme.'}</p>
            <div className={styles.themeMeta}>
              <span className={styles.levelPill}>{data.latest?.opportunity_level ?? data.theme.status}</span>
              <span>{data.latest?.time_horizon ?? (data.theme.horizon_years_min != null && data.theme.horizon_years_max != null ? `${data.theme.horizon_years_min}–${data.theme.horizon_years_max} years` : 'Long-term')}</span>
              <span>{titleCase(data.latest?.commercial_readiness)}</span>
              <span>Updated {fmtDate(data.latest?.assessment_date ?? null)}</span>
            </div>
          </div>
          <div className={styles.detailScore}>
            <strong>{fmtScore(data.latest?.opportunity_score)}</strong>
            <span>Opportunity score</span>
            <div className="contextText">{data.latest?.opportunity_confidence == null ? '—' : `${Math.round(data.latest.opportunity_confidence)}% confidence`}</div>
          </div>
        </header>

        {!data.latest ? (
          <div className="emptyStateLarge">
            <strong>No Opportunity Assessment has been created for this theme yet.</strong>
            <span>The drill-through is ready and will populate when the scheduled Daily Opportunity Assessment writes the first assessment.</span>
          </div>
        ) : (
          <>
            <section className={styles.heroGrid}>
              <article className={styles.heroCard}><span>Opportunity</span><strong>{fmtScore(data.latest.opportunity_score)}</strong><small>{titleCase(data.latest.opportunity_level)}</small></article>
              <article className={styles.heroCard}><span>Structural</span><strong>{fmtScore(data.latest.structural_score)}</strong><small>{data.latest.structural_confidence == null ? '—' : `${Math.round(data.latest.structural_confidence)}% confidence`}</small></article>
              <article className={styles.heroCard}><span>Technology Inflection</span><strong>{fmtScore(data.latest.technology_inflection_score)}</strong><small>{data.latest.technology_inflection_confidence == null ? '—' : `${Math.round(data.latest.technology_inflection_confidence)}% confidence`}</small></article>
              <article className={styles.heroCard}><span>Commercial Readiness</span><strong style={{ fontSize: 21 }}>{titleCase(data.latest.commercial_readiness)}</strong><small>{data.latest.time_horizon ?? 'Time horizon not set'}</small></article>
            </section>

            <section className="panel briefLead">
              <div className="panelHeader"><div><h2>Opportunity Summary</h2><p className="panelHint">The convergence conclusion after the two underlying signals are assessed independently.</p></div></div>
              <p>{data.latest.summary ?? 'No summary supplied.'}</p>
            </section>

            <section className={styles.signalGrid} style={{ marginTop: 18 }}>
              <article className={styles.signalCard}>
                <div className={styles.signalTop}>
                  <div><span>Structural Opportunity Signal</span><h3>{titleCase(data.latestStructural?.signal_label)}</h3></div>
                  <div className={styles.signalScore}>{fmtScore(data.latestStructural?.overall_score ?? data.latest.structural_score)}</div>
                </div>
                <p>{data.latestStructural?.summary ?? 'No Structural Opportunity signal detail has been loaded yet.'}</p>
                <div className={styles.componentGrid}>
                  <div><span>Demand</span><strong>{fmtScore(data.latestStructural?.demand_score)}</strong></div>
                  <div><span>Adoption</span><strong>{fmtScore(data.latestStructural?.adoption_score)}</strong></div>
                  <div><span>Capital</span><strong>{fmtScore(data.latestStructural?.capital_investment_score)}</strong></div>
                  <div><span>Capacity</span><strong>{fmtScore(data.latestStructural?.capacity_constraint_score)}</strong></div>
                  <div><span>Economics</span><strong>{fmtScore(data.latestStructural?.economics_score)}</strong></div>
                </div>
              </article>

              <article className={styles.signalCard}>
                <div className={styles.signalTop}>
                  <div><span>Technology Inflection Signal</span><h3>{titleCase(data.latestTechnology?.signal_label)}</h3></div>
                  <div className={styles.signalScore}>{fmtScore(data.latestTechnology?.overall_score ?? data.latest.technology_inflection_score)}</div>
                </div>
                <p>{data.latestTechnology?.summary ?? 'No Technology Inflection signal detail has been loaded yet.'}</p>
                <div className={styles.componentGrid} style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                  <div><span>Unlock</span><strong>{fmtScore(data.latestTechnology?.bottleneck_unlock_score)}</strong></div>
                  <div><span>Evidence</span><strong>{fmtScore(data.latestTechnology?.evidence_quality_score)}</strong></div>
                  <div><span>Commercial</span><strong>{fmtScore(data.latestTechnology?.commercialisation_score)}</strong></div>
                  <div><span>Impact</span><strong>{fmtScore(data.latestTechnology?.impact_score)}</strong></div>
                </div>
                <div style={{ marginTop: 15 }}>
                  <strong>Bottleneck</strong>
                  <p>{data.latestTechnology?.bottleneck ?? 'Not yet identified.'}</p>
                  <strong>Potential unlock</strong>
                  <p>{data.latestTechnology?.unlock_description ?? 'Not yet identified.'}</p>
                  <div className={styles.themeMeta}><span>Maturity: {titleCase(data.latestTechnology?.maturity_stage)}</span></div>
                </div>
              </article>
            </section>

            <section className="panel" style={{ marginTop: 18 }}>
              <div className="panelHeader"><div><h2>Opportunity History</h2><p className="panelHint">Structural, Technology Inflection and combined Opportunity scores over time.</p></div><span className="contextText">{history.length} assessments</span></div>
              <OpportunityHistoryChart data={history} />
            </section>

            <section className={styles.layoutGrid} style={{ marginTop: 18 }}>
              <article className="panel">
                <div className="panelHeader"><div><h2>Technology Inflection Events</h2><p className="panelHint">Scientific, engineering, manufacturing and commercial evidence attached to the technology signal.</p></div><span className="contextText">{data.events.length} events</span></div>
                {data.events.length ? (
                  <div className={styles.eventList}>
                    {data.events.slice(0, 20).map((event) => (
                      <div className={styles.eventCard} key={event.id}>
                        <span className={styles.levelPill}>{titleCase(event.event_type)}</span>
                        <h4>{event.title}</h4>
                        <p>{event.description}</p>
                        <div className={styles.eventMeta}>
                          <span>{fmtDate(event.event_date)}</span>
                          {event.source_name && <span>{event.source_name}</span>}
                          {event.evidence_strength !== null && <span>Evidence {Math.round(event.evidence_strength)}</span>}
                        </div>
                        {event.source_url && <a className={styles.sourceLink} href={event.source_url} target="_blank" rel="noreferrer">Open source ↗</a>}
                      </div>
                    ))}
                  </div>
                ) : <div className="emptyCompact">No Technology Inflection events have been recorded yet.</div>}
              </article>

              <article className="panel">
                <div className="panelHeader"><div><h2>Tracked Instrument Exposure</h2><p className="panelHint">Existing Trading universe instruments linked to this long-term theme.</p></div><span className="contextText">{data.exposures.length} exposures</span></div>
                {data.exposures.length ? (
                  <div className={styles.exposureGrid} style={{ gridTemplateColumns: '1fr' }}>
                    {data.exposures.map((exposure) => (
                      <div className={styles.exposureCard} key={`${exposure.instrument_id}-${exposure.exposure_type}`}>
                        <div className={styles.exposureTop}>
                          <div><strong>{exposure.instruments?.symbol ?? 'Unknown'}</strong><div className="contextText">{exposure.instruments?.instrument_name ?? 'Instrument'}</div></div>
                          <span className={styles.levelPill}>{titleCase(exposure.exposure_type)}</span>
                        </div>
                        <p>{exposure.rationale ?? 'No exposure rationale supplied.'}</p>
                        <div className={styles.themeMeta}><span>Exposure {fmtScore(exposure.exposure_score)}</span></div>
                        {exposure.instruments?.symbol && <Link className={styles.sourceLink} href={`/markets/${symbolSlug(exposure.instruments.symbol)}`}>View market →</Link>}
                      </div>
                    ))}
                  </div>
                ) : <div className="emptyCompact">No tracked instruments are currently linked to this theme.</div>}
              </article>
            </section>

            <section className={`panel ${styles.researchShell}`}>
              <div className="panelHeader"><div><h2>Research &amp; Evidence</h2><p className="panelHint">TipTap research document with source links, charts, live/snapshot indicators and evidence blocks.</p></div><span className="contextText">{data.researchEmbeds.length} embeds</span></div>
              <ResearchDocument document={data.researchDocument} embeds={data.researchEmbeds} />
            </section>
          </>
        )}
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <div className="detailTopline"><Link href="/opportunities">← Back to Opportunity Assessment</Link></div>
        <div className="errorState"><strong>Opportunity detail is not available yet.</strong><span>{error instanceof Error ? error.message : 'The page will populate when Supabase data is accessible.'}</span></div>
      </div>
    )
  }
}
