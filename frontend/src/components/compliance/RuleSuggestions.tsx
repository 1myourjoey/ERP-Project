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
    return { label: '심각도 상향', className: 'tag tag-red' }
  }
  if (suggestion === 'frequency_reduce') {
    return { label: '점검 주기 완화', className: 'tag tag-blue' }
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
        <h3 className="text-sm font-semibold text-[#0f1f3d]">규칙 조정 제안</h3>
        <span className="text-xs text-[#64748b]">{isFetching ? '새로고침 중...' : `${data.length}건`}</span>
      </div>

      {!data.length ? (
        <EmptyState emoji="s" message="현재 범위에서 규칙 조정 제안이 없습니다." className="py-8" />
      ) : (
        <table className="min-w-[860px] w-full text-sm">
          <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
            <tr>
              <th className="px-3 py-2 text-left">규칙</th>
              <th className="px-3 py-2 text-left">현재값</th>
              <th className="px-3 py-2 text-left">제안</th>
              <th className="px-3 py-2 text-left">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((item) => {
              const badge = suggestionBadge(item.suggestion)
              return (
                <tr key={`${item.rule_id}-${item.suggestion}`}>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-[#64748b]">{item.rule_code || '-'}</div>
                    <div>{item.rule_name || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-[#0f1f3d]">
                    <div>레벨: {item.current_level || '-'}</div>
                    <div>심각도: {item.current_severity || '-'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={badge.className}>{badge.label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[#0f1f3d]">{item.detail}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

