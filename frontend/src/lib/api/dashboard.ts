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

export interface DashboardHealthDomain {
  score: number
  factors: Record<string, unknown>
  label: string
  severity: 'good' | 'warning' | 'danger'
}

export interface DashboardHealthAlert {
  type: string
  message: string
  domain: string
  action_url: string
}

export interface DashboardHealthResponse {
  overall_score: number
  domains: {
    tasks: DashboardHealthDomain
    funds: DashboardHealthDomain
    investment_review: DashboardHealthDomain
    compliance: DashboardHealthDomain
    reports: DashboardHealthDomain
    documents: DashboardHealthDomain
    [key: string]: DashboardHealthDomain
  }
  alerts: DashboardHealthAlert[]
}

export interface DashboardDeadlineItem {
  type: 'task' | 'report' | 'document' | 'compliance'
  id: number
  title: string
  due_date: string | null
  days_remaining: number | null
  context: string | null
  action_url: string
  severity: 'good' | 'warning' | 'danger'
}

export interface DashboardDeadlinesResponse {
  generated_at: string
  today_priorities: DashboardDeadlineItem[]
  this_week_deadlines: DashboardDeadlineItem[]
}

export interface DashboardFundSnapshotItem {
  id: number
  name: string
  nav: number
  lp_count: number
  contribution_rate: number | null
  compliance_status: 'good' | 'warning' | 'danger'
  compliance_overdue: number
  missing_documents: number
}

export interface DashboardFundsSnapshotResponse {
  rows: DashboardFundSnapshotItem[]
  totals: {
    total_nav: number
    total_lp_count: number
    total_missing_documents: number
  }
}

export interface DashboardPipelineStageItem {
  stage: string
  count: number
}

export interface DashboardPipelineResponse {
  total_count: number
  stages: DashboardPipelineStageItem[]
}

export async function fetchDashboardSummary() {
  const { data } = await api.get<DashboardSummaryResponse>('/dashboard/summary')
  return data
}

export async function fetchDashboardHealth() {
  const { data } = await api.get<DashboardHealthResponse>('/dashboard/health')
  return data
}

export async function fetchDashboardDeadlines() {
  const { data } = await api.get<DashboardDeadlinesResponse>('/dashboard/deadlines')
  return data
}

export async function fetchDashboardFundsSnapshot() {
  const { data } = await api.get<DashboardFundsSnapshotResponse>('/dashboard/funds-snapshot')
  return data
}

export async function fetchDashboardPipeline() {
  const { data } = await api.get<DashboardPipelineResponse>('/dashboard/pipeline')
  return data
}
