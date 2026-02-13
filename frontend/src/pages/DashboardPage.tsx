import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchDashboard, generateMonthlyReminders } from '../lib/api'
import type { Task, DashboardResponse, ActiveWorkflow, FundSummary, MissingDocument } from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, Building2, FileWarning } from 'lucide-react'

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

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
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
          : 'bg-white border-slate-200 hover:shadow-sm hover:border-blue-300'
      }`}
    >
      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${QUADRANT_COLORS[task.quadrant] || ''}`}>
        {task.quadrant}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
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
}: {
  title: string
  tasks: Task[]
  totalTime?: string
  icon?: ReactNode
  onTaskClick: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          {icon}
          {title}
          <span className="text-slate-400 font-normal">({tasks.length})</span>
        </h3>
        {totalTime && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock size={12} /> {totalTime}
          </span>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center bg-white rounded-lg border border-dashed border-slate-200">
          작업 없음
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => <TaskCard key={t.id} task={t} onClick={onTaskClick} />)}
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

  if (isLoading) return <div className="p-8 text-slate-500">불러오는 중...</div>
  if (error) return <div className="p-8 text-red-500">대시보드 데이터를 불러오지 못했습니다.</div>
  if (!data) return null

  const { date, day_of_week, monthly_reminder, today, tomorrow, this_week, upcoming, active_workflows, fund_summary, missing_documents } = data

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          {new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ({DAY_LABEL[day_of_week] || day_of_week})
        </h2>
        <p className="text-sm text-slate-500 mt-1">일일 개요</p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<AlertTriangle size={14} />} label="오늘 작업" value={today.tasks.length} tone="red" />
        <StatCard icon={<Clock size={14} />} label="이번 주 작업" value={this_week.length} tone="blue" />
        <StatCard icon={<ArrowRight size={14} />} label="진행중 워크플로우" value={active_workflows.length} tone="indigo" />
        <StatCard icon={<FileWarning size={14} />} label="미수 서류" value={missing_documents.length} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {active_workflows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <ArrowRight size={16} /> 진행 중인 워크플로우
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {active_workflows.map((wf: ActiveWorkflow) => (
                  <div
                    key={wf.id}
                    onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })}
                    className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:shadow-sm hover:border-indigo-400 transition-all cursor-pointer"
                  >
                    <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-indigo-600">진행률: {wf.progress}</span>
                      {wf.next_step && <span className="text-xs text-indigo-500">다음: {wf.next_step}</span>}
                    </div>
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
          />
          <TaskSection
            title="내일"
            tasks={tomorrow.tasks}
            totalTime={tomorrow.total_estimated_time}
            icon={<Clock size={16} className="text-amber-500" />}
            onTaskClick={() => navigate('/tasks')}
          />
          <TaskSection
            title="이번 주"
            tasks={this_week}
            icon={<CheckCircle2 size={16} className="text-blue-500" />}
            onTaskClick={() => navigate('/tasks')}
          />
          <TaskSection
            title="예정"
            tasks={upcoming}
            icon={<CheckCircle2 size={16} className="text-slate-400" />}
            onTaskClick={() => navigate('/tasks')}
          />
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Building2 size={16} /> 조합 요약
            </h3>
            {fund_summary?.length ? (
              <div className="space-y-2">
                {fund_summary.slice(0, 6).map((fund: FundSummary) => (
                  <button
                    key={fund.id}
                    onClick={() => navigate('/funds')}
                    className="w-full text-left p-2 rounded border border-slate-200 hover:bg-slate-50"
                  >
                    <p className="text-sm font-medium text-slate-800">{fund.name}</p>
                    <p className="text-xs text-slate-500">LP {fund.lp_count} | 투자 {fund.investment_count} | 약정 {fund.commitment_total?.toLocaleString?.() ?? '-'}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">등록된 조합이 없습니다.</p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <FileWarning size={16} /> 미수집 서류
            </h3>
            {missing_documents?.length ? (
              <div className="space-y-2 max-h-80 overflow-auto">
                {missing_documents.slice(0, 12).map((doc: MissingDocument) => (
                  <button
                    key={doc.id}
                    onClick={() => navigate('/investments')}
                    className="w-full text-left p-2 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100"
                  >
                    <p className="text-sm font-medium text-amber-900">{doc.document_name}</p>
                    <p className="text-xs text-amber-700">{doc.fund_name} | {doc.company_name} | {labelStatus(doc.status)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">미수집 서류가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
