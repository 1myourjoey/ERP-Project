import { useQuery } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import {
  fetchComplianceViolationPatterns,
  type ComplianceViolationPatternsResponse,
} from '../../lib/api'

type ViolationPatternsProps = {
  fundId: number | ''
  months: number
}

function monthLabel(months: string[]): string {
  if (!months.length) return '-'
  return months.join(', ')
}

export default function ViolationPatterns({ fundId, months }: ViolationPatternsProps) {
  const enabled = fundId !== ''

  const { data, isLoading, isFetching } = useQuery<ComplianceViolationPatternsResponse>({
    queryKey: ['complianceHistoryPatterns', fundId, months],
    queryFn: () => fetchComplianceViolationPatterns({ fund_id: Number(fundId), months }),
    enabled,
  })

  if (!enabled) {
    return (
      <div className="card-base">
        <EmptyState emoji="p" message="Select a fund to analyze violation patterns." className="py-8" />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="card-base">
        <PageLoading />
      </div>
    )
  }

  const recurring = data?.recurring_violations ?? []
  const improving = data?.improving_areas ?? []
  const worsening = data?.worsening_areas ?? []

  return (
    <div className="space-y-3">
      <div className="card-base">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Violation Patterns</h3>
          <span className="text-xs text-gray-500">
            {isFetching ? 'Refreshing...' : `Window: ${months} month(s)`}
          </span>
        </div>

        {!recurring.length && !improving.length && !worsening.length ? (
          <EmptyState emoji="v" message="No recurring pattern detected for this period." className="py-8" />
        ) : (
          <div className="space-y-2">
            {recurring.map((item) => (
              <div key={`${item.rule_id}-${item.rule_code}`} className="rounded-xl border border-gray-200 bg-white/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-800">
                    {item.rule_name || item.rule_code || `Rule #${item.rule_id}`}
                  </div>
                  <span className="tag tag-red">{item.violation_count} violation(s)</span>
                </div>
                <p className="mt-1 text-xs text-gray-600">Months: {monthLabel(item.months_violated)}</p>
                <p className="mt-1 text-xs text-gray-600">Pattern: {item.pattern}</p>
                <p className="mt-2 text-xs text-gray-700">Recommendation: {item.recommendation}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="card-base">
          <h4 className="mb-2 text-sm font-semibold text-green-700">Improving Areas</h4>
          {!improving.length ? (
            <p className="text-xs text-gray-500">No improving trend detected.</p>
          ) : (
            <div className="space-y-2">
              {improving.map((item) => (
                <div key={`improving-${item.rule_id}`} className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-800">
                  <p className="font-medium">{item.rule_name || item.rule_code || `Rule #${item.rule_id}`}</p>
                  <p>
                    {item.early_period_violations}
                    {' -> '}
                    {item.recent_period_violations} (delta {item.delta})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-base">
          <h4 className="mb-2 text-sm font-semibold text-red-700">Worsening Areas</h4>
          {!worsening.length ? (
            <p className="text-xs text-gray-500">No worsening trend detected.</p>
          ) : (
            <div className="space-y-2">
              {worsening.map((item) => (
                <div key={`worsening-${item.rule_id}`} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <p className="font-medium">{item.rule_name || item.rule_code || `Rule #${item.rule_id}`}</p>
                  <p>
                    {item.early_period_violations}
                    {' -> '}
                    {item.recent_period_violations} (delta +{item.delta})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
