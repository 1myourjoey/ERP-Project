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

const LP_TYPE_OPTIONS = ['기관투자자', '개인투자자', 'GP']

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

  const createMut = useMutation({
    mutationFn: createLPAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpAddressBooks'] })
      setForm(EMPTY_FORM)
      addToast('success', 'LP 주소록이 등록되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LPAddressBookInput> }) => updateLPAddressBook(id, data),
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
          <h2 className="page-title">📒 LP 주소록</h2>
          <p className="page-subtitle">조합 LP 입력 시 재사용할 마스터 데이터를 관리합니다.</p>
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
              className="secondary-btn"
            >
              수정 취소
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">이름</label>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">유형</label>
            <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm">
              {LP_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">사업자등록번호/생년월일</label>
            <input value={form.business_number || ''} onChange={(e) => setForm((prev) => ({ ...prev, business_number: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">연락처</label>
            <input value={form.contact || ''} onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">주소</label>
            <input value={form.address || ''} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">메모</label>
            <input value={form.memo || ''} onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={submit} disabled={createMut.isPending || updateMut.isPending} className="primary-btn">
            {editing ? '수정 저장' : '등록'}
          </button>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-700">주소록 목록</h3>
          <div className="flex items-center gap-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="이름/유형/사업자번호 검색"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <label className="inline-flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              비활성 포함
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : !books.length ? (
          <p className="text-sm text-gray-400">등록된 주소록이 없습니다.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">이름</th>
                  <th className="px-2 py-2 text-left">유형</th>
                  <th className="px-2 py-2 text-left">사업자번호</th>
                  <th className="px-2 py-2 text-left">연락처</th>
                  <th className="px-2 py-2 text-left">주소</th>
                  <th className="px-2 py-2 text-left">상태</th>
                  <th className="px-2 py-2 text-left">액션</th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => (
                  <tr key={book.id} className="border-t">
                    <td className="px-2 py-2">{book.name}</td>
                    <td className="px-2 py-2">{book.type}</td>
                    <td className="px-2 py-2">{book.business_number || '-'}</td>
                    <td className="px-2 py-2">{book.contact || '-'}</td>
                    <td className="px-2 py-2">{book.address || '-'}</td>
                    <td className="px-2 py-2">{book.is_active ? '활성' : '비활성'}</td>
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
                          수정
                        </button>
                        {book.is_active ? (
                          <button
                            onClick={() => deactivateMut.mutate(book.id)}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            비활성
                          </button>
                        ) : (
                          <button
                            onClick={() => updateMut.mutate({ id: book.id, data: { is_active: 1 } })}
                            className="rounded-lg border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50"
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
