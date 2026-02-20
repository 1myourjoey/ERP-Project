import { memo } from 'react'

import type { ActiveWorkflow, WorkflowInstance } from '../../../lib/api'
import { workflowStepBadgeClass } from '../dashboardUtils'

interface WorkflowTimelineModalProps {
  workflow: ActiveWorkflow
  instance?: WorkflowInstance
  loading: boolean
  onClose: () => void
  onOpenWorkflowPage: () => void
}

function WorkflowTimelineModal({
  workflow,
  instance,
  loading,
  onClose,
  onOpenWorkflowPage,
}: WorkflowTimelineModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">워크플로우 단계 확인</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm font-semibold text-indigo-900">{workflow.name}</p>
          <p className="mt-1 text-xs text-indigo-700">
            {workflow.fund_name || workflow.gp_entity_name || '연결 정보 없음'}
            {workflow.company_name ? ` | ${workflow.company_name}` : ''}
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            현재 단계: {workflow.next_step || '다음 단계 확인'} | 진행률: {workflow.progress}
          </p>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">단계 정보를 불러오는 중입니다...</p>
        ) : !instance ? (
          <p className="py-8 text-center text-sm text-gray-500">단계 정보를 불러오지 못했습니다.</p>
        ) : (
          <div className="space-y-2">
            {instance.step_instances.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">
                    {index + 1}. {step.step_name}
                  </p>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${workflowStepBadgeClass(step.status)}`}>
                    {step.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  기준일: {step.calculated_date}
                  {step.actual_time ? ` | 실제시간: ${step.actual_time}` : ''}
                </p>
                {step.notes && <p className="mt-1 text-xs text-gray-600">메모: {step.notes}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="secondary-btn">
            닫기
          </button>
          <button onClick={onOpenWorkflowPage} className="primary-btn">
            워크플로우 상세로 이동
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(WorkflowTimelineModal)
