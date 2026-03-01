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
          <h3 className="text-sm font-semibold text-gray-800">Remediation Tracker</h3>
          <span className="text-xs text-gray-500">{isFetching ? 'Refreshing...' : 'Task-linked checks'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-lg font-semibold text-gray-800">{stats.total_tasks}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Completed</p>
            <p className="text-lg font-semibold text-green-700">{stats.completed}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Pending</p>
            <p className="text-lg font-semibold text-amber-700">{stats.pending}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Completion Rate</p>
            <p className="text-lg font-semibold text-gray-800">{stats.completion_rate}%</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Avg Resolution</p>
            <p className="text-lg font-semibold text-gray-800">{stats.avg_resolution_days} day(s)</p>
          </div>
        </div>
      </div>

      <div className="card-base overflow-auto">
        <h4 className="mb-2 text-sm font-semibold text-gray-800">Overdue Tasks</h4>
        {!stats.overdue_tasks.length ? (
          <EmptyState emoji="o" message="No overdue remediation task." className="py-8" />
        ) : (
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Task</th>
                <th className="px-3 py-2 text-left">Rule</th>
                <th className="px-3 py-2 text-left">Days Open</th>
                <th className="px-3 py-2 text-left">Deadline</th>
                <th className="px-3 py-2 text-left">Checked At</th>
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
