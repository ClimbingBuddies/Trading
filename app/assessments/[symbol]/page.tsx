import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAssessmentDetail } from '@/lib/dashboard'

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

async function resolveDetail(slug: string) {
  const decoded = decodeURIComponent(slug).toUpperCase()
  const candidates = [decoded]
  if (decoded.includes('-')) candidates.push(decoded.replace('-', '/'))
  for (const candidate of candidates) {
    const result = await getAssessmentDetail(candidate)
    if (result) return result
  }
  return null
}

export default async function AssessmentDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  try {
    const detail = await resolveDetail(symbol)
    if (!detail) notFound()
    const assessment = detail.assessment
    const marketSlug = detail.instrument.symbol.replaceAll('/', '-').toLowerCase()

    return (
      <div className="page">
        <div className="detailTopline"><Link href="/assessments">← Back to Assessments</Link><Link href={`/markets/${marketSlug}`}>View Market Data →</Link></div>

        <header className="pageHeader assessmentDetailHeader">
          <div>
            <h1>{detail.instrument.symbol} / Market Assessment</h1>
            <p className="subtitle">{detail.instrument.instrument_name} · {detail.instrument.asset_type} · {detail.instrument.exchange_code}</p>
          </div>
          {assessment && <div className="assessmentHeadline"><span className="ratingTag large">{assessment.rating}</span><strong>{assessment.confidence ?? '—'}%</strong><small>confidence</small></div>}
        </header>

        {!assessment ? (
          <div className="emptyStateLarge">
            <strong>No assessment has been loaded for {detail.instrument.symbol} yet.</strong>
            <span>The route and analyst-brief layout are ready and will populate automatically after an assessment is created.</span>
            <Link className="primaryLinkButton" href={`/markets/${marketSlug}`}>View market data</Link>
          </div>
        ) : (
          <>
            <section className="kpiGrid detailKpis">
              <article className="kpi"><span>Rating</span><strong className="number">{assessment.rating}</strong><small>Latest assessment</small></article>
              <article className="kpi"><span>Score</span><strong className="number">{assessment.score ?? '—'}</strong><small>Model score</small></article>
              <article className="kpi"><span>Confidence</span><strong className="number">{assessment.confidence === null ? '—' : `${assessment.confidence}%`}</strong><small>Higher is stronger conviction</small></article>
              <article className="kpi"><span>Assessment Date</span><strong>{fmtDate(assessment.assessment_date)}</strong><small>Latest available</small></article>
            </section>

            <section className="briefLead panel">
              <div className="panelHeader"><div><h2>Assessment Summary</h2><p className="panelHint">Concise current view.</p></div></div>
              <p>{assessment.summary ?? 'No summary supplied.'}</p>
            </section>

            <section className="briefGrid">
              <article className="panel briefCard positiveBrief"><h2>Bull Case</h2><p>{assessment.bull_case ?? 'No bull case supplied.'}</p></article>
              <article className="panel briefCard negativeBrief"><h2>Bear Case</h2><p>{assessment.bear_case ?? 'No bear case supplied.'}</p></article>
              <article className="panel briefCard"><h2>Technical View</h2><p>{assessment.technical_view ?? 'No technical view supplied.'}</p></article>
              <article className="panel briefCard"><h2>Macro View</h2><p>{assessment.macro_view ?? 'No macro view supplied.'}</p></article>
              <article className="panel briefCard"><h2>Valuation View</h2><p>{assessment.valuation_view ?? 'No valuation view supplied.'}</p></article>
              <article className="panel briefCard"><h2>Evidence Summary</h2><p>{assessment.evidence_summary ?? 'No evidence summary supplied.'}</p></article>
              <article className="panel briefCard"><h2>Key Catalysts</h2><p>{assessment.key_catalysts ?? 'No catalysts supplied.'}</p></article>
              <article className="panel briefCard"><h2>Key Risks</h2><p>{assessment.key_risks ?? 'No risks supplied.'}</p></article>
            </section>

            <section className="panel">
              <div className="panelHeader"><div><h2>Supporting Evidence</h2><p className="panelHint">Evidence rows linked to this assessment.</p></div><span className="contextText">{detail.evidence.length} items</span></div>
              {detail.evidence.length ? (
                <div className="evidenceList">
                  {detail.evidence.map((item) => (
                    <article className="evidenceItem" key={item.evidence_id}>
                      <div><span className="assetTag">{item.evidence_type}</span><strong>{item.source_name ?? 'Source not specified'}</strong></div>
                      <p>{item.evidence_text}</p>
                      <small>Relevance: {item.relevance_score ?? '—'} · Confidence: {item.confidence ?? '—'}</small>
                    </article>
                  ))}
                </div>
              ) : <div className="emptyCompact">No supporting evidence rows are linked yet.</div>}
            </section>
          </>
        )}
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <div className="detailTopline"><Link href="/assessments">← Back to Assessments</Link></div>
        <div className="errorState"><strong>Assessment detail is not available yet.</strong><span>{error instanceof Error ? error.message : 'This route is ready and will populate when data is accessible.'}</span></div>
      </div>
    )
  }
}
