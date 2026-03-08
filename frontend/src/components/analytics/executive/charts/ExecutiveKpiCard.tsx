import type { ExecutiveMetricItem } from '../../../../lib/analytics/executiveTransform'
import ExecutiveCompactMetricValue from './ExecutiveCompactMetricValue'

interface ExecutiveKpiCardProps {
  metrics: ExecutiveMetricItem[]
  compact?: boolean
}

export default function ExecutiveKpiCard({ metrics, compact = false }: ExecutiveKpiCardProps) {
  return (
    <div className={`grid min-w-0 gap-2 ${compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
      {metrics.slice(0, 3).map((metric) => (
        <div key={metric.key} className="min-w-0 rounded-xl border border-[#d8e5fb] bg-[#f8fbff] px-3 py-2.5">
          <p className="truncate text-[11px] font-semibold text-[#64748b]" title={metric.label}>
            {metric.label}
          </p>
          <div className="mt-1 min-w-0">
            <ExecutiveCompactMetricValue
              value={metric.value}
              fieldKey={metric.key}
              className="font-data text-base font-semibold leading-tight text-[#0f1f3d] lg:text-lg"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
