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
          <h3 className="text-sm font-semibold text-[#0f1f3d]">{editing ? 'LP 수정' : 'LP 등록'}</h3>
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
        <div className="flex items-center justify-between gap-3">
          <h3 className="shrink-0 text-sm font-semibold text-[#0f1f3d]">LP 목록</h3>
          <div className="grid w-full max-w-[760px] min-w-0 grid-cols-[minmax(0,1fr)_160px_auto] items-center gap-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="이름/유형/사업자번호 검색"
              className="form-input-sm w-full"
            />
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="form-input-sm w-full"
            >
              <option value="">전체 유형</option>
              {Array.from(new Set(books.map((book) => book.type).filter(Boolean))).map((type) => (
                <option key={type} value={type}>
                  {LP_TYPE_LABEL[type] || type}
                </option>
              ))}
            </select>
            <label className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-md border border-[#d8e5fb] bg-[#f5f9ff] px-2 text-xs text-[#64748b]">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-3.5 w-3.5 accent-[#558ef8]"
              />
              비활성 포함
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-[#64748b]">불러오는 중...</p>
        ) : groupedLPs.length === 0 ? (
          <p className="text-sm text-[#64748b]">표시할 LP가 없습니다.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-[#d8e5fb]">
            <table className="min-w-[1100px] w-full table-fixed">
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead className="table-head-row sticky top-0 z-10 border-b border-[#d8e5fb] bg-[#f5f9ff]">
                <tr>
                  <th className="table-head-cell !text-center">LP</th>
                  <th className="table-head-cell !text-center">유형</th>
                  <th className="table-head-cell !text-center">연락처</th>
                  <th className="table-head-cell !text-center">사업자번호</th>
                  <th className="table-head-cell !text-center">조합 수</th>
                  <th className="table-head-cell !text-center">총 약정</th>
                  <th className="table-head-cell !text-center">상태</th>
                  <th className="table-head-cell !text-center">작업</th>
                </tr>
              </thead>

              {groupedLPs.map((lp) => {
                const expanded = expandedLPs.has(lp.name)
                const baseEntry = lp.entries[0]
                const fundCommitmentMap = new Map<string, { fundName: string; commitment: number }>()

                for (const entry of lp.entries) {
                  const relatedFunds = entry.related_funds?.length
                    ? entry.related_funds
                    : [{ fund_id: 0, fund_name: '공통' }]
                  const totalCommitment = Number(entry.total_commitment || 0)
                  const distributedCommitment =
                    relatedFunds.length > 0 ? totalCommitment / relatedFunds.length : totalCommitment

                  for (const fund of relatedFunds) {
                    const key = fund.fund_id > 0 ? `fund-${fund.fund_id}` : `name-${fund.fund_name || '공통'}`
                    const current = fundCommitmentMap.get(key)
                    fundCommitmentMap.set(key, {
                      fundName: fund.fund_name || '공통',
                      commitment: (current?.commitment || 0) + distributedCommitment,
                    })
                  }
                }

                const fundRows = Array.from(fundCommitmentMap.values()).sort((a, b) =>
                  a.fundName.localeCompare(b.fundName, 'ko'),
                )
                const totalCommitment = fundRows.reduce((sum, fund) => sum + fund.commitment, 0)

                return (
                  <tbody key={lp.name} className="group">
                    <tr className="align-top transition-colors hover:bg-[#f5f9ff]">
                      <td className="table-body-cell">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#0f1f3d]">{lp.name}</p>
                            <p className="truncate text-xs text-[#64748b]">{lp.address || '주소 미등록'}</p>
                          </div>
                          <button
                            onClick={() => toggleExpand(lp.name)}
                            className="icon-btn h-6 w-6 shrink-0"
                            aria-label={`${lp.name} 상세 보기`}
                          >
                            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </td>
                      <td className="table-body-cell text-center">{LP_TYPE_LABEL[lp.type] || lp.type}</td>
                      <td className="table-body-cell text-center">{lp.contact || '-'}</td>
                      <td className="table-body-cell text-center">{lp.business_number || '-'}</td>
                      <td className="table-body-cell text-center tabular-nums">{fundRows.length}</td>
                      <td className="table-body-cell text-right font-semibold text-[#0f1f3d]">
                        {formatAmount(totalCommitment)}
                      </td>
                      <td className="table-body-cell text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            baseEntry.is_active ? 'bg-[#f5f9ff] text-[#1a3660]' : 'bg-[#f1f1e6] text-[#64748b]'
                          }`}
                        >
                          {baseEntry.is_active ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td className="table-body-cell">
                        <div className="flex justify-center gap-1">
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
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="bg-[#f5f9ff]">
                        <td colSpan={8} className="px-3 pb-3 pt-1.5">
                          <div className="rounded-lg border border-[#d8e5fb] bg-white">
                            <div className="grid grid-cols-[minmax(0,1fr)_170px] border-b border-[#e4e7ee] bg-[#f7f9ff] px-3 py-1.5 text-[11px] font-semibold text-[#64748b]">
                              <span className="text-center">참여 조합</span>
                              <span className="text-center">약정 금액</span>
                            </div>
                            <div className="divide-y divide-[#e4e7ee]">
                              {fundRows.map((fund) => (
                                <div key={fund.fundName} className="grid grid-cols-[minmax(0,1fr)_170px] items-center px-3 py-2 text-xs">
                                  <span className="truncate font-medium text-[#0f1f3d]">{fund.fundName}</span>
                                  <span className="text-right tabular-nums text-[#64748b]">{formatAmount(fund.commitment)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                )
              })}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

