import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// -- Tasks --
export const fetchTaskBoard = (status = 'pending') => api.get('/tasks/board', { params: { status } }).then(r => r.data)
export const fetchTasks = (params?: { quadrant?: string; status?: string }) => api.get('/tasks', { params }).then(r => r.data)
export const createTask = (data: TaskCreate) => api.post('/tasks', data).then(r => r.data)
export const updateTask = (id: number, data: Partial<TaskCreate>) => api.put(`/tasks/${id}`, data).then(r => r.data)
export const moveTask = (id: number, quadrant: string) => api.patch(`/tasks/${id}/move`, { quadrant }).then(r => r.data)
export const completeTask = (id: number, actual_time: string) => api.patch(`/tasks/${id}/complete`, { actual_time }).then(r => r.data)
export const deleteTask = (id: number) => api.delete(`/tasks/${id}`)

// -- Dashboard --
export const fetchDashboard = () => api.get('/dashboard/today').then(r => r.data)

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
export const fetchFunds = () => api.get('/funds').then(r => r.data)
export const fetchFund = (id: number) => api.get(`/funds/${id}`).then(r => r.data)
export const createFund = (data: FundInput) => api.post('/funds', data).then(r => r.data)
export const updateFund = (id: number, data: Partial<FundInput>) => api.put(`/funds/${id}`, data).then(r => r.data)
export const deleteFund = (id: number) => api.delete(`/funds/${id}`)
export const fetchFundLPs = (fundId: number) => api.get(`/funds/${fundId}/lps`).then(r => r.data)
export const createFundLP = (fundId: number, data: LPInput) => api.post(`/funds/${fundId}/lps`, data).then(r => r.data)
export const updateFundLP = (fundId: number, lpId: number, data: Partial<LPInput>) => api.put(`/funds/${fundId}/lps/${lpId}`, data).then(r => r.data)
export const deleteFundLP = (fundId: number, lpId: number) => api.delete(`/funds/${fundId}/lps/${lpId}`)

// -- Investments --
export const fetchCompanies = () => api.get('/companies').then(r => r.data)
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

// -- WorkLogs --
export const fetchWorkLogs = (params?: { date_from?: string; date_to?: string; category?: string }) => api.get('/worklogs', { params }).then(r => r.data)
export const fetchWorkLogCategories = () => api.get('/worklogs/categories').then(r => r.data)
export const createWorkLog = (data: any) => api.post('/worklogs', data).then(r => r.data)
export const updateWorkLog = (id: number, data: any) => api.put(`/worklogs/${id}`, data).then(r => r.data)
export const deleteWorkLog = (id: number) => api.delete(`/worklogs/${id}`)

// -- Types --
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
