import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  completeTask,
  fetchDashboard,
  fetchUpcomingNotices,
  generateMonthlyReminders,
  type ActiveWorkflow,
  type DashboardResponse,
  type FundSummary,
  type MissingDocument,
  type Task,
  type UpcomingNotice,
  type UpcomingReport,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Building2, Clock, FileWarning, GitBranch, Send } from 'lucide-react'
import MiniCalendar from '../components/MiniCalendar'

const AUTO_WORKLOG_STORAGE_KEY = 'autoWorklog'

function formatShortDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function dueBadge(daysRemaining: number | null): { text: string; className: string } | null {
  if (daysRemaining == null) return null
  if (daysRemaining < 0) {
    return { text: `지연 D+${Math.abs(daysRemaining)}`, className: 'bg-red-100 text-red-700' }
  }
  if (daysRemaining <= 3) {
    return { text: `D-${daysRemaining}`, className: 'bg-red-100 text-red-700' }
  }
  if (daysRemaining <= 7) {
    return { text: `D-${daysRemaining}`, className: 'bg-amber-100 text-amber-700' }
  }
  return { text: `D-${daysRemaining}`, className: 'bg-gray-100 text-gray-700' }
}

function TaskList({
  title,
  tasks,
  onClickTask,
  onQuickComplete,
  completingTaskId,
}: {
  title: string
  tasks: Task[]
  onClickTask: () => void
  onQuickComplete: (task: Task) => void
  completingTaskId: number | null
}) {
  return (
    <div className="card-base">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">{tasks.length}건</span>
      </div>

      {!tasks.length ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">업무 없음</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={onClickTask}
              className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{task.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {task.deadline ? formatShortDate(task.deadline) : '마감 없음'}
                    {task.estimated_time ? ` | 예상 ${task.estimated_time}` : ''}
                  </p>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onQuickComplete(task)
                  }}
                  disabled={completingTaskId === task.id}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                >
                  {completingTaskId === task.id ? '완료중' : '빠른 완료'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
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

  const { data: upcomingNotices } = useQuery<UpcomingNotice[]>({
    queryKey: ['dashboardUpcomingNotices'],
    queryFn: () => fetchUpcomingNotices(30),
  })

  const completeTaskMut = useMutation({
    mutationFn: ({ id, actualTime, autoWorklog }: { id: number; actualTime: string; autoWorklog: boolean }) =>
      completeTask(id, actualTime, autoWorklog),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      addToast('success', '업무를 완료했습니다.')
    },
  })

  const monthlyReminderMut = useMutation({
    mutationFn: generateMonthlyReminders,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      addToast('success', '월간 보고 업무를 생성했습니다.')
    },
  })

  const handleQuickComplete = (task: Task) => {
    if (completeTaskMut.isPending) return
    const saved = window.localStorage.getItem(AUTO_WORKLOG_STORAGE_KEY)
    const autoWorklog = saved == null ? true : saved === 'true'

    completeTaskMut.mutate({
      id: task.id,
      actualTime: task.estimated_time || '0m',
      autoWorklog,
    })
  }

  const dayLabel = useMemo(() => ({
    Mon: '월',
    Tue: '화',
    Wed: '수',
    Thu: '목',
    Fri: '금',
    Sat: '토',
    Sun: '일',
  }), [])

  if (isLoading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (error || !data) {
    return <div className="page-container text-sm text-red-500">대시보드 데이터를 불러오지 못했습니다.</div>
  }

  const {
    date,
    day_of_week,
    monthly_reminder,
    today,
    tomorrow,
    this_week,
    upcoming,
    no_deadline,
    active_workflows,
    fund_summary,
    missing_documents,
    upcoming_reports,
  } = data

  return (
    <div className="page-container space-y-6">
      <div className="page-header mb-0">
        <div>
          <h2 className="page-title">
            {new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ({dayLabel[day_of_week as keyof typeof dayLabel] || day_of_week})
          </h2>
          <p className="page-subtitle">오늘의 핵심 업무와 마감 일정을 확인하세요.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="오늘 업무" value={today.tasks.length} />
        <StatCard label="이번 주" value={this_week.length} />
        <StatCard label="진행 워크플로우" value={active_workflows.length} />
        <StatCard label="미수집 서류" value={missing_documents.length} />
        <StatCard label="보고 마감" value={upcoming_reports.length} />
      </div>

      {monthly_reminder && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-900">이번 달 월간 보고 Task가 아직 생성되지 않았습니다.</p>
            <button
              onClick={() => monthlyReminderMut.mutate(date.slice(0, 7))}
              disabled={monthlyReminderMut.isPending}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700 disabled:bg-amber-300"
            >
              {monthlyReminderMut.isPending ? '생성 중...' : '지금 생성'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {active_workflows.length > 0 && (
            <div className="card-base">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <GitBranch size={16} /> 진행 중인 워크플로우
              </h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {active_workflows.map((wf: ActiveWorkflow) => (
                  <button
                    key={wf.id}
                    onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-left hover:bg-indigo-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
                      <span className="text-xs text-indigo-600">{wf.progress}</span>
                    </div>
                    <p className="mt-1 text-xs text-indigo-600">
                      {wf.fund_name || '-'} | {wf.company_name || '-'}
                    </p>
                    {wf.next_step && (
                      <p className="mt-1 text-xs text-indigo-700">다음: {wf.next_step} {wf.next_step_date ? `(${formatShortDate(wf.next_step_date)})` : ''}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <TaskList
            title="오늘"
            tasks={today.tasks}
            onClickTask={() => navigate('/tasks')}
            onQuickComplete={handleQuickComplete}
            completingTaskId={completeTaskMut.variables?.id ?? null}
          />
          <TaskList
            title="내일"
            tasks={tomorrow.tasks}
            onClickTask={() => navigate('/tasks')}
            onQuickComplete={handleQuickComplete}
            completingTaskId={completeTaskMut.variables?.id ?? null}
          />
          <TaskList
            title="이번 주"
            tasks={this_week}
            onClickTask={() => navigate('/tasks')}
            onQuickComplete={handleQuickComplete}
            completingTaskId={completeTaskMut.variables?.id ?? null}
          />

          {upcoming.length > 0 && (
            <TaskList
              title="예정 업무"
              tasks={upcoming}
              onClickTask={() => navigate('/tasks')}
              onQuickComplete={handleQuickComplete}
              completingTaskId={completeTaskMut.variables?.id ?? null}
            />
          )}

          {no_deadline.length > 0 && (
            <TaskList
              title="기한 미지정"
              tasks={no_deadline}
              onClickTask={() => navigate('/tasks')}
              onQuickComplete={handleQuickComplete}
              completingTaskId={completeTaskMut.variables?.id ?? null}
            />
          )}
        </div>

        <div className="space-y-4">
          <MiniCalendar />

          <div className="card-base">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Building2 size={16} /> 조합 요약
            </h3>
            {!fund_summary.length ? (
              <p className="text-sm text-gray-400">등록된 조합이 없습니다.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {fund_summary.slice(0, 6).map((fund: FundSummary) => (
                    <button
                      key={fund.id}
                      onClick={() => navigate(`/funds/${fund.id}`)}
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-800">{fund.name}</p>
                      <p className="text-xs text-gray-500">
                        LP {fund.lp_count} | 투자 {fund.investment_count} | 약정 {formatKRW(fund.commitment_total)}
                      </p>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => navigate('/fund-overview')}
                  className="mt-3 text-xs text-blue-600 hover:underline"
                >
                  전체 조합 개요 보기 →
                </button>
              </>
            )}
          </div>

          <div className="card-base">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Clock size={16} /> 다가오는 통지 기한
            </h3>
            {!upcomingNotices?.length ? (
              <p className="text-sm text-gray-400">다가오는 통지 기한이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {upcomingNotices.slice(0, 10).map((notice, idx) => {
                  const badge = dueBadge(notice.days_remaining)
                  return (
                    <button
                      key={`${notice.workflow_instance_name}-${notice.fund_name}-${idx}`}
                      onClick={() =>
                        navigate('/workflows', {
                          state: notice.workflow_instance_id
                            ? { expandInstanceId: notice.workflow_instance_id }
                            : undefined,
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{notice.fund_name} | {notice.notice_label}</p>
                        {badge && <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}>{badge.text}</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{notice.workflow_instance_name}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">기한 {formatShortDate(notice.deadline)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card-base">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Send size={16} /> 보고 마감
            </h3>
            {!upcoming_reports.length ? (
              <p className="text-sm text-gray-400">임박한 보고 마감이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {upcoming_reports.slice(0, 10).map((report: UpcomingReport) => {
                  const badge = dueBadge(report.days_remaining)
                  return (
                    <button
                      key={report.id}
                      onClick={() => navigate('/reports', { state: { highlightId: report.id } })}
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{report.report_target} | {report.period}</p>
                        {badge && <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}>{badge.text}</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card-base">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <FileWarning size={16} /> 미수집 서류
            </h3>
            {!missing_documents.length ? (
              <p className="text-sm text-gray-400">미수집 서류가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {missing_documents.slice(0, 10).map((doc: MissingDocument) => {
                  const badge = dueBadge(doc.days_remaining)
                  return (
                    <button
                      key={doc.id}
                      onClick={() => navigate(`/investments/${doc.investment_id}`)}
                      className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-left hover:bg-amber-100"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-amber-900">{doc.document_name}</p>
                        {badge && <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}>{badge.text}</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-amber-700">{doc.fund_name} | {doc.company_name} | {labelStatus(doc.status)}</p>
                      <p className="mt-0.5 text-[11px] text-amber-700">마감 {formatShortDate(doc.due_date)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
