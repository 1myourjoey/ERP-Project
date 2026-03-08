import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatAnalyticsValue } from '../../../../lib/analytics/formatters'
import type { ExecutiveCartesianData } from '../../../../lib/analytics/executiveTransform'
import { formatExecutiveNumber, truncateChartLabel } from './chartUtils'

interface ExecutiveRankedBarChartProps {
  chart: ExecutiveCartesianData
}

export default function ExecutiveRankedBarChart({ chart }: ExecutiveRankedBarChartProps) {
  const series = chart.series[0]
  if (!series) return null

  const maxLabelLength = chart.data.reduce((max, item) => {
    const label = String(item.category ?? '')
    return Math.max(max, label.length)
  }, 0)
  const labelWidth = Math.min(172, Math.max(116, maxLabelLength * 7))
  const labelMaxLength = Math.max(12, Math.floor(labelWidth / 8))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chart.data} layout="vertical" margin={{ top: 6, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => formatExecutiveNumber(value, true)}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => truncateChartLabel(value, labelMaxLength)}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          width={labelWidth}
        />
        <Tooltip formatter={(value) => formatAnalyticsValue(value, 'number')} />
        <Bar dataKey={series.key} name={series.label} fill={series.color} radius={[0, 6, 6, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}
