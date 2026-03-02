import { memo } from 'react'

interface DashboardStatCardProps {
  label: string
  value: number
  onClick?: () => void
  variant?: 'default' | 'danger' | 'success' | 'warning'
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
    variant === 'success'
      ? {
          panel: 'border-emerald-200 bg-emerald-50',
          label: 'text-emerald-700',
          value: 'text-emerald-800',
          suffix: 'text-emerald-700',
        }
      : variant === 'danger'
        ? {
            panel: 'border-red-200 bg-red-50',
            label: 'text-red-600',
            value: 'text-red-700',
            suffix: 'text-red-600',
          }
        : variant === 'warning'
          ? {
              panel: 'border-amber-200 bg-amber-50',
              label: 'text-amber-600',
              value: 'text-amber-700',
              suffix: 'text-amber-700',
            }
        : {
            panel: 'border-slate-200 bg-white',
            label: 'text-slate-500',
            value: 'text-slate-900',
            suffix: 'text-slate-500',
          }

  return (
    <div
      onClick={onClick}
      className={`flex min-h-[120px] h-full flex-col justify-between rounded-xl border p-4 shadow-sm ${tone.panel} ${onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
    >
      <p className={`text-sm ${tone.label}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none ${tone.value}`}>{value}</p>
      <p className={`mt-1 min-h-4 text-xs font-medium ${tone.suffix}`}>{valueSuffix || '\u00a0'}</p>
    </div>
  )
}

export default memo(DashboardStatCard)
