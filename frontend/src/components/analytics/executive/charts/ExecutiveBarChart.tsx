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

interface ExecutiveBarChartProps {
  chart: ExecutiveCartesianData
  stacked?: boolean
}

export default function ExecutiveBarChart({ chart, stacked = false }: ExecutiveBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11 }}
          minTickGap={18}
          tickFormatter={(value) => truncateChartLabel(value, 9)}
          interval="preserveStartEnd"
          tickMargin={8}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => formatExecutiveNumber(value, true)}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          width={74}
        />
        <Tooltip formatter={(value) => formatAnalyticsValue(value, 'number')} />
        {chart.series.map((series) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            fill={series.color}
            radius={[4, 4, 0, 0]}
            stackId={stacked ? 'stack' : undefined}
            maxBarSize={24}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
