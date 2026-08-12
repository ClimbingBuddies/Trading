import MarketsTable from '@/components/MarketsTable'
import { getMarketsData } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

function fmtDate(value: string | null) {
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

function percent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : '0%'
}

export default async function MarketsPage() {
  try {
    const data = await getMarketsData()

    return (
      <div className="page">
        <header className="pageHeader">
          <div>
            <h1>Markets / Instrument Overview</h1>
            <p className="subtitle">Current view of tracked instruments and market-data freshness.</p>
          </div>
          <div className="headerActions"><span className="contextText">Latest data: {fmtDate(data.latestObservationAt)}</span></div>
        </header>

        <section className="kpiGrid">
          <article className="kpi"><span>Active Instruments</span><strong className="number">{data.counts.total}</strong><small>Across tracked asset classes</small></article>
          <article className="kpi"><span>Equities</span><strong className="number">{data.counts.equity}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>ETFs</span><strong className="number">{data.counts.etf}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>Forex</span><strong className="number">{data.counts.forex}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>Crypto</span><strong className="number">{data.counts.crypto}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>Latest Observation</span><strong>{data.latestObservationAt ? fmtDate(data.latestObservationAt).split(',').at(-1) : '—'}</strong><small>{data.latestObservationAt ? fmtDate(data.latestObservationAt) : 'No observations yet'}</small></article>
        </section>

        <section className="panel tablePanel marketTablePanel">
          <div className="panelHeader">
            <div><h2>Instrument Overview</h2><p className="panelHint">Search, filter and click a symbol for price history and assessment detail.</p></div>
          </div>
          <MarketsTable rows={data.rows} />
        </section>

        <section className="panel freshnessSummaryPanel">
          <div className="panelHeader"><div><h2>Instrument Freshness Summary</h2><p className="panelHint">Freshness is interpreted alongside asset class and market session.</p></div></div>
          <div className="freshnessCards">
            <article><span>&lt; 15 min ago</span><strong className="toneGood">{data.freshness.under15}</strong><small>{percent(data.freshness.under15, data.counts.total)}</small></article>
            <article><span>15 min – 1 hour</span><strong className="toneBlue">{data.freshness.under60}</strong><small>{percent(data.freshness.under60, data.counts.total)}</small></article>
            <article><span>1 – 4 hours</span><strong className="toneWarn">{data.freshness.under240}</strong><small>{percent(data.freshness.under240, data.counts.total)}</small></article>
            <article><span>&gt; 4 hours</span><strong>{data.freshness.over240}</strong><small>{percent(data.freshness.over240, data.counts.total)}</small></article>
            {data.freshness.noObservation > 0 && <article><span>No observation</span><strong>{data.freshness.noObservation}</strong><small>Waiting for first load</small></article>}
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <header className="pageHeader"><div><h1>Markets / Instrument Overview</h1><p className="subtitle">Current view of tracked instruments and market-data freshness.</p></div></header>
        <div className="errorState"><strong>Market data is not available to the dashboard yet.</strong><span>{error instanceof Error ? error.message : 'The page is ready and will populate when data becomes available.'}</span></div>
      </div>
    )
  }
}
