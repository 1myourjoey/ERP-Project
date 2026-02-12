import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, type CalendarEventInput } from '../lib/api'

const EMPTY_EVENT: CalendarEventInput = {
  title: '',
  date: new Date().toISOString().slice(0, 10),
  time: '',
  duration: null,
  description: '',
  status: 'pending',
  task_id: null,
}

export default function CalendarPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: events, isLoading } = useQuery({
    queryKey: ['calendarEvents', status],
    queryFn: () => fetchCalendarEvents({ status: status || undefined }),
  })

  const createMut = useMutation({
    mutationFn: createCalendarEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
      setShowCreate(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CalendarEventInput> }) => updateCalendarEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
      setEditingId(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteCalendarEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendarEvents'] }),
  })

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">Calendar</h2>

      <div className="flex items-center justify-between mb-3">
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 py-1 text-sm border rounded">
          <option value="">All status</option>
          <option value="pending">pending</option>
          <option value="completed">completed</option>
        </select>
        <button className="text-xs px-3 py-1 bg-blue-600 text-white rounded" onClick={() => setShowCreate(v => !v)}>+ Event</button>
      </div>

      {showCreate && <EventForm initial={EMPTY_EVENT} onSubmit={data => createMut.mutate(data)} onCancel={() => setShowCreate(false)} />}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Duration</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {events?.map((event: any) => (
                <tr key={event.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">{event.date}</td>
                  <td className="px-3 py-2">
                    {editingId === event.id ? (
                      <EventForm initial={event} onSubmit={data => updateMut.mutate({ id: event.id, data })} onCancel={() => setEditingId(null)} compact />
                    ) : (
                      <div>
                        <p className="font-medium text-slate-800">{event.title}</p>
                        <p className="text-xs text-slate-500">{event.description || '-'}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{event.time || '-'}</td>
                  <td className="px-3 py-2">{event.duration ?? '-'} min</td>
                  <td className="px-3 py-2">{event.status}</td>
                  <td className="px-3 py-2">
                    {editingId !== event.id && (
                      <div className="flex gap-1">
                        <button className="text-xs px-2 py-0.5 bg-slate-100 rounded" onClick={() => setEditingId(event.id)}>Edit</button>
                        <button className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded" onClick={() => updateMut.mutate({ id: event.id, data: { status: 'completed' } })}>Complete</button>
                        <button className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded" onClick={() => { if (confirm('Delete this event?')) deleteMut.mutate(event.id) }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!events?.length && (
                <tr>
                  <td className="px-3 py-4 text-slate-400" colSpan={6}>No calendar events.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
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
    <div className={`${compact ? '' : 'mb-3'} bg-slate-50 border border-slate-200 rounded p-2`}>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Title" className="px-2 py-1 text-sm border rounded" />
        <input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} className="px-2 py-1 text-sm border rounded" />
        <input type="time" value={form.time || ''} onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))} className="px-2 py-1 text-sm border rounded" />
        <input type="number" value={form.duration ?? ''} onChange={e => setForm(prev => ({ ...prev, duration: e.target.value ? Number(e.target.value) : null }))} placeholder="Duration" className="px-2 py-1 text-sm border rounded" />
        <input value={form.status || 'pending'} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="Status" className="px-2 py-1 text-sm border rounded" />
        <input value={form.description || ''} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Description" className="px-2 py-1 text-sm border rounded" />
      </div>
      <div className="flex gap-2 mt-2">
        <button
          className="text-xs px-3 py-1 bg-blue-600 text-white rounded"
          onClick={() => {
            if (!form.title.trim() || !form.date) return
            onSubmit({
              ...form,
              title: form.title.trim(),
              time: form.time || null,
              description: form.description?.trim() || null,
            })
          }}
        >Save</button>
        <button className="text-xs px-3 py-1 bg-white border rounded" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
