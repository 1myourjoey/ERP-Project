import { useQuery } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import {
  fetchComplianceRuleSuggestions,
  type ComplianceRuleSuggestion,
} from '../../lib/api'

type RuleSuggestionsProps = {
  fundId: number | ''
}

function suggestionBadge(suggestion: string): { label: string; className: string } {
  if (suggestion === 'severity_upgrade') {
    return { label: 'Severity Upgrade', className: 'tag tag-red' }
  }
  if (suggestion === 'frequency_reduce') {
    return { label: 'Frequency Reduce', className: 'tag tag-blue' }
  }
  return { label: suggestion, className: 'tag tag-gray' }
}

export default function RuleSuggestions({ fundId }: RuleSuggestionsProps) {
  const { data = [], isLoading, isFetching } = useQuery<ComplianceRuleSuggestion[]>({
    queryKey: ['complianceHistorySuggestions', fundId],
    queryFn: () =>
      fetchComplianceRuleSuggestions({
        fund_id: fundId === '' ? undefined : fundId,
      }),
  })

  if (isLoading) {
    return (
      <div className="card-base">
        <PageLoading />
      </div>
    )
  }

  return (
    <div className="card-base overflow-auto">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Rule Suggestions</h3>
        <span className="text-xs text-gray-500">{isFetching ? 'Refreshing...' : `${data.length} suggestion(s)`}</span>
      </div>

      {!data.length ? (
        <EmptyState emoji="s" message="No rule adjustment suggestions for current scope." className="py-8" />
      ) : (
        <table className="min-w-[860px] w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Rule</th>
              <th className="px-3 py-2 text-left">Current</th>
              <th className="px-3 py-2 text-left">Suggestion</th>
              <th className="px-3 py-2 text-left">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((item) => {
              const badge = suggestionBadge(item.suggestion)
              return (
                <tr key={`${item.rule_id}-${item.suggestion}`}>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-gray-500">{item.rule_code || '-'}</div>
                    <div>{item.rule_name || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    <div>Level: {item.current_level || '-'}</div>
                    <div>Severity: {item.current_severity || '-'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={badge.className}>{badge.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{item.detail}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
