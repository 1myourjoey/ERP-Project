import type { DashboardFundSnapshotItem, DashboardFundsSnapshotResponse } from '../../lib/api'
import { formatKRW } from '../../lib/format'

interface FundSnapshotProps {
  rows: DashboardFundSnapshotItem[]
  totals: DashboardFundsSnapshotResponse['totals']
  onOpenFund: (fundId: number) => void
  onOpenFunds: () => void
}

function complianceBadge(status: DashboardFundSnapshotItem['compliance_status']): string {
  if (status === 'danger') return '위험'
  if (status === 'warning') return '주의'
  return '정상'
}

function complianceColor(status: DashboardFundSnapshotItem['compliance_status']): string {
  if (status === 'danger') return 'text-[#0f1f3d]'
  if (status === 'warning') return 'text-[#7b5f62]'
  return 'text-[#1a3660]'
}

export default function FundSnapshot({ rows, totals, onOpenFund, onOpenFunds }: FundSnapshotProps) {
  return (
    <section className="card-base h-full min-h-[420px] p-3">
      <h3 className="text-sm font-semibold text-[#0f1f3d]">펀드 현황</h3>
      <div className="mt-2 overflow-hidden rounded-lg border border-[#e4e7ee]">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-[#f5f9ff] text-[#64748b]">
            <tr>
              <th className="px-2 py-1.5 text-left">펀드명</th>
              <th className="px-2 py-1.5 text-right">NAV</th>
              <th className="px-2 py-1.5 text-right">LP</th>
              <th className="px-2 py-1.5 text-right">출자율</th>
              <th className="px-2 py-1.5 text-center">컴플</th>
              <th className="px-2 py-1.5 text-right">서류</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-[#e4e7ee] hover:bg-[#f5f9ff]"
                onClick={() => onOpenFund(row.id)}
              >
                <td className="truncate px-2 py-1.5 font-medium text-[#0f1f3d]">{row.name}</td>
                <td className="px-2 py-1.5 text-right text-[#0f1f3d]">{formatKRW(row.nav, 'eok')}</td>
                <td className="px-2 py-1.5 text-right text-[#64748b]">{row.lp_count}</td>
                <td className="px-2 py-1.5 text-right text-[#64748b]">{row.contribution_rate == null ? '-' : `${row.contribution_rate}%`}</td>
                <td className={`px-2 py-1.5 text-center font-semibold ${complianceColor(row.compliance_status)}`}>
                  {complianceBadge(row.compliance_status)}
                </td>
                <td className="px-2 py-1.5 text-right text-[#64748b]">{row.missing_documents}건</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-[#64748b]">
                  표시할 펀드가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-[#c5d8fb] bg-[#f5f9ff] font-semibold text-[#0f1f3d]">
            <tr>
              <td className="px-2 py-1.5">합계</td>
              <td className="px-2 py-1.5 text-right">{formatKRW(totals.total_nav, 'eok')}</td>
              <td className="px-2 py-1.5 text-right">{totals.total_lp_count}</td>
              <td className="px-2 py-1.5 text-right">-</td>
              <td className="px-2 py-1.5 text-center">-</td>
              <td className="px-2 py-1.5 text-right">{totals.total_missing_documents}건</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-[#1a3660] hover:text-[#558ef8]"
          onClick={onOpenFunds}
        >
          펀드 목록 →
        </button>
      </div>
    </section>
  )
}
