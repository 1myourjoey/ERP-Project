import { memo } from 'react'

interface DashboardStatCardProps {
  label: string
  value: number
  onClick?: () => void
  variant?: 'default' | 'emerald'
}

function DashboardStatCard({
  label,
  value,
  onClick,
  variant = 'default',
}: DashboardStatCardProps) {
  const isEmerald = variant === 'emerald'
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-3 ${isEmerald ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'} ${onClick ? 'cursor-pointer transition-all hover:border-blue-300 hover:shadow-sm' : ''}`}
    >
      <p className={`text-xs ${isEmerald ? 'text-emerald-600' : 'text-gray-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${isEmerald ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

export default memo(DashboardStatCard)
