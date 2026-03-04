import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import TaskAttachmentSection from '../common/TaskAttachmentSection'
import TimeSelect from '../TimeSelect'
import { HOUR_OPTIONS } from '../timeOptions'
import {
  fetchWorkflow,
  fetchWorkflowInstance,
  type Fund,
  type GPEntity,
  type Task,
  type TaskCreate,
} from '../../lib/api'

function splitDeadline(deadline: string | null): { date: string; hour: string } {
  if (!deadline) return { date: '', hour: '' }
  const [datePart = '', timePart = ''] = deadline.split('T')
  return { date: datePart, hour: timePart.slice(0, 5) || '' }
}

function combineDeadline(date: string, hour: string): string | null {
  if (!date) return null
  return hour ? `${date}T${hour}` : date
}

interface TaskSidePanelProps {
  task: Task | null
  mode: 'detail' | 'edit'
  onModeChange: (mode: 'detail' | 'edit') => void
  onClose: () => void
  onSave: (id: number, data: Partial<TaskCreate>) => void
  onComplete: (task: Task) => void
  onDelete: (taskId: number) => void
  fundsForFilter: Fund[]
  gpEntities: GPEntity[]
  categoryOptions: string[]
}

export default function TaskSidePanel({
  task,
  mode,
  onModeChange,
  onClose,
  onSave,
  onComplete,
  onDelete,
  fundsForFilter,
  gpEntities,
  categoryOptions,
}: TaskSidePanelProps) {
  const initialDeadline = useMemo(() => splitDeadline(task?.deadline ?? null), [task?.deadline])
  const [title, setTitle] = useState(task?.title ?? '')
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date)
  const [deadlineHour, setDeadlineHour] = useState(initialDeadline.hour)
  const [estimatedTime, setEstimatedTime] = useState(task?.estimated_time ?? '')
  const [quadrant, setQuadrant] = useState(task?.quadrant ?? 'Q1')
  const [memo, setMemo] = useState(task?.memo ?? '')
  const [delegateTo, setDelegateTo] = useState(task?.delegate_to ?? '')
  const [category, setCategory] = useState(task?.category ?? '')
  const [relatedTarget, setRelatedTarget] = useState(
    task?.fund_id ? `fund:${task.fund_id}` : task?.gp_entity_id ? `gp:${task.gp_entity_id}` : '',
  )

  useEffect(() => {
    if (!task) return
    const next = splitDeadline(task.deadline)
    setTitle(task.title)
    setDeadlineDate(next.date)
    setDeadlineHour(next.hour)
    setEstimatedTime(task.estimated_time || '')
    setQuadrant(task.quadrant)
    setMemo(task.memo || '')
    setDelegateTo(task.delegate_to || '')
    setCategory(task.category || '')
    setRelatedTarget(task.fund_id ? `fund:${task.fund_id}` : task.gp_entity_id ? `gp:${task.gp_entity_id}` : '')
  }, [task])

  const { data: workflowInstance, isLoading: isWorkflowInstanceLoading } = useQuery({
    queryKey: ['workflow-instance', task?.workflow_instance_id],
    queryFn: () => fetchWorkflowInstance(task?.workflow_instance_id as number),
    enabled: !!task?.workflow_instance_id,
  })

  const { data: workflowTemplate, isLoading: isWorkflowTemplateLoading } = useQuery({
    queryKey: ['workflow', workflowInstance?.workflow_id],
    queryFn: () => fetchWorkflow(workflowInstance?.workflow_id as number),
    enabled: !!workflowInstance?.workflow_id,
  })

  const stepDocuments = useMemo(() => {
    if (!task || !workflowInstance || !workflowTemplate) return []
    const matchedStepInstance = workflowInstance.step_instances.find((step) => step.task_id === task.id)
    if (!matchedStepInstance) return []
    const matchedStep = workflowTemplate.steps.find((step) => step.id === matchedStepInstance.workflow_step_id)
    return matchedStep?.step_documents ?? []
  }, [workflowInstance, workflowTemplate, task])

  if (!task) return null

  return (
    <aside className="fixed right-0 top-[54px] z-40 h-[calc(100vh-54px)] w-full max-w-[420px] border-l border-[#d8e5fb] bg-white shadow-xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[#d8e5fb] px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-[#64748b]">업무 상세</p>
            <h3 className="line-clamp-1 text-sm font-bold text-[#0f1f3d]">{task.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="icon-btn text-[#64748b]" aria-label="패널 닫기">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {mode === 'detail' ? (
            <>
              <div className="space-y-1.5 text-sm text-[#0f1f3d]">
                {task.deadline && (
                  <p><span className="font-medium">마감:</span> {new Date(task.deadline).toLocaleString('ko-KR')}</p>
                )}
                <p><span className="font-medium">사분면:</span> {task.quadrant}</p>
                {task.fund_name && <p><span className="font-medium">조합:</span> {task.fund_name}</p>}
                {task.gp_entity_name && <p><span className="font-medium">고유계정:</span> {task.gp_entity_name}</p>}
                {task.company_name && <p><span className="font-medium">피투자사:</span> {task.company_name}</p>}
                {task.category && <p><span className="font-medium">카테고리:</span> {task.category}</p>}
                {task.estimated_time && <p><span className="font-medium">예상 시간:</span> {task.estimated_time}</p>}
                {task.memo && <p><span className="font-medium">메모:</span> {task.memo}</p>}
                {task.delegate_to && <p><span className="font-medium">담당자:</span> {task.delegate_to}</p>}
              </div>

              {task.workflow_instance_id && (
                <div className="rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] px-3 py-2">
                  <p className="text-xs font-semibold text-[#1a3660]">연결 서류</p>
                  {isWorkflowInstanceLoading || isWorkflowTemplateLoading ? (
                    <p className="mt-1 text-xs text-[#64748b]">불러오는 중...</p>
                  ) : stepDocuments.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {stepDocuments.map((doc, idx) => (
                        <li key={`${doc.id ?? idx}-${doc.name}`} className="text-xs text-[#0f1f3d]">
                          • {doc.name}
                          {doc.document_template_id ? ' [템플릿]' : ''}
                          {doc.required ? ' (필수)' : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-[#64748b]">연결된 서류가 없습니다.</p>
                  )}
                </div>
              )}

              <TaskAttachmentSection
                taskId={task.id}
                workflowInstanceId={task.workflow_instance_id}
                workflowStepOrder={task.workflow_step_order}
                readOnly
              />
            </>
          ) : (
            <>
              <div>
                <label className="form-label">제목</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="form-input" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="form-label">마감일</label>
                  <input
                    type="date"
                    value={deadlineDate}
                    onChange={(event) => setDeadlineDate(event.target.value)}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">시간</label>
                  <select
                    value={deadlineHour}
                    onChange={(event) => setDeadlineHour(event.target.value)}
                    className="form-input"
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
                  <label className="form-label">예상 시간</label>
                  <TimeSelect value={estimatedTime} onChange={setEstimatedTime} />
                </div>
                <div>
                  <label className="form-label">사분면</label>
                  <select value={quadrant} onChange={(event) => setQuadrant(event.target.value)} className="form-input">
                    <option value="Q1">긴급·중요 (Q1)</option>
                    <option value="Q2">중요·비긴급 (Q2)</option>
                    <option value="Q3">긴급·비중요 (Q3)</option>
                    <option value="Q4">비긴급·비중요 (Q4)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="form-label">카테고리</label>
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className="form-input">
                    <option value="">없음</option>
                    {categoryOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">관련 대상</label>
                  <select
                    value={relatedTarget}
                    onChange={(event) => setRelatedTarget(event.target.value)}
                    className="form-input"
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
                      {fundsForFilter.map((fund) => (
                        <option key={`fund-${fund.id}`} value={`fund:${fund.id}`}>{fund.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">담당자</label>
                <input
                  value={delegateTo}
                  onChange={(event) => setDelegateTo(event.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">메모</label>
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  rows={4}
                  className="form-input resize-none"
                />
              </div>

              <TaskAttachmentSection
                taskId={task.id}
                workflowInstanceId={task.workflow_instance_id}
                workflowStepOrder={task.workflow_step_order}
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[#d8e5fb] px-4 py-3">
          {mode === 'detail' ? (
            <>
              {task.status !== 'completed' && (
                <button type="button" onClick={() => onComplete(task)} className="primary-btn btn-sm">
                  완료
                </button>
              )}
              <button type="button" onClick={() => onModeChange('edit')} className="secondary-btn btn-sm">
                수정
              </button>
              <button type="button" onClick={() => onDelete(task.id)} className="danger-btn btn-sm">
                삭제
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!title.trim()) return
                  const fundId = relatedTarget.startsWith('fund:') ? Number(relatedTarget.slice(5)) : null
                  const gpEntityId = relatedTarget.startsWith('gp:') ? Number(relatedTarget.slice(3)) : null
                  onSave(task.id, {
                    title: title.trim(),
                    deadline: combineDeadline(deadlineDate, deadlineHour),
                    estimated_time: estimatedTime || null,
                    quadrant,
                    memo: memo || null,
                    delegate_to: delegateTo || null,
                    category: category || null,
                    fund_id: fundId || null,
                    gp_entity_id: gpEntityId || null,
                  })
                }}
                className="primary-btn btn-sm"
              >
                저장
              </button>
              <button type="button" onClick={() => onModeChange('detail')} className="secondary-btn btn-sm">
                취소
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="ghost-btn btn-sm">
            닫기
          </button>
        </div>
      </div>
    </aside>
  )
}
