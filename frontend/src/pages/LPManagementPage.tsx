import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'

import {
  createLPAddressBook,
  deactivateLPAddressBook,
  fetchLPAddressBooks,
  updateLPAddressBook,
  type LPAddressBook,
  type LPAddressBookInput,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'

const LP_TYPE_OPTIONS = ['institutional', 'individual', 'GP'] as const
const LP_TYPE_LABEL: Record<string, string> = {
  institutional: '기관투자자',
  individual: '개인투자자',
  GP: 'GP',
  corporate: '법인',
  government: '정부기관',
}

const EMPTY_FORM: LPAddressBookInput = {
  name: '',
  type: LP_TYPE_OPTIONS[0],
  business_number: '',
  contact: '',
  address: '',
  memo: '',
  gp_entity_id: null,
  is_active: 1,
}

type GroupedLP = {
  name: string
  type: string
  business_number: string | null
  contact: string | null
  address: string | null
  memo: string | null
  entries: LPAddressBook[]
}

function formatAmount(value?: number | null): string {
  return `₩${Math.round(value || 0).toLocaleString('ko-KR')}`
}

export default function LPManagementPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<LPAddressBook | null>(null)
  const [form, setForm] = useState<LPAddressBookInput>(EMPTY_FORM)
  const [expandedLPs, setExpandedLPs] = useState<Set<string>>(new Set())

  const { data: books = [], isLoading } = useQuery<LPAddressBook[]>({
    queryKey: ['lpAddressBooks', { q: keyword.trim(), showInactive }],
    queryFn: () =>
      fetchLPAddressBooks({
        q: keyword.trim() || undefined,
        is_active: showInactive ? undefined : 1,
      }),
  })

  const createMut = useMutation({
    mutationFn: createLPAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      setForm(EMPTY_FORM)
      addToast('success', 'LP가 등록되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LPAddressBookInput> }) =>
      updateLPAddressBook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      setEditing(null)
      setForm(EMPTY_FORM)
      addToast('success', 'LP가 수정되었습니다.')
    },
  })

  const deactivateMut = useMutation({
    mutationFn: deactivateLPAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      addToast('success', 'LP를 비활성화했습니다.')
    },
  })

  const visibleBooks = useMemo(() => {
    return books.filter((book) => {
      if (!typeFilter) return true
      return (book.type || '').toLowerCase() === typeFilter.toLowerCase()
    })
  }, [books, typeFilter])

  const groupedLPs = useMemo<GroupedLP[]>(() => {
    const map = new Map<string, LPAddressBook[]>()
    for (const book of visibleBooks) {
      const key = (book.name || '').trim()
      const list = map.get(key) ?? []
      list.push(book)
      map.set(key, list)
    }

    return Array.from(map.entries())
      .map(([name, entries]) => ({
        name,
        type: entries[0].type,
        business_number: entries[0].business_number,
        contact: entries[0].contact,
        address: entries[0].address,
        memo: entries[0].memo,
        entries,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [visibleBooks])

  const toggleExpand = (name: string) => {
    setExpandedLPs((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const startEdit = (book: LPAddressBook) => {
    setEditing(book)
    setForm({
      name: book.name,
      type: book.type,
      business_number: book.business_number || '',
      contact: book.contact || '',
      address: book.address || '',
      memo: book.memo || '',
      gp_entity_id: book.gp_entity_id ?? null,
      is_active: book.is_active,
    })
  }

  const submit = () => {
    const payload: LPAddressBookInput = {
      ...form,
      name: (form.name || '').trim(),
      type: (form.type || '').trim(),
      business_number: form.business_number?.trim() || null,
      contact: form.contact?.trim() || null,
      address: form.address?.trim() || null,
      memo: form.memo?.trim() || null,
      gp_entity_id: form.gp_entity_id ?? null,
      is_active: form.is_active ?? 1,
    }

    if (!payload.name || !payload.type) {
      addToast('error', '이름과 유형은 필수입니다.')
      return
    }

    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload })
      return
    }
    createMut.mutate(payload)
  }

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">LP 관리</h2>
          <p className="page-subtitle">LP별 참여 조합과 기본 정보를 함께 관리합니다.</p>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{editing ? 'LP 수정' : 'LP 등록'}</h3>
          {editing && (
            <button
              onClick={() => {
                setEditing(null)
                setForm(EMPTY_FORM)
              }}
              className="secondary-btn"
            >
              수정 취소
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className="form-label">이름</label>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">유형</label>
            <select
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              className="form-input"
            >
              {!LP_TYPE_OPTIONS.includes(form.type as (typeof LP_TYPE_OPTIONS)[number]) && (
                <option value={form.type}>{LP_TYPE_LABEL[form.type] || form.type}</option>
              )}
              {LP_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {LP_TYPE_LABEL[type] || type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">사업자번호/생년월일</label>
            <input
              value={form.business_number || ''}
              onChange={(event) => setForm((prev) => ({ ...prev, business_number: event.target.value }))}
              className="form-input"
            />
          </div>
          <div>
            <input
              value={form.contact || ''}
              onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
              placeholder="연락처"
              className="form-input"
            />
          </div>
          <div className="md:col-span-2">
            <input
              value={form.address || ''}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="주소"
              className="form-input"
            />
          </div>
          <div className="md:col-span-3">
            <input
              value={form.memo || ''}
              onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              placeholder="메모 (선택)"
              className="form-input"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={submit} disabled={createMut.isPending || updateMut.isPending} className="primary-btn">
            {editing ? '저장' : '등록'}
          </button>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-700">LP 목록</h3>
          <div className="flex gap-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="이름/유형/사업자번호 검색"
              className="form-input-sm w-64"
            />
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="form-input-sm"
            >
              <option value="">전체 유형</option>
              {Array.from(new Set(books.map((book) => book.type).filter(Boolean))).map((type) => (
                <option key={type} value={type}>
                  {LP_TYPE_LABEL[type] || type}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              비활성 포함
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : groupedLPs.length === 0 ? (
          <p className="text-sm text-gray-400">표시할 LP가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {groupedLPs.map((lp) => {
              const expanded = expandedLPs.has(lp.name)
              const baseEntry = lp.entries[0]

              return (
                <div key={lp.name} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{lp.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {LP_TYPE_LABEL[lp.type] || lp.type} · {lp.contact || '-'}
                        {lp.business_number ? ` · ${lp.business_number}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tag tag-gray">{lp.entries.length}개 조합</span>
                      <button onClick={() => toggleExpand(lp.name)} className="icon-btn">
                        <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-100 px-4 pb-3 pt-2">
                      <div className="space-y-1.5">
                        {lp.entries.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                            <span className="font-medium text-slate-700">
                              {(entry.related_funds || [])[0]?.fund_name || '공통'}
                            </span>
                            <span className="text-slate-500">약정 {formatAmount(entry.total_commitment)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => startEdit(baseEntry)} className="secondary-btn btn-xs">
                          수정
                        </button>
                        {baseEntry.is_active ? (
                          <button onClick={() => deactivateMut.mutate(baseEntry.id)} className="danger-btn btn-xs">
                            비활성화
                          </button>
                        ) : (
                          <button
                            onClick={() => updateMut.mutate({ id: baseEntry.id, data: { is_active: 1 } })}
                            className="secondary-btn btn-xs"
                          >
                            복원
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
