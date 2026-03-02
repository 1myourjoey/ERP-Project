import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  CheckCircle,
  FileText,
  GitBranch,
  Info,
  ListTodo,
  ShieldCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import type { NotificationRecord } from '../lib/api/notifications'
import { markNotificationRead } from '../lib/api/notifications'
import { formatRelativeTime } from '../lib/formatRelativeTime'
import { queryKeys } from '../lib/queryKeys'

const SEVERITY_DOT: Record<string, string> = {
  urgent: 'bg-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning)]',
  info: 'bg-[var(--color-secondary)]',
}

const CATEGORY_ICON = {
  task: ListTodo,
  workflow: GitBranch,
  compliance: ShieldCheck,
  capital: Banknote,
  document: FileText,
  approval: CheckCircle,
  system: Info,
} as const

interface NotificationItemProps {
  notification: NotificationRecord
  onClose: () => void
}

export default function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const markReadMutation = useMutation({
    mutationFn: () => markNotificationRead(notification.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount })
    },
  })

  const Icon = useMemo(() => {
    const key = (notification.category || 'system') as keyof typeof CATEGORY_ICON
    return CATEGORY_ICON[key] || Info
  }, [notification.category])

  const dotClass = notification.is_read
    ? 'bg-transparent'
    : (SEVERITY_DOT[notification.severity] || SEVERITY_DOT.info)

  const handleClick = () => {
    if (!notification.is_read && !markReadMutation.isPending) {
      markReadMutation.mutate()
    }
    if (notification.action_url) {
      navigate(notification.action_url)
    }
    onClose()
  }

  return (
    <button
      type="button"
      className={`w-full text-left px-4 py-3 flex gap-3 border-b border-[var(--theme-border)] hover:bg-[var(--theme-hover)] ${
        !notification.is_read ? 'bg-[var(--theme-hover)]/50' : ''
      }`}
      onClick={handleClick}
    >
      <div className="mt-1.5 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${dotClass}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon size={14} className="text-[var(--theme-text-secondary)]" />
          <span className="text-sm font-medium truncate">{notification.title}</span>
        </div>
        {notification.message && (
          <p className="text-xs text-[var(--theme-text-secondary)] line-clamp-2">{notification.message}</p>
        )}
        <span className="text-[10px] text-[var(--theme-text-secondary)] mt-1 block">
          {notification.created_at ? formatRelativeTime(notification.created_at) : '-'}
        </span>
      </div>
    </button>
  )
}
