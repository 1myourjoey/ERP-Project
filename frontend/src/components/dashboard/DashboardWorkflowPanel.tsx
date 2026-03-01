import { memo, useMemo, useState } from 'react'
import { ChevronDown, GitBranch } from 'lucide-react'

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
  const workflowGroups = useMemo(() => groupWorkflows(activeWorkflows), [activeWorkflows])

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  const renderWorkflowRow = (workflow: ActiveWorkflow) => {
    const { percent } = parseWorkflowProgress(workflow.progress)
    return (
      <button
        key={workflow.id}
        onClick={() => onOpenWorkflow(workflow)}
        className="w-full cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-left hover:bg-indigo-100"
      >
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-xs font-medium text-indigo-800">{workflow.name}</p>
          <span className="tag tag-indigo">{workflow.progress}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-indigo-600">
          {workflow.fund_name || workflow.gp_entity_name || '-'} | {workflow.company_name || '-'}
        </p>
        {workflow.next_step && (
          <p className="mt-0.5 truncate text-[11px] text-indigo-700">
            다음: {workflow.next_step}
            {workflow.next_step_date ? ` (${formatShortDate(workflow.next_step_date)})` : ''}
          </p>
        )}
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-indigo-200/60">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </button>
    )
  }

  return (
    <div className="card-base dashboard-card">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={onOpenPopup}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600"
        >
          <GitBranch size={16} />
          🔄 진행 중인 워크플로
          <span className="ml-auto text-xs text-gray-400">{activeWorkflows.length}건 · {workflowGroups.length}그룹</span>
        </button>
        <button
          onClick={onOpenTaskBoard}
          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          업무보드
        </button>
        <button
          onClick={onOpenPipeline}
          className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          파이프라인 보기
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500">워크플로를 불러오는 중입니다...</p>
      ) : activeWorkflows.length > 0 ? (
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
              <div key={group.groupKey} className="rounded-lg border border-indigo-200 bg-white">
                <button
                  onClick={() => toggleGroup(group.groupKey)}
                  className="w-full cursor-pointer px-3 py-2 text-left hover:bg-indigo-50/40"
                >
                  <div
                    className="flex items-center gap-2"
                  >
                    <p className="flex-1 truncate text-sm font-semibold text-indigo-800">{group.groupLabel}</p>
                    <span className="text-xs text-indigo-700">{group.workflows.length}건</span>
                    <ChevronDown size={14} className={`text-indigo-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-indigo-600">{previewFunds || '공통'}</p>
                  <p className="mt-0.5 text-[11px] text-indigo-500">{isExpanded ? '접기' : '펼치기'}</p>
                </button>

                <div className={`${isExpanded ? 'block' : 'hidden'} border-t border-indigo-100 px-2 pb-2 pt-1`}>
                  <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                    {group.workflows.map((workflow) => renderWorkflowRow(workflow))}
                  </div>
                </div>
              </div>
            )
          })}
          {activeWorkflows.length > 6 && (
            <div className="text-center text-[10px] text-gray-400">
              ↓ 스크롤하여 {activeWorkflows.length - 6}건 더보기
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          emoji="🔄"
          message="진행 중인 워크플로가 없어요"
          action={onOpenWorkflowPage}
          actionLabel="워크플로 시작"
          className="py-8"
        />
      )}
    </div>
  )
}

export default memo(DashboardWorkflowPanel)
