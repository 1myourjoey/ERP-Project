import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BookOpenText, ChevronDown, X } from 'lucide-react'

import TaskAttachmentSection from '../common/TaskAttachmentSection'
import TimeSelect from '../TimeSelect'
import { HOUR_OPTIONS } from '../timeOptions'
import {
  fetchWorkLog,
  fetchWorkLogLessonsByCategory,
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

function parseStoredLessonAcks(raw: string | null): Record<number, boolean> {
  if (!raw) return {}
  try {
    const ids = JSON.parse(raw)
    if (!Array.isArray(ids)) return {}
    return ids.reduce<Record<number, boolean>>((acc, id) => {
      if (typeof id === 'number') acc[id] = true
      return acc
    }, {})
  } catch {
    return {}
  }
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
  const [showLessons, setShowLessons] = useState(true)
  const [showLessonWarning, setShowLessonWarning] = useState(false)
  const [selectedWorklogId, setSelectedWorklogId] = useState<number | null>(null)
  const [lessonChecks, setLessonChecks] = useState<Record<number, boolean>>({})

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
    setSelectedWorklogId(null)
    setShowLessonWarning(false)

    const stored = window.sessionStorage.getItem(`task-lesson-acks:${task.id}`)
    setLessonChecks(parseStoredLessonAcks(stored))
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

  const normalizedCategory = (task?.category || '').trim()
  const lessonQuery = useQuery({
    queryKey: [
      'worklog-lessons',
      normalizedCategory,
      task?.fund_id ?? null,
      task?.investment_id ?? null,
      task?.company_name ?? null,
      8,
    ],
    queryFn: () =>
      fetchWorkLogLessonsByCategory({
        category: normalizedCategory,
        fund_id: task?.fund_id ?? undefined,
        investment_id: task?.investment_id ?? undefined,
        company_name: task?.company_name ?? undefined,
        limit: 8,
      }),
    enabled: !!task && normalizedCategory.length > 0,
    staleTime: 30_000,
  })

  const selectedWorklogQuery = useQuery({
    queryKey: ['worklog-detail', selectedWorklogId],
    queryFn: () => fetchWorkLog(selectedWorklogId as number),
    enabled: selectedWorklogId != null,
  })

  const stepDocuments = useMemo(() => {
    if (!task || !workflowInstance || !workflowTemplate) return []
    const matchedStepInstance = workflowInstance.step_instances.find((step) => step.task_id === task.id)
    if (!matchedStepInstance) return []
    const matchedStep = workflowTemplate.steps.find((step) => step.id === matchedStepInstance.workflow_step_id)
    return matchedStep?.step_documents ?? []
  }, [workflowInstance, workflowTemplate, task])

  const criticalLessons = useMemo(() => {
    const rows = lessonQuery.data ?? []
    return rows.filter((lesson) =>
      (lesson.match_flags || []).some((flag) => flag === 'same_investment' || flag === 'same_company' || flag === 'same_fund'),
    )
  }, [lessonQuery.data])

  const uncheckedCriticalCount = criticalLessons.filter((lesson) => !lessonChecks[lesson.id]).length

  if (!task) return null

  const toggleLessonCheck = (lessonId: number, checked: boolean) => {
    setLessonChecks((prev) => {
      const next = { ...prev, [lessonId]: checked }
      const acknowledgedIds = Object.entries(next)
        .filter(([, value]) => Boolean(value))
        .map(([id]) => Number(id))
      window.sessionStorage.setItem(`task-lesson-acks:${task.id}`, JSON.stringify(acknowledgedIds))
      return next
    })
  }

  const requestComplete = () => {
    if (uncheckedCriticalCount > 0) {
      setShowLessonWarning(true)
      const shouldProceed = window.confirm(
        `핵심 교훈 ${uncheckedCriticalCount}건이 미확인 상태입니다. 그래도 완료 처리하시겠습니까?`,
      )
      if (!shouldProceed) return
    }
    onComplete(task)
  }

  return (
    <>
      <aside className="fixed right-0 top-[54px] z-40 h-[calc(100vh-54px)] w-full max-w-[500px] border-l border-[#d8e5fb] bg-white shadow-2xl sm:right-2 sm:top-[58px] sm:h-[calc(100vh-66px)] sm:rounded-2xl xl:right-4">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#d8e5fb] px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-[#64748b]">업무 상세</p>
              <h3 className="line-clamp-1 text-base font-semibold text-[#0f1f3d]">{task.title}</h3>
            </div>
            <button type="button" onClick={onClose} className="icon-btn text-[#64748b]" aria-label="업무 상세 닫기">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {mode === 'detail' ? (
              <>
                <div className="overflow-hidden rounded-xl border border-[#d8e5fb] bg-[#f5f9ff]">
                  <button
                    type="button"
                    onClick={() => setShowLessons((prev) => !prev)}
                    className="flex w-full items-center justify-between px-3 py-2"
                  >
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1a3660]">
                      <BookOpenText size={14} />
                      과거 교훈 리마인드
                    </span>
                    <ChevronDown size={14} className={`text-[#64748b] transition-transform ${showLessons ? 'rotate-180' : ''}`} />
                  </button>
                  {showLessons && (
                    <div className="space-y-2 border-t border-[#d8e5fb] px-3 py-3">
                      {normalizedCategory.length === 0 ? (
                        <p className="text-xs text-[#64748b]">카테고리 미지정으로 교훈을 조회할 수 없습니다.</p>
                      ) : lessonQuery.isLoading ? (
                        <p className="text-xs text-[#64748b]">교훈을 불러오는 중입니다...</p>
                      ) : lessonQuery.isError ? (
                        <p className="text-xs text-[#64748b]">교훈 조회에 실패했습니다.</p>
                      ) : (lessonQuery.data?.length ?? 0) === 0 ? (
                        <p className="text-xs text-[#64748b]">참고할 교훈이 없습니다.</p>
                      ) : (
                        lessonQuery.data!.map((lesson) => {
                          const flags = lesson.match_flags || []
                          const checked = Boolean(lessonChecks[lesson.id])
                          return (
                            <div key={lesson.id} className="rounded-lg border border-[#d8e5fb] bg-white px-2.5 py-2">
                              <div className="flex items-start gap-2">
                                <label className="mt-0.5 inline-flex cursor-pointer items-center gap-1 text-[11px] text-[#64748b]">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => toggleLessonCheck(lesson.id, event.target.checked)}
                                  />
                                  확인
                                </label>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs leading-5 text-[#0f1f3d]">• {lesson.content}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                                    {flags.includes('same_investment') && <span className="rounded bg-[#e6efff] px-1.5 py-0.5 text-[#1a3660]">같은 투자</span>}
                                    {flags.includes('same_company') && <span className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-[#1a3660]">같은 회사</span>}
                                    {flags.includes('same_fund') && <span className="rounded bg-[#f1f6ff] px-1.5 py-0.5 text-[#1a3660]">같은 조합</span>}
                                    {lesson.fund_name && <span className="text-[#64748b]">{lesson.fund_name}</span>}
                                    <span className="text-[#94a3b8]">{lesson.worklog_date}</span>
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <p className="truncate text-[11px] text-[#64748b]">원문: {lesson.task_title || '업무기록'}</p>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedWorklogId(lesson.worklog_id)}
                                      className="rounded border border-[#d8e5fb] px-1.5 py-0.5 text-[11px] text-[#1a3660] hover:bg-[#f5f9ff]"
                                    >
                                      원문 보기
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                      {showLessonWarning && uncheckedCriticalCount > 0 && (
                        <div className="flex items-center gap-1 rounded border border-[#bfa5a7] bg-[#f1e8e9] px-2 py-1 text-[11px] text-[#3b1219]">
                          <AlertTriangle size={12} />
                          핵심 교훈 {uncheckedCriticalCount}건 미확인 상태입니다.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#d8e5fb] bg-white p-3 text-sm text-[#0f1f3d]">
                  <div className="grid grid-cols-2 gap-2">
                    <p><span className="font-semibold">사분면</span> {task.quadrant}</p>
                    <p><span className="font-semibold">예상 시간</span> {task.estimated_time || '-'}</p>
                    <p><span className="font-semibold">마감</span> {task.deadline ? new Date(task.deadline).toLocaleString('ko-KR') : '-'}</p>
                    <p><span className="font-semibold">카테고리</span> {task.category || '-'}</p>
                    <p><span className="font-semibold">조합</span> {task.fund_name || '-'}</p>
                    <p><span className="font-semibold">고유계정</span> {task.gp_entity_name || '-'}</p>
                    <p><span className="font-semibold">피투자사</span> {task.company_name || '-'}</p>
                    <p><span className="font-semibold">담당</span> {task.delegate_to || '-'}</p>
                  </div>
                  {task.memo && (
                    <div className="mt-3 rounded-lg border border-[#e4e7ee] bg-[#f8fafc] px-2 py-1.5 text-xs text-[#475569]">
                      {task.memo}
                    </div>
                  )}
                </div>

                {task.workflow_instance_id && (
                  <div className="rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] px-3 py-2">
                    <p className="text-xs font-semibold text-[#1a3660]">연계 서류</p>
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
                      <p className="mt-1 text-xs text-[#64748b]">연계된 서류가 없습니다.</p>
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

          <div className="flex flex-wrap gap-2 border-t border-[#d8e5fb] px-5 py-3">
            {mode === 'detail' ? (
              <>
                {task.status !== 'completed' && (
                  <button type="button" onClick={requestComplete} className="primary-btn btn-sm">
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

      {selectedWorklogId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setSelectedWorklogId(null)}>
          <div
            className="w-full max-w-xl rounded-2xl border border-[#d8e5fb] bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[#0f1f3d]">업무기록 원문</h4>
              <button type="button" onClick={() => setSelectedWorklogId(null)} className="icon-btn text-[#64748b]">
                <X size={14} />
              </button>
            </div>
            {selectedWorklogQuery.isLoading ? (
              <p className="text-sm text-[#64748b]">원문을 불러오는 중입니다...</p>
            ) : selectedWorklogQuery.isError ? (
              <p className="text-sm text-[#64748b]">원문 조회에 실패했습니다.</p>
            ) : selectedWorklogQuery.data ? (
              <div className="space-y-2 text-sm text-[#0f1f3d]">
                <p><span className="font-semibold">제목</span> {selectedWorklogQuery.data.title}</p>
                <p><span className="font-semibold">일자</span> {selectedWorklogQuery.data.date}</p>
                <p><span className="font-semibold">카테고리</span> {selectedWorklogQuery.data.category}</p>
                <div className="rounded-lg border border-[#e4e7ee] bg-[#f8fafc] px-3 py-2 text-sm text-[#334155]">
                  {selectedWorklogQuery.data.content || '기록된 본문이 없습니다.'}
                </div>
                {selectedWorklogQuery.data.lessons?.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-[#64748b]">교훈</p>
                    <ul className="space-y-1">
                      {selectedWorklogQuery.data.lessons.map((item) => (
                        <li key={item.id} className="rounded border border-[#d8e5fb] bg-white px-2 py-1 text-xs text-[#0f1f3d]">
                          • {item.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[#64748b]">조회된 데이터가 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
