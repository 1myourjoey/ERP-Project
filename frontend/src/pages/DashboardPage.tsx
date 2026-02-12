import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchDashboard } from '../lib/api'
import type { Task } from '../lib/api'
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, Building2, FileWarning } from 'lucide-react'

const QUADRANT_COLORS: Record<string, string> = {
  Q1: 'bg-red-100 text-red-700',
  Q2: 'bg-blue-100 text-blue-700',
  Q3: 'bg-amber-100 text-amber-700',
  Q4: 'bg-gray-100 text-gray-600',
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:shadow-sm hover:border-blue-300 transition-all cursor-pointer"
    >
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
  icon?: React.ReactNode
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
          No tasks
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => <TaskCard key={t.id} task={t} onClick={onTaskClick} />)}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  })

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Failed to load dashboard data.</div>

  const { date, day_of_week, today, tomorrow, this_week, upcoming, active_workflows, fund_summary, missing_documents } = data

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          {new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} ({day_of_week})
        </h2>
        <p className="text-sm text-slate-500 mt-1">Daily overview</p>
      </div>

      {active_workflows.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <ArrowRight size={16} /> Active Workflows
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active_workflows.map((wf: any) => (
              <div
                key={wf.id}
                onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })}
                className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:shadow-sm hover:border-indigo-400 transition-all cursor-pointer"
              >
                <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-indigo-600">Progress: {wf.progress}</span>
                  {wf.next_step && <span className="text-xs text-indigo-500">Next: {wf.next_step}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 size={16} /> Fund Summary
          </h3>
          {fund_summary?.length ? (
            <div className="space-y-2">
              {fund_summary.slice(0, 6).map((fund: any) => (
                <button
                  key={fund.id}
                  onClick={() => navigate('/funds')}
                  className="w-full text-left p-2 rounded border border-slate-200 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-800">{fund.name}</p>
                  <p className="text-xs text-slate-500">LP {fund.lp_count} | Inv {fund.investment_count} | Commit {fund.commitment_total?.toLocaleString?.() ?? '-'}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No funds yet.</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FileWarning size={16} /> Missing Documents
          </h3>
          {missing_documents?.length ? (
            <div className="space-y-2 max-h-56 overflow-auto">
              {missing_documents.slice(0, 10).map((doc: any) => (
                <button
                  key={doc.id}
                  onClick={() => navigate('/investments')}
                  className="w-full text-left p-2 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100"
                >
                  <p className="text-sm font-medium text-amber-900">{doc.document_name}</p>
                  <p className="text-xs text-amber-700">{doc.fund_name} | {doc.company_name} | {doc.status}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No missing documents.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaskSection
          title="Today"
          tasks={today.tasks}
          totalTime={today.total_estimated_time}
          icon={<AlertTriangle size={16} className="text-red-500" />}
          onTaskClick={() => navigate('/tasks')}
        />
        <TaskSection
          title="Tomorrow"
          tasks={tomorrow.tasks}
          totalTime={tomorrow.total_estimated_time}
          icon={<Clock size={16} className="text-amber-500" />}
          onTaskClick={() => navigate('/tasks')}
        />
        <TaskSection
          title="This Week"
          tasks={this_week}
          icon={<CheckCircle2 size={16} className="text-blue-500" />}
          onTaskClick={() => navigate('/tasks')}
        />
        <TaskSection
          title="Upcoming"
          tasks={upcoming}
          icon={<CheckCircle2 size={16} className="text-slate-400" />}
          onTaskClick={() => navigate('/tasks')}
        />
      </div>
    </div>
  )
}
