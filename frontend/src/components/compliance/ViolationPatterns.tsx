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
        <EmptyState emoji="p" message="위반 패턴 분석을 위해 조합을 선택해주세요." className="py-8" />
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
          <h3 className="text-sm font-semibold text-slate-800">위반 패턴 분석</h3>
          <span className="text-xs text-slate-500">
            {isFetching ? '새로고침 중...' : `분석 구간: 최근 ${months}개월`}
          </span>
        </div>

        {!recurring.length && !improving.length && !worsening.length ? (
          <EmptyState emoji="v" message="해당 기간에 반복 위반 패턴이 없습니다." className="py-8" />
        ) : (
          <div className="space-y-2">
            {recurring.map((item) => (
              <div key={`${item.rule_id}-${item.rule_code}`} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {item.rule_name || item.rule_code || `규칙 #${item.rule_id}`}
                  </div>
                  <span className="tag tag-red">{item.violation_count}회 위반</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">발생 월: {monthLabel(item.months_violated)}</p>
                <p className="mt-1 text-xs text-slate-600">패턴: {item.pattern}</p>
                <p className="mt-2 text-xs text-slate-700">권고: {item.recommendation}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="card-base">
          <h4 className="mb-2 text-sm font-semibold text-green-700">개선 구간</h4>
          {!improving.length ? (
            <p className="text-xs text-slate-500">개선 추이가 감지되지 않았습니다.</p>
          ) : (
            <div className="space-y-2">
              {improving.map((item) => (
                <div key={`improving-${item.rule_id}`} className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-800">
                  <p className="font-medium">{item.rule_name || item.rule_code || `규칙 #${item.rule_id}`}</p>
                  <p>
                    {item.early_period_violations}
                    {' -> '}
                    {item.recent_period_violations} (변화 {item.delta})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-base">
          <h4 className="mb-2 text-sm font-semibold text-red-700">악화 구간</h4>
          {!worsening.length ? (
            <p className="text-xs text-slate-500">악화 추이가 감지되지 않았습니다.</p>
          ) : (
            <div className="space-y-2">
              {worsening.map((item) => (
                <div key={`worsening-${item.rule_id}`} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <p className="font-medium">{item.rule_name || item.rule_code || `규칙 #${item.rule_id}`}</p>
                  <p>
                    {item.early_period_violations}
                    {' -> '}
                    {item.recent_period_violations} (변화 +{item.delta})
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

