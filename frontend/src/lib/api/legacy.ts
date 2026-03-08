import axios, { AxiosError } from 'axios'
import { pushToast } from '../toastBridge'

export const api = axios.create({ baseURL: '/api' })
const ACCESS_TOKEN_KEY = 'von_access_token'
const REFRESH_TOKEN_KEY = 'von_refresh_token'
const AUTH_DISABLED =
  String(import.meta.env.VITE_AUTH_DISABLED ?? '').trim().toLowerCase() === 'true'

type RetriableRequestConfig = {
  _retry?: boolean
  url?: string
  headers?: unknown
}

let refreshPromise: Promise<LoginResponse | null> | null = null

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setAuthTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

async function requestTokenRefresh(): Promise<LoginResponse | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  try {
    const response = await axios.post<LoginResponse>('/api/auth/refresh', { refresh_token: refreshToken })
    const payload = response.data
    setAuthTokens(payload.access_token, payload.refresh_token)
    return payload
  } catch {
    clearAuthTokens()
    return null
  }
}

async function tryRefreshToken(): Promise<LoginResponse | null> {
  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function refreshAuthToken(): Promise<LoginResponse | null> {
  if (AUTH_DISABLED) return null
  return tryRefreshToken()
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    const headers = (config.headers ?? {}) as Record<string, string>
    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${token}`
    }
    config.headers = headers as any
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string }>) => {
    const status = error.response?.status ?? null
    const detail = (error.response?.data?.detail || '').trim()
    const original = (error.config ?? {}) as RetriableRequestConfig
    const requestUrl = String(original.url || '')
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/google') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/register-with-invite') ||
      requestUrl.includes('/auth/check-username') ||
      requestUrl.includes('/auth/check-email') ||
      requestUrl.includes('/auth/forgot-password') ||
      requestUrl.includes('/auth/reset-password')

    if (status === 401 && AUTH_DISABLED) {
      const message = detail || '인증 비활성화 모드에서 인증 오류가 발생했습니다.'
      pushToast('warning', message)
      return Promise.reject(new Error(message))
    }

    if (status === 401 && !isAuthEndpoint && !original._retry) {
      original._retry = true
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        const headers = (original.headers ?? {}) as Record<string, string>
        headers.Authorization = `Bearer ${refreshed.access_token}`
        original.headers = headers
        return api(original as any)
      }
      clearAuthTokens()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(new Error('인증이 만료되었습니다.'))
    }

    let toastType: 'error' | 'warning' | 'info' = 'error'
    let message = detail || '오류가 발생했습니다.'

    if (!error.response) {
      message = '네트워크 연결을 확인해 주세요.'
    } else if (status === 409) {
      toastType = 'warning'
      message = detail || '이미 존재하는 데이터입니다.'
    } else if (status === 422) {
      toastType = 'info'
      message = detail || '입력값을 확인해 주세요.'
    } else if (status !== null && status >= 500) {
      message = detail || '서버 오류가 발생했습니다. 다시 시도해 주세요.'
    } else if (status === 400) {
      toastType = 'info'
      message = detail || '요청 값을 확인해 주세요.'
    }

    pushToast(toastType, message)
    return Promise.reject(new Error(message))
  },
)
// -- Tasks --
export const fetchTaskBoard = (status = 'pending', year?: number, month?: number) =>
  api.get('/tasks/board', { params: { status, year, month } }).then(r => r.data)
export const fetchTasks = (
  params?: { quadrant?: string; status?: string; fund_id?: number; gp_entity_id?: number; category?: string },
) => api.get('/tasks', { params }).then(r => r.data)
export const fetchTask = (id: number): Promise<Task> => api.get(`/tasks/${id}`).then(r => r.data)
export const fetchTaskAttachments = (id: number): Promise<Attachment[]> =>
  api.get(`/tasks/${id}/attachments`).then(r => r.data)
export const fetchTaskCompletionCheck = (id: number): Promise<TaskCompletionCheckResult> =>
  api.get(`/tasks/${id}/completion-check`).then(r => r.data)
export const linkAttachmentToTask = (
  taskId: number,
  data: TaskAttachmentLinkInput,
): Promise<TaskAttachmentLinkResult> => api.post(`/tasks/${taskId}/link-attachment`, data).then(r => r.data)
export const unlinkAttachmentFromTask = (taskId: number, attachmentId: number): Promise<void> =>
  api.delete(`/tasks/${taskId}/unlink-attachment/${attachmentId}`).then(() => undefined)
export const fetchTaskCategories = (): Promise<TaskCategory[]> => api.get('/task-categories').then(r => r.data)
export const createTaskCategory = (name: string): Promise<TaskCategory> =>
  api.post('/task-categories', { name }).then(r => r.data)
export const deleteTaskCategory = (id: number): Promise<void> => api.delete(`/task-categories/${id}`).then(() => undefined)
export const createTask = (data: TaskCreate) => api.post('/tasks', data).then(r => r.data)
export const updateTask = (id: number, data: Partial<TaskCreate>) => api.put(`/tasks/${id}`, data).then(r => r.data)
export const moveTask = (id: number, quadrant: string) => api.patch(`/tasks/${id}/move`, { quadrant }).then(r => r.data)
export const completeTask = (
  id: number,
  actual_time: string,
  auto_worklog: boolean,
  memo?: string,
) => api.patch(`/tasks/${id}/complete`, { actual_time, auto_worklog, memo: memo || null }).then(r => r.data)
export const undoCompleteTask = (id: number) => api.patch(`/tasks/${id}/undo-complete`).then(r => r.data)
export const deleteTask = (id: number) => api.delete(`/tasks/${id}`)
export const bulkCompleteTasks = (data: {
  task_ids: number[]
  actual_time: string
  auto_worklog: boolean
}): Promise<{ completed_count: number; skipped_count: number }> =>
  api.post('/tasks/bulk-complete', data).then(r => r.data)
export const bulkDeleteTasks = (data: { task_ids: number[] }): Promise<{ deleted_count: number }> =>
  api.post('/tasks/bulk-delete', data).then(r => r.data)
export const generateMonthlyReminders = (yearMonth: string) =>
  api.post('/tasks/generate-monthly-reminders', null, { params: { year_month: yearMonth } }).then(r => r.data)

// -- Dashboard --
export const fetchDashboard = (): Promise<DashboardResponse> => api.get('/dashboard/today').then(r => r.data)
export const fetchDashboardBase = (): Promise<DashboardBaseResponse> => api.get('/dashboard/base').then(r => r.data)
export const fetchDashboardWorkflows = (): Promise<DashboardWorkflowsResponse> => api.get('/dashboard/workflows').then(r => r.data)
export const fetchDashboardSidebar = (): Promise<DashboardSidebarResponse> => api.get('/dashboard/sidebar').then(r => r.data)
export const fetchDashboardCompleted = (): Promise<DashboardCompletedResponse> => api.get('/dashboard/completed').then(r => r.data)
export const fetchUpcomingNotices = (days = 30): Promise<UpcomingNotice[]> =>
  api.get('/dashboard/upcoming-notices', { params: { days } }).then(r => r.data)
export const fetchComplianceRules = (
  params?: { fund_id?: number; level?: string; category?: string; active_only?: boolean },
): Promise<ComplianceRule[]> =>
  api.get('/compliance/rules', { params }).then(r => r.data)
export const fetchComplianceRule = (ruleCode: string): Promise<ComplianceRule> =>
  api.get(`/compliance/rules/${ruleCode}`).then(r => r.data)
export const createComplianceRule = (data: ComplianceRuleCreateInput): Promise<ComplianceRule> =>
  api.post('/compliance/rules', data).then(r => r.data)
export const updateComplianceRule = (ruleId: number, data: ComplianceRuleUpdateInput): Promise<ComplianceRule> =>
  api.put(`/compliance/rules/${ruleId}`, data).then(r => r.data)
export const deleteComplianceRule = (ruleId: number): Promise<{ deleted: boolean; id: number }> =>
  api.delete(`/compliance/rules/${ruleId}`).then(r => r.data)
export const runComplianceCheck = (
  fundId: number,
  triggerType: 'manual' | 'event' | 'scheduled' = 'manual',
): Promise<ComplianceManualCheckResponse> =>
  api.post(`/compliance/check/${fundId}`, null, { params: { trigger_type: triggerType } }).then(r => r.data)
export const fetchComplianceChecks = (
  params?: { fund_id?: number; result?: string; limit?: number },
): Promise<ComplianceCheckRecord[]> =>
  api.get('/compliance/checks', { params }).then(r => r.data)
export const fetchComplianceDocuments = (activeOnly = false): Promise<ComplianceDocument[]> =>
  api.get('/compliance/documents', { params: { active_only: activeOnly } }).then(r => r.data)
export const createComplianceDocument = (data: ComplianceDocumentCreateInput): Promise<ComplianceDocument> =>
  api.post('/compliance/documents', data).then(r => r.data)
export const fetchLegalDocuments = (): Promise<LegalDocument[]> =>
  api.get('/legal-documents').then(r => r.data)
export const fetchLegalDocumentStats = (): Promise<LegalDocumentStatsResponse> =>
  api.get('/legal-documents/stats').then(r => r.data)
export const searchLegalDocuments = (
  params: { query: string; collection?: LegalDocumentType | string; n_results?: number },
): Promise<LegalDocumentSearchResponse> =>
  api.get('/legal-documents/search', { params }).then(r => r.data)
export const uploadLegalDocument = (payload: LegalDocumentUploadInput): Promise<LegalDocumentUploadResponse> => {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('title', payload.title)
  formData.append('document_type', payload.document_type)
  if (payload.version) {
    formData.append('version', payload.version)
  }
  if (payload.fund_id != null) {
    formData.append('fund_id', String(payload.fund_id))
  }
  if (payload.fund_type_filter) {
    formData.append('fund_type_filter', payload.fund_type_filter)
  }
  return api.post('/legal-documents/upload', formData).then(r => r.data)
}
export const deleteLegalDocument = (id: number): Promise<{ deleted: boolean; id: number }> =>
  api.delete(`/legal-documents/${id}`).then(r => r.data)
export const fetchComplianceObligations = (
  params?: { fund_id?: number; status?: string; period?: string; category?: string },
): Promise<ComplianceObligation[]> =>
  api.get('/compliance/obligations', { params }).then(r => r.data)
export const completeComplianceObligation = (
  obligationId: number,
  data: { completed_by: string; evidence_note?: string | null },
): Promise<ComplianceObligation> =>
  api.post(`/compliance/obligations/${obligationId}/complete`, data).then(r => r.data)
export const waiveComplianceObligation = (
  obligationId: number,
  data: { reason?: string | null },
): Promise<ComplianceObligation> =>
  api.post(`/compliance/obligations/${obligationId}/waive`, data).then(r => r.data)
export const fetchComplianceDashboard = (): Promise<ComplianceDashboardSummary> =>
  api.get('/compliance/dashboard').then(r => r.data)
export const generateCompliancePeriodic = (data: { year: number; month: number }): Promise<{ year: number; month: number; generated: number; skipped: number }> =>
  api.post('/compliance/generate-periodic', data).then(r => r.data)
export const checkInvestmentLimits = (
  data: ComplianceLimitCheckRequest,
): Promise<ComplianceLimitCheckResponse> => api.post('/compliance/check-investment-limits', data).then(r => r.data)
export const updateComplianceOverdue = (): Promise<{ updated: number }> =>
  api.post('/compliance/update-overdue').then(r => r.data)
export const interpretComplianceQuery = (
  data: ComplianceInterpretRequest,
): Promise<ComplianceInterpretResponse> => api.post('/compliance/interpret', data).then(r => r.data)
export const fetchComplianceLLMUsage = (
  period: 'month' | 'week' | 'all' = 'month',
): Promise<ComplianceLLMUsageResponse> => api.get('/compliance/llm-usage', { params: { period } }).then(r => r.data)
export const fetchComplianceScanHistory = (
  period: 'week' | 'month' | 'all' = 'week',
): Promise<ComplianceScanHistoryResponse> => api.get('/compliance/scan-history', { params: { period } }).then(r => r.data)
export const fetchComplianceAmendments = (
  limit = 20,
): Promise<ComplianceDocument[]> => api.get('/compliance/amendments', { params: { limit } }).then(r => r.data)
export const triggerComplianceManualScan = (
  data?: ComplianceManualScanRequest,
): Promise<ComplianceManualScanResponse> => api.post('/compliance/scan/manual', data ?? {}).then(r => r.data)
export const fetchComplianceViolationPatterns = (
  params: { fund_id: number; months?: number },
): Promise<ComplianceViolationPatternsResponse> =>
  api.get('/compliance/history/patterns', { params }).then(r => r.data)
export const fetchComplianceRuleSuggestions = (
  params?: { fund_id?: number },
): Promise<ComplianceRuleSuggestion[]> =>
  api.get('/compliance/history/suggestions', { params }).then(r => r.data)
export const fetchComplianceRemediationStats = (
  params?: { fund_id?: number },
): Promise<ComplianceRemediationStatsResponse> =>
  api.get('/compliance/history/remediation', { params }).then(r => r.data)
export const fetchComplianceMonthlyReport = (
  params: { fund_id: number; year_month: string },
): Promise<ComplianceMonthlyReportResponse> =>
  api.get('/compliance/report/monthly', { params }).then(r => r.data)
export const downloadComplianceMonthlyReport = (
  params: { fund_id: number; year_month: string },
): Promise<Blob> =>
  api.get('/compliance/report/monthly/download', { params, responseType: 'blob' }).then(r => r.data)

// -- VICS Reports --
export const fetchVicsReports = (
  params?: { fund_id?: number; year?: number; month?: number },
): Promise<VicsMonthlyReport[]> => api.get('/vics/reports', { params }).then(r => r.data)
export const fetchVicsReport = (id: number): Promise<VicsMonthlyReport> =>
  api.get(`/vics/reports/${id}`).then(r => r.data)
export const generateVicsReport = (data: VicsGenerateInput): Promise<VicsMonthlyReport> =>
  api.post('/vics/reports/generate', data).then(r => r.data)
export const confirmVicsReport = (id: number): Promise<VicsMonthlyReport> =>
  api.post(`/vics/reports/${id}/confirm`).then(r => r.data)
export const submitVicsReport = (id: number): Promise<VicsMonthlyReport> =>
  api.post(`/vics/reports/${id}/submit`).then(r => r.data)
export const patchVicsReport = (id: number, data: { discrepancy_notes?: string | null; status?: string | null }): Promise<VicsMonthlyReport> =>
  api.patch(`/vics/reports/${id}`, data).then(r => r.data)
export const exportVicsReportXlsx = (id: number): Promise<Blob> =>
  api.get(`/vics/reports/${id}/export-xlsx`, { responseType: 'blob' }).then(r => r.data)

// -- Internal Reviews --
export const fetchInternalReviews = (
  params?: { fund_id?: number; year?: number; quarter?: number },
): Promise<InternalReview[]> => api.get('/internal-reviews', { params }).then(r => r.data)
export const createInternalReview = (data: InternalReviewCreateInput): Promise<InternalReview> =>
  api.post('/internal-reviews', data).then(r => r.data)
export const fetchInternalReview = (id: number): Promise<InternalReview> =>
  api.get(`/internal-reviews/${id}`).then(r => r.data)
export const updateInternalReview = (
  id: number,
  data: InternalReviewPatchInput,
): Promise<InternalReview> => api.patch(`/internal-reviews/${id}`, data).then(r => r.data)
export const deleteInternalReview = (id: number): Promise<{ ok: boolean }> =>
  api.delete(`/internal-reviews/${id}`).then(r => r.data)
export const fetchInternalReviewCompanyReviews = (id: number): Promise<CompanyReview[]> =>
  api.get(`/internal-reviews/${id}/company-reviews`).then(r => r.data)
export const updateInternalReviewCompanyReview = (
  reviewId: number,
  companyReviewId: number,
  data: CompanyReviewPatchInput,
): Promise<CompanyReview> =>
  api.patch(`/internal-reviews/${reviewId}/company-reviews/${companyReviewId}`, data).then(r => r.data)
export const autoEvaluateInternalReview = (
  id: number,
): Promise<{ evaluated: number; results: InternalReviewAutoEvaluateResult[] }> =>
  api.post(`/internal-reviews/${id}/auto-evaluate`).then(r => r.data)
export const completeInternalReview = (
  id: number,
  data?: { completed_by?: string | null; evidence_note?: string | null },
): Promise<InternalReview> => api.post(`/internal-reviews/${id}/complete`, data ?? {}).then(r => r.data)
export const generateInternalReviewReportDocument = (
  id: number,
): Promise<GeneratedDocumentGenerateResponse> =>
  api.post(`/internal-reviews/${id}/generate-report`).then(r => r.data)
export const generateInternalReviewCompanyReportDocument = (
  reviewId: number,
  companyReviewId: number,
): Promise<GeneratedDocumentGenerateResponse> =>
  api.post(`/internal-reviews/${reviewId}/company-reviews/${companyReviewId}/generate-report`).then(r => r.data)

// -- Workflows --
export const fetchWorkflows = (): Promise<WorkflowListItem[]> => api.get('/workflows').then(r => r.data)
export const fetchWorkflow = (id: number): Promise<WorkflowTemplate> => api.get(`/workflows/${id}`).then(r => r.data)
export const listStepDocuments = (stepId: number): Promise<WorkflowStepDocument[]> =>
  api.get(`/workflow-steps/${stepId}/documents`).then(r => r.data)
export const addStepDocument = (
  stepId: number,
  data: WorkflowStepDocumentInput,
): Promise<WorkflowStepDocument> => api.post(`/workflow-steps/${stepId}/documents`, data).then(r => r.data)
export const deleteStepDocument = (
  stepId: number,
  documentId: number,
): Promise<{ ok: boolean }> => api.delete(`/workflow-steps/${stepId}/documents/${documentId}`).then(r => r.data)
export const listWorkflowDocuments = (workflowId: number): Promise<WorkflowDocument[]> =>
  api.get(`/workflows/${workflowId}/documents`).then(r => r.data)
export const addWorkflowDocument = (
  workflowId: number,
  data: WorkflowDocumentInput,
): Promise<WorkflowDocument> => api.post(`/workflows/${workflowId}/documents`, data).then(r => r.data)
export const deleteWorkflowDocument = (
  workflowId: number,
  documentId: number,
): Promise<{ ok: boolean }> => api.delete(`/workflows/${workflowId}/documents/${documentId}`).then(r => r.data)
export const createWorkflowTemplate = (data: WorkflowTemplateInput): Promise<WorkflowTemplate> => api.post('/workflows', data).then(r => r.data)
export const updateWorkflowTemplate = (id: number, data: WorkflowTemplateInput): Promise<WorkflowTemplate> => api.put(`/workflows/${id}`, data).then(r => r.data)
export const deleteWorkflowTemplate = (id: number): Promise<{ ok: boolean }> => api.delete(`/workflows/${id}`).then(r => r.data)
export const instantiateWorkflow = (id: number, data: WorkflowInstantiateInput): Promise<WorkflowInstance> => api.post(`/workflows/${id}/instantiate`, data).then(r => r.data)
export const fetchWorkflowInstances = (
  params?: { status?: string; investment_id?: number; company_id?: number; fund_id?: number; gp_entity_id?: number },
): Promise<WorkflowInstance[]> =>
  api.get('/workflow-instances', {
    params: {
      status: params?.status ?? 'active',
      investment_id: params?.investment_id,
      company_id: params?.company_id,
      fund_id: params?.fund_id,
      gp_entity_id: params?.gp_entity_id,
    },
  }).then(r => r.data)
export const fetchWorkflowInstance = (id: number): Promise<WorkflowInstance> => api.get(`/workflow-instances/${id}`).then(r => r.data)
export const completeWorkflowStep = (instanceId: number, stepId: number, data: WorkflowStepCompleteInput): Promise<WorkflowInstance> => api.patch(`/workflow-instances/${instanceId}/steps/${stepId}/complete`, data).then(r => r.data)
export const cancelWorkflowInstance = (id: number): Promise<WorkflowInstance> => api.patch(`/workflow-instances/${id}/cancel`).then(r => r.data)
export const deleteWorkflowInstance = (id: number): Promise<void> => api.delete(`/workflow-instances/${id}`).then(() => undefined)
export const updateWorkflowInstance = (id: number, data: WorkflowInstanceUpdateInput): Promise<WorkflowInstance> => api.put(`/workflow-instances/${id}`, data).then(r => r.data)
export const undoWorkflowStep = (instanceId: number, stepId: number): Promise<WorkflowInstance> => api.put(`/workflow-instances/${instanceId}/steps/${stepId}/undo`).then(r => r.data)
export const swapWorkflowInstanceTemplate = (
  instanceId: number,
  data: WorkflowInstanceTemplateSwapInput,
): Promise<WorkflowInstance> => api.put(`/workflow-instances/${instanceId}/swap-template`, data).then(r => r.data)
export const listWorkflowStepInstanceDocuments = (
  instanceId: number,
  stepId: number,
): Promise<WorkflowStepInstanceDocument[]> =>
  api.get(`/workflow-instances/${instanceId}/steps/${stepId}/documents`).then(r => r.data)
export const addWorkflowStepInstanceDocument = (
  instanceId: number,
  stepId: number,
  data: WorkflowStepInstanceDocumentInput,
): Promise<WorkflowStepInstanceDocument> =>
  api.post(`/workflow-instances/${instanceId}/steps/${stepId}/documents`, data).then(r => r.data)
export const updateWorkflowStepInstanceDocument = (
  instanceId: number,
  stepId: number,
  documentId: number,
  data: WorkflowStepInstanceDocumentUpdate,
): Promise<WorkflowStepInstanceDocument> =>
  api.put(`/workflow-instances/${instanceId}/steps/${stepId}/documents/${documentId}`, data).then(r => r.data)
export const deleteWorkflowStepInstanceDocument = (
  instanceId: number,
  stepId: number,
  documentId: number,
): Promise<{ ok: boolean }> =>
  api.delete(`/workflow-instances/${instanceId}/steps/${stepId}/documents/${documentId}`).then(r => r.data)
export const checkWorkflowStepInstanceDocument = (
  instanceId: number,
  stepId: number,
  documentId: number,
  checked: boolean,
): Promise<WorkflowStepInstanceDocument> =>
  api.patch(`/workflow-instances/${instanceId}/steps/${stepId}/documents/${documentId}/check`, { checked }).then(r => r.data)
export const checkWorkflowStepInstanceDocumentById = (
  documentId: number,
): Promise<WorkflowStepInstanceDocument> =>
  api.patch(`/workflow-step-instance-documents/${documentId}/check`).then(r => r.data)
export const uncheckWorkflowStepInstanceDocumentById = (
  documentId: number,
): Promise<WorkflowStepInstanceDocument> =>
  api.patch(`/workflow-step-instance-documents/${documentId}/uncheck`).then(r => r.data)
export const attachWorkflowStepInstanceDocumentById = (
  documentId: number,
  file: File,
): Promise<WorkflowStepInstanceDocument> =>
  api.post(`/workflow-step-instance-documents/${documentId}/attach`, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
  }).then(r => r.data)

// -- Periodic Schedules --
export const fetchPeriodicSchedules = (activeOnly = false): Promise<PeriodicSchedule[]> =>
  api.get('/periodic-schedules', { params: { active_only: activeOnly } }).then(r => r.data)
export const fetchPeriodicSchedule = (id: number): Promise<PeriodicSchedule> =>
  api.get(`/periodic-schedules/${id}`).then(r => r.data)
export const createPeriodicSchedule = (data: PeriodicScheduleInput): Promise<PeriodicSchedule> =>
  api.post('/periodic-schedules', data).then(r => r.data)
export const updatePeriodicSchedule = (id: number, data: PeriodicScheduleUpdateInput): Promise<PeriodicSchedule> =>
  api.put(`/periodic-schedules/${id}`, data).then(r => r.data)
export const deletePeriodicSchedule = (id: number): Promise<void> =>
  api.delete(`/periodic-schedules/${id}`).then(() => undefined)
export const generatePeriodicSchedulesForYear = (
  year: number,
  dryRun = false,
): Promise<PeriodicScheduleGenerateResult> =>
  api.post('/periodic-schedules/generate-year', null, { params: { year, dry_run: dryRun } }).then(r => r.data)

// -- Attachments --
export const uploadAttachment = (
  file: File,
  entityType?: string | null,
  entityId?: number | null,
): Promise<Attachment> => {
  const params: Record<string, string | number> = {}
  if (entityType) params.entity_type = entityType
  if (entityId !== undefined && entityId !== null) params.entity_id = entityId
  return api.post('/attachments', file, {
    params,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
  }).then(r => r.data)
}
export const fetchAttachments = (ids?: number[]): Promise<Attachment[]> =>
  api.get('/attachments', { params: { ids: ids?.join(',') } }).then(r => r.data)
export const downloadAttachment = (attachmentId: number): Promise<Blob> =>
  api.get(`/attachments/${attachmentId}`, { responseType: 'blob' }).then(r => r.data)
export const linkAttachment = (
  attachmentId: number,
  data: AttachmentLinkInput,
): Promise<Attachment> => api.patch(`/attachments/${attachmentId}/link`, data).then(r => r.data)
export const removeAttachment = (attachmentId: number): Promise<void> =>
  api.delete(`/attachments/${attachmentId}`).then(() => undefined)

// -- Document Templates --
export const fetchDocumentTemplates = (category?: string): Promise<DocumentTemplate[]> =>
  api.get('/document-templates', { params: { category } }).then(r => r.data)

export const updateTemplateCustomData = (
  templateId: number,
  customData: Record<string, unknown>,
): Promise<DocumentTemplate> =>
  api.put(`/document-templates/${templateId}/custom`, { custom_data: customData }).then(r => r.data)

export const previewTemplate = (
  templateId: number,
  fundId?: number,
  customData?: Record<string, unknown>,
): Promise<Blob> => {
  const body = customData === undefined ? undefined : { custom_data: customData }
  return api.post(`/document-templates/${templateId}/preview`, body, {
    params: { fund_id: fundId },
    responseType: 'blob',
  }).then(r => r.data)
}

export const generateDocument = (
  templateId: number,
  fundId: number,
  assemblyDate?: string,
  documentNumber?: string,
): Promise<Blob> =>
  api.post(`/document-templates/${templateId}/generate`, null, {
    params: {
      fund_id: fundId,
      assembly_date: assemblyDate,
      document_number: documentNumber,
    },
    responseType: 'blob',
  }).then(r => r.data)

export const generateTemplateDocument = (
  data: TemplateDocumentGenerateInput,
): Promise<GeneratedDocumentGenerateResponse> => api.post('/documents/generate', data).then(r => r.data)

export const generateTemplateDocumentsBulk = (
  data: TemplateDocumentBulkGenerateInput,
): Promise<TemplateDocumentBulkGenerateResponse> => api.post('/documents/generate/bulk', data).then(r => r.data)

export const fetchTemplateGeneratedDocuments = (
  params?: { fund_id?: number; template_id?: number; limit?: number },
): Promise<TemplateGeneratedDocumentItem[]> => api.get('/documents/generated', { params }).then(r => r.data)

export const downloadTemplateGeneratedDocument = (documentId: number): Promise<Blob> =>
  api.get(`/documents/generated/${documentId}/download`, { responseType: 'blob' }).then(r => r.data)

export const fetchDocumentMarkerDefinitions = (
  templateId?: number,
): Promise<DocumentMarkerDefinition[]> =>
  api.get('/documents/markers', { params: { template_id: templateId } }).then(r => r.data)

export const previewGeneratedTemplateDocument = (
  data: TemplateDocumentGenerateInput,
): Promise<Blob> => api.post('/documents/preview', data, { responseType: 'blob' }).then(r => r.data)

export const resolveDocumentVariables = (
  data: TemplateDocumentGenerateInput,
): Promise<ResolveDocumentVariablesResponse> =>
  api.post('/documents/variables/resolve', data).then(r => r.data)

export const analyzeTemplateFile = (file: File): Promise<TemplateAnalyzeResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/templates/analyze', formData).then(r => r.data)
}

export const registerTemplate = (data: TemplateRegisterInput): Promise<TemplateRegisterResponse> => {
  const formData = new FormData()
  formData.append('file', data.file)
  formData.append('name', data.name)
  formData.append('document_type', data.document_type)
  formData.append('variables', JSON.stringify(data.variables))
  return api.post('/templates/register', formData).then(r => r.data)
}

export const testGenerateRegisteredTemplate = (
  data: TemplateRegistrationTestGenerateInput,
): Promise<Blob> => api.post('/templates/test-generate', data, { responseType: 'blob' }).then(r => r.data)

export const fetchTemplateInputCache = (
  fundId: number,
  templateId: number,
): Promise<TemplateInputCacheResponse> =>
  api.get('/templates/input-cache', { params: { fund_id: fundId, template_id: templateId } }).then(r => r.data)

export const generateDocumentByBuilder = (
  data: { builder: string; params: Record<string, unknown> },
): Promise<GeneratedDocumentGenerateResponse> => api.post('/documents/generate', data).then(r => r.data)
export const fetchGeneratedDocuments = (
  params?: { builder?: string; limit?: number },
): Promise<GeneratedDocumentItem[]> => api.get('/documents', { params }).then(r => r.data)
export const downloadGeneratedDocument = (documentId: number): Promise<Blob> =>
  api.get(`/documents/${documentId}/download`, { responseType: 'blob' }).then(r => r.data)

// -- Fund Document Generation --
export const fetchTemplateStructure = (): Promise<TemplateStructure> =>
  api.get('/document-generation/templates').then(r => r.data)
export const fetchTemplateFilesByStage = (stage: number): Promise<TemplateFileInfo[]> =>
  api.get(`/document-generation/templates/${stage}`).then(r => r.data)
export const fetchMarkers = (): Promise<MarkerInfo[]> =>
  api.get('/document-generation/markers').then(r => r.data)
export const generateDocuments = (data: DocumentGenerateRequest): Promise<DocumentGenerateResponse> =>
  api.post('/document-generation/generate', data).then(r => r.data)
export const fetchGenerationStatus = (id: number): Promise<DocumentGenerationStatus> =>
  api.get(`/document-generation/${id}/status`).then(r => r.data)
export const fetchGenerationHistory = (fundId: number): Promise<DocumentGenerationHistoryItem[]> =>
  api.get('/document-generation/history', { params: { fund_id: fundId } }).then(r => r.data)
export const fetchGenerationHistoryDetail = (id: number): Promise<DocumentGenerationHistoryItem> =>
  api.get(`/document-generation/history/${id}`).then(r => r.data)
export const downloadGeneratedDocuments = (id: number): Promise<Blob> =>
  api.get(`/document-generation/${id}/download`, { responseType: 'blob' }).then(r => r.data)
export const deleteGeneration = (id: number): Promise<{ ok: boolean }> =>
  api.delete(`/document-generation/history/${id}`).then(r => r.data)
export const fetchDocumentVariables = (fundId: number): Promise<DocumentVariable[]> =>
  api.get('/document-variables', { params: { fund_id: fundId } }).then(r => r.data)
export const fetchDocumentVariable = (id: number): Promise<DocumentVariable> =>
  api.get(`/document-variables/${id}`).then(r => r.data)
export const createDocumentVariable = (
  data: { fund_id: number; name: string; variables: Record<string, string>; is_default?: boolean },
): Promise<DocumentVariable> => api.post('/document-variables', data).then(r => r.data)
export const updateDocumentVariable = (
  id: number,
  data: Partial<{ name: string; variables: Record<string, string>; is_default: boolean }>,
): Promise<DocumentVariable> => api.put(`/document-variables/${id}`, data).then(r => r.data)
export const deleteDocumentVariable = (id: number): Promise<{ ok: boolean }> =>
  api.delete(`/document-variables/${id}`).then(r => r.data)
export const fetchAutoFillVariables = (fundId: number): Promise<AutoFillVariablesResponse> =>
  api.get(`/document-generation/auto-fill/${fundId}`).then(r => r.data)

// -- Search --
export const searchGlobal = (q: string): Promise<SearchResult[]> =>
  api.get('/search', { params: { q } }).then(r => r.data)

// -- Funds --
export const fetchFunds = (): Promise<Fund[]> => api.get('/funds').then(r => r.data)
export const fetchFundOverview = (referenceDate?: string): Promise<FundOverviewResponse> =>
  api.get('/funds/overview', { params: { reference_date: referenceDate } }).then(r => r.data)
export const fetchFund = (id: number): Promise<Fund> => api.get(`/funds/${id}`).then(r => r.data)
export const createFund = (data: FundInput) => api.post('/funds', data).then(r => r.data)
export const updateFund = (id: number, data: Partial<FundInput>) => api.put(`/funds/${id}`, data).then(r => r.data)
export const deleteFund = (id: number) => api.delete(`/funds/${id}`)
export const addFundFormationWorkflow = (
  fundId: number,
  data: FundFormationWorkflowAddInput,
): Promise<FundFormationWorkflowAddResult> => api.post(`/funds/${fundId}/add-formation-workflow`, data).then(r => r.data)
export const fetchFundLPs = (fundId: number): Promise<LP[]> => api.get(`/funds/${fundId}/lps`).then(r => r.data)
export const createFundLP = (fundId: number, data: LPInput) => api.post(`/funds/${fundId}/lps`, data).then(r => r.data)
export const updateFundLP = (fundId: number, lpId: number, data: Partial<LPInput>) => api.put(`/funds/${fundId}/lps/${lpId}`, data).then(r => r.data)
export const deleteFundLP = (fundId: number, lpId: number) => api.delete(`/funds/${fundId}/lps/${lpId}`)
export const fetchLPContributions = (fundId: number, lpId: number): Promise<LPContribution[]> =>
  api.get(`/funds/${fundId}/lps/${lpId}/contributions`).then(r => r.data)
export const fetchLPContributionSummary = (fundId: number, lpId: number): Promise<LPContributionSummary> =>
  api.get(`/funds/${fundId}/lps/${lpId}/contributions/summary`).then(r => r.data)
export const createLPContribution = (
  fundId: number,
  lpId: number,
  data: LPContributionInput,
): Promise<LPContribution> => api.post(`/funds/${fundId}/lps/${lpId}/contributions`, data).then(r => r.data)
export const createLPContributionBulk = (
  fundId: number,
  lpId: number,
  data: LPContributionBulkInput,
): Promise<LPContribution[]> => api.post(`/funds/${fundId}/lps/${lpId}/contributions/bulk`, data).then(r => r.data)
export const updateLPContribution = (
  contributionId: number,
  data: Partial<LPContributionInput>,
): Promise<LPContribution> => api.put(`/lp-contributions/${contributionId}`, data).then(r => r.data)
export const deleteLPContribution = (contributionId: number): Promise<void> =>
  api.delete(`/lp-contributions/${contributionId}`).then(() => undefined)
export const fetchFundContributionOverview = (fundId: number): Promise<FundContributionOverview> =>
  api.get(`/funds/${fundId}/contribution-overview`).then(r => r.data)
export const fetchLPTransfers = (fundId: number): Promise<LPTransfer[]> => api.get(`/funds/${fundId}/lp-transfers`).then(r => r.data)
export const createLPTransfer = (fundId: number, data: LPTransferInput): Promise<LPTransfer> =>
  api.post(`/funds/${fundId}/lp-transfers`, data).then(r => r.data)
export const updateLPTransfer = (fundId: number, transferId: number, data: Partial<LPTransferUpdateInput>): Promise<LPTransfer> =>
  api.patch(`/funds/${fundId}/lp-transfers/${transferId}`, data).then(r => r.data)
export const completeLPTransfer = (
  fundId: number,
  transferId: number,
  data?: { notes?: string | null; transfer_date?: string | null },
): Promise<LPTransfer> =>
  api.post(`/funds/${fundId}/lp-transfers/${transferId}/complete`, data ?? {}).then(r => r.data)
export const updateFundNoticePeriods = (
  fundId: number,
  data: FundNoticePeriodInput[],
): Promise<FundNoticePeriodResponse[]> => api.put(`/funds/${fundId}/notice-periods`, data).then(r => r.data)
export const updateFundKeyTerms = (
  fundId: number,
  data: FundKeyTermInput[],
): Promise<FundKeyTermResponse[]> => api.put(`/funds/${fundId}/key-terms`, data).then(r => r.data)
export const calculateDeadline = (
  fundId: number,
  targetDate: string,
  noticeType: string,
): Promise<NoticeDeadlineResult> =>
  api.get(`/funds/${fundId}/calculate-deadline`, {
    params: { target_date: targetDate, notice_type: noticeType },
  }).then(r => r.data)
export const downloadFundMigrationTemplate = (): Promise<Blob> =>
  api.get('/funds/migration-template', { responseType: 'blob' }).then(r => r.data)
export const validateFundMigration = (file: File): Promise<FundMigrationValidateResponse> => {
  return api.post('/funds/migration-validate', file, {
    headers: { 'Content-Type': 'application/octet-stream' },
  }).then(r => r.data)
}
export const importFundMigration = (
  file: File,
  mode: 'insert' | 'upsert',
  syncAddressBook: boolean,
): Promise<FundMigrationImportResponse> => {
  return api.post('/funds/migration-import', file, {
    headers: { 'Content-Type': 'application/octet-stream' },
    params: { mode, sync_address_book: syncAddressBook },
  }).then(r => r.data)
}

// -- GP Entities --
export const fetchGPEntities = (): Promise<GPEntity[]> => api.get('/gp-entities').then(r => r.data)
export const fetchGPEntity = (id: number): Promise<GPEntity> => api.get(`/gp-entities/${id}`).then(r => r.data)
export const createGPEntity = (data: GPEntityInput): Promise<GPEntity> => api.post('/gp-entities', data).then(r => r.data)
export const updateGPEntity = (id: number, data: Partial<GPEntityInput>): Promise<GPEntity> => api.patch(`/gp-entities/${id}`, data).then(r => r.data)
export const deleteGPEntity = (id: number) => api.delete(`/gp-entities/${id}`)
export const fetchLPAddressBooks = (params?: { q?: string; is_active?: number }): Promise<LPAddressBook[]> =>
  api.get('/lp-address-books', { params }).then(r => r.data)
export const fetchLPAddressBook = (id: number): Promise<LPAddressBook> => api.get(`/lp-address-books/${id}`).then(r => r.data)
export const createLPAddressBook = (data: LPAddressBookInput): Promise<LPAddressBook> =>
  api.post('/lp-address-books', data).then(r => r.data)
export const updateLPAddressBook = (id: number, data: Partial<LPAddressBookInput>): Promise<LPAddressBook> =>
  api.patch(`/lp-address-books/${id}`, data).then(r => r.data)
export const deactivateLPAddressBook = (id: number) => api.delete(`/lp-address-books/${id}`)

// -- GP Profiles --
export const fetchGPProfiles = (): Promise<GPProfile[]> => api.get('/gp-profiles').then(r => r.data)
export const fetchGPProfile = (id: number): Promise<GPProfile> => api.get(`/gp-profiles/${id}`).then(r => r.data)
export const createGPProfile = (data: GPProfileInput): Promise<GPProfile> =>
  api.post('/gp-profiles', data).then(r => r.data)
export const updateGPProfile = (id: number, data: Partial<GPProfileInput>): Promise<GPProfile> =>
  api.put(`/gp-profiles/${id}`, data).then(r => r.data)

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

export const fetchInvestmentReviews = (params?: { status?: string }): Promise<InvestmentReview[]> =>
  api.get('/investment-reviews', { params }).then(r => r.data)
export const fetchInvestmentReview = (id: number): Promise<InvestmentReviewDetail> =>
  api.get(`/investment-reviews/${id}`).then(r => r.data)
export const createInvestmentReview = (data: InvestmentReviewInput): Promise<InvestmentReview> =>
  api.post('/investment-reviews', data).then(r => r.data)
export const updateInvestmentReview = (id: number, data: Partial<InvestmentReviewInput>): Promise<InvestmentReview> =>
  api.put(`/investment-reviews/${id}`, data).then(r => r.data)
export const deleteInvestmentReview = (id: number) => api.delete(`/investment-reviews/${id}`)
export const updateInvestmentReviewStatus = (id: number, status: string): Promise<InvestmentReview> =>
  api.patch(`/investment-reviews/${id}/status`, { status }).then(r => r.data)
export const convertInvestmentReview = (id: number): Promise<InvestmentReviewConvertResult> =>
  api.post(`/investment-reviews/${id}/convert`).then(r => r.data)
export const fetchReviewComments = (reviewId: number): Promise<ReviewComment[]> =>
  api.get(`/investment-reviews/${reviewId}/comments`).then(r => r.data)
export const createReviewComment = (reviewId: number, data: ReviewCommentInput): Promise<ReviewComment> =>
  api.post(`/investment-reviews/${reviewId}/comments`, data).then(r => r.data)
export const deleteReviewComment = (commentId: number) => api.delete(`/review-comments/${commentId}`)
export const fetchInvestmentReviewWeeklySummary = (): Promise<InvestmentReviewWeeklySummary> =>
  api.get('/investment-reviews/weekly-summary').then(r => r.data)

export const fetchInvestmentDocuments = (investmentId: number) => api.get(`/investments/${investmentId}/documents`).then(r => r.data)
export const createInvestmentDocument = (investmentId: number, data: InvestmentDocumentInput) => api.post(`/investments/${investmentId}/documents`, data).then(r => r.data)
export const updateInvestmentDocument = (investmentId: number, documentId: number, data: Partial<InvestmentDocumentInput>) => api.put(`/investments/${investmentId}/documents/${documentId}`, data).then(r => r.data)
export const deleteInvestmentDocument = (investmentId: number, documentId: number) => api.delete(`/investments/${investmentId}/documents/${documentId}`)
export const fetchVoteRecords = (params?: { company_id?: number; investment_id?: number; vote_type?: string }): Promise<VoteRecord[]> =>
  api.get('/vote-records', { params }).then(r => r.data)
export const createVoteRecord = (data: VoteRecordInput): Promise<VoteRecord> => api.post('/vote-records', data).then(r => r.data)
export const updateVoteRecord = (id: number, data: Partial<VoteRecordInput>): Promise<VoteRecord> => api.put(`/vote-records/${id}`, data).then(r => r.data)
export const deleteVoteRecord = (id: number) => api.delete(`/vote-records/${id}`)
export const fetchTransactions = (
  params?: {
    investment_id?: number
    fund_id?: number
    company_id?: number
    type?: string
    transaction_subtype?: string
    date_from?: string
    date_to?: string
  },
): Promise<Transaction[]> => api.get('/transactions', { params }).then(r => r.data)
export const fetchInvestmentTransactions = (investmentId: number): Promise<Transaction[]> => api.get(`/investments/${investmentId}/transactions`).then(r => r.data)
export const fetchTransaction = (id: number): Promise<Transaction> => api.get(`/transactions/${id}`).then(r => r.data)
export const createTransaction = (data: TransactionInput): Promise<Transaction> => api.post('/transactions', data).then(r => r.data)
export const updateTransaction = (id: number, data: Partial<TransactionInput>): Promise<Transaction> => api.put(`/transactions/${id}`, data).then(r => r.data)
export const deleteTransaction = (id: number) => api.delete(`/transactions/${id}`)
export const fetchTransactionLedger = (
  params?: {
    investment_id?: number
    fund_id?: number
    company_id?: number
    type?: string
    transaction_subtype?: string
    date_from?: string
    date_to?: string
  },
): Promise<TransactionLedgerItem[]> => api.get('/transactions/ledger', { params }).then(r => r.data)
export const fetchTransactionSummary = (
  params?: {
    investment_id?: number
    fund_id?: number
    company_id?: number
    type?: string
    transaction_subtype?: string
    date_from?: string
    date_to?: string
  },
): Promise<TransactionSummary> => api.get('/transactions/summary', { params }).then(r => r.data)
export const fetchValuations = (params?: { investment_id?: number; fund_id?: number; company_id?: number; method?: string }): Promise<Valuation[]> => api.get('/valuations', { params }).then(r => r.data)
export const fetchInvestmentValuations = (investmentId: number): Promise<Valuation[]> => api.get(`/investments/${investmentId}/valuations`).then(r => r.data)
export const fetchValuation = (id: number): Promise<Valuation> => api.get(`/valuations/${id}`).then(r => r.data)
export const createValuation = (data: ValuationInput): Promise<Valuation> => api.post('/valuations', data).then(r => r.data)
export const updateValuation = (id: number, data: Partial<ValuationInput>): Promise<Valuation> => api.put(`/valuations/${id}`, data).then(r => r.data)
export const deleteValuation = (id: number) => api.delete(`/valuations/${id}`)
export const fetchBizReports = (params?: { fund_id?: number; year?: number; status?: string }): Promise<BizReport[]> =>
  api.get('/biz-reports', { params }).then(r => r.data)
export const fetchBizReport = (id: number): Promise<BizReport> => api.get(`/biz-reports/${id}`).then(r => r.data)
export const createBizReport = (data: BizReportInput): Promise<BizReport> => api.post('/biz-reports', data).then(r => r.data)
export const updateBizReport = (id: number, data: Partial<BizReportInput>): Promise<BizReport> => api.put(`/biz-reports/${id}`, data).then(r => r.data)
export const deleteBizReport = (id: number) => api.delete(`/biz-reports/${id}`)
export const fetchRegularReports = (params?: { report_target?: string; fund_id?: number; status?: string; period?: string }): Promise<RegularReport[]> =>
  api.get('/regular-reports', { params }).then(r => r.data)
export const createRegularReport = (data: RegularReportInput): Promise<RegularReport> => api.post('/regular-reports', data).then(r => r.data)
export const updateRegularReport = (id: number, data: Partial<RegularReportInput>): Promise<RegularReport> => api.put(`/regular-reports/${id}`, data).then(r => r.data)
export const deleteRegularReport = (id: number) => api.delete(`/regular-reports/${id}`)
export const runReportPreCheck = (reportId: number): Promise<PreReportCheckResult> =>
  api.post(`/reports/${reportId}/pre-check`).then(r => r.data)
export const fetchReportPreChecks = (reportId: number): Promise<PreReportCheckResult[]> =>
  api.get(`/reports/${reportId}/pre-checks`).then(r => r.data)
export const fetchAccounts = (params?: { fund_id?: number; category?: string }): Promise<Account[]> =>
  api.get('/accounts', { params }).then(r => r.data)
export const createAccount = (data: AccountInput): Promise<Account> => api.post('/accounts', data).then(r => r.data)
export const updateAccount = (id: number, data: Partial<AccountInput>): Promise<Account> => api.put(`/accounts/${id}`, data).then(r => r.data)
export const deleteAccount = (id: number) => api.delete(`/accounts/${id}`)
export const fetchJournalEntries = (params?: { fund_id?: number; entry_date_from?: string; entry_date_to?: string; status?: string }): Promise<JournalEntry[]> =>
  api.get('/journal-entries', { params }).then(r => r.data)
export const fetchJournalEntry = (id: number): Promise<JournalEntry> => api.get(`/journal-entries/${id}`).then(r => r.data)
export const createJournalEntry = (data: JournalEntryInput): Promise<JournalEntry> => api.post('/journal-entries', data).then(r => r.data)
export const updateJournalEntry = (id: number, data: Partial<JournalEntryInput>): Promise<JournalEntry> => api.put(`/journal-entries/${id}`, data).then(r => r.data)
export const deleteJournalEntry = (id: number) => api.delete(`/journal-entries/${id}`)
export const fetchTrialBalance = (fund_id: number, as_of_date?: string): Promise<TrialBalanceItem[]> =>
  api.get('/accounts/trial-balance', { params: { fund_id, as_of_date } }).then(r => r.data)
export const parseBankTransactionsFromText = (
  fundId: number,
  data: { text: string; account_number?: string | null },
): Promise<BankTransactionParseResponse> =>
  api.post(`/funds/${fundId}/bank-transactions/parse`, data).then(r => r.data)
export const uploadBankTransactionsFile = (
  fundId: number,
  file: File,
): Promise<BankTransactionParseResponse> =>
  api.post(`/funds/${fundId}/bank-transactions/upload`, file, {
    headers: { 'Content-Type': 'application/octet-stream' },
  }).then(r => r.data)
export const fetchBankTransactions = (
  fundId: number,
  params?: { year_month?: string },
): Promise<BankTransaction[]> =>
  api.get(`/funds/${fundId}/bank-transactions`, { params }).then(r => r.data)
export const runAutoJournal = (
  fundId: number,
  data?: { year_month?: string | null },
): Promise<AutoJournalResult> =>
  api.post(`/funds/${fundId}/bank-transactions/auto-journal`, data ?? {}).then(r => r.data)
export const manualMapBankTransaction = (
  fundId: number,
  txnId: number,
  data: ManualMapInput,
): Promise<ManualMapResult> =>
  api.post(`/funds/${fundId}/bank-transactions/${txnId}/manual-map`, data).then(r => r.data)
export const fetchMappingRules = (fundId: number): Promise<AutoMappingRule[]> =>
  api.get(`/funds/${fundId}/mapping-rules`).then(r => r.data)
export const createMappingRule = (
  fundId: number,
  data: AutoMappingRuleInput,
): Promise<AutoMappingRule> =>
  api.post(`/funds/${fundId}/mapping-rules`, data).then(r => r.data)
export const updateMappingRule = (
  id: number,
  data: Partial<AutoMappingRuleInput>,
): Promise<AutoMappingRule> =>
  api.put(`/mapping-rules/${id}`, data).then(r => r.data)
export const generateProvisionalFS = (
  fundId: number,
  yearMonth: string,
): Promise<ProvisionalFS> =>
  api.post(`/funds/${fundId}/provisional-fs/generate`, { year_month: yearMonth }).then(r => r.data)
export const fetchProvisionalFS = (
  fundId: number,
  yearMonth: string,
): Promise<ProvisionalFS | null> =>
  api.get(`/funds/${fundId}/provisional-fs`, { params: { year_month: yearMonth } }).then(r => r.data)
export const confirmProvisionalFS = (id: number): Promise<ProvisionalFS> =>
  api.put(`/provisional-fs/${id}/confirm`).then(r => r.data)
export const downloadProvisionalFS = (id: number): Promise<Blob> =>
  api.get(`/provisional-fs/${id}/download`, { responseType: 'blob' }).then(r => r.data)
export const fetchProvisionalFSOverview = (
  yearMonth: string,
): Promise<ProvisionalFSOverviewResponse> =>
  api.get('/provisional-fs/overview', { params: { year_month: yearMonth } }).then(r => r.data)
export const fetchCapitalCalls = (params?: { fund_id?: number; call_type?: string }): Promise<CapitalCall[]> => api.get('/capital-calls', { params }).then(r => r.data)
export const fetchCapitalCall = (id: number): Promise<CapitalCall> => api.get(`/capital-calls/${id}`).then(r => r.data)
export const createCapitalCall = (
  fundId: number,
  data: { call_date: string; total_amount: number | null; call_type?: string | null; request_percent?: number | null; memo?: string | null },
): Promise<CapitalCall> => api.post('/capital-calls', { ...data, fund_id: fundId }).then(r => r.data)
export const createCapitalCallBatch = (data: CapitalCallBatchInput): Promise<CapitalCall> => api.post('/capital-calls/batch', data).then(r => r.data)
export const updateCapitalCall = (id: number, data: Partial<CapitalCallInput>): Promise<CapitalCall> => api.put(`/capital-calls/${id}`, data).then(r => r.data)
export const deleteCapitalCall = (id: number) => api.delete(`/capital-calls/${id}`)
export const fetchCapitalCallSummary = (fundId: number): Promise<CapitalCallSummary> => api.get(`/capital-calls/summary/${fundId}`).then(r => r.data)
export const fetchCapitalCallItems = (capitalCallId: number): Promise<CapitalCallItem[]> => api.get(`/capital-calls/${capitalCallId}/items`).then(r => r.data)
export const createCapitalCallItem = (capitalCallId: number, data: CapitalCallItemInput): Promise<CapitalCallItem> => api.post(`/capital-calls/${capitalCallId}/items`, data).then(r => r.data)
export const updateCapitalCallItem = (capitalCallId: number, itemId: number, data: Partial<CapitalCallItemInput>): Promise<CapitalCallItem> => api.put(`/capital-calls/${capitalCallId}/items/${itemId}`, data).then(r => r.data)
export const deleteCapitalCallItem = (capitalCallId: number, itemId: number) => api.delete(`/capital-calls/${capitalCallId}/items/${itemId}`)

export const fetchDistributions = (params?: { fund_id?: number; dist_type?: string }): Promise<Distribution[]> => api.get('/distributions', { params }).then(r => r.data)
export const fetchDistribution = (id: number): Promise<Distribution> => api.get(`/distributions/${id}`).then(r => r.data)
export const createDistribution = (data: DistributionInput): Promise<Distribution> => api.post('/distributions', data).then(r => r.data)
export const updateDistribution = (id: number, data: Partial<DistributionInput>): Promise<Distribution> => api.put(`/distributions/${id}`, data).then(r => r.data)
export const deleteDistribution = (id: number) => api.delete(`/distributions/${id}`)
export const fetchDistributionItems = (distributionId: number): Promise<DistributionItem[]> => api.get(`/distributions/${distributionId}/items`).then(r => r.data)
export const createDistributionItem = (distributionId: number, data: DistributionItemInput): Promise<DistributionItem> => api.post(`/distributions/${distributionId}/items`, data).then(r => r.data)
export const updateDistributionItem = (distributionId: number, itemId: number, data: Partial<DistributionItemInput>): Promise<DistributionItem> => api.put(`/distributions/${distributionId}/items/${itemId}`, data).then(r => r.data)
export const deleteDistributionItem = (distributionId: number, itemId: number) => api.delete(`/distributions/${distributionId}/items/${itemId}`)

export const fetchAssemblies = (params?: { fund_id?: number; type?: string; status?: string }): Promise<Assembly[]> => api.get('/assemblies', { params }).then(r => r.data)
export const fetchAssembly = (id: number): Promise<Assembly> => api.get(`/assemblies/${id}`).then(r => r.data)
export const createAssembly = (data: AssemblyInput): Promise<Assembly> => api.post('/assemblies', data).then(r => r.data)
export const updateAssembly = (id: number, data: Partial<AssemblyInput>): Promise<Assembly> => api.put(`/assemblies/${id}`, data).then(r => r.data)
export const deleteAssembly = (id: number) => api.delete(`/assemblies/${id}`)

export const fetchExitCommittees = (params?: { company_id?: number; status?: string }): Promise<ExitCommittee[]> => api.get('/exit-committees', { params }).then(r => r.data)
export const fetchExitCommittee = (id: number): Promise<ExitCommittee> => api.get(`/exit-committees/${id}`).then(r => r.data)
export const createExitCommittee = (data: ExitCommitteeInput): Promise<ExitCommittee> => api.post('/exit-committees', data).then(r => r.data)
export const updateExitCommittee = (id: number, data: Partial<ExitCommitteeInput>): Promise<ExitCommittee> => api.put(`/exit-committees/${id}`, data).then(r => r.data)
export const deleteExitCommittee = (id: number) => api.delete(`/exit-committees/${id}`)
export const fetchExitCommitteeFunds = (committeeId: number): Promise<ExitCommitteeFund[]> => api.get(`/exit-committees/${committeeId}/funds`).then(r => r.data)
export const createExitCommitteeFund = (committeeId: number, data: ExitCommitteeFundInput): Promise<ExitCommitteeFund> => api.post(`/exit-committees/${committeeId}/funds`, data).then(r => r.data)
export const updateExitCommitteeFund = (committeeId: number, itemId: number, data: Partial<ExitCommitteeFundInput>): Promise<ExitCommitteeFund> => api.put(`/exit-committees/${committeeId}/funds/${itemId}`, data).then(r => r.data)
export const deleteExitCommitteeFund = (committeeId: number, itemId: number) => api.delete(`/exit-committees/${committeeId}/funds/${itemId}`)

export const fetchExitTrades = (
  params?: { fund_id?: number; company_id?: number; investment_id?: number; exit_committee_id?: number; exit_type?: string },
): Promise<ExitTrade[]> => api.get('/exit-trades', { params }).then(r => r.data)
export const fetchExitTrade = (id: number): Promise<ExitTrade> => api.get(`/exit-trades/${id}`).then(r => r.data)
export const createExitTrade = (data: ExitTradeInput): Promise<ExitTrade> => api.post('/exit-trades', data).then(r => r.data)
export const updateExitTrade = (id: number, data: Partial<ExitTradeInput>): Promise<ExitTrade> => api.put(`/exit-trades/${id}`, data).then(r => r.data)
export const deleteExitTrade = (id: number) => api.delete(`/exit-trades/${id}`)
export const settleExitTrade = (id: number, data: ExitTradeSettleInput): Promise<ExitTrade> =>
  api.patch(`/exit-trades/${id}/settle`, data).then(r => r.data)
export const fetchExitDashboard = (fund_id?: number): Promise<ExitDashboardResponse> =>
  api.get('/exits/dashboard', { params: { fund_id } }).then(r => r.data)
export const generateExitDistribution = (tradeId: number): Promise<{ ok: boolean; distribution_id: number; trade_id: number }> =>
  api.post('/exits/generate-distribution', null, { params: { trade_id: tradeId } }).then(r => r.data)

export const fetchFundPerformance = (fundId: number, params?: { as_of_date?: string }): Promise<FundPerformance> =>
  api.get(`/funds/${fundId}/performance`, { params }).then(r => r.data)

export const fetchValuationNavSummary = (): Promise<ValuationNavSummaryItem[]> =>
  api.get('/valuations/nav-summary').then(r => r.data)
export const fetchValuationHistory = (investmentId: number): Promise<ValuationHistoryPoint[]> =>
  api.get(`/valuations/history/${investmentId}`).then(r => r.data)
export const bulkCreateValuations = (data: ValuationBulkCreateInput): Promise<Valuation[]> =>
  api.post('/valuations/bulk', data).then(r => r.data)
export const fetchValuationDashboard = (fund_id?: number): Promise<ValuationDashboardResponse> =>
  api.get('/valuations/dashboard', { params: { fund_id } }).then(r => r.data)

export const fetchCapitalCallDetails = (capitalCallId: number): Promise<CapitalCallDetail[]> =>
  api.get(`/capital-calls/${capitalCallId}/details`).then(r => r.data)
export const generateCapitalCallDetails = (
  capitalCallId: number,
  replaceExisting = true,
): Promise<CapitalCallDetail[]> =>
  api.post(`/capital-calls/${capitalCallId}/details/auto-generate`, null, {
    params: { replace_existing: replaceExisting },
  }).then(r => r.data)
export const updateCapitalCallDetail = (
  detailId: number,
  data: CapitalCallDetailUpdateInput,
): Promise<CapitalCallDetail> => api.patch(`/capital-call-details/${detailId}`, data).then(r => r.data)

export const fetchDistributionDetails = (distributionId: number): Promise<DistributionDetail[]> =>
  api.get(`/distributions/${distributionId}/details`).then(r => r.data)
export const generateDistributionDetails = (
  distributionId: number,
  replaceExisting = true,
): Promise<DistributionDetail[]> =>
  api.post(`/distributions/${distributionId}/details/auto-generate`, null, {
    params: { replace_existing: replaceExisting },
  }).then(r => r.data)
export const updateDistributionDetail = (
  detailId: number,
  data: DistributionDetailUpdateInput,
): Promise<DistributionDetail> => api.patch(`/distribution-details/${detailId}`, data).then(r => r.data)

export const fetchManagementFees = (params?: { fund_id?: number; year?: number }): Promise<ManagementFeeResponse[]> =>
  api.get('/fees/management', { params }).then(r => r.data)
export const fetchManagementFeesByFund = (fundId: number): Promise<ManagementFeeResponse[]> =>
  api.get(`/fees/management/fund/${fundId}`).then(r => r.data)
export const calculateManagementFee = (data: ManagementFeeCalculateInput): Promise<ManagementFeeResponse> =>
  api.post('/fees/management/calculate', data).then(r => r.data)
export const updateManagementFee = (id: number, data: ManagementFeeUpdateInput): Promise<ManagementFeeResponse> =>
  api.patch(`/fees/management/${id}`, data).then(r => r.data)
export const fetchFeeConfig = (fundId: number): Promise<FeeConfigResponse> =>
  api.get(`/fees/config/${fundId}`).then(r => r.data)
export const updateFeeConfig = (fundId: number, data: FeeConfigInput): Promise<FeeConfigResponse> =>
  api.put(`/fees/config/${fundId}`, data).then(r => r.data)
export const simulatePerformanceFee = (data: PerformanceFeeSimulateInput): Promise<PerformanceFeeSimulationResponse> =>
  api.post('/fees/performance/simulate', data).then(r => r.data)
export const fetchPerformanceFeeSimulations = (fundId: number): Promise<PerformanceFeeSimulationResponse[]> =>
  api.get(`/fees/performance/fund/${fundId}`).then(r => r.data)
export const updatePerformanceFeeSimulation = (
  id: number,
  data: PerformanceFeeSimulationUpdateInput,
): Promise<PerformanceFeeSimulationResponse> => api.patch(`/fees/performance/${id}`, data).then(r => r.data)
export const fetchFeeWaterfall = (fundId: number): Promise<WaterfallResponse> =>
  api.get(`/fees/waterfall/${fundId}`).then(r => r.data)

export const fetchBizReportMatrix = (year?: number): Promise<BizReportMatrixResponse> =>
  api.get('/biz-reports/matrix', { params: { year } }).then(r => r.data)
export const fetchBizReportTemplates = (): Promise<BizReportTemplateResponse[]> =>
  api.get('/biz-report-templates').then(r => r.data)
export const createBizReportTemplate = (data: BizReportTemplateInput): Promise<BizReportTemplateResponse> =>
  api.post('/biz-report-templates', data).then(r => r.data)
export const fetchBizReportRequests = (reportId: number): Promise<BizReportRequestResponse[]> =>
  api.get(`/biz-reports/${reportId}/requests`).then(r => r.data)
export const generateBizReportRequests = (reportId: number): Promise<BizReportRequestResponse[]> =>
  api.post(`/biz-reports/${reportId}/requests/generate`).then(r => r.data)
export const fetchBizReportDocCollectionMatrix = (
  params?: { report_id?: number; fund_id?: number; year?: number; quarter?: number },
): Promise<BizReportDocCollectionMatrix> =>
  api.get('/biz-reports/doc-collection-matrix', { params }).then(r => r.data)
export const updateBizReportRequest = (
  requestId: number,
  data: BizReportRequestUpdateInput,
): Promise<BizReportRequestResponse> => api.patch(`/biz-report-requests/${requestId}`, data).then(r => r.data)
export const updateBizReportRequestDocStatus = (
  requestId: number,
  data: BizReportRequestDocStatusInput,
): Promise<BizReportRequestResponse> => api.patch(`/biz-report-requests/${requestId}/doc-status`, data).then(r => r.data)
export const sendBizReportDocRequests = (
  reportId: number,
  data?: { quarter?: number; deadline_days?: number },
): Promise<BizReportSendDocRequestsResponse> =>
  api.post(`/biz-reports/${reportId}/send-doc-requests`, data ?? {}).then(r => r.data)
export const detectBizReportAnomalies = (requestId: number): Promise<BizReportAnomalyResponse[]> =>
  api.post(`/biz-report-requests/${requestId}/detect-anomalies`).then(r => r.data)
export const fetchBizReportAnomalies = (requestId: number): Promise<BizReportAnomalyResponse[]> =>
  api.get(`/biz-report-requests/${requestId}/anomalies`).then(r => r.data)
export const fetchBizReportCommentDiff = (requestId: number): Promise<BizReportCommentDiffResponse> =>
  api.get(`/biz-report-requests/${requestId}/comment-diff`).then(r => r.data)
export const generateBizReportExcel = (reportId: number): Promise<BizReportGenerationResponse> =>
  api.post(`/biz-reports/${reportId}/generate-excel`).then(r => r.data)
export const generateBizReportDocx = (reportId: number): Promise<BizReportGenerationResponse> =>
  api.post(`/biz-reports/${reportId}/generate-docx`).then(r => r.data)

export const authLogin = (data: LoginRequestInput): Promise<LoginResponse> =>
  api.post('/auth/login', data).then((r) => r.data)
export const authGoogleLogin = (data: GoogleLoginRequestInput): Promise<LoginResponse> =>
  api.post('/auth/google', data).then((r) => r.data)
export const fetchAuthMe = (): Promise<UserResponse> =>
  api.get('/auth/me').then((r) => r.data)
export const changePassword = (data: ChangePasswordRequestInput): Promise<{ ok: boolean }> =>
  api.post('/auth/change-password', data).then((r) => r.data)
export const registerUser = (data: RegisterRequestInput): Promise<RegisterResponse> =>
  api.post('/auth/register', data).then((r) => r.data)
export const registerWithInvite = (data: RegisterWithInviteRequestInput): Promise<LoginResponse> =>
  api.post('/auth/register-with-invite', data).then((r) => r.data)
export const checkUsernameAvailability = (username: string): Promise<AvailabilityResponse> =>
  api.get('/auth/check-username', { params: { username } }).then((r) => r.data)
export const checkEmailAvailability = (email: string): Promise<AvailabilityResponse> =>
  api.get('/auth/check-email', { params: { email } }).then((r) => r.data)
export const forgotPassword = (data: ForgotPasswordRequestInput): Promise<{ message: string }> =>
  api.post('/auth/forgot-password', data).then((r) => r.data)
export const resetPassword = (data: ResetPasswordRequestInput): Promise<{ ok: boolean }> =>
  api.post('/auth/reset-password', data).then((r) => r.data)
export const updateMyProfile = (data: ProfileUpdateRequestInput): Promise<UserResponse> =>
  api.patch('/auth/profile', data).then((r) => r.data)
export const linkGoogle = (data: GoogleLoginRequestInput): Promise<UserResponse> =>
  api.post('/auth/link-google', data).then((r) => r.data)
export const unlinkGoogle = (): Promise<UserResponse> =>
  api.post('/auth/unlink-google').then((r) => r.data)
export const logoutAllDevices = (): Promise<{ ok: boolean }> =>
  api.post('/auth/logout-all').then((r) => r.data)

export const fetchUsers = (activeOnly = false): Promise<UserResponse[]> =>
  api.get('/users', { params: { active_only: activeOnly } }).then(r => r.data)
export const fetchPendingUsers = (): Promise<UserResponse[]> =>
  api.get('/users/pending').then((r) => r.data)
export const createUser = (data: UserCreateInput): Promise<UserResponse> =>
  api.post('/users', data).then(r => r.data)
export const updateUser = (id: number, data: UserUpdateInput): Promise<UserResponse> =>
  api.put(`/users/${id}`, data).then(r => r.data)
export const deactivateUser = (id: number): Promise<UserResponse> =>
  api.patch(`/users/${id}/deactivate`).then(r => r.data)
export const approveUser = (id: number, data?: UserApproveInput): Promise<UserResponse> =>
  api.patch(`/users/${id}/approve`, data ?? {}).then((r) => r.data)
export const rejectUser = (id: number): Promise<{ ok: boolean }> =>
  api.patch(`/users/${id}/reject`).then((r) => r.data)
export const adminResetUserPassword = (
  id: number,
  data: AdminResetPasswordRequestInput,
): Promise<{ ok: boolean }> => api.post(`/users/${id}/reset-password`, data).then((r) => r.data)
export const generateUserResetToken = (id: number): Promise<ResetPasswordTokenResponse> =>
  api.post(`/users/${id}/generate-reset-token`).then((r) => r.data)
export const unlockUser = (id: number): Promise<UserResponse> =>
  api.post(`/users/${id}/unlock`).then((r) => r.data)

export const fetchInvitations = (): Promise<InvitationResponse[]> =>
  api.get('/invitations').then((r) => r.data)
export const createInvitation = (data: InvitationCreateInput): Promise<InvitationResponse> =>
  api.post('/invitations', data).then((r) => r.data)
export const cancelInvitation = (id: number): Promise<{ ok: boolean }> =>
  api.delete(`/invitations/${id}`).then((r) => r.data)
export const verifyInvitation = (token: string): Promise<InvitationVerifyResponse> =>
  api.get('/invitations/verify', { params: { token } }).then((r) => r.data)

// -- Checklist --
export const fetchChecklists = (params?: { investment_id?: number }): Promise<ChecklistListItem[]> =>
  api.get('/checklists', { params }).then(r => r.data)
export const fetchChecklist = (id: number): Promise<Checklist> => api.get(`/checklists/${id}`).then(r => r.data)
export const createChecklist = (data: ChecklistInput): Promise<Checklist> => api.post('/checklists', data).then(r => r.data)
export const updateChecklist = (id: number, data: Partial<ChecklistInput>): Promise<Checklist> => api.put(`/checklists/${id}`, data).then(r => r.data)
export const deleteChecklist = (id: number) => api.delete(`/checklists/${id}`)
export const createChecklistItem = (checklistId: number, data: ChecklistItemInput): Promise<ChecklistItem> => api.post(`/checklists/${checklistId}/items`, data).then(r => r.data)
export const updateChecklistItem = (checklistId: number, itemId: number, data: Partial<ChecklistItemInput>): Promise<ChecklistItem> => api.put(`/checklists/${checklistId}/items/${itemId}`, data).then(r => r.data)
export const deleteChecklistItem = (checklistId: number, itemId: number) => api.delete(`/checklists/${checklistId}/items/${itemId}`)

// -- Document Status --
export const fetchDocumentStatus = (params?: { status?: string; fund_id?: number; company_id?: number }): Promise<DocumentStatusItem[]> => api.get('/document-status', { params }).then(r => r.data)

// -- Calendar --
export const fetchCalendarEvents = (
  params?: { date_from?: string; date_to?: string; status?: string; year?: number; month?: number; include_tasks?: boolean },
): Promise<CalendarEvent[]> => api.get('/calendar-events', { params }).then(r => r.data)
export const createCalendarEvent = (data: CalendarEventInput) => api.post('/calendar-events', data).then(r => r.data)
export const updateCalendarEvent = (id: number, data: Partial<CalendarEventInput>) => api.put(`/calendar-events/${id}`, data).then(r => r.data)
export const deleteCalendarEvent = (id: number) => api.delete(`/calendar-events/${id}`)

// -- WorkLogs --
export const fetchWorkLogs = (params?: { date_from?: string; date_to?: string; category?: string }): Promise<WorkLog[]> => api.get('/worklogs', { params }).then(r => r.data)
export const fetchWorkLog = (id: number): Promise<WorkLog> => api.get(`/worklogs/${id}`).then(r => r.data)
export const fetchWorkLogCategories = (): Promise<string[]> => api.get('/worklogs/categories').then(r => r.data)
export const createWorkLog = (data: WorkLogInput): Promise<WorkLog> => api.post('/worklogs', data).then(r => r.data)
export const updateWorkLog = (id: number, data: Partial<WorkLogInput>): Promise<WorkLog> => api.put(`/worklogs/${id}`, data).then(r => r.data)
export const deleteWorkLog = (id: number) => api.delete(`/worklogs/${id}`)
export const fetchWorkLogLessonsByCategory = (
  params: {
    category: string
    fund_id?: number | null
    investment_id?: number | null
    company_name?: string | null
    limit?: number
  },
): Promise<WorkLogLessonReminder[]> => api.get('/worklogs/lessons', { params }).then(r => r.data)
export const fetchWorkLogInsights = (period: 'week' | 'month' | 'quarter' = 'month'): Promise<WorkLogInsights> =>
  api.get('/worklogs/insights', { params: { period } }).then(r => r.data)

// -- Types --
export interface DashboardBaseResponse {
  date: string
  day_of_week: string
  monthly_reminder: boolean
  investment_review_active_count: number
  total_nav: number
  unpaid_lp_count: number
  pending_fee_count: number
  biz_report_in_progress_count: number
  today: { tasks: Task[]; total_estimated_time: string }
  tomorrow: { tasks: Task[]; total_estimated_time: string }
  this_week: Task[]
  upcoming: Task[]
  no_deadline: Task[]
  prioritized_tasks: DashboardPrioritizedTask[]
  compliance: DashboardComplianceWidget
  doc_collection: DashboardDocCollectionWidget
  urgent_alerts: DashboardUrgentAlert[]
}

export interface DashboardWorkflowsResponse {
  active_workflows: ActiveWorkflow[]
}

export interface DashboardSidebarResponse {
  fund_summary: FundSummary[]
  missing_documents: MissingDocument[]
  upcoming_reports: UpcomingReport[]
}

export interface DashboardCompletedResponse {
  completed_today: Task[]
  completed_this_week: Task[]
  completed_last_week: Task[]
  completed_today_count: number
  completed_this_week_count: number
}

export interface DashboardResponse extends DashboardBaseResponse, DashboardWorkflowsResponse, DashboardSidebarResponse, DashboardCompletedResponse {
  upcoming_notices?: UpcomingNotice[]
}

export interface DashboardComplianceWidget {
  overdue_count: number
  due_this_week: number
  due_this_month: number
}

export interface DashboardDocCollectionWidget {
  current_quarter: string
  completion_pct: number
  pending_companies: number
}

export interface DashboardUrgentAlert {
  type: string
  message: string
  due_date: string | null
}

export interface DashboardPrioritizedTaskWorkflowInfo {
  name: string
  step: string
  step_name: string
}

export interface DashboardPrioritizedTask {
  task: Task
  urgency: 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'upcoming'
  d_day: number | null
  workflow_info: DashboardPrioritizedTaskWorkflowInfo | null
  source: 'manual' | 'workflow' | 'compliance'
}

export interface ComplianceRule {
  id: number
  fund_id: number | null
  document_id: number | null
  document_title: string | null
  rule_code: string
  rule_name: string
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | string
  category: string
  description: string | null
  condition: Record<string, unknown>
  severity: 'info' | 'warning' | 'error' | 'critical' | string
  auto_task: boolean
  is_active: boolean
  created_at: string | null
}

export interface ComplianceRuleCreateInput {
  fund_id?: number | null
  document_id?: number | null
  rule_code: string
  rule_name: string
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | string
  category: string
  description?: string | null
  condition: Record<string, unknown>
  severity?: 'info' | 'warning' | 'error' | 'critical' | string
  auto_task?: boolean
  is_active?: boolean
}

export interface ComplianceRuleUpdateInput {
  fund_id?: number | null
  document_id?: number | null
  rule_code?: string
  rule_name?: string
  level?: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | string
  category?: string
  description?: string | null
  condition?: Record<string, unknown>
  severity?: 'info' | 'warning' | 'error' | 'critical' | string
  auto_task?: boolean
  is_active?: boolean
}

export interface ComplianceObligation {
  id: number
  rule_id: number
  rule_code: string | null
  rule_title: string | null
  category: string | null
  subcategory: string | null
  fund_id: number
  fund_name: string | null
  period_type: string | null
  due_date: string | null
  d_day: number | null
  status: string
  completed_date: string | null
  completed_by: string | null
  evidence_note: string | null
  investment_id: number | null
  task_id: number | null
  target_system: string | null
  guideline_ref: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ComplianceDashboardByFundItem {
  fund_id: number
  fund_name: string
  overdue: number
  pending: number
  completed: number
}

export interface ComplianceDashboardSummaryMetrics {
  total_rules: number
  active_violations: number
  warnings: number
  passed: number
  compliance_rate: number
}

export interface ComplianceDashboardFundStatusItem {
  fund_id: number
  fund_name: string
  total_rules: number
  passed: number
  failed: number
  warnings?: number
  violation_count?: number
  compliance_rate: number
  last_checked: string | null
}

export interface ComplianceDashboardRecentCheckItem {
  id: number
  fund_id: number
  fund_name: string | null
  rule_id: number
  rule_code: string | null
  rule_name: string | null
  result: 'pass' | 'warning' | 'fail' | 'error' | string
  detail: string | null
  checked_at: string | null
  trigger_type: 'manual' | 'event' | 'scheduled' | string | null
  trigger_source: string | null
}

export interface ComplianceDashboardAmendmentAlert {
  id: number
  law_name: string | null
  effective_date: string | null
  days_remaining: number | null
  summary: string | null
  version: string | null
  created_at: string | null
}

export interface ComplianceDashboardDocumentStats {
  laws: number
  regulations: number
  guidelines: number
  agreements: number
  internal: number
  total_chunks: number
}

export interface ComplianceDashboardLlmUsage {
  month_total_tokens: number
  month_limit: number
  month_cost_usd: number
  usage_rate: number
}

export interface ComplianceDashboardSummary {
  summary?: ComplianceDashboardSummaryMetrics
  fund_status?: ComplianceDashboardFundStatusItem[]
  recent_checks?: ComplianceDashboardRecentCheckItem[]
  amendment_alerts?: ComplianceDashboardAmendmentAlert[]
  document_stats?: ComplianceDashboardDocumentStats
  llm_usage?: ComplianceDashboardLlmUsage
  overdue_count: number
  due_this_week: number
  due_this_month: number
  completed_count: number
  by_fund: ComplianceDashboardByFundItem[]
  rule_count?: number
  active_rule_count?: number
  check_count?: number
  failed_check_count?: number
  recent_check_count?: number
}

export interface ComplianceCheckRecord {
  id: number
  rule_id: number
  rule_code: string | null
  rule_name: string | null
  level: string | null
  fund_id: number
  fund_name: string | null
  checked_at: string | null
  result: 'pass' | 'warning' | 'fail' | 'error' | string
  actual_value: string | null
  threshold_value: string | null
  detail: string | null
  trigger_type: 'manual' | 'event' | 'scheduled' | string | null
  trigger_source: string | null
  trigger_source_id: number | null
  remediation_task_id: number | null
  remediation_task_title: string | null
  resolved_at: string | null
}

export interface ComplianceManualCheckResponse {
  fund_id: number
  checked_count: number
  failed_count: number
  warning_count: number
  checks: ComplianceCheckRecord[]
}

export interface ComplianceDocument {
  id: number
  title: string
  document_type: string
  version: string | null
  effective_date: string | null
  content_summary: string | null
  file_path: string | null
  is_active: boolean
  created_at: string | null
}

export interface ComplianceDocumentCreateInput {
  title: string
  document_type: string
  version?: string | null
  effective_date?: string | null
  content_summary?: string | null
  file_path?: string | null
  is_active?: boolean
}

export type LegalDocumentType = 'laws' | 'regulations' | 'guidelines' | 'agreements' | 'internal'
export type LegalDocumentScope = 'global' | 'fund_type' | 'fund'

export interface LegalDocument extends ComplianceDocument {
  scope: LegalDocumentScope
  fund_id: number | null
  fund_name: string | null
  fund_type_filter: string | null
  chunk_count?: number | null
}

export interface LegalDocumentUploadInput {
  file: File
  title: string
  document_type: LegalDocumentType | string
  version?: string | null
  fund_id?: number | null
  fund_type_filter?: string | null
}

export interface LegalDocumentUploadResponse {
  document: LegalDocument
  chunk_count: number
  collection: LegalDocumentType | string
}

export interface LegalDocumentSearchResult {
  id: string
  text: string
  metadata: Record<string, unknown>
  distance: number | null
  collection: string
}

export interface LegalDocumentSearchResponse {
  query: string
  collection?: string | null
  count: number
  results: LegalDocumentSearchResult[]
}

export interface LegalDocumentCollectionStat {
  count: number
  description: string
}

export interface LegalDocumentStatsResponse {
  collections: Record<LegalDocumentType | string, LegalDocumentCollectionStat>
  total_chunks: number
}

export interface ComplianceLimitCheckItem {
  rule_code: string
  result: 'pass' | 'warning' | 'block' | string
  current_pct?: number | null
  limit_pct?: number | null
  detail?: string | null
}

export interface ComplianceLimitCheckRequest {
  fund_id: number
  company_name: string
  amount: number
  is_overseas?: boolean
  is_affiliate?: boolean
}

export interface ComplianceLimitCheckResponse {
  checks: ComplianceLimitCheckItem[]
  overall: 'pass' | 'warning' | 'block' | string
}

export interface ComplianceInterpretRequest {
  query: string
  fund_id?: number | null
}

export interface ComplianceInterpretSource {
  collection: string
  scope?: LegalDocumentScope | string
  text: string
  title?: string
  article: string
  distance: number | null
  relevance?: number
}

export interface ComplianceInterpretRuleCheckItem {
  rule_code: string
  rule_name: string
  result: string
  detail: string | null
}

export interface ComplianceInterpretRuleCheck {
  matched_keyword: string | null
  status: 'pass' | 'fail' | string
  answer: string
  checks: ComplianceInterpretRuleCheckItem[]
}

export interface ComplianceInterpretResponse {
  tier: 'L1' | 'L2' | string
  answer: string
  sources: ComplianceInterpretSource[]
  rule_check: ComplianceInterpretRuleCheck | null
  tokens_used: number
}

export interface ComplianceLLMUsageRecord {
  id: number
  service: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  request_summary: string | null
  user_id: number | null
  created_at: string | null
}

export interface ComplianceLLMUsageByService {
  service: string
  total_tokens: number
  estimated_cost_usd: number
}

export interface ComplianceLLMUsageResponse {
  period: 'month' | 'week' | 'all' | string
  used_tokens: number
  used_cost_usd: number
  limit_tokens: number | null
  remaining_tokens: number | null
  usage_pct: number | null
  records: ComplianceLLMUsageRecord[]
  by_service: ComplianceLLMUsageByService[]
}

export interface ComplianceScheduledJobStatus {
  job_id: string
  label: string
  cron: string
  next_run_at: string | null
  last_run_at: string | null
  enabled: boolean
}

export interface ComplianceScanHistoryItem {
  scan_type: string
  scan_date: string
  last_checked_at: string
  checked_count: number
  pass_count: number
  warning_count: number
  failed_count: number
  fund_count: number
}

export interface ComplianceScanHistoryResponse {
  period: 'week' | 'month' | 'all' | string
  schedules: ComplianceScheduledJobStatus[]
  history: ComplianceScanHistoryItem[]
}

export interface ComplianceManualScanRequest {
  fund_id?: number | null
  mode?: 'daily' | 'full' | 'law' | string
}

export interface ComplianceManualScanFundResult {
  fund_id: number
  fund_name: string
  total_rules: number
  passed: number
  failed: number
  warnings: number
  new_violations: Array<{
    rule_code: string
    rule_name: string
    detail: string | null
  }>
}

export interface ComplianceManualScanResponse {
  scan_type?: string
  trigger_type?: string
  executed_at?: string
  fund_count?: number
  total_rules?: number
  passed?: number
  failed?: number
  warnings?: number
  results?: ComplianceManualScanFundResult[]
  checked_at?: string
  days?: number
  count?: number
  saved_count?: number
  amendments?: Array<Record<string, unknown>>
  errors?: string[]
}

export interface ComplianceRecurringViolation {
  rule_id: number
  rule_code: string | null
  rule_name: string | null
  violation_count: number
  months_violated: string[]
  severity: string | null
  pattern: string
  recommendation: string
}

export interface ComplianceTrendArea {
  rule_id: number
  rule_code: string | null
  rule_name: string | null
  early_period_violations: number
  recent_period_violations: number
  delta: number
  trend: 'improving' | 'worsening' | string
}

export interface ComplianceViolationPatternsResponse {
  fund_id: number
  months: number
  since: string
  recurring_violations: ComplianceRecurringViolation[]
  improving_areas: ComplianceTrendArea[]
  worsening_areas: ComplianceTrendArea[]
}

export interface ComplianceRuleSuggestion {
  rule_id: number
  fund_id: number | null
  rule_code: string | null
  rule_name: string | null
  current_level: string | null
  current_severity: string | null
  suggestion: 'frequency_reduce' | 'severity_upgrade' | string
  detail: string
  recommended_severity?: string | null
  violation_count?: number | null
}

export interface ComplianceRemediationOverdueTask {
  task_id: number
  task_title: string | null
  days_open: number
  deadline: string | null
  rule_id: number | null
  rule_name: string | null
  fund_id: number | null
  checked_at: string | null
}

export interface ComplianceRemediationStatsResponse {
  fund_id: number | null
  total_tasks: number
  completed: number
  pending: number
  completion_rate: number
  avg_resolution_days: number
  overdue_tasks: ComplianceRemediationOverdueTask[]
}

export interface ComplianceMonthlySummary {
  total_checks: number
  pass: number
  fail: number
  warning: number
}

export interface ComplianceMonthlyViolation {
  check_id: number
  rule_id: number | null
  rule_code: string | null
  rule_name: string | null
  result: string | null
  detail: string | null
  checked_at: string | null
}

export interface ComplianceMonthlyTrend {
  period: string
  previous_period: string
  improved: number
  worsened: number
  unchanged: number
}

export interface ComplianceMonthlyReportResponse {
  fund_id: number
  fund_name: string
  period: string
  generated_at: string
  summary: ComplianceMonthlySummary
  violations: ComplianceMonthlyViolation[]
  recurring_patterns: ComplianceRecurringViolation[]
  remediation_status: ComplianceRemediationStatsResponse
  recommendations: ComplianceRuleSuggestion[]
  trend_vs_last_month: ComplianceMonthlyTrend
}

export interface VicsGenerateInput {
  fund_id: number
  year: number
  month: number
  report_code: '1308' | '1309' | '1329' | string
}

export interface VicsMonthlyReport {
  id: number
  fund_id: number
  year: number
  month: number
  report_code: string
  data_json: Record<string, unknown>
  status: string
  confirmed_at: string | null
  submitted_at: string | null
  discrepancy_notes: string | null
  created_at: string | null
  updated_at: string | null
}

export interface InternalReviewCreateInput {
  fund_id: number
  year: number
  quarter: number
}

export interface InternalReviewPatchInput {
  review_date?: string | null
  status?: string | null
  attendees?: Array<Record<string, unknown>>
  compliance_opinion?: string | null
  compliance_officer?: string | null
  minutes_document_id?: number | null
}

export interface CompanyReviewPatchInput {
  quarterly_revenue?: number | null
  quarterly_operating_income?: number | null
  quarterly_net_income?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
  total_equity?: number | null
  cash_and_equivalents?: number | null
  paid_in_capital?: number | null
  employee_count?: number | null
  employee_change?: number | null
  asset_rating?: string | null
  rating_reason?: string | null
  impairment_type?: string | null
  impairment_amount?: number | null
  key_issues?: string | null
  follow_up_actions?: string | null
  board_attendance?: string | null
  investment_opinion?: string | null
}

export interface CompanyReview {
  id: number
  review_id: number
  investment_id: number
  company_id: number | null
  company_name: string
  quarterly_revenue: number | null
  quarterly_operating_income: number | null
  quarterly_net_income: number | null
  total_assets: number | null
  total_liabilities: number | null
  total_equity: number | null
  cash_and_equivalents: number | null
  paid_in_capital: number | null
  employee_count: number | null
  employee_change: number | null
  asset_rating: string | null
  rating_reason: string | null
  impairment_type: string | null
  impairment_amount: number | null
  impairment_flags: string[]
  key_issues: string | null
  follow_up_actions: string | null
  board_attendance: string | null
  investment_opinion: string | null
  created_at: string | null
  updated_at: string | null
}

export interface InternalReview {
  id: number
  fund_id: number
  fund_name: string
  year: number
  quarter: number
  reference_date: string | null
  review_date: string | null
  status: string
  attendees: Array<Record<string, unknown>>
  compliance_opinion: string | null
  compliance_officer: string | null
  minutes_document_id: number | null
  obligation_id: number | null
  created_at: string | null
  updated_at: string | null
  company_reviews?: CompanyReview[]
}

export interface InternalReviewAutoEvaluateResult {
  company_review_id: number
  company_name: string
  rating: string
  impairment_type: string
  flags: string[]
}

export interface ActiveWorkflow {
  id: number
  name: string
  progress: string
  next_step: string | null
  next_step_date: string | null
  company_name: string | null
  fund_name: string | null
  gp_entity_name: string | null
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
  compliance_overdue: number
  doc_collection_progress: string | null
}

export interface FundOverviewItem {
  no: number
  id: number
  name: string
  status?: string | null
  fund_type: string
  fund_manager: string | null
  formation_date: string | null
  registration_date: string | null
  investment_period_end: string | null
  investment_period_progress: number | null
  maturity_date: string | null
  commitment_total: number | null
  total_paid_in: number | null
  paid_in_ratio: number | null
  gp_commitment: number | null
  total_invested: number | null
  uninvested: number | null
  investment_assets: number | null
  company_count: number
  active_workflow_count: number
  pending_task_count: number
  hurdle_rate: number | null
  remaining_period: string | null
}

export interface FundOverviewTotals {
  commitment_total: number
  total_paid_in: number
  gp_commitment: number
  total_invested: number
  total_distributed?: number
  uninvested: number
  investment_assets: number
  company_count: number
  active_workflow_count: number
  pending_task_count: number
}

export interface FundOverviewResponse {
  reference_date: string
  funds: FundOverviewItem[]
  totals: FundOverviewTotals
}

export interface MissingDocument {
  id: number
  investment_id: number
  document_name: string
  document_type: string | null
  status: string
  company_name: string
  fund_name: string
  due_date: string | null
  days_remaining: number | null
}

export interface TaskCreate {
  title: string
  deadline?: string | null
  estimated_time?: string | null
  quadrant?: string
  memo?: string | null
  delegate_to?: string | null
  category?: string | null
  fund_id?: number | null
  investment_id?: number | null
  gp_entity_id?: number | null
  is_notice?: boolean
  is_report?: boolean
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
  updated_at: string | null
  completed_at: string | null
  actual_time: string | null
  workflow_instance_id: number | null
  workflow_step_order: number | null
  category: string | null
  fund_id: number | null
  investment_id: number | null
  gp_entity_id: number | null
  obligation_id?: number | null
  is_notice: boolean
  is_report: boolean
  fund_name: string | null
  gp_entity_name: string | null
  company_name: string | null
  workflow_name?: string | null
  stale_days?: number | null
  attachment_count?: number
}

export interface TaskCompletionCheckResult {
  can_complete: boolean
  documents: TaskCompletionCheckDocument[]
  missing_documents: string[]
  warnings: string[]
}

export interface TaskCompletionCheckDocument {
  id: number
  name: string
  required: boolean
  checked: boolean
  has_attachment: boolean
  attachment_ids: number[]
}

export interface TaskBoardSummary {
  overdue_count: number
  today_count: number
  this_week_count: number
  completed_today_count: number
  total_pending_count: number
  total_estimated_minutes: number
  completed_estimated_minutes: number
  stale_count: number
  work_score: number
  progress_count_pct: number
  progress_time_pct: number
}

export interface TaskBoard {
  summary: TaskBoardSummary
  Q1: Task[]
  Q2: Task[]
  Q3: Task[]
  Q4: Task[]
}

export interface TaskCategory {
  id: number
  name: string
}

export interface WorkflowListItem {
  id: number
  name: string
  trigger_description: string | null
  category: string | null
  total_duration: string | null
  step_count: number
}

export interface WorkflowStep {
  id: number
  workflow_id: number
  order: number
  name: string
  timing: string
  timing_offset_days: number
  estimated_time: string | null
  quadrant: string
  memo: string | null
  is_notice?: boolean
  is_report?: boolean
  step_documents?: WorkflowStepDocument[]
}

export interface WorkflowStepDocument {
  id: number
  workflow_step_id: number
  document_template_id: number | null
  name: string
  required: boolean
  timing: string | null
  notes: string | null
  attachment_ids?: number[]
  template_name?: string | null
  template_category?: string | null
}

export interface WorkflowDocument {
  id: number
  workflow_id: number
  name: string
  required: boolean
  timing: string | null
  notes: string | null
}

export interface WorkflowWarning {
  id: number
  workflow_id: number
  content: string
  category: 'warning' | 'lesson' | 'tip'
}

export interface WorkflowTemplate {
  id: number
  name: string
  trigger_description: string | null
  category: string | null
  total_duration: string | null
  steps: WorkflowStep[]
  documents: WorkflowDocument[]
  warnings: WorkflowWarning[]
}

export interface DocumentTemplate {
  id: number
  name: string
  category: string
  file_path: string
  builder_name: string | null
  description: string
  variables: string
  custom_data: string | null
  workflow_step_label: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface WorkflowStepInstanceDocument {
  id: number
  step_instance_id: number
  workflow_step_document_id?: number | null
  document_template_id?: number | null
  name: string
  required: boolean
  timing?: string | null
  notes?: string | null
  checked: boolean
  attachment_ids?: number[]
  template_name?: string | null
  template_category?: string | null
}

export interface WorkflowStepInstance {
  id: number
  instance_id: number
  workflow_step_id: number
  step_name: string
  step_timing: string
  calculated_date: string
  status: string
  completed_at: string | null
  actual_time: string | null
  notes: string | null
  task_id: number | null
  estimated_time: string | null
  memo: string | null
  step_documents: WorkflowStepInstanceDocument[]
}

export interface WorkflowInstance {
  id: number
  workflow_id: number
  workflow_name: string
  name: string
  trigger_date: string
  status: string
  created_at: string | null
  completed_at: string | null
  memo: string | null
  investment_id: number | null
  company_id: number | null
  fund_id: number | null
  gp_entity_id: number | null
  investment_name: string | null
  company_name: string | null
  fund_name: string | null
  gp_entity_name: string | null
  step_instances: WorkflowStepInstance[]
  progress: string
}

export interface WorkflowInstantiateInput {
  name: string
  trigger_date: string
  memo?: string
  investment_id?: number
  company_id?: number
  fund_id?: number
  gp_entity_id?: number
}

export interface WorkflowInstanceUpdateInput {
  name: string
  trigger_date: string
  memo?: string | null
}

export interface WorkflowInstanceTemplateSwapInput {
  template_id: number
}

export interface WorkflowStepCompleteInput {
  actual_time?: string
  notes?: string
  lp_paid_in_updates?: WorkflowStepLPPaidInInput[]
}

export interface WorkflowStepLPPaidInInput {
  lp_id: number
  paid_in: number
}

export interface WorkflowStepInstanceDocumentInput {
  name: string
  required?: boolean
  timing?: string | null
  notes?: string | null
  document_template_id?: number | null
  checked?: boolean
  attachment_ids?: number[]
}

export interface WorkflowStepInstanceDocumentUpdate {
  name?: string
  required?: boolean
  timing?: string | null
  notes?: string | null
  document_template_id?: number | null
  checked?: boolean
  attachment_ids?: number[]
}

export interface WorkflowStepInput {
  order: number
  name: string
  timing: string
  timing_offset_days: number
  estimated_time?: string | null
  quadrant?: string
  memo?: string | null
  is_notice?: boolean
  is_report?: boolean
  step_documents?: WorkflowStepDocumentInput[]
}

export interface WorkflowStepDocumentInput {
  name: string
  required?: boolean
  timing?: string | null
  notes?: string | null
  document_template_id?: number | null
  attachment_ids?: number[]
}

export interface WorkflowDocumentInput {
  name: string
  required: boolean
  timing?: string | null
  notes?: string | null
}

export interface WorkflowWarningInput {
  content: string
  category?: 'warning' | 'lesson' | 'tip' | null
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

export interface PeriodicStepConfig {
  name: string
  offset_days: number
  is_notice?: boolean
  is_report?: boolean
}

export interface PeriodicSchedule {
  id: number
  name: string
  category: string
  recurrence: 'quarterly' | 'semi-annual' | 'annual' | string
  base_month: number
  base_day: number
  workflow_template_id: number | null
  fund_type_filter: string | null
  is_active: boolean
  steps: PeriodicStepConfig[]
  description: string | null
}

export interface PeriodicScheduleInput {
  name: string
  category: string
  recurrence: 'quarterly' | 'semi-annual' | 'annual' | string
  base_month: number
  base_day: number
  workflow_template_id?: number | null
  fund_type_filter?: string | null
  is_active?: boolean
  steps: PeriodicStepConfig[]
  description?: string | null
}

export interface PeriodicScheduleUpdateInput {
  name?: string
  category?: string
  recurrence?: 'quarterly' | 'semi-annual' | 'annual' | string
  base_month?: number
  base_day?: number
  workflow_template_id?: number | null
  fund_type_filter?: string | null
  is_active?: boolean
  steps?: PeriodicStepConfig[]
  description?: string | null
}

export interface PeriodicScheduleGenerateResult {
  year: number
  dry_run: boolean
  created_instances: number
  skipped_instances: number
  created_tasks: number
  linked_reports: number
  details: string[]
}

export interface Attachment {
  id: number
  filename: string
  original_filename: string
  file_size?: number | null
  mime_type?: string | null
  entity_type?: string | null
  entity_id?: number | null
  created_at?: string | null
  url: string
}

export interface AttachmentLinkInput {
  entity_type?: string | null
  entity_id?: number | null
}

export interface TaskAttachmentLinkInput {
  attachment_id: number
  workflow_doc_id?: number | null
}

export interface TaskAttachmentLinkResult {
  attachment: Attachment
  linked_workflow_doc: WorkflowStepInstanceDocument | null
}

export interface Fund {
  id: number
  name: string
  type: string
  formation_date: string | null
  registration_number: string | null
  registration_date: string | null
  status: string
  gp: string | null
  fund_manager: string | null
  co_gp: string | null
  trustee: string | null
  commitment_total: number | null
  paid_in_total?: number | null
  gp_commitment: number | null
  contribution_type: string | null
  aum: number | null
  investment_period_end: string | null
  maturity_date: string | null
  dissolution_date?: string | null
  mgmt_fee_rate: number | null
  performance_fee_rate: number | null
  hurdle_rate: number | null
  account_number: string | null
  lp_count?: number
  investment_count?: number
  lps?: LP[]
  notice_periods?: FundNoticePeriodResponse[]
  key_terms?: FundKeyTermResponse[]
}

export interface FundInput {
  name: string
  type: string
  formation_date?: string | null
  registration_number?: string | null
  registration_date?: string | null
  status?: string
  gp?: string | null
  fund_manager?: string | null
  co_gp?: string | null
  trustee?: string | null
  commitment_total?: number | null
  gp_commitment?: number | null
  gp_commitment_amount?: number | null
  contribution_type?: string | null
  aum?: number | null
  investment_period_end?: string | null
  maturity_date?: string | null
  dissolution_date?: string | null
  mgmt_fee_rate?: number | null
  performance_fee_rate?: number | null
  hurdle_rate?: number | null
  account_number?: string | null
}

export interface FundFormationWorkflowAddInput {
  template_category_or_name: string
  template_id?: number | null
  trigger_date?: string | null
}

export interface FundFormationWorkflowAddResult {
  instance_id: number
  workflow_id: number
  workflow_name: string
  formation_slot: string
  instance_name: string
  status: string
  trigger_date: string
  fund_id: number
}

export interface LPInput {
  address_book_id?: number | null
  name: string
  type: string
  commitment?: number | null
  paid_in?: number | null
  contact?: string | null
  business_number?: string | null
  address?: string | null
}

export interface LP {
  id: number
  fund_id: number
  address_book_id: number | null
  name: string
  type: string
  commitment: number | null
  paid_in: number | null
  contact: string | null
  business_number: string | null
  address: string | null
}

export interface LPContributionInput {
  fund_id?: number
  lp_id?: number
  due_date: string
  amount: number
  round_no?: number | null
  actual_paid_date?: string | null
  memo?: string | null
  source?: 'manual' | 'capital_call' | 'migration' | string
}

export interface LPContributionBulkInput {
  fund_id: number
  contributions: LPContributionInput[]
}

export interface LPContribution {
  id: number
  fund_id: number
  lp_id: number
  due_date: string
  amount: number
  commitment_ratio: number | null
  round_no: number | null
  actual_paid_date: string | null
  memo: string | null
  capital_call_id: number | null
  source: string
  created_at: string
  lp_name?: string
  cumulative_amount?: number
}

export interface LPContributionSummary {
  lp_id: number
  lp_name: string
  commitment: number
  total_paid_in: number
  paid_ratio: number
  contribution_count: number
  contribution_type: string | null
  contributions: LPContribution[]
}

export interface FundContributionOverview {
  fund_id: number
  contribution_type: string | null
  generated_at?: string
  lp_summaries: LPContributionSummary[]
}

export interface MigrationErrorItem {
  row: number
  column: string
  reason: string
}

export interface FundMigrationValidateResponse {
  success: boolean
  fund_rows: number
  lp_rows: number
  contribution_rows: number
  warnings: MigrationErrorItem[]
  errors: MigrationErrorItem[]
}

export interface FundMigrationImportResponse {
  success: boolean
  mode: 'insert' | 'upsert'
  fund_rows: number
  lp_rows: number
  contribution_rows: number
  created_funds: number
  updated_funds: number
  created_lps: number
  updated_lps: number
  created_contributions: number
  synced_address_books: number
  warnings: MigrationErrorItem[]
  errors: MigrationErrorItem[]
  validation: FundMigrationValidateResponse
}

export interface LPAddressBookInput {
  name: string
  type: string
  business_number?: string | null
  contact?: string | null
  address?: string | null
  memo?: string | null
  gp_entity_id?: number | null
  is_active?: number
}

export interface LPAddressBook {
  id: number
  name: string
  type: string
  business_number: string | null
  contact: string | null
  address: string | null
  memo: string | null
  gp_entity_id: number | null
  is_active: number
  created_at: string | null
  updated_at: string | null
  related_funds_count?: number
  related_funds?: LPAddressBookRelatedFund[]
  total_commitment?: number
  total_paid_in?: number
  outstanding_balance?: number
  paid_in_ratio?: number
}

export interface LPAddressBookRelatedFund {
  fund_id: number
  fund_name: string
}

export interface LPTransferInput {
  from_lp_id: number
  to_lp_id?: number | null
  to_lp_name?: string | null
  to_lp_type?: string | null
  to_lp_business_number?: string | null
  to_lp_address?: string | null
  to_lp_contact?: string | null
  transfer_amount: number
  transfer_date?: string | null
  notes?: string | null
}

export interface LPTransferUpdateInput {
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  transfer_date?: string | null
  notes?: string | null
}

export interface LPTransfer {
  id: number
  fund_id: number
  from_lp_id: number
  from_lp_name: string | null
  to_lp_id: number | null
  to_lp_name: string | null
  to_lp_type: string | null
  to_lp_business_number: string | null
  to_lp_address: string | null
  to_lp_contact: string | null
  transfer_amount: number
  transfer_date: string | null
  status: string
  workflow_instance_id: number | null
  notes: string | null
  created_at: string | null
}

export interface GPEntityInput {
  name: string
  entity_type: 'vc' | 'llc_vc' | 'nksa' | 'other'
  business_number?: string | null
  registration_number?: string | null
  representative?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  founding_date?: string | null
  license_date?: string | null
  capital?: number | null
  notes?: string | null
  is_primary?: number
}

export interface GPEntity {
  id: number
  name: string
  entity_type: 'vc' | 'llc_vc' | 'nksa' | 'other'
  business_number: string | null
  registration_number: string | null
  representative: string | null
  address: string | null
  phone: string | null
  email: string | null
  founding_date: string | null
  license_date: string | null
  capital: number | null
  notes: string | null
  is_primary: number
}

export interface GPProfileInput {
  company_name: string
  company_name_en?: string | null
  representative: string
  business_number?: string | null
  corporate_number?: string | null
  address?: string | null
  address_en?: string | null
  phone?: string | null
  fax?: string | null
  email?: string | null
  seal_image_path?: string | null
  signature_image_path?: string | null
  vc_registration_number?: string | null
  fss_code?: string | null
  memo?: string | null
}

export interface GPProfile extends GPProfileInput {
  id: number
  created_at: string | null
  updated_at: string | null
}

export interface FundNoticePeriodInput {
  notice_type: string
  label: string
  business_days: number
  day_basis?: 'business' | 'calendar'
  memo?: string | null
}

export interface FundNoticePeriodResponse {
  id: number
  fund_id: number
  notice_type: string
  label: string
  business_days: number
  day_basis: 'business' | 'calendar'
  memo: string | null
}

export interface FundKeyTermInput {
  category: string
  label: string
  value: string
  article_ref?: string | null
}

export interface FundKeyTermResponse {
  id: number
  fund_id: number
  category: string
  label: string
  value: string
  article_ref: string | null
}

export interface Company {
  id: number
  name: string
  business_number: string | null
  ceo: string | null
  address: string | null
  industry: string | null
  vics_registered: boolean
  corp_number: string | null
  founded_date: string | null
  analyst: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  memo: string | null
}

export interface CompanyInput {
  name: string
  business_number?: string | null
  ceo?: string | null
  address?: string | null
  industry?: string | null
  vics_registered?: boolean
  corp_number?: string | null
  founded_date?: string | null
  analyst?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  memo?: string | null
}

export interface Investment {
  id: number
  fund_id: number
  company_id: number
  fund_name?: string
  company_name?: string
  investment_date?: string | null
  amount?: number | null
  instrument?: string | null
  status?: string
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
  round?: string | null
  valuation_pre?: number | null
  valuation_post?: number | null
  ownership_pct?: number | null
  board_seat?: string | null
}

export interface InvestmentReviewInput {
  company_name: string
  sector?: string | null
  stage?: string | null
  deal_source?: string | null
  reviewer?: string | null
  status?: string | null
  target_amount?: number | null
  pre_valuation?: number | null
  post_valuation?: number | null
  instrument?: string | null
  fund_id?: number | null
  review_start_date?: string | null
  dd_start_date?: string | null
  committee_date?: string | null
  decision_date?: string | null
  execution_date?: string | null
  review_opinion?: string | null
  committee_opinion?: string | null
  decision_result?: string | null
  rejection_reason?: string | null
  investment_id?: number | null
}

export interface ReviewCommentInput {
  author: string
  content: string
  comment_type?: string | null
}

export interface ReviewComment {
  id: number
  review_id: number
  author: string
  content: string
  comment_type: string
  created_at: string
}

export interface InvestmentReview {
  id: number
  company_name: string
  sector: string | null
  stage: string | null
  deal_source: string | null
  reviewer: string | null
  status: string
  target_amount: number | null
  pre_valuation: number | null
  post_valuation: number | null
  instrument: string | null
  fund_id: number | null
  review_start_date: string | null
  dd_start_date: string | null
  committee_date: string | null
  decision_date: string | null
  execution_date: string | null
  review_opinion: string | null
  committee_opinion: string | null
  decision_result: string | null
  rejection_reason: string | null
  investment_id: number | null
  created_at: string
  updated_at: string
  comment_count?: number
  recent_activity_at?: string | null
}

export interface InvestmentReviewDetail extends InvestmentReview {
  comments: ReviewComment[]
}

export interface InvestmentReviewConvertResult {
  review_id: number
  investment_id: number
  company_id: number
  status: string
}

export interface InvestmentReviewWeeklyActivity {
  review_id: number
  company_name: string
  status: string
  updated_at: string
  comment_count: number
}

export interface InvestmentReviewWeeklySummary {
  status_counts: Record<string, number>
  new_count: number
  status_changed_count: number
  comments_added_count: number
  recent_activities: InvestmentReviewWeeklyActivity[]
}

export interface InvestmentDocumentInput {
  name: string
  doc_type?: string | null
  status?: string
  note?: string | null
  due_date?: string | null
}

export interface VoteRecordInput {
  company_id: number
  investment_id?: number | null
  vote_type: string
  date: string
  agenda?: string | null
  decision?: string | null
  memo?: string | null
}

export interface VoteRecord {
  id: number
  company_id: number
  investment_id: number | null
  vote_type: string
  date: string
  agenda: string | null
  decision: string | null
  memo: string | null
  created_at: string | null
  company_name: string | null
  investment_name: string | null
}

export interface TransactionInput {
  investment_id: number
  fund_id: number
  company_id: number
  transaction_date: string
  type: string
  transaction_subtype?: string | null
  counterparty?: string | null
  conversion_detail?: string | null
  settlement_date?: string | null
  amount: number
  shares_change?: number | null
  balance_before?: number | null
  balance_after?: number | null
  realized_gain?: number | null
  cumulative_gain?: number | null
  memo?: string | null
}

export interface Transaction {
  id: number
  investment_id: number
  fund_id: number
  company_id: number
  transaction_date: string
  type: string
  transaction_subtype: string | null
  counterparty: string | null
  conversion_detail: string | null
  settlement_date: string | null
  amount: number
  shares_change: number | null
  balance_before: number | null
  balance_after: number | null
  realized_gain: number | null
  cumulative_gain: number | null
  memo: string | null
  created_at: string
  fund_name?: string
  company_name?: string
}

export interface TransactionLedgerItem extends Transaction {
  running_balance: number | null
}

export interface TransactionSummaryItem {
  type: string
  transaction_subtype: string | null
  count: number
  total_amount: number
}

export interface TransactionSummary {
  total_count: number
  total_amount: number
  items: TransactionSummaryItem[]
}

export interface ValuationInput {
  investment_id: number
  fund_id: number
  company_id: number
  as_of_date: string
  evaluator?: string | null
  method?: string | null
  instrument?: string | null
  value: number
  prev_value?: number | null
  change_amount?: number | null
  change_pct?: number | null
  basis?: string | null
}

export interface Valuation {
  id: number
  investment_id: number
  fund_id: number
  company_id: number
  as_of_date: string
  evaluator: string | null
  method: string | null
  instrument: string | null
  value: number
  prev_value: number | null
  change_amount: number | null
  change_pct: number | null
  basis: string | null
  created_at: string
  fund_name?: string
  company_name?: string
}

export interface BizReportInput {
  fund_id: number
  report_year: number
  status?: string
  submission_date?: string | null
  total_commitment?: number | null
  total_paid_in?: number | null
  total_invested?: number | null
  total_distributed?: number | null
  fund_nav?: number | null
  irr?: number | null
  tvpi?: number | null
  dpi?: number | null
  market_overview?: string | null
  portfolio_summary?: string | null
  investment_activity?: string | null
  key_issues?: string | null
  outlook?: string | null
  memo?: string | null
}

export interface BizReport {
  id: number
  fund_id: number
  report_year: number
  status: string
  submission_date: string | null
  total_commitment: number | null
  total_paid_in: number | null
  total_invested: number | null
  total_distributed: number | null
  fund_nav: number | null
  irr: number | null
  tvpi: number | null
  dpi: number | null
  market_overview: string | null
  portfolio_summary: string | null
  investment_activity: string | null
  key_issues: string | null
  outlook: string | null
  memo: string | null
  created_at: string | null
  fund_name: string | null
}

export interface RegularReportInput {
  report_target: string
  fund_id?: number | null
  period: string
  due_date?: string | null
  status?: string
  submitted_date?: string | null
  task_id?: number | null
  memo?: string | null
}

export interface RegularReport {
  id: number
  report_target: string
  fund_id: number | null
  period: string
  due_date: string | null
  status: string
  submitted_date: string | null
  task_id: number | null
  memo: string | null
  created_at: string | null
  fund_name: string | null
  days_remaining: number | null
}

export interface PreReportCheckFinding {
  type: 'legal' | 'cross' | 'guideline' | 'contract' | string
  severity: 'error' | 'warning' | 'info' | string
  title: string
  detail: string
  reference?: string | null
  rule_code?: string | null
  difference?: number | null
  source?: string | null
}

export interface PreReportCheckResult {
  id: number
  report_id: number
  fund_id: number
  checked_at: string | null
  overall_status: 'pass' | 'warning' | 'error' | string
  legal_check: PreReportCheckFinding[]
  cross_check: PreReportCheckFinding[]
  guideline_check: PreReportCheckFinding[]
  contract_check: PreReportCheckFinding[]
  total_errors: number
  total_warnings: number
  total_info: number
  tasks_created: number
  created_by: number | null
}

export interface UpcomingReport {
  id: number
  report_target: string
  fund_id: number | null
  fund_name: string | null
  period: string
  due_date: string | null
  status: string
  days_remaining: number | null
  task_id?: number | null
  source_label?: string | null
}

export interface UpcomingNotice {
  fund_name: string
  notice_label: string
  deadline: string
  days_remaining: number
  workflow_instance_name: string
  workflow_instance_id?: number | null
  task_id?: number | null
  source_label?: string | null
}

export interface NoticeDeadlineResult {
  target_date: string
  notice_type: string
  business_days: number
  notice_days?: number
  day_basis?: 'business' | 'calendar'
  deadline: string
  label: string
}

export interface AccountInput {
  fund_id?: number | null
  code: string
  name: string
  category: string
  sub_category?: string | null
  normal_side?: string | null
  is_active?: string
  display_order?: number
}

export interface Account {
  id: number
  fund_id: number | null
  code: string
  name: string
  category: string
  sub_category: string | null
  normal_side: string | null
  is_active: string
  display_order: number
}

export interface JournalEntryLineInput {
  account_id: number
  debit?: number | null
  credit?: number | null
  memo?: string | null
}

export interface JournalEntryInput {
  fund_id: number
  entry_date: string
  entry_type?: string
  description?: string | null
  status?: string
  source_type?: string | null
  source_id?: number | null
  lines: JournalEntryLineInput[]
}

export interface JournalEntryLine {
  id: number
  journal_entry_id: number
  account_id: number
  debit: number
  credit: number
  memo: string | null
  account_name: string | null
}

export interface JournalEntry {
  id: number
  fund_id: number
  entry_date: string
  entry_type: string
  description: string | null
  status: string
  source_type: string | null
  source_id: number | null
  created_at: string | null
  fund_name: string | null
  lines: JournalEntryLine[]
}

export interface TrialBalanceItem {
  account_id: number
  code: string
  name: string
  category: string
  sub_category: string | null
  debit_total: number
  credit_total: number
  balance: number
}

export interface BankTransaction {
  id: number
  fund_id: number
  transaction_date: string
  withdrawal: number
  deposit: number
  balance_after: number | null
  description: string | null
  counterparty: string | null
  bank_branch: string | null
  account_number: string | null
  journal_entry_id: number | null
  auto_mapped: boolean
  mapping_rule_id: number | null
  year_month: string
  created_at: string | null
}

export interface BankTransactionParseResponse {
  created_count: number
  items: BankTransaction[]
  year_months: string[]
}

export interface AutoJournalResult {
  mapped: BankTransaction[]
  unmapped: BankTransaction[]
  total: number
  mapped_count: number
  unmapped_count: number
}

export interface ManualMapInput {
  debit_account_id: number
  credit_account_id: number
  description?: string | null
  learn?: boolean
}

export interface ManualMapResult {
  ok: boolean
  result: {
    txn_id: number
    journal_entry_id: number
    rule_id: number | null
  }
  item: BankTransaction
}

export interface AutoMappingRuleInput {
  keyword: string
  direction: 'deposit' | 'withdrawal'
  debit_account_id: number
  credit_account_id: number
  description_template?: string | null
  priority?: number
  is_active?: boolean
}

export interface AutoMappingRule extends AutoMappingRuleInput {
  id: number
  fund_id: number | null
  debit_account_name: string | null
  credit_account_name: string | null
  use_count: number
  created_at: string | null
}

export interface ProvisionalFS {
  id: number
  fund_id: number
  year_month: string
  status: 'draft' | 'confirmed' | 'exported' | string
  sfp_data: Record<string, number>
  is_data: Record<string, number>
  total_assets: number | null
  total_liabilities: number | null
  total_equity: number | null
  net_income: number | null
  confirmed_at: string | null
  confirmed_by: number | null
  created_at: string | null
  updated_at: string | null
}

export interface ProvisionalFSOverviewItem {
  fund_id: number
  fund_name: string
  status: 'confirmed' | 'not_started' | 'needs_mapping' | 'draft' | 'ready' | string
  provisional_fs_id: number | null
  total_assets: number | null
  total_liabilities: number | null
  total_equity: number | null
  net_income: number | null
  bank_txn_count: number
  mapped_count: number
  unmapped_count: number
}

export interface ProvisionalFSOverviewResponse {
  year_month: string
  summary: {
    fund_count: number
    confirmed_count: number
    needs_mapping_count: number
    not_started_count: number
    total_unmapped_count: number
    total_assets_sum: number
  }
  items: ProvisionalFSOverviewItem[]
}

export interface CapitalCallInput {
  fund_id: number
  call_date: string
  call_type: string
  total_amount?: number
  request_percent?: number | null
  memo?: string | null
}

export interface CapitalCall {
  id: number
  fund_id: number
  linked_workflow_instance_id?: number | null
  linked_workflow_name?: string | null
  linked_workflow_status?: string | null
  call_date: string
  call_type: string
  total_amount: number
  request_percent?: number | null
  memo: string | null
  created_at: string
  fund_name?: string
}

export interface CapitalCallBatchInput {
  fund_id: number
  call_date: string
  call_type: string
  total_amount: number
  request_percent?: number | null
  memo?: string | null
  create_workflow?: boolean
  items: CapitalCallItemInput[]
}

export interface CapitalCallSummaryCall {
  id: number
  round: number
  call_date: string | null
  call_type: string
  total_amount: number
  request_percent: number | null
  paid_count: number
  total_count: number
  paid_amount: number
  latest_paid_date: string | null
  is_fully_paid: boolean
  paid_on_time: boolean
  is_due: boolean
  is_overdue_unpaid: boolean
  commitment_ratio: number
  memo: string | null
}

export interface CapitalCallSummary {
  fund_id: number
  commitment_total: number
  total_paid_in: number
  calls: CapitalCallSummaryCall[]
}

export interface CapitalCallItemInput {
  lp_id: number
  amount?: number
  paid?: boolean
  paid_date?: string | null
  memo?: string | null
  sync_workflow?: boolean
}

export interface CapitalCallItem {
  id: number
  capital_call_id: number
  lp_id: number
  amount: number
  paid: boolean
  paid_date: string | null
  memo?: string | null
  lp_name?: string
}

export interface DistributionInput {
  fund_id: number
  dist_date: string
  dist_type: string
  principal_total?: number
  profit_total?: number
  performance_fee?: number
  memo?: string | null
}

export interface Distribution {
  id: number
  fund_id: number
  dist_date: string
  dist_type: string
  principal_total: number
  profit_total: number
  performance_fee: number
  memo: string | null
  created_at: string
  fund_name?: string
}

export interface DistributionItemInput {
  lp_id: number
  principal?: number
  profit?: number
}

export interface DistributionItem {
  id: number
  distribution_id: number
  lp_id: number
  principal: number
  profit: number
  lp_name?: string
}

export interface AssemblyInput {
  fund_id: number
  type: string
  date: string
  agenda?: string | null
  status?: string
  minutes_completed?: boolean
  memo?: string | null
}

export interface Assembly {
  id: number
  fund_id: number
  type: string
  date: string
  agenda: string | null
  status: string
  minutes_completed: boolean
  memo: string | null
  created_at: string
  fund_name?: string
}

export interface ExitCommitteeInput {
  company_id: number
  status?: string
  meeting_date: string
  location?: string | null
  agenda?: string | null
  exit_strategy?: string | null
  analyst_opinion?: string | null
  vote_result?: string | null
  performance_fee?: number | null
  memo?: string | null
}

export interface ExitCommittee {
  id: number
  company_id: number
  status: string
  meeting_date: string
  location: string | null
  agenda: string | null
  exit_strategy: string | null
  analyst_opinion: string | null
  vote_result: string | null
  performance_fee: number | null
  memo: string | null
  created_at: string
  company_name?: string
}

export interface ExitCommitteeFundInput {
  fund_id: number
  investment_id: number
}

export interface ExitCommitteeFund {
  id: number
  exit_committee_id: number
  fund_id: number
  investment_id: number
  fund_name?: string
}

export interface ExitTradeInput {
  exit_committee_id?: number | null
  investment_id: number
  fund_id: number
  company_id: number
  exit_type: string
  trade_date: string
  amount: number
  shares_sold?: number | null
  price_per_share?: number | null
  fees?: number
  net_amount?: number | null
  realized_gain?: number | null
  memo?: string | null
}

export interface ExitTrade {
  id: number
  exit_committee_id: number | null
  investment_id: number
  fund_id: number
  company_id: number
  exit_type: string
  trade_date: string
  amount: number
  shares_sold: number | null
  price_per_share: number | null
  fees: number
  net_amount: number | null
  realized_gain: number | null
  memo: string | null
  created_at: string
  fund_name?: string
  company_name?: string
}

export interface FundPerformance {
  fund_id: number
  fund_name: string
  paid_in_total: number
  total_invested: number
  total_distributed: number
  residual_value: number
  total_value: number
  irr: number | null
  tvpi: number | null
  dpi: number | null
  rvpi: number | null
}

export interface ChecklistItemInput {
  order: number
  name: string
  required?: boolean
  checked?: boolean
  notes?: string | null
}

export interface ChecklistItem {
  id: number
  checklist_id: number
  order: number
  name: string
  required: boolean
  checked: boolean
  notes: string | null
}

export interface ChecklistListItem {
  id: number
  name: string
  category: string | null
  investment_id: number | null
  total_items: number
  checked_items: number
}

export interface Checklist {
  id: number
  name: string
  category: string | null
  investment_id: number | null
  items: ChecklistItem[]
}

export interface ChecklistInput {
  name: string
  category?: string | null
  investment_id?: number | null
  items: ChecklistItemInput[]
}

export interface DocumentStatusItem {
  id: number
  investment_id: number
  document_name: string
  document_type: string | null
  status: string
  note: string | null
  due_date: string | null
  days_remaining: number | null
  fund_id: number
  company_name: string
  company_id: number
  fund_name: string
}

export interface GeneratedDocumentGenerateResponse {
  document_id: number
  filename: string
  download_url: string
}

export interface GeneratedDocumentItem {
  id: number
  builder: string
  builder_label: string
  filename: string
  created_at: string | null
  download_url: string
}

export interface TemplateDocumentGenerateInput {
  fund_id: number
  template_id: number
  lp_id?: number | null
  investment_id?: number | null
  extra_vars?: Record<string, string> | null
}

export interface TemplateDocumentBulkGenerateInput {
  fund_id: number
  template_id: number
  extra_vars?: Record<string, string> | null
}

export interface TemplateGeneratedDocumentItem {
  id: number
  filename: string
  document_number: string | null
  fund_id: number | null
  template_id: number | null
  lp_id: number | null
  investment_id: number | null
  created_at: string | null
  download_url: string
}

export interface TemplateDocumentBulkGenerateResponse {
  generated_count: number
  documents: TemplateGeneratedDocumentItem[]
}

export interface DocumentMarkerDefinition {
  marker: string
  source: string
  description: string
}

export interface ResolveDocumentVariablesResponse {
  variables: Record<string, string>
}

export interface TemplateAnalyzeMarker {
  text: string
  marker: string
  source: 'fund' | 'lp' | 'gp' | 'investment' | 'manual' | string
  confidence: number
  existing: boolean
}

export interface TemplateAnalyzeResponse {
  extracted_text: string
  identified_markers: TemplateAnalyzeMarker[]
  existing_markers: string[]
}

export interface TemplateVariableRegistrationInput {
  marker_name: string
  display_label?: string | null
  source_type?: string | null
  source_field?: string | null
  default_value?: string | null
  is_required?: boolean
  display_order?: number
  text?: string | null
}

export interface TemplateRegisterInput {
  file: File
  name: string
  document_type: string
  variables: TemplateVariableRegistrationInput[]
}

export interface TemplateRegisterResponse {
  template_id: number
  name: string
  document_type: string
  variable_count: number
  file_path: string
}

export interface TemplateRegistrationTestGenerateInput {
  template_id: number
  fund_id: number
  lp_id?: number | null
  investment_id?: number | null
  manual_vars?: Record<string, string>
}

export interface TemplateInputCacheResponse {
  fund_id: number
  template_id: number
  inputs: Record<string, string>
}

export interface MarkerInfo {
  key: string
  label: string
  description: string
  section: string
  required: boolean
  default_value: string
}

export interface DocumentVariable {
  id: number
  fund_id: number
  name: string
  variables: Record<string, string>
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface TemplateFileInfo {
  stage: number
  stage_name: string
  file_name: string
  file_type: 'hwp' | 'docx' | 'pdf' | 'other' | string
  relative_path: string
}

export interface TemplateStageInfo {
  stage: number
  stage_name: string
  files: TemplateFileInfo[]
}

export interface TemplateStructure {
  stages: TemplateStageInfo[]
  total_templates: number
  markers: string[]
}

export interface DocumentGenerateRequest {
  fund_id: number
  variables: Record<string, string>
  stages?: number[]
  save_preset?: boolean
  preset_name?: string | null
}

export interface DocumentGenerateResponse {
  generation_id: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_files: number
  success_count: number
  failed_count: number
  warnings: string[]
  download_url: string | null
}

export interface DocumentGenerationStatus {
  id: number
  fund_id: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_files: number
  success_count: number
  failed_count: number
  warnings: string[]
  error_message: string | null
  download_url: string | null
  progress_current: number | null
  progress_total: number | null
  progress_message: string | null
}

export interface DocumentGenerationHistoryItem {
  id: number
  fund_id: number
  created_by: number
  created_at: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  stages: number[] | null
  total_files: number
  success_count: number
  failed_count: number
  warnings: string[]
  error_message: string | null
  download_url: string | null
}

export interface AutoFillVariablesResponse {
  fund_id: number
  variables: Record<string, string>
  mapped_keys: string[]
}

export interface SearchResult {
  type: 'task' | 'fund' | 'company' | 'investment' | 'workflow' | 'biz_report' | 'report' | 'worklog' | string
  id: number
  title: string
  subtitle?: string | null
  url: string
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
  event_type?: string
  color?: string | null
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

export interface WorkLogDetail {
  id: number
  worklog_id: number
  content: string
  order: number
}

export interface WorkLogLesson {
  id: number
  worklog_id: number
  content: string
  order: number
}

export interface WorkLogFollowUp {
  id: number
  worklog_id: number
  content: string
  target_date: string | null
  order: number
}

export interface WorkLog {
  id: number
  date: string
  category: string
  title: string
  content: string | null
  status: string
  estimated_time: string | null
  actual_time: string | null
  time_diff: string | null
  created_at: string | null
  task_id: number | null
  details: WorkLogDetail[]
  lessons: WorkLogLesson[]
  follow_ups: WorkLogFollowUp[]
}

export interface WorkLogLessonReminder {
  id: number
  content: string
  worklog_id: number
  worklog_date: string
  task_id: number | null
  task_title: string | null
  fund_id: number | null
  fund_name: string | null
  investment_id: number | null
  company_name: string | null
  is_same_fund: boolean
  match_score: number
  match_flags: string[]
}

export interface WorkLogInsights {
  period: string
  total_logs: number
  time_by_category: Record<string, number>
  time_accuracy: { over: number; under: number; accurate: number }
  daily_counts: Record<string, number>
  category_counts: Record<string, number>
  status_counts: { completed: number; in_progress: number }
  weekday_counts: Record<number, number>
  recent_lessons: string[]
  follow_up_rate: { total: number; completed: number }
  category_avg_time: Record<string, number>
}

export interface ValuationInput {
  valuation_method?: string | null
  instrument_type?: string | null
  conversion_price?: number | null
  exercise_price?: number | null
  liquidation_pref?: number | null
  participation_cap?: number | null
  fair_value_per_share?: number | null
  total_fair_value?: number | null
  book_value?: number | null
  unrealized_gain_loss?: number | null
  valuation_date?: string | null
}

export interface Valuation {
  valuation_method?: string | null
  instrument_type?: string | null
  conversion_price?: number | null
  exercise_price?: number | null
  liquidation_pref?: number | null
  participation_cap?: number | null
  fair_value_per_share?: number | null
  total_fair_value?: number | null
  book_value?: number | null
  unrealized_gain_loss?: number | null
  valuation_date?: string | null
}

export interface ExitTradeInput {
  settlement_status?: string | null
  settlement_date?: string | null
  settlement_amount?: number | null
  related_transaction_id?: number | null
}

export interface ExitTrade {
  settlement_status?: string | null
  settlement_date?: string | null
  settlement_amount?: number | null
  related_transaction_id?: number | null
}

export interface ExitTradeSettleInput {
  settlement_amount: number
  settlement_date: string
  auto_distribution?: boolean
  memo?: string | null
}

export interface ExitDashboardItem {
  investment_id: number
  company_name: string
  invested_amount: number
  recovered_amount: number
  moic: number | null
  status: string
}

export interface ExitDashboardResponse {
  total_invested: number
  total_recovered: number
  total_moic: number | null
  items: ExitDashboardItem[]
}

export interface ValuationNavSummaryItem {
  fund_id: number
  fund_name: string
  total_nav: number
  total_unrealized_gain_loss: number
  valuation_count: number
}

export interface ValuationHistoryPoint {
  id: number
  as_of_date: string
  valuation_date: string | null
  total_fair_value: number | null
  book_value: number | null
  unrealized_gain_loss: number | null
  method: string | null
  valuation_method: string | null
}

export interface ValuationBulkItemInput {
  investment_id: number
  fund_id: number
  company_id: number
  value: number
  book_value?: number | null
  total_fair_value?: number | null
  unrealized_gain_loss?: number | null
  method?: string | null
  valuation_method?: string | null
  instrument?: string | null
  instrument_type?: string | null
  basis?: string | null
}

export interface ValuationBulkCreateInput {
  as_of_date: string
  valuation_date?: string | null
  evaluator?: string | null
  items: ValuationBulkItemInput[]
}

export interface ValuationDashboardItem {
  investment_id: number
  company_name: string
  instrument: string | null
  instrument_type: string | null
  book_value: number | null
  total_fair_value: number | null
  unrealized_gain_loss: number | null
  valuation_date: string | null
  method: string | null
  valuation_method: string | null
}

export interface ValuationDashboardResponse {
  total_nav: number
  total_unrealized_gain_loss: number
  valuation_count: number
  unvalued_count: number
  items: ValuationDashboardItem[]
}

export interface CapitalCallDetail {
  id: number
  capital_call_id: number
  lp_id: number
  commitment_ratio: number | null
  call_amount: number
  paid_amount: number
  paid_date: string | null
  status: string
  reminder_sent: boolean
  lp_name: string | null
}

export interface CapitalCallDetailUpdateInput {
  commitment_ratio?: number | null
  call_amount?: number | null
  paid_amount?: number | null
  paid_date?: string | null
  status?: string | null
  reminder_sent?: boolean
}

export interface DistributionDetail {
  id: number
  distribution_id: number
  lp_id: number
  distribution_amount: number
  distribution_type: string
  paid: boolean
  lp_name: string | null
}

export interface DistributionDetailUpdateInput {
  distribution_amount?: number | null
  distribution_type?: string | null
  paid?: boolean
}

export interface ManagementFeeCalculateInput {
  fund_id: number
  year: number
  quarter: number
}

export interface ManagementFeeUpdateInput {
  status?: string | null
  invoice_date?: string | null
  payment_date?: string | null
  memo?: string | null
}

export interface ManagementFeeResponse {
  id: number
  fund_id: number
  year: number
  quarter: number
  fee_basis: string
  fee_rate: number
  basis_amount: number
  fee_amount: number
  proration_method: string
  period_days: number | null
  year_days: number | null
  applied_phase: string
  calculation_detail: string | null
  status: string
  invoice_date: string | null
  payment_date: string | null
  memo: string | null
  created_at: string
  fund_name: string | null
}

export interface FeeConfigInput {
  mgmt_fee_rate: number
  mgmt_fee_basis: string
  mgmt_fee_period: string
  mgmt_fee_proration_method: string
  liquidation_fee_rate?: number | null
  liquidation_fee_basis?: string | null
  hurdle_rate: number
  carry_rate: number
  catch_up_rate?: number | null
  clawback: boolean
}

export interface FeeConfigResponse extends FeeConfigInput {
  id: number
  fund_id: number
}

export interface PerformanceFeeSimulateInput {
  fund_id: number
  simulation_date: string
  scenario?: string
}

export interface PerformanceFeeSimulationUpdateInput {
  status?: string | null
}

export interface PerformanceFeeSimulationResponse {
  id: number
  fund_id: number
  simulation_date: string
  scenario: string
  total_paid_in: number | null
  total_distributed: number | null
  hurdle_amount: number | null
  excess_profit: number | null
  carry_amount: number | null
  lp_net_return: number | null
  status: string
  created_at: string
  fund_name: string | null
}

export interface WaterfallResponse {
  total_distributed: number
  lp_return_of_capital: number
  lp_hurdle_return: number
  gp_catch_up: number
  gp_carry: number
  lp_residual: number
}

export interface BizReportTemplateInput {
  name: string
  report_type: string
  required_fields?: string | null
  template_file_id?: number | null
  instructions?: string | null
}

export interface BizReportTemplateResponse extends BizReportTemplateInput {
  id: number
  created_at: string
}

export interface BizReportRequestUpdateInput {
  request_date?: string | null
  deadline?: string | null
  status?: string | null
  revenue?: number | null
  operating_income?: number | null
  net_income?: number | null
  total_assets?: number | null
  total_equity?: number | null
  cash?: number | null
  employees?: number | null
  prev_revenue?: number | null
  prev_operating_income?: number | null
  prev_net_income?: number | null
  doc_financial_statement?: 'not_requested' | 'requested' | 'received' | 'verified' | null
  doc_biz_registration?: 'not_requested' | 'requested' | 'received' | 'verified' | null
  doc_shareholder_list?: 'not_requested' | 'requested' | 'received' | 'verified' | null
  doc_corp_registry?: 'not_requested' | 'requested' | 'received' | 'verified' | null
  doc_insurance_cert?: 'not_requested' | 'requested' | 'received' | 'verified' | null
  doc_credit_report?: 'not_requested' | 'requested' | 'received' | 'verified' | null
  doc_other_changes?: 'not_requested' | 'requested' | 'received' | 'verified' | null
  request_sent_date?: string | null
  request_deadline?: string | null
  all_docs_received_date?: string | null
  comment?: string | null
  reviewer_comment?: string | null
  risk_flag?: string | null
}

export interface BizReportRequestDocStatusInput {
  doc_type:
    | 'financial_statement'
    | 'biz_registration'
    | 'shareholder_list'
    | 'corp_registry'
    | 'insurance_cert'
    | 'credit_report'
    | 'other_changes'
  status: 'not_requested' | 'requested' | 'received' | 'verified'
}

export interface BizReportRequestResponse {
  id: number
  biz_report_id: number
  investment_id: number
  investment_name: string | null
  request_date: string | null
  deadline: string | null
  status: string
  revenue: number | null
  operating_income: number | null
  net_income: number | null
  total_assets: number | null
  total_equity: number | null
  cash: number | null
  employees: number | null
  prev_revenue: number | null
  prev_operating_income: number | null
  prev_net_income: number | null
  doc_financial_statement: 'not_requested' | 'requested' | 'received' | 'verified'
  doc_biz_registration: 'not_requested' | 'requested' | 'received' | 'verified'
  doc_shareholder_list: 'not_requested' | 'requested' | 'received' | 'verified'
  doc_corp_registry: 'not_requested' | 'requested' | 'received' | 'verified'
  doc_insurance_cert: 'not_requested' | 'requested' | 'received' | 'verified'
  doc_credit_report: 'not_requested' | 'requested' | 'received' | 'verified'
  doc_other_changes: 'not_requested' | 'requested' | 'received' | 'verified'
  request_sent_date: string | null
  request_deadline: string | null
  all_docs_received_date: string | null
  comment: string | null
  reviewer_comment: string | null
  risk_flag: string | null
  created_at: string
  updated_at: string
}

export interface BizReportDocCollectionCompanyRow {
  company_name: string
  request_id: number
  docs: Record<
    | 'financial_statement'
    | 'biz_registration'
    | 'shareholder_list'
    | 'corp_registry'
    | 'insurance_cert'
    | 'credit_report'
    | 'other_changes',
    'not_requested' | 'requested' | 'received' | 'verified'
  >
  received_count: number
  status: string
}

export interface BizReportDocCollectionMatrix {
  report_id: number
  fund_id: number
  fund_name: string
  quarter: string
  total_companies: number
  completed_companies: number
  completion_pct: number
  companies: BizReportDocCollectionCompanyRow[]
}

export interface BizReportSendDocRequestItem {
  request_id: number
  investment_id: number
  document_id?: number
  filename?: string
  download_url?: string
  reason?: string
}

export interface BizReportSendDocRequestsResponse {
  report_id: number
  updated_requests: number
  generated_documents: BizReportSendDocRequestItem[]
  failed_documents: BizReportSendDocRequestItem[]
}

export interface BizReportAnomalyResponse {
  id: number
  request_id: number
  anomaly_type: string
  severity: string
  detail: string | null
  acknowledged: boolean
  created_at: string
}

export interface BizReportCommentDiffResponse {
  current_comment: string | null
  previous_comment: string | null
  changed: boolean
}

export interface BizReportMatrixCell {
  quarter: string
  status: string
  report_id: number | null
}

export interface BizReportMatrixRow {
  fund_id: number
  fund_name: string
  cells: BizReportMatrixCell[]
}

export interface BizReportMatrixResponse {
  rows: BizReportMatrixRow[]
}

export interface BizReportGenerationResponse {
  filename: string
  content_type: string
  base64_data: string
}

export type UserRole = 'master' | 'admin' | 'manager' | 'viewer'

export interface UserCreateInput {
  username: string
  email?: string | null
  name: string
  password: string
  role?: UserRole
  department?: string | null
  is_active?: boolean
  allowed_routes?: string[] | null
  google_id?: string | null
}

export interface UserUpdateInput {
  username?: string | null
  email?: string | null
  name?: string | null
  password?: string | null
  role?: UserRole | null
  department?: string | null
  is_active?: boolean
  allowed_routes?: string[] | null
  google_id?: string | null
}

export interface UserResponse {
  id: number
  username: string
  email: string | null
  name: string
  role: UserRole
  department: string | null
  is_active: boolean
  google_id?: string | null
  avatar_url?: string | null
  allowed_routes?: string[] | null
  last_login_at: string | null
  password_reset_requested_at?: string | null
  created_at: string
}

export interface LoginRequestInput {
  login_id: string
  password: string
}

export interface GoogleLoginRequestInput {
  credential: string
}

export interface ChangePasswordRequestInput {
  current_password: string
  new_password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: UserResponse
}

export interface RegisterRequestInput {
  username: string
  name: string
  email?: string | null
  password: string
  department?: string | null
}

export interface RegisterWithInviteRequestInput {
  token: string
  username: string
  password: string
  name?: string | null
}

export interface RegisterResponse {
  message: string
  user: {
    id: number
    username: string
    name: string
    is_active: boolean
  }
}

export interface AvailabilityResponse {
  available: boolean
  message?: string | null
}

export interface ForgotPasswordRequestInput {
  login_id: string
}

export interface ResetPasswordRequestInput {
  token: string
  new_password: string
}

export interface ProfileUpdateRequestInput {
  name?: string | null
  email?: string | null
  department?: string | null
  avatar_url?: string | null
}

export interface UserApproveInput {
  role?: UserRole
  allowed_routes?: string[] | null
}

export interface AdminResetPasswordRequestInput {
  new_password: string
}

export interface ResetPasswordTokenResponse {
  reset_token: string
  reset_url: string
  expires_in_minutes: number
}

export interface InvitationCreateInput {
  email?: string | null
  name?: string | null
  role?: UserRole
  department?: string | null
  allowed_routes?: string[] | null
  expires_in_days?: number
}

export interface InvitationResponse {
  id: number
  token: string
  email?: string | null
  name?: string | null
  role: UserRole
  department?: string | null
  allowed_routes?: string[] | null
  created_by: number
  used_by?: number | null
  used_at?: string | null
  expires_at: string
  created_at: string
  status: 'pending' | 'used' | 'expired' | string
  invite_url: string
}

export interface InvitationVerifyResponse {
  valid: boolean
  message?: string | null
  invitation?: InvitationResponse | null
}
