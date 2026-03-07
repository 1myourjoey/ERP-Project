import type { TaskBoardSummary } from '../../lib/api'

type BoardView = 'board' | 'calendar' | 'pipeline'

interface TaskTopControlStripProps {
  boardView: BoardView
  onChangeBoardView: (view: BoardView) => void
  summary?: TaskBoardSummary | null
  onClickAll: () => void
  onClickOverdue: () => void
  onClickToday: () => void
  onClickThisWeek: () => void
}

const EMPTY_SUMMARY: TaskBoardSummary = {
  overdue_count: 0,
  today_count: 0,
  this_week_count: 0,
  completed_today_count: 0,
  total_pending_count: 0,
  total_estimated_minutes: 0,
  completed_estimated_minutes: 0,
  stale_count: 0,
  work_score: 0,
  progress_count_pct: 0,
  progress_time_pct: 0,
}

function SummaryChip({
  label,
  value,
  onClick,
  tone = 'default',
}: {
  label: string
  value: number | string
  onClick?: () => void
  tone?: 'default' | 'danger' | 'accent' | 'success'
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-[#bfa5a7] bg-[#f1e8e9] text-[#3b1219]'
      : tone === 'success'
        ? 'border-[#b9d7ca] bg-[#eef6f2] text-[#1a5a44]'
        : tone === 'accent'
          ? 'border-[#b7caf2] bg-[#eef4ff] text-[#163a73]'
          : 'border-[#c8daf8] bg-[#f5f9ff] text-[#0f1f3d]'

  const content = (
    <span className="inline-flex w-full items-center justify-between gap-1.5 whitespace-nowrap">
      <span className="text-[11px] font-semibold leading-none tracking-[-0.01em]">{label}</span>
      <span className="font-data inline-flex min-w-[22px] items-center justify-center rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#0f1f3d]">
        {value}
      </span>
    </span>
  )

  if (!onClick) {
    return (
      <span
        className={`inline-flex h-8 min-w-[70px] items-center rounded-md border px-2.5 text-[11px] font-medium leading-none ${toneClass}`}
      >
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 min-w-[70px] items-center rounded-md border px-2.5 text-[11px] font-medium leading-none transition-all duration-150 hover:bg-white hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#558ef8]/45 focus-visible:ring-offset-1 ${toneClass}`}
    >
      {content}
    </button>
  )
}

export default function TaskTopControlStrip({
  boardView,
  onChangeBoardView,
  summary,
  onClickAll,
  onClickOverdue,
  onClickToday,
  onClickThisWeek,
}: TaskTopControlStripProps) {
  const value = summary || EMPTY_SUMMARY

  return (
    <section className="rounded-xl border border-[#d8e5fb] bg-white px-2.5 py-1.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <SummaryChip label="전체" value={value.total_pending_count} onClick={onClickAll} />
          <SummaryChip label="지연" value={value.overdue_count} onClick={onClickOverdue} tone="danger" />
          <SummaryChip label="오늘" value={value.today_count} onClick={onClickToday} />
          <SummaryChip label="이번주" value={value.this_week_count} onClick={onClickThisWeek} tone="accent" />
          <SummaryChip label="오늘진척" value={`${value.progress_count_pct}%`} />
        </div>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-1">
          <div className="flex shrink-0 gap-1 rounded-lg bg-[#f5f9ff] p-0.5">
            <button
              type="button"
              onClick={() => onChangeBoardView('board')}
              className={`tab-btn h-8 rounded-md px-2.5 !py-0 text-[11px] font-semibold leading-none ${boardView === 'board' ? 'active bg-white shadow-sm' : ''}`}
            >
              보드
            </button>
            <button
              type="button"
              onClick={() => onChangeBoardView('calendar')}
              className={`tab-btn h-8 rounded-md px-2.5 !py-0 text-[11px] font-semibold leading-none ${boardView === 'calendar' ? 'active bg-white shadow-sm' : ''}`}
            >
              캘린더
            </button>
            <button
              type="button"
              onClick={() => onChangeBoardView('pipeline')}
              className={`tab-btn h-8 rounded-md px-2.5 !py-0 text-[11px] font-semibold leading-none ${boardView === 'pipeline' ? 'active bg-white shadow-sm' : ''}`}
            >
              파이프라인
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
