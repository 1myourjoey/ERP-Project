import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Clock, GitBranch, Plus, Trash2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import CompleteModal from '../components/CompleteModal'
import MiniCalendar from '../components/MiniCalendar'
import TimeSelect from '../components/TimeSelect'
import { HOUR_OPTIONS } from '../components/timeOptions'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import {
  completeTask,
  createTask,
  deleteTask,
  fetchFunds,
  fetchGPEntities,
  fetchTask,
  fetchTasks,
  fetchWorkflows,
  fetchTaskBoard,
  instantiateWorkflow,
  moveTask,
  updateTask,
} from '../lib/api'
import type { Fund, GPEntity, Task, TaskBoard, TaskCreate, WorkflowListItem } from '../lib/api'

const QUADRANTS = [
  { key: 'Q1', label: '긴급·중요 (Q1)', color: 'border-red-400', bg: 'bg-red-50', badge: 'bg-red-500' },
  { key: 'Q2', label: '중요·비긴급 (Q2)', color: 'border-blue-400', bg: 'bg-blue-50', badge: 'bg-blue-500' },
  { key: 'Q3', label: '긴급·비중요 (Q3)', color: 'border-amber-400', bg: 'bg-amber-50', badge: 'bg-amber-500' },
  { key: 'Q4', label: '비긴급·비중요 (Q4)', color: 'border-gray-300', bg: 'bg-gray-50', badge: 'bg-gray-400' },
] as const

interface WorkflowGroup {
  workflowInstanceId: number
  tasks: Task[]
  currentStep: Task | null
  progress: string
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case '투자실행':
      return 'bg-red-50 text-red-700'
    case 'LP보고':
      return 'bg-green-50 text-green-700'
    case '사후관리':
      return 'bg-amber-50 text-amber-700'
    case '규약/총회':
      return 'bg-indigo-50 text-indigo-700'
    case '서류관리':
      return 'bg-orange-50 text-orange-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function splitDeadline(deadline: string | null): { date: string; hour: string } {
  if (!deadline) return { date: '', hour: '' }
  const [datePart = '', timePart = ''] = deadline.split('T')
  const hour = timePart.slice(0, 5)
  return { date: datePart, hour: hour || '' }
}

function combineDeadline(date: string, hour: string): string | null {
  if (!date) return null
  return hour ? `${date}T${hour}` : date
}

function groupTasksByWorkflow(tasks: Task[]): { standalone: Task[]; workflows: WorkflowGroup[] } {
  const standalone: Task[] = []
  const wfMap = new Map<number, Task[]>()

  for (const task of tasks) {
    if (task.workflow_instance_id) {
      const id = task.workflow_instance_id
      const list = wfMap.get(id) || []
      list.push(task)
      wfMap.set(id, list)
    } else {
      standalone.push(task)
    }
  }

  const workflows: WorkflowGroup[] = []
  for (const [workflowInstanceId, wfTasks] of wfMap.entries()) {
    const sorted = [...wfTasks].sort((a, b) => (a.workflow_step_order || 0) - (b.workflow_step_order || 0))
    const currentStep = sorted.find((task) => task.status !== 'completed') || sorted[0] || null
    const completedCount = sorted.filter((task) => task.status === 'completed').length
    workflows.push({
      workflowInstanceId,
      tasks: sorted,
      currentStep,
      progress: `${completedCount}/${sorted.length}`,
    })
  }

  workflows.sort((a, b) => (a.currentStep?.workflow_step_order || 0) - (b.currentStep?.workflow_step_order || 0))
  return { standalone, workflows }
}

function TaskItem({
  task,
  onComplete,
  onDelete,
  onEdit,
  isBlinking = false,
}: {
  task: Task
  onComplete: (task: Task) => void
  onDelete: (id: number) => void
  onEdit: (task: Task) => void
  isBlinking?: boolean
}) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      id={`task-${task.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('taskId', String(task.id))
        e.dataTransfer.setData('fromQuadrant', task.quadrant)
      }}
      className={`group flex items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 transition-shadow hover:shadow-sm ${
        isBlinking ? 'animate-pulse ring-2 ring-blue-400' : ''
      }`}
    >
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(task)}>
        <p className="text-sm leading-snug text-gray-800">{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          {deadlineStr && <span>{deadlineStr}</span>}
          {task.estimated_time && (
            <span className="flex items-center gap-0.5">
              <Clock size={11} /> {task.estimated_time}
            </span>
          )}
          {task.workflow_instance_id && <span className="text-indigo-500">WF</span>}
          {task.category && (
            <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${categoryBadgeClass(task.category)}`}>
              {task.category}
            </span>
          )}
          {task.fund_name && (
            <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">{task.fund_name}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onComplete(task)}
          className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          완료
        </button>
        <button
          onClick={() => onEdit(task)}
          className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
        >
          수정
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="text-gray-400 opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
          title="삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function WorkflowGroupCard({
  group,
  onComplete,
  onDelete,
  onEdit,
  blinkingId,
}: {
  group: WorkflowGroup
  onComplete: (task: Task) => void
  onDelete: (id: number) => void
  onEdit: (task: Task) => void
  blinkingId: number | null
}) {
  const hasBlinkingTask = blinkingId != null && group.tasks.some((task) => task.id === blinkingId)
  const [expanded, setExpanded] = useState(hasBlinkingTask)

  useEffect(() => {
    if (hasBlinkingTask) {
      setExpanded(true)
    }
  }, [hasBlinkingTask])

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/50">
      <button onClick={() => setExpanded((prev) => !prev)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <span className="text-indigo-500">
          <GitBranch size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-indigo-800">{group.currentStep?.fund_name || '워크플로'}</p>
          <p className="truncate text-xs text-indigo-600">현재: {group.currentStep?.title || '-'}</p>
        </div>
        <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
          {group.progress}
        </span>
        <ChevronDown size={14} className={`text-indigo-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </button>

      {expanded && (
        <div className="space-y-1 border-t border-indigo-200 px-2 py-1.5">
          {group.tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={onComplete}
              onDelete={onDelete}
              onEdit={onEdit}
              isBlinking={blinkingId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AddTaskForm({ quadrant }: { quadrant: string }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineHour, setDeadlineHour] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [relatedTarget, setRelatedTarget] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('')

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({
    queryKey: ['gp-entities'],
    queryFn: fetchGPEntities,
  })

  const { data: templates = [] } = useQuery<WorkflowListItem[]>({
    queryKey: ['workflow-templates'],
    queryFn: fetchWorkflows,
  })

  const createTaskMut = useMutation({
    mutationFn: createTask,
  })

  const instantiateMut = useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: number
      data: { name: string; trigger_date: string; fund_id?: number; gp_entity_id?: number; memo?: string }
    }) =>
      instantiateWorkflow(workflowId, data),
  })

  const resetForm = () => {
    setTitle('')
    setDeadlineDate('')
    setDeadlineHour('')
    setEstimatedTime('')
    setRelatedTarget('')
    setSelectedTemplateId('')
    setOpen(false)
  }

  const submit = async () => {
    if (!title.trim()) return
    const selectedFundId = relatedTarget.startsWith('fund:') ? Number(relatedTarget.slice(5)) : null
    const selectedGpEntityId = relatedTarget.startsWith('gp:') ? Number(relatedTarget.slice(3)) : null

    if (selectedTemplateId && !relatedTarget) {
      addToast('error', '워크플로 템플릿 실행 시 관련 대상(조합/고유계정)을 선택해 주세요.')
      return
    }
    if (selectedTemplateId && !deadlineDate) {
      addToast('error', '워크플로 시작 기준일(마감일)을 입력해 주세요.')
      return
    }

    try {
      if (selectedTemplateId) {
        await instantiateMut.mutateAsync({
          workflowId: selectedTemplateId,
          data: {
            name: title.trim(),
            trigger_date: deadlineDate,
            fund_id: selectedFundId || undefined,
            gp_entity_id: selectedGpEntityId || undefined,
            memo: '',
          },
        })
        queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
        queryClient.invalidateQueries({ queryKey: ['workflow-instances'] })
        addToast('success', '워크플로 인스턴스를 생성했습니다.')
      } else {
        await createTaskMut.mutateAsync({
          title: title.trim(),
          quadrant,
          deadline: combineDeadline(deadlineDate, deadlineHour),
          estimated_time: estimatedTime || null,
          fund_id: selectedFundId || null,
          gp_entity_id: selectedGpEntityId || null,
        })
        addToast('success', '작업이 추가되었습니다.')
      }

      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      resetForm()
    } catch {
      // Axios interceptor already shows toast.
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1 rounded-md py-2 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <Plus size={14} /> 추가
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white p-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">작업 제목</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="예: 투자자 업데이트 메일 발송"
          className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">마감일</label>
          <input
            type="date"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">시간</label>
          <select
            value={deadlineHour}
            onChange={(e) => setDeadlineHour(e.target.value)}
            className="w-full rounded border border-gray-200 px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">선택</option>
            {HOUR_OPTIONS.map((hour) => (
              <option key={hour} value={hour}>{hour}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">예상 시간</label>
          <TimeSelect
            value={estimatedTime}
            onChange={setEstimatedTime}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">관련 대상</label>
          <select
            value={relatedTarget}
            onChange={(e) => setRelatedTarget(e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">관련 대상 선택</option>
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
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">워크플로 템플릿</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">템플릿 선택</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </div>
      </div>
      {relatedTarget.startsWith('fund:') && selectedTemplateId && (
        <p className="text-xs text-gray-500">
          선택한 조합의 통지기간을 반영해 단계 일정이 자동 계산됩니다.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={createTaskMut.isPending || instantiateMut.isPending}
          className="primary-btn w-full disabled:opacity-60"
        >
          {createTaskMut.isPending || instantiateMut.isPending ? '처리중...' : '추가'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100">취소</button>
      </div>
    </div>
  )
}

function EditTaskModal({
  task,
  onSave,
  onCancel,
  fundsForFilter,
  gpEntities,
}: {
  task: Task
  onSave: (id: number, data: Partial<TaskCreate>) => void
  onCancel: () => void
  fundsForFilter: Fund[]
  gpEntities: GPEntity[]
}) {
  const initialDeadline = splitDeadline(task.deadline)
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

  const submit = () => {
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
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">작업 수정</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">×</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">제목</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
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
                  <option value="Q1">긴급·중요 (Q1)</option>
                  <option value="Q2">중요·비긴급 (Q2)</option>
                  <option value="Q3">긴급·비중요 (Q3)</option>
                  <option value="Q4">비긴급·비중요 (Q4)</option>
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
                  <option value="투자실행">투자실행</option>
                  <option value="LP보고">LP보고</option>
                  <option value="사후관리">사후관리</option>
                  <option value="규약/총회">규약/총회</option>
                  <option value="서류관리">서류관리</option>
                  <option value="일반">일반</option>
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
                    {fundsForFilter.map((fund) => (
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
                placeholder="선택 입력"
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

function TaskDetailModal({
  task,
  onClose,
  onEdit,
  onComplete,
}: {
  task: Task
  onClose: () => void
  onEdit: (task: Task) => void
  onComplete: (task: Task) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{task.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          {task.deadline && (
            <div><span className="font-medium">마감:</span> {new Date(task.deadline).toLocaleString('ko-KR')}</div>
          )}
          {task.estimated_time && (
            <div><span className="font-medium">예상 시간:</span> {task.estimated_time}</div>
          )}
          {task.fund_name && (
            <div><span className="font-medium">조합:</span> {task.fund_name}</div>
          )}
          {task.gp_entity_name && (
            <div><span className="font-medium">고유계정:</span> {task.gp_entity_name}</div>
          )}
          {task.company_name && (
            <div><span className="font-medium">피투자사:</span> {task.company_name}</div>
          )}
          {task.category && (
            <div><span className="font-medium">카테고리:</span> {task.category}</div>
          )}
          <div><span className="font-medium">사분면:</span> {task.quadrant}</div>
          {task.memo && (
            <div><span className="font-medium">메모:</span> {task.memo}</div>
          )}
          {task.delegate_to && (
            <div><span className="font-medium">담당자:</span> {task.delegate_to}</div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {task.status !== 'completed' && (
            <>
              <button
                onClick={() => onComplete(task)}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
              >
                완료
              </button>
              <button
                onClick={() => onEdit(task)}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                수정
              </button>
            </>
          )}
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

export default function TaskBoardPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const location = useLocation()
  const highlightTaskId = (location.state as { highlightTaskId?: number } | null)?.highlightTaskId

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed'>('pending')
  const [fundFilter, setFundFilter] = useState('')
  const [completedYear, setCompletedYear] = useState(currentYear)
  const [completedMonth, setCompletedMonth] = useState<number | ''>(currentMonth)
  const [showMiniCalendar, setShowMiniCalendar] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [dragOverQuadrant, setDragOverQuadrant] = useState<string | null>(null)
  const [blinkingId, setBlinkingId] = useState<number | null>(null)
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null)

  const completedYearOptions = [0, 1, 2].map((offset) => currentYear - offset)

  const { data: board, isLoading } = useQuery<TaskBoard>({
    queryKey: ['taskBoard', statusFilter, completedYear, completedMonth],
    queryFn: () =>
      fetchTaskBoard(
        statusFilter,
        statusFilter === 'completed' ? completedYear : undefined,
        statusFilter === 'completed' && completedMonth !== '' ? completedMonth : undefined,
      ),
  })

  const { data: fundsForFilter = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({
    queryKey: ['gp-entities'],
    queryFn: fetchGPEntities,
  })
  const { data: calendarTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', { status: 'all' }],
    queryFn: () => fetchTasks({ status: 'all' }),
    enabled: showMiniCalendar,
  })

  const calendarTaskMap = useMemo(
    () => new Map(calendarTasks.map((task) => [task.id, task])),
    [calendarTasks],
  )

  useEffect(() => {
    if (!highlightTaskId) return

    setStatusFilter('all')
    setFundFilter('')
    setShowMiniCalendar(false)
    setBlinkingId(highlightTaskId)
    setPendingScrollId(highlightTaskId)

    const timer = window.setTimeout(() => {
      setBlinkingId((prev) => (prev === highlightTaskId ? null : prev))
    }, 3000)

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)

    return () => window.clearTimeout(timer)
  }, [highlightTaskId])

  useEffect(() => {
    if (!pendingScrollId || showMiniCalendar) return
    const el = document.getElementById(`task-${pendingScrollId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setPendingScrollId(null)
  }, [pendingScrollId, showMiniCalendar, board])

  const filterByFund = (tasks: Task[]) => {
    if (fundFilter === '') return tasks
    if (fundFilter.startsWith('gp:')) {
      const gpEntityId = Number(fundFilter.slice(3))
      return tasks.filter((task) => task.gp_entity_id === gpEntityId)
    }
    if (fundFilter.startsWith('fund:')) {
      const fundId = Number(fundFilter.slice(5))
      return tasks.filter((task) => task.fund_id === fundId)
    }
    const numeric = Number(fundFilter)
    return Number.isFinite(numeric) ? tasks.filter((task) => task.fund_id === numeric) : tasks
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskCreate> }) => updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditingTask(null)
      addToast('success', '작업이 수정되었습니다.')
    },
  })

  const completeMutation = useMutation({
    mutationFn: ({
      id,
      actualTime,
      autoWorklog,
      memo,
    }: {
      id: number
      actualTime: string
      autoWorklog: boolean
      memo?: string
    }) => completeTask(id, actualTime, autoWorklog, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCompletingTask(null)
      addToast('success', '작업이 완료 처리되었습니다.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', '작업이 삭제되었습니다.')
    },
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, quadrant }: { id: number; quadrant: string }) => moveTask(id, quadrant),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', '작업 위치가 변경되었습니다.')
    },
  })

  const handleDeleteTask = (id: number) => {
    if (window.confirm('이 작업을 삭제하시겠습니까?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleMiniCalendarTaskClick = async (taskId: number) => {
    const normalizedTaskId = Math.abs(Number(taskId))
    if (!Number.isFinite(normalizedTaskId) || normalizedTaskId <= 0) return

    const target = calendarTaskMap.get(normalizedTaskId)
    if (target) {
      setDetailTask(target)
      return
    }

    try {
      const fetched = await fetchTask(normalizedTaskId)
      setDetailTask(fetched)
    } catch {
      try {
        const allTasks = await fetchTasks()
        const fallback = allTasks.find((task: Task) => task.id === normalizedTaskId)
        if (fallback) {
          setDetailTask(fallback)
          return
        }
      } catch {
        // fallback query failed, show default toast below
      }
      addToast('error', '업무 상세 정보를 찾지 못했습니다.')
    }
  }

  if (isLoading) return <PageLoading />

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">업무 보드</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {['pending', 'all', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as 'pending' | 'all' | 'completed')}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  statusFilter === status ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {status === 'pending' ? '진행 중' : status === 'all' ? '전체' : '완료'}
              </button>
            ))}
          </div>

          {statusFilter === 'completed' && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-gray-500">연도</label>
                <select
                  value={completedYear}
                  onChange={(e) => setCompletedYear(Number(e.target.value))}
                  className="rounded border border-gray-200 px-2 py-1 text-xs"
                >
                  {completedYearOptions.map((year) => (
                    <option key={year} value={year}>{year}년</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-gray-500">월</label>
                <select
                  value={completedMonth}
                  onChange={(e) => setCompletedMonth(e.target.value ? Number(e.target.value) : '')}
                  className="rounded border border-gray-200 px-2 py-1 text-xs"
                >
                  <option value="">전체 월</option>
                  {Array.from({ length: 12 }, (_, idx) => (
                    <option key={idx + 1} value={idx + 1}>{idx + 1}월</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] font-medium text-gray-500">대상</label>
            <select
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1 text-xs"
            >
              <option value="">전체 대상</option>
              {gpEntities.length > 0 && (
                <optgroup label="고유계정">
                  {gpEntities.map((entity) => (
                    <option key={`gp-filter-${entity.id}`} value={`gp:${entity.id}`}>{entity.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="조합">
                {fundsForFilter.map((fund) => (
                  <option key={`fund-filter-${fund.id}`} value={`fund:${fund.id}`}>{fund.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <button
            onClick={() => setShowMiniCalendar((prev) => !prev)}
            className={`rounded-lg px-3 py-1 text-xs ${
              showMiniCalendar ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {showMiniCalendar ? '업무 보드' : '캘린더'}
          </button>
        </div>
      </div>

      {showMiniCalendar ? (
        <div className="w-full">
          <MiniCalendar
            onTaskClick={(taskId) => {
              void handleMiniCalendarTaskClick(taskId)
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {QUADRANTS.map((quadrant) => {
            const allTasks = filterByFund(board?.[quadrant.key] || [])
            const { standalone, workflows } = groupTasksByWorkflow(allTasks)

            return (
              <div
                key={quadrant.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverQuadrant(quadrant.key)
                }}
                onDragLeave={() => setDragOverQuadrant((prev) => (prev === quadrant.key ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverQuadrant(null)
                  const taskId = Number(e.dataTransfer.getData('taskId'))
                  const fromQuadrant = e.dataTransfer.getData('fromQuadrant')
                  if (!taskId || !fromQuadrant || fromQuadrant === quadrant.key) return
                  moveMutation.mutate({ id: taskId, quadrant: quadrant.key })
                }}
                className={`rounded-xl border-2 p-4 ${quadrant.color} ${quadrant.bg} ${
                  dragOverQuadrant === quadrant.key ? 'border-dashed ring-2 ring-inset ring-blue-300' : ''
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${quadrant.badge}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{quadrant.label}</h3>
                  <span className="ml-auto text-xs text-gray-400">{allTasks.length}</span>
                </div>

                <div className="space-y-1.5">
                  {standalone.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onComplete={setCompletingTask}
                      onEdit={setEditingTask}
                      onDelete={handleDeleteTask}
                      isBlinking={blinkingId === task.id}
                    />
                  ))}

                  {workflows.map((group) => (
                    <WorkflowGroupCard
                      key={group.workflowInstanceId}
                      group={group}
                      onComplete={setCompletingTask}
                      onEdit={setEditingTask}
                      onDelete={handleDeleteTask}
                      blinkingId={blinkingId}
                    />
                  ))}
                </div>

                <div className="mt-2">
                  <AddTaskForm quadrant={quadrant.key} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          fundsForFilter={fundsForFilter}
          gpEntities={gpEntities}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
          onCancel={() => setEditingTask(null)}
        />
      )}

      {completingTask && (
        <CompleteModal
          task={completingTask}
          onConfirm={(actualTime, autoWorklog, memo) =>
            completeMutation.mutate({ id: completingTask.id, actualTime, autoWorklog, memo })
          }
          onCancel={() => setCompletingTask(null)}
        />
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={(task) => {
            setDetailTask(null)
            setEditingTask(task)
          }}
          onComplete={(task) => {
            setDetailTask(null)
            setCompletingTask(task)
          }}
        />
      )}
    </div>
  )
}

