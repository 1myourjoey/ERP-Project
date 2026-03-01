import { useQuery } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import {
  fetchComplianceRemediationStats,
  type ComplianceRemediationStatsResponse,
} from '../../lib/api'

type RemediationTrackerProps = {
  fundId: number | ''
}

export default function RemediationTracker({ fundId }: RemediationTrackerProps) {
  const { data, isLoading, isFetching } = useQuery<ComplianceRemediationStatsResponse>({
    queryKey: ['complianceHistoryRemediation', fundId],
    queryFn: () =>
      fetchComplianceRemediationStats({
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

  const stats = data ?? {
    fund_id: fundId === '' ? null : fundId,
    total_tasks: 0,
    completed: 0,
    pending: 0,
    completion_rate: 0,
    avg_resolution_days: 0,
    overdue_tasks: [],
  }

  return (
    <div className="space-y-3">
      <div className="card-base">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">시정조치 추적</h3>
          <span className="text-xs text-gray-500">{isFetching ? '새로고침 중...' : '업무 연동 점검'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">전체</p>
            <p className="text-lg font-semibold text-gray-800">{stats.total_tasks}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">완료</p>
            <p className="text-lg font-semibold text-green-700">{stats.completed}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">미완료</p>
            <p className="text-lg font-semibold text-amber-700">{stats.pending}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">완료율</p>
            <p className="text-lg font-semibold text-gray-800">{stats.completion_rate}%</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">평균 소요일</p>
            <p className="text-lg font-semibold text-gray-800">{stats.avg_resolution_days}일</p>
          </div>
        </div>
      </div>

      <div className="card-base overflow-auto">
        <h4 className="mb-2 text-sm font-semibold text-gray-800">기한 초과 업무</h4>
        {!stats.overdue_tasks.length ? (
          <EmptyState emoji="o" message="기한 초과된 시정조치 업무가 없습니다." className="py-8" />
        ) : (
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">업무</th>
                <th className="px-3 py-2 text-left">규칙</th>
                <th className="px-3 py-2 text-left">경과일</th>
                <th className="px-3 py-2 text-left">기한</th>
                <th className="px-3 py-2 text-left">점검 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.overdue_tasks.map((row) => (
                <tr key={`${row.task_id}-${row.rule_id ?? 'no-rule'}`}>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-gray-500">#{row.task_id}</div>
                    <div>{row.task_title || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.rule_name || '-'}</td>
                  <td className="px-3 py-2 text-red-700 font-semibold">{row.days_open}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {row.deadline ? new Date(row.deadline).toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {row.checked_at ? new Date(row.checked_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
