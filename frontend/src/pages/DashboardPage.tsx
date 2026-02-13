import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { completeTask, fetchDashboard, generateMonthlyReminders } from '../lib/api'
import type { Task, DashboardResponse, ActiveWorkflow, FundSummary, MissingDocument, UpcomingReport } from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, Building2, FileWarning, Check, Send } from 'lucide-react'

const AUTO_WORKLOG_STORAGE_KEY = 'autoWorklog'

const QUADRANT_COLORS: Record<string, string> = {
  Q1: 'bg-red-100 text-red-700',
  Q2: 'bg-blue-100 text-blue-700',
  Q3: 'bg-amber-100 text-amber-700',
  Q4: 'bg-gray-100 text-gray-600',
}

const DAY_LABEL: Record<string, string> = {
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
  Sun: '일',
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function dueBadge(doc: MissingDocument): { text: string; className: string } | null {
  if (doc.days_remaining == null) return null
  if (doc.days_remaining < 0) {
    return {
      text: `지연 ${Math.abs(doc.days_remaining)}일`,
      className: 'bg-red-100 text-red-700',
    }
  }
  if (doc.days_remaining <= 3) {
    return {
      text: `D-${doc.days_remaining}`,
      className: 'bg-red-100 text-red-700',
    }
  }
  if (doc.days_remaining <= 7) {
    return {
      text: `D-${doc.days_remaining}`,
      className: 'bg-amber-100 text-amber-700',
    }
  }
  return {
    text: `D-${doc.days_remaining}`,
    className: 'bg-gray-100 text-gray-600',
  }
}

function reportDueBadge(report: UpcomingReport): { text: string; className: string } | null {
  if (report.status === '전송완료') {
    return { text: '완료', className: 'bg-green-100 text-green-700' }
  }
  if (report.days_remaining == null) return null
  if (report.days_remaining < 0) {
    return {
      text: `지연 D+${Math.abs(report.days_remaining)}`,
      className: 'bg-red-200 text-red-800',
    }
  }
  if (report.days_remaining <= 3) {
    return {
      text: `D-${report.days_remaining}`,
      className: 'bg-red-100 text-red-700',
    }
  }
  if (report.days_remaining <= 7) {
    return {
      text: `D-${report.days_remaining}`,
      className: 'bg-amber-100 text-amber-700',
    }
  }
  return {
    text: `D-${report.days_remaining}`,
    className: 'bg-gray-100 text-gray-600',
  }
}

function TaskCard({
  task,
  onClick,
  onComplete,
  completing,
}: {
  task: Task
  onClick: () => void
  onComplete: (task: Task) => void
  completing: boolean
}) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isOverdue = !!(task.deadline && new Date(task.deadline) < today && task.status !== 'completed')

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
        isOverdue
          ? 'bg-red-50 border-red-300 hover:border-red-400'
          : 'bg-white border-gray-200 hover:shadow-sm hover:border-blue-300'
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onComplete(task)
        }}
        disabled={completing}
        className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 disabled:opacity-50 shrink-0 flex items-center justify-center"
        aria-label={`${task.title} 완료 처리`}
      >
        {completing && <Check size={10} className="text-green-600" />}
      </button>
      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${QUADRANT_COLORS[task.quadrant] || ''}`}>
        {task.quadrant}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          {deadlineStr && <span>{deadlineStr}</span>}
          {isOverdue && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">지연</span>}
          {task.estimated_time && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {task.estimated_time}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function TaskSection({
  title,
  tasks,
  totalTime,
  icon,
  onTaskClick,
  onTaskComplete,
  completingTaskId,
}: {
  title: string
  tasks: Task[]
  totalTime?: string
  icon?: ReactNode
  onTaskClick: () => void
  onTaskComplete: (task: Task) => void
  completingTaskId: number | null
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          {icon}
          {title}
          <span className="text-gray-400 font-normal">({tasks.length})</span>
        </h3>
        {totalTime && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock size={12} /> {totalTime}
          </span>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center bg-white rounded-lg border border-dashed border-gray-200">
          작업 없음
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => (
            <TaskCard
              key={t.id}
              task={t}
              onClick={onTaskClick}
              onComplete={onTaskComplete}
              completing={completingTaskId === t.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  tone: 'red' | 'blue' | 'indigo' | 'amber'
}) {
  const toneMap: Record<'red' | 'blue' | 'indigo' | 'amber', string> = {
    red: 'bg-red-50 border-red-200 text-red-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }

  return (
    <div className={`border rounded-xl p-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading, error } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  })

  const completeTaskMut = useMutation({
    mutationFn: ({ id, actual_time, auto_worklog }: { id: number; actual_time: string; auto_worklog: boolean }) =>
      completeTask(id, actual_time, auto_worklog),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      addToast('success', '작업이 완료되었습니다.')
    },
  })

  const monthlyReminderMut = useMutation({
    mutationFn: generateMonthlyReminders,
    onSuccess: (result: { created?: string[]; skipped?: string[] }) => {
      const createdCount = result.created?.length ?? 0
      const skippedCount = result.skipped?.length ?? 0
      addToast('success', `월보고 Task 생성 ${createdCount}건, 중복 건너뜀 ${skippedCount}건`)
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
    },
  })

  const handleQuickComplete = (task: Task) => {
    if (completeTaskMut.isPending) return
    const saved = window.localStorage.getItem(AUTO_WORKLOG_STORAGE_KEY)
    const autoWorklog = saved == null ? true : saved === 'true'
    completeTaskMut.mutate({
      id: task.id,
      actual_time: task.estimated_time || '0m',
      auto_worklog: autoWorklog,
    })
  }

  if (isLoading) return <div className="p-8 text-gray-500">불러오는 중...</div>
  if (error) return <div className="p-8 text-red-500">대시보드 데이터를 불러오지 못했습니다.</div>
  if (!data) return null

  const { date, day_of_week, monthly_reminder, today, tomorrow, this_week, upcoming, no_deadline, active_workflows, fund_summary, missing_documents, upcoming_reports } = data

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ({DAY_LABEL[day_of_week] || day_of_week})
        </h2>
        <p className="text-sm text-gray-500 mt-1">일일 개요</p>
      </div>

      {monthly_reminder && (
        <div className="mb-6 p-3 rounded-xl border border-amber-300 bg-amber-50 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-900">이번 달 월보고 Task가 아직 등록되지 않았습니다.</p>
          <button
            onClick={() => monthlyReminderMut.mutate(date.slice(0, 7))}
            disabled={monthlyReminderMut.isPending}
            className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300"
          >
            {monthlyReminderMut.isPending ? '등록 중...' : '등록하기'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-5">
        <StatCard icon={<AlertTriangle size={14} />} label="오늘 작업" value={today.tasks.length} tone="red" />
        <StatCard icon={<Clock size={14} />} label="이번 주 작업" value={this_week.length} tone="blue" />
        <StatCard icon={<ArrowRight size={14} />} label="진행중 워크플로우" value={active_workflows.length} tone="indigo" />
        <StatCard icon={<FileWarning size={14} />} label="미수 서류" value={missing_documents.length} tone="amber" />
        <StatCard icon={<Send size={14} />} label="보고 마감" value={upcoming_reports.length} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {active_workflows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <ArrowRight size={16} /> 진행 중인 워크플로우
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {active_workflows.map((wf: ActiveWorkflow) => (
                  <div
                    key={wf.id}
                    onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })}
                    className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:shadow-sm hover:border-indigo-400 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
                      <span className="text-xs text-indigo-600">{wf.progress}</span>
                    </div>
                    {(wf.fund_name || wf.company_name) && (
                      <p className="text-xs text-indigo-500 mt-0.5">
                        {wf.fund_name || '-'} · {wf.company_name || '-'}
                      </p>
                    )}
                    {wf.next_step && (
                      <p className="text-xs text-indigo-700 mt-1.5 font-medium">
                        다음: {wf.next_step}
                        {wf.next_step_date && <span className="text-indigo-500 ml-1">({formatShortDate(wf.next_step_date)})</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <TaskSection
            title="오늘"
            tasks={today.tasks}
            totalTime={today.total_estimated_time}
            icon={<AlertTriangle size={16} className="text-red-500" />}
            onTaskClick={() => navigate('/tasks')}
            onTaskComplete={handleQuickComplete}
            completingTaskId={completeTaskMut.variables?.id ?? null}
          />
          <TaskSection
            title="내일"
            tasks={tomorrow.tasks}
            totalTime={tomorrow.total_estimated_time}
            icon={<Clock size={16} className="text-amber-500" />}
            onTaskClick={() => navigate('/tasks')}
            onTaskComplete={handleQuickComplete}
            completingTaskId={completeTaskMut.variables?.id ?? null}
          />
          <TaskSection
            title="이번 주"
            tasks={this_week}
            icon={<CheckCircle2 size={16} className="text-blue-500" />}
            onTaskClick={() => navigate('/tasks')}
            onTaskComplete={handleQuickComplete}
            completingTaskId={completeTaskMut.variables?.id ?? null}
          />
          <TaskSection
            title="예정"
            tasks={upcoming}
            icon={<CheckCircle2 size={16} className="text-gray-400" />}
            onTaskClick={() => navigate('/tasks')}
            onTaskComplete={handleQuickComplete}
            completingTaskId={completeTaskMut.variables?.id ?? null}
          />
          {no_deadline?.length > 0 && (
            <TaskSection
              title="기한 미설정"
              tasks={no_deadline}
              icon={<Clock size={16} className="text-gray-400" />}
              onTaskClick={() => navigate('/tasks')}
              onTaskComplete={handleQuickComplete}
              completingTaskId={completeTaskMut.variables?.id ?? null}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Building2 size={16} /> 조합 요약
            </h3>
            {fund_summary?.length ? (
              <div className="space-y-2">
                {fund_summary.slice(0, 6).map((fund: FundSummary) => (
                  <button
                    key={fund.id}
                    onClick={() => navigate('/funds')}
                    className="w-full text-left p-2 rounded border border-gray-200 hover:bg-gray-50"
                  >
                    <p className="text-sm font-medium text-gray-800">{fund.name}</p>
                    <p className="text-xs text-gray-500">LP {fund.lp_count} | 투자 {fund.investment_count} | 약정 {formatKRW(fund.commitment_total)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">등록된 조합이 없습니다.</p>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Send size={16} /> 보고 마감
            </h3>
            {upcoming_reports?.length ? (
              <div className="space-y-2 max-h-72 overflow-auto">
                {upcoming_reports.slice(0, 10).map((report: UpcomingReport) => {
                  const badge = reportDueBadge(report)
                  return (
                    <button
                      key={report.id}
                      onClick={() => navigate('/reports')}
                      className="w-full text-left p-2 rounded border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{report.report_target} | {report.period}</p>
                        {badge && <span className={`text-[11px] px-1.5 py-0.5 rounded ${badge.className}`}>{badge.text}</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p>
                      {report.due_date && <p className="text-[11px] text-gray-500 mt-0.5">마감일 {formatShortDate(report.due_date)}</p>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">임박한 보고 마감이 없습니다.</p>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileWarning size={16} /> 미수집 서류
            </h3>
            {missing_documents?.length ? (
              <div className="space-y-2 max-h-80 overflow-auto">
                {missing_documents.slice(0, 12).map((doc: MissingDocument) => {
                  const badge = dueBadge(doc)
                  return (
                    <button
                      key={doc.id}
                      onClick={() => navigate(`/investments/${doc.investment_id}`)}
                      className="w-full text-left p-2 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-amber-900">{doc.document_name}</p>
                        {badge && <span className={`text-[11px] px-1.5 py-0.5 rounded ${badge.className}`}>{badge.text}</span>}
                      </div>
                      <p className="text-xs text-amber-700 mt-0.5">{doc.fund_name} | {doc.company_name} | {labelStatus(doc.status)}</p>
                      {doc.due_date && <p className="text-[11px] text-amber-600 mt-0.5">마감일 {formatShortDate(doc.due_date)}</p>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">미수집 서류가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


