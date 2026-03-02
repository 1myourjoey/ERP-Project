# V:ON ERP — API & 기능 연결 맵

> **목적**: 이 파일은 프론트엔드의 모든 API 연결, 상태, 핸들러를 정리한 것입니다.
> UI/CSS를 완전히 교체하더라도 이 로직 레이어를 그대로 재연결하면 기능이 보장됩니다.

---

## 0. 아키텍처 개요

```
[React Component]
    ├─ 뷰 레이어  → JSX + className  ← 자유롭게 교체 가능
    └─ 로직 레이어 (이 파일이 정리하는 부분 — 절대 변경 금지)
         ├─ useQuery(queryKey, queryFn)   → GET API 호출
         ├─ useMutation(mutationFn)       → POST/PUT/PATCH/DELETE API
         ├─ useState / useMemo            → 로컬 상태
         └─ 이벤트 핸들러                 → onClick, onChange, onSubmit
```

### HTTP 클라이언트
- `api` = `axios.create({ baseURL: '/api' })`  (`lib/api/legacy.ts`)
- JWT Bearer 자동 주입 (request interceptor)
- 401 → 자동 토큰 갱신 → 실패 시 `/login` 리다이렉트
- 에러 → `pushToast()` 자동 호출

---

## 1. 라우팅 맵

| 경로 | 컴포넌트 | 인증 필요 |
|------|----------|-----------|
| `/login` | LoginPage | ✗ |
| `/register` | RegisterPage | ✗ |
| `/forgot-password` | ForgotPasswordPage | ✗ |
| `/reset-password` | ResetPasswordPage | ✗ |
| `/dashboard` | DashboardPage | ✓ |
| `/tasks` | TaskBoardPage | ✓ |
| `/worklogs` | WorkLogsPage | ✓ |
| `/calendar` | CalendarPage | ✓ |
| `/workflows` | WorkflowsPage | ✓ |
| `/fund-overview` | FundOverviewPage | ✓ |
| `/funds` | FundsPage | ✓ |
| `/funds/:id` | FundDetailPage | ✓ |
| `/investments` | InvestmentsPage | ✓ |
| `/investments/:id` | InvestmentDetailPage | ✓ |
| `/investment-reviews` | InvestmentReviewPage | ✓ |
| `/exits` | ExitsPage | ✓ |
| `/transactions` | TransactionsPage | ✓ |
| `/valuations` | ValuationsPage | ✓ |
| `/accounting` | AccountingPage | ✓ |
| `/provisional-fs` | ProvisionalFSPage | ✓ |
| `/fee-management` | FeeManagementPage | ✓ |
| `/cashflow` | CashFlowPage | ✓ |
| `/lp-management` | LPManagementPage | ✓ |
| `/lp-address-book` | LPAddressBookPage | ✓ |
| `/compliance` | CompliancePage | ✓ |
| `/biz-reports` | BizReportsPage | ✓ |
| `/documents` | DocumentsPage | ✓ |
| `/users` | UsersPage | ✓ |
| `/profile` | MyProfilePage | ✓ |

---

## 2. React Query 키 구조 (`lib/queryKeys.ts`)

```ts
queryKeys.tasks.all              = ['tasks']
queryKeys.tasks.board()          = ['tasks', 'board']
queryKeys.tasks.list(filters)    = ['tasks', 'list', filters]
queryKeys.tasks.detail(id)       = ['tasks', id]
queryKeys.tasks.categories       = ['task-categories']

queryKeys.workflows.all          = ['workflows']
queryKeys.workflows.templates()  = ['workflows', 'templates']
queryKeys.workflows.instances()  = ['workflows', 'instances', filters]
queryKeys.workflows.detail(id)   = ['workflows', id]

queryKeys.funds.all              = ['funds']
queryKeys.funds.list()           = ['funds', 'list']
queryKeys.funds.detail(id)       = ['funds', id]
queryKeys.funds.lps(fundId)      = ['funds', id, 'lps']
queryKeys.funds.overview         = ['fund-overview']

queryKeys.investments.all        = ['investments']
queryKeys.investments.companies  = ['companies']

queryKeys.dashboard.base         = ['dashboard', 'base']
queryKeys.dashboard.workflows    = ['dashboard', 'workflows']
queryKeys.dashboard.sidebar      = ['dashboard', 'sidebar']
queryKeys.dashboard.completed    = ['dashboard', 'completed']
queryKeys.dashboard.summary      = ['dashboard', 'summary']

queryKeys.notifications.unreadCount = ['notifications', 'unread-count']
queryKeys.compliance.rules()     = ['compliance', 'rules']
queryKeys.cashflow.all()         = ['cashflow', 'all', monthsAhead]
```

---

## 3. 전체 API 함수 목록

### 3-1. Tasks (업무)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchTaskBoard(status, year, month)` | GET | `/tasks/board` |
| `fetchTasks(params)` | GET | `/tasks` |
| `fetchTask(id)` | GET | `/tasks/:id` |
| `createTask(data)` | POST | `/tasks` |
| `updateTask(id, data)` | PUT | `/tasks/:id` |
| `moveTask(id, quadrant)` | PATCH | `/tasks/:id/move` |
| `completeTask(id, actualTime, autoWorklog, memo)` | PATCH | `/tasks/:id/complete` |
| `undoCompleteTask(id)` | PATCH | `/tasks/:id/undo-complete` |
| `deleteTask(id)` | DELETE | `/tasks/:id` |
| `bulkCompleteTasks(data)` | POST | `/tasks/bulk-complete` |
| `bulkDeleteTasks(data)` | POST | `/tasks/bulk-delete` |
| `generateMonthlyReminders(yearMonth)` | POST | `/tasks/generate-monthly-reminders` |
| `fetchTaskCategories()` | GET | `/task-categories` |
| `createTaskCategory(name)` | POST | `/task-categories` |
| `deleteTaskCategory(id)` | DELETE | `/task-categories/:id` |

### 3-2. Dashboard (대시보드)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchDashboardBase()` | GET | `/dashboard/base` |
| `fetchDashboardWorkflows()` | GET | `/dashboard/workflows` |
| `fetchDashboardSidebar()` | GET | `/dashboard/sidebar` |
| `fetchDashboardCompleted()` | GET | `/dashboard/completed` |
| `fetchDashboardSummary()` | GET | `/dashboard/summary` |
| `fetchUpcomingNotices(days)` | GET | `/dashboard/upcoming-notices` |

### 3-3. Workflows (워크플로우)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchWorkflows()` | GET | `/workflows` |
| `fetchWorkflow(id)` | GET | `/workflows/:id` |
| `createWorkflowTemplate(data)` | POST | `/workflows` |
| `updateWorkflowTemplate(id, data)` | PUT | `/workflows/:id` |
| `deleteWorkflowTemplate(id)` | DELETE | `/workflows/:id` |
| `instantiateWorkflow(id, data)` | POST | `/workflows/:id/instantiate` |
| `fetchWorkflowInstances(params)` | GET | `/workflow-instances` |
| `fetchWorkflowInstance(id)` | GET | `/workflow-instances/:id` |
| `completeWorkflowStep(instanceId, stepId, data)` | PATCH | `/workflow-instances/:id/steps/:stepId/complete` |
| `undoWorkflowStep(instanceId, stepId)` | PUT | `/workflow-instances/:id/steps/:stepId/undo` |
| `cancelWorkflowInstance(id)` | PATCH | `/workflow-instances/:id/cancel` |
| `deleteWorkflowInstance(id)` | DELETE | `/workflow-instances/:id` |
| `updateWorkflowInstance(id, data)` | PUT | `/workflow-instances/:id` |
| `swapWorkflowInstanceTemplate(instanceId, data)` | PUT | `/workflow-instances/:id/swap-template` |
| `addWorkflowStepInstanceDocument(...)` | POST | `/workflow-instances/:id/steps/:stepId/documents` |
| `updateWorkflowStepInstanceDocument(...)` | PUT | `...documents/:docId` |
| `deleteWorkflowStepInstanceDocument(...)` | DELETE | `...documents/:docId` |
| `checkWorkflowStepInstanceDocument(...)` | PATCH | `...documents/:docId/check` |
| `fetchPeriodicSchedules()` | GET | `/periodic-schedules` |
| `createPeriodicSchedule(data)` | POST | `/periodic-schedules` |
| `updatePeriodicSchedule(id, data)` | PUT | `/periodic-schedules/:id` |
| `deletePeriodicSchedule(id)` | DELETE | `/periodic-schedules/:id` |
| `generatePeriodicSchedulesForYear(year, dryRun)` | POST | `/periodic-schedules/generate-year` |

### 3-4. Funds (펀드)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchFunds()` | GET | `/funds` |
| `fetchFund(id)` | GET | `/funds/:id` |
| `createFund(data)` | POST | `/funds` |
| `updateFund(id, data)` | PUT | `/funds/:id` |
| `deleteFund(id)` | DELETE | `/funds/:id` |
| `fetchFundOverview(referenceDate)` | GET | `/funds/overview` |
| `fetchFundLPs(fundId)` | GET | `/funds/:id/lps` |
| `createFundLP(fundId, data)` | POST | `/funds/:id/lps` |
| `updateFundLP(fundId, lpId, data)` | PUT | `/funds/:id/lps/:lpId` |
| `deleteFundLP(fundId, lpId)` | DELETE | `/funds/:id/lps/:lpId` |
| `fetchLPContributions(fundId, lpId)` | GET | `/funds/:id/lps/:lpId/contributions` |
| `createLPContribution(...)` | POST | `...contributions` |
| `fetchFundContributionOverview(fundId)` | GET | `/funds/:id/contribution-overview` |
| `fetchLPTransfers(fundId)` | GET | `/funds/:id/lp-transfers` |
| `createLPTransfer(fundId, data)` | POST | `/funds/:id/lp-transfers` |
| `completeLPTransfer(fundId, transferId)` | POST | `...lp-transfers/:id/complete` |
| `calculateDeadline(fundId, targetDate, noticeType)` | GET | `/funds/:id/calculate-deadline` |
| `addFundFormationWorkflow(fundId, data)` | POST | `/funds/:id/add-formation-workflow` |
| `importFundMigration(file, mode, syncAddressBook)` | POST | `/funds/migration-import` |

### 3-5. LP 주소록
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchLPAddressBooks(params)` | GET | `/lp-address-books` |
| `fetchLPAddressBook(id)` | GET | `/lp-address-books/:id` |
| `createLPAddressBook(data)` | POST | `/lp-address-books` |
| `updateLPAddressBook(id, data)` | PATCH | `/lp-address-books/:id` |
| `deactivateLPAddressBook(id)` | DELETE | `/lp-address-books/:id` |

### 3-6. GP Entities / GP Profiles
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchGPEntities()` | GET | `/gp-entities` |
| `createGPEntity(data)` | POST | `/gp-entities` |
| `updateGPEntity(id, data)` | PATCH | `/gp-entities/:id` |
| `deleteGPEntity(id)` | DELETE | `/gp-entities/:id` |
| `fetchGPProfiles()` | GET | `/gp-profiles` |

### 3-7. Investments (투자)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchCompanies()` | GET | `/companies` |
| `createCompany(data)` | POST | `/companies` |
| `fetchInvestments(params)` | GET | `/investments` |
| `fetchInvestment(id)` | GET | `/investments/:id` |
| `createInvestment(data)` | POST | `/investments` |
| `updateInvestment(id, data)` | PUT | `/investments/:id` |
| `deleteInvestment(id)` | DELETE | `/investments/:id` |
| `fetchInvestmentDocuments(investmentId)` | GET | `/investments/:id/documents` |
| `fetchInvestmentReviews(params)` | GET | `/investment-reviews` |
| `createInvestmentReview(data)` | POST | `/investment-reviews` |
| `updateInvestmentReviewStatus(id, status)` | PATCH | `/investment-reviews/:id/status` |
| `convertInvestmentReview(id)` | POST | `/investment-reviews/:id/convert` |
| `fetchVoteRecords(params)` | GET | `/vote-records` |
| `fetchTransactions(params)` | GET | `/transactions` |

### 3-8. Compliance (컴플라이언스)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchComplianceRules(params)` | GET | `/compliance/rules` |
| `createComplianceRule(data)` | POST | `/compliance/rules` |
| `runComplianceCheck(fundId)` | POST | `/compliance/check/:fundId` |
| `fetchComplianceChecks(params)` | GET | `/compliance/checks` |
| `fetchComplianceObligations(params)` | GET | `/compliance/obligations` |
| `completeComplianceObligation(id, data)` | POST | `/compliance/obligations/:id/complete` |
| `fetchComplianceDashboard()` | GET | `/compliance/dashboard` |
| `fetchLegalDocuments()` | GET | `/legal-documents` |
| `uploadLegalDocument(payload)` | POST | `/legal-documents/upload` |
| `searchLegalDocuments(params)` | GET | `/legal-documents/search` |
| `interpretComplianceQuery(data)` | POST | `/compliance/interpret` |
| `triggerComplianceManualScan(data)` | POST | `/compliance/scan/manual` |

### 3-9. Documents & Templates (문서)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `fetchDocumentTemplates(category)` | GET | `/document-templates` |
| `generateDocument(templateId, fundId)` | POST | `/document-templates/:id/generate` |
| `previewTemplate(templateId, fundId)` | POST | `/document-templates/:id/preview` |
| `generateTemplateDocument(data)` | POST | `/documents/generate` |
| `fetchGeneratedDocuments(params)` | GET | `/documents` |
| `downloadGeneratedDocument(id)` | GET | `/documents/:id/download` |
| `uploadAttachment(file, entityType, entityId)` | POST | `/attachments` |
| `downloadAttachment(id)` | GET | `/attachments/:id` |
| `removeAttachment(id)` | DELETE | `/attachments/:id` |

### 3-10. Auth (인증)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `login(data)` | POST | `/auth/login` |
| `logout()` | POST | `/auth/logout` |
| `refreshAuthToken()` | POST | `/auth/refresh` |
| `fetchCurrentUser()` | GET | `/auth/me` |
| `googleLogin(token)` | POST | `/auth/google` |

### 3-11. Notifications (알림)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `getUnreadCount()` | GET | `/notifications/unread-count` |
| `fetchNotifications(params)` | GET | `/notifications` |
| `markAllRead()` | POST | `/notifications/mark-all-read` |

### 3-12. Search (검색)
| 함수명 | HTTP | 엔드포인트 |
|--------|------|-----------|
| `searchGlobal(q)` | GET | `/search` |

---

## 4. 페이지별 로직 맵

### DashboardPage (`/dashboard`)
```
useQuery:
  queryKeys.dashboard.base        → fetchDashboardBase()       → 오늘/내일/이번주 업무
  queryKeys.dashboard.workflows   → fetchDashboardWorkflows()  → 진행 중 워크플로
  queryKeys.dashboard.sidebar     → fetchDashboardSidebar()    → 펀드요약/미수서류/보고마감
  queryKeys.dashboard.completed   → fetchDashboardCompleted()  → 완료 업무 통계
  queryKeys.dashboard.summary     → fetchDashboardSummary()    → 긴급 알림
  ['gp-entities']                 → fetchGPEntities()
  ['workflowInstance', id]        → fetchWorkflowInstance(id)  (선택된 워크플로)

useMutation:
  completeTaskMut     → completeTask(id, actualTime, autoWorklog, memo)
  undoCompleteMut     → undoCompleteTask(id)
  monthlyReminderMut  → generateMonthlyReminders(yearMonth)
  createTaskMut       → createTask(data)
  updateTaskMut       → updateTask(id, data)

핵심 State:
  completingTask: Task | null      (완료 모달 대상)
  editingTask: Task | null         (편집 모달 대상)
  selectedTask: Task | null        (상세 모달 대상)
  showQuickAddModal: boolean
  popupSection: PopupSection | null
  selectedWorkflow: ActiveWorkflow | null

핵심 핸들러:
  openTaskDetail(task, editable)   → selectedTask 설정
  openQuickAdd(target, fundId)     → QuickTaskAddModal 열기
  invalidateDashboardQueries()     → 관련 쿼리 전체 갱신
```

### TaskBoardPage (`/tasks`)
```
useQuery:
  queryKeys.tasks.board()         → fetchTaskBoard(status, year, month)
  ['task-categories']             → fetchTaskCategories()
  ['funds']                       → fetchFunds()
  ['gp-entities']                 → fetchGPEntities()
  queryKeys.dashboard.base        → fetchDashboardBase()       (오늘 날짜용)
  queryKeys.dashboard.workflows   → fetchDashboardWorkflows()

useMutation:
  createMutation       → createTask(data)
  updateMutation       → updateTask(id, data)
  deleteMutation       → deleteTask(id)
  completeMutation     → completeTask(id, actualTime, autoWorklog)
  undoCompleteMutation → undoCompleteTask(id)
  moveMutation         → moveTask(id, quadrant)
  bulkCompleteMutation → bulkCompleteTasks(data)
  bulkDeleteMutation   → bulkDeleteTasks(data)
  createCategoryMutation → createTaskCategory(name)
  deleteCategoryMutation → deleteTaskCategory(category)

핵심 State:
  boardView: 'board' | 'calendar' | 'pipeline'
  statusFilter: 'pending' | 'completed'
  searchKeyword: string
  quickDueFilter: 'all' | 'overdue' | 'today' | 'this_week' | 'no_deadline'
  fundFilter: string
  categoryFilter: string
  selectionMode: boolean
  selectedTaskIds: Set<number>
  completingTask: Task | null
  editingTask: Task | null
  showQuickAddModal: boolean
  deleteConfirm: DeleteConfirmState | null
  showCategoryManager: boolean

뷰 분기:
  boardView === 'board'     → 4개 Quadrant 그리드 (Q1~Q4)
  boardView === 'calendar'  → MiniCalendar 컴포넌트
  boardView === 'pipeline'  → TaskPipelineView 컴포넌트
```

### WorkflowsPage (`/workflows`)
```
useQuery:
  ['workflows']            → fetchWorkflows()           (템플릿 목록)
  ['workflow-instances']   → fetchWorkflowInstances({status})
  ['periodic-schedules']   → fetchPeriodicSchedules()
  ['funds']                → fetchFunds()
  ['gp-entities']          → fetchGPEntities()
  ['companies']            → fetchCompanies()
  ['investments']          → fetchInvestments()
  ['document-templates']   → fetchDocumentTemplates()
  ['workflow', id]         → fetchWorkflow(id)          (선택된 템플릿 상세)

useMutation:
  createMut        → createWorkflowTemplate(data)
  updateMut        → updateWorkflowTemplate(id, data)
  deleteMut        → deleteWorkflowTemplate(id)
  instantiateMut   → instantiateWorkflow(id, data)
  completeMut      → completeWorkflowStep(instanceId, stepId, data)
  undoStepMut      → undoWorkflowStep(instanceId, stepId)
  cancelMut        → cancelWorkflowInstance(id)
  deleteInstanceMut → deleteWorkflowInstance(id)
  updateInstanceMut → updateWorkflowInstance(id, data)
  swapTemplateMut  → swapWorkflowInstanceTemplate(instanceId, data)
  addStepDocMut    → addWorkflowStepInstanceDocument(...)
  updateStepDocMut → updateWorkflowStepInstanceDocument(...)
  deleteStepDocMut → deleteWorkflowStepInstanceDocument(...)
  checkStepDocMut  → checkWorkflowStepInstanceDocument(...)
  createPeriodicMut → createPeriodicSchedule(data)
  updatePeriodicMut → updatePeriodicSchedule(id, data)
  deletePeriodicMut → deletePeriodicSchedule(id)
  generateMut      → generatePeriodicSchedulesForYear(year, dryRun)

핵심 State:
  tab: 'active' | 'completed' | 'templates' | 'periodic' | 'checklists'
  selectedId: number | null        (선택된 템플릿 ID)
  mode: 'view' | 'create' | 'edit'
  openId: number | null            (펼쳐진 인스턴스 ID)
  editingInstanceId: number | null
  swapTarget: WorkflowInstance | null
  newStepDocDrafts: Record<stepId, StepDocumentDraft>
  editingStepDocument: { stepId, documentId, draft } | null
  year: number                     (정기업무 연도)
  editingId: number | null         (정기업무 수정 ID)
```

### LPManagementPage (`/lp-management`)
```
useQuery:
  ['lpAddressBooks', {q, showInactive}] → fetchLPAddressBooks(params)

useMutation:
  createMut     → createLPAddressBook(data)
  updateMut     → updateLPAddressBook(id, data)
  deactivateMut → deactivateLPAddressBook(id)

핵심 State:
  keyword: string
  typeFilter: string
  showInactive: boolean
  editing: LPAddressBook | null
  form: LPAddressBookInput

note: visibleBooks = books.filter(typeFilter)
```

### FundsPage (`/funds`)
```
useQuery:
  ['funds']       → fetchFunds()
  ['gp-entities'] → fetchGPEntities()

useMutation:
  createMut → createFund(data)
  updateMut → updateFund(id, data)
  deleteMut → deleteFund(id)

핵심 State:
  showForm: boolean
  editingFund: Fund | null
  form: FundInput
```

### FundDetailPage (`/funds/:id`)
```
useQuery:
  ['funds', id]        → fetchFund(id)
  ['fundLPs', id]      → fetchFundLPs(id)
  ['capital-calls', id] → fetchCapitalCallsByFund(id)

useMutation:
  createLPMut   → createFundLP(fundId, data)
  updateLPMut   → updateFundLP(fundId, lpId, data)
  deleteLPMut   → deleteFundLP(fundId, lpId)
```

### InvestmentsPage (`/investments`)
```
useQuery:
  ['investments']  → fetchInvestments(params)
  ['companies']    → fetchCompanies()
  ['funds']        → fetchFunds()

useMutation:
  createMut  → createInvestment(data)
  updateMut  → updateInvestment(id, data)
  deleteMut  → deleteInvestment(id)
  createCompanyMut → createCompany(data)
```

### CompliancePage (`/compliance`)
```
useQuery:
  queryKeys.compliance.rules()       → fetchComplianceRules(params)
  queryKeys.compliance.obligations() → fetchComplianceObligations(params)
  queryKeys.compliance.checks()      → fetchComplianceChecks(params)
  ['compliance-dashboard']           → fetchComplianceDashboard()
  ['legal-documents']                → fetchLegalDocuments()

useMutation:
  runCheckMut     → runComplianceCheck(fundId)
  createRuleMut   → createComplianceRule(data)
  updateRuleMut   → updateComplianceRule(id, data)
  deleteRuleMut   → deleteComplianceRule(id)
  completeObMut   → completeComplianceObligation(id, data)
  uploadLegalMut  → uploadLegalDocument(payload)
  interpretMut    → interpretComplianceQuery(data)
  scanMut         → triggerComplianceManualScan(data)
```

### WorkLogsPage (`/worklogs`)
```
useQuery:
  queryKeys.worklogs.list(filters) → fetchWorklogs(params)
  queryKeys.worklogs.insights()    → fetchWorklogInsights(params)
  ['funds']                        → fetchFunds()
```

### DocumentsPage (`/documents`)
```
useQuery:
  ['document-templates']  → fetchDocumentTemplates()
  ['generated-documents'] → fetchGeneratedDocuments(params)
  ['funds']               → fetchFunds()

useMutation:
  generateMut  → generateTemplateDocument(data)
  downloadMut  → downloadGeneratedDocument(id)
  registerMut  → registerTemplate(data)
```

---

## 5. 공통 컴포넌트 Props 인터페이스

### Layout.tsx (네비게이션)
```ts
// props 없음 (Outlet 패턴)
// 내부 state:
searchOpen: boolean
mobileMenuOpen: boolean
openDropdown: string | null
userMenuOpen: boolean
notificationPanelOpen: boolean

// 외부 의존:
useAuth()    → { user, hasAccess, logout }
useQuery()   → getUnreadCount()  (알림 배지)
```

### DashboardStatCard
```ts
interface DashboardStatCardProps {
  label: string           // 카드 레이블
  value: number           // 숫자 값
  onClick?: () => void    // 클릭 시 팝업
  variant?: 'default' | 'danger' | 'success' | 'warning'
  valueSuffix?: string | null  // 보조 텍스트
}
```

### DashboardDefaultView
```ts
// 주요 데이터 props:
todayTasks, tomorrowTasks, thisWeekTasks, prioritizedTasks
activeWorkflows, fundSummary, missingDocuments, upcomingReports
completedTodayTasks, completedThisWeekTasks, completedTodayCount

// 주요 핸들러 props:
onOpenPopup(section)     → 팝업 모달 열기
onOpenTask(task, editable) → 업무 상세 열기
onQuickComplete(task)    → 빠른 완료
onOpenQuickAdd(target, fundId) → 빠른 업무 추가
onOpenWorkflow(workflow) → 워크플로 상세
onOpenTaskBoard()        → /tasks 이동
onOpenPipeline()         → 파이프라인 뷰
onUndoComplete(taskId)   → 완료 취소
```

### DashboardRightPanel
```ts
// 데이터 props:
funds: FundSummary[]
reports: UpcomingReport[]
missingDocuments: MissingDocument[]
investmentReviewActiveCount: number
totalNav: number
unpaidLpCount: number
complianceOverdueCount: number
completedTodayTasks, completedThisWeekTasks, completedLastWeekTasks
completedTodayCount, completedThisWeekCount

// 핸들러 props:
onOpenTask(task, editable)
onUndoComplete(taskId)
```

---

## 6. 상태 불변 규칙 (UI 교체 시 반드시 유지)

| 유지 필수 항목 | 이유 |
|--------------|------|
| 모든 `useQuery` queryKey 문자열 | React Query 캐시 키 |
| 모든 `queryFn` 함수명 | API 호출 함수 |
| 모든 `useMutation` mutationFn | API 쓰기 함수 |
| `invalidateQueries` 대상 키 | 데이터 동기화 |
| `onSuccess` / `onError` 콜백 | 토스트 메시지 |
| `useState` 초기값 | 폼 초기 상태 |
| `useNavigate` / `useLocation` 라우터 훅 | 페이지 이동 |
| `AuthContext` / `useAuth` 훅 | 인증 상태 |
| `ToastContext` / `useToast` 훅 | 알림 표시 |

---

## 7. UI 교체 전략 (이 파일 활용법)

```
1. 이 파일로 각 페이지의 "로직 레이어"를 파악
2. JSX return 내부의 className만 교체 (데이터 바인딩은 유지)
3. 교체 시 아래 패턴으로 확인:

   // ✅ 교체 가능 (className만)
   <div className="old-class"> → <div className="new-class">

   // ✅ 교체 가능 (구조 변경)
   <div><p>{task.title}</p></div> → <h3>{task.title}</h3>

   // ❌ 절대 변경 금지
   queryFn: fetchDashboardBase   ← 함수명 유지
   queryKey: queryKeys.dashboard.base  ← 키 유지
   mutationFn: completeTask      ← 함수명 유지
   onClick={() => handleComplete(task)} ← 핸들러 연결 유지
```
