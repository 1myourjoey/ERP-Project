import axios, { AxiosError } from 'axios'
import { pushToast } from './toastBridge'

const api = axios.create({ baseURL: '/api' })

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string }>) => {
    const message = error.response?.data?.detail || '오류가 발생했습니다.'
    pushToast('error', message)
    return Promise.reject(new Error(message))
  },
)

// -- Tasks --
export const fetchTaskBoard = (status = 'pending') => api.get('/tasks/board', { params: { status } }).then(r => r.data)
export const fetchTasks = (params?: { quadrant?: string; status?: string }) => api.get('/tasks', { params }).then(r => r.data)
export const createTask = (data: TaskCreate) => api.post('/tasks', data).then(r => r.data)
export const updateTask = (id: number, data: Partial<TaskCreate>) => api.put(`/tasks/${id}`, data).then(r => r.data)
export const moveTask = (id: number, quadrant: string) => api.patch(`/tasks/${id}/move`, { quadrant }).then(r => r.data)
export const completeTask = (id: number, actual_time: string) => api.patch(`/tasks/${id}/complete`, { actual_time }).then(r => r.data)
export const deleteTask = (id: number) => api.delete(`/tasks/${id}`)
export const generateMonthlyReminders = (yearMonth: string) =>
  api.post('/tasks/generate-monthly-reminders', null, { params: { year_month: yearMonth } }).then(r => r.data)

// -- Dashboard --
export const fetchDashboard = (): Promise<DashboardResponse> => api.get('/dashboard/today').then(r => r.data)

// -- Workflows --
export const fetchWorkflows = () => api.get('/workflows').then(r => r.data)
export const fetchWorkflow = (id: number) => api.get(`/workflows/${id}`).then(r => r.data)
export const createWorkflowTemplate = (data: WorkflowTemplateInput) => api.post('/workflows', data).then(r => r.data)
export const updateWorkflowTemplate = (id: number, data: WorkflowTemplateInput) => api.put(`/workflows/${id}`, data).then(r => r.data)
export const deleteWorkflowTemplate = (id: number) => api.delete(`/workflows/${id}`).then(r => r.data)
export const instantiateWorkflow = (id: number, data: { name: string; trigger_date: string; memo?: string }) => api.post(`/workflows/${id}/instantiate`, data).then(r => r.data)
export const fetchWorkflowInstances = (status = 'active') => api.get('/workflow-instances', { params: { status } }).then(r => r.data)
export const fetchWorkflowInstance = (id: number) => api.get(`/workflow-instances/${id}`).then(r => r.data)
export const completeWorkflowStep = (instanceId: number, stepId: number, data: { actual_time?: string; notes?: string }) => api.patch(`/workflow-instances/${instanceId}/steps/${stepId}/complete`, data).then(r => r.data)
export const cancelWorkflowInstance = (id: number) => api.patch(`/workflow-instances/${id}/cancel`).then(r => r.data)

// -- Funds --
export const fetchFunds = (): Promise<Fund[]> => api.get('/funds').then(r => r.data)
export const fetchFund = (id: number): Promise<Fund> => api.get(`/funds/${id}`).then(r => r.data)
export const createFund = (data: FundInput) => api.post('/funds', data).then(r => r.data)
export const updateFund = (id: number, data: Partial<FundInput>) => api.put(`/funds/${id}`, data).then(r => r.data)
export const deleteFund = (id: number) => api.delete(`/funds/${id}`)
export const fetchFundLPs = (fundId: number): Promise<LP[]> => api.get(`/funds/${fundId}/lps`).then(r => r.data)
export const createFundLP = (fundId: number, data: LPInput) => api.post(`/funds/${fundId}/lps`, data).then(r => r.data)
export const updateFundLP = (fundId: number, lpId: number, data: Partial<LPInput>) => api.put(`/funds/${fundId}/lps/${lpId}`, data).then(r => r.data)
export const deleteFundLP = (fundId: number, lpId: number) => api.delete(`/funds/${fundId}/lps/${lpId}`)

// -- Investments --
export const fetchCompanies = (): Promise<Company[]> => api.get('/companies').then(r => r.data)
export const createCompany = (data: CompanyInput) => api.post('/companies', data).then(r => r.data)
export const updateCompany = (id: number, data: Partial<CompanyInput>) => api.put(`/companies/${id}`, data).then(r => r.data)
export const deleteCompany = (id: number) => api.delete(`/companies/${id}`)

export const fetchInvestments = (params?: { fund_id?: number; company_id?: number; status?: string }) => api.get('/investments', { params }).then(r => r.data)
export const fetchInvestment = (id: number) => api.get(`/investments/${id}`).then(r => r.data)
export const createInvestment = (data: InvestmentInput) => api.post('/investments', data).then(r => r.data)
export const updateInvestment = (id: number, data: Partial<InvestmentInput>) => api.put(`/investments/${id}`, data).then(r => r.data)
export const deleteInvestment = (id: number) => api.delete(`/investments/${id}`)

export const fetchInvestmentDocuments = (investmentId: number) => api.get(`/investments/${investmentId}/documents`).then(r => r.data)
export const createInvestmentDocument = (investmentId: number, data: InvestmentDocumentInput) => api.post(`/investments/${investmentId}/documents`, data).then(r => r.data)
export const updateInvestmentDocument = (investmentId: number, documentId: number, data: Partial<InvestmentDocumentInput>) => api.put(`/investments/${investmentId}/documents/${documentId}`, data).then(r => r.data)
export const deleteInvestmentDocument = (investmentId: number, documentId: number) => api.delete(`/investments/${investmentId}/documents/${documentId}`)

// -- Checklist --
export const fetchChecklists = () => api.get('/checklists').then(r => r.data)
export const fetchChecklist = (id: number) => api.get(`/checklists/${id}`).then(r => r.data)
export const createChecklist = (data: ChecklistInput) => api.post('/checklists', data).then(r => r.data)
export const updateChecklist = (id: number, data: Partial<ChecklistInput>) => api.put(`/checklists/${id}`, data).then(r => r.data)
export const deleteChecklist = (id: number) => api.delete(`/checklists/${id}`)
export const createChecklistItem = (checklistId: number, data: ChecklistItemInput) => api.post(`/checklists/${checklistId}/items`, data).then(r => r.data)
export const updateChecklistItem = (checklistId: number, itemId: number, data: Partial<ChecklistItemInput>) => api.put(`/checklists/${checklistId}/items/${itemId}`, data).then(r => r.data)
export const deleteChecklistItem = (checklistId: number, itemId: number) => api.delete(`/checklists/${checklistId}/items/${itemId}`)

// -- Document Status --
export const fetchDocumentStatus = (params?: { status?: string; fund_id?: number; company_id?: number }): Promise<DocumentStatusItem[]> => api.get('/document-status', { params }).then(r => r.data)

// -- Calendar --
export const fetchCalendarEvents = (params?: { date_from?: string; date_to?: string; status?: string }): Promise<CalendarEvent[]> => api.get('/calendar-events', { params }).then(r => r.data)
export const createCalendarEvent = (data: CalendarEventInput) => api.post('/calendar-events', data).then(r => r.data)
export const updateCalendarEvent = (id: number, data: Partial<CalendarEventInput>) => api.put(`/calendar-events/${id}`, data).then(r => r.data)
export const deleteCalendarEvent = (id: number) => api.delete(`/calendar-events/${id}`)

// -- WorkLogs --
export const fetchWorkLogs = (params?: { date_from?: string; date_to?: string; category?: string }) => api.get('/worklogs', { params }).then(r => r.data)
export const fetchWorkLogCategories = () => api.get('/worklogs/categories').then(r => r.data)
export const createWorkLog = (data: WorkLogInput) => api.post('/worklogs', data).then(r => r.data)
export const updateWorkLog = (id: number, data: Partial<WorkLogInput>) => api.put(`/worklogs/${id}`, data).then(r => r.data)
export const deleteWorkLog = (id: number) => api.delete(`/worklogs/${id}`)

// -- Types --
export interface DashboardResponse {
  date: string
  day_of_week: string
  monthly_reminder: boolean
  today: { tasks: Task[]; total_estimated_time: string }
  tomorrow: { tasks: Task[]; total_estimated_time: string }
  this_week: Task[]
  upcoming: Task[]
  active_workflows: ActiveWorkflow[]
  fund_summary: FundSummary[]
  missing_documents: MissingDocument[]
}

export interface ActiveWorkflow {
  id: number
  name: string
  progress: string
  next_step: string | null
}

export interface FundSummary {
  id: number
  name: string
  type: string
  status: string
  commitment_total: number | null
  aum: number | null
  lp_count: number
  investment_count: number
}

export interface MissingDocument {
  id: number
  investment_id: number
  document_name: string
  document_type: string | null
  status: string
  company_name: string
  fund_name: string
}

export interface TaskCreate {
  title: string
  deadline?: string | null
  estimated_time?: string | null
  quadrant?: string
  memo?: string | null
  delegate_to?: string | null
}

export interface Task {
  id: number
  title: string
  deadline: string | null
  estimated_time: string | null
  quadrant: string
  memo: string | null
  status: string
  delegate_to: string | null
  created_at: string | null
  completed_at: string | null
  actual_time: string | null
  workflow_instance_id: number | null
  workflow_step_order: number | null
}

export interface TaskBoard {
  Q1: Task[]
  Q2: Task[]
  Q3: Task[]
  Q4: Task[]
}

export interface WorkflowStepInput {
  order: number
  name: string
  timing: string
  timing_offset_days: number
  estimated_time?: string | null
  quadrant?: string
  memo?: string | null
}

export interface WorkflowDocumentInput {
  name: string
  required: boolean
  timing?: string | null
  notes?: string | null
}

export interface WorkflowWarningInput {
  content: string
}

export interface WorkflowTemplateInput {
  name: string
  trigger_description?: string | null
  category?: string | null
  total_duration?: string | null
  steps: WorkflowStepInput[]
  documents: WorkflowDocumentInput[]
  warnings: WorkflowWarningInput[]
}

export interface Fund {
  id: number
  name: string
  type: string
  formation_date: string | null
  status: string
  gp: string | null
  co_gp: string | null
  trustee: string | null
  commitment_total: number | null
  aum: number | null
  lp_count?: number
  investment_count?: number
  lps?: LP[]
}

export interface FundInput {
  name: string
  type: string
  formation_date?: string | null
  status?: string
  gp?: string | null
  co_gp?: string | null
  trustee?: string | null
  commitment_total?: number | null
  aum?: number | null
}

export interface LPInput {
  name: string
  type: string
  commitment?: number | null
  paid_in?: number | null
  contact?: string | null
}

export interface LP {
  id: number
  fund_id: number
  name: string
  type: string
  commitment: number | null
  paid_in: number | null
  contact: string | null
}

export interface Company {
  id: number
  name: string
  business_number: string | null
  ceo: string | null
  address: string | null
  industry: string | null
  vics_registered: boolean
}

export interface CompanyInput {
  name: string
  business_number?: string | null
  ceo?: string | null
  address?: string | null
  industry?: string | null
  vics_registered?: boolean
}

export interface InvestmentInput {
  fund_id: number
  company_id: number
  investment_date?: string | null
  amount?: number | null
  shares?: number | null
  share_price?: number | null
  valuation?: number | null
  contribution_rate?: string | null
  instrument?: string | null
  status?: string
}

export interface InvestmentDocumentInput {
  name: string
  doc_type?: string | null
  status?: string
  note?: string | null
}

export interface ChecklistItemInput {
  order: number
  name: string
  required?: boolean
  checked?: boolean
  notes?: string | null
}

export interface ChecklistInput {
  name: string
  category?: string | null
  items: ChecklistItemInput[]
}

export interface DocumentStatusItem {
  id: number
  investment_id: number
  document_name: string
  document_type: string | null
  status: string
  note: string | null
  company_name: string
  fund_name: string
}

export interface CalendarEventInput {
  title: string
  date: string
  time?: string | null
  duration?: number | null
  description?: string | null
  status?: string
  task_id?: number | null
}

export interface CalendarEvent {
  id: number
  title: string
  date: string
  time: string | null
  duration: number | null
  description: string | null
  status: string
  task_id: number | null
  quadrant: string | null
}

export interface WorkLogInput {
  date: string
  category: string
  title: string
  content?: string | null
  status?: string
  estimated_time?: string | null
  actual_time?: string | null
  time_diff?: string | null
  task_id?: number | null
  details?: { content: string; order?: number }[]
  lessons?: { content: string; order?: number }[]
  follow_ups?: { content: string; target_date?: string | null; order?: number }[]
}


