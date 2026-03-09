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
    queryKeys.workflows.all,
    queryKeys.documents.generated,
    queryKeys.dashboard.base,
    queryKeys.dashboard.health,
    queryKeys.dashboard.deadlines,
    queryKeys.dashboard.fundsSnapshot,
    queryKeys.dashboard.pipeline,
    queryKeys.dashboard.workflows,
    queryKeys.dashboard.sidebar,
    queryKeys.dashboard.completed,
    queryKeys.worklogs.all,
    ['dashboard-base'],
    ['documentStatus'],
    ['taskBoard'],
    ['workflowInstances'],
    ['workflow-instances'],
    ['workflow-instance'],
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
    queryKeys.investmentReviews.all,
    queryKeys.investmentReviews.weeklySummary,
    queryKeys.performance.all,
    queryKeys.documents.generated,
    ['fund'],
    ['capitalCallSummary'],
    ['investmentReviews'],
    ['investmentReview'],
    ['investmentReviewWeeklySummary'],
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
    queryKeys.dashboard.health,
    queryKeys.dashboard.fundsSnapshot,
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
    queryKeys.dashboard.health,
    queryKeys.dashboard.deadlines,
  ])
}

export function invalidateDocumentRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [
    queryKeys.documents.generated,
    ['document-status'],
    ['documentStatus'],
    ['dashboard'],
    ['dashboard-base'],
    queryKeys.dashboard.base,
    queryKeys.dashboard.health,
    queryKeys.dashboard.deadlines,
    queryKeys.dashboard.fundsSnapshot,
    queryKeys.dashboard.sidebar,
    queryKeys.dashboard.completed,
  ])
}

export function invalidateUserRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [['users']])
}
