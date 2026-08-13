'use client'

import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ResearchDocument as ResearchDocumentType, ResearchEmbed } from '@/lib/opportunities'

type TipTapMark = { type?: string; attrs?: Record<string, unknown> }
type TipTapNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: TipTapMark[]
  content?: TipTapNode[]
}

type SeriesSpec = { dataKey: string; label?: string }

const chartColours = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

function fmtDate(value: string | null) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function chartRows(embed: ResearchEmbed): Record<string, unknown>[] {
  if (Array.isArray(embed.snapshot_data)) return embed.snapshot_data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
  const snapshot = asRecord(embed.snapshot_data)
  if (Array.isArray(snapshot.data)) return snapshot.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
  return []
}

function ChartEmbed({ embed }: { embed: ResearchEmbed }) {
  const config = asRecord(embed.chart_config)
  const rows = chartRows(embed)
  const chartType = String(config.chartType ?? config.type ?? 'line').toLowerCase()
  const xKey = String(config.xKey ?? 'label')
  const rawSeries = Array.isArray(config.series) ? config.series : []
  const series: SeriesSpec[] = rawSeries
    .map((item) => asRecord(item))
    .filter((item) => typeof item.dataKey === 'string')
    .map((item) => ({ dataKey: String(item.dataKey), label: typeof item.label === 'string' ? item.label : undefined }))

  if (!rows.length || !series.length) {
    return (
      <div className="researchEmbed researchIndicator">
        <div className="researchEmbedTop"><span>Chart</span><strong>{embed.title ?? 'Linked chart'}</strong></div>
        <p>{embed.description ?? 'This chart is linked to Supabase data and will render when chart data is available.'}</p>
      </div>
    )
  }

  return (
    <div className="researchEmbed researchChart">
      <div className="researchEmbedTop"><span>Chart</span><strong>{embed.title ?? 'Research chart'}</strong></div>
      {embed.description && <p>{embed.description}</p>}
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          {chartType === 'bar' ? (
            <BarChart data={rows} margin={{ top: 10, right: 18, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={40} />
              <Tooltip />
              <Legend />
              {series.map((item, index) => <Bar key={item.dataKey} dataKey={item.dataKey} name={item.label ?? item.dataKey} fill={chartColours[index % chartColours.length]} />)}
            </BarChart>
          ) : (
            <LineChart data={rows} margin={{ top: 10, right: 18, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={40} />
              <Tooltip />
              <Legend />
              {series.map((item, index) => <Line key={item.dataKey} type="monotone" dataKey={item.dataKey} name={item.label ?? item.dataKey} stroke={chartColours[index % chartColours.length]} strokeWidth={2.5} dot={false} connectNulls />)}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function EmbedCard({ embed }: { embed: ResearchEmbed }) {
  if (embed.embed_type === 'chart') return <ChartEmbed embed={embed} />

  if (embed.embed_type === 'image' && embed.asset_url) {
    return (
      <figure className="researchEmbed researchImage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={embed.asset_url} alt={embed.alt_text ?? embed.title ?? ''} />
        {(embed.title || embed.description) && <figcaption><strong>{embed.title}</strong>{embed.description && <span>{embed.description}</span>}</figcaption>}
      </figure>
    )
  }

  const linked = Boolean(embed.source_url) && ['article', 'external_link', 'evidence'].includes(embed.embed_type)
  return (
    <div className={`researchEmbed research-${embed.embed_type}`}>
      <div className="researchEmbedTop">
        <span>{embed.embed_type.replaceAll('_', ' ')}</span>
        <strong>{embed.title ?? embed.source_name ?? 'Research item'}</strong>
      </div>
      {embed.description && <p>{embed.description}</p>}
      <div className="researchMeta">
        {embed.source_name && <span>{embed.source_name}</span>}
        {embed.source_published_at && <span>{fmtDate(embed.source_published_at)}</span>}
        {embed.relevance_score !== null && <span>Relevance {embed.relevance_score}</span>}
        {embed.confidence !== null && <span>Confidence {embed.confidence}%</span>}
      </div>
      {linked && <a className="researchSourceLink" href={embed.source_url ?? '#'} target="_blank" rel="noreferrer">Open source ↗</a>}
      {!linked && embed.source_url && <a className="researchSourceLink" href={embed.source_url} target="_blank" rel="noreferrer">Open link ↗</a>}
    </div>
  )
}

function renderText(node: TipTapNode, key: string): ReactNode {
  let content: ReactNode = node.text ?? ''
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') content = <strong>{content}</strong>
    else if (mark.type === 'italic') content = <em>{content}</em>
    else if (mark.type === 'code') content = <code>{content}</code>
    else if (mark.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '#'
      content = <a href={href} target="_blank" rel="noreferrer">{content}</a>
    }
  }
  return <span key={key}>{content}</span>
}

function renderNodes(nodes: TipTapNode[] | undefined, embeds: Map<string, ResearchEmbed>, path = 'n'): ReactNode[] {
  if (!nodes) return []
  return nodes.map((node, index) => {
    const key = `${path}-${index}`
    if (node.type === 'text') return renderText(node, key)
    if (node.type === 'hardBreak') return <br key={key} />

    const nodeId = typeof node.attrs?.nodeId === 'string'
      ? node.attrs.nodeId
      : typeof node.attrs?.node_id === 'string'
        ? node.attrs.node_id
        : typeof node.attrs?.id === 'string'
          ? node.attrs.id
          : null
    if (nodeId && embeds.has(nodeId)) return <EmbedCard key={key} embed={embeds.get(nodeId)!} />

    const children = renderNodes(node.content, embeds, key)
    if (node.type === 'paragraph') return <p key={key}>{children}</p>
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level ?? 2)
      if (level === 1) return <h2 key={key}>{children}</h2>
      if (level === 3) return <h4 key={key}>{children}</h4>
      return <h3 key={key}>{children}</h3>
    }
    if (node.type === 'bulletList') return <ul key={key}>{children}</ul>
    if (node.type === 'orderedList') return <ol key={key}>{children}</ol>
    if (node.type === 'listItem') return <li key={key}>{children}</li>
    if (node.type === 'blockquote') return <blockquote key={key}>{children}</blockquote>
    if (node.type === 'horizontalRule') return <hr key={key} />
    return <div key={key}>{children}</div>
  })
}

function documentNodes(document: ResearchDocumentType) {
  const root = asRecord(document.tiptap_json)
  return Array.isArray(root.content) ? (root.content as TipTapNode[]) : []
}

export default function ResearchDocument({ document, embeds }: { document: ResearchDocumentType | null; embeds: ResearchEmbed[] }) {
  if (!document) {
    return <div className="emptyCompact">No Research &amp; Evidence document has been created for this assessment yet.</div>
  }

  const embedMap = new Map(embeds.map((embed) => [embed.node_id, embed]))
  const nodes = documentNodes(document)
  const referenced = new Set<string>()
  const walk = (items: TipTapNode[]) => {
    for (const node of items) {
      const id = typeof node.attrs?.nodeId === 'string' ? node.attrs.nodeId : typeof node.attrs?.node_id === 'string' ? node.attrs.node_id : typeof node.attrs?.id === 'string' ? node.attrs.id : null
      if (id) referenced.add(id)
      if (node.content) walk(node.content)
    }
  }
  walk(nodes)
  const unplaced = embeds.filter((embed) => !referenced.has(embed.node_id))

  return (
    <div className="researchDocument">
      <div className="researchDocumentMeta">
        <span>{document.status}</span>
        <span>v{document.document_version}</span>
        {document.generated_by && <span>{document.generated_by}</span>}
        <span>Updated {fmtDate(document.updated_at)}</span>
      </div>
      <div className="researchProse">{nodes.length ? renderNodes(nodes, embedMap) : <p>{document.plain_text ?? 'Research notes will appear here after the scheduled assessment creates them.'}</p>}</div>
      {unplaced.length > 0 && (
        <div className="researchLibrary">
          <h3>Evidence Library</h3>
          <div className="researchEmbedGrid">{unplaced.map((embed) => <EmbedCard key={embed.id} embed={embed} />)}</div>
        </div>
      )}
    </div>
  )
}
