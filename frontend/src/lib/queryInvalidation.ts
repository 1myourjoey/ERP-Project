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
    ['calendarEvents'],
    ['workflowInstances'],
    ['workflow-instances'],
    ['tasks'],
    ['worklogs'],
    ['worklogInsights'],
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
  ])
  if (fundId) {
    invalidateMany(queryClient, [
      ['fund', fundId],
      ['fundDetails', fundId],
      ['fundLPs', fundId],
      ['capitalCalls', fundId],
      ['capitalCallSummary', fundId],
      ['fundPerformance', fundId],
    ])
  }
}
