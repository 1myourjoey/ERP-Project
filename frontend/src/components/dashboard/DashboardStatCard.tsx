import { memo } from 'react'

interface DashboardStatCardProps {
  label: string
  value: number
  onClick?: () => void
  variant?: 'default' | 'emerald' | 'danger' | 'compact'
  valueSuffix?: string | null
}

function DashboardStatCard({
  label,
  value,
  onClick,
  variant = 'default',
  valueSuffix = null,
}: DashboardStatCardProps) {
  const tone =
    variant === 'emerald'
      ? {
          panel: 'border-emerald-200 bg-emerald-50',
          label: 'text-emerald-600',
          value: 'text-emerald-700',
          suffix: 'text-emerald-600',
        }
      : variant === 'danger'
        ? {
            panel: 'border-red-200 bg-red-50',
            label: 'text-red-600',
            value: 'text-red-700',
            suffix: 'text-red-600',
          }
        : variant === 'compact'
          ? {
              panel: 'border-blue-100 bg-blue-50/60',
              label: 'text-blue-700',
              value: 'text-blue-900',
              suffix: 'text-blue-700',
            }
        : {
            panel: 'border-gray-200 bg-white',
            label: 'text-gray-500',
            value: 'text-gray-900',
            suffix: 'text-gray-500',
          }
  const compactMode = variant === 'compact'

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border ${compactMode ? 'p-2.5' : 'p-3'} ${tone.panel} ${onClick ? 'cursor-pointer transition-all hover:border-blue-300 hover:shadow-sm' : ''}`}
    >
      <p className={`${compactMode ? 'text-[11px]' : 'text-xs'} ${tone.label}`}>{label}</p>
      <div className={`${compactMode ? 'mt-0.5' : 'mt-1'} flex items-end gap-1.5`}>
        <p className={`${compactMode ? 'text-xl' : 'text-2xl'} font-semibold ${tone.value}`}>{value}</p>
        {valueSuffix && <p className={`pb-1 text-xs font-medium ${tone.suffix}`}>{valueSuffix}</p>}
      </div>
    </div>
  )
}

export default memo(DashboardStatCard)
