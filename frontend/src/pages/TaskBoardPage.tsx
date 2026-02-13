import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTaskBoard, createTask, updateTask, completeTask, deleteTask, moveTask } from '../lib/api'
import type { Task, TaskBoard, TaskCreate } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { Plus, Clock, Trash2, Check, Pencil } from 'lucide-react'

const QUADRANTS = [
  { key: 'Q1', label: '긴급·중요 (Q1)', color: 'border-red-400', bg: 'bg-red-50', badge: 'bg-red-500' },
  { key: 'Q2', label: '중요·비긴급 (Q2)', color: 'border-blue-400', bg: 'bg-blue-50', badge: 'bg-blue-500' },
  { key: 'Q3', label: '긴급·비중요 (Q3)', color: 'border-amber-400', bg: 'bg-amber-50', badge: 'bg-amber-500' },
  { key: 'Q4', label: '비긴급·비중요 (Q4)', color: 'border-gray-300', bg: 'bg-gray-50', badge: 'bg-gray-400' },
]

function TaskItem({ task, onComplete, onDelete, onEdit }: {
  task: Task
  onComplete: (id: number) => void
  onDelete: (id: number) => void
  onEdit: (task: Task) => void
}) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('taskId', String(task.id))
        e.dataTransfer.setData('fromQuadrant', task.quadrant)
      }}
      className="group flex items-start gap-2 p-2.5 bg-white rounded-md border border-slate-200 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
    >
      <button
        onClick={() => onComplete(task.id)}
        className="mt-0.5 w-4 h-4 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors shrink-0"
        title="완료"
      />
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
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
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button onClick={() => onEdit(task)} className="text-slate-400 hover:text-blue-500" title="수정">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(task.id)} className="text-slate-400 hover:text-red-500" title="삭제">
          <Trash2 size={14} />
        </button>
      </div>
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
        placeholder="작업 제목"
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
          placeholder="예) 1h, 30m"
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

function EditTaskModal({ task, onSave, onCancel }: {
  task: Task
  onSave: (id: number, data: Partial<TaskCreate>) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.split('T')[0] : '')
  const [estimatedTime, setEstimatedTime] = useState(task.estimated_time || '')
  const [quadrant, setQuadrant] = useState(task.quadrant)
  const [memo, setMemo] = useState(task.memo || '')
  const [delegateTo, setDelegateTo] = useState(task.delegate_to || '')

  const submit = () => {
    if (!title.trim()) return
    onSave(task.id, {
      title: title.trim(),
      deadline: deadline || null,
      estimated_time: estimatedTime || null,
      quadrant,
      memo: memo || null,
      delegate_to: delegateTo || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl p-5 w-96 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-800 mb-4">작업 수정</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">제목</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">마감일</label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">예상 시간</label>
              <input
                value={estimatedTime}
                onChange={e => setEstimatedTime(e.target.value)}
                placeholder="예) 2h, 30m"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">사분면</label>
              <select
                value={quadrant}
                onChange={e => setQuadrant(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="Q1">긴급·중요 (Q1)</option>
                <option value="Q2">중요·비긴급 (Q2)</option>
                <option value="Q3">긴급·비중요 (Q3)</option>
                <option value="Q4">비긴급·비중요 (Q4)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">담당자</label>
              <input
                value={delegateTo}
                onChange={e => setDelegateTo(e.target.value)}
                placeholder="선택 입력"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">메모</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={submit}
            className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            저장
          </button>
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
            취소
          </button>
        </div>
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
        <label className="block text-xs text-slate-500 mb-1">실제 소요 시간</label>
        <input
          autoFocus
          value={actualTime}
          onChange={e => setActualTime(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && actualTime && onConfirm(actualTime)}
          placeholder="예) 1h30m"
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
  const { addToast } = useToast()
  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [dragOverQuadrant, setDragOverQuadrant] = useState<string | null>(null)

  const { data: board, isLoading } = useQuery<TaskBoard>({
    queryKey: ['taskBoard', statusFilter],
    queryFn: () => fetchTaskBoard(statusFilter),
  })

  const addMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      addToast('success', '작업이 추가되었습니다.')
    },
  })

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
    mutationFn: ({ id, actualTime }: { id: number; actualTime: string }) => completeTask(id, actualTime),
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

  if (isLoading) return <div className="p-8 text-slate-500">불러오는 중...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold text-slate-900">업무 보드</h2>
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
          {['pending', 'all', 'completed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === s ? 'bg-white shadow text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {s === 'pending' ? '진행 중' : s === 'all' ? '전체' : '완료'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {QUADRANTS.map(q => {
          const tasks = board?.[q.key as keyof TaskBoard] || []
          return (
            <div
              key={q.key}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverQuadrant(q.key)
              }}
              onDragLeave={() => setDragOverQuadrant(prev => (prev === q.key ? null : prev))}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverQuadrant(null)
                const taskId = Number(e.dataTransfer.getData('taskId'))
                const fromQuadrant = e.dataTransfer.getData('fromQuadrant')
                if (!taskId || !fromQuadrant || fromQuadrant === q.key) return
                moveMutation.mutate({ id: taskId, quadrant: q.key })
              }}
              className={`rounded-xl border-2 ${q.color} ${q.bg} p-4 ${
                dragOverQuadrant === q.key ? 'ring-2 ring-blue-300 ring-inset border-dashed' : ''
              }`}
            >
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
                    onEdit={(task) => setEditingTask(task)}
                    onDelete={(id) => {
                      if (confirm('이 작업을 삭제하시겠습니까?')) deleteMutation.mutate(id)
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

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
          onCancel={() => setEditingTask(null)}
        />
      )}

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
