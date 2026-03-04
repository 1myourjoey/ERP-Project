import type { Task } from '../../lib/api'

interface CompletedTasksSectionProps {
  tasks: Task[]
  open: boolean
  onToggle: () => void
  onUndo: (taskId: number) => void
  undoPending: boolean
}

export default function CompletedTasksSection({
  tasks,
  open,
  onToggle,
  onUndo,
  undoPending,
}: CompletedTasksSectionProps) {
  return (
    <section className="rounded-xl border border-[#d8e5fb] bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <p className="text-sm font-semibold text-[#0f1f3d]">오늘 완료 ({tasks.length}건)</p>
        <span className="text-xs font-medium text-[#64748b]">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {tasks.length === 0 && (
            <p className="rounded-lg border border-dashed border-[#d8e5fb] px-3 py-3 text-xs text-[#64748b]">
              오늘 완료된 업무가 없습니다.
            </p>
          )}
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#0f1f3d]">{task.title}</p>
                <p className="text-[11px] text-[#64748b]">
                  {task.actual_time || task.estimated_time || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onUndo(task.id)}
                disabled={undoPending}
                className="btn-sm rounded-lg border border-[#d8e5fb] bg-white px-3 py-1.5 text-xs font-medium text-[#1a3660] hover:bg-[#eef4ff] disabled:opacity-60"
              >
                되돌리기
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
