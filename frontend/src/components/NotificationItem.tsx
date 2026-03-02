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
  urgent: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
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
      className={`flex w-full gap-3 border-b border-slate-200 px-4 py-3 text-left hover:bg-slate-50 ${
        !notification.is_read ? 'bg-slate-50/80' : ''
      }`}
      onClick={handleClick}
    >
      <div className="mt-1.5 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${dotClass}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon size={14} className="text-slate-500" />
          <span className="truncate text-sm font-medium text-slate-800">{notification.title}</span>
        </div>
        {notification.message && (
          <p className="line-clamp-2 text-xs text-slate-500">{notification.message}</p>
        )}
        <span className="mt-1 block text-[10px] text-slate-400">
          {notification.created_at ? formatRelativeTime(notification.created_at) : '-'}
        </span>
      </div>
    </button>
  )
}
