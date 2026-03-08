import { formatAnalyticsValue } from '../../../../lib/analytics/formatters'
import { formatExecutiveNumber } from './chartUtils'

interface ExecutiveCompactMetricValueProps {
  value: unknown
  fieldKey?: string
  className?: string
  align?: 'left' | 'right' | 'center'
}

export default function ExecutiveCompactMetricValue({
  value,
  fieldKey,
  className = '',
  align = 'left',
}: ExecutiveCompactMetricValueProps) {
  const fullValue = formatAnalyticsValue(value, 'number', fieldKey)
  const compactValue = formatExecutiveNumber(value, true)
  const showTooltip = compactValue !== fullValue

  return (
    <span
      className={`group/value relative inline-flex max-w-full ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}
      title={showTooltip ? undefined : fullValue}
    >
      <span className={`block max-w-full truncate ${className}`}>{compactValue}</span>
      {showTooltip && (
        <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden whitespace-nowrap rounded-md border border-[#d8e5fb] bg-white px-2 py-1 font-data text-[11px] font-semibold text-[#0f1f3d] shadow-md group-hover/value:block">
          {fullValue}
        </span>
      )}
    </span>
  )
}
