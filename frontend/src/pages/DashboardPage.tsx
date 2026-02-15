import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileWarning, GitBranch, Plus, Send } from 'lucide-react'

import CompleteModal from '../components/CompleteModal'
import TimeSelect from '../components/TimeSelect'
import { useToast } from '../contexts/ToastContext'
import {
  completeTask,
  createTask,
  fetchDashboard,
  fetchUpcomingNotices,
  generateMonthlyReminders,
  undoCompleteTask,
  type ActiveWorkflow,
  type DashboardResponse,
  type FundSummary,
  type MissingDocument,
  type Task,
  type TaskCreate,
  type UpcomingNotice,
  type UpcomingReport,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'

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
  return new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function dueBadge(daysRemaining: number | null): { text: string; className: string } | null {
  if (daysRemaining == null) return null
  if (daysRemaining < 0) return { text: `지연 D+${Math.abs(daysRemaining)}`, className: 'bg-red-100 text-red-700' }
  if (daysRemaining <= 3) return { text: `D-${daysRemaining}`, className: 'bg-red-100 text-red-700' }
  if (daysRemaining <= 7) return { text: `D-${daysRemaining}`, className: 'bg-amber-100 text-amber-700' }
  return { text: `D-${daysRemaining}`, className: 'bg-gray-100 text-gray-700' }
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
  return value.toISOString().slice(0, 10)
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

function TaskDetailModal({ task, onClose, onComplete, onGoTaskBoard }: { task: Task; onClose: () => void; onComplete: (task: Task) => void; onGoTaskBoard: (task: Task) => void }) {
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
          {task.company_name && <div><span className="font-medium">피투자사:</span> {task.company_name}</div>}
          {task.category && <div><span className="font-medium">카테고리:</span> {task.category}</div>}
          <div><span className="font-medium">사분면:</span> {task.quadrant}</div>
          {task.memo && <div><span className="font-medium">메모:</span> {task.memo}</div>}
          {task.delegate_to && <div><span className="font-medium">담당자:</span> {task.delegate_to}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {task.status !== 'completed' && (
            <button onClick={() => onComplete(task)} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">완료</button>
          )}
          <button onClick={() => onGoTaskBoard(task)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">업무보드에서 확인</button>
          <button onClick={onClose} className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300">닫기</button>
        </div>
      </div>
    </div>
  )
}

function TaskList({ title, tasks, onClickTask, onQuickComplete, completingTaskId, onHeaderClick, headerAction, defaultCollapsed = false }: { title: string; tasks: Task[]; onClickTask: (task: Task) => void; onQuickComplete: (task: Task) => void; completingTaskId: number | null; onHeaderClick?: () => void; headerAction?: React.ReactNode; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <div className="card-base">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={onHeaderClick} className={`text-sm font-semibold ${onHeaderClick ? 'text-gray-700 hover:text-blue-600' : 'text-gray-700'}`}>{title}</button>
        <div className="flex items-center gap-1">
          {headerAction}
          <span className="text-xs text-gray-400">{tasks.length}건</span>
          <button onClick={() => setCollapsed((prev) => !prev)} className="rounded p-1 hover:bg-gray-100"><ChevronDown size={14} className={`text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} /></button>
        </div>
      </div>
      {!collapsed && (
        !tasks.length ? <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">업무 없음</p> : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} onClick={() => onClickTask(task)} className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-800">{task.title}</p>
                      {task.category && <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${categoryBadgeClass(task.category)}`}>{task.category}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      {task.deadline ? formatShortDate(task.deadline) : '마감 없음'}
                      {task.estimated_time && ` | 예상 ${task.estimated_time}`}
                      {task.fund_name && <span className="text-blue-600">{task.fund_name}</span>}
                    </div>
                  </div>
                  <button onClick={(event) => { event.stopPropagation(); onQuickComplete(task) }} disabled={completingTaskId === task.id} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-60">{completingTaskId === task.id ? '처리중' : '완료'}</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function QuickAddTaskModal({ defaultDate, funds, defaultFundId, onAdd, onCancel }: { defaultDate: string; funds: FundSummary[]; defaultFundId?: number | null; onAdd: (data: TaskCreate) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [category, setCategory] = useState('')
  const [fundId, setFundId] = useState<number | ''>(defaultFundId ?? '')
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="mb-1 text-lg font-semibold">빠른 업무 추가</h3>
          <p className="mb-3 text-xs text-gray-500">마감일: {defaultDate}</p>
          <div className="space-y-3">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="업무 제목" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
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
                <label className="mb-1 block text-xs text-gray-500">관련 조합</label>
                <select value={fundId} onChange={(e) => setFundId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                  <option value="">선택</option>
                  {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">취소</button>
            <button onClick={() => { if (!title.trim()) return; onAdd({ title: title.trim(), quadrant: 'Q1', deadline: defaultDate, estimated_time: estimatedTime || null, category: category || null, fund_id: fundId || null }) }} className="primary-btn">추가</button>
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
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [rightTab, setRightTab] = useState<RightTab>('funds')
  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)
  const [quickAddDefaultDate, setQuickAddDefaultDate] = useState('')
  const [quickAddDefaultFundId, setQuickAddDefaultFundId] = useState<number | null>(null)
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(false)
  const [popupSection, setPopupSection] = useState<PopupSection | null>(null)
  const [completedFilter, setCompletedFilter] = useState<'today' | 'this_week' | 'last_week'>('today')
  const [taskPanel, setTaskPanel] = useState<'daily' | 'weekly'>('daily')

  const { data, isLoading, error } = useQuery<DashboardResponse>({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const { data: upcomingNotices = [] } = useQuery<UpcomingNotice[]>({ queryKey: ['dashboardUpcomingNotices'], queryFn: () => fetchUpcomingNotices(30) })

  const completeTaskMut = useMutation({ mutationFn: ({ id, actualTime, autoWorklog, memo }: { id: number; actualTime: string; autoWorklog: boolean; memo?: string }) => completeTask(id, actualTime, autoWorklog, memo), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); addToast('success', '업무를 완료했습니다.') } })
  const undoCompleteMut = useMutation({ mutationFn: undoCompleteTask, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); addToast('success', '완료를 취소했습니다.') } })
  const monthlyReminderMut = useMutation({ mutationFn: generateMonthlyReminders, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); addToast('success', '월간 보고 업무를 생성했습니다.') } })
  const createTaskMut = useMutation({ mutationFn: createTask, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['taskBoard'] }); setShowQuickAddModal(false); addToast('success', '업무가 추가되었습니다.') } })

  const dayLabel = useMemo(() => ({ Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토', Sun: '일' }), [])

  if (isLoading) return <div className="loading-state"><div className="loading-spinner" /></div>
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

  const popupTitle = popupSection === 'today' ? '오늘 업무' : popupSection === 'tomorrow' ? '내일 업무' : popupSection === 'this_week' ? `이번 주 업무 (${thisWeekRangeLabel})` : popupSection === 'workflows' ? '진행 워크플로' : popupSection === 'documents' ? '미수집 서류' : popupSection === 'reports' ? '보고 마감' : '오늘 완료'

  return (
    <div className="page-container space-y-6">
      <div className="page-header mb-0"><div><h2 className="page-title">{new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ({dayLabel[day_of_week as keyof typeof dayLabel] || day_of_week})</h2><p className="page-subtitle">오늘의 업무와 마감 일정을 확인하세요.</p></div></div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="오늘 업무" value={todayTasks.length} onClick={() => setPopupSection('today')} />
        <StatCard label={`이번 주 (${thisWeekRangeLabel})`} value={thisWeekTasks.length} onClick={() => setPopupSection('this_week')} />
        <StatCard label="진행 워크플로" value={active_workflows.length} onClick={() => setPopupSection('workflows')} />
        <StatCard label="미수집 서류" value={missing_documents.length} onClick={() => setPopupSection('documents')} />
        <StatCard label="보고 마감" value={upcoming_reports.length} onClick={() => setPopupSection('reports')} />
        <StatCard label="오늘 완료" value={completed_today_count} onClick={() => setPopupSection('completed')} variant="emerald" />
      </div>

      {monthly_reminder && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm text-amber-900">이번 달 월간 보고 Task가 아직 생성되지 않았습니다.</p><button onClick={() => monthlyReminderMut.mutate(date.slice(0, 7))} disabled={monthlyReminderMut.isPending} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700 disabled:bg-amber-300">{monthlyReminderMut.isPending ? '생성 중...' : '지금 생성'}</button></div></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {active_workflows.length > 0 && (
            <div className="card-base">
              <button onClick={() => setPopupSection('workflows')} className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600"><GitBranch size={16} /> 진행 중인 워크플로</button>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {active_workflows.map((wf: ActiveWorkflow) => (
                  <div key={wf.id} className="group relative rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-left hover:bg-indigo-100">
                    <button onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })} className="w-full text-left">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-indigo-800">{wf.name}</p><span className="text-xs text-indigo-600">{wf.progress}</span></div>
                      <p className="mt-1 text-xs text-indigo-600">{wf.fund_name || '-'} | {wf.company_name || '-'}</p>
                      {wf.next_step && <p className="mt-1 text-xs text-indigo-700">다음: {wf.next_step} {wf.next_step_date ? `(${formatShortDate(wf.next_step_date)})` : ''}</p>}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); openQuickAdd('today') }} className="absolute right-2 top-2 rounded-full bg-white/80 p-1 text-indigo-500 opacity-0 transition-all hover:bg-indigo-100 group-hover:opacity-100" title="업무 추가"><Plus size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="relative overflow-hidden">
              <div className={`px-0.5 transition-all duration-300 ease-out ${taskPanel === 'daily' ? 'relative translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 -translate-x-8 opacity-0'}`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TaskList title={`오늘 (${todayTasks.length}건 ${today.total_estimated_time || '0m'})`} tasks={todayTasks} onClickTask={setSelectedTask} onQuickComplete={setCompletingTask} completingTaskId={completeTaskMut.variables?.id ?? null} onHeaderClick={() => setPopupSection('today')} headerAction={<button onClick={(e) => { e.stopPropagation(); openQuickAdd('today') }} className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="업무 추가"><Plus size={14} /></button>} />
                  <TaskList title={`내일 (${tomorrowTasks.length}건 ${tomorrow.total_estimated_time || '0m'})`} tasks={tomorrowTasks} onClickTask={setSelectedTask} onQuickComplete={setCompletingTask} completingTaskId={completeTaskMut.variables?.id ?? null} onHeaderClick={() => setPopupSection('tomorrow')} headerAction={<button onClick={(e) => { e.stopPropagation(); openQuickAdd('tomorrow') }} className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="업무 추가"><Plus size={14} /></button>} />
                </div>
              </div>

              <div className={`px-0.5 transition-all duration-300 ease-out ${taskPanel === 'weekly' ? 'relative translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 translate-x-8 opacity-0'}`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TaskList title={`이번 주 ${thisWeekRangeLabel} (${thisWeekTasks.length}건)`} tasks={thisWeekTasks} onClickTask={setSelectedTask} onQuickComplete={setCompletingTask} completingTaskId={completeTaskMut.variables?.id ?? null} onHeaderClick={() => setPopupSection('this_week')} />

                  <div className="card-base">
                    <button onClick={() => setUpcomingCollapsed((prev) => !prev)} className="mb-2 flex w-full items-center justify-between"><h3 className="text-sm font-semibold text-gray-700">예정 업무</h3><div className="flex items-center gap-2"><span className="text-xs text-gray-400">{upcomingTasks.length}건</span><ChevronDown size={14} className={`text-gray-400 transition-transform ${upcomingCollapsed ? '-rotate-90' : ''}`} /></div></button>
                    {!upcomingTasks.length ? (
                      <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">업무 없음</p>
                    ) : (
                      !upcomingCollapsed && <div className="space-y-3">{upcomingGrouped.map(([category, tasks]) => <div key={category}><div className="mb-1 flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryBadgeClass(category)}`}>{category}</span><span className="text-[10px] text-gray-400">{tasks.length}건</span></div><div className="space-y-1">{tasks.map((task) => <div key={task.id} onClick={() => setSelectedTask(task)} className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm text-gray-800">{task.title}</p><span className="shrink-0 text-xs text-gray-400">{task.deadline ? formatShortDate(task.deadline) : ''}</span></div></div>)}</div></div>)}</div>
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

            <div className="flex justify-center gap-1">
              <button onClick={() => setTaskPanel('daily')} className={`h-1.5 w-6 rounded-full transition-colors ${taskPanel === 'daily' ? 'bg-blue-500' : 'bg-gray-300'}`} aria-label="오늘/내일 패널 보기" />
              <button onClick={() => setTaskPanel('weekly')} className={`h-1.5 w-6 rounded-full transition-colors ${taskPanel === 'weekly' ? 'bg-blue-500' : 'bg-gray-300'}`} aria-label="이번주/예정 패널 보기" />
            </div>

            {noDeadlineTasks.length > 0 && <TaskList title="기한 미지정" tasks={noDeadlineTasks} onClickTask={setSelectedTask} onQuickComplete={setCompletingTask} completingTaskId={completeTaskMut.variables?.id ?? null} defaultCollapsed={true} />}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">{RIGHT_TABS.map((tab) => { const count = tabCount[tab.key]; return <button key={tab.key} onClick={() => setRightTab(tab.key)} className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${rightTab === tab.key ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'}`}><tab.icon size={13} />{tab.label}{count > 0 && <span className="ml-0.5 rounded-full bg-gray-200 px-1.5 text-[10px] text-gray-600">{count}</span>}</button>})}</div>

          {rightTab === 'funds' && <div className="card-base">{!fund_summary.length ? <p className="text-sm text-gray-400">등록된 조합이 없습니다.</p> : <><div className="space-y-2">{fund_summary.slice(0, 5).map((fund: FundSummary) => <button key={fund.id} onClick={() => navigate(`/funds/${fund.id}`)} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><p className="text-sm font-medium text-gray-800">{fund.name}</p><p className="text-xs text-gray-500">LP {fund.lp_count} | 투자 {fund.investment_count} | 약정 {formatKRW(fund.commitment_total)}</p></button>)}</div>{fund_summary.length > 5 && <button onClick={() => navigate('/fund-overview')} className="mt-2 text-xs text-blue-600 hover:underline">+{fund_summary.length - 5}건 더보기</button>}</>}</div>}

          {rightTab === 'notices' && <div className="card-base">{!upcomingNotices.length ? <p className="text-sm text-gray-400">다가오는 통지 기한이 없습니다.</p> : <div className="space-y-2">{upcomingNotices.slice(0, 5).map((notice, idx) => { const badge = dueBadge(notice.days_remaining); return <button key={`${notice.workflow_instance_name}-${notice.fund_name}-${idx}`} onClick={() => navigate('/workflows', { state: notice.workflow_instance_id ? { expandInstanceId: notice.workflow_instance_id } : undefined })} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-gray-800">{notice.fund_name} | {notice.notice_label}</p>{badge && <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}>{badge.text}</span>}</div><p className="mt-0.5 text-xs text-gray-500">{notice.workflow_instance_name}</p><p className="mt-0.5 text-[11px] text-gray-500">기한 {formatShortDate(notice.deadline)}</p></button>})}</div>}</div>}

          {rightTab === 'reports' && <div className="card-base"><button onClick={() => setPopupSection('reports')} className="mb-2 text-sm font-semibold text-gray-700 hover:text-blue-600">보고 마감</button>{!upcoming_reports.length ? <p className="text-sm text-gray-400">임박한 보고 마감이 없습니다.</p> : <><div className="space-y-2">{upcoming_reports.slice(0, 5).map((report: UpcomingReport) => { const badge = dueBadge(report.days_remaining); return <button key={report.id} onClick={() => navigate('/reports', { state: { highlightId: report.id } })} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-gray-800">{report.report_target} | {report.period}</p>{badge && <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}>{badge.text}</span>}</div><p className="mt-0.5 text-xs text-gray-500">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p></button>})}</div>{upcoming_reports.length > 5 && <button onClick={() => setPopupSection('reports')} className="mt-2 text-xs text-blue-600 hover:underline">+{upcoming_reports.length - 5}건 더보기</button>}</>}</div>}

          {rightTab === 'documents' && <div className="card-base"><button onClick={() => setPopupSection('documents')} className="mb-2 text-sm font-semibold text-gray-700 hover:text-blue-600">미수집 서류</button>{!missing_documents.length ? <p className="text-sm text-gray-400">미수집 서류가 없습니다.</p> : <><div className="space-y-2">{missing_documents.slice(0, 5).map((doc: MissingDocument) => { const badge = dueBadge(doc.days_remaining); return <button key={doc.id} onClick={() => navigate(`/investments/${doc.investment_id}`)} className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-left hover:bg-amber-100"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-amber-900">{doc.document_name}</p>{badge && <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}>{badge.text}</span>}</div><p className="mt-0.5 text-xs text-amber-700">{doc.fund_name} | {doc.company_name} | {labelStatus(doc.status)}</p><p className="mt-0.5 text-[11px] text-amber-700">마감 {formatShortDate(doc.due_date)}</p></button>})}</div>{missing_documents.length > 5 && <button onClick={() => setPopupSection('documents')} className="mt-2 text-xs text-blue-600 hover:underline">+{missing_documents.length - 5}건 더보기</button>}</>}</div>}

          <div className="card-base">
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
              <p className="py-4 text-center text-sm text-gray-400">완료된 업무가 없습니다.</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {filteredCompleted.map((task) => (
                  <div key={task.id} className="flex items-center justify-between text-sm">
                    <button onClick={() => setSelectedTask(task)} className="truncate text-left line-through text-gray-400 hover:text-blue-600">{task.title}</button>
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

      {showQuickAddModal && <QuickAddTaskModal defaultDate={quickAddDefaultDate || date} funds={fund_summary} defaultFundId={quickAddDefaultFundId} onAdd={(task) => createTaskMut.mutate(task)} onCancel={() => setShowQuickAddModal(false)} />}

      {popupSection && <ListPopupModal title={popupTitle} onClose={() => setPopupSection(null)}><div className="space-y-2">{popupSection === 'workflows' && active_workflows.map((wf) => <button key={wf.id} onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><p className="text-sm font-medium text-gray-800">{wf.name}</p><p className="text-xs text-gray-500">{wf.fund_name || '-'} | {wf.company_name || '-'} | {wf.progress}</p></button>)}{popupSection === 'documents' && missing_documents.map((doc) => <button key={doc.id} onClick={() => navigate(`/investments/${doc.investment_id}`)} className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-left hover:bg-amber-100"><p className="text-sm font-medium text-amber-900">{doc.document_name}</p><p className="text-xs text-amber-700">{doc.fund_name} | {doc.company_name}</p></button>)}{popupSection === 'reports' && upcoming_reports.map((report) => <button key={report.id} onClick={() => navigate('/reports', { state: { highlightId: report.id } })} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><p className="text-sm font-medium text-gray-800">{report.report_target} | {report.period}</p><p className="text-xs text-gray-500">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p></button>)}{popupSection === 'today' && todayTasks.map((task) => <button key={task.id} onClick={() => setSelectedTask(task)} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><p className="text-sm font-medium text-gray-800">{task.title}</p></button>)}{popupSection === 'tomorrow' && tomorrowTasks.map((task) => <button key={task.id} onClick={() => setSelectedTask(task)} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><p className="text-sm font-medium text-gray-800">{task.title}</p></button>)}{popupSection === 'this_week' && thisWeekTasks.map((task) => <button key={task.id} onClick={() => setSelectedTask(task)} className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"><p className="text-sm font-medium text-gray-800">{task.title}</p></button>)}{popupSection === 'completed' && completedTodayTasks.map((task) => <div key={task.id} className="rounded-lg border border-gray-200 p-2"><div className="flex items-center justify-between"><button onClick={() => setSelectedTask(task)} className="truncate text-left text-sm text-gray-500 line-through hover:text-blue-600">{task.title}</button><button onClick={() => undoCompleteMut.mutate(task.id)} className="text-xs text-blue-600 hover:underline">되돌리기</button></div></div>)}</div></ListPopupModal>}

      {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onComplete={(task) => { setSelectedTask(null); setCompletingTask(task) }} onGoTaskBoard={(task) => { setSelectedTask(null); navigate('/tasks', { state: { highlightTaskId: task.id } }) }} />}

      {completingTask && <CompleteModal task={completingTask} onConfirm={(actualTime, autoWorklog, memo) => { completeTaskMut.mutate({ id: completingTask.id, actualTime, autoWorklog, memo }, { onSettled: () => setCompletingTask(null) }) }} onCancel={() => setCompletingTask(null)} />}
    </div>
  )
}
