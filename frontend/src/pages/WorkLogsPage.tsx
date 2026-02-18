import { useState, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWorkLogs,
  fetchWorkLogCategories,
  fetchWorkLogInsights,
  createWorkLog,
  updateWorkLog,
  deleteWorkLog,
  type WorkLog,
  type WorkLogInput,
  type WorkLogInsights,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Plus, Trash2, Clock, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'

function DynamicList({
  label,
  items,
  onChange,
  color = 'slate',
}: {
  label: string
  items: { content: string }[]
  onChange: (items: { content: string }[]) => void
  color?: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className={`text-xs font-semibold text-${color}-700`}>{label}</p>
        <button onClick={() => onChange([...items, { content: '' }])} className="text-xs text-blue-600 hover:text-blue-800">
          + 추가
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="mb-1 flex-1">
          <label className="mb-1 block text-[10px] font-medium text-gray-500">{label} #{i + 1}</label>
          <div className="flex gap-1">
            <input
              value={item.content}
              onChange={(event) => {
                const next = [...items]
                next[i] = { content: event.target.value }
                onChange(next)
              }}
              className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function WorkLogForm({
  categories,
  initial,
  onSave,
  onClose,
  title: formTitle,
}: {
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
  const [details, setDetails] = useState<{ content: string }[]>(initial?.details?.map((row) => ({ content: row.content })) || [])
  const [lessons, setLessons] = useState<{ content: string }[]>(initial?.lessons?.map((row) => ({ content: row.content })) || [])
  const [followUps, setFollowUps] = useState<{ content: string }[]>(initial?.follow_ups?.map((row) => ({ content: row.content })) || [])

  const set =
    (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const submit = () => {
    if (!form.title.trim()) return
    onSave({
      ...form,
      title: form.title.trim(),
      details: details.filter((row) => row.content.trim()),
      lessons: lessons.filter((row) => row.content.trim()),
      follow_ups: followUps.filter((row) => row.content.trim()),
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-base font-semibold text-gray-800">{formTitle}</h3>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">일자</label>
          <input
            type="date"
            value={form.date}
            onChange={set('date')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">카테고리</label>
          <select
            value={form.category}
            onChange={set('category')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">제목</label>
        <input
          value={form.title}
          onChange={set('title')}
          placeholder="예: IR 업데이트 회의"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">내용</label>
        <textarea
          value={form.content}
          onChange={set('content')}
          placeholder="선택 입력"
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">예상 시간</label>
          <input
            value={form.estimated_time}
            onChange={set('estimated_time')}
            placeholder="예: 2h"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">실제 시간</label>
          <input
            value={form.actual_time}
            onChange={set('actual_time')}
            placeholder="예: 1.5h"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-gray-500">차이 시간</label>
          <input
            value={form.time_diff}
            onChange={set('time_diff')}
            placeholder="예: -0.5h"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <DynamicList label="세부 내용" items={details} onChange={setDetails} />
      <DynamicList label="교훈" items={lessons} onChange={setLessons} color="amber" />
      <DynamicList label="후속 조치" items={followUps} onChange={setFollowUps} color="blue" />

      <div className="flex gap-2">
        <button onClick={submit} disabled={!form.title.trim()} className="primary-btn w-full">저장</button>
        <button onClick={onClose} className="secondary-btn">취소</button>
      </div>
    </div>
  )
}

function WorkLogEntry({
  log,
  onDelete,
  onEdit,
}: {
  log: WorkLog
  onDelete: (id: number) => void
  onEdit: (log: WorkLog) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{log.category}</span>
        <span className="flex-1 truncate text-sm text-gray-800">{log.title}</span>
        <div className="shrink-0 flex items-center gap-2 text-xs text-gray-500">
          {log.actual_time && (
            <span className="flex items-center gap-0.5"><Clock size={11} />{log.actual_time}</span>
          )}
          <span className={log.status === 'completed' ? 'tag tag-green' : 'tag tag-amber'}>
            {labelStatus(log.status)}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-gray-100 px-3 pb-3">
          {log.content && <p className="mt-2 text-sm text-gray-600">{log.content}</p>}

          {log.estimated_time && log.actual_time && (
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
              <span>예상: {log.estimated_time}</span>
              <span>실제: {log.actual_time}</span>
              {log.time_diff && <span className="font-medium text-gray-700">차이: {log.time_diff}</span>}
            </div>
          )}

          {log.details?.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-600">세부 내용</p>
              <ul className="space-y-0.5">
                {log.details.map((detail) => (
                  <li key={detail.id} className="border-l-2 border-gray-200 pl-3 text-xs text-gray-600">{detail.content}</li>
                ))}
              </ul>
            </div>
          )}

          {log.lessons?.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-amber-700">교훈</p>
              <ul className="space-y-0.5">
                {log.lessons.map((lesson) => (
                  <li key={lesson.id} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">{lesson.content}</li>
                ))}
              </ul>
            </div>
          )}

          {log.follow_ups?.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-blue-700">후속 조치</p>
              <ul className="space-y-0.5">
                {log.follow_ups.map((followUp) => (
                  <li key={followUp.id} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    {followUp.content}
                    {followUp.target_date && <span className="ml-2 text-blue-500">({followUp.target_date})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => onEdit(log)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <Pencil size={12} /> 수정
            </button>
            <button
              onClick={() => {
                if (confirm('이 기록을 삭제하시겠습니까?')) onDelete(log.id)
              }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
            >
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function renderInsights(insights: WorkLogInsights) {
  const completedRate = insights.total_logs
    ? Math.round((insights.status_counts.completed / insights.total_logs) * 100)
    : 0
  const accuracyRate = insights.total_logs
    ? Math.round((insights.time_accuracy.accurate / insights.total_logs) * 100)
    : 0
  const followUpRate = insights.follow_up_rate.total
    ? Math.round((insights.follow_up_rate.completed / insights.follow_up_rate.total) * 100)
    : 0

  const weekdayMap = insights.weekday_counts as Record<string, number>
  const maxWeekdayCount = Math.max(...Object.values(weekdayMap), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card-base p-3">
          <p className="text-xs text-gray-500">총 기록</p>
          <p className="text-2xl font-semibold text-gray-900">{insights.total_logs}건</p>
        </div>
        <div className="card-base p-3">
          <p className="text-xs text-gray-500">시간 추정 정확도</p>
          <p className="text-2xl font-semibold text-emerald-600">{accuracyRate}%</p>
        </div>
        <div className="card-base p-3">
          <p className="text-xs text-gray-500">후속 조치 이행률</p>
          <p className="text-2xl font-semibold text-blue-600">{followUpRate}%</p>
        </div>
        <div className="card-base p-3">
          <p className="text-xs text-gray-500">완료율</p>
          <p className="text-2xl font-semibold text-gray-900">{completedRate}%</p>
        </div>
      </div>

      <div className="card-base p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">카테고리별 업무 분포</h3>
        <div className="space-y-2">
          {Object.entries(insights.category_counts)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([category, count]) => {
              const percent = insights.total_logs ? Math.round(((count as number) / insights.total_logs) * 100) : 0
              const avgTime = insights.category_avg_time[category] || 0
              return (
                <div key={category} className="flex items-center gap-3">
                  <span className="w-20 truncate text-xs text-gray-600">{category}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="w-12 text-right text-xs text-gray-500">{count as number}건</span>
                  <span className="w-16 text-right text-xs text-gray-400">평균 {avgTime}분</span>
                </div>
              )
            })}
        </div>
      </div>

      <div className="card-base p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">요일별 업무 집중도</h3>
        <div className="flex h-24 items-end gap-2">
          {['월', '화', '수', '목', '금', '토', '일'].map((day, i) => {
            const count = weekdayMap[i] ?? weekdayMap[String(i)] ?? 0
            const height = Math.max(8, (count / maxWeekdayCount) * 100)
            return (
              <div key={day} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-gray-500">{count}</span>
                <div className="w-full rounded-t bg-blue-400" style={{ height: `${height}%` }} />
                <span className="text-[10px] text-gray-500">{day}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card-base p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">시간 추정 분석</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold text-red-500">{insights.time_accuracy.over}</p>
            <p className="text-xs text-gray-500">과소 추정 (실제 &gt; 예상)</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-emerald-500">{insights.time_accuracy.accurate}</p>
            <p className="text-xs text-gray-500">정확</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-amber-500">{insights.time_accuracy.under}</p>
            <p className="text-xs text-gray-500">과대 추정 (실제 &lt; 예상)</p>
          </div>
        </div>
      </div>

      {insights.recent_lessons?.length > 0 && (
        <div className="card-base p-4">
          <h3 className="mb-2 text-sm font-semibold text-amber-700">최근 교훈</h3>
          <ul className="space-y-1">
            {insights.recent_lessons.map((lesson, i) => (
              <li key={`${lesson}-${i}`} className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                {lesson}
              </li>
            ))}
          </ul>
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
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'logs' | 'insights'>('logs')
  const [insightPeriod, setInsightPeriod] = useState<'week' | 'month' | 'quarter'>('month')

  const { data: logs, isLoading: isLogsLoading } = useQuery({
    queryKey: ['worklogs', categoryFilter],
    queryFn: () => fetchWorkLogs(categoryFilter ? { category: categoryFilter } : undefined),
    enabled: activeTab === 'logs',
  })

  const { data: categories } = useQuery({
    queryKey: ['worklogCategories'],
    queryFn: fetchWorkLogCategories,
    enabled: activeTab === 'logs',
  })

  const {
    data: insights,
    isLoading: isInsightsLoading,
    error: insightsError,
  } = useQuery({
    queryKey: ['worklogInsights', insightPeriod],
    queryFn: () => fetchWorkLogInsights(insightPeriod),
    enabled: activeTab === 'insights',
  })

  const createMut = useMutation({
    mutationFn: createWorkLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs'] })
      queryClient.invalidateQueries({ queryKey: ['worklogInsights'] })
      setShowAdd(false)
      addToast('success', '업무 기록이 추가되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WorkLogInput> }) => updateWorkLog(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs'] })
      queryClient.invalidateQueries({ queryKey: ['worklogInsights'] })
      setEditingLog(null)
      addToast('success', '업무 기록이 수정되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteWorkLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs'] })
      queryClient.invalidateQueries({ queryKey: ['worklogInsights'] })
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
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">📝 업무일지</h2>
        {activeTab === 'logs' && (
          <button
            onClick={() => {
              setShowAdd((prev) => !prev)
              setEditingLog(null)
            }}
            className="primary-btn inline-flex items-center gap-1"
          >
            <Plus size={16} /> 기록 추가
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-0.5">
        <button
          onClick={() => setActiveTab('logs')}
          className={`rounded-md px-3 py-1.5 text-xs ${activeTab === 'logs' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}
        >
          기록
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`rounded-md px-3 py-1.5 text-xs ${activeTab === 'insights' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}
        >
          인사이트
        </button>
      </div>

      {activeTab === 'logs' && (
        <>
          <div className="mb-4 flex flex-wrap gap-1">
            <button
              onClick={() => setCategoryFilter('')}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${!categoryFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              전체
            </button>
            {categories?.map((category: string) => (
              <button
                key={category}
                onClick={() => setCategoryFilter(category)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${categoryFilter === category ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {category}
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

          {isLogsLoading ? (
            <PageLoading />
          ) : Object.keys(grouped).length === 0 ? (
            <EmptyState emoji="📝" message="작성된 업무일지가 없어요" className="py-12" />
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([dateKey, items]) => (
                <div key={dateKey}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-600">
                    {new Date(`${dateKey}T00:00`).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short',
                    })}
                  </h3>
                  <div className="space-y-2">
                    {items.map((log: WorkLog) => (
                      <WorkLogEntry
                        key={log.id}
                        log={log}
                        onEdit={(entry) => {
                          setEditingLog(entry)
                          setShowAdd(false)
                        }}
                        onDelete={(id) => deleteMut.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'insights' && (
        <>
          <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {([
              ['week', '최근 1주'],
              ['month', '최근 1달'],
              ['quarter', '최근 3달'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setInsightPeriod(key)}
                className={`rounded-md px-3 py-1.5 text-xs ${insightPeriod === key ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {isInsightsLoading && <PageLoading />}
          {insightsError && <p className="text-sm text-red-500">인사이트를 불러오지 못했습니다.</p>}
          {!isInsightsLoading && !insightsError && insights && renderInsights(insights)}
        </>
      )}
    </div>
  )
}




