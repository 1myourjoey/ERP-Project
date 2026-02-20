import { memo } from 'react'
import { GitBranch } from 'lucide-react'

import EmptyState from '../EmptyState'
import type { ActiveWorkflow } from '../../lib/api'
import { formatShortDate, parseWorkflowProgress } from './dashboardUtils'

interface DashboardWorkflowPanelProps {
  activeWorkflows: ActiveWorkflow[]
  loading?: boolean
  onOpenPopup: () => void
  onOpenWorkflow: (workflow: ActiveWorkflow) => void
  onOpenWorkflowPage: () => void
}

function DashboardWorkflowPanel({
  activeWorkflows,
  loading = false,
  onOpenPopup,
  onOpenWorkflow,
  onOpenWorkflowPage,
}: DashboardWorkflowPanelProps) {
  return (
    <div className="card-base dashboard-card">
      <button
        onClick={onOpenPopup}
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600"
      >
        <GitBranch size={16} />
        🔄 진행 중인 워크플로
        <span className="ml-auto text-xs text-gray-400">{activeWorkflows.length}건</span>
      </button>

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500">워크플로를 불러오는 중입니다...</p>
      ) : activeWorkflows.length > 0 ? (
        <>
          <div className="max-h-[160px] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {activeWorkflows.map((workflow) => {
                const { percent } = parseWorkflowProgress(workflow.progress)
                return (
                  <div
                    key={workflow.id}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-left hover:bg-indigo-100"
                  >
                    <button onClick={() => onOpenWorkflow(workflow)} className="w-full cursor-pointer text-left">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-xs font-medium text-indigo-800">{workflow.name}</p>
                        <span className="tag tag-indigo">{workflow.progress}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-indigo-600">
                        {workflow.fund_name || '-'} | {workflow.company_name || '-'}
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
                  </div>
                )
              })}
            </div>
          </div>
          {activeWorkflows.length > 4 && (
            <div className="mt-2 text-center text-[10px] text-gray-400">
              ↓ 스크롤하여 {activeWorkflows.length - 4}건 더보기
            </div>
          )}
        </>
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
