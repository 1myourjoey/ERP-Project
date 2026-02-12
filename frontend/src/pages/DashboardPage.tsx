import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../lib/api'
import type { Task } from '../lib/api'
import { Clock, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'

const QUADRANT_COLORS: Record<string, string> = {
  Q1: 'bg-red-100 text-red-700',
  Q2: 'bg-blue-100 text-blue-700',
  Q3: 'bg-amber-100 text-amber-700',
  Q4: 'bg-gray-100 text-gray-600',
}

function TaskCard({ task }: { task: Task }) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:shadow-sm transition-shadow">
      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${QUADRANT_COLORS[task.quadrant] || ''}`}>
        {task.quadrant}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
          {deadlineStr && <span>{deadlineStr}</span>}
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

function TaskSection({ title, tasks, totalTime, icon }: {
  title: string
  tasks: Task[]
  totalTime?: string
  icon?: React.ReactNode
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
          {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  })

  if (isLoading) return <div className="p-8 text-slate-500">로딩 중...</div>
  if (error) return <div className="p-8 text-red-500">데이터를 불러올 수 없습니다.</div>

  const { date, day_of_week, today, tomorrow, this_week, upcoming, active_workflows } = data

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          {new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ({day_of_week})
        </h2>
        <p className="text-sm text-slate-500 mt-1">오늘의 업무 현황</p>
      </div>

      {/* Active Workflows */}
      {active_workflows.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <ArrowRight size={16} /> 진행 중인 워크플로우
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active_workflows.map((wf: any) => (
              <div key={wf.id} className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-indigo-600">진행: {wf.progress}</span>
                  {wf.next_step && (
                    <span className="text-xs text-indigo-500">다음: {wf.next_step}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaskSection
          title="오늘"
          tasks={today.tasks}
          totalTime={today.total_estimated_time}
          icon={<AlertTriangle size={16} className="text-red-500" />}
        />
        <TaskSection
          title="내일"
          tasks={tomorrow.tasks}
          totalTime={tomorrow.total_estimated_time}
          icon={<Clock size={16} className="text-amber-500" />}
        />
        <TaskSection
          title="이번 주"
          tasks={this_week}
          icon={<CheckCircle2 size={16} className="text-blue-500" />}
        />
        <TaskSection
          title="다가오는 일정"
          tasks={upcoming}
          icon={<CheckCircle2 size={16} className="text-slate-400" />}
        />
      </div>
    </div>
  )
}
