import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchChecklists,
  fetchChecklist,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  type ChecklistInput,
  type ChecklistItemInput,
} from '../lib/api'

const EMPTY_CHECKLIST: ChecklistInput = {
  name: '',
  category: '',
  items: [],
}

const EMPTY_ITEM: ChecklistItemInput = {
  order: 1,
  name: '',
  required: true,
  checked: false,
  notes: '',
}

export default function ChecklistsPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingChecklist, setEditingChecklist] = useState(false)
  const [showItemCreate, setShowItemCreate] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)

  const { data: checklists, isLoading } = useQuery({ queryKey: ['checklists'], queryFn: fetchChecklists })
  const { data: checklist } = useQuery({
    queryKey: ['checklist', selectedId],
    queryFn: () => fetchChecklist(selectedId as number),
    enabled: !!selectedId,
  })

  const progress = useMemo(() => {
    const total = checklist?.items?.length ?? 0
    const done = checklist?.items?.filter((item: any) => item.checked).length ?? 0
    return `${done}/${total}`
  }, [checklist])

  const createMut = useMutation({
    mutationFn: createChecklist,
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setSelectedId(created.id)
      setShowCreate(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ChecklistInput> }) => updateChecklist(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      setEditingChecklist(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteChecklist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setSelectedId(null)
    },
  })

  const createItemMut = useMutation({
    mutationFn: ({ checklistId, data }: { checklistId: number; data: ChecklistItemInput }) => createChecklistItem(checklistId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setShowItemCreate(false)
    },
  })

  const updateItemMut = useMutation({
    mutationFn: ({ checklistId, itemId, data }: { checklistId: number; itemId: number; data: Partial<ChecklistItemInput> }) => updateChecklistItem(checklistId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setEditingItemId(null)
    },
  })

  const deleteItemMut = useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: number; itemId: number }) => deleteChecklistItem(checklistId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
    },
  })

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">Checklists</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Checklist Library</h3>
            <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowCreate(v => !v)}>+ Checklist</button>
          </div>

          {showCreate && (
            <ChecklistForm
              initial={EMPTY_CHECKLIST}
              onSubmit={data => createMut.mutate(data)}
              onCancel={() => setShowCreate(false)}
            />
          )}

          {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
            <div className="space-y-2">
              {checklists?.map((cl: any) => (
                <button
                  key={cl.id}
                  onClick={() => { setSelectedId(cl.id); setEditingChecklist(false) }}
                  className={`w-full text-left p-3 border rounded ${selectedId === cl.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                >
                  <p className="text-sm font-medium text-slate-800">{cl.name}</p>
                  <p className="text-xs text-slate-500">{cl.category || '-'} | {cl.checked_items}/{cl.total_items}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!selectedId || !checklist ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-500">Select a checklist.</div>
          ) : editingChecklist ? (
            <ChecklistForm
              initial={{ name: checklist.name, category: checklist.category || '', items: [] }}
              onSubmit={data => updateMut.mutate({ id: selectedId, data: { name: data.name, category: data.category } })}
              onCancel={() => setEditingChecklist(false)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">{checklist.name}</h3>
                  <p className="text-sm text-slate-500">{checklist.category || '-'} | progress {progress}</p>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => setEditingChecklist(true)}>Edit</button>
                  <button
                    className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded"
                    onClick={() => { if (confirm('Delete this checklist?')) deleteMut.mutate(selectedId) }}
                  >Delete</button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-700">Items</h4>
                  <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowItemCreate(v => !v)}>+ Item</button>
                </div>

                {showItemCreate && (
                  <ItemForm
                    initial={{ ...EMPTY_ITEM, order: (checklist.items?.length ?? 0) + 1 }}
                    onSubmit={data => createItemMut.mutate({ checklistId: selectedId, data })}
                    onCancel={() => setShowItemCreate(false)}
                  />
                )}

                <div className="space-y-2">
                  {checklist.items?.map((item: any) => (
                    <div key={item.id} className="border rounded p-2">
                      {editingItemId === item.id ? (
                        <ItemForm
                          initial={item}
                          onSubmit={data => updateItemMut.mutate({ checklistId: selectedId, itemId: item.id, data })}
                          onCancel={() => setEditingItemId(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={e => updateItemMut.mutate({ checklistId: selectedId, itemId: item.id, data: { checked: e.target.checked } })}
                          />
                          <div className="flex-1">
                            <p className={`text-sm ${item.checked ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.order}. {item.name}</p>
                            <p className="text-xs text-slate-500">required: {item.required ? 'Y' : 'N'} | notes: {item.notes || '-'}</p>
                          </div>
                          <button className="text-xs px-2 py-0.5 bg-slate-100 rounded" onClick={() => setEditingItemId(item.id)}>Edit</button>
                          <button
                            className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded"
                            onClick={() => { if (confirm('Delete this item?')) deleteItemMut.mutate({ checklistId: selectedId, itemId: item.id }) }}
                          >Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!checklist.items?.length && <p className="text-sm text-slate-400">No items yet.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChecklistForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: ChecklistInput
  onSubmit: (data: ChecklistInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [category, setCategory] = useState(initial.category || '')

  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Checklist name" className="px-2 py-1 text-sm border rounded" />
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" className="px-2 py-1 text-sm border rounded" />
      </div>
      <div className="flex gap-2 mt-2">
        <button className="text-xs px-3 py-1 bg-blue-600 text-white rounded" onClick={() => name.trim() && onSubmit({ name: name.trim(), category: category.trim() || null, items: [] })}>Save</button>
        <button className="text-xs px-3 py-1 bg-white border rounded" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function ItemForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: ChecklistItemInput
  onSubmit: (data: ChecklistItemInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ChecklistItemInput>(initial)

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-slate-50 border border-slate-200 rounded p-2">
      <input type="number" value={form.order} onChange={e => setForm(prev => ({ ...prev, order: Number(e.target.value || 1) }))} className="px-2 py-1 text-sm border rounded" placeholder="Order" />
      <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} className="px-2 py-1 text-sm border rounded" placeholder="Item name" />
      <input value={form.notes || ''} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} className="px-2 py-1 text-sm border rounded" placeholder="Notes" />
      <label className="text-sm flex items-center gap-2 px-2 py-1 border rounded bg-white"><input type="checkbox" checked={!!form.required} onChange={e => setForm(prev => ({ ...prev, required: e.target.checked }))} /> Required</label>
      <div className="flex gap-2">
        <button className="text-xs px-3 py-1 bg-blue-600 text-white rounded" onClick={() => form.name.trim() && onSubmit({ ...form, name: form.name.trim(), notes: form.notes?.trim() || null })}>Save</button>
        <button className="text-xs px-3 py-1 bg-white border rounded" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
