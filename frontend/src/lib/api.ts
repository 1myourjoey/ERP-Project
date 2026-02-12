import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// -- Tasks --
export const fetchTaskBoard = (status = 'pending') =>
  api.get('/tasks/board', { params: { status } }).then(r => r.data)

export const fetchTasks = (params?: { quadrant?: string; status?: string }) =>
  api.get('/tasks', { params }).then(r => r.data)

export const createTask = (data: TaskCreate) =>
  api.post('/tasks', data).then(r => r.data)

export const updateTask = (id: number, data: Partial<TaskCreate>) =>
  api.put(`/tasks/${id}`, data).then(r => r.data)

export const moveTask = (id: number, quadrant: string) =>
  api.patch(`/tasks/${id}/move`, { quadrant }).then(r => r.data)

export const completeTask = (id: number, actual_time: string) =>
  api.patch(`/tasks/${id}/complete`, { actual_time }).then(r => r.data)

export const deleteTask = (id: number) =>
  api.delete(`/tasks/${id}`)

// -- Dashboard --
export const fetchDashboard = () =>
  api.get('/dashboard/today').then(r => r.data)

// -- Workflows --
export const fetchWorkflows = () =>
  api.get('/workflows').then(r => r.data)

export const fetchWorkflow = (id: number) =>
  api.get(`/workflows/${id}`).then(r => r.data)

export const createWorkflowTemplate = (data: WorkflowTemplateInput) =>
  api.post('/workflows', data).then(r => r.data)

export const updateWorkflowTemplate = (id: number, data: WorkflowTemplateInput) =>
  api.put(`/workflows/${id}`, data).then(r => r.data)

export const deleteWorkflowTemplate = (id: number) =>
  api.delete(`/workflows/${id}`).then(r => r.data)

export const instantiateWorkflow = (id: number, data: { name: string; trigger_date: string; memo?: string }) =>
  api.post(`/workflows/${id}/instantiate`, data).then(r => r.data)

export const fetchWorkflowInstances = (status = 'active') =>
  api.get('/workflow-instances', { params: { status } }).then(r => r.data)

export const fetchWorkflowInstance = (id: number) =>
  api.get(`/workflow-instances/${id}`).then(r => r.data)

export const completeWorkflowStep = (instanceId: number, stepId: number, data: { actual_time?: string; notes?: string }) =>
  api.patch(`/workflow-instances/${instanceId}/steps/${stepId}/complete`, data).then(r => r.data)

export const cancelWorkflowInstance = (id: number) =>
  api.patch(`/workflow-instances/${id}/cancel`).then(r => r.data)

// -- WorkLogs --
export const fetchWorkLogs = (params?: { date_from?: string; date_to?: string; category?: string }) =>
  api.get('/worklogs', { params }).then(r => r.data)

export const fetchWorkLogCategories = () =>
  api.get('/worklogs/categories').then(r => r.data)

export const createWorkLog = (data: any) =>
  api.post('/worklogs', data).then(r => r.data)

export const updateWorkLog = (id: number, data: any) =>
  api.put(`/worklogs/${id}`, data).then(r => r.data)

export const deleteWorkLog = (id: number) =>
  api.delete(`/worklogs/${id}`)

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
