export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    board: () => [...queryKeys.tasks.all, 'board'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.tasks.all, 'list', filters] as const,
    detail: (id: number) => [...queryKeys.tasks.all, id] as const,
    categories: ['task-categories'] as const,
  },
  workflows: {
    all: ['workflows'] as const,
    templates: () => [...queryKeys.workflows.all, 'templates'] as const,
    instances: (filters?: Record<string, unknown>) => [...queryKeys.workflows.all, 'instances', filters] as const,
    detail: (id: number) => [...queryKeys.workflows.all, id] as const,
  },
  funds: {
    all: ['funds'] as const,
    list: () => [...queryKeys.funds.all, 'list'] as const,
    detail: (id: number) => [...queryKeys.funds.all, id] as const,
    lps: (fundId: number) => [...queryKeys.funds.detail(fundId), 'lps'] as const,
    overview: ['fund-overview'] as const,
  },
  investments: {
    all: ['investments'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.investments.all, 'list', filters] as const,
    detail: (id: number) => [...queryKeys.investments.all, id] as const,
    companies: ['companies'] as const,
  },
  dashboard: {
    base: ['dashboard', 'base'] as const,
    workflows: ['dashboard', 'workflows'] as const,
    sidebar: ['dashboard', 'sidebar'] as const,
    completed: ['dashboard', 'completed'] as const,
    summary: ['dashboard', 'summary'] as const,
  },
  worklogs: {
    all: ['worklogs'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.worklogs.all, 'list', filters] as const,
    insights: (filters?: Record<string, unknown>) => [...queryKeys.worklogs.all, 'insights', filters] as const,
  },
  capitalCalls: {
    all: ['capital-calls'] as const,
    list: (fundId?: number) => [...queryKeys.capitalCalls.all, 'list', fundId] as const,
    summary: (fundId: number) => [...queryKeys.capitalCalls.all, 'summary', fundId] as const,
  },
  compliance: {
    all: ['compliance'] as const,
    rules: () => [...queryKeys.compliance.all, 'rules'] as const,
    obligations: (filters?: Record<string, unknown>) => [...queryKeys.compliance.all, 'obligations', filters] as const,
    checks: (filters?: Record<string, unknown>) => [...queryKeys.compliance.all, 'checks', filters] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    list: (filters?: Record<string, unknown>) => ['notifications', 'list', filters] as const,
  },
  performance: {
    all: ['performance'] as const,
    fund: (fundId: number) => ['performance', 'fund', fundId] as const,
    summary: ['performance', 'all'] as const,
  },
  cashflow: {
    fund: (fundId: number, monthsAhead?: number) => ['cashflow', 'fund', fundId, monthsAhead] as const,
    all: (monthsAhead?: number) => ['cashflow', 'all', monthsAhead] as const,
  },
} as const
