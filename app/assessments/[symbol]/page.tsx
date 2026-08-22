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

function fmtScore(value: number | null) {
  return value === null ? '—' : Number(value).toFixed(1)
}

function fmtLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
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
    const convergence = detail.convergence
    const marketSlug = detail.instrument.symbol.replaceAll('/', '-').toLowerCase()

    return (
      <div className="page">
        <div className="detailTopline"><Link href="/assessments">← Back to Assessments</Link><Link href={`/markets/${marketSlug}`}>View Market Data →</Link></div>

        <header className="pageHeader assessmentDetailHeader">
          <div>
            <h1>{detail.instrument.symbol} / Market Signals</h1>
            <p className="subtitle">{detail.instrument.instrument_name} · {detail.instrument.asset_type} · {detail.instrument.exchange_code}</p>
          </div>
        </header>

        {!assessment && !convergence ? (
          <div className="emptyStateLarge">
            <strong>No market signals have been loaded for {detail.instrument.symbol} yet.</strong>
            <span>Technical, AI and Convergence results will appear here independently as their pipelines produce eligible data.</span>
            <Link className="primaryLinkButton" href={`/markets/${marketSlug}`}>View market data</Link>
          </div>
        ) : (
          <>
            <section className="signalComparisonGrid" aria-label="Technical, AI and Convergence results">
              <article className="signalResultCard technicalResult">
                <span className="sourceBadge technicalBadge">Technical Engine</span>
                <h2>{convergence ? `${fmtLabel(convergence.technical_signal)} · ${fmtScore(convergence.technical_score)}` : 'Not available'}</h2>
                <p>Immutable Technical source snapshot recorded before the combined result was calculated.</p>
                <dl><div><dt>Confidence</dt><dd>{convergence ? `${fmtScore(convergence.technical_confidence)}%` : '—'}</dd></div><div><dt>Snapshot date</dt><dd>{fmtDate(convergence?.assessment_date ?? null)}</dd></div><div><dt>Source record</dt><dd>{convergence ? `market_scores #${convergence.technical_score_id}` : '—'}</dd></div><div><dt>Input boundary</dt><dd>AI result not used</dd></div></dl>
              </article>

              <article className="signalResultCard aiResult">
                <span className="sourceBadge aiBadge">AI Market Assessment</span>
                <h2>{assessment ? `${assessment.rating} · ${fmtScore(assessment.score)} / 100` : 'Not available'}</h2>
                <p>Independent GPT assessment supported by its own research evidence.</p>
                <dl><div><dt>Confidence</dt><dd>{assessment?.confidence === null || !assessment ? '—' : `${assessment.confidence}%`}</dd></div><div><dt>Source date</dt><dd>{fmtDate(assessment?.assessment_date ?? null)}</dd></div><div><dt>Methodology</dt><dd>{assessment?.methodology_version ?? '—'}</dd></div><div><dt>Input boundary</dt><dd>Technical result not used</dd></div></dl>
              </article>

              <article className="signalResultCard convergenceResult">
                <span className="sourceBadge convergenceBadge">Market Convergence</span>
                <h2>{convergence ? `${fmtLabel(convergence.convergence_label)} · ${fmtScore(convergence.convergence_score)}` : 'Not available'}</h2>
                <p>Combined output produced only after eligible Technical and AI results exist.</p>
                <dl><div><dt>Confidence</dt><dd>{convergence ? `${fmtScore(convergence.convergence_confidence)}%` : '—'}</dd></div><div><dt>Assessment date</dt><dd>{fmtDate(convergence?.assessment_date ?? null)}</dd></div><div><dt>Methodology</dt><dd>{convergence?.methodology_version ?? '—'}</dd></div><div><dt>Source snapshot</dt><dd>{convergence ? `Technical ${fmtScore(convergence.technical_score)} · AI ${fmtScore(convergence.ai_score)}` : '—'}</dd></div></dl>
              </article>
            </section>

            {convergence?.summary && <section className="briefLead panel convergenceSummary"><div className="panelHeader"><div><h2>Market Convergence Summary</h2><p className="panelHint">Persisted combined interpretation; not an additional input.</p></div></div><p>{convergence.summary}</p></section>}

            {assessment ? <><section className="briefLead panel">
              <div className="panelHeader"><div><h2>AI Market Assessment Summary</h2><p className="panelHint">The independent AI view.</p></div></div>
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
              <div className="panelHeader"><div><h2>AI Supporting Evidence</h2><p className="panelHint">Evidence rows linked only to the AI Market Assessment.</p></div><span className="contextText">{detail.evidence.length} items</span></div>
              {detail.evidence.length ? (
                <div className="evidenceList">
                  {detail.evidence.map((item) => (
                    <article className="evidenceItem" key={String(item.evidence_id)}>
                      <div><span className="assetTag">{String(item.evidence_type)}</span><strong>{item.source_name ? String(item.source_name) : 'Source not specified'}</strong></div>
                      <p>{String(item.evidence_text)}</p>
                      <small>Relevance: {item.relevance_score ? String(item.relevance_score) : '—'} · Confidence: {item.confidence ? String(item.confidence) : '—'}</small>
                    </article>
                  ))}
                </div>
              ) : <div className="emptyCompact">No supporting evidence rows are linked yet.</div>}
            </section></> : <div className="emptyCompact">No AI Market Assessment is available for the latest production run. Technical and Convergence results remain independently visible above.</div>}
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
