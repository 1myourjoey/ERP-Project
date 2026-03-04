import { Fragment, memo, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'

import type { ActiveWorkflow, Task } from '../../lib/api'
import { buildFlowStageSummaries, type FlowSeverity, type FlowStageKey } from './flowStageModel'

interface DashboardMiniFlowChartProps {
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  upcomingTasks: Task[]
  noDeadlineTasks: Task[]
  activeWorkflows: ActiveWorkflow[]
  onOpenModal: (stage: FlowStageKey) => void
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

function DashboardMiniFlowChart({
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  upcomingTasks,
  noDeadlineTasks,
  activeWorkflows,
  onOpenModal,
}: DashboardMiniFlowChartProps) {
  const [hoveredStage, setHoveredStage] = useState<FlowStageKey | null>(null)

  const summaries = useMemo(
    () =>
      buildFlowStageSummaries({
        todayTasks,
        tomorrowTasks,
        thisWeekTasks,
        upcomingTasks,
        noDeadlineTasks,
        activeWorkflows,
        representativeLimit: 2,
      }),
    [todayTasks, tomorrowTasks, thisWeekTasks, upcomingTasks, noDeadlineTasks, activeWorkflows],
  )

  const hoveredIndex = summaries.findIndex((stage) => stage.key === hoveredStage)
  const hasHover = hoveredIndex >= 0

  return (
    <div
      className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff]/70 p-2.5"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenModal('today')
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[#0f1f3d]">업무 플로우 요약</p>
          <p className="text-[11px] text-[#64748b]">노드 클릭 시 전체 플로우를 크게 볼 수 있습니다.</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenModal('today')}
          className="rounded border border-[#d8e5fb] bg-white px-2 py-1 text-[11px] font-semibold text-[#1a3660] hover:bg-[#f5f9ff]"
        >
          전체 플로우 보기
        </button>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[860px] items-stretch gap-2 pr-1">
          {summaries.map((stage, index) => {
            const style = STYLES_BY_SEVERITY[stage.severity]
            const hiddenCount = Math.max(0, stage.totalCount - stage.representatives.length)
            const isStageActive = hasHover ? hoveredIndex === index : false

            return (
              <Fragment key={stage.key}>
                <button
                  type="button"
                  onClick={() => onOpenModal(stage.key)}
                  onMouseEnter={() => setHoveredStage(stage.key)}
                  onMouseLeave={() => setHoveredStage(null)}
                  onFocus={() => setHoveredStage(stage.key)}
                  onBlur={() => setHoveredStage((prev) => (prev === stage.key ? null : prev))}
                  className={`min-h-[132px] min-w-[156px] max-w-[170px] flex-1 rounded-lg border p-2 text-left transition-colors hover:border-[#558ef8] ${style.border} ${style.bg} ${
                    isStageActive ? 'ring-1 ring-[#558ef8]/45' : ''
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className={`text-[12px] font-semibold ${style.title}`}>{stage.label}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${style.badge}`}>{stage.totalCount}</span>
                  </div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[#64748b]">
                    <span className="rounded bg-white px-1.5 py-0.5">W {stage.workflowCount}</span>
                    <span className="rounded bg-white px-1.5 py-0.5">T {stage.taskCount}</span>
                  </div>
                  <div className="space-y-1">
                    {stage.representatives.length === 0 && (
                      <p className="truncate text-[11px] text-[#94a3b8]">업무 없음</p>
                    )}
                    {stage.representatives.map((item) => (
                      <div key={item.id} className="rounded border border-[#d8e5fb] bg-white px-1.5 py-1">
                        <p className="truncate text-[11px] font-medium text-[#0f1f3d]">{item.title}</p>
                        <p className="truncate text-[10px] text-[#64748b]">{item.subtext}</p>
                      </div>
                    ))}
                    {hiddenCount > 0 && <p className="text-[10px] font-semibold text-[#1a3660]">+ {hiddenCount}건</p>}
                  </div>
                </button>

                {index < summaries.length - 1 && (
                  <button
                    type="button"
                    onClick={() => onOpenModal(summaries[index + 1].key)}
                    className={`shrink-0 self-center rounded p-1 transition-colors ${
                      hasHover && (hoveredIndex === index || hoveredIndex === index + 1)
                        ? 'text-[#0f1f3d]'
                        : 'text-[#94a3b8] hover:text-[#64748b]'
                    }`}
                    aria-label={`${stage.label} 다음 단계 보기`}
                  >
                    <ArrowRight size={14} />
                  </button>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default memo(DashboardMiniFlowChart)
