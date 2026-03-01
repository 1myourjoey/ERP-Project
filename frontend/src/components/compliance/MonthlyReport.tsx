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
      addToast('warning', '조합과 조회 월을 먼저 선택해주세요.')
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
      addToast('success', '월간 리포트를 다운로드했습니다.')
    } catch {
      addToast('error', '월간 리포트 다운로드에 실패했습니다.')
    }
  }

  if (!enabled) {
    return (
      <div className="card-base">
        <EmptyState emoji="m" message="조합과 조회 월을 선택하면 월간 리포트를 생성할 수 있습니다." className="py-8" />
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
        <EmptyState emoji="r" message="월간 리포트 데이터가 없습니다." className="py-8" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="card-base">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">월간 준법감시 리포트</h3>
            <p className="mt-1 text-xs text-gray-500">
              {data.fund_name} | {data.period}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="secondary-btn btn-sm" onClick={() => refetch()}>
              {isFetching ? '새로고침 중...' : '재생성'}
            </button>
            <button className="primary-btn btn-sm" onClick={onDownload}>
              TXT 다운로드
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">총 점검 수</p>
            <p className="text-lg font-semibold text-gray-800">{data.summary.total_checks}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">적합</p>
            <p className="text-lg font-semibold text-green-700">{data.summary.pass}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">위반/오류</p>
            <p className="text-lg font-semibold text-red-700">{data.summary.fail}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <p className="text-xs text-gray-500">경고</p>
            <p className="text-lg font-semibold text-amber-700">{data.summary.warning}</p>
          </div>
        </div>
      </div>

      <div className="card-base">
        <h4 className="mb-2 text-sm font-semibold text-gray-800">전월 대비 추이</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-green-100 bg-green-50 p-2 text-xs text-green-800">
            개선: <span className="font-semibold">{data.trend_vs_last_month.improved}</span>
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-xs text-red-800">
            악화: <span className="font-semibold">{data.trend_vs_last_month.worsened}</span>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
            동일: <span className="font-semibold">{data.trend_vs_last_month.unchanged}</span>
          </div>
        </div>
      </div>

      <div className="card-base overflow-auto">
        <h4 className="mb-2 text-sm font-semibold text-gray-800">위반 내역</h4>
        {!data.violations.length ? (
          <p className="text-xs text-gray-500">해당 월에 위반 내역이 없습니다.</p>
        ) : (
          <table className="min-w-[880px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">규칙</th>
                <th className="px-3 py-2 text-left">결과</th>
                <th className="px-3 py-2 text-left">상세</th>
                <th className="px-3 py-2 text-left">점검 시각</th>
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
