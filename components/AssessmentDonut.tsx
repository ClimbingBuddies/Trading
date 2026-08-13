'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const colours = [
  'var(--chart-3)',
  'var(--chart-1)',
  'var(--chart-4)',
  'var(--chart-6)',
  'var(--chart-5)',
  'var(--chart-2)',
]

type Item = { rating: string; count: number; avgConfidence: number | null }

export default function AssessmentDonut({ data }: { data: Item[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0)

  if (!total) {
    return <div className="chartEmpty">No assessment ratings have been loaded yet.</div>
  }

  return (
    <div className="donutWrap">
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="rating" innerRadius={58} outerRadius={86} paddingAngle={2}>
            {data.map((item, index) => <Cell key={item.rating} fill={colours[index % colours.length]} />)}
          </Pie>
          <Tooltip formatter={(value) => [`${value}`, 'Assessments']} />
          <Legend verticalAlign="bottom" height={28} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donutCentre" aria-hidden="true"><strong>{total}</strong><span>assessed</span></div>
    </div>
  )
}
