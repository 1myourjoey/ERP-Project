import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  createTask,
  fetchInvestments,
  fetchChecklists,
  fetchChecklist,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  type Checklist,
  type ChecklistItem,
  type ChecklistInput,
  type ChecklistItemInput,
  type ChecklistListItem,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import PageLoading from '../components/PageLoading'

const CHECKLIST_CATEGORY_OPTIONS = ['투자점검', '결성준비', '연말결산', '감사준비', '규약관리', '일반']

const EMPTY_CHECKLIST: ChecklistInput = {
  name: '',
  category: '',
  investment_id: null,
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
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingChecklist, setEditingChecklist] = useState(false)
  const [showItemCreate, setShowItemCreate] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: checklists, isLoading } = useQuery<ChecklistListItem[]>({
    queryKey: ['checklists'],
    queryFn: () => fetchChecklists(),
  })

  const { data: investments } = useQuery<{ id: number; company_name?: string }[]>({
    queryKey: ['investments'],
    queryFn: () => fetchInvestments() as Promise<{ id: number; company_name?: string }[]>,
  })

  const { data: checklist } = useQuery({
    queryKey: ['checklist', selectedId],
    queryFn: () => fetchChecklist(selectedId as number),
    enabled: !!selectedId,
  })

  const progress = useMemo(() => {
    const total = checklist?.items?.length ?? 0
    const done = checklist?.items?.filter((item: ChecklistItem) => item.checked).length ?? 0
    return `${done}/${total}`
  }, [checklist])

  const filteredChecklists = useMemo(() => {
    if (!checklists) return []
    if (!searchQuery.trim()) return checklists
    const q = searchQuery.trim().toLowerCase()
    return checklists.filter((row) => row.name.toLowerCase().includes(q))
  }, [checklists, searchQuery])

  useEffect(() => {
    if (!selectedId) return
    const element = document.getElementById(`checklist-${selectedId}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedId])

  const investmentOptions = (investments ?? []) as { id: number; company_name?: string }[]

  const createMut = useMutation({
    mutationFn: createChecklist,
    onSuccess: (created: Checklist) => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setSelectedId(created.id)
      setShowCreate(false)
      addToast('success', '체크리스트가 생성되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ChecklistInput> }) => updateChecklist(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      setEditingChecklist(false)
      addToast('success', '체크리스트가 수정되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteChecklist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setSelectedId(null)
      addToast('success', '체크리스트가 삭제되었습니다.')
    },
  })

  const createItemMut = useMutation({
    mutationFn: ({ checklistId, data }: { checklistId: number; data: ChecklistItemInput }) => createChecklistItem(checklistId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setShowItemCreate(false)
      addToast('success', '체크리스트 항목이 추가되었습니다.')
    },
  })

  const updateItemMut = useMutation({
    mutationFn: ({ checklistId, itemId, data }: { checklistId: number; itemId: number; data: Partial<ChecklistItemInput> }) => updateChecklistItem(checklistId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      setEditingItemId(null)
      addToast('success', '체크리스트 항목이 수정되었습니다.')
    },
  })

  const deleteItemMut = useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: number; itemId: number }) => deleteChecklistItem(checklistId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      addToast('success', '체크리스트 항목이 삭제되었습니다.')
    },
  })

  const handleAddTaskFromChecklist = async () => {
    if (!checklist) return

    const unchecked = checklist.items?.filter((item: ChecklistItem) => !item.checked) || []
    if (!unchecked.length) {
      addToast('info', '모든 항목이 완료되었습니다.')
      return
    }

    const body = unchecked.map((item: ChecklistItem) => `- ${item.name}`).join('\n')

    try {
      await createTask({
        title: `[체크리스트] ${checklist.name}`,
        category: checklist.category || '서류관리',
        memo: body,
        deadline: null,
        estimated_time: null,
        quadrant: 'Q1',
        fund_id: null,
        investment_id: checklist.investment_id || null,
      })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', '업무가 생성되었습니다.')
    } catch {
      addToast('error', '업무 생성에 실패했습니다.')
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">체크리스트</h2>
          <p className="page-subtitle">특정 시점의 점검 항목을 관리합니다. (예: 투자 전 점검, 연말 결산, 감사 준비)</p>
        </div>
        <button className="primary-btn" onClick={() => setShowCreate((v) => !v)}>
          + 체크리스트
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">체크리스트 목록</h3>
          </div>

          <div className="mb-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="체크리스트 검색..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {showCreate && (
            <ChecklistForm
              investments={investmentOptions}
              initial={EMPTY_CHECKLIST}
              onSubmit={(data) => createMut.mutate(data)}
              onCancel={() => setShowCreate(false)}
            />
          )}

          {isLoading ? (
            <PageLoading />
          ) : (
            <div className="space-y-2">
              {filteredChecklists.map((cl: ChecklistListItem) => (
                <button
                  id={`checklist-${cl.id}`}
                  key={cl.id}
                  onClick={() => {
                    setSelectedId(cl.id)
                    setEditingChecklist(false)
                  }}
                  className={`w-full rounded border p-3 text-left ${selectedId === cl.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                >
                  <p className="text-sm font-medium text-gray-800">{cl.name}</p>
                  <p className="text-xs text-gray-500">{cl.category || '-'} | 완료 {cl.checked_items}/{cl.total_items} | 투자 {cl.investment_id ? `#${cl.investment_id}` : '미연결'}</p>
                </button>
              ))}
              {!filteredChecklists.length && <p className="text-sm text-gray-400">검색 결과가 없습니다.</p>}
            </div>
          )}
        </div>

        <div>
          {!selectedId || !checklist ? (
            <div className="card-base text-sm text-gray-500">체크리스트를 선택하세요.</div>
          ) : editingChecklist ? (
            <ChecklistForm
              investments={investmentOptions}
              initial={{ name: checklist.name, category: checklist.category || '', investment_id: checklist.investment_id || null, items: [] }}
              onSubmit={(data) =>
                updateMut.mutate({
                  id: selectedId,
                  data: { name: data.name, category: data.category, investment_id: data.investment_id },
                })
              }
              onCancel={() => setEditingChecklist(false)}
            />
          ) : (
            <div className="card-base">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{checklist.name}</h3>
                  <p className="text-sm text-gray-500">{checklist.category || '-'} | 진행률 {progress} | 연결 투자 {checklist.investment_id ? `#${checklist.investment_id}` : '없음'}</p>
                </div>
                <div className="flex gap-2">
                  <button className="secondary-btn" onClick={handleAddTaskFromChecklist}>업무에 추가</button>
                  {checklist.investment_id && (
                    <button className="secondary-btn" onClick={() => navigate('/workflows')}>
                      워크플로우 →
                    </button>
                  )}
                  <button className="secondary-btn" onClick={() => setEditingChecklist(true)}>수정</button>
                  <button
                    className="danger-btn"
                    onClick={() => {
                      if (confirm('이 체크리스트를 삭제하시겠습니까?')) deleteMut.mutate(selectedId)
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">항목</h4>
                  <button className="primary-btn" onClick={() => setShowItemCreate((v) => !v)}>+ 항목</button>
                </div>

                {showItemCreate && (
                  <ItemForm
                    initial={{ ...EMPTY_ITEM, order: (checklist.items?.length ?? 0) + 1 }}
                    onSubmit={(data) => createItemMut.mutate({ checklistId: selectedId, data })}
                    onCancel={() => setShowItemCreate(false)}
                  />
                )}

                <div className="space-y-2">
                  {checklist.items?.map((item: ChecklistItem) => (
                    <div key={item.id} className="rounded border p-2">
                      {editingItemId === item.id ? (
                        <ItemForm
                          initial={item}
                          onSubmit={(data) => updateItemMut.mutate({ checklistId: selectedId, itemId: item.id, data })}
                          onCancel={() => setEditingItemId(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(event) =>
                              updateItemMut.mutate({ checklistId: selectedId, itemId: item.id, data: { checked: event.target.checked } })
                            }
                          />
                          <div className="flex-1">
                            <p className={`text-sm ${item.checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {item.order}. {item.name}
                            </p>
                            <p className="text-xs text-gray-500">필수: {item.required ? 'Y' : 'N'} | 비고: {item.notes || '-'}</p>
                          </div>
                          <button className="secondary-btn" onClick={() => setEditingItemId(item.id)}>수정</button>
                          <button
                            className="danger-btn"
                            onClick={() => {
                              if (confirm('이 항목을 삭제하시겠습니까?')) {
                                deleteItemMut.mutate({ checklistId: selectedId, itemId: item.id })
                              }
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!checklist.items?.length && <p className="text-sm text-gray-400">항목이 없습니다.</p>}
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
  investments,
  initial,
  onSubmit,
  onCancel,
}: {
  investments: { id: number; company_name?: string }[]
  initial: ChecklistInput
  onSubmit: (data: ChecklistInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [category, setCategory] = useState(initial.category || '')
  const [investmentId, setInvestmentId] = useState<number | ''>(initial.investment_id || '')
  const [customCategory, setCustomCategory] = useState(
    Boolean(initial.category && !CHECKLIST_CATEGORY_OPTIONS.includes(initial.category)),
  )

  return (
    <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="체크리스트 이름"
          className="px-2 py-1 text-sm border rounded"
        />

        {customCategory ? (
          <div className="flex gap-1">
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="카테고리 직접 입력"
              className="flex-1 px-2 py-1 text-sm border rounded"
            />
            <button
              onClick={() => {
                setCustomCategory(false)
                if (!CHECKLIST_CATEGORY_OPTIONS.includes(category)) setCategory('')
              }}
              className="px-2 text-xs text-gray-500 hover:text-gray-700"
            >
              목록
            </button>
          </div>
        ) : (
          <select
            value={category}
            onChange={(event) => {
              if (event.target.value === '__custom__') {
                setCustomCategory(true)
                setCategory('')
              } else {
                setCategory(event.target.value)
              }
            }}
            className="px-2 py-1 text-sm border rounded"
          >
            <option value="">카테고리 선택</option>
            {CHECKLIST_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
            <option value="__custom__">직접 입력</option>
          </select>
        )}

        <select
          value={investmentId}
          onChange={(event) => setInvestmentId(event.target.value ? Number(event.target.value) : '')}
          className="px-2 py-1 text-sm border rounded"
        >
          <option value="">투자 연결 없음</option>
          {investments.map((investment) => (
            <option key={investment.id} value={investment.id}>#{investment.id} {investment.company_name || '-'}</option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          className="primary-btn"
          onClick={() =>
            name.trim() &&
            onSubmit({
              name: name.trim(),
              category: category.trim() || null,
              investment_id: investmentId === '' ? null : investmentId,
              items: [],
            })
          }
        >
          저장
        </button>
        <button className="secondary-btn" onClick={onCancel}>취소</button>
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
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-gray-50 border border-gray-200 rounded p-2">
      <input type="number" value={form.order} onChange={e => setForm(prev => ({ ...prev, order: Number(e.target.value || 1) }))} className="px-2 py-1 text-sm border rounded" placeholder="순서" />
      <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} className="px-2 py-1 text-sm border rounded" placeholder="항목 이름" />
      <input value={form.notes || ''} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} className="px-2 py-1 text-sm border rounded" placeholder="비고" />
      <label className="text-sm flex items-center gap-2 px-2 py-1 border rounded bg-white"><input type="checkbox" checked={!!form.required} onChange={e => setForm(prev => ({ ...prev, required: e.target.checked }))} /> 필수</label>
      <div className="flex gap-2">
        <button className="primary-btn" onClick={() => form.name.trim() && onSubmit({ ...form, name: form.name.trim(), notes: form.notes?.trim() || null })}>저장</button>
        <button className="secondary-btn" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}





