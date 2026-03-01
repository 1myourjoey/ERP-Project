import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import { useToast } from '../../contexts/ToastContext'
import {
  downloadComplianceMonthlyReport,
  fetchComplianceMonthlyReport,
  type ComplianceMonthlyReportResponse,
} from '../../lib/api'

type MonthlyReportProps = {
  fundId: number | ''
  yearMonth: string
}

function canQuery(fundId: number | '', yearMonth: string): boolean {
  return fundId !== '' && /^\d{4}-\d{2}$/.test(yearMonth)
}

export default function MonthlyReport({ fundId, yearMonth }: MonthlyReportProps) {
  const { addToast } = useToast()
  const enabled = canQuery(fundId, yearMonth)

  const queryParams = useMemo(
    () => ({ fund_id: Number(fundId), year_month: yearMonth }),
    [fundId, yearMonth],
  )

  const { data, isLoading, isFetching, refetch } = useQuery<ComplianceMonthlyReportResponse>({
    queryKey: ['complianceMonthlyReport', fundId, yearMonth],
    queryFn: () => fetchComplianceMonthlyReport(queryParams),
    enabled,
  })

  async function onDownload() {
    if (!enabled) {
      addToast('warning', 'Select a fund and a valid year-month first.')
      return
    }

    try {
      const blob = await downloadComplianceMonthlyReport(queryParams)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `compliance-report-${queryParams.fund_id}-${queryParams.year_month}.txt`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
      addToast('success', 'Monthly report downloaded.')
    } catch {
      addToast('error', 'Failed to download monthly report.')
    }
  }

  if (!enabled) {
    return (
      <div className="card-base">
        <EmptyState emoji="m" message="Select a fund and year-month to generate a monthly report." className="py-8" />
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

  if (!data) {
    return (
      <div className="card-base">
        <EmptyState emoji="r" message="No monthly report data found." className="py-8" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="card-base">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Monthly Compliance Report</h3>
            <p className="mt-1 text-xs text-gray-500">
              {data.fund_name} | {data.period}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="secondary-btn btn-sm" onClick={() => refetch()}>
              {isFetching ? 'Refreshing...' : 'Generate'}
            </button>
            <button className="primary-btn btn-sm" onClick={onDownload}>
              Download TXT
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Total Checks</p>
            <p className="text-lg font-semibold text-gray-800">{data.summary.total_checks}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Pass</p>
            <p className="text-lg font-semibold text-green-700">{data.summary.pass}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Fail/Error</p>
            <p className="text-lg font-semibold text-red-700">{data.summary.fail}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">Warning</p>
            <p className="text-lg font-semibold text-amber-700">{data.summary.warning}</p>
          </div>
        </div>
      </div>

      <div className="card-base">
        <h4 className="mb-2 text-sm font-semibold text-gray-800">Trend vs Previous Month</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-green-100 bg-green-50 p-2 text-xs text-green-800">
            Improved: <span className="font-semibold">{data.trend_vs_last_month.improved}</span>
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-xs text-red-800">
            Worsened: <span className="font-semibold">{data.trend_vs_last_month.worsened}</span>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
            Unchanged: <span className="font-semibold">{data.trend_vs_last_month.unchanged}</span>
          </div>
        </div>
      </div>

      <div className="card-base overflow-auto">
        <h4 className="mb-2 text-sm font-semibold text-gray-800">Violations</h4>
        {!data.violations.length ? (
          <p className="text-xs text-gray-500">No violations in this month.</p>
        ) : (
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Rule</th>
                <th className="px-3 py-2 text-left">Result</th>
                <th className="px-3 py-2 text-left">Detail</th>
                <th className="px-3 py-2 text-left">Checked At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.violations.map((row) => (
                <tr key={row.check_id}>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-gray-500">{row.rule_code || '-'}</div>
                    <div>{row.rule_name || '-'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="tag tag-red">{row.result || '-'}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{row.detail || '-'}</td>
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
