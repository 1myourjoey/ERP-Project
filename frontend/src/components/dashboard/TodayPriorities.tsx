import { useState } from 'react'

import type { ActiveWorkflow, DashboardDeadlineItem, Task } from '../../lib/api'
import { formatDate } from '../../lib/format'
import DashboardMiniFlowChart from './DashboardMiniFlowChart'
import type { FlowStageKey } from './flowStageModel'
import DashboardFlowChartModal from './modals/DashboardFlowChartModal'

interface TodayPrioritiesProps {
  todayPriorities: DashboardDeadlineItem[]
  weekDeadlines: DashboardDeadlineItem[]
  pipelineTodayTasks: Task[]
  pipelineTomorrowTasks: Task[]
  pipelineThisWeekTasks: Task[]
  pipelineUpcomingTasks: Task[]
  pipelineNoDeadlineTasks: Task[]
  pipelineActiveWorkflows: ActiveWorkflow[]
  onNavigate: (path: string) => void
}

function urgencyDot(daysRemaining: number | null): string {
  if (daysRemaining == null) return 'bg-[#94a3b8]'
  if (daysRemaining < 0) return 'bg-[#0f1f3d]'
  if (daysRemaining === 0) return 'bg-[#bfa5a7]'
  if (daysRemaining <= 3) return 'bg-[#558ef8]'
  return 'bg-[#94a3b8]'
}

function dueLabel(daysRemaining: number | null): string {
  if (daysRemaining == null) return '-'
  if (daysRemaining < 0) return `D+${Math.abs(daysRemaining)}`
  if (daysRemaining === 0) return 'D-day'
  return `D-${daysRemaining}`
}

export default function TodayPriorities({
  todayPriorities,
  weekDeadlines,
  pipelineTodayTasks,
  pipelineTomorrowTasks,
  pipelineThisWeekTasks,
  pipelineUpcomingTasks,
  pipelineNoDeadlineTasks,
  pipelineActiveWorkflows,
  onNavigate,
}: TodayPrioritiesProps) {
  const [mode, setMode] = useState<'priorities' | 'pipeline'>('priorities')
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false)
  const [selectedFlowStage, setSelectedFlowStage] = useState<FlowStageKey>('today')

  const topToday = todayPriorities.slice(0, 5)
  const topWeek = weekDeadlines.filter((row) => (row.days_remaining ?? 99) > 0).slice(0, 3)

  const openFlowModal = (stage: FlowStageKey) => {
    setSelectedFlowStage(stage)
    setIsFlowModalOpen(true)
  }

  return (
    <section className={`card-base h-full p-3 ${mode === 'pipeline' ? 'min-h-[430px]' : 'min-h-[420px]'}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#0f1f3d]">오늘 핵심 업무</h3>
        <div className="flex items-center gap-1 rounded border border-[#d8e5fb] bg-[#f5f9ff] p-0.5 text-[11px]">
          <button
            type="button"
            className={`rounded px-2 py-1 ${mode === 'priorities' ? 'bg-white font-semibold text-[#0f1f3d]' : 'text-[#64748b] hover:bg-white'}`}
            onClick={() => setMode('priorities')}
          >
            핵심업무
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 ${mode === 'pipeline' ? 'bg-white font-semibold text-[#0f1f3d]' : 'text-[#64748b] hover:bg-white'}`}
            onClick={() => setMode('pipeline')}
          >
            파이프라인
          </button>
        </div>
      </div>

      {mode === 'priorities' ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {topToday.length === 0 && <p className="col-span-2 text-xs text-[#64748b]">우선 처리할 항목이 없습니다.</p>}
          {topToday.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className="flex min-h-[66px] w-full items-start justify-between rounded-lg border border-[#d8e5fb] bg-white px-2.5 py-2 text-left hover:bg-[#f5f9ff]"
              onClick={() => onNavigate(item.action_url)}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[#0f1f3d]">
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${urgencyDot(item.days_remaining)}`} />
                  {item.title}
                </p>
                <p className="truncate text-[11px] text-[#64748b]">{item.context || '-'}</p>
              </div>
              <span className="ml-2 shrink-0 text-[11px] font-semibold text-[#64748b]">{dueLabel(item.days_remaining)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2">
          <DashboardMiniFlowChart
            todayTasks={pipelineTodayTasks}
            tomorrowTasks={pipelineTomorrowTasks}
            thisWeekTasks={pipelineThisWeekTasks}
            upcomingTasks={pipelineUpcomingTasks}
            noDeadlineTasks={pipelineNoDeadlineTasks}
            activeWorkflows={pipelineActiveWorkflows}
            onOpenModal={openFlowModal}
          />
        </div>
      )}

      {mode === 'priorities' && (
        <div className="mt-3 border-t border-[#e4e7ee] pt-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-[#0f1f3d]">이번 주 마감</p>
            <span className="text-[11px] text-[#64748b]">{weekDeadlines.length}건</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {topWeek.length === 0 && <p className="col-span-2 text-xs text-[#64748b]">이번 주 마감이 없습니다.</p>}
            {topWeek.map((item) => (
              <button
                key={`week-${item.type}-${item.id}`}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-[#f5f9ff]"
                onClick={() => onNavigate(item.action_url)}
              >
                <span className="truncate text-xs text-[#0f1f3d]">{item.title}</span>
                <span className="ml-2 shrink-0 text-[11px] text-[#64748b]">
                  {item.due_date ? formatDate(item.due_date, 'short') : '-'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-[#1a3660] hover:text-[#558ef8]"
          onClick={() => onNavigate(mode === 'priorities' ? '/tasks' : '/tasks?view=pipeline')}
        >
          {mode === 'priorities' ? '업무보드로' : '업무 파이프라인으로'}
        </button>
      </div>

      <DashboardFlowChartModal
        open={isFlowModalOpen}
        selectedStage={selectedFlowStage}
        onClose={() => setIsFlowModalOpen(false)}
        onSelectStage={setSelectedFlowStage}
        onOpenPipeline={() => {
          setIsFlowModalOpen(false)
          onNavigate('/tasks?view=pipeline')
        }}
        todayTasks={pipelineTodayTasks}
        tomorrowTasks={pipelineTomorrowTasks}
        thisWeekTasks={pipelineThisWeekTasks}
        upcomingTasks={pipelineUpcomingTasks}
        noDeadlineTasks={pipelineNoDeadlineTasks}
        activeWorkflows={pipelineActiveWorkflows}
      />
    </section>
  )
}

