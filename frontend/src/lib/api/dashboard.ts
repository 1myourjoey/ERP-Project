import { api } from './client'

export interface DashboardSummaryNotification {
  id: number
  title: string
  message?: string | null
  action_url?: string | null
  created_at?: string | null
}

export interface DashboardSummaryDeadline {
  type: 'task' | 'compliance' | string
  id: number
  title: string
  due_date?: string | null
}

export interface DashboardSummaryEvent {
  id: number
  title: string
  date?: string | null
  type?: string | null
  status?: string | null
}

export interface DashboardSummaryResponse {
  urgent_notifications: DashboardSummaryNotification[]
  today_tasks: {
    total: number
    completed: number
    in_progress: number
  }
  pending_approvals: {
    journals: number
    distributions: number
    fees: number
  }
  deadlines_this_week: DashboardSummaryDeadline[]
  weekly_events: DashboardSummaryEvent[]
  fund_overview: {
    active_funds: number
    total_aum: number
    next_call?: {
      id: number
      fund_id: number
      call_date: string
      total_amount: number
    } | null
  }
}

export async function fetchDashboardSummary() {
  const { data } = await api.get<DashboardSummaryResponse>('/dashboard/summary')
  return data
}
