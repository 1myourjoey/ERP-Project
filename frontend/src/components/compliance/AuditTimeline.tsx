import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import { type ComplianceDashboardRecentCheckItem } from '../../lib/api'

type AuditTimelineProps = {
  rows: ComplianceDashboardRecentCheckItem[]
  isLoading?: boolean
  maxItems?: number
}

function resultClass(result: string): string {
  if (result === 'pass') return 'tag tag-green'
  if (result === 'warning') return 'tag tag-amber'
  if (result === 'fail' || result === 'error') return 'tag tag-red'
  return 'tag tag-gray'
}

function timelineDotClass(result: string): string {
  if (result === 'pass') return 'border-green-300 bg-green-100'
  if (result === 'warning') return 'border-amber-300 bg-amber-100'
  if (result === 'fail' || result === 'error') return 'border-red-300 bg-red-100'
  return 'border-[#bfcff0] bg-[#fff7d6]'
}

function checkedAtLabel(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

export default function AuditTimeline({ rows, isLoading = false, maxItems = 15 }: AuditTimelineProps) {
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
        <EmptyState emoji="t" message="감사 타임라인 기록이 없습니다." className="py-8" />
      </div>
    )
  }

  return (
    <div className="card-base">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#0f1f3d]">감사 타임라인</h3>
        <span className="text-xs text-[#64748b]">최근 {Math.min(maxItems, rows.length)}건 점검</span>
      </div>

      <div className="relative space-y-3 before:absolute before:left-[9px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-[#d8e5fb]">
        {rows.slice(0, maxItems).map((row) => (
          <div key={row.id} className="relative pl-7">
            <span
              className={`absolute left-0 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border ${timelineDotClass(row.result)}`}
            />
            <div className="rounded-xl border border-[#d8e5fb] bg-white/70 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0f1f3d]">
                    {row.fund_name || `조합 #${row.fund_id}`} | {row.rule_name || row.rule_code || `규칙 #${row.rule_id}`}
                  </p>
                  <p className="mt-1 text-xs text-[#64748b]">
                    {checkedAtLabel(row.checked_at)} | {row.trigger_type || '-'} / {row.trigger_source || '-'}
                  </p>
                </div>
                <span className={resultClass(row.result)}>{row.result.toUpperCase()}</span>
              </div>
              {row.detail && <p className="mt-2 text-xs text-[#0f1f3d]">{row.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


