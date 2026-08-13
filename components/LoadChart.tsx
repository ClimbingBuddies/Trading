'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function LoadChart({ data }: { data: { date: string; runs: number; inserted: number }[] }) {
  const hasData = data.some((item) => item.inserted > 0 || item.runs > 0)
  if (!hasData) return <div className="chartEmpty">Observation volume will appear here after market data is loaded.</div>

  return (
    <div className="chartWrap">
      <ResponsiveContainer width="100%" height={255}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} fontSize={11} axisLine={false} tickLine={false} />
          <YAxis fontSize={11} allowDecimals={false} axisLine={false} tickLine={false} />
          <Tooltip />
          <Bar dataKey="inserted" name="Observations inserted" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
