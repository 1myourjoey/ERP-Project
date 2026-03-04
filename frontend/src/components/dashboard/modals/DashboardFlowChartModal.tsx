import { memo, useEffect, useMemo, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'

import type { ActiveWorkflow, Task } from '../../../lib/api'
import { buildFlowStageSummaries, type FlowSeverity, type FlowStageKey } from '../flowStageModel'

interface DashboardFlowChartModalProps {
  open: boolean
  selectedStage: FlowStageKey
  onClose: () => void
  onSelectStage: (stage: FlowStageKey) => void
  onOpenPipeline: () => void
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  upcomingTasks: Task[]
  noDeadlineTasks: Task[]
  activeWorkflows: ActiveWorkflow[]
}

type SeverityStyle = {
  border: string
  bg: string
  title: string
  badge: string
}

const STYLES_BY_SEVERITY: Record<FlowSeverity, SeverityStyle> = {
  idle: {
    border: 'border-[#d8e5fb]',
    bg: 'bg-white',
    title: 'text-[#64748b]',
    badge: 'bg-[#f5f9ff] text-[#64748b]',
  },
  normal: {
    border: 'border-[#c5d8fb]',
    bg: 'bg-white',
    title: 'text-[#1a3660]',
    badge: 'bg-[#f5f9ff] text-[#1a3660]',
  },
  warning: {
    border: 'border-[#bfa5a7]',
    bg: 'bg-[#f1e8e9]',
    title: 'text-[#7b5f62]',
    badge: 'bg-white text-[#7b5f62]',
  },
  danger: {
    border: 'border-[#bfa5a7]',
    bg: 'bg-[#f1e8e9]',
    title: 'text-[#7b5f62]',
    badge: 'bg-white text-[#7b5f62]',
  },
}

function DashboardFlowChartModal({
  open,
  selectedStage,
  onClose,
  onSelectStage,
  onOpenPipeline,
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  upcomingTasks,
  noDeadlineTasks,
  activeWorkflows,
}: DashboardFlowChartModalProps) {
  const [hoveredStage, setHoveredStage] = useState<FlowStageKey | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const summaries = useMemo(
    () =>
      buildFlowStageSummaries({
        todayTasks,
        tomorrowTasks,
        thisWeekTasks,
        upcomingTasks,
        noDeadlineTasks,
        activeWorkflows,
        representativeLimit: 4,
      }),
    [todayTasks, tomorrowTasks, thisWeekTasks, upcomingTasks, noDeadlineTasks, activeWorkflows],
  )

  const selected = summaries.find((stage) => stage.key === selectedStage) || summaries[0]
  const hoveredIndex = summaries.findIndex((stage) => stage.key === hoveredStage)
  const selectedIndex = summaries.findIndex((stage) => stage.key === selected.key)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45" onClick={onClose}>
      <div
        className="max-h-[88vh] w-[min(1200px,95vw)] overflow-hidden rounded-2xl border border-[#d8e5fb] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e4e7ee] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[#0f1f3d]">전체 업무 플로우</h3>
            <p className="text-[11px] text-[#64748b]">노드를 선택하면 해당 단계를 강조합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#d8e5fb] bg-white p-1 text-[#64748b] hover:bg-[#f5f9ff]"
            aria-label="모달 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-[1140px] items-stretch gap-2 pr-1">
              {summaries.map((stage, index) => {
                const style = STYLES_BY_SEVERITY[stage.severity]
                const hiddenCount = Math.max(0, stage.totalCount - stage.representatives.length)
                const isSelected = stage.key === selected.key
                const isHovered = stage.key === hoveredStage

                return (
                  <div key={stage.key} className="contents">
                    <button
                      type="button"
                      onClick={() => onSelectStage(stage.key)}
                      onMouseEnter={() => setHoveredStage(stage.key)}
                      onMouseLeave={() => setHoveredStage(null)}
                      onFocus={() => setHoveredStage(stage.key)}
                      onBlur={() => setHoveredStage((prev) => (prev === stage.key ? null : prev))}
                      className={`min-h-[210px] min-w-[212px] max-w-[224px] flex-1 rounded-xl border p-2.5 text-left transition-colors hover:border-[#558ef8] ${style.border} ${style.bg} ${
                        isSelected ? 'ring-2 ring-[#558ef8]/55' : isHovered ? 'ring-1 ring-[#558ef8]/35' : ''
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className={`text-[13px] font-semibold ${style.title}`}>{stage.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>{stage.totalCount}</span>
                      </div>
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] text-[#64748b]">
                        <span className="rounded bg-white px-1.5 py-0.5">워크플로 {stage.workflowCount}</span>
                        <span className="rounded bg-white px-1.5 py-0.5">업무 {stage.taskCount}</span>
                      </div>
                      <div className="space-y-1.5">
                        {stage.representatives.length === 0 && (
                          <p className="truncate text-[11px] text-[#94a3b8]">업무 없음</p>
                        )}
                        {stage.representatives.map((item) => (
                          <div key={item.id} className="rounded border border-[#d8e5fb] bg-white px-2 py-1.5">
                            <p className="truncate text-[11px] font-medium text-[#0f1f3d]">{item.title}</p>
                            <p className="truncate text-[10px] text-[#64748b]">{item.subtext}</p>
                          </div>
                        ))}
                        {hiddenCount > 0 && <p className="text-[10px] font-semibold text-[#1a3660]">+ {hiddenCount}건</p>}
                      </div>
                    </button>

                    {index < summaries.length - 1 && (
                      <div
                        className={`shrink-0 self-center rounded p-1 ${
                          hoveredIndex === index ||
                          hoveredIndex === index + 1 ||
                          selectedIndex === index ||
                          selectedIndex === index + 1
                            ? 'text-[#0f1f3d]'
                            : 'text-[#94a3b8]'
                        }`}
                        aria-hidden="true"
                      >
                        <ArrowRight size={15} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-[#d8e5fb] bg-[#f5f9ff]/65 px-3 py-2">
            <p className="text-[11px] font-semibold text-[#1a3660]">
              선택 단계: {selected.label} ({selected.totalCount}건)
            </p>
            <p className="mt-0.5 text-[11px] text-[#64748b]">
              실무 처리는 업무보드 파이프라인에서 이어서 진행합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e4e7ee] bg-white px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#d8e5fb] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b] hover:bg-[#f5f9ff]"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onOpenPipeline}
            className="rounded border border-[#0f1f3d] bg-[#0f1f3d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a3660]"
          >
            업무보드 파이프라인 열기
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(DashboardFlowChartModal)

