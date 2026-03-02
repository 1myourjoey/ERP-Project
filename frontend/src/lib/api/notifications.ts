import { api } from './client'

export interface NotificationRecord {
  id: number
  user_id: number
  category: string
  severity: 'info' | 'warning' | 'urgent'
  title: string
  message?: string | null
  target_type?: string | null
  target_id?: number | null
  action_type?: string | null
  action_url?: string | null
  action_payload?: Record<string, unknown> | null
  is_read: boolean
  read_at?: string | null
  created_at?: string | null
}

export interface NotificationListResponse {
  notifications: NotificationRecord[]
  unread_count: number
}

export async function getNotifications(params?: {
  category?: string
  unread_only?: boolean
  limit?: number
  offset?: number
}) {
  const { data } = await api.get<NotificationListResponse>('/notifications', { params })
  return data
}

export async function getUnreadCount() {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count')
  return data.count
}

export async function markNotificationRead(id: number) {
  const { data } = await api.patch<{ success: boolean }>(`/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead() {
  const { data } = await api.patch<{ marked_count: number }>('/notifications/read-all')
  return data
}
