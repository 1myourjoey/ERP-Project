import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  fetchWorkflow,
  fetchWorkflowInstance,
  type Fund,
  type GPEntity,
  type Task,
  type TaskCreate,
} from '../lib/api'
import { detectNoticeReport } from '../lib/taskFlags'
import TimeSelect from './TimeSelect'
import { HOUR_OPTIONS } from './timeOptions'

function splitDeadline(deadline: string | null): { date: string; hour: string } {
  if (!deadline) return { date: '', hour: '' }
  const [datePart = '', timePart = ''] = deadline.split('T')
  return { date: datePart, hour: timePart.slice(0, 5) || '' }
}

function combineDeadline(date: string, hour: string): string | null {
  if (!date) return null
  return hour ? `${date}T${hour}` : date
}

const CATEGORY_OPTIONS = ['투자실행', 'LP보고', '사후관리', '규약/총회', '서류관리', '일반'] as const
const QUADRANT_OPTIONS = [
  { value: 'Q1', label: '긴급·중요 (Q1)' },
  { value: 'Q2', label: '중요·비긴급 (Q2)' },
  { value: 'Q3', label: '긴급·비중요 (Q3)' },
  { value: 'Q4', label: '비긴급·비중요 (Q4)' },
] as const

interface EditTaskModalProps {
  task: Task
  funds: Array<Pick<Fund, 'id' | 'name'>>
  gpEntities?: Array<Pick<GPEntity, 'id' | 'name'>>
  onSave: (id: number, data: Partial<TaskCreate>) => void
  onCancel: () => void
}

export default function EditTaskModal({
  task,
  funds,
  gpEntities = [],
  onSave,
  onCancel,
}: EditTaskModalProps) {
  const initialDeadline = useMemo(() => splitDeadline(task.deadline), [task.deadline])
  const [title, setTitle] = useState(task.title)
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date)
  const [deadlineHour, setDeadlineHour] = useState(initialDeadline.hour)
  const [estimatedTime, setEstimatedTime] = useState(task.estimated_time || '')
  const [quadrant, setQuadrant] = useState(task.quadrant)
  const [memo, setMemo] = useState(task.memo || '')
  const [delegateTo, setDelegateTo] = useState(task.delegate_to || '')
  const [category, setCategory] = useState(task.category || '')
  const [relatedTarget, setRelatedTarget] = useState(
    task.fund_id ? `fund:${task.fund_id}` : task.gp_entity_id ? `gp:${task.gp_entity_id}` : '',
  )
  const autoDetected = detectNoticeReport(task.title)
  const [isNotice, setIsNotice] = useState(task.is_notice ?? autoDetected.is_notice)
  const [isReport, setIsReport] = useState(task.is_report ?? autoDetected.is_report)
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

  const submit = () => {
    if (!title.trim()) return
    const selectedFundId = relatedTarget.startsWith('fund:') ? Number(relatedTarget.slice(5)) : null
    const selectedGpEntityId = relatedTarget.startsWith('gp:') ? Number(relatedTarget.slice(3)) : null

    onSave(task.id, {
      title: title.trim(),
      deadline: combineDeadline(deadlineDate, deadlineHour),
      estimated_time: estimatedTime || null,
      quadrant,
      memo: memo || null,
      delegate_to: delegateTo || null,
      category: category || null,
      fund_id: selectedFundId || null,
      gp_entity_id: selectedGpEntityId || null,
      is_notice: isNotice,
      is_report: isReport,
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">업무 수정</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">×</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">제목</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => {
                  const nextTitle = e.target.value
                  setTitle(nextTitle)
                  const detected = detectNoticeReport(nextTitle)
                  setIsNotice(detected.is_notice)
                  setIsReport(detected.is_report)
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={isNotice}
                  onChange={(e) => setIsNotice(e.target.checked)}
                  className="rounded border-gray-300"
                />
                통지
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={isReport}
                  onChange={(e) => setIsReport(e.target.checked)}
                  className="rounded border-gray-300"
                />
                보고
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">마감일</label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">시간</label>
                <select
                  value={deadlineHour}
                  onChange={(e) => setDeadlineHour(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">선택</option>
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>{hour}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">예상 시간</label>
                <TimeSelect value={estimatedTime} onChange={setEstimatedTime} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">사분면</label>
                <select
                  value={quadrant}
                  onChange={(e) => setQuadrant(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {QUADRANT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">카테고리</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">없음</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">관련 대상</label>
                <select
                  value={relatedTarget}
                  onChange={(e) => setRelatedTarget(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">없음</option>
                  {gpEntities.length > 0 && (
                    <optgroup label="고유계정">
                      {gpEntities.map((entity) => (
                        <option key={`gp-${entity.id}`} value={`gp:${entity.id}`}>{entity.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="조합">
                    {funds.map((fund) => (
                      <option key={`fund-${fund.id}`} value={`fund:${fund.id}`}>{fund.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">담당자</label>
              <input
                value={delegateTo}
                onChange={(e) => setDelegateTo(e.target.value)}
                placeholder="직접 입력"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">메모</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            {task.workflow_instance_id && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                <p className="text-xs font-semibold text-indigo-700">연결 서류</p>
                {isWorkflowInstanceLoading || isWorkflowTemplateLoading ? (
                  <p className="mt-1 text-xs text-indigo-600">불러오는 중...</p>
                ) : stepDocuments.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {stepDocuments.map((doc, idx) => (
                      <li key={`${doc.id ?? idx}-${doc.name}`} className="text-xs text-indigo-900">
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

          <div className="mt-6 flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">취소</button>
            <button onClick={submit} className="primary-btn">저장</button>
          </div>
        </div>
      </div>
    </>
  )
}
