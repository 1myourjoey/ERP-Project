import type { DashboardDeadlineItem } from '../../lib/api'
import { formatDate } from '../../lib/format'

interface ReportDocDeadlinesProps {
  weekDeadlines: DashboardDeadlineItem[]
  onNavigate: (path: string) => void
}

function ddayText(days: number | null): string {
  if (days == null) return '-'
  if (days < 0) return `D+${Math.abs(days)}`
  if (days === 0) return 'D-day'
  return `D-${days}`
}

function ddayColor(days: number | null): string {
  if (days == null) return 'text-[#94a3b8]'
  if (days < 0) return 'text-[#0f1f3d]'
  if (days <= 3) return 'text-[#624100]'
  return 'text-[#64748b]'
}

export default function ReportDocDeadlines({ weekDeadlines, onNavigate }: ReportDocDeadlinesProps) {
  const reportRows = weekDeadlines.filter((row) => row.type === 'report').slice(0, 3)
  const documentRows = weekDeadlines.filter((row) => row.type === 'document').slice(0, 3)

  return (
    <section className="card-base min-h-[320px] p-3">
      <h3 className="text-sm font-semibold text-[#0f1f3d]">보고/서류 마감</h3>

      <div className="mt-3">
        <p className="text-xs font-semibold text-[#64748b]">보고</p>
        <div className="mt-1 space-y-1.5">
          {reportRows.length === 0 && <p className="text-xs text-[#64748b]">이번 주 보고 마감이 없습니다.</p>}
          {reportRows.map((row) => (
            <button
              key={`report-${row.id}`}
              type="button"
              className="flex w-full items-center justify-between rounded border border-[#e4e7ee] px-2.5 py-1.5 text-left hover:bg-[#f5f9ff]"
              onClick={() => onNavigate('/reports')}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[#0f1f3d]">{row.title}</p>
                <p className="text-[11px] text-[#64748b]">{row.due_date ? formatDate(row.due_date, 'short') : '-'}</p>
              </div>
              <span className={`ml-2 shrink-0 text-xs font-semibold ${ddayColor(row.days_remaining)}`}>
                {ddayText(row.days_remaining)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-[#64748b]">서류</p>
        <div className="mt-1 space-y-1.5">
          {documentRows.length === 0 && <p className="text-xs text-[#64748b]">이번 주 서류 마감이 없습니다.</p>}
          {documentRows.map((row) => (
            <button
              key={`doc-${row.id}`}
              type="button"
              className="flex w-full items-center justify-between rounded border border-[#e4e7ee] px-2.5 py-1.5 text-left hover:bg-[#f5f9ff]"
              onClick={() => onNavigate('/documents')}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[#0f1f3d]">{row.title}</p>
                <p className="truncate text-[11px] text-[#64748b]">{row.context || '-'}</p>
              </div>
              <span className={`ml-2 shrink-0 text-xs font-semibold ${ddayColor(row.days_remaining)}`}>
                {ddayText(row.days_remaining)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-[#1a3660] hover:text-[#558ef8]"
          onClick={() => onNavigate('/documents')}
        >
          서류 현황 →
        </button>
      </div>
    </section>
  )
}
