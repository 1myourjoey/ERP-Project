import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTaskBoard, createTask, completeTask, deleteTask } from '../lib/api'
import type { Task, TaskBoard, TaskCreate } from '../lib/api'
import { Plus, Clock, Trash2, Check } from 'lucide-react'

const QUADRANTS = [
  { key: 'Q1', label: 'Q1: 긴급 & 중요', color: 'border-red-400', bg: 'bg-red-50', badge: 'bg-red-500' },
  { key: 'Q2', label: 'Q2: 중요 & 비긴급', color: 'border-blue-400', bg: 'bg-blue-50', badge: 'bg-blue-500' },
  { key: 'Q3', label: 'Q3: 긴급 & 비중요', color: 'border-amber-400', bg: 'bg-amber-50', badge: 'bg-amber-500' },
  { key: 'Q4', label: 'Q4: 비긴급 & 비중요', color: 'border-gray-300', bg: 'bg-gray-50', badge: 'bg-gray-400' },
]

function TaskItem({ task, onComplete, onDelete }: {
  task: Task
  onComplete: (id: number) => void
  onDelete: (id: number) => void
}) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="group flex items-start gap-2 p-2.5 bg-white rounded-md border border-slate-200 hover:shadow-sm transition-shadow">
      <button
        onClick={() => onComplete(task.id)}
        className="mt-0.5 w-4 h-4 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors shrink-0"
        title="완료"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 leading-snug">{task.title}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
          {deadlineStr && <span>{deadlineStr}</span>}
          {task.estimated_time && (
            <span className="flex items-center gap-0.5">
              <Clock size={11} /> {task.estimated_time}
            </span>
          )}
          {task.workflow_instance_id && (
            <span className="text-indigo-500">WF</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
        title="삭제"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function AddTaskForm({ quadrant, onAdd }: { quadrant: string; onAdd: (data: TaskCreate) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')

  const submit = () => {
    if (!title.trim()) return
    onAdd({
      title: title.trim(),
      quadrant,
      deadline: deadline || null,
      estimated_time: estimatedTime || null,
    })
    setTitle('')
    setDeadline('')
    setEstimatedTime('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1 py-2 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
      >
        <Plus size={14} /> 추가
      </button>
    )
  }

  return (
    <div className="p-2 bg-white rounded-md border border-slate-200 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="작업명"
        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={deadline}
          onChange={e => setDeadline(e.target.value)}
          className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <input
          value={estimatedTime}
          onChange={e => setEstimatedTime(e.target.value)}
          placeholder="예: 1h, 30m"
          className="w-24 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
          추가
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded transition-colors">
          취소
        </button>
      </div>
    </div>
  )
}

function CompleteModal({ task, onConfirm, onCancel }: {
  task: Task
  onConfirm: (actualTime: string) => void
  onCancel: () => void
}) {
  const [actualTime, setActualTime] = useState(task.estimated_time || '')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-800 mb-1">작업 완료</h3>
        <p className="text-sm text-slate-600 mb-4">{task.title}</p>
        <label className="block text-xs text-slate-500 mb-1">실제 소요시간</label>
        <input
          autoFocus
          value={actualTime}
          onChange={e => setActualTime(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && actualTime && onConfirm(actualTime)}
          placeholder="예: 1h30m"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={() => actualTime && onConfirm(actualTime)}
            className="flex-1 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
          >
            <Check size={16} /> 완료
          </button>
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TaskBoardPage() {
  const queryClient = useQueryClient()
  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')

  const { data: board, isLoading } = useQuery<TaskBoard>({
    queryKey: ['taskBoard', statusFilter],
    queryFn: () => fetchTaskBoard(statusFilter),
  })

  const addMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['taskBoard'] }),
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, actualTime }: { id: number; actualTime: string }) => completeTask(id, actualTime),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCompletingTask(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['taskBoard'] }),
  })

  if (isLoading) return <div className="p-8 text-slate-500">로딩 중...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold text-slate-900">작업 보드</h2>
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
          {['pending', 'all', 'completed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === s ? 'bg-white shadow text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s === 'pending' ? '진행' : s === 'all' ? '전체' : '완료'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {QUADRANTS.map(q => {
          const tasks = board?.[q.key as keyof TaskBoard] || []
          return (
            <div key={q.key} className={`rounded-xl border-2 ${q.color} ${q.bg} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${q.badge}`} />
                <h3 className="text-sm font-semibold text-slate-700">{q.label}</h3>
                <span className="text-xs text-slate-400 ml-auto">{tasks.length}</span>
              </div>
              <div className="space-y-1.5">
                {tasks.map(t => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    onComplete={() => setCompletingTask(t)}
                    onDelete={(id) => {
                      if (confirm('삭제하시겠습니까?')) deleteMutation.mutate(id)
                    }}
                  />
                ))}
              </div>
              <div className="mt-2">
                <AddTaskForm quadrant={q.key} onAdd={(data) => addMutation.mutate(data)} />
              </div>
            </div>
          )
        })}
      </div>

      {completingTask && (
        <CompleteModal
          task={completingTask}
          onConfirm={(actualTime) => completeMutation.mutate({ id: completingTask.id, actualTime })}
          onCancel={() => setCompletingTask(null)}
        />
      )}
    </div>
  )
}
