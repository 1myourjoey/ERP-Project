import { memo } from 'react'

interface DashboardStatCardProps {
  label: string
  value: number
  onClick?: () => void
  variant?: 'default' | 'emerald' | 'danger'
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
        : {
            panel: 'border-gray-200 bg-white',
            label: 'text-gray-500',
            value: 'text-gray-900',
            suffix: 'text-gray-500',
          }

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-3 ${tone.panel} ${onClick ? 'cursor-pointer transition-all hover:border-blue-300 hover:shadow-sm' : ''}`}
    >
      <p className={`text-xs ${tone.label}`}>{label}</p>
      <div className="mt-1 flex items-end gap-1.5">
        <p className={`text-2xl font-semibold ${tone.value}`}>{value}</p>
        {valueSuffix && <p className={`pb-1 text-xs font-medium ${tone.suffix}`}>{valueSuffix}</p>}
      </div>
    </div>
  )
}

export default memo(DashboardStatCard)
