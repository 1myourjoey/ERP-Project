import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getNotifications,
  markAllNotificationsRead,
  type NotificationListResponse,
} from '../lib/api/notifications'
import { queryKeys } from '../lib/queryKeys'
import NotificationItem from './NotificationItem'

interface NotificationPanelProps {
  onClose: () => void
}

type NotificationTab = 'all' | 'task' | 'approval' | 'compliance'

const TABS: Array<{ key: NotificationTab; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'task', label: '업무' },
  { key: 'approval', label: '승인' },
  { key: 'compliance', label: '마감' },
]

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<NotificationTab>('all')

  const params = useMemo(
    () => ({
      category: activeTab === 'all' ? undefined : activeTab,
      limit: 50,
    }),
    [activeTab],
  )

  const { data, isLoading } = useQuery<NotificationListResponse>({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => getNotifications(params),
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount })
    },
  })

  return (
    <div className="card-base absolute right-0 top-full z-50 mt-2 flex max-h-[480px] w-[22rem] flex-col p-0 shadow-xl">
      <div className="flex items-center justify-between border-b border-[#d8e5fb] px-4 py-3">
        <span className="text-sm font-semibold">알림</span>
        <button
          type="button"
          className="secondary-btn btn-sm"
          onClick={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending}
        >
          전체 읽음
        </button>
      </div>

      <div className="flex gap-1 border-b border-[#d8e5fb] px-3 py-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`rounded px-2 py-1 text-xs transition-colors ${
              activeTab === tab.key
                ? 'bg-[#fff7d6] text-[#0f1f3d]'
                : 'text-[#64748b] hover:bg-[#fff7d6]'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-4 py-10 text-center text-sm text-[#64748b]">
            알림을 불러오는 중...
          </div>
        )}

        {!isLoading && (data?.notifications?.length || 0) === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[#64748b]">
            알림이 없습니다.
          </div>
        )}

        {!isLoading &&
          data?.notifications?.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} onClose={onClose} />
          ))}
      </div>
    </div>
  )
}
