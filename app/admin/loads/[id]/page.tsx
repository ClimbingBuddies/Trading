import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLoadDetail } from '@/lib/dashboard'

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
    second: '2-digit',
  }).format(new Date(value))
}

export default async function LoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { run, observations } = await getLoadDetail(id)
    const metadata = (run.metadata ?? {}) as Record<string, unknown>

    return (
      <div className="page">
        <div className="detailTopline">
          <Link href="/admin">← Back to Admin</Link>
          <span className={`status status-${run.status}`}>{run.status}</span>
        </div>

        <header className="pageHeader compactHeader">
          <div>
            <p className="eyebrow">LOAD DETAIL</p>
            <h1>{run.id}</h1>
            <p className="subtitle">Detailed execution record and observations loaded around this run.</p>
          </div>
        </header>

        <section className="detailGrid">
          <article className="panel detailCard">
            <h2>Run summary</h2>
            <dl>
              <div><dt>Started</dt><dd>{fmt(run.started_at)}</dd></div>
              <div><dt>Finished</dt><dd>{fmt(run.finished_at)}</dd></div>
              <div><dt>Requested</dt><dd>{run.requested_count}</dd></div>
              <div><dt>Received</dt><dd>{run.received_count}</dd></div>
              <div><dt>Inserted</dt><dd>{run.inserted_count}</dd></div>
              <div><dt>Error</dt><dd>{run.error_message ?? 'None'}</dd></div>
            </dl>
          </article>

          <article className="panel detailCard">
            <h2>Loader metadata</h2>
            <dl>
              <div><dt>Function</dt><dd>{String(metadata.function ?? '—')}</dd></div>
              <div><dt>Eligible</dt><dd>{String(metadata.eligible_count ?? '—')}</dd></div>
              <div><dt>Skipped out of session</dt><dd>{String(metadata.skipped_out_of_session ?? '—')}</dd></div>
              <div><dt>Batch size</dt><dd>{String(metadata.batch_size ?? '—')}</dd></div>
              <div><dt>Evaluated at</dt><dd>{metadata.evaluated_at ? fmt(String(metadata.evaluated_at)) : '—'}</dd></div>
              <div><dt>Market-hours aware</dt><dd>{String(metadata.market_hours_aware ?? '—')}</dd></div>
            </dl>
          </article>
        </section>

        <section className="panel tablePanel">
          <div className="panelHeader">
            <div><p className="eyebrow">OBSERVATIONS</p><h2>Rows loaded around this run</h2></div>
            <span className="muted">{observations.length} rows</span>
          </div>
          <div className="tableScroll">
            <table>
              <thead><tr><th>Ticker</th><th>Asset</th><th>Loaded</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th>Currency</th></tr></thead>
              <tbody>
                {observations.map((obs: any) => (
                  <tr key={obs.id}>
                    <td><strong>{obs.instruments?.symbol ?? '—'}</strong></td>
                    <td>{obs.instruments?.asset_type ?? '—'}</td>
                    <td>{fmt(obs.loaded_at)}</td>
                    <td>{obs.open ?? '—'}</td><td>{obs.high ?? '—'}</td><td>{obs.low ?? '—'}</td><td>{obs.close ?? '—'}</td><td>{obs.volume ?? '—'}</td><td>{obs.currency_code ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  } catch {
    notFound()
  }
}
