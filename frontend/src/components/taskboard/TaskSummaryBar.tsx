import type { TaskBoardSummary } from '../../lib/api'
import { formatDuration } from '../../lib/format'

interface TaskSummaryBarProps {
  summary?: TaskBoardSummary | null
  onClickOverdue: () => void
  onClickToday: () => void
  onClickThisWeek: () => void
  onClickCompletedToday: () => void
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

function StatButton({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: number
  tone: 'danger' | 'primary' | 'accent' | 'success'
  onClick: () => void
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-[#d6c3c5] bg-[#f1e8e9] text-[#73585c]'
      : tone === 'success'
        ? 'border-[#bed7c9] bg-[#eef6f2] text-[#1f5b45]'
        : tone === 'accent'
          ? 'border-[#bfcff0] bg-[#eef4ff] text-[#1a3660]'
          : 'border-[#d8e5fb] bg-[#f5f9ff] text-[#0f1f3d]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-1.5 py-1 text-left transition-colors hover:bg-white ${toneClass}`}
    >
      <p className="text-[9px] font-semibold">{label}</p>
      <p className="mt-0.5 text-xs font-bold">{value}건</p>
    </button>
  )
}

export default function TaskSummaryBar({
  summary,
  onClickOverdue,
  onClickToday,
  onClickThisWeek,
  onClickCompletedToday,
}: TaskSummaryBarProps) {
  const value = summary || EMPTY_SUMMARY

  return (
    <section className="rounded-xl border border-[#d8e5fb] bg-white px-2 py-1.5 shadow-sm">
      <div className="flex flex-col gap-1 lg:flex-row lg:items-stretch">
        <div className="grid flex-1 grid-cols-2 gap-1 sm:grid-cols-4">
          <StatButton label="지연" value={value.overdue_count} tone="danger" onClick={onClickOverdue} />
          <StatButton label="오늘" value={value.today_count} tone="primary" onClick={onClickToday} />
          <StatButton label="이번 주" value={value.this_week_count} tone="accent" onClick={onClickThisWeek} />
          <StatButton label="오늘 완료" value={value.completed_today_count} tone="success" onClick={onClickCompletedToday} />
        </div>
        <div className="rounded-md border border-[#d8e5fb] bg-[#f5f9ff] px-2 py-1 lg:min-w-[250px]">
          <div className="flex items-center justify-between text-[9px] font-semibold text-[#1a3660]">
            <span>진척률(업무)</span>
            <span>{value.progress_count_pct}%</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-[#d8e5fb]">
            <div className="h-1 rounded-full bg-[#558ef8]" style={{ width: `${value.progress_count_pct}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] text-[#64748b]">
            <span>진척률(시간) {value.progress_time_pct}%</span>
            <span>{formatDuration(value.completed_estimated_minutes)} / {formatDuration(value.total_estimated_minutes)}</span>
          </div>
          <p className="mt-1 text-[9px] font-medium text-[#0f1f3d]">업무 점수 {value.work_score}점</p>
        </div>
      </div>
    </section>
  )
}
