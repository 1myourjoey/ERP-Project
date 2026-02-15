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
export const fetchTaskBoard = (status = 'pending', year?: number, month?: number) =>
  api.get('/tasks/board', { params: { status, year, month } }).then(r => r.data)
export const fetchTasks = (params?: { quadrant?: string; status?: string; fund_id?: number; category?: string }) => api.get('/tasks', { params }).then(r => r.data)
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
export const generateMonthlyReminders = (yearMonth: string) =>
  api.post('/tasks/generate-monthly-reminders', null, { params: { year_month: yearMonth } }).then(r => r.data)

// -- Dashboard --
export const fetchDashboard = (): Promise<DashboardResponse> => api.get('/dashboard/today').then(r => r.data)
export const fetchUpcomingNotices = (days = 30): Promise<UpcomingNotice[]> =>
  api.get('/dashboard/upcoming-notices', { params: { days } }).then(r => r.data)

// -- Workflows --
export const fetchWorkflows = (): Promise<WorkflowListItem[]> => api.get('/workflows').then(r => r.data)
export const fetchWorkflow = (id: number): Promise<WorkflowTemplate> => api.get(`/workflows/${id}`).then(r => r.data)
export const createWorkflowTemplate = (data: WorkflowTemplateInput): Promise<WorkflowTemplate> => api.post('/workflows', data).then(r => r.data)
export const updateWorkflowTemplate = (id: number, data: WorkflowTemplateInput): Promise<WorkflowTemplate> => api.put(`/workflows/${id}`, data).then(r => r.data)
export const deleteWorkflowTemplate = (id: number): Promise<{ ok: boolean }> => api.delete(`/workflows/${id}`).then(r => r.data)
export const instantiateWorkflow = (id: number, data: WorkflowInstantiateInput): Promise<WorkflowInstance> => api.post(`/workflows/${id}/instantiate`, data).then(r => r.data)
export const fetchWorkflowInstances = (
  params?: { status?: string; investment_id?: number; company_id?: number; fund_id?: number },
): Promise<WorkflowInstance[]> =>
  api.get('/workflow-instances', {
    params: {
      status: params?.status ?? 'active',
      investment_id: params?.investment_id,
      company_id: params?.company_id,
      fund_id: params?.fund_id,
    },
  }).then(r => r.data)
export const fetchWorkflowInstance = (id: number): Promise<WorkflowInstance> => api.get(`/workflow-instances/${id}`).then(r => r.data)
export const completeWorkflowStep = (instanceId: number, stepId: number, data: WorkflowStepCompleteInput): Promise<WorkflowInstance> => api.patch(`/workflow-instances/${instanceId}/steps/${stepId}/complete`, data).then(r => r.data)
export const cancelWorkflowInstance = (id: number): Promise<WorkflowInstance> => api.patch(`/workflow-instances/${id}/cancel`).then(r => r.data)

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
export const fetchFundLPs = (fundId: number): Promise<LP[]> => api.get(`/funds/${fundId}/lps`).then(r => r.data)
export const createFundLP = (fundId: number, data: LPInput) => api.post(`/funds/${fundId}/lps`, data).then(r => r.data)
export const updateFundLP = (fundId: number, lpId: number, data: Partial<LPInput>) => api.put(`/funds/${fundId}/lps/${lpId}`, data).then(r => r.data)
export const deleteFundLP = (fundId: number, lpId: number) => api.delete(`/funds/${fundId}/lps/${lpId}`)
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
export const fetchVoteRecords = (params?: { company_id?: number; investment_id?: number; vote_type?: string }): Promise<VoteRecord[]> =>
  api.get('/vote-records', { params }).then(r => r.data)
export const createVoteRecord = (data: VoteRecordInput): Promise<VoteRecord> => api.post('/vote-records', data).then(r => r.data)
export const updateVoteRecord = (id: number, data: Partial<VoteRecordInput>): Promise<VoteRecord> => api.put(`/vote-records/${id}`, data).then(r => r.data)
export const deleteVoteRecord = (id: number) => api.delete(`/vote-records/${id}`)
export const fetchTransactions = (params?: { investment_id?: number; fund_id?: number; company_id?: number; type?: string }): Promise<Transaction[]> => api.get('/transactions', { params }).then(r => r.data)
export const fetchInvestmentTransactions = (investmentId: number): Promise<Transaction[]> => api.get(`/investments/${investmentId}/transactions`).then(r => r.data)
export const fetchTransaction = (id: number): Promise<Transaction> => api.get(`/transactions/${id}`).then(r => r.data)
export const createTransaction = (data: TransactionInput): Promise<Transaction> => api.post('/transactions', data).then(r => r.data)
export const updateTransaction = (id: number, data: Partial<TransactionInput>): Promise<Transaction> => api.put(`/transactions/${id}`, data).then(r => r.data)
export const deleteTransaction = (id: number) => api.delete(`/transactions/${id}`)
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
export const fetchCapitalCalls = (params?: { fund_id?: number; call_type?: string }): Promise<CapitalCall[]> => api.get('/capital-calls', { params }).then(r => r.data)
export const fetchCapitalCall = (id: number): Promise<CapitalCall> => api.get(`/capital-calls/${id}`).then(r => r.data)
export const createCapitalCall = (data: CapitalCallInput): Promise<CapitalCall> => api.post('/capital-calls', data).then(r => r.data)
export const updateCapitalCall = (id: number, data: Partial<CapitalCallInput>): Promise<CapitalCall> => api.put(`/capital-calls/${id}`, data).then(r => r.data)
export const deleteCapitalCall = (id: number) => api.delete(`/capital-calls/${id}`)
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

export const fetchFundPerformance = (fundId: number, params?: { as_of_date?: string }): Promise<FundPerformance> =>
  api.get(`/funds/${fundId}/performance`, { params }).then(r => r.data)

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
export const fetchWorkLogCategories = (): Promise<string[]> => api.get('/worklogs/categories').then(r => r.data)
export const createWorkLog = (data: WorkLogInput): Promise<WorkLog> => api.post('/worklogs', data).then(r => r.data)
export const updateWorkLog = (id: number, data: Partial<WorkLogInput>): Promise<WorkLog> => api.put(`/worklogs/${id}`, data).then(r => r.data)
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
  no_deadline: Task[]
  active_workflows: ActiveWorkflow[]
  fund_summary: FundSummary[]
  missing_documents: MissingDocument[]
  upcoming_reports: UpcomingReport[]
  upcoming_notices?: UpcomingNotice[]
  completed_today: Task[]
  completed_today_count: number
  completed_this_week_count: number
}

export interface ActiveWorkflow {
  id: number
  name: string
  progress: string
  next_step: string | null
  next_step_date: string | null
  company_name: string | null
  fund_name: string | null
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

export interface FundOverviewItem {
  no: number
  id: number
  name: string
  fund_type: string
  fund_manager: string | null
  formation_date: string | null
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
  hurdle_rate: number | null
  remaining_period: string | null
}

export interface FundOverviewTotals {
  commitment_total: number
  total_paid_in: number
  gp_commitment: number
  total_invested: number
  uninvested: number
  investment_assets: number
  company_count: number
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
  category: string | null
  fund_id: number | null
  investment_id: number | null
  fund_name: string | null
  company_name: string | null
}

export interface TaskBoard {
  Q1: Task[]
  Q2: Task[]
  Q3: Task[]
  Q4: Task[]
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
  order: number
  name: string
  timing: string
  timing_offset_days: number
  estimated_time: string | null
  quadrant: string
  memo: string | null
}

export interface WorkflowDocument {
  id: number
  name: string
  required: boolean
  timing: string | null
  notes: string | null
}

export interface WorkflowWarning {
  id: number
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

export interface WorkflowStepInstance {
  id: number
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
  investment_name: string | null
  company_name: string | null
  fund_name: string | null
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
}

export interface WorkflowStepCompleteInput {
  actual_time?: string
  notes?: string
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

export interface Fund {
  id: number
  name: string
  type: string
  formation_date: string | null
  status: string
  gp: string | null
  fund_manager: string | null
  co_gp: string | null
  trustee: string | null
  commitment_total: number | null
  gp_commitment: number | null
  contribution_type: string | null
  aum: number | null
  investment_period_end: string | null
  maturity_date: string | null
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
  status?: string
  gp?: string | null
  fund_manager?: string | null
  co_gp?: string | null
  trustee?: string | null
  commitment_total?: number | null
  gp_commitment?: number | null
  contribution_type?: string | null
  aum?: number | null
  investment_period_end?: string | null
  maturity_date?: string | null
  mgmt_fee_rate?: number | null
  performance_fee_rate?: number | null
  hurdle_rate?: number | null
  account_number?: string | null
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

export interface FundNoticePeriodInput {
  notice_type: string
  label: string
  business_days: number
  memo?: string | null
}

export interface FundNoticePeriodResponse {
  id: number
  fund_id: number
  notice_type: string
  label: string
  business_days: number
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

export interface UpcomingReport {
  id: number
  report_target: string
  fund_id: number | null
  fund_name: string | null
  period: string
  due_date: string | null
  status: string
  days_remaining: number | null
}

export interface UpcomingNotice {
  fund_name: string
  notice_label: string
  deadline: string
  days_remaining: number
  workflow_instance_name: string
  workflow_instance_id?: number | null
}

export interface NoticeDeadlineResult {
  target_date: string
  notice_type: string
  business_days: number
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

export interface CapitalCallInput {
  fund_id: number
  call_date: string
  call_type: string
  total_amount?: number
  memo?: string | null
}

export interface CapitalCall {
  id: number
  fund_id: number
  call_date: string
  call_type: string
  total_amount: number
  memo: string | null
  created_at: string
  fund_name?: string
}

export interface CapitalCallItemInput {
  lp_id: number
  amount?: number
  paid?: boolean
  paid_date?: string | null
}

export interface CapitalCallItem {
  id: number
  capital_call_id: number
  lp_id: number
  amount: number
  paid: boolean
  paid_date: string | null
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
  content: string
  order: number
}

export interface WorkLogLesson {
  id: number
  content: string
  order: number
}

export interface WorkLogFollowUp {
  id: number
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



