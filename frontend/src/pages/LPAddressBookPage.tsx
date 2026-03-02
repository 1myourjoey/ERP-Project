import { useMemo, useState } from 'react'
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

export default function LPAddressBookPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [keyword, setKeyword] = useState('')
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

  const filteredBooks = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase()
    if (!keywordValue) return books
    return books.filter((book) => {
      const source = [
        book.name,
        book.type,
        book.business_number,
        book.contact,
        book.address,
      ]
        .join(' ')
        .toLowerCase()
      return source.includes(keywordValue)
    })
  }, [books, keyword])

  const createMut = useMutation({
    mutationFn: createLPAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      setForm(EMPTY_FORM)
      addToast('success', 'LP 주소록이 등록되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LPAddressBookInput> }) =>
      updateLPAddressBook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      setEditing(null)
      setForm(EMPTY_FORM)
      addToast('success', 'LP 주소록이 수정되었습니다.')
    },
  })

  const deactivateMut = useMutation({
    mutationFn: deactivateLPAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      addToast('success', 'LP 주소록이 비활성화되었습니다.')
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
          <h2 className="page-title">LP 주소록</h2>
          <p className="page-subtitle">LP 마스터 데이터(이름/유형/연락처)를 관리합니다.</p>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{editing ? '주소록 수정' : '주소록 등록'}</h3>
          {editing && (
            <button
              onClick={() => {
                setEditing(null)
                setForm(EMPTY_FORM)
              }}
              className="secondary-btn btn-sm"
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
            <label className="form-label">사업자등록번호/생년월일</label>
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
          <button
            onClick={submit}
            disabled={createMut.isPending || updateMut.isPending}
            className="primary-btn"
          >
            {editing ? '저장' : '등록'}
          </button>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-700">주소록 목록</h3>
          <div className="flex items-center gap-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="이름/유형/사업자번호 검색"
              className="form-input-sm w-72"
            />
            <label className="inline-flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              비활성 포함
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : filteredBooks.length === 0 ? (
          <p className="text-sm text-gray-400">등록된 주소록이 없습니다.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full">
              <thead className="table-head-row">
                <tr>
                  <th className="table-head-cell">이름</th>
                  <th className="table-head-cell">유형</th>
                  <th className="table-head-cell">사업자번호</th>
                  <th className="table-head-cell">연락처</th>
                  <th className="table-head-cell">주소</th>
                  <th className="table-head-cell">상태</th>
                  <th className="table-head-cell">액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-slate-50">
                    <td className="table-body-cell">{book.name}</td>
                    <td className="table-body-cell">{LP_TYPE_LABEL[book.type] || book.type}</td>
                    <td className="table-body-cell">{book.business_number || '-'}</td>
                    <td className="table-body-cell">{book.contact || '-'}</td>
                    <td className="table-body-cell">{book.address || '-'}</td>
                    <td className="table-body-cell">{book.is_active ? '활성' : '비활성'}</td>
                    <td className="table-body-cell">
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
                          className="secondary-btn btn-xs"
                        >
                          수정
                        </button>
                        {book.is_active ? (
                          <button
                            onClick={() => deactivateMut.mutate(book.id)}
                            className="danger-btn btn-xs"
                          >
                            비활성
                          </button>
                        ) : (
                          <button
                            onClick={() => updateMut.mutate({ id: book.id, data: { is_active: 1 } })}
                            className="secondary-btn btn-xs"
                          >
                            복구
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
