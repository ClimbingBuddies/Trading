import MarketsTable from '@/components/MarketsTable'
import { getMarketsData } from '@/lib/markets-data'

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

function fmtTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
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
            <p className="subtitle">Current view of tracked instruments, market session and data status.</p>
          </div>
          <div className="headerActions"><span className="contextText">Latest market observation: {fmtDate(data.latestObservationAt)}</span></div>
        </header>

        <section className="kpiGrid">
          <article className="kpi"><span>Active Instruments</span><strong className="number">{data.counts.total}</strong><small>Across tracked asset classes</small></article>
          <article className="kpi"><span>Equities</span><strong className="number">{data.counts.equity}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>ETFs</span><strong className="number">{data.counts.etf}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>Forex</span><strong className="number">{data.counts.forex}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>Crypto</span><strong className="number">{data.counts.crypto}</strong><small>Active instruments</small></article>
          <article className="kpi"><span>Latest Observation</span><strong>{fmtTime(data.latestObservationAt)}</strong><small>{data.latestObservationAt ? fmtDate(data.latestObservationAt) : 'No observations yet'}</small></article>
        </section>

        <section className="panel tablePanel marketTablePanel">
          <div className="panelHeader">
            <div><h2>Instrument Overview</h2><p className="panelHint">Search, filter and click a symbol for price history and assessment detail.</p></div>
          </div>
          <MarketsTable rows={data.rows} />
        </section>

        <section className="panel freshnessSummaryPanel">
          <div className="panelHeader"><div><h2>Market Data Status Summary</h2><p className="panelHint">Current and due thresholds follow the loader cadence; closed US equity sessions are separated from stale data.</p></div></div>
          <div className="freshnessCards">
            <article><span>Current</span><strong className="toneGood">{data.statusSummary.current}</strong><small>{percent(data.statusSummary.current, data.counts.total)} · within 90 min</small></article>
            <article><span>Due</span><strong className="toneWarn">{data.statusSummary.due}</strong><small>{percent(data.statusSummary.due, data.counts.total)} · 91–120 min</small></article>
            <article><span>Stale</span><strong className="toneBad">{data.statusSummary.stale}</strong><small>{percent(data.statusSummary.stale, data.counts.total)} · over 120 min while active</small></article>
            <article><span>Market Closed</span><strong>{data.statusSummary.marketClosed}</strong><small>{percent(data.statusSummary.marketClosed, data.counts.total)} · US equities / ETFs</small></article>
            <article><span>No Observation</span><strong>{data.statusSummary.noObservation}</strong><small>{percent(data.statusSummary.noObservation, data.counts.total)} · waiting for first load</small></article>
          </div>
        </section>
      </div>
    )
  } catch (error) {
    return (
      <div className="page">
        <header className="pageHeader"><div><h1>Markets / Instrument Overview</h1><p className="subtitle">Current view of tracked instruments, market session and data status.</p></div></header>
        <div className="errorState"><strong>Market data is not available to the dashboard yet.</strong><span>{error instanceof Error ? error.message : 'The page is ready and will populate when data becomes available.'}</span></div>
      </div>
    )
  }
}
