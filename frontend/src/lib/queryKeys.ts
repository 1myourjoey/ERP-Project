const tasksAll = ['tasks'] as const
const workflowsAll = ['workflows'] as const
const fundsAll = ['funds'] as const
const investmentsAll = ['investments'] as const
const investmentReviewsAll = ['investment-reviews'] as const
const documentsGenerated = ['generated-documents'] as const
const dashboardBase = ['dashboard', 'base'] as const
const dashboardHealth = ['dashboard', 'health'] as const
const dashboardDeadlines = ['dashboard', 'deadlines'] as const
const dashboardFundsSnapshot = ['dashboard', 'funds-snapshot'] as const
const dashboardPipeline = ['dashboard', 'pipeline'] as const
const dashboardWorkflows = ['dashboard', 'workflows'] as const
const dashboardSidebar = ['dashboard', 'sidebar'] as const
const dashboardCompleted = ['dashboard', 'completed'] as const
const dashboardSummary = ['dashboard', 'summary'] as const
const worklogsAll = ['worklogs'] as const
const capitalCallsAll = ['capital-calls'] as const
const complianceAll = ['compliance'] as const
const notificationsAll = ['notifications'] as const
const performanceAll = ['performance'] as const

export const queryKeys = {
  tasks: {
    all: tasksAll,
    board: () => [...tasksAll, 'board'] as const,
    list: (filters?: Record<string, unknown>) => [...tasksAll, 'list', filters] as const,
    detail: (id: number) => [...tasksAll, id] as const,
    categories: ['task-categories'] as const,
  },
  workflows: {
    all: workflowsAll,
    templates: () => [...workflowsAll, 'templates'] as const,
    instances: (filters?: Record<string, unknown>) => [...workflowsAll, 'instances', filters] as const,
    detail: (id: number) => [...workflowsAll, id] as const,
    instance: (id: number) => [...workflowsAll, 'instance', id] as const,
  },
  funds: {
    all: fundsAll,
    list: () => [...fundsAll, 'list'] as const,
    detail: (id: number) => [...fundsAll, id] as const,
    lps: (fundId: number) => [...fundsAll, fundId, 'lps'] as const,
    overview: ['fund-overview'] as const,
  },
  investments: {
    all: investmentsAll,
    list: (filters?: Record<string, unknown>) => [...investmentsAll, 'list', filters] as const,
    detail: (id: number) => [...investmentsAll, id] as const,
    companies: ['companies'] as const,
  },
  investmentReviews: {
    all: investmentReviewsAll,
    list: (filters?: Record<string, unknown>) => [...investmentReviewsAll, 'list', filters] as const,
    detail: (id: number) => [...investmentReviewsAll, id] as const,
    weeklySummary: [...investmentReviewsAll, 'weekly-summary'] as const,
  },
  documents: {
    status: (filters?: Record<string, unknown>) => ['document-status', filters] as const,
    generated: documentsGenerated,
  },
  dashboard: {
    base: dashboardBase,
    health: dashboardHealth,
    deadlines: dashboardDeadlines,
    fundsSnapshot: dashboardFundsSnapshot,
    pipeline: dashboardPipeline,
    workflows: dashboardWorkflows,
    sidebar: dashboardSidebar,
    completed: dashboardCompleted,
    summary: dashboardSummary,
  },
  worklogs: {
    all: worklogsAll,
    list: (filters?: Record<string, unknown>) => [...worklogsAll, 'list', filters] as const,
    insights: (filters?: Record<string, unknown>) => [...worklogsAll, 'insights', filters] as const,
  },
  capitalCalls: {
    all: capitalCallsAll,
    list: (fundId?: number) => [...capitalCallsAll, 'list', fundId] as const,
    summary: (fundId: number) => [...capitalCallsAll, 'summary', fundId] as const,
  },
  compliance: {
    all: complianceAll,
    rules: () => [...complianceAll, 'rules'] as const,
    obligations: (filters?: Record<string, unknown>) => [...complianceAll, 'obligations', filters] as const,
    checks: (filters?: Record<string, unknown>) => [...complianceAll, 'checks', filters] as const,
  },
  notifications: {
    all: notificationsAll,
    unreadCount: ['notifications', 'unread-count'] as const,
    list: (filters?: Record<string, unknown>) => ['notifications', 'list', filters] as const,
  },
  performance: {
    all: performanceAll,
    fund: (fundId: number) => ['performance', 'fund', fundId] as const,
    summary: ['performance', 'all'] as const,
  },
  cashflow: {
    fund: (fundId: number, monthsAhead?: number) => ['cashflow', 'fund', fundId, monthsAhead] as const,
    all: (monthsAhead?: number) => ['cashflow', 'all', monthsAhead] as const,
  },
} as const
