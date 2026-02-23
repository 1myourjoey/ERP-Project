import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createLPAddressBook,
  deactivateLPAddressBook,
  fetchLPAddressBooks,
  updateLPAddressBook,
  type LPAddressBook,
  type LPAddressBookInput,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'

const LP_TYPE_OPTIONS = ['institutional', 'individual', 'GP']
const LP_TYPE_LABEL: Record<string, string> = {
  institutional: '기관투자자',
  individual: '개인',
  GP: '법인',
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

export default function LPManagementPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<LPAddressBook | null>(null)
  const [form, setForm] = useState<LPAddressBookInput>(EMPTY_FORM)

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
      addToast('success', 'Address book entry created.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LPAddressBookInput> }) =>
      updateLPAddressBook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      setEditing(null)
      setForm(EMPTY_FORM)
      addToast('success', 'Address book entry updated.')
    },
  })

  const deactivateMut = useMutation({
    mutationFn: deactivateLPAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      addToast('success', 'Address book entry deactivated.')
    },
  })

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
      addToast('error', 'Name and type are required.')
      return
    }

    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload })
      return
    }
    createMut.mutate(payload)
  }

  const visibleBooks = books.filter((book) => {
    if (!typeFilter) return true
    return (book.type || '').toLowerCase() === typeFilter.toLowerCase()
  })

  const formatAmount = (value?: number) => `₩${Math.round(value || 0).toLocaleString('ko-KR')}`

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">LP 관리</h2>
          <p className="page-subtitle">유형별 LP 현황과 출자 진행률을 함께 관리합니다.</p>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            {editing ? 'Edit Address Book Entry' : 'Create Address Book Entry'}
          </h3>
          {editing ? (
            <button
              onClick={() => {
                setEditing(null)
                setForm(EMPTY_FORM)
              }}
              className="secondary-btn"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              {LP_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Business Number</label>
            <input
              value={form.business_number || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, business_number: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Contact</label>
            <input
              value={form.contact || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Address</label>
            <input
              value={form.address || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Memo</label>
            <input
              value={form.memo || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={submit} disabled={createMut.isPending || updateMut.isPending} className="primary-btn">
            {editing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Address Book Entries</h3>
          <div className="flex items-center gap-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="이름/유형/사업자번호 검색"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">전체 유형</option>
              {Array.from(new Set(books.map((book) => book.type).filter(Boolean))).map((type) => (
                <option key={type} value={type}>
                  {LP_TYPE_LABEL[type] || type}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Include inactive
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : !visibleBooks.length ? (
          <p className="text-sm text-gray-400">No entries found.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">이름</th>
                  <th className="px-2 py-2 text-left">유형</th>
                  <th className="px-2 py-2 text-left">사업자번호</th>
                  <th className="px-2 py-2 text-left">연락처</th>
                  <th className="px-2 py-2 text-right">약정액</th>
                  <th className="px-2 py-2 text-right">납입액</th>
                  <th className="px-2 py-2 text-left">납입 진행률</th>
                  <th className="px-2 py-2 text-right">출자 잔액</th>
                  <th className="px-2 py-2 text-left">연관 조합</th>
                  <th className="px-2 py-2 text-left">상태</th>
                  <th className="px-2 py-2 text-left">작업</th>
                </tr>
              </thead>
              <tbody>
                {visibleBooks.map((book) => (
                  <tr key={book.id} className="border-t">
                    <td className="px-2 py-2">{book.name}</td>
                    <td className="px-2 py-2">{LP_TYPE_LABEL[book.type] || book.type}</td>
                    <td className="px-2 py-2">{book.business_number || '-'}</td>
                    <td className="px-2 py-2">{book.contact || '-'}</td>
                    <td className="px-2 py-2 text-right">{formatAmount(book.total_commitment)}</td>
                    <td className="px-2 py-2 text-right">{formatAmount(book.total_paid_in)}</td>
                    <td className="px-2 py-2">
                      <div className="w-40">
                        <div className="h-2 rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${Math.max(0, Math.min(100, book.paid_in_ratio || 0))}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">{(book.paid_in_ratio || 0).toFixed(1)}%</p>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className={book.outstanding_balance && book.outstanding_balance > 0 ? 'font-semibold text-amber-700' : 'text-gray-700'}>
                        {formatAmount(book.outstanding_balance)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          {book.related_funds_count ?? 0} funds
                        </span>
                        {(book.related_funds || []).slice(0, 3).map((fund) => (
                          <span
                            key={`${book.id}-${fund.fund_id}`}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                          >
                            {fund.fund_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">{book.is_active ? 'active' : 'inactive'}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
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
                          }}
                          className="secondary-btn"
                        >
                          Edit
                        </button>
                        {book.is_active ? (
                          <button
                            onClick={() => deactivateMut.mutate(book.id)}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => updateMut.mutate({ id: book.id, data: { is_active: 1 } })}
                            className="rounded-lg border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
