import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import { type ComplianceDashboardFundStatusItem } from '../../lib/api'

type FundComplianceGridProps = {
  rows: ComplianceDashboardFundStatusItem[]
  isLoading?: boolean
  selectedFundId?: number | ''
  onSelectFund?: (fundId: number) => void
}

function rateClass(rate: number): string {
  if (rate >= 95) return 'tag tag-green'
  if (rate >= 80) return 'tag tag-blue'
  if (rate >= 60) return 'tag tag-amber'
  return 'tag tag-red'
}

function lastCheckedLabel(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

export default function FundComplianceGrid({
  rows,
  isLoading = false,
  selectedFundId = '',
  onSelectFund,
}: FundComplianceGridProps) {
  if (isLoading) {
    return (
      <div className="card-base">
        <PageLoading />
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="card-base">
        <EmptyState emoji="f" message="조합 준수 현황 데이터가 없습니다." className="py-8" />
      </div>
    )
  }

  return (
    <div className="card-base overflow-auto">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">조합별 준수 현황</h3>
        <span className="text-xs text-gray-500">{rows.length}개 조합</span>
      </div>

      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">조합</th>
            <th className="px-3 py-2 text-left">점검 규칙 수</th>
            <th className="px-3 py-2 text-left">준수율</th>
            <th className="px-3 py-2 text-left">위반 건수</th>
            <th className="px-3 py-2 text-left">마지막 점검</th>
            <th className="px-3 py-2 text-left">작업</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const violations = row.violation_count ?? row.failed
            const active = selectedFundId !== '' && Number(selectedFundId) === row.fund_id
            return (
              <tr key={row.fund_id} className={active ? 'bg-blue-50/70' : ''}>
                <td className="px-3 py-2 font-medium text-gray-800">{row.fund_name}</td>
                <td className="px-3 py-2 text-gray-700">{row.total_rules}</td>
                <td className="px-3 py-2">
                  <span className={rateClass(row.compliance_rate)}>{row.compliance_rate.toFixed(1)}%</span>
                </td>
                <td className="px-3 py-2">
                  <span className={violations > 0 ? 'tag tag-red' : 'tag tag-green'}>{violations}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{lastCheckedLabel(row.last_checked)}</td>
                <td className="px-3 py-2">
                  <button
                    className="secondary-btn btn-sm"
                    onClick={() => onSelectFund?.(row.fund_id)}
                    disabled={!onSelectFund}
                  >
                    점검 보기
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
