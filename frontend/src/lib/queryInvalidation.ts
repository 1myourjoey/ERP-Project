import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { queryKeys } from './queryKeys'

function invalidateMany(queryClient: QueryClient, keys: QueryKey[]) {
  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey })
  }
}

export function invalidateTaskRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [
    queryKeys.tasks.all,
    queryKeys.tasks.board(),
    queryKeys.tasks.categories,
    queryKeys.dashboard.base,
    queryKeys.dashboard.workflows,
    queryKeys.dashboard.sidebar,
    queryKeys.dashboard.completed,
    queryKeys.worklogs.all,
    ['taskBoard'],
    ['workflowInstances'],
    ['workflow-instances'],
    ['calendarEvents'],
  ])
}

export function invalidateWorkflowRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [
    queryKeys.workflows.all,
    queryKeys.workflows.templates(),
    ['workflow'],
    ['workflowInstances'],
    ['workflow-instances'],
    ['periodic-schedules'],
    ['periodic-schedule'],
  ])
  invalidateTaskRelated(queryClient)
}

export function invalidateChecklistRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [['checklists'], ['checklist']])
}

export function invalidateFundRelated(queryClient: QueryClient, fundId?: number | null) {
  invalidateTaskRelated(queryClient)
  invalidateMany(queryClient, [
    queryKeys.funds.all,
    queryKeys.funds.list(),
    queryKeys.funds.overview,
    queryKeys.capitalCalls.all,
    queryKeys.investments.all,
    queryKeys.performance.all,
    ['fund'],
    ['capitalCallSummary'],
    ['lpAddressBooks'],
    ['transactions'],
    ['valuations'],
    ['distributions'],
    ['fees', 'management'],
    ['fees', 'performance'],
    ['fees', 'config'],
    ['fees', 'waterfall'],
  ])

  if (fundId) {
    invalidateMany(queryClient, [
      queryKeys.funds.detail(fundId),
      queryKeys.funds.lps(fundId),
      queryKeys.capitalCalls.summary(fundId),
      queryKeys.performance.fund(fundId),
      ['fundDetails', fundId],
      ['capitalCalls', fundId],
      ['transactions', fundId],
      ['distributions', fundId],
      ['lpTransfers', fundId],
      ['fees', 'management', fundId],
      ['fees', 'performance', fundId],
      ['fees', 'config', fundId],
      ['fees', 'waterfall', fundId],
    ])
  }
}

export function invalidateFeeRelated(queryClient: QueryClient, fundId?: number | null) {
  invalidateMany(queryClient, [
    ['fees', 'management'],
    ['fees', 'performance'],
    ['fees', 'config'],
    ['fees', 'waterfall'],
    queryKeys.dashboard.base,
  ])
  if (fundId) {
    invalidateMany(queryClient, [
      ['fees', 'management', fundId],
      ['fees', 'performance', fundId],
      ['fees', 'config', fundId],
      ['fees', 'waterfall', fundId],
    ])
  }
}

export function invalidateBizReportRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [
    ['bizReports'],
    ['bizReports', 'matrix'],
    ['bizReports', 'docCollection'],
    ['bizReportRequests'],
    ['bizReportAnomalies'],
    ['bizReportTemplates'],
    ['internalReviews'],
    ['internalReview'],
    queryKeys.dashboard.base,
  ])
}

export function invalidateUserRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [['users']])
}
