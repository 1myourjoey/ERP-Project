import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'

import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  type CalendarEvent,
  type CalendarEventInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { resolveDateTone, type TaskDeadlineTone } from '../lib/taskUrgency'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

type EventTone = TaskDeadlineTone

interface MiniCalendarProps {
  onTaskClick?: (taskId: number) => void
  onTaskComplete?: (taskId: number) => void
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

function getCalendarCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const startDate = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, idx) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + idx)
    return { date, inCurrentMonth: date.getMonth() === month }
  })
}

function getEventTone(event: CalendarEvent, today: Date): EventTone {
  if (event.event_type !== 'task' || event.status === 'completed') return 'none'
  return resolveDateTone(event.date, today)
}

function dotClass(event: CalendarEvent, today: Date) {
  if (event.event_type === 'workflow') return 'bg-violet-500'
  if (event.event_type !== 'task') return 'bg-emerald-500'

  const tone = getEventTone(event, today)
  if (tone === 'overdue') return 'bg-red-500'
  if (tone === 'today') return 'bg-orange-500'
  if (tone === 'this_week') return 'bg-amber-400'
  return 'bg-[#558ef8]'
}

function typeLabel(event: CalendarEvent) {
  if (event.event_type === 'workflow') return '워크플로우'
  if (event.event_type === 'task') return '업무'
  return '일반 일정'
}

function statusBadge(event: CalendarEvent, today: Date): { text: string; className: string } {
  const tone = getEventTone(event, today)
  if (tone === 'overdue') {
    return { text: '지연', className: 'rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700' }
  }
  if (tone === 'today') {
    return { text: '오늘', className: 'rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700' }
  }
  if (tone === 'this_week') {
    return { text: '이번주', className: 'rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700' }
  }
  if (event.status === 'completed') {
    return { text: '완료', className: 'rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700' }
  }
  if (event.status === 'pending') {
    return { text: '진행중', className: 'rounded-full bg-[#e6efff] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a3660]' }
  }
  return { text: labelStatus(event.status), className: 'rounded-full bg-[#fff7d6] px-1.5 py-0.5 text-[10px] font-semibold text-[#64748b]' }
}

export default function MiniCalendar({ onTaskClick, onTaskComplete }: MiniCalendarProps) {
  const queryClient = useQueryClient()
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(formatDate(today))
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')

  const monthStart = useMemo(() => formatDate(currentMonth), [currentMonth])
  const monthEnd = useMemo(
    () => formatDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)),
    [currentMonth],
  )
  const monthLabel = useMemo(
    () => currentMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }),
    [currentMonth],
  )
  const cells = useMemo(() => getCalendarCells(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth])

  const { data: events } = useQuery<CalendarEvent[]>({
    queryKey: ['calendarEvents', monthStart, monthEnd],
    queryFn: () => fetchCalendarEvents({ date_from: monthStart, date_to: monthEnd, include_tasks: true }),
  })

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events ?? []) {
      const list = map.get(event.date) || []
      list.push(event)
      map.set(event.date, list)
    }
    return map
  }, [events])

  const selectedEvents = useMemo(() => {
    const list = [...(eventsByDate.get(selectedDate) || [])]
    return list.sort((a, b) => {
      const aTone = getEventTone(a, today)
      const bTone = getEventTone(b, today)
      const aPriority = aTone === 'overdue' ? 0 : a.status === 'pending' ? 1 : 2
      const bPriority = bTone === 'overdue' ? 0 : b.status === 'pending' ? 1 : 2
      if (aPriority !== bPriority) return aPriority - bPriority
      if ((a.time || '') !== (b.time || '')) return (a.time || '').localeCompare(b.time || '')
      return a.title.localeCompare(b.title)
    })
  }, [eventsByDate, selectedDate, today])

  const createMut = useMutation({
    mutationFn: (data: CalendarEventInput) => createCalendarEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
      setShowCreate(false)
      setNewTitle('')
      setNewTime('')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCalendarEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
    },
  })

  return (
    <div className="rounded-2xl border border-[#e6eefc] bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
          className="icon-btn text-[#64748b] hover:bg-[#d8e5fb]"
          aria-label="이전 달"
        >
          <ChevronLeft size={14} />
        </button>
        <p className="text-xs font-semibold text-[#0f1f3d]">{monthLabel}</p>
        <button
          onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
          className="icon-btn text-[#64748b] hover:bg-[#d8e5fb]"
          aria-label="다음 달"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-[#64748b]">
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#558ef8]" />업무</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-violet-500" />워크플로우</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />일정</span>
        <span className="text-[#94a3b8]">|</span>
        <span className="inline-flex items-center gap-1 text-red-600">🔴 지연</span>
        <span className="inline-flex items-center gap-1 text-orange-600">🟠 오늘</span>
        <span className="inline-flex items-center gap-1 text-amber-600">🟡 이번주</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[#64748b]">
        {WEEKDAY_LABELS.map((label) => <div key={label}>{label}</div>)}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ date, inCurrentMonth }) => {
          const key = formatDate(date)
          const dateEvents = eventsByDate.get(key) || []
          const dotEvents = dateEvents.filter((event) => event.status !== 'completed')
          const hasOverdueTask = dateEvents.some((event) => getEventTone(event, today) === 'overdue')
          const hasTodayTask = !hasOverdueTask && dateEvents.some((event) => getEventTone(event, today) === 'today')

          return (
            <button
              key={key}
              onClick={() => setSelectedDate(key)}
              className={`min-h-10 rounded border px-1 py-1 text-left ${
                selectedDate === key
                  ? 'border-[#b2cbfb] bg-[#f5f9ff]'
                  : hasOverdueTask
                    ? 'border-red-300 bg-red-50 hover:bg-red-100'
                    : hasTodayTask
                      ? 'border-orange-300 bg-orange-50 hover:bg-orange-100'
                      : 'border-[#e6eefc] bg-white hover:bg-[#f5f9ff]'
              } ${inCurrentMonth ? '' : 'text-[#94a3b8]'}`}
            >
              <p className="text-[10px]">{date.getDate()}</p>
              <div className="mt-0.5 flex flex-wrap gap-[2px]">
                {dotEvents.slice(0, 3).map((event) => (
                  <span key={`${event.id}-${event.title}`} className={`h-1.5 w-1.5 rounded-full ${dotClass(event, today)}`} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-[#0f1f3d]">{parseDate(selectedDate).toLocaleDateString('ko-KR')}</p>
          <button
            onClick={() => setShowCreate((prev) => !prev)}
            className="primary-btn btn-sm"
          >
            <Plus size={12} className="mr-1 inline" /> 일정 추가
          </button>
        </div>

        {showCreate && (
          <div className="mb-2 space-y-1 rounded border border-[#c5d8fb] bg-white p-2">
            <div>
              <label className="form-label text-[10px]">일정 제목</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="일정 제목"
                className="form-input-sm"
              />
            </div>
            <div>
              <label className="form-label text-[10px]">시간</label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="form-input-sm"
              />
            </div>
            <button
              onClick={() => {
                if (!newTitle.trim()) return
                createMut.mutate({
                  title: newTitle.trim(),
                  date: selectedDate,
                  time: newTime || null,
                  status: 'pending',
                  duration: null,
                  description: null,
                  task_id: null,
                })
              }}
              className="primary-btn btn-sm w-full"
            >
              추가
            </button>
          </div>
        )}

        {!selectedEvents.length ? (
          <p className="text-xs text-[#64748b]">선택한 날짜에 일정이 없습니다.</p>
        ) : (
          <div className="max-h-44 space-y-1 overflow-auto">
            {selectedEvents.map((event) => {
              const tone = getEventTone(event, today)
              const badge = statusBadge(event, today)
              const taskId = event.task_id ? Math.abs(Number(event.task_id)) : null

              return (
                <div
                  key={`${event.id}-${event.title}`}
                  onClick={() => {
                    if (taskId && onTaskClick) {
                      onTaskClick(taskId)
                    }
                  }}
                  className={`rounded border bg-white p-1.5 ${
                    tone === 'overdue' ? 'border-red-300 border-l-4 bg-red-50/60' : 'border-[#d8e5fb]'
                  } ${
                    taskId && onTaskClick ? 'cursor-pointer hover:bg-[#f5f9ff]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p className={`truncate text-xs text-[#0f1f3d] ${event.status === 'completed' ? 'line-through opacity-60' : ''}`}>
                        {event.title}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className={badge.className}>{badge.text}</span>
                      {taskId && onTaskComplete && event.status !== 'completed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onTaskComplete(taskId)
                          }}
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                          title="빠른 완료"
                          aria-label="빠른 완료"
                        >
                          <CheckCircle2 size={12} />
                        </button>
                      )}
                      {event.id > 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteMut.mutate(event.id)
                          }}
                          className="rounded p-1 text-red-500 hover:bg-red-100 hover:text-red-700"
                          title="삭제"
                          aria-label="삭제"
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-[11px] text-[#64748b]">
                    {event.time || '-'} | {typeLabel(event)} | {tone === 'overdue' ? '기한 초과' : labelStatus(event.status)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


