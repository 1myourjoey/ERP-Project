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
          panel: 'border-[#bbf7d0] bg-[#f0fdf4]',
          label: 'text-green-600',
          value: 'text-green-700',
          suffix: 'text-green-600',
        }
      : variant === 'danger'
        ? {
            panel: 'border-[#fecaca] bg-[#fef2f2]',
            label: 'text-red-500',
            value: 'text-red-700',
            suffix: 'text-red-600',
          }
        : variant === 'warning'
          ? {
              panel: 'border-[#fde68a] bg-[#fffbeb]',
              label: 'text-amber-600',
              value: 'text-amber-700',
              suffix: 'text-amber-700',
            }
        : {
            panel: 'border-[#e2e8f0] bg-white',
            label: 'text-slate-500',
            value: 'text-slate-900',
            suffix: 'text-slate-500',
          }

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 shadow-sm ${tone.panel} ${onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
    >
      <p className={`text-sm ${tone.label}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone.value}`}>{value}</p>
      {valueSuffix && <p className={`mt-1 text-xs font-medium ${tone.suffix}`}>{valueSuffix}</p>}
    </div>
  )
}

export default memo(DashboardStatCard)
