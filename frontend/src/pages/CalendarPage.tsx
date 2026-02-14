import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type CalendarEventInput,
  type CalendarEvent,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

const EMPTY_EVENT: CalendarEventInput = {
  title: '',
  date: new Date().toISOString().slice(0, 10),
  time: '',
  duration: null,
  description: '',
  status: 'pending',
  task_id: null,
}

function formatDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getCalendarCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const startDate = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, idx) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + idx)
    return {
      date,
      inCurrentMonth: date.getMonth() === month,
    }
  })
}

function compareEvents(a: CalendarEvent, b: CalendarEvent) {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  const at = a.time || ''
  const bt = b.time || ''
  return at.localeCompare(bt)
}

function isUrgentDate(date: string) {
  const target = parseDate(date)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  return isSameDate(target, today) || isSameDate(target, tomorrow)
}

function eventTone(event: CalendarEvent) {
  if (event.event_type === 'task') return 'bg-blue-100 text-blue-700'
  if (event.status === 'completed') return 'bg-green-100 text-green-700'
  if (event.status !== 'completed' && isUrgentDate(event.date)) return 'bg-red-100 text-red-700'
  return 'bg-indigo-100 text-indigo-700'
}

export default function CalendarPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [status, setStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createDate, setCreateDate] = useState(formatDate(new Date()))
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const monthStart = useMemo(() => formatDate(currentMonth), [currentMonth])
  const monthEnd = useMemo(
    () => formatDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)),
    [currentMonth],
  )

  const monthLabel = useMemo(
    () => currentMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }),
    [currentMonth],
  )

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['calendarEvents', status, monthStart, monthEnd],
    queryFn: () => fetchCalendarEvents({ status: status || undefined, date_from: monthStart, date_to: monthEnd, include_tasks: true }),
  })

  const createMut = useMutation({
    mutationFn: createCalendarEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
      setShowCreate(false)
      addToast('success', '일정이 추가되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CalendarEventInput> }) => updateCalendarEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
      setEditingId(null)
      addToast('success', '일정이 수정되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteCalendarEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
      addToast('success', '일정이 삭제되었습니다.')
    },
  })

  const sortedEvents = useMemo(() => (events ? [...events].sort(compareEvents) : []), [events])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of sortedEvents) {
      const list = map.get(event.date) || []
      list.push(event)
      map.set(event.date, list)
    }
    return map
  }, [sortedEvents])

  const selectedDateEvents = eventsByDate.get(selectedDate) || []
  const cells = useMemo(() => getCalendarCells(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth])

  const openCreateForDate = (date: string) => {
    setCreateDate(date)
    setEditingId(null)
    setShowCreate(true)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">캘린더</h2>
          <p className="page-subtitle">일정과 업무 마감 일정을 한 화면에서 확인합니다.</p>
        </div>
        <button className="primary-btn" onClick={() => openCreateForDate(selectedDate)}>+ 일정</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between mb-3">
        <div className="flex items-center gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 text-sm border rounded">
            <option value="">전체 상태</option>
            <option value="pending">{labelStatus('pending')}</option>
            <option value="completed">{labelStatus('completed')}</option>
          </select>
          <button
            className={`text-xs px-3 py-1 rounded ${view === 'calendar' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setView('calendar')}
          >
            월별
          </button>
          <button
            className={`text-xs px-3 py-1 rounded ${view === 'list' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setView('list')}
          >
            리스트
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-blue-700">업무 마감</span>
        <span className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-1 text-indigo-700">일반 일정</span>
        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-red-700">긴급 일정</span>
        <span className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-green-700">완료 일정</span>
      </div>

      {showCreate && (
        <EventForm
          initial={{ ...EMPTY_EVENT, date: createDate }}
          onSubmit={data => createMut.mutate(data)}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {view === 'calendar' ? (
        <div className="space-y-4">
          <div className="card-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                &lt;
              </button>
              <h3 className="text-sm font-semibold text-gray-800">{monthLabel}</h3>
              <button
                className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                &gt;
              </button>
            </div>
            <button
              className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
              onClick={() => {
                const now = new Date()
                setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                setSelectedDate(formatDate(now))
              }}
            >
              오늘
            </button>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
            {WEEKDAY_LABELS.map(label => (
              <div key={label} className="bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-600">
                {label}
              </div>
            ))}

            {isLoading ? (
              <div className="col-span-7 loading-state"><div className="loading-spinner" /></div>
            ) : (
              cells.map(({ date, inCurrentMonth }) => {
                const dateKey = formatDate(date)
                const dayEvents = eventsByDate.get(dateKey) || []
                const isToday = isSameDate(date, new Date())
                const isSelected = selectedDate === dateKey

                return (
                  <button
                    key={dateKey}
                    onClick={() => {
                      setSelectedDate(dateKey)
                      setEditingId(null)
                    }}
                    className={`bg-white p-2 min-h-[110px] text-left align-top transition-colors ${
                      inCurrentMonth ? '' : 'text-gray-300 bg-gray-50'
                    } ${isSelected ? 'ring-2 ring-inset ring-blue-400' : 'hover:bg-gray-50'}`}
                  >
                    <div className={`text-sm ${isToday ? 'bg-blue-50 font-bold text-blue-700 inline-block px-1.5 rounded' : ''}`}>
                      {date.getDate()}
                    </div>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 2).map(event => (
                        <div key={event.id} className={`text-[11px] px-1.5 py-0.5 rounded truncate ${eventTone(event)}`}>
                          {event.task_id && event.quadrant ? `[${event.quadrant}] ` : ''}
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && <p className="text-[11px] text-gray-400">+{dayEvents.length - 2}개 더</p>}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="card-base">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">
                {parseDate(selectedDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
              </h4>
              <button className="primary-btn" onClick={() => openCreateForDate(selectedDate)}>
                + 이 날짜에 추가
              </button>
            </div>

            {!selectedDateEvents.length ? (
              <p className="text-sm text-gray-400">이 날짜의 일정이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {selectedDateEvents.map(event => (
                  <div key={event.id} className="border border-gray-200 rounded-lg p-3">
                    {editingId === event.id ? (
                      <EventForm
                        initial={event}
                        onSubmit={data => updateMut.mutate({ id: event.id, data })}
                        onCancel={() => setEditingId(null)}
                        compact
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            {event.task_id && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                {event.quadrant || 'TASK'}
                              </span>
                            )}
                            <p className="text-sm font-medium text-gray-800">{event.title}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {event.time || '-'} | {event.duration != null ? `${event.duration}분` : '-'} | {event.description || '-'}
                          </p>
                          <span className={`inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded ${eventTone(event)}`}>
                            {labelStatus(event.status)}
                          </span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {event.task_id ? (
                            <span className="text-xs text-gray-400">업무 보드에서 관리</span>
                          ) : (
                            <>
                              <button className="secondary-btn" onClick={() => setEditingId(event.id)}>수정</button>
                              {event.status !== 'completed' && (
                                <button className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded" onClick={() => updateMut.mutate({ id: event.id, data: { status: 'completed' } })}>완료</button>
                              )}
                              <button className="danger-btn" onClick={() => { if (confirm('이 일정을 삭제하시겠습니까?')) deleteMut.mutate(event.id) }}>삭제</button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {isLoading ? (
            <div className="loading-state"><div className="loading-spinner" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">날짜</th>
                  <th className="px-3 py-2 text-left">제목</th>
                  <th className="px-3 py-2 text-left">시간</th>
                  <th className="px-3 py-2 text-left">소요시간</th>
                  <th className="px-3 py-2 text-left">상태</th>
                  <th className="px-3 py-2 text-left">작업</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map(event => (
                  <tr key={event.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2">{event.date}</td>
                    <td className="px-3 py-2">
                      {editingId === event.id ? (
                        <EventForm initial={event} onSubmit={data => updateMut.mutate({ id: event.id, data })} onCancel={() => setEditingId(null)} compact />
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5">
                            {event.task_id && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                {event.quadrant || 'TASK'}
                              </span>
                            )}
                            <p className="font-medium text-gray-800">{event.title}</p>
                          </div>
                          <p className="text-xs text-gray-500">{event.description || '-'}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{event.time || '-'}</td>
                    <td className="px-3 py-2">{event.duration != null ? `${event.duration}분` : '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${eventTone(event)}`}>{labelStatus(event.status)}</span>
                    </td>
                    <td className="px-3 py-2">
                      {editingId !== event.id && (
                        <div className="flex gap-1">
                          {event.task_id ? (
                            <span className="text-xs text-gray-400">업무 보드에서 관리</span>
                          ) : (
                            <>
                              <button className="secondary-btn" onClick={() => setEditingId(event.id)}>수정</button>
                              {event.status !== 'completed' && (
                                <button className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded" onClick={() => updateMut.mutate({ id: event.id, data: { status: 'completed' } })}>완료</button>
                              )}
                              <button className="danger-btn" onClick={() => { if (confirm('이 일정을 삭제하시겠습니까?')) deleteMut.mutate(event.id) }}>삭제</button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!sortedEvents.length && (
                  <tr>
                    <td className="px-3 py-4 text-gray-400" colSpan={6}>일정이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function EventForm({
  initial,
  onSubmit,
  onCancel,
  compact = false,
}: {
  initial: CalendarEventInput
  onSubmit: (data: CalendarEventInput) => void
  onCancel: () => void
  compact?: boolean
}) {
  const [form, setForm] = useState<CalendarEventInput>({
    ...initial,
    date: initial.date || new Date().toISOString().slice(0, 10),
  })

  return (
    <div className={`${compact ? '' : 'mb-3'} bg-gray-50 border border-gray-200 rounded p-2`}>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="제목" className="px-2 py-1 text-sm border rounded" />
        <input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} className="px-2 py-1 text-sm border rounded" />
        <input type="time" value={form.time || ''} onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))} className="px-2 py-1 text-sm border rounded" />
        <input type="number" value={form.duration ?? ''} onChange={e => setForm(prev => ({ ...prev, duration: e.target.value ? Number(e.target.value) : null }))} placeholder="소요시간(분)" className="px-2 py-1 text-sm border rounded" />
        <input value={form.status || 'pending'} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태" className="px-2 py-1 text-sm border rounded" />
        <input value={form.description || ''} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="설명" className="px-2 py-1 text-sm border rounded" />
      </div>
      <div className="flex gap-2 mt-2">
        <button
          className="primary-btn"
          onClick={() => {
            if (!form.title.trim() || !form.date) return
            onSubmit({
              ...form,
              title: form.title.trim(),
              time: form.time || null,
              description: form.description?.trim() || null,
            })
          }}
        >저장</button>
        <button className="secondary-btn" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}









