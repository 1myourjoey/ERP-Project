import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileWarning, GitBranch, Pin, Plus, Send } from 'lucide-react'

import CompleteModal from '../components/CompleteModal'
import EmptyState from '../components/EmptyState'
import EditTaskModal from '../components/EditTaskModal'
import TaskPipelineView from '../components/TaskPipelineView'
import TimeSelect from '../components/TimeSelect'
import { useToast } from '../contexts/ToastContext'
import {
  completeTask,
  createTask,
  fetchDashboard,
  fetchGPEntities,
  fetchUpcomingNotices,
  fetchWorkflow,
  fetchWorkflowInstance,
  generateMonthlyReminders,
  undoCompleteTask,
  updateTask,
  type ActiveWorkflow,
  type DashboardResponse,
  type FundSummary,
  type GPEntity,
  type MissingDocument,
  type Task,
  type TaskCreate,
  type UpcomingNotice,
  type UpcomingReport,
  type WorkflowInstance,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import PageLoading from '../components/PageLoading'
import { detectNoticeReport } from '../lib/taskFlags'

const RIGHT_TABS = [
  { key: 'funds', label: '조합', icon: Building2 },
  { key: 'notices', label: '통지', icon: Clock },
  { key: 'reports', label: '보고', icon: Send },
  { key: 'documents', label: '서류', icon: FileWarning },
] as const

const TASK_CATEGORY_OPTIONS = ['투자실행', 'LP보고', '사후관리', '규약/총회', '서류관리', '일반']

type RightTab = typeof RIGHT_TABS[number]['key']
type PopupSection = 'today' | 'tomorrow' | 'this_week' | 'workflows' | 'documents' | 'reports' | 'completed'

function formatShortDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function safeFormatDate(value: string | null | undefined): string {
  if (!value) return '날짜 미지정'
  const date = new Date(`${value}T00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })
}

function dueBadge(daysRemaining: number | null): { text: string; className: string } | null {
  if (daysRemaining == null) return null
  if (daysRemaining < 0) return { text: `지연 D+${Math.abs(daysRemaining)}`, className: 'tag tag-red' }
  if (daysRemaining <= 3) return { text: `D-${daysRemaining}`, className: 'tag tag-red' }
  if (daysRemaining <= 7) return { text: `D-${daysRemaining}`, className: 'tag tag-amber' }
  return { text: `D-${daysRemaining}`, className: 'tag tag-gray' }
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case '투자실행':
      return 'tag tag-red'
    case 'LP보고':
      return 'tag tag-green'
    case '사후관리':
      return 'tag tag-amber'
    case '규약/총회':
      return 'tag tag-indigo'
    case '서류관리':
      return 'tag tag-purple'
    default:
      return 'tag tag-gray'
  }
}

function parseWorkflowProgress(progress: string): { current: number; total: number; percent: number } {
  const match = progress.match(/(\d+)\/(\d+)/)
  if (!match) return { current: 0, total: 1, percent: 0 }
  const current = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return { current, total, percent }
}

function groupByCategory(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.category || task.fund_name || '일반'
    const existing = groups.get(key) || []
    existing.push(task)
    groups.set(key, existing)
  }
  return groups
}

function addDays(baseDate: string, days: number): string {
  const value = new Date(`${baseDate}T00:00:00`)
  value.setDate(value.getDate() + days)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function weekRangeLabelMondayToSunday(baseDate: string): string {
  const base = new Date(`${baseDate}T00:00:00`)
  const day = base.getDay() // Sun=0, Mon=1, ... Sat=6
  const diffToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(base)
  monday.setDate(base.getDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(monday)}~${fmt(sunday)}`
}

function ListPopupModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function TaskDetailModal({
  task,
  onClose,
  onComplete,
  onGoTaskBoard,
  editable = true,
}: {
  task: Task
  onClose: () => void
  onComplete: (task: Task) => void
  onGoTaskBoard: (task: Task) => void
  editable?: boolean
}) {
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
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{task.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="space-y-2 text-sm text-gray-700">
          {task.deadline && <div><span className="font-medium">마감:</span> {new Date(task.deadline).toLocaleString('ko-KR')}</div>}
          {task.estimated_time && <div><span className="font-medium">예상 시간:</span> {task.estimated_time}</div>}
          {task.fund_name && <div><span className="font-medium">조합:</span> {task.fund_name}</div>}
          {task.gp_entity_name && <div><span className="font-medium">고유계정:</span> {task.gp_entity_name}</div>}
          {task.company_name && <div><span className="font-medium">피투자사:</span> {task.company_name}</div>}
          {task.category && <div><span className="font-medium">카테고리:</span> {task.category}</div>}
          <div><span className="font-medium">사분면:</span> {task.quadrant}</div>
          {task.memo && <div><span className="font-medium">메모:</span> {task.memo}</div>}
          {task.delegate_to && <div><span className="font-medium">담당자:</span> {task.delegate_to}</div>}
          {task.workflow_instance_id && (
            <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2">
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
        {!editable && (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
            파이프라인에서는 대기 업무만 수정 가능
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          {task.status !== 'completed' && (
            <button onClick={() => onComplete(task)} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">완료</button>
          )}
          <button onClick={() => onGoTaskBoard(task)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">{editable ? '업무보드에서 수정' : '업무보드에서 확인'}</button>
          <button onClick={onClose} className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300">닫기</button>
        </div>
      </div>
    </div>
  )
}

function workflowStepBadgeClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'tag tag-emerald'
    case 'in_progress':
      return 'tag tag-blue'
    case 'skipped':
      return 'tag tag-amber'
    case 'pending':
    default:
      return 'tag tag-gray'
  }
}

function WorkflowStageModal({
  workflow,
  instance,
  loading,
  onClose,
  onOpenWorkflowPage,
}: {
  workflow: ActiveWorkflow
  instance?: WorkflowInstance
  loading: boolean
  onClose: () => void
  onOpenWorkflowPage: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">워크플로우 단계 확인</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm font-semibold text-indigo-900">{workflow.name}</p>
          <p className="mt-1 text-xs text-indigo-700">
            {workflow.fund_name || workflow.gp_entity_name || '연결 정보 없음'}
            {workflow.company_name ? ` | ${workflow.company_name}` : ''}
          </p>
          <p className="mt-1 text-xs text-indigo-700">현재 단계: {workflow.next_step || '다음 단계 확인'} | 진행률: {workflow.progress}</p>
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
                  <p className="text-sm font-medium text-gray-800">{index + 1}. {step.step_name}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${workflowStepBadgeClass(step.status)}`}>{step.status}</span>
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
          <button onClick={onClose} className="secondary-btn">닫기</button>
          <button onClick={onOpenWorkflowPage} className="primary-btn">워크플로우 상세로 이동</button>
        </div>
      </div>
    </div>
  )
}

function TaskList({
  title,
  tasks,
  noDeadlineTasks = [],
  onClickTask,
  onQuickComplete,
  completingTaskId,
  onHeaderClick,
  headerAction,
  defaultCollapsed = false,
  emptyEmoji = '📋',
  emptyMessage = '등록된 업무가 없어요',
  emptyAction,
  emptyActionLabel,
}: {
  title: string
  tasks: Task[]
  noDeadlineTasks?: Task[]
  onClickTask: (task: Task) => void
  onQuickComplete?: (task: Task) => void
  completingTaskId: number | null
  onHeaderClick?: () => void
  headerAction?: React.ReactNode
  defaultCollapsed?: boolean
  emptyEmoji?: string
  emptyMessage?: string
  emptyAction?: () => void
  emptyActionLabel?: string
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const groupedTasks = useMemo(() => Array.from(groupByCategory(tasks).entries()), [tasks])
  const groupedNoDeadlineTasks = useMemo(() => Array.from(groupByCategory(noDeadlineTasks).entries()), [noDeadlineTasks])
  const hasAnyTasks = tasks.length > 0 || noDeadlineTasks.length > 0
  return (
    <div className="card-base dashboard-card">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={onHeaderClick} className={`text-sm font-semibold ${onHeaderClick ? 'text-gray-700 hover:text-blue-600' : 'text-gray-700'}`}>{title}</button>
        <div className="flex items-center gap-1">
          {headerAction}
          <span className="text-xs text-gray-400">{tasks.length}건</span>
          <button onClick={() => setCollapsed((prev) => !prev)} className="rounded p-1 hover:bg-gray-100"><ChevronDown size={14} className={`text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} /></button>
        </div>
      </div>
      {!collapsed && (
        !hasAnyTasks ? (
          <div className="rounded-lg border border-dashed border-gray-200">
            <EmptyState
              emoji={emptyEmoji}
              message={emptyMessage}
              action={emptyAction}
              actionLabel={emptyActionLabel}
              className="py-6"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {groupedTasks.map(([category, categoryTasks]) => (
              <div key={`${title}-${category}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={categoryBadgeClass(category)}>{category}</span>
                  <span className="text-[10px] text-gray-400">{categoryTasks.length}건</span>
                </div>
                <div className="space-y-2">
                  {categoryTasks.map((task) => (
                    <div key={task.id} onClick={() => onClickTask(task)} className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-gray-800">{task.title}</p>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                            {task.deadline ? formatShortDate(task.deadline) : '마감 없음'}
                            {task.estimated_time && ` | 예상 ${task.estimated_time}`}
                            {task.fund_name && <span className="text-blue-600">{task.fund_name}</span>}
                          </div>
                        </div>
                        {onQuickComplete && task.status !== 'completed' && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              onQuickComplete(task)
                            }}
                            disabled={completingTaskId === task.id}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                          >
                            {completingTaskId === task.id ? '처리중' : '완료'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {noDeadlineTasks.length > 0 && (
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-2">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-700">
                  <Pin size={12} />
                  <span>기한 미지정 ({noDeadlineTasks.length})</span>
                </div>
                <div className="space-y-2">
                  {groupedNoDeadlineTasks.map(([category, categoryTasks]) => (
                    <div key={`${title}-no-deadline-${category}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className={categoryBadgeClass(category)}>{category}</span>
                        <span className="text-[10px] text-gray-400">{categoryTasks.length}건</span>
                      </div>
                      <div className="space-y-1.5">
                        {categoryTasks.map((task) => (
                          <div key={task.id} onClick={() => onClickTask(task)} className="w-full cursor-pointer rounded-lg border border-amber-200 bg-white px-3 py-2 text-left hover:bg-amber-50">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-800">{task.title}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                                  {task.estimated_time && `예상 ${task.estimated_time}`}
                                  {task.fund_name && <span className="text-blue-600">{task.fund_name}</span>}
                                </div>
                              </div>
                              {onQuickComplete && task.status !== 'completed' && (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onQuickComplete(task)
                                  }}
                                  disabled={completingTaskId === task.id}
                                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                                >
                                  {completingTaskId === task.id ? '처리중' : '완료'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

function QuickAddTaskModal({
  defaultDate,
  baseDate,
  funds,
  gpEntities,
  defaultFundId,
  onAdd,
  onCancel,
}: {
  defaultDate: string
  baseDate: string
  funds: FundSummary[]
  gpEntities: GPEntity[]
  defaultFundId?: number | null
  onAdd: (data: TaskCreate) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [category, setCategory] = useState('')
  const [relatedTarget, setRelatedTarget] = useState<string>(
    defaultFundId ? `fund:${defaultFundId}` : '',
  )
  const [isNotice, setIsNotice] = useState(false)
  const [isReport, setIsReport] = useState(false)
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="mb-1 text-lg font-semibold">빠른 업무 추가</h3>
          <p className="mb-3 text-xs text-gray-500">
            마감일: {defaultDate}
            {defaultDate !== baseDate && <span className="ml-1 text-blue-500">(내일)</span>}
          </p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">업무 제목</label>
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
                placeholder="예: 정기 보고서 작성"
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
            <div><label className="mb-1 block text-xs text-gray-500">예상 시간</label><TimeSelect value={estimatedTime} onChange={setEstimatedTime} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">카테고리</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                  <option value="">선택</option>
                  {TASK_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">관련 대상</label>
                <select
                  value={relatedTarget}
                  onChange={(e) => setRelatedTarget(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="">선택</option>
                  {gpEntities.length > 0 && (
                    <optgroup label="고유계정">
                      {gpEntities.map((entity) => <option key={`gp-${entity.id}`} value={`gp:${entity.id}`}>{entity.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="조합">
                    {funds.map((fund) => <option key={`fund-${fund.id}`} value={`fund:${fund.id}`}>{fund.name}</option>)}
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">취소</button>
            <button
              onClick={() => {
                if (!title.trim()) return
                const selectedFundId = relatedTarget.startsWith('fund:') ? Number(relatedTarget.slice(5)) : null
                const selectedGpEntityId = relatedTarget.startsWith('gp:') ? Number(relatedTarget.slice(3)) : null
                onAdd({
                  title: title.trim(),
                  quadrant: 'Q1',
                  deadline: defaultDate,
                  estimated_time: estimatedTime || null,
                  category: category || null,
                  fund_id: selectedFundId || null,
                  gp_entity_id: selectedGpEntityId || null,
                  is_notice: isNotice,
                  is_report: isReport,
                })
              }}
              className="primary-btn"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function StatCard({ label, value, onClick, variant = 'default' }: { label: string; value: number; onClick?: () => void; variant?: 'default' | 'emerald' }) {
  const isEmerald = variant === 'emerald'
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-3 ${isEmerald ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'} ${onClick ? 'cursor-pointer transition-all hover:border-blue-300 hover:shadow-sm' : ''}`}
    >
      <p className={`text-xs ${isEmerald ? 'text-emerald-600' : 'text-gray-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${isEmerald ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [rightTab, setRightTab] = useState<RightTab>('funds')
  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedTaskEditable, setSelectedTaskEditable] = useState(true)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)
  const [quickAddDefaultDate, setQuickAddDefaultDate] = useState('')
  const [quickAddDefaultFundId, setQuickAddDefaultFundId] = useState<number | null>(null)
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(false)
  const [popupSection, setPopupSection] = useState<PopupSection | null>(null)
  const [completedFilter, setCompletedFilter] = useState<'today' | 'this_week' | 'last_week'>('today')
  const [taskPanel, setTaskPanel] = useState<'daily' | 'weekly'>('daily')
  const [selectedWorkflow, setSelectedWorkflow] = useState<ActiveWorkflow | null>(null)
  const dashboardView = searchParams.get('view') === 'pipeline' ? 'pipeline' : 'default'
  const setDashboardView = (view: 'default' | 'pipeline') => {
    setSearchParams(view === 'pipeline' ? { view: 'pipeline' } : {}, { replace: false })
  }

  const openTaskDetail = (task: Task, editable = true) => {
    if (dashboardView === 'pipeline' && editable) {
      setEditingTask(task)
      return
    }
    setSelectedTask(task)
    setSelectedTaskEditable(editable)
  }

  const { data, isLoading, error } = useQuery<DashboardResponse>({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const { data: upcomingNotices = [] } = useQuery<UpcomingNotice[]>({ queryKey: ['dashboardUpcomingNotices'], queryFn: () => fetchUpcomingNotices(30) })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({ queryKey: ['gp-entities'], queryFn: fetchGPEntities })
  const { data: selectedWorkflowInstance, isLoading: selectedWorkflowLoading } = useQuery<WorkflowInstance>({
    queryKey: ['workflowInstance', selectedWorkflow?.id],
    queryFn: () => fetchWorkflowInstance(selectedWorkflow!.id),
    enabled: selectedWorkflow !== null,
  })

  const openWorkflowModal = (workflow: ActiveWorkflow) => {
    setSelectedWorkflow(workflow)
  }

  const completeTaskMut = useMutation({ mutationFn: ({ id, actualTime, autoWorklog, memo }: { id: number; actualTime: string; autoWorklog: boolean; memo?: string }) => completeTask(id, actualTime, autoWorklog, memo), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); queryClient.invalidateQueries({ queryKey: ['workflowInstances'] }); queryClient.invalidateQueries({ queryKey: ['funds'] }); addToast('success', '업무를 완료했습니다.') } })
  const undoCompleteMut = useMutation({ mutationFn: undoCompleteTask, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); queryClient.invalidateQueries({ queryKey: ['workflowInstances'] }); queryClient.invalidateQueries({ queryKey: ['funds'] }); addToast('success', '완료를 취소했습니다.') } })
  const monthlyReminderMut = useMutation({ mutationFn: generateMonthlyReminders, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); addToast('success', '월간 보고 업무를 생성했습니다.') } })
  const createTaskMut = useMutation({ mutationFn: createTask, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); setShowQuickAddModal(false); addToast('success', '업무가 추가되었습니다.') } })
  const updateTaskMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskCreate> }) => updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      setEditingTask(null)
      addToast('success', '업무를 수정했습니다.')
    },
  })

  const dayLabel = useMemo(() => ({ Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토', Sun: '일' }), [])

  if (isLoading) return <PageLoading />
  if (error || !data) return <div className="page-container text-sm text-red-500">대시보드 데이터를 불러오지 못했습니다.</div>

  const {
    date,
    day_of_week,
    monthly_reminder,
    today = { tasks: [], total_estimated_time: '0m' },
    tomorrow = { tasks: [], total_estimated_time: '0m' },
    this_week = [],
    upcoming = [],
    no_deadline = [],
    active_workflows = [],
    fund_summary = [],
    missing_documents = [],
    upcoming_reports = [],
    completed_today = [],
    completed_today_count = 0,
    completed_this_week_count = 0,
    completed_this_week = [],
    completed_last_week = [],
  } = data
  const todayTasks = Array.isArray(today.tasks) ? today.tasks : []
  const tomorrowTasks = Array.isArray(tomorrow.tasks) ? tomorrow.tasks : []
  const thisWeekTasks = Array.isArray(this_week) ? this_week : []
  const upcomingTasks = Array.isArray(upcoming) ? upcoming : []
  const noDeadlineTasks = Array.isArray(no_deadline) ? no_deadline : []
  const completedTodayTasks = Array.isArray(completed_today) ? completed_today : []
  const completedThisWeekTasks = Array.isArray(completed_this_week) ? completed_this_week : []
  const completedLastWeekTasks = Array.isArray(completed_last_week) ? completed_last_week : []
  const thisWeekRangeLabel = weekRangeLabelMondayToSunday(date)
  const tabCount = { funds: fund_summary.length, notices: upcomingNotices.length, reports: upcoming_reports.length, documents: missing_documents.length }
  const upcomingGrouped = Array.from(groupByCategory(upcomingTasks))
  const filteredCompleted =
    completedFilter === 'today'
      ? completedTodayTasks
      : completedFilter === 'this_week'
        ? completedThisWeekTasks
        : completedLastWeekTasks

  const openQuickAdd = (target: 'today' | 'tomorrow', fundId?: number | null) => { setQuickAddDefaultDate(target === 'today' ? date : addDays(date, 1)); setQuickAddDefaultFundId(fundId ?? null); setShowQuickAddModal(true) }

  const popupTitle = popupSection === 'today' ? '📋 오늘 업무' : popupSection === 'tomorrow' ? '📆 내일 업무' : popupSection === 'this_week' ? `📅 이번 주 업무 (${thisWeekRangeLabel})` : popupSection === 'workflows' ? '🔄 진행 워크플로' : popupSection === 'documents' ? '📁 미수집 서류' : popupSection === 'reports' ? '📊 보고 마감' : '✅ 오늘 완료'

  return (
    <div className={dashboardView === 'pipeline' ? 'mx-auto w-full max-w-[1600px] space-y-4 px-4 py-6' : 'page-container space-y-6'}>
      <div className="page-header mb-0">
        <div>
          <h2 className="page-title">
            {dashboardView === 'pipeline'
              ? '업무 파이프라인'
              : `${new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} (${dayLabel[day_of_week as keyof typeof dayLabel] || day_of_week})`}
          </h2>
          <p className="page-subtitle">
            {dashboardView === 'pipeline' ? '업무 단계를 한 화면에서 확인하세요.' : '오늘의 업무와 마감 일정을 확인하세요.'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setDashboardView('default')}
            className={`rounded-md px-3 py-1.5 text-xs transition ${dashboardView === 'default' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            대시보드
          </button>
          <button
            onClick={() => setDashboardView('pipeline')}
            className={`rounded-md px-3 py-1.5 text-xs transition ${dashboardView === 'pipeline' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            파이프라인
          </button>
        </div>
      </div>

      {dashboardView === 'default' ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="📋 오늘 업무" value={todayTasks.length} onClick={() => setPopupSection('today')} />
        <StatCard label={`📅 이번 주 (${thisWeekRangeLabel})`} value={thisWeekTasks.length} onClick={() => setPopupSection('this_week')} />
        <StatCard label="🔄 진행 워크플로" value={active_workflows.length} onClick={() => setPopupSection('workflows')} />
        <StatCard label="📁 미수집 서류" value={missing_documents.length} onClick={() => setPopupSection('documents')} />
        <StatCard label="📊 보고 마감" value={upcoming_reports.length} onClick={() => setPopupSection('reports')} />
        <StatCard label="✅ 오늘 완료" value={completed_today_count} onClick={() => setPopupSection('completed')} variant="emerald" />
          </div>

          {monthly_reminder && (
            <div className="warning-banner">
              <p className="flex-1 text-sm text-amber-900">이번 달 월간 보고 Task가 아직 생성되지 않았습니다.</p>
              <button
                onClick={() => monthlyReminderMut.mutate(date.slice(0, 7))}
                disabled={monthlyReminderMut.isPending}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700 disabled:bg-amber-300"
              >
                {monthlyReminderMut.isPending ? '생성 중...' : '지금 생성'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="card-base dashboard-card">
            <button onClick={() => setPopupSection('workflows')} className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600"><GitBranch size={16} /> 🔄 진행 중인 워크플로 <span className="ml-auto text-xs text-gray-400">{active_workflows.length}건</span></button>
            {active_workflows.length > 0 ? (
              <>
                <div className="max-h-[160px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {active_workflows.map((wf: ActiveWorkflow) => {
                      const { percent } = parseWorkflowProgress(wf.progress)
                      return (
                        <div key={wf.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-left hover:bg-indigo-100">
                          <button onClick={() => openWorkflowModal(wf)} className="w-full cursor-pointer text-left">
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate text-xs font-medium text-indigo-800">{wf.name}</p>
                              <span className="tag tag-indigo">{wf.progress}</span>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-indigo-600">{wf.fund_name || '-'} | {wf.company_name || '-'}</p>
                            {wf.next_step && <p className="mt-0.5 truncate text-[11px] text-indigo-700">다음: {wf.next_step} {wf.next_step_date ? `(${formatShortDate(wf.next_step_date)})` : ''}</p>}
                            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-indigo-200/60">
                              <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${percent}%` }} />
                            </div>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {active_workflows.length > 4 && (
                  <div className="mt-2 text-center text-[10px] text-gray-400">
                    ↓ 스크롤하여 {active_workflows.length - 4}건 더보기
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                emoji="🔄"
                message="진행 중인 워크플로가 없어요"
                action={() => navigate('/workflows')}
                actionLabel="워크플로 시작"
                className="py-8"
              />
            )}
          </div>

          <div className="space-y-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">업무 현황</h3>
            </div>

            <div className="space-y-3 md:hidden">
              <TaskList
                title={`📋 오늘 (${todayTasks.length}건 ${today.total_estimated_time || '0m'})`}
                tasks={todayTasks}
                noDeadlineTasks={noDeadlineTasks}
                onClickTask={(task) => openTaskDetail(task, true)}
                onQuickComplete={setCompletingTask}
                completingTaskId={completeTaskMut.variables?.id ?? null}
                onHeaderClick={() => setPopupSection('today')}
                headerAction={<button onClick={(e) => { e.stopPropagation(); openQuickAdd('today') }} className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="업무 추가"><Plus size={14} /></button>}
                emptyEmoji="🎉"
                emptyMessage="오늘 예정된 업무가 없어요"
                emptyAction={() => openQuickAdd('today')}
                emptyActionLabel="업무 추가"
              />
              <TaskList
                title={`내일 (${tomorrowTasks.length}건 ${tomorrow.total_estimated_time || '0m'})`}
                tasks={tomorrowTasks}
                onClickTask={(task) => openTaskDetail(task, true)}
                onQuickComplete={setCompletingTask}
                completingTaskId={completeTaskMut.variables?.id ?? null}
                onHeaderClick={() => setPopupSection('tomorrow')}
                headerAction={<button onClick={(e) => { e.stopPropagation(); openQuickAdd('tomorrow') }} className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="업무 추가"><Plus size={14} /></button>}
                defaultCollapsed={true}
              />
              <TaskList
                title={`📅 이번 주 ${thisWeekRangeLabel} (${thisWeekTasks.length}건)`}
                tasks={thisWeekTasks}
                onClickTask={(task) => openTaskDetail(task, true)}
                onQuickComplete={setCompletingTask}
                completingTaskId={completeTaskMut.variables?.id ?? null}
                onHeaderClick={() => setPopupSection('this_week')}
                defaultCollapsed={true}
              />
              <TaskList
                title={`예정 (${upcomingTasks.length}건)`}
                tasks={upcomingTasks}
                onClickTask={(task) => openTaskDetail(task, true)}
                onQuickComplete={setCompletingTask}
                completingTaskId={completeTaskMut.variables?.id ?? null}
                defaultCollapsed={true}
              />
              <TaskList
                title={`완료 (${filteredCompleted.length}건)`}
                tasks={filteredCompleted}
                onClickTask={(task) => openTaskDetail(task, true)}
                completingTaskId={completeTaskMut.variables?.id ?? null}
                defaultCollapsed={true}
              />
            </div>

            <div className="relative hidden overflow-hidden md:block">
              <div className={`px-0.5 transition-all duration-300 ease-out ${taskPanel === 'daily' ? 'relative translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 -translate-x-8 opacity-0'}`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TaskList title={`📋 오늘 (${todayTasks.length}건 ${today.total_estimated_time || '0m'})`} tasks={todayTasks} noDeadlineTasks={noDeadlineTasks} onClickTask={(task) => openTaskDetail(task, true)} onQuickComplete={setCompletingTask} completingTaskId={completeTaskMut.variables?.id ?? null} onHeaderClick={() => setPopupSection('today')} headerAction={<button onClick={(e) => { e.stopPropagation(); openQuickAdd('today') }} className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="업무 추가"><Plus size={14} /></button>} emptyEmoji="🎉" emptyMessage="오늘 예정된 업무가 없어요" emptyAction={() => openQuickAdd('today')} emptyActionLabel="업무 추가" />
                  <TaskList title={`내일 (${tomorrowTasks.length}건 ${tomorrow.total_estimated_time || '0m'})`} tasks={tomorrowTasks} onClickTask={(task) => openTaskDetail(task, true)} onQuickComplete={setCompletingTask} completingTaskId={completeTaskMut.variables?.id ?? null} onHeaderClick={() => setPopupSection('tomorrow')} headerAction={<button onClick={(e) => { e.stopPropagation(); openQuickAdd('tomorrow') }} className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="업무 추가"><Plus size={14} /></button>} />
                </div>
              </div>

              <div className={`px-0.5 transition-all duration-300 ease-out ${taskPanel === 'weekly' ? 'relative translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 translate-x-8 opacity-0'}`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TaskList title={`📅 이번 주 ${thisWeekRangeLabel} (${thisWeekTasks.length}건)`} tasks={thisWeekTasks} onClickTask={(task) => openTaskDetail(task, true)} onQuickComplete={setCompletingTask} completingTaskId={completeTaskMut.variables?.id ?? null} onHeaderClick={() => setPopupSection('this_week')} />

                  <div className="card-base dashboard-card">
                    <button onClick={() => setUpcomingCollapsed((prev) => !prev)} className="mb-2 flex w-full items-center justify-between"><h3 className="text-sm font-semibold text-gray-700">예정 업무</h3><div className="flex items-center gap-2"><span className="text-xs text-gray-400">{upcomingTasks.length}건</span><ChevronDown size={14} className={`text-gray-400 transition-transform ${upcomingCollapsed ? '-rotate-90' : ''}`} /></div></button>
                    {!upcomingTasks.length ? (
                      <div className="rounded-lg border border-dashed border-gray-200">
                        <EmptyState emoji="📅" message="등록된 일정이 없어요" className="py-6" />
                      </div>
                    ) : (
                      !upcomingCollapsed && <div className="space-y-3">{upcomingGrouped.map(([category, tasks]) => <div key={category}><div className="mb-1 flex items-center gap-2"><span className={categoryBadgeClass(category)}>{category}</span><span className="text-[10px] text-gray-400">{tasks.length}건</span></div><div className="space-y-1">{tasks.map((task) => <div key={task.id} onClick={() => openTaskDetail(task, true)} className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm text-gray-800">{task.title}</p><span className="shrink-0 text-xs text-gray-400">{task.deadline ? formatShortDate(task.deadline) : ''}</span></div></div>)}</div></div>)}</div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setTaskPanel('daily')}
                aria-label="이전 패널"
                className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-1.5 text-gray-500 shadow-sm transition-all hover:bg-white hover:text-gray-700 ${taskPanel === 'weekly' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setTaskPanel('weekly')}
                aria-label="다음 패널"
                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-1.5 text-gray-500 shadow-sm transition-all hover:bg-white hover:text-gray-700 ${taskPanel === 'daily' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="hidden justify-center gap-1 md:flex">
              <button onClick={() => setTaskPanel('daily')} className={`h-1.5 w-6 rounded-full transition-colors ${taskPanel === 'daily' ? 'bg-blue-500' : 'bg-gray-300'}`} aria-label="오늘/내일 패널 보기" />
              <button onClick={() => setTaskPanel('weekly')} className={`h-1.5 w-6 rounded-full transition-colors ${taskPanel === 'weekly' ? 'bg-blue-500' : 'bg-gray-300'}`} aria-label="이번주/예정 패널 보기" />
            </div>

          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">{RIGHT_TABS.map((tab) => { const count = tabCount[tab.key]; return <button key={tab.key} onClick={() => setRightTab(tab.key)} className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${rightTab === tab.key ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'}`}><tab.icon size={13} />{tab.label}{count > 0 && <span className="ml-0.5 rounded-full bg-gray-200 px-1.5 text-[10px] text-gray-600">{count}</span>}</button>})}</div>

          {rightTab === 'funds' && (
            <div className="card-base dashboard-card">
              {!fund_summary.length ? (
                <EmptyState emoji="🏦" message="등록된 조합이 없어요" className="py-8" />
              ) : (
                <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                  {fund_summary.map((fund: FundSummary) => (
                    <button
                      key={fund.id}
                      onClick={() => navigate(`/funds/${fund.id}`)}
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-800">{fund.name}</p>
                      <p className="text-xs text-gray-500">LP {fund.lp_count} | 투자 {fund.investment_count} | 약정 {formatKRW(fund.commitment_total)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {rightTab === 'notices' && (
            <div className="card-base dashboard-card">
              {!upcomingNotices.length ? (
                <EmptyState emoji="🗓️" message="다가오는 통지 기한이 없어요" className="py-8" />
              ) : (
                <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                  {upcomingNotices.map((notice, idx) => {
                    const badge = dueBadge(notice.days_remaining)
                    return (
                      <button
                        key={`${notice.workflow_instance_name}-${notice.fund_name}-${idx}`}
                        onClick={() => {
                          if (notice.task_id) {
                            navigate('/tasks', { state: { highlightTaskId: notice.task_id } })
                            return
                          }
                          navigate('/workflows', {
                            state: notice.workflow_instance_id ? { expandInstanceId: notice.workflow_instance_id } : undefined,
                          })
                        }}
                        className="feed-card w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800">{notice.fund_name} | {notice.notice_label}</p>
                          {badge && <span className={badge.className}>{badge.text}</span>}
                        </div>
                        <p className="feed-card-meta">{notice.workflow_instance_name}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">기한 {formatShortDate(notice.deadline)}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {rightTab === 'reports' && (
            <div className="card-base dashboard-card">
              {!upcoming_reports.length ? (
                <EmptyState emoji="📊" message="임박한 보고 마감이 없어요" className="py-8" />
              ) : (
                <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                  {upcoming_reports.map((report: UpcomingReport) => {
                    const badge = dueBadge(report.days_remaining)
                    return (
                      <button
                        key={report.id}
                        onClick={() => {
                          if (report.task_id) {
                            navigate('/tasks', { state: { highlightTaskId: report.task_id } })
                            return
                          }
                          navigate('/reports', { state: { highlightId: report.id } })
                        }}
                        className="feed-card w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="feed-card-title">{report.report_target} | {report.period}</p>
                          {badge && <span className={badge.className}>{badge.text}</span>}
                        </div>
                        <p className="feed-card-meta">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {rightTab === 'documents' && (
            <div className="card-base dashboard-card">
              {!missing_documents.length ? (
                <EmptyState emoji="📄" message="미수집 서류가 없어요" className="py-8" />
              ) : (
                <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                  {missing_documents.map((doc: MissingDocument) => {
                    const badge = dueBadge(doc.days_remaining)
                    return (
                      <button
                        key={doc.id}
                        onClick={() => navigate(`/investments/${doc.investment_id}`)}
                        className="feed-card w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="feed-card-title">{doc.document_name}</p>
                          {badge && <span className={badge.className}>{badge.text}</span>}
                        </div>
                        <p className="feed-card-meta">{doc.fund_name} | {doc.company_name} | {labelStatus(doc.status)}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">마감 {formatShortDate(doc.due_date)}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="card-base dashboard-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-700">완료 업무</h3>
              <div className="flex gap-1 rounded bg-gray-100 p-0.5 text-xs">
                {(['today', 'this_week', 'last_week'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setCompletedFilter(key)}
                    className={`rounded px-2 py-1 ${completedFilter === key ? 'bg-white font-medium text-emerald-700 shadow' : 'text-gray-500'}`}
                  >
                    {key === 'today' ? '오늘' : key === 'this_week' ? '이번 주' : '전주'}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-2 text-xs text-gray-400">오늘 {completed_today_count}건 · 이번 주 {completed_this_week_count}건</p>
            {filteredCompleted.length === 0 ? (
              <EmptyState emoji="✅" message="완료된 업무가 없어요" className="py-6" />
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {filteredCompleted.map((task) => (
                  <div key={task.id} className="flex items-center justify-between text-sm">
                    <button onClick={() => openTaskDetail(task, true)} className="truncate text-left line-through text-gray-400 hover:text-blue-600">{task.title}</button>
                    <div className="ml-2 flex items-center gap-2">
                      {task.actual_time && <span className="text-xs text-gray-400">{task.actual_time}</span>}
                      <button onClick={() => undoCompleteMut.mutate(task.id)} className="text-xs text-blue-500 hover:underline">되돌리기</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
        </>
      ) : (
        <div className="mx-auto w-full max-w-[1400px] px-4">
          <TaskPipelineView
            todayTasks={todayTasks}
            tomorrowTasks={tomorrowTasks}
            thisWeekTasks={thisWeekTasks}
            upcomingTasks={upcomingTasks}
            noDeadlineTasks={noDeadlineTasks}
            activeWorkflows={active_workflows}
            onClickTask={(task, options) => openTaskDetail(task, options?.editable ?? true)}
            onClickWorkflow={(workflow) => openWorkflowModal(workflow)}
            fullScreen
          />
        </div>
      )}

      {showQuickAddModal && (
        <QuickAddTaskModal
          defaultDate={quickAddDefaultDate || date}
          baseDate={date}
          funds={fund_summary}
          gpEntities={gpEntities}
          defaultFundId={quickAddDefaultFundId}
          onAdd={(task) => createTaskMut.mutate(task)}
          onCancel={() => setShowQuickAddModal(false)}
        />
      )}

      {popupSection && (
        <ListPopupModal title={popupTitle} onClose={() => setPopupSection(null)}>
          <div className="space-y-2">
            {popupSection === 'today' && (() => {
              const grouped = groupByCategory(todayTasks)
              return Array.from(grouped.entries()).map(([category, tasks]) => (
                <div key={category} className="mb-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={categoryBadgeClass(category)}>{category}</span>
                    <span className="text-[10px] text-gray-400">{tasks.length}건</span>
                  </div>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => openTaskDetail(task, true)}
                        className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                      >
                        <p className="text-sm font-medium text-gray-800">{task.title}</p>
                        {task.deadline && <p className="mt-0.5 text-xs text-gray-400">{formatShortDate(task.deadline)}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            })()}

            {popupSection === 'tomorrow' && (() => {
              const grouped = groupByCategory(tomorrowTasks)
              return Array.from(grouped.entries()).map(([category, tasks]) => (
                <div key={category} className="mb-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={categoryBadgeClass(category)}>{category}</span>
                    <span className="text-[10px] text-gray-400">{tasks.length}건</span>
                  </div>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => openTaskDetail(task, true)}
                        className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                      >
                        <p className="text-sm font-medium text-gray-800">{task.title}</p>
                        {task.deadline && <p className="mt-0.5 text-xs text-gray-400">{formatShortDate(task.deadline)}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            })()}

            {popupSection === 'this_week' && (() => {
              const grouped = new Map<string, Task[]>()
              for (const task of thisWeekTasks) {
                const key = task.deadline || '기한 미지정'
                const list = grouped.get(key) || []
                list.push(task)
                grouped.set(key, list)
              }
              const sorted = Array.from(grouped.entries()).sort(([a], [b]) => {
                if (a === '기한 미지정') return 1
                if (b === '기한 미지정') return -1
                return a.localeCompare(b)
              })

              return sorted.map(([dateKey, tasks]) => (
                <div key={dateKey} className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    {dateKey === '기한 미지정'
                      ? dateKey
                      : safeFormatDate(dateKey)}
                  </p>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => openTaskDetail(task, true)}
                        className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                      >
                        <p className="text-sm font-medium text-gray-800">{task.title}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            })()}

            {popupSection === 'workflows' && (() => {
              const grouped = new Map<string, ActiveWorkflow[]>()
              for (const workflow of active_workflows) {
                const key = workflow.fund_name || '미지정'
                const list = grouped.get(key) || []
                list.push(workflow)
                grouped.set(key, list)
              }
              return Array.from(grouped.entries()).map(([fundName, workflows]) => (
                <div key={fundName} className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-gray-600">{fundName}</p>
                  <div className="space-y-1">
                    {workflows.map((wf) => (
                      <button
                        key={wf.id}
                        onClick={() => {
                          setPopupSection(null)
                          openWorkflowModal(wf)
                        }}
                        className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                      >
                        <p className="text-sm font-medium text-gray-800">{wf.name}</p>
                        <p className="text-xs text-gray-500">{wf.progress}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            })()}

            {popupSection === 'documents' && (() => {
              const grouped = new Map<string, MissingDocument[]>()
              for (const document of missing_documents) {
                const key = document.fund_name || '미지정'
                const list = grouped.get(key) || []
                list.push(document)
                grouped.set(key, list)
              }
              return Array.from(grouped.entries()).map(([fundName, documents]) => (
                <div key={fundName} className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-gray-600">{fundName} ({documents.length}건)</p>
                  <div className="space-y-1">
                    {documents.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => navigate(`/investments/${doc.investment_id}`)}
                        className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-left hover:bg-amber-100"
                      >
                        <p className="text-sm font-medium text-amber-900">{doc.document_name}</p>
                        <p className="text-xs text-amber-700">{doc.company_name} | 마감 {formatShortDate(doc.due_date)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            })()}

            {popupSection === 'reports' && (() => {
              const sorted = [...upcoming_reports].sort((a, b) => (a.days_remaining ?? 999) - (b.days_remaining ?? 999))
              return sorted.map((report) => {
                const badge = dueBadge(report.days_remaining)
                return (
                  <button
                    key={report.id}
                    onClick={() => {
                      if (report.task_id) {
                        navigate('/tasks', { state: { highlightTaskId: report.task_id } })
                        return
                      }
                      navigate('/reports', { state: { highlightId: report.id } })
                    }}
                    className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">{report.report_target} | {report.period}</p>
                      {badge && <span className={badge.className}>{badge.text}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p>
                  </button>
                )
              })
            })()}

            {popupSection === 'completed' && (() => {
              const grouped = groupByCategory(completedTodayTasks)
              return Array.from(grouped.entries()).map(([category, tasks]) => (
                <div key={category} className="mb-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={categoryBadgeClass(category)}>{category}</span>
                    <span className="text-[10px] text-gray-400">{tasks.length}건</span>
                  </div>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <div key={task.id} className="rounded-lg border border-gray-200 p-2">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => openTaskDetail(task, true)}
                            className="truncate text-left text-sm text-gray-500 line-through hover:text-blue-600"
                          >
                            {task.title}
                          </button>
                          <button onClick={() => undoCompleteMut.mutate(task.id)} className="text-xs text-blue-600 hover:underline">
                            되돌리기
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        </ListPopupModal>
      )}

      {selectedWorkflow && (
        <WorkflowStageModal
          workflow={selectedWorkflow}
          instance={selectedWorkflowInstance}
          loading={selectedWorkflowLoading}
          onClose={() => setSelectedWorkflow(null)}
          onOpenWorkflowPage={() => {
            const targetId = selectedWorkflow.id
            setSelectedWorkflow(null)
            navigate('/workflows', { state: { expandInstanceId: targetId } })
          }}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          funds={fund_summary.map((fund) => ({ id: fund.id, name: fund.name }))}
          gpEntities={gpEntities}
          onSave={(id, payload) => updateTaskMut.mutate({ id, data: payload })}
          onCancel={() => setEditingTask(null)}
        />
      )}

      {selectedTask && <TaskDetailModal task={selectedTask} editable={selectedTaskEditable} onClose={() => setSelectedTask(null)} onComplete={(task) => { setSelectedTask(null); setCompletingTask(task) }} onGoTaskBoard={(task) => { setSelectedTask(null); navigate('/tasks', { state: { highlightTaskId: task.id } }) }} />}

      {completingTask && <CompleteModal task={completingTask} onConfirm={(actualTime, autoWorklog, memo) => { completeTaskMut.mutate({ id: completingTask.id, actualTime, autoWorklog, memo }, { onSettled: () => setCompletingTask(null) }) }} onCancel={() => setCompletingTask(null)} />}
    </div>
  )
}






