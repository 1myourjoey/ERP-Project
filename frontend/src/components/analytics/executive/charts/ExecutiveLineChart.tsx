import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatAnalyticsValue } from '../../../../lib/analytics/formatters'
import type { ExecutiveCartesianData } from '../../../../lib/analytics/executiveTransform'
import { formatExecutiveNumber, truncateChartLabel } from './chartUtils'

interface ExecutiveLineChartProps {
  chart: ExecutiveCartesianData
  area?: boolean
}

export default function ExecutiveLineChart({ chart, area = false }: ExecutiveLineChartProps) {
  const commonProps = {
    data: chart.data,
    margin: { top: 8, right: 12, bottom: 0, left: 4 },
  }

  if (area) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart {...commonProps}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="category"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={18}
            tickFormatter={(value) => truncateChartLabel(value, 9)}
            interval="preserveStartEnd"
            tickMargin={8}
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
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              fill={series.color}
              fillOpacity={0.16}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart {...commonProps}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={18}
          tickFormatter={(value) => truncateChartLabel(value, 9)}
          interval="preserveStartEnd"
          tickMargin={8}
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
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
