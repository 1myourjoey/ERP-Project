import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  createWorkflowTemplate,
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
  type WorkflowTemplateInput,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { invalidateChecklistRelated, invalidateTaskRelated, invalidateWorkflowRelated } from '../lib/queryInvalidation'

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

export default function ChecklistsPage({
  embedded = false,
  embeddedVariant = 'default',
}: {
  embedded?: boolean
  embeddedVariant?: 'workflow' | 'default'
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const isWorkflowEmbedded = embedded && embeddedVariant === 'workflow'

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingChecklist, setEditingChecklist] = useState(false)
  const [showItemCreate, setShowItemCreate] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [convertedChecklistIds, setConvertedChecklistIds] = useState<Set<number>>(new Set())
  const [showGuide, setShowGuide] = useState(false)

  const buildWorkflowTemplateFromChecklist = (row: Checklist): WorkflowTemplateInput => {
    const steps = [...(row.items ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        order: index + 1,
        name: item.name,
        timing: 'D-day',
        timing_offset_days: 0,
        estimated_time: '',
        quadrant: 'Q2',
        memo: item.notes || '',
        is_notice: false,
        is_report: false,
        step_documents: [
          {
            name: item.name,
            required: item.required,
            timing: 'D-day',
            notes: item.notes || null,
            document_template_id: null,
            attachment_ids: [],
          },
        ],
      }))

    return {
      name: `${row.name} (체크리스트 변환)`,
      trigger_description: '레거시 체크리스트 변환 템플릿',
      category: row.category || '체크리스트',
      total_duration: '',
      steps: steps.length > 0 ? steps : [{
        order: 1,
        name: '기본 단계',
        timing: 'D-day',
        timing_offset_days: 0,
        estimated_time: '',
        quadrant: 'Q2',
        memo: '',
        is_notice: false,
        is_report: false,
        step_documents: [
          {
            name: '기본 체크 항목',
            required: true,
            timing: 'D-day',
            notes: null,
            document_template_id: null,
            attachment_ids: [],
          },
        ],
      }],
      documents: [],
      warnings: [],
    }
  }

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
      invalidateChecklistRelated(queryClient)
      setSelectedId(created.id)
      setShowCreate(false)
      addToast('success', '체크리스트가 생성되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ChecklistInput> }) => updateChecklist(id, data),
    onSuccess: () => {
      invalidateChecklistRelated(queryClient)
      setEditingChecklist(false)
      addToast('success', '체크리스트가 수정되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteChecklist,
    onSuccess: () => {
      invalidateChecklistRelated(queryClient)
      setSelectedId(null)
      addToast('success', '체크리스트가 삭제되었습니다.')
    },
  })

  const createItemMut = useMutation({
    mutationFn: ({ checklistId, data }: { checklistId: number; data: ChecklistItemInput }) => createChecklistItem(checklistId, data),
    onSuccess: () => {
      invalidateChecklistRelated(queryClient)
      setShowItemCreate(false)
      addToast('success', '체크리스트 항목이 추가되었습니다.')
    },
  })

  const updateItemMut = useMutation({
    mutationFn: ({ checklistId, itemId, data }: { checklistId: number; itemId: number; data: Partial<ChecklistItemInput> }) => updateChecklistItem(checklistId, itemId, data),
    onSuccess: () => {
      invalidateChecklistRelated(queryClient)
      setEditingItemId(null)
      addToast('success', '체크리스트 항목이 수정되었습니다.')
    },
  })

  const deleteItemMut = useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: number; itemId: number }) => deleteChecklistItem(checklistId, itemId),
    onSuccess: () => {
      invalidateChecklistRelated(queryClient)
      addToast('success', '체크리스트 항목이 삭제되었습니다.')
    },
  })

  const convertToWorkflowMut = useMutation({
    mutationFn: (row: Checklist) => createWorkflowTemplate(buildWorkflowTemplateFromChecklist(row)),
    onSuccess: (createdTemplate, sourceChecklist) => {
      invalidateWorkflowRelated(queryClient)
      setConvertedChecklistIds((prev) => {
        const next = new Set(prev)
        next.add(sourceChecklist.id)
        return next
      })
      addToast('success', `워크플로 템플릿으로 변환되었습니다: ${createdTemplate.name}`)
      navigate('/workflows?tab=templates')
    },
  })

  const handleConvertChecklist = (row: Checklist | null | undefined) => {
    if (!row) {
      addToast('info', '변환할 체크리스트를 선택하세요.')
      return
    }
    if ((row.items ?? []).length === 0) {
      addToast('error', '항목이 없는 체크리스트는 변환할 수 없습니다.')
      return
    }
    if (!confirm('이 체크리스트를 워크플로 템플릿으로 변환하시겠습니까?')) return
    convertToWorkflowMut.mutate(row)
  }

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
      invalidateTaskRelated(queryClient)
      addToast('success', '업무가 생성되었습니다.')
    } catch {
      addToast('error', '업무 생성에 실패했습니다.')
    }
  }

  return (
    <div className={embedded ? 'space-y-3' : 'page-container'}>
      {!embedded ? (
        <div className="page-header">
          <div>
            <h2 className="page-title">체크리스트</h2>
            <p className="page-subtitle">특정 시점의 점검 항목을 관리합니다. (예: 투자 전 점검, 연말 결산, 감사 준비)</p>
          </div>
          <button className="primary-btn" onClick={() => setShowCreate((v) => !v)}>
            + 체크리스트
          </button>
        </div>
      ) : isWorkflowEmbedded ? (
        <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[#0f1f3d]">체크리스트 유틸리티</h3>
                <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
                  레거시 전환
                </span>
              </div>
              <p className="mt-1 text-sm text-[#64748b]">기존 점검표를 빠르게 확인하고 필요한 항목만 업무 또는 워크플로우로 전환합니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="secondary-btn"
                onClick={() => handleConvertChecklist(checklist)}
                disabled={convertToWorkflowMut.isPending || !checklist}
              >
                {convertToWorkflowMut.isPending ? '변환 중...' : '워크플로로 변환'}
              </button>
              <button className="primary-btn" onClick={() => setShowCreate((v) => !v)}>
                + 체크리스트
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#0f1f3d]">체크리스트(레거시)</h3>
          <button className="primary-btn" onClick={() => setShowCreate((v) => !v)}>
            + 체크리스트
          </button>
        </div>
      )}

      <div className={`rounded-xl border px-4 py-3 ${isWorkflowEmbedded ? 'border-[#d8e5fb] bg-[#f5f9ff]' : 'border-amber-200 bg-amber-50'}`}>
        <p className={`text-sm font-semibold ${isWorkflowEmbedded ? 'text-[#0f1f3d]' : 'text-amber-900'}`}>체크리스트 기능이 워크플로와 통합됩니다.</p>
        <p className={`mt-1 text-xs ${isWorkflowEmbedded ? 'text-[#64748b]' : 'text-amber-800'}`}>
          기존 체크리스트 항목을 워크플로 템플릿으로 변환해 단계형 업무 흐름으로 이어서 관리할 수 있습니다.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className="secondary-btn"
            onClick={() => handleConvertChecklist(checklist)}
            disabled={convertToWorkflowMut.isPending || !checklist}
          >
            {convertToWorkflowMut.isPending ? '변환 중...' : '워크플로로 변환'}
          </button>
          <button
            className="secondary-btn"
            onClick={() => setShowGuide((prev) => !prev)}
          >
            {showGuide ? '가이드 닫기' : '자세히 보기'}
          </button>
        </div>
        {showGuide && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3">
            <p className="text-sm font-medium text-amber-900">체크리스트 통합 가이드</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              변환 시 각 항목이 워크플로 단계와 단계 서류(`step_documents`)로 함께 생성됩니다.
              생성 후에는 워크플로 페이지에서 단계별 체크, 마감일, 리마인더를 통합 관리할 수 있습니다.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="secondary-btn" onClick={() => navigate('/workflows?tab=templates')}>
                템플릿 목록 열기
              </button>
              <button className="secondary-btn" onClick={() => handleConvertChecklist(checklist)}>
                현재 체크리스트 변환
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-6 ${isWorkflowEmbedded ? 'xl:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]' : 'lg:grid-cols-2'}`}>
        <div className={isWorkflowEmbedded ? 'space-y-3' : ''}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0f1f3d]">체크리스트 목록</h3>
            {isWorkflowEmbedded && (
              <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
                {filteredChecklists.length}건
              </span>
            )}
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[#64748b]">체크리스트 검색</label>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="이름/카테고리로 검색"
              className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
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
            <div className="space-y-1.5">
              {filteredChecklists.map((cl: ChecklistListItem) => (
                <button
                  id={`checklist-${cl.id}`}
                  key={cl.id}
                  onClick={() => {
                    setSelectedId(cl.id)
                    setEditingChecklist(false)
                  }}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${selectedId === cl.id ? 'border-[#b2cbfb] bg-[#f5f9ff]' : 'border-[#d8e5fb] bg-white hover:bg-[#f5f9ff]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0f1f3d]">
                        {cl.name}
                        {convertedChecklistIds.has(cl.id) && (
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            워크플로 변환됨
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-[#64748b]">{cl.category || '-'} · 완료 {cl.checked_items}/{cl.total_items} · 투자 {cl.investment_id ? `#${cl.investment_id}` : '미연결'}</p>
                    </div>
                    {isWorkflowEmbedded && (
                      <span className="rounded-full border border-[#d8e5fb] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
                        {cl.total_items ? Math.round((cl.checked_items / cl.total_items) * 100) : 0}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {!filteredChecklists.length && <EmptyState message="체크리스트가 없습니다." className="py-8" />}
            </div>
          )}
        </div>

        <div>
          {!selectedId || !checklist ? (
            <div className="card-base text-sm text-[#64748b]">체크리스트를 선택하세요.</div>
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
            <div className={`card-base ${isWorkflowEmbedded ? 'space-y-4' : ''}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                  <h3 className="text-lg font-semibold text-[#0f1f3d]">
                    {checklist.name}
                    {convertedChecklistIds.has(checklist.id) && (
                      <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        워크플로 변환됨
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-[#64748b]">{checklist.category || '-'} | 진행률 {progress} | 연결 투자 {checklist.investment_id ? `#${checklist.investment_id}` : '없음'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="secondary-btn" onClick={handleAddTaskFromChecklist}>업무에 추가</button>
                  <button
                    className="secondary-btn"
                    onClick={() => handleConvertChecklist(checklist)}
                    disabled={convertToWorkflowMut.isPending}
                  >
                    {convertToWorkflowMut.isPending ? '변환 중...' : '워크플로로 변환'}
                  </button>
                  <details className="relative">
                    <summary className="secondary-btn cursor-pointer list-none">더보기</summary>
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-[#d8e5fb] bg-white p-1 shadow-lg">
                      <button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-[#f5f9ff]" onClick={() => navigate('/workflows?tab=templates')}>
                        워크플로우 이동
                      </button>
                      <button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-[#f5f9ff]" onClick={() => setEditingChecklist(true)}>
                        수정
                      </button>
                      <button
                        className="w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (confirm('이 체크리스트를 삭제하시겠습니까?')) deleteMut.mutate(selectedId)
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </details>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#0f1f3d]">항목</h4>
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
                    <div key={item.id} className={`rounded-xl border p-2.5 ${isWorkflowEmbedded ? 'border-[#d8e5fb] bg-[#fbfcff]' : ''}`}>
                      {editingItemId === item.id ? (
                        <ItemForm
                          initial={item}
                          onSubmit={(data) => updateItemMut.mutate({ checklistId: selectedId, itemId: item.id, data })}
                          onCancel={() => setEditingItemId(null)}
                        />
                      ) : (
                        <div className={`grid gap-3 ${isWorkflowEmbedded ? 'md:grid-cols-[76px_minmax(0,1fr)_auto]' : 'md:grid-cols-[76px_minmax(0,1fr)_auto_auto]'} md:items-center`}>
                          <div className="flex flex-col items-center">
                            <label className="mb-1 block text-[10px] font-medium text-[#64748b]">완료</label>
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(event) =>
                                updateItemMut.mutate({ checklistId: selectedId, itemId: item.id, data: { checked: event.target.checked } })
                              }
                            />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm ${item.checked ? 'line-through text-[#64748b]' : 'text-[#0f1f3d]'}`}>
                              {item.order}. {item.name}
                            </p>
                            <p className="text-xs text-[#64748b]">필수: {item.required ? 'Y' : 'N'} | 비고: {item.notes || '-'}</p>
                          </div>
                          <div className="flex items-center gap-2 md:justify-end">
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
                        </div>
                      )}
                    </div>
                  ))}
              {!checklist.items?.length && <EmptyState message="항목이 없습니다." className="py-8" />}
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
    <div className="mb-3 rounded border border-[#d8e5fb] bg-[#f5f9ff] p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">체크리스트 이름</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 투자 심사 체크리스트"
            className="form-input"
          />
        </div>

        {customCategory ? (
          <div className="flex gap-1">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[#64748b]">카테고리</label>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="직접 입력"
                className="form-input"
              />
            </div>
            <button
              onClick={() => {
                setCustomCategory(false)
                if (!CHECKLIST_CATEGORY_OPTIONS.includes(category)) setCategory('')
              }}
              className="px-2 text-xs text-[#64748b] hover:text-[#0f1f3d]"
            >
              목록
            </button>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">카테고리</label>
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
              className="form-input"
            >
              <option value="">카테고리 선택</option>
              {CHECKLIST_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value="__custom__">직접 입력</option>
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">연결 투자건</label>
          <select
            value={investmentId}
            onChange={(event) => setInvestmentId(event.target.value ? Number(event.target.value) : '')}
            className="form-input"
          >
            <option value="">투자 연결 없음</option>
            {investments.map((investment) => (
              <option key={investment.id} value={investment.id}>#{investment.id} {investment.company_name || '-'}</option>
            ))}
          </select>
        </div>
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
    <div className="rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">항목 이름</label>
          <input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="form-input"
            placeholder="예: 실사 보고서 확인"
          />
        </div>
        <div className="grid grid-cols-[120px_1fr] items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">순서</label>
            <input
              type="number"
              value={form.order}
              onChange={e => setForm(prev => ({ ...prev, order: Number(e.target.value || 1) }))}
              className="form-input"
              placeholder="숫자"
            />
          </div>
          <label className="inline-flex h-9 items-center gap-2 rounded border bg-white px-3 text-sm">
            <input
              type="checkbox"
              checked={!!form.required}
              onChange={e => setForm(prev => ({ ...prev, required: e.target.checked }))}
            />
            필수
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-[#64748b]">비고</label>
          <input
            value={form.notes || ''}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            className="form-input"
            placeholder="선택 입력"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="primary-btn" onClick={() => form.name.trim() && onSubmit({ ...form, name: form.name.trim(), notes: form.notes?.trim() || null })}>
          저장
        </button>
        <button className="secondary-btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}







