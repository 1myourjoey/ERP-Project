import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createUser,
  deactivateUser,
  fetchUsers,
  updateUser,
  type UserCreateInput,
  type UserResponse,
  type UserUpdateInput,
} from '../lib/api'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'

const ROLE_OPTIONS = ['admin', 'manager', 'reviewer', 'viewer']

function toDateLabel(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR')
}

const EMPTY_CREATE: UserCreateInput = {
  email: '',
  name: '',
  role: 'viewer',
  department: '',
  is_active: true,
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeOnly, setActiveOnly] = useState(false)
  const [createForm, setCreateForm] = useState<UserCreateInput>(EMPTY_CREATE)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<UserUpdateInput | null>(null)

  const { data: users = [], isLoading } = useQuery<UserResponse[]>({
    queryKey: ['users', activeOnly],
    queryFn: () => fetchUsers(activeOnly),
  })

  const sortedUsers = useMemo(() => [...users].sort((a, b) => b.id - a.id), [users])

  const createMut = useMutation({
    mutationFn: (payload: UserCreateInput) => createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setCreateForm(EMPTY_CREATE)
      addToast('success', '사용자를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdateInput }) => updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingId(null)
      setEditForm(null)
      addToast('success', '사용자 정보를 수정했습니다.')
    },
  })

  const deactivateMut = useMutation({
    mutationFn: (id: number) => deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      addToast('success', '사용자를 비활성화했습니다.')
    },
  })

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">사용자 관리</h2>
          <p className="page-subtitle">역할과 활성 상태를 관리합니다. (인증/권한 미들웨어는 후속 단계)</p>
        </div>
      </div>

      <div className="card-base">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="inline-flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700">
            <input
              id="active-only"
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="active-only">활성 사용자만 보기</label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            value={createForm.name}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
            placeholder="이름"
          />
          <input
            value={createForm.email}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
            placeholder="이메일"
          />
          <select
            value={createForm.role || 'viewer'}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <input
            value={createForm.department || ''}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, department: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
            placeholder="부서"
          />
          <button
            onClick={() => createMut.mutate(createForm)}
            disabled={!createForm.email.trim() || !createForm.name.trim() || createMut.isPending}
            className="primary-btn"
          >
            사용자 추가
          </button>
        </div>
      </div>

      <div className="card-base">
        {isLoading ? (
          <PageLoading />
        ) : sortedUsers.length === 0 ? (
          <EmptyState emoji="👤" message="등록된 사용자가 없습니다." className="py-8" />
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">이름</th>
                  <th className="px-3 py-2 text-left">이메일</th>
                  <th className="px-3 py-2 text-left">역할</th>
                  <th className="px-3 py-2 text-left">부서</th>
                  <th className="px-3 py-2 text-left">상태</th>
                  <th className="px-3 py-2 text-left">마지막 로그인</th>
                  <th className="px-3 py-2 text-right">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedUsers.map((row) => {
                  const editing = editingId === row.id
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editForm?.name ?? row.name}
                            onChange={(e) => setEditForm((prev) => ({ ...(prev || {}), name: e.target.value }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                          />
                        ) : row.name}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editForm?.email ?? row.email}
                            onChange={(e) => setEditForm((prev) => ({ ...(prev || {}), email: e.target.value }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                          />
                        ) : row.email}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <select
                            value={editForm?.role ?? row.role}
                            onChange={(e) => setEditForm((prev) => ({ ...(prev || {}), role: e.target.value }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        ) : row.role}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editForm?.department ?? row.department ?? ''}
                            onChange={(e) => setEditForm((prev) => ({ ...(prev || {}), department: e.target.value }))}
                            className="w-full rounded border px-2 py-1 text-sm"
                          />
                        ) : (row.department || '-')}
                      </td>
                      <td className="px-3 py-2">{row.is_active ? '활성' : '비활성'}</td>
                      <td className="px-3 py-2">{toDateLabel(row.last_login_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {editing ? (
                            <>
                              <button
                                onClick={() => updateMut.mutate({ id: row.id, payload: editForm || {} })}
                                className="primary-btn"
                                disabled={updateMut.isPending}
                              >
                                저장
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null)
                                  setEditForm(null)
                                }}
                                className="secondary-btn"
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(row.id)
                                setEditForm({
                                  name: row.name,
                                  email: row.email,
                                  role: row.role,
                                  department: row.department,
                                  is_active: row.is_active,
                                })
                              }}
                              className="secondary-btn"
                            >
                              수정
                            </button>
                          )}
                          <button
                            onClick={() => deactivateMut.mutate(row.id)}
                            disabled={!row.is_active || deactivateMut.isPending}
                            className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            비활성화
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

