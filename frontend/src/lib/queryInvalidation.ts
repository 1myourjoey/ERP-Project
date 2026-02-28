import type { QueryClient, QueryKey } from '@tanstack/react-query'

function invalidateMany(queryClient: QueryClient, keys: QueryKey[]) {
  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey })
  }
}

export function invalidateTaskRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [
    ['taskBoard'],
    ['dashboard'],
    ['dashboard-base'],
    ['dashboard-workflows'],
    ['dashboard-sidebar'],
    ['dashboard-completed'],
    ['dashboard-upcoming-notices'],
    ['complianceDashboard'],
    ['complianceObligations'],
    ['complianceRules'],
    ['internalReviews'],
    ['internalReview'],
    ['generatedDocuments'],
    ['calendarEvents'],
    ['workflowInstances'],
    ['workflow-instances'],
    ['tasks'],
    ['worklogs'],
    ['worklogInsights'],
  ])
}

export function invalidateWorkflowRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [
    ['workflows'],
    ['workflow'],
    ['workflowInstances'],
    ['workflow-instances'],
    ['periodic-schedules'],
    ['periodic-schedule'],
  ])
  invalidateTaskRelated(queryClient)
}

export function invalidateChecklistRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [
    ['checklists'],
    ['checklist'],
  ])
}

export function invalidateFundRelated(queryClient: QueryClient, fundId?: number | null) {
  invalidateTaskRelated(queryClient)
  invalidateMany(queryClient, [
    ['funds'],
    ['fund'],
    ['fundOverview'],
    ['capitalCalls'],
    ['capitalCallItems'],
    ['capitalCallSummary'],
    ['fundPerformance'],
    ['lpAddressBooks'],
    ['transactions'],
    ['transactionLedger'],
    ['transactionSummary'],
    ['valuations'],
    ['valuations', 'dashboard'],
    ['valuations', 'nav-summary'],
    ['capitalCallDetails'],
    ['distributionDetails'],
    ['fees', 'management'],
    ['fees', 'performance'],
    ['fees', 'config'],
    ['fees', 'waterfall'],
    ['bizReports', 'matrix'],
    ['bizReports', 'docCollection'],
    ['bizReportRequests'],
    ['bizReportAnomalies'],
    ['bizReportTemplates'],
    ['vicsReports'],
    ['internalReviews'],
    ['internalReview'],
    ['complianceDashboard'],
    ['complianceObligations'],
    ['complianceRules'],
    ['users'],
    ['investmentReviews'],
    ['investmentReview'],
    ['investmentReviewWeeklySummary'],
    ['generatedDocuments'],
  ])
  if (fundId) {
    invalidateMany(queryClient, [
      ['fund', fundId],
      ['fundDetails', fundId],
      ['fundLPs', fundId],
      ['capitalCalls', fundId],
      ['capitalCallSummary', fundId],
      ['fundPerformance', fundId],
      ['valuations', 'dashboard', fundId],
      ['fees', 'management', fundId],
      ['fees', 'performance', fundId],
      ['fees', 'config', fundId],
      ['fees', 'waterfall', fundId],
      ['investmentReviews', fundId],
      ['transactions', fundId],
    ])
  }
}

export function invalidateFeeRelated(queryClient: QueryClient, fundId?: number | null) {
  invalidateMany(queryClient, [
    ['fees', 'management'],
    ['fees', 'performance'],
    ['fees', 'config'],
    ['fees', 'waterfall'],
    ['dashboard'],
    ['dashboard-base'],
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
    ['bizReportCommentDiff'],
    ['bizReportTemplates'],
    ['internalReviews'],
    ['internalReview'],
    ['dashboard'],
    ['dashboard-base'],
  ])
}

export function invalidateUserRelated(queryClient: QueryClient) {
  invalidateMany(queryClient, [['users']])
}
