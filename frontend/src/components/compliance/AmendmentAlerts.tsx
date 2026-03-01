import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import { type ComplianceDashboardAmendmentAlert } from '../../lib/api'

type AmendmentAlertsProps = {
  rows: ComplianceDashboardAmendmentAlert[]
  isLoading?: boolean
}

function dDayBadge(daysRemaining: number | null): { label: string; className: string } {
  if (daysRemaining == null) return { label: '시행일 미지정', className: 'tag tag-gray' }
  if (daysRemaining < 0) return { label: `D+${Math.abs(daysRemaining)}`, className: 'tag tag-gray' }
  if (daysRemaining === 0) return { label: 'D-Day', className: 'tag tag-red' }
  if (daysRemaining <= 14) return { label: `D-${daysRemaining}`, className: 'tag tag-red' }
  if (daysRemaining <= 30) return { label: `D-${daysRemaining}`, className: 'tag tag-amber' }
  return { label: `D-${daysRemaining}`, className: 'tag tag-blue' }
}

function dateLabel(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString()
}

export default function AmendmentAlerts({ rows, isLoading = false }: AmendmentAlertsProps) {
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
        <EmptyState emoji="a" message="법령 개정 알림이 없습니다." className="py-8" />
      </div>
    )
  }

  return (
    <div className="card-base">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">법령 개정 알림</h3>
        <span className="text-xs text-gray-500">{rows.length}건</span>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const badge = dDayBadge(row.days_remaining)
          return (
            <div key={row.id} className="rounded-xl border border-gray-200 bg-white/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800">{row.law_name || '-'}</p>
                <span className={badge.className}>{badge.label}</span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                시행일: {dateLabel(row.effective_date)} {row.version ? `| ${row.version}` : ''}
              </p>
              <p className="mt-2 text-xs text-gray-700">{row.summary || '-'}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
