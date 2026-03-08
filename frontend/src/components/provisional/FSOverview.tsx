import { useQuery } from '@tanstack/react-query'

import SectionScaffold from '../common/page/SectionScaffold'
import { fetchProvisionalFSOverview, type ProvisionalFSOverviewItem } from '../../lib/api'
import { formatKRW } from '../../lib/labels'

function statusLabel(item: ProvisionalFSOverviewItem): string {
  if (item.status === 'confirmed') return '확정 완료'
  if (item.status === 'needs_mapping') return '수동 매핑 필요'
  if (item.status === 'not_started') return '미입력'
  if (item.status === 'draft') return '가결산 초안'
  if (item.status === 'ready') return '생성 가능'
  return item.status
}

function statusTone(status: string): 'default' | 'warning' | 'success' {
  if (status === 'confirmed') return 'success'
  if (status === 'needs_mapping') return 'warning'
  return 'default'
}

export default function FSOverview({ yearMonth }: { yearMonth: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['provisionalFsOverview', yearMonth],
    queryFn: () => fetchProvisionalFSOverview(yearMonth),
    enabled: yearMonth.length === 7,
  })

  if (isLoading) {
    return (
      <SectionScaffold title="전체 조합 가결산 현황" description="조합별 진행 상태와 자산 규모를 같은 표에서 비교합니다.">
        <p className="text-sm text-[#64748b]">전체 조합 현황을 불러오는 중입니다.</p>
      </SectionScaffold>
    )
  }

  if (!data || !data.items.length) {
    return (
      <SectionScaffold title="전체 조합 가결산 현황" description="조합별 진행 상태와 자산 규모를 같은 표에서 비교합니다.">
        <div className="finance-empty">전체 가결산 현황 데이터가 없습니다.</div>
      </SectionScaffold>
    )
  }

  return (
    <SectionScaffold
      title="전체 조합 가결산 현황"
      description="조합별 진행 상태와 자산 규모를 같은 표에서 비교합니다."
      actions={
        <div className="finance-inline-summary">
          <span className="finance-summary-chip">확정 {data.summary.confirmed_count}/{data.summary.fund_count}</span>
          <span className="finance-summary-chip">수동 매핑 {data.summary.needs_mapping_count}</span>
          <span className="finance-summary-chip">미입력 {data.summary.not_started_count}</span>
        </div>
      }
    >
      <div className="compact-table-wrap">
        <table className="min-w-[820px] w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="table-head-cell">조합</th>
              <th className="table-head-cell text-center">상태</th>
              <th className="table-head-cell text-right">자산총계</th>
              <th className="table-head-cell text-right">입출금</th>
              <th className="table-head-cell text-right">미매핑</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.fund_id}>
                <td className="table-body-cell font-medium text-[#0f1f3d]">{item.fund_name}</td>
                <td className="table-body-cell text-center">
                  <span className={`finance-status-pill finance-status-${statusTone(item.status)}`}>{statusLabel(item)}</span>
                </td>
                <td className="table-body-cell text-right font-data">{item.total_assets == null ? '-' : formatKRW(item.total_assets)}</td>
                <td className="table-body-cell text-right font-data">{item.bank_txn_count}건</td>
                <td className="table-body-cell text-right font-data">{item.unmapped_count}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionScaffold>
  )
}
