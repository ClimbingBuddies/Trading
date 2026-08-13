'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Point = { observed_at: string; close: number }

function tick(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

export default function PriceHistoryChart({ data }: { data: Point[] }) {
  if (data.length < 2) {
    return <div className="chartEmpty">Price history will appear after more observations are loaded.</div>
  }

  const ordered = [...data].sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime())

  return (
    <div className="chartWrap">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={ordered} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="observed_at" tickFormatter={tick} minTickGap={28} fontSize={12} />
          <YAxis domain={['auto', 'auto']} fontSize={12} width={62} />
          <Tooltip labelFormatter={(value) => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)))} />
          <Line type="monotone" dataKey="close" name="Close" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
