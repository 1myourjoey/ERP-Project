import type { ActiveWorkflow } from '../../lib/api'
import { formatDate } from '../../lib/format'

interface ActiveWorkflowsProps {
  workflows: ActiveWorkflow[]
  onNavigate: (path: string) => void
}

function parseProgress(value: string | null | undefined): { done: number; total: number; pct: number } {
  if (!value) return { done: 0, total: 0, pct: 0 }
  const [doneText, totalText] = value.split('/')
  const done = Number(doneText || 0)
  const total = Number(totalText || 0)
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) {
    return { done: 0, total: 0, pct: 0 }
  }
  return { done, total, pct: Math.max(0, Math.min(100, Math.round((done / total) * 100))) }
}

export default function ActiveWorkflows({ workflows, onNavigate }: ActiveWorkflowsProps) {
  return (
    <section className="card-base min-h-[320px] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0f1f3d]">진행 워크플로</h3>
        <span className="text-xs text-[#64748b]">{workflows.length}건</span>
      </div>

      <div className="mt-3 space-y-2">
        {workflows.length === 0 && <p className="text-xs text-[#64748b]">진행 중인 워크플로가 없습니다.</p>}
        {workflows.slice(0, 4).map((workflow) => {
          const progress = parseProgress(workflow.progress)
          return (
            <button
              key={workflow.id}
              type="button"
              className="w-full rounded-lg border border-[#e4e7ee] px-2.5 py-2 text-left hover:bg-[#f5f9ff]"
              onClick={() => onNavigate('/workflows')}
            >
              <p className="truncate text-xs font-medium text-[#0f1f3d]">{workflow.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-[#64748b]">
                {workflow.fund_name || workflow.gp_entity_name || '공통'} · {workflow.next_step || '다음 단계 대기'}
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#d8e5fb]">
                <div className="h-1.5 rounded-full bg-[#558ef8]" style={{ width: `${progress.pct}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#64748b]">
                <span>{progress.done}/{progress.total}</span>
                <span>{workflow.next_step_date ? formatDate(workflow.next_step_date, 'short') : '-'}</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-[#1a3660] hover:text-[#558ef8]"
          onClick={() => onNavigate('/workflows')}
        >
          워크플로 →
        </button>
      </div>
    </section>
  )
}
