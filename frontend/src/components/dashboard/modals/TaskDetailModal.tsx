import { memo, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchWorkflow, fetchWorkflowInstance, type Task } from '../../../lib/api'

interface TaskDetailModalProps {
  task: Task
  onClose: () => void
  onComplete: (task: Task) => void
  onGoTaskBoard: (task: Task) => void
  editable?: boolean
}

function TaskDetailModal({
  task,
  onClose,
  onComplete,
  onGoTaskBoard,
  editable = true,
}: TaskDetailModalProps) {
  const { data: workflowInstance, isLoading: isWorkflowInstanceLoading } = useQuery({
    queryKey: ['workflow-instance', task.workflow_instance_id],
    queryFn: () => fetchWorkflowInstance(task.workflow_instance_id as number),
    enabled: !!task.workflow_instance_id,
  })

  const { data: workflowTemplate, isLoading: isWorkflowTemplateLoading } = useQuery({
    queryKey: ['workflow', workflowInstance?.workflow_id],
    queryFn: () => fetchWorkflow(workflowInstance?.workflow_id as number),
    enabled: !!workflowInstance?.workflow_id,
  })

  const stepDocuments = useMemo(() => {
    if (!workflowInstance || !workflowTemplate) return []
    const matchedStepInstance = workflowInstance.step_instances.find((step) => step.task_id === task.id)
    if (!matchedStepInstance) return []
    const matchedStep = workflowTemplate.steps.find((step) => step.id === matchedStepInstance.workflow_step_id)
    return matchedStep?.step_documents ?? []
  }, [workflowInstance, workflowTemplate, task.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{task.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <div className="space-y-2 text-sm text-gray-700">
          {task.deadline && (
            <div>
              <span className="font-medium">마감:</span> {new Date(task.deadline).toLocaleString('ko-KR')}
            </div>
          )}
          {task.estimated_time && (
            <div>
              <span className="font-medium">예상 시간:</span> {task.estimated_time}
            </div>
          )}
          {task.fund_name && (
            <div>
              <span className="font-medium">조합:</span> {task.fund_name}
            </div>
          )}
          {task.gp_entity_name && (
            <div>
              <span className="font-medium">고유계정:</span> {task.gp_entity_name}
            </div>
          )}
          {task.company_name && (
            <div>
              <span className="font-medium">피투자사:</span> {task.company_name}
            </div>
          )}
          {task.category && (
            <div>
              <span className="font-medium">카테고리:</span> {task.category}
            </div>
          )}
          <div>
            <span className="font-medium">사분면:</span> {task.quadrant}
          </div>
          {task.memo && (
            <div>
              <span className="font-medium">메모:</span> {task.memo}
            </div>
          )}
          {task.delegate_to && (
            <div>
              <span className="font-medium">담당자:</span> {task.delegate_to}
            </div>
          )}
          {task.workflow_instance_id && (
            <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2">
              <p className="text-xs font-semibold text-indigo-700">연결 서류</p>
              {isWorkflowInstanceLoading || isWorkflowTemplateLoading ? (
                <p className="mt-1 text-xs text-indigo-600">불러오는 중...</p>
              ) : stepDocuments.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {stepDocuments.map((doc, index) => (
                    <li key={`${doc.id ?? index}-${doc.name}`} className="text-xs text-indigo-900">
                      • {doc.name}
                      {doc.document_template_id ? ' [템플릿]' : ''}
                      {doc.required ? ' (필수)' : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-indigo-600">연결된 서류가 없습니다.</p>
              )}
            </div>
          )}
        </div>
        {!editable && (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
            파이프라인에서는 대기 업무만 수정 가능
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          {task.status !== 'completed' && (
            <button
              onClick={() => onComplete(task)}
              className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
            >
              완료
            </button>
          )}
          <button
            onClick={() => onGoTaskBoard(task)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            {editable ? '업무보드에서 수정' : '업무보드에서 확인'}
          </button>
          <button
            onClick={onClose}
            className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(TaskDetailModal)
