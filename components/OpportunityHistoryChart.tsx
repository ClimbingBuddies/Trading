'use client'

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type OpportunityHistoryPoint = {
  date: string
  opportunity: number | null
  structural: number | null
  technology: number | null
}

export default function OpportunityHistoryChart({ data }: { data: OpportunityHistoryPoint[] }) {
  if (!data.length) return <div className="emptyCompact">No Opportunity Assessment history is available yet.</div>

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} width={36} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="opportunity" name="Opportunity" stroke="var(--chart-1)" strokeWidth={3} dot={false} connectNulls />
          <Line type="monotone" dataKey="structural" name="Structural" stroke="var(--chart-3)" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="technology" name="Technology Inflection" stroke="var(--chart-5)" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
