import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { formatAnalyticsValue } from '../../../../lib/analytics/formatters'
import type { ExecutiveDonutSlice } from '../../../../lib/analytics/executiveTransform'
import { formatExecutiveNumber } from './chartUtils'

interface ExecutiveDonutChartProps {
  data: ExecutiveDonutSlice[]
}

export default function ExecutiveDonutChart({ data }: ExecutiveDonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={50} outerRadius={74} paddingAngle={2} stroke="none">
          {data.map((slice) => (
            <Cell key={slice.key} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatAnalyticsValue(value, 'number')} />
        <text x="50%" y="48%" textAnchor="middle" className="font-data fill-[#64748b] text-[11px]">
          총합
        </text>
        <text x="50%" y="58%" textAnchor="middle" className="font-data fill-[#0f1f3d] text-[14px] font-semibold">
          {formatExecutiveNumber(total, true)}
        </text>
      </PieChart>
    </ResponsiveContainer>
  )
}
