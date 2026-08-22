import Link from 'next/link'
import { notFound } from 'next/navigation'
import PriceHistoryChart from '@/components/PriceHistoryChart'
import { getMarketDetail } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

function fmt(value: string | null) {
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

function fmtNumber(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-AU', { maximumFractionDigits: Math.abs(value) < 10 ? 5 : 2 })
}

function fmtScore(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : Math.round(value).toString()
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function titleCase(value: string | null | undefined) {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function opportunityHref(themeCode: string) {
  return `/opportunities/${encodeURIComponent(themeCode.toLowerCase())}?view=exposure`
}

async function resolveDetail(slug: string) {
  const decoded = decodeURIComponent(slug).toUpperCase()
  const candidates = [decoded]
  if (decoded.includes('-')) candidates.push(decoded.replace('-', '/'))
  for (const candidate of candidates) {
    const result = await getMarketDetail(candidate)
    if (result) return result
  }
  return null
}

export default async function MarketDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const detail = await resolveDetail(symbol)
  if (!detail) notFound()

  try {
    const latest = detail.observations[0] ?? null
    const chartData = detail.observations
      .filter((row) => typeof row.close === 'number')
      .map((row) => ({ observed_at: row.observed_at, close: row.close }))

    return (
      <div className="page">
        <div className="detailTopline"><Link href="/markets">← Back to Markets</Link><span className="contextText">{detail.instrument.asset_type} · {detail.instrument.exchange_code}</span></div>

        <header className="pageHeader">
          <div>
            <h1>{detail.instrument.symbol} / {detail.instrument.instrument_name}</h1>
            <p className="subtitle">Instrument history, latest observation and linked market assessment.</p>
          </div>
          {detail.latestAssessment && <Link className="primaryLinkButton" href={`/assessments/${detail.instrument.symbol.replaceAll('/', '-').toLowerCase()}`}>View latest assessment →</Link>}
        </header>

        <section className="kpiGrid detailKpis">
          <article className="kpi"><span>Latest Price</span><strong className="number">{fmtNumber(latest?.close)}</strong><small>{latest?.currency_code?.trim() ?? detail.instrument.currency_code.trim()}</small></article>
          <article className="kpi"><span>Latest Observation</span><strong>{fmt(latest?.observed_at ?? null)}</strong><small>Market timestamp</small></article>
          <article className="kpi"><span>Loaded At</span><strong>{fmt(latest?.loaded_at ?? null)}</strong><small>Supabase ingestion time</small></article>
          <article className="kpi"><span>Asset Class</span><strong>{detail.instrument.asset_type}</strong><small>{detail.instrument.exchange_code}</small></article>
          <article className="kpi"><span>Assessment</span><strong>{detail.latestAssessment?.rating ?? '—'}</strong><small>{detail.latestAssessment ? `${detail.latestAssessment.confidence ?? '—'}% confidence` : 'No assessment yet'}</small></article>
        </section>

        <section className="panel opportunityThemePanel">
          <div className="panelHeader">
            <div>
              <h2>Long-term Opportunity Themes</h2>
              <p className="panelHint">Stored thematic exposure for this tracked instrument, shown separately from current Market results.</p>
            </div>
            <span className="contextText">{detail.opportunityThemes.length} mapped {detail.opportunityThemes.length === 1 ? 'theme' : 'themes'}</span>
          </div>

          {detail.opportunityThemes.length ? (
            <div className="opportunityThemeGrid">
              {detail.opportunityThemes.map((theme) => (
                <article className="opportunityThemeCard" key={theme.theme_id}>
                  <div className="opportunityThemeCardHeader">
                    <div>
                      <Link href={opportunityHref(theme.theme_code)}>{theme.theme_name}</Link>
                      <span>{titleCase(theme.theme_status)} · {titleCase(theme.exposure_type)}</span>
                    </div>
                    <strong>{fmtScore(theme.exposure_score)}<small>/100</small></strong>
                  </div>
                  <p>{theme.rationale ?? theme.theme_description ?? 'No exposure rationale has been stored.'}</p>
                  <div className="opportunityThemeMeasures">
                    <div><span>Exposure</span><strong>{fmtScore(theme.exposure_score)}/100</strong><small>Long-term relevance</small></div>
                    <div><span>Opportunity</span><strong>{fmtScore(theme.opportunity_score)}/100</strong><small>{titleCase(theme.opportunity_level)}</small></div>
                    <div><span>Confidence</span><strong>{fmtScore(theme.opportunity_confidence)}%</strong><small>{theme.methodology_version ?? 'No assessment yet'}</small></div>
                  </div>
                  <div className="opportunityThemeFooter">
                    <span>{theme.time_horizon ?? 'Long-term horizon'} · assessed {fmtDate(theme.assessment_date)}</span>
                    <Link href={opportunityHref(theme.theme_code)}>View theme exposure →</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyCompact">No active Opportunity theme currently maps to this tracked instrument.</div>
          )}

          <p className="opportunityIndependenceNote">Opportunity exposure is a long-term research measure. It does not alter Technical, AI or Market Convergence calculations, and current Market results do not alter the exposure score.</p>
        </section>

        <section className="panel">
          <div className="panelHeader"><div><h2>Price History</h2><p className="panelHint">Select a period to view available Supabase market history.</p></div></div>
          <PriceHistoryChart symbol={detail.instrument.symbol} data={chartData} />
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader"><div><h2>Recent Observations</h2><p className="panelHint">Most recent loaded market observations.</p></div><span className="contextText">{detail.observations.length} rows</span></div>
          <div className="tableScroll">
            <table>
              <thead><tr><th>Observed At</th><th>Loaded At</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th>Currency</th></tr></thead>
              <tbody>
                {detail.observations.length ? detail.observations.slice(0, 20).map((row) => (
                  <tr key={row.id}>
                    <td>{fmt(row.observed_at)}</td><td>{fmt(row.loaded_at)}</td><td className="numericCell">{fmtNumber(row.open)}</td><td className="numericCell">{fmtNumber(row.high)}</td><td className="numericCell">{fmtNumber(row.low)}</td><td className="numericCell"><strong>{fmtNumber(row.close)}</strong></td><td className="numericCell">{fmtNumber(row.volume)}</td><td>{row.currency_code?.trim() ?? '—'}</td>
                  </tr>
                )) : <tr><td colSpan={8}><div className="tableEmpty">No observations have been loaded for this instrument yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <div className="detailTopline"><Link href="/markets">← Back to Markets</Link></div>
        <div className="errorState"><strong>Instrument detail is not available yet.</strong><span>{error instanceof Error ? error.message : 'This route is ready and will populate when data is accessible.'}</span></div>
      </div>
    )
  }
}
