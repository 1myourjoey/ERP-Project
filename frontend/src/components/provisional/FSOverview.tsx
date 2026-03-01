import { useQuery } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
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

function statusClass(status: string): string {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'needs_mapping') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'not_started') return 'bg-gray-100 text-gray-600 border-gray-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

export default function FSOverview({ yearMonth }: { yearMonth: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['provisionalFsOverview', yearMonth],
    queryFn: () => fetchProvisionalFSOverview(yearMonth),
    enabled: yearMonth.length === 7,
  })

  if (isLoading) {
    return (
      <div className="card-base p-4">
        <p className="text-sm text-gray-500">전체 조합 현황을 불러오는 중...</p>
      </div>
    )
  }

  if (!data || !data.items.length) {
    return (
      <div className="card-base p-4">
        <EmptyState emoji="📊" message="전체 가결산 현황 데이터가 없습니다." className="py-8" />
      </div>
    )
  }

  return (
    <div className="card-base p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">전체 조합 가결산 현황</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
            확정 {data.summary.confirmed_count}/{data.summary.fund_count}
          </span>
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
            수동매핑 {data.summary.needs_mapping_count}
          </span>
          <span className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-gray-700">
            미입력 {data.summary.not_started_count}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {data.items.map((item) => (
          <div key={item.fund_id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-gray-800">{item.fund_name}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(item.status)}`}>
                {statusLabel(item)}
              </span>
            </div>
            <div className="space-y-1 text-xs text-gray-600">
              <p>자산: {item.total_assets == null ? '-' : formatKRW(item.total_assets)}</p>
              <p>입출금: {item.bank_txn_count}건</p>
              <p>미매핑: {item.unmapped_count}건</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
