import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  type CalendarEvent,
  type CalendarEventInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

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

function dotClass(event: CalendarEvent) {
  if (event.event_type === 'workflow') return 'bg-violet-500'
  if (event.event_type === 'task') return 'bg-blue-500'
  return 'bg-emerald-500'
}

function typeLabel(event: CalendarEvent) {
  if (event.event_type === 'workflow') return '워크플로우'
  if (event.event_type === 'task') return '업무'
  return '일반 일정'
}

export default function MiniCalendar() {
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

  const selectedEvents = eventsByDate.get(selectedDate) || []

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
          className="rounded bg-gray-100 p-1 text-gray-600 hover:bg-gray-200"
          aria-label="이전 달"
        >
          <ChevronLeft size={14} />
        </button>
        <p className="text-xs font-semibold text-gray-700">{monthLabel}</p>
        <button
          onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
          className="rounded bg-gray-100 p-1 text-gray-600 hover:bg-gray-200"
          aria-label="다음 달"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2 text-[10px] text-gray-500">
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-blue-500" />업무</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-violet-500" />워크플로우</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />일정</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500">
        {WEEKDAY_LABELS.map((label) => <div key={label}>{label}</div>)}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ date, inCurrentMonth }) => {
          const key = formatDate(date)
          const dateEvents = eventsByDate.get(key) || []
          return (
            <button
              key={key}
              onClick={() => setSelectedDate(key)}
              className={`min-h-10 rounded border px-1 py-1 text-left ${
                selectedDate === key ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-white hover:bg-gray-50'
              } ${inCurrentMonth ? '' : 'text-gray-300'}`}
            >
              <p className="text-[10px]">{date.getDate()}</p>
              <div className="mt-0.5 flex flex-wrap gap-[2px]">
                {dateEvents.slice(0, 3).map((event) => (
                  <span key={`${event.id}-${event.title}`} className={`h-1.5 w-1.5 rounded-full ${dotClass(event)}`} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-gray-700">{parseDate(selectedDate).toLocaleDateString('ko-KR')}</p>
          <button
            onClick={() => setShowCreate((prev) => !prev)}
            className="rounded bg-blue-600 px-2 py-1 text-[11px] text-white hover:bg-blue-700"
          >
            <Plus size={12} className="mr-1 inline" /> 일정 추가
          </button>
        </div>

        {showCreate && (
          <div className="mb-2 space-y-1 rounded border border-blue-200 bg-white p-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="일정 제목"
              className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
            />
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
              className="w-full rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
            >
              추가
            </button>
          </div>
        )}

        {!selectedEvents.length ? (
          <p className="text-xs text-gray-400">선택한 날짜에 일정이 없습니다.</p>
        ) : (
          <div className="max-h-44 space-y-1 overflow-auto">
            {selectedEvents.map((event) => (
              <div key={`${event.id}-${event.title}`} className="rounded border border-gray-200 bg-white p-1.5">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs text-gray-800">{event.title}</p>
                  {event.id > 0 ? (
                    <button onClick={() => deleteMut.mutate(event.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-gray-500">
                  {event.time || '-'} | {typeLabel(event)} | {labelStatus(event.status)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

