import { useState, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWorkLogs,
  fetchWorkLogCategories,
  createWorkLog,
  updateWorkLog,
  deleteWorkLog,
  type WorkLog,
  type WorkLogInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Plus, Trash2, Clock, BookOpen, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react'

function DynamicList({ label, items, onChange, color = 'slate' }: {
  label: string
  items: { content: string }[]
  onChange: (items: { content: string }[]) => void
  color?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-xs font-semibold text-${color}-700`}>{label}</p>
        <button
          onClick={() => onChange([...items, { content: '' }])}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + 추가
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-1 mb-1">
          <input
            value={item.content}
            onChange={e => {
              const next = [...items]
              next[i] = { content: e.target.value }
              onChange(next)
            }}
            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

function WorkLogForm({ categories, initial, onSave, onClose, title: formTitle }: {
  categories: string[]
  initial?: WorkLog
  onSave: (data: WorkLogInput) => void
  onClose: () => void
  title: string
}) {
  const [form, setForm] = useState({
    date: initial?.date || new Date().toISOString().split('T')[0],
    category: initial?.category || categories[0] || '',
    title: initial?.title || '',
    content: initial?.content || '',
    status: initial?.status || 'completed',
    estimated_time: initial?.estimated_time || '',
    actual_time: initial?.actual_time || '',
    time_diff: initial?.time_diff || '',
  })
  const [details, setDetails] = useState<{ content: string }[]>(
    initial?.details?.map(d => ({ content: d.content })) || []
  )
  const [lessons, setLessons] = useState<{ content: string }[]>(
    initial?.lessons?.map(l => ({ content: l.content })) || []
  )
  const [followUps, setFollowUps] = useState<{ content: string }[]>(
    initial?.follow_ups?.map(f => ({ content: f.content })) || []
  )

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const submit = () => {
    if (!form.title) return
    onSave({
      ...form,
      details: details.filter(d => d.content.trim()),
      lessons: lessons.filter(l => l.content.trim()),
      follow_ups: followUps.filter(f => f.content.trim()),
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-base font-semibold text-gray-800">{formTitle}</h3>

      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={form.date} onChange={set('date')} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <select value={form.category} onChange={set('category')} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <input
        value={form.title}
        onChange={set('title')}
        placeholder="제목"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <textarea
        value={form.content}
        onChange={set('content')}
        placeholder="내용 (선택)"
        rows={2}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
      />

      <div className="grid grid-cols-3 gap-2">
        <input value={form.estimated_time} onChange={set('estimated_time')} placeholder="예상" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input value={form.actual_time} onChange={set('actual_time')} placeholder="실제" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input value={form.time_diff} onChange={set('time_diff')} placeholder="차이" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>

      <DynamicList label="세부 내용" items={details} onChange={setDetails} />
      <DynamicList label="교훈" items={lessons} onChange={setLessons} color="amber" />
      <DynamicList label="후속 조치" items={followUps} onChange={setFollowUps} color="blue" />

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!form.title}
          className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
        >
          저장
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
          취소
        </button>
      </div>
    </div>
  )
}

function WorkLogEntry({ log, onDelete, onEdit }: { log: WorkLog; onDelete: (id: number) => void; onEdit: (log: WorkLog) => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded shrink-0">
          {log.category}
        </span>
        <span className="flex-1 text-sm text-gray-800 truncate">{log.title}</span>
        <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
          {log.actual_time && (
            <span className="flex items-center gap-0.5"><Clock size={11} />{log.actual_time}</span>
          )}
          <span className={`px-1.5 py-0.5 rounded text-xs ${
            log.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {labelStatus(log.status)}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 space-y-2">
          {log.content && (
            <p className="text-sm text-gray-600 mt-2">{log.content}</p>
          )}

          {log.estimated_time && log.actual_time && (
            <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
              <span>예상: {log.estimated_time}</span>
              <span>실제: {log.actual_time}</span>
              {log.time_diff && <span className="font-medium text-gray-700">차이: {log.time_diff}</span>}
            </div>
          )}

          {log.details?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">세부 내용</p>
              <ul className="space-y-0.5">
                {log.details.map(d => (
                  <li key={d.id} className="text-xs text-gray-600 pl-3 border-l-2 border-gray-200">{d.content}</li>
                ))}
              </ul>
            </div>
          )}

          {log.lessons?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">교훈</p>
              <ul className="space-y-0.5">
                {log.lessons.map(l => (
                  <li key={l.id} className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">{l.content}</li>
                ))}
              </ul>
            </div>
          )}

          {log.follow_ups?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-700 mb-1">후속 조치</p>
              <ul className="space-y-0.5">
                {log.follow_ups.map(f => (
                  <li key={f.id} className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    {f.content}
                    {f.target_date && <span className="ml-2 text-blue-500">({f.target_date})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => onEdit(log)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Pencil size={12} /> 수정
            </button>
            <button
              onClick={() => { if (confirm('이 기록을 삭제하시겠습니까?')) onDelete(log.id) }}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WorkLogsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const { data: logs, isLoading } = useQuery({
    queryKey: ['worklogs', categoryFilter],
    queryFn: () => fetchWorkLogs(categoryFilter ? { category: categoryFilter } : undefined),
  })

  const { data: categories } = useQuery({
    queryKey: ['worklogCategories'],
    queryFn: fetchWorkLogCategories,
  })

  const createMut = useMutation({
    mutationFn: createWorkLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs'] })
      setShowAdd(false)
      addToast('success', '업무 기록이 추가되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WorkLogInput> }) => updateWorkLog(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs'] })
      setEditingLog(null)
      addToast('success', '업무 기록이 수정되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteWorkLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs'] })
      addToast('success', '업무 기록이 삭제되었습니다.')
    },
  })

  const grouped: Record<string, WorkLog[]> = {}
  if (logs) {
    for (const log of logs) {
      const key = log.date
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(log)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={24} /> 업무 기록
        </h2>
        <button
          onClick={() => { setShowAdd(!showAdd); setEditingLog(null) }}
          className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> 기록 추가
        </button>
      </div>

      <div className="flex gap-1 flex-wrap mb-4">
        <button
          onClick={() => setCategoryFilter('')}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            !categoryFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          전체
        </button>
        {categories?.map((c: string) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              categoryFilter === c ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {showAdd && categories && (
        <div className="mb-4">
          <WorkLogForm
            categories={categories}
            title="업무 기록 추가"
            onSave={(data) => createMut.mutate(data)}
            onClose={() => setShowAdd(false)}
          />
        </div>
      )}

      {editingLog && categories && (
        <div className="mb-4">
          <WorkLogForm
            categories={categories}
            initial={editingLog}
            title="업무 기록 수정"
            onSave={(data) => updateMut.mutate({ id: editingLog.id, data })}
            onClose={() => setEditingLog(null)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">기록이 없습니다.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-gray-600 mb-2">
                {new Date(date + 'T00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
              </h3>
              <div className="space-y-2">
                {items.map((log: WorkLog) => (
                  <WorkLogEntry
                    key={log.id}
                    log={log}
                    onEdit={(entry) => { setEditingLog(entry); setShowAdd(false) }}
                    onDelete={(id) => deleteMut.mutate(id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}



