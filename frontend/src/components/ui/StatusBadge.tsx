import {
  AlertTriangle,
  Check,
  Circle,
  Clock3,
  Info,
  type LucideIcon,
  X,
} from 'lucide-react'

import { STATUS_COLORS } from '../../lib/constants'

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'overdue'
  label: string
  size?: 'sm' | 'md'
  showIcon?: boolean
}

const ICON_MAP: Record<StatusBadgeProps['status'], LucideIcon> = {
  success: Check,
  warning: AlertTriangle,
  danger: X,
  info: Info,
  pending: Circle,
  overdue: Clock3,
}

export function StatusBadge({ status, label, size = 'sm', showIcon = true }: StatusBadgeProps) {
  const Icon = ICON_MAP[status]
  const colorClass = STATUS_COLORS[status].bg
  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-[11px]'

  return (
    <span className={`tag ${colorClass} ${sizeClass} inline-flex items-center gap-1 border border-transparent`}>
      {showIcon && <Icon size={size === 'md' ? 13 : 12} />}
      <span>{label}</span>
    </span>
  )
}

export default StatusBadge
