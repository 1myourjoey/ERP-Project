import { memo, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, ChevronDown, GitBranch } from 'lucide-react'

import EmptyState from '../EmptyState'
import type { ActiveWorkflow } from '../../lib/api'
import { formatShortDate, groupWorkflows, parseWorkflowProgress } from './dashboardUtils'

interface DashboardWorkflowPanelProps {
  activeWorkflows: ActiveWorkflow[]
  loading?: boolean
  onOpenPopup: () => void
  onOpenWorkflow: (workflow: ActiveWorkflow) => void
  onOpenWorkflowPage: () => void
  onOpenTaskBoard: () => void
  onOpenPipeline: () => void
}

type WorkflowFilter = 'all' | 'due_soon' | 'overdue'

function daysUntil(value?: string | null): number | null {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function dueTag(days: number): { text: string; className: string } {
  if (days < 0) return { text: `지연 D+${Math.abs(days)}`, className: 'tag tag-red' }
  if (days <= 3) return { text: `D-${days}`, className: 'tag tag-red' }
  if (days <= 7) return { text: `D-${days}`, className: 'tag tag-amber' }
  return { text: `D-${days}`, className: 'tag tag-gray' }
}

function DashboardWorkflowPanel({
  activeWorkflows,
  loading = false,
  onOpenPopup,
  onOpenWorkflow,
  onOpenWorkflowPage,
  onOpenTaskBoard,
  onOpenPipeline,
}: DashboardWorkflowPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<WorkflowFilter>('all')

  const overdueCount = useMemo(
    () => activeWorkflows.filter((workflow) => (daysUntil(workflow.next_step_date) ?? 1) < 0).length,
    [activeWorkflows],
  )
  const dueSoonCount = useMemo(
    () =>
      activeWorkflows.filter((workflow) => {
        const days = daysUntil(workflow.next_step_date)
        return days != null && days >= 0 && days <= 7
      }).length,
    [activeWorkflows],
  )

  const filteredWorkflows = useMemo(() => {
    if (filter === 'overdue') {
      return activeWorkflows.filter((workflow) => (daysUntil(workflow.next_step_date) ?? 1) < 0)
    }
    if (filter === 'due_soon') {
      return activeWorkflows.filter((workflow) => {
        const days = daysUntil(workflow.next_step_date)
        return days != null && days >= 0 && days <= 7
      })
    }
    return activeWorkflows
  }, [activeWorkflows, filter])

  const workflowGroups = useMemo(() => groupWorkflows(filteredWorkflows), [filteredWorkflows])

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  const renderWorkflowRow = (workflow: ActiveWorkflow) => {
    const { percent } = parseWorkflowProgress(workflow.progress)
    const nextStepDays = daysUntil(workflow.next_step_date)
    const nextStepBadge = nextStepDays != null ? dueTag(nextStepDays) : null

    return (
      <button
        key={workflow.id}
        onClick={() => onOpenWorkflow(workflow)}
        className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-left hover:bg-slate-50"
      >
        <div className="flex items-center justify-between gap-1">
          <p className="min-w-0 truncate text-sm font-medium text-slate-800">{workflow.name}</p>
          <div className="ml-2 flex items-center gap-1">
            <span className="tag tag-blue">{workflow.progress}</span>
            {nextStepBadge && <span className={nextStepBadge.className}>{nextStepBadge.text}</span>}
          </div>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {workflow.fund_name || workflow.gp_entity_name || '-'} | {workflow.company_name || '-'}
        </p>
        {workflow.next_step && (
          <p className="mt-0.5 truncate text-[11px] text-slate-600">
            다음: {workflow.next_step}
            {workflow.next_step_date ? ` (${formatShortDate(workflow.next_step_date)})` : ''}
          </p>
        )}
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </button>
    )
  }

  return (
    <div className="card-base dashboard-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={onOpenPopup}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-600"
        >
          <GitBranch size={16} />
          진행 중인 워크플로
          <span className="ml-auto text-xs text-slate-500">
            {filteredWorkflows.length}건 · {workflowGroups.length}그룹
          </span>
        </button>
        <button onClick={onOpenTaskBoard} className="secondary-btn btn-sm">
          업무 보드
        </button>
        <button onClick={onOpenPipeline} className="secondary-btn btn-sm">
          파이프라인
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full border px-2.5 py-1 ${
            filter === 'all'
              ? 'border-slate-300 bg-slate-100 text-slate-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          전체 {activeWorkflows.length}
        </button>
        <button
          type="button"
          onClick={() => setFilter('due_soon')}
          className={`rounded-full border px-2.5 py-1 ${
            filter === 'due_soon'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          <span className="inline-flex items-center gap-1">
            <CalendarClock size={12} />
            임박 {dueSoonCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFilter('overdue')}
          className={`rounded-full border px-2.5 py-1 ${
            filter === 'overdue'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={12} />
            지연 {overdueCount}
          </span>
        </button>
        <span className="ml-auto text-[11px] text-slate-500">기준: 다음 단계 예정일</span>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">워크플로를 불러오는 중입니다...</p>
      ) : filteredWorkflows.length > 0 ? (
        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {workflowGroups.map((group) => {
            if (group.workflows.length === 1) {
              return renderWorkflowRow(group.workflows[0])
            }

            const isExpanded = expandedGroups[group.groupKey] === true
            const previewFunds =
              group.fundNames.length > 3
                ? `${group.fundNames.slice(0, 3).join(', ')} 외 ${group.fundNames.length - 3}`
                : group.fundNames.join(', ')

            return (
              <div key={group.groupKey} className="rounded-lg border border-slate-200 bg-white">
                <button
                  onClick={() => toggleGroup(group.groupKey)}
                  className="w-full cursor-pointer px-3 py-2 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{group.groupLabel}</p>
                    <span className="text-xs text-slate-600">{group.workflows.length}건</span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{previewFunds || '공통'}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{isExpanded ? '접기' : '펼치기'}</p>
                </button>

                <div className={`${isExpanded ? 'block' : 'hidden'} border-t border-slate-100 px-2 pb-2 pt-1`}>
                  <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                    {group.workflows.map((workflow) => renderWorkflowRow(workflow))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<GitBranch size={18} />}
          message={filter === 'all' ? '진행 중인 워크플로가 없습니다.' : '선택한 조건의 워크플로가 없습니다.'}
          action={onOpenWorkflowPage}
          actionLabel="워크플로 시작"
          className="py-8"
        />
      )}
    </div>
  )
}

export default memo(DashboardWorkflowPanel)
