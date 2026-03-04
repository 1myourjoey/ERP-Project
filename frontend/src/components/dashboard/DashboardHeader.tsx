interface DashboardHeaderProps {
  dateLabel: string
  overallScore: number
  onOpenTaskBoard: () => void
  onOpenCalendar: () => void
}

function scoreWidth(score: number): string {
  const safe = Math.max(0, Math.min(100, score || 0))
  return `${safe}%`
}

export default function DashboardHeader({
  dateLabel,
  overallScore,
  onOpenTaskBoard,
  onOpenCalendar,
}: DashboardHeaderProps) {
  return (
    <section className="card-base flex min-h-[44px] flex-wrap items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 items-center gap-4">
        <h2 className="truncate text-sm font-semibold text-[#0f1f3d]">{dateLabel}</h2>
        <div className="flex min-w-[220px] items-center gap-2 text-xs">
          <span className="text-[#64748b]">전체 건강</span>
          <div className="h-2 flex-1 rounded-full bg-[#d8e5fb]">
            <div
              className="h-2 rounded-full bg-[#558ef8] transition-all"
              style={{ width: scoreWidth(overallScore) }}
            />
          </div>
          <span className="font-semibold text-[#0f1f3d]">{overallScore}점</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="primary-btn btn-sm" onClick={onOpenTaskBoard}>
          +업무
        </button>
        <button type="button" className="secondary-btn btn-sm" onClick={onOpenCalendar}>
          캘린더
        </button>
      </div>
    </section>
  )
}
