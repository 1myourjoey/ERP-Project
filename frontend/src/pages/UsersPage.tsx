import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  adminResetUserPassword,
  approveUser,
  cancelInvitation,
  createInvitation,
  createUser,
  deactivateUser,
  fetchInvitations,
  fetchPendingUsers,
  fetchUsers,
  generateUserResetToken,
  rejectUser,
  updateUser,
  type InvitationCreateInput,
  type InvitationResponse,
  type UserCreateInput,
  type UserResponse,
  type UserRole,
  type UserUpdateInput,
} from '../lib/api'
import { labelRole, labelStatus } from '../lib/labels'

const ROLE_OPTIONS: UserRole[] = ['master', 'admin', 'manager', 'viewer']
const ROUTE_KEYS = [
  '/tasks',
  '/worklogs',
  '/fund-overview',
  '/funds',
  '/investments',
  '/investment-reviews',
  '/workflows',
  '/exits',
  '/transactions',
  '/valuations',
  '/accounting',
  '/provisional-fs',
  '/fee-management',
  '/lp-management',
  '/proposal-data',
  '/users',
  '/compliance',
  '/biz-reports',
  '/vics',
  '/internal-reviews',
  '/reports',
  '/fund-operations',
  '/documents',
  '/data-studio',
  '/templates',
]

type TabKey = 'active' | 'pending' | 'invites'

type UserFormState = {
  username: string
  name: string
  email: string
  password: string
  role: UserRole
  department: string
  is_active: boolean
  allowed_routes: string[]
}

type InviteFormState = {
  name: string
  email: string
  role: UserRole
  department: string
  expires_in_days: number
  allowed_routes: string[]
}

const EMPTY_USER_FORM: UserFormState = {
  username: '',
  name: '',
  email: '',
  password: '',
  role: 'viewer',
  department: '',
  is_active: true,
  allowed_routes: [],
}

const EMPTY_INVITE_FORM: InviteFormState = {
  name: '',
  email: '',
  role: 'viewer',
  department: '',
  expires_in_days: 7,
  allowed_routes: [],
}

function toDateLabel(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR')
}

function displayEmail(value: string | null | undefined): string {
  if (!value) return '-'
  if (value.endsWith('@local.invalid')) return '-'
  return value
}

function normalizeRoutes(role: UserRole, routes: string[]): string[] | null {
  if (role === 'master' || role === 'admin') return null
  return routes.filter((route, index) => ROUTE_KEYS.includes(route) && routes.indexOf(route) === index)
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const { isMaster } = useAuth()

  const [tab, setTab] = useState<TabKey>('active')
  const [openMode, setOpenMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM)

  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteFormState>(EMPTY_INVITE_FORM)

  const { data: users = [], isLoading: usersLoading } = useQuery<UserResponse[]>({
    queryKey: ['users'],
    queryFn: () => fetchUsers(false),
  })
  const { data: pendingUsers = [], isLoading: pendingLoading } = useQuery<UserResponse[]>({
    queryKey: ['users', 'pending'],
    queryFn: fetchPendingUsers,
  })
  const { data: invitations = [], isLoading: inviteLoading } = useQuery<InvitationResponse[]>({
    queryKey: ['users', 'invitations'],
    queryFn: fetchInvitations,
  })

  const activeUsers = useMemo(() => users.filter((row) => row.is_active), [users])
  const resetRequests = useMemo(() => users.filter((row) => row.password_reset_requested_at), [users])

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const createMut = useMutation({
    mutationFn: (payload: UserCreateInput) => createUser(payload),
    onSuccess: () => {
      invalidateAll()
      addToast('success', '사용자를 등록했습니다.')
      setOpenMode(null)
      setForm(EMPTY_USER_FORM)
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdateInput }) => updateUser(id, payload),
    onSuccess: () => {
      invalidateAll()
      addToast('success', '사용자 정보를 수정했습니다.')
      setOpenMode(null)
      setEditingId(null)
      setForm(EMPTY_USER_FORM)
    },
  })
  const deactivateMut = useMutation({
    mutationFn: (id: number) => deactivateUser(id),
    onSuccess: () => {
      invalidateAll()
      addToast('success', '사용자를 비활성화했습니다.')
    },
  })
  const approveMut = useMutation({
    mutationFn: (id: number) => approveUser(id),
    onSuccess: () => {
      invalidateAll()
      addToast('success', '사용자를 승인했습니다.')
    },
  })
  const rejectMut = useMutation({
    mutationFn: (id: number) => rejectUser(id),
    onSuccess: () => {
      invalidateAll()
      addToast('success', '가입 요청을 거절했습니다.')
    },
  })
  const adminResetMut = useMutation({
    mutationFn: ({ id, new_password }: { id: number; new_password: string }) => adminResetUserPassword(id, { new_password }),
    onSuccess: () => {
      invalidateAll()
      addToast('success', '임시 비밀번호를 적용했습니다.')
    },
  })
  const generateTokenMut = useMutation({
    mutationFn: (id: number) => generateUserResetToken(id),
    onSuccess: async (payload) => {
      const fullUrl = `${window.location.origin}${payload.reset_url}`
      try {
        await navigator.clipboard.writeText(fullUrl)
        addToast('success', '재설정 링크를 복사했습니다.')
      } catch {
        prompt('아래 링크를 복사하세요.', fullUrl)
      }
    },
  })
  const createInviteMut = useMutation({
    mutationFn: (payload: InvitationCreateInput) => createInvitation(payload),
    onSuccess: async (payload) => {
      invalidateAll()
      setInviteModalOpen(false)
      setInviteForm(EMPTY_INVITE_FORM)
      const fullUrl = `${window.location.origin}${payload.invite_url}`
      try {
        await navigator.clipboard.writeText(fullUrl)
        addToast('success', '초대 링크를 생성하고 복사했습니다.')
      } catch {
        prompt('아래 링크를 복사하세요.', fullUrl)
      }
    },
  })
  const cancelInviteMut = useMutation({
    mutationFn: (id: number) => cancelInvitation(id),
    onSuccess: () => {
      invalidateAll()
      addToast('success', '초대를 취소했습니다.')
    },
  })

  if (!isMaster) {
    return (
      <div className="page-container">
        <EmptyState message="마스터 관리자만 접근할 수 있습니다." className="py-12" />
      </div>
    )
  }

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="사용자 관리"
        subtitle="가입 승인, 초대, 권한, 비밀번호 재설정을 같은 작업 문법으로 처리합니다."
        actions={
          <>
            <button onClick={() => { setForm(EMPTY_USER_FORM); setOpenMode('create') }} className="primary-btn">+ 사용자 추가</button>
            <button onClick={() => setInviteModalOpen(true)} className="secondary-btn">+ 초대 링크</button>
          </>
        }
      />

      <PageMetricStrip
        items={[
          { label: '활성 사용자', value: `${activeUsers.length}명`, hint: '현재 사용 가능 계정', tone: 'info' },
          { label: '승인 대기', value: `${pendingUsers.length}명`, hint: '가입 승인 필요', tone: pendingUsers.length > 0 ? 'warning' : 'success' },
          { label: '초대 링크', value: `${invitations.length}건`, hint: '발급된 초대 이력', tone: 'default' },
          { label: '비밀번호 요청', value: `${resetRequests.length}건`, hint: '관리자 조치 필요', tone: resetRequests.length > 0 ? 'danger' : 'success' },
        ]}
      />

      {resetRequests.length > 0 && (
        <SectionScaffold
          title={`비밀번호 재설정 요청 (${resetRequests.length}건)`}
          description="즉시 초기화하거나 재설정 링크를 발급할 수 있습니다."
          className="tone-warning"
        >
          {resetRequests.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#d4a418] bg-[#fff7d6] px-3 py-2 text-xs">
              <p>{row.name} ({row.username}) · {toDateLabel(row.password_reset_requested_at)}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const value = prompt(`${row.username} 임시 비밀번호`)
                    if (value && value.trim()) adminResetMut.mutate({ id: row.id, new_password: value.trim() })
                  }}
                  className="secondary-btn text-xs"
                >
                  초기화
                </button>
                <button onClick={() => generateTokenMut.mutate(row.id)} className="secondary-btn text-xs">링크 생성</button>
              </div>
            </div>
          ))}
        </SectionScaffold>
      )}

      <SectionScaffold
        title="계정 운영"
        description="활성 사용자, 승인 대기, 초대 링크를 같은 목록 규칙으로 관리합니다."
        actions={
          <PageControlStrip compact className="!border-0 !bg-transparent !p-0 shadow-none">
            <div className="segmented-control">
              <button onClick={() => setTab('active')} className={`tab-btn ${tab === 'active' ? 'active' : ''}`}>활성 사용자 ({activeUsers.length})</button>
              <button onClick={() => setTab('pending')} className={`tab-btn ${tab === 'pending' ? 'active' : ''}`}>승인 대기 ({pendingUsers.length})</button>
              <button onClick={() => setTab('invites')} className={`tab-btn ${tab === 'invites' ? 'active' : ''}`}>초대 관리 ({invitations.length})</button>
            </div>
          </PageControlStrip>
        }
      >

        {tab === 'active' && (usersLoading ? <PageLoading /> : activeUsers.length === 0 ? <EmptyState message="활성 사용자가 없습니다." className="py-8" /> : (
          <div className="space-y-2">
            {activeUsers.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#d8e5fb] px-3 py-2 text-sm">
                <p>{row.name} ({row.username}) · {labelRole(row.role)} · {displayEmail(row.email)}</p>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingId(row.id); setForm({ username: row.username, name: row.name, email: displayEmail(row.email) === '-' ? '' : displayEmail(row.email), password: '', role: row.role, department: row.department || '', is_active: row.is_active, allowed_routes: row.allowed_routes || [] }); setOpenMode('edit') }} className="secondary-btn text-xs">수정</button>
                  <button onClick={() => { const value = prompt(`${row.username} 임시 비밀번호`); if (value && value.trim()) adminResetMut.mutate({ id: row.id, new_password: value.trim() }) }} className="secondary-btn text-xs">비번초기화</button>
                  <button onClick={() => generateTokenMut.mutate(row.id)} className="secondary-btn text-xs">재설정링크</button>
                  <button onClick={() => { if (!confirm('비활성화할까요?')) return; deactivateMut.mutate(row.id) }} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">비활성화</button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {tab === 'pending' && (pendingLoading ? <PageLoading /> : pendingUsers.length === 0 ? <EmptyState message="승인 대기 사용자가 없습니다." className="py-8" /> : (
          <div className="space-y-2">
            {pendingUsers.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#d8e5fb] px-3 py-2 text-sm">
                <p>{row.name} ({row.username}) · {labelRole(row.role)} · {displayEmail(row.email)} · {toDateLabel(row.created_at)}</p>
                <div className="flex gap-2">
                  <button onClick={() => approveMut.mutate(row.id)} className="secondary-btn text-xs">승인</button>
                  <button onClick={() => { if (!confirm('거절할까요?')) return; rejectMut.mutate(row.id) }} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">거절</button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {tab === 'invites' && (inviteLoading ? <PageLoading /> : invitations.length === 0 ? <EmptyState message="초대 이력이 없습니다." className="py-8" /> : (
          <div className="space-y-2">
            {invitations.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#d8e5fb] px-3 py-2 text-sm">
                <p>{row.name || row.email || '-'} · {labelRole(row.role)} · {labelStatus(row.status)} · {toDateLabel(row.expires_at)}</p>
                <div className="flex gap-2">
                  {row.status === 'pending' && (
                    <>
                      <button onClick={async () => {
                        const full = `${window.location.origin}${row.invite_url}`
                        try { await navigator.clipboard.writeText(full); addToast('success', '링크 복사 완료') } catch { prompt('링크 복사', full) }
                      }} className="secondary-btn text-xs">링크복사</button>
                      <button onClick={() => { if (!confirm('초대를 취소할까요?')) return; cancelInviteMut.mutate(row.id) }} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">취소</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </SectionScaffold>

      {openMode && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="modal-content w-full max-w-3xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0f1f3d]">{openMode === 'create' ? '사용자 생성' : '사용자 수정'}</h3>
              <button onClick={() => { setOpenMode(null); setEditingId(null); setForm(EMPTY_USER_FORM) }} className="text-sm text-[#64748b]">닫기</button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} className="form-input" placeholder="아이디" />
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="form-input" placeholder="이름" />
              <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="form-input" placeholder="이메일" />
              <input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className="form-input" placeholder="부서" />
              <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))} className="form-input">
                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{labelRole(role)}</option>)}
              </select>
              <input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} className="form-input" placeholder={openMode === 'edit' ? '비밀번호(선택)' : '비밀번호'} />
            </div>
            {(form.role === 'viewer' || form.role === 'manager') && (
              <div className="mt-3 max-h-40 overflow-auto rounded border border-[#d8e5fb] p-2 text-xs">
                {ROUTE_KEYS.map((key) => (
                  <label key={key} className="inline-flex w-1/2 items-center gap-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={form.allowed_routes.includes(key)}
                      onChange={() => setForm((prev) => ({ ...prev, allowed_routes: prev.allowed_routes.includes(key) ? prev.allowed_routes.filter((x) => x !== key) : [...prev.allowed_routes, key] }))}
                    />
                    {key}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setOpenMode(null); setEditingId(null); setForm(EMPTY_USER_FORM) }} className="secondary-btn">취소</button>
              <button
                onClick={() => {
                  const username = form.username.trim().toLowerCase()
                  const name = form.name.trim()
                  if (!username || !name) return
                  const payload: UserUpdateInput = {
                    username,
                    name,
                    email: form.email.trim().toLowerCase() || null,
                    password: form.password.trim() || null,
                    role: form.role,
                    department: form.department.trim() || null,
                    is_active: form.is_active,
                    allowed_routes: normalizeRoutes(form.role, form.allowed_routes),
                  }
                  if (openMode === 'create') {
                    if (!form.password.trim()) return
                    createMut.mutate({
                      ...(payload as UserCreateInput),
                      password: form.password,
                    })
                  } else if (editingId) {
                    updateMut.mutate({ id: editingId, payload })
                  }
                }}
                className="primary-btn"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="modal-content w-full max-w-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0f1f3d]">초대 링크 생성</h3>
              <button onClick={() => setInviteModalOpen(false)} className="text-sm text-[#64748b]">닫기</button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input value={inviteForm.name} onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))} className="form-input" placeholder="이름(선택)" />
              <input value={inviteForm.email} onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))} className="form-input" placeholder="이메일(선택)" />
              <select value={inviteForm.role} onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value as UserRole }))} className="form-input">
                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{labelRole(role)}</option>)}
              </select>
              <input value={inviteForm.department} onChange={(e) => setInviteForm((p) => ({ ...p, department: e.target.value }))} className="form-input" placeholder="부서(선택)" />
              <input type="number" min={1} max={365} value={inviteForm.expires_in_days} onChange={(e) => setInviteForm((p) => ({ ...p, expires_in_days: Number(e.target.value || 7) }))} className="form-input md:col-span-2" placeholder="만료일(일)" />
            </div>
            {(inviteForm.role === 'viewer' || inviteForm.role === 'manager') && (
              <div className="mt-3 max-h-40 overflow-auto rounded border border-[#d8e5fb] p-2 text-xs">
                {ROUTE_KEYS.map((key) => (
                  <label key={key} className="inline-flex w-1/2 items-center gap-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={inviteForm.allowed_routes.includes(key)}
                      onChange={() => setInviteForm((prev) => ({ ...prev, allowed_routes: prev.allowed_routes.includes(key) ? prev.allowed_routes.filter((x) => x !== key) : [...prev.allowed_routes, key] }))}
                    />
                    {key}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setInviteModalOpen(false)} className="secondary-btn">취소</button>
              <button
                onClick={() => createInviteMut.mutate({
                  name: inviteForm.name.trim() || null,
                  email: inviteForm.email.trim().toLowerCase() || null,
                  role: inviteForm.role,
                  department: inviteForm.department.trim() || null,
                  expires_in_days: inviteForm.expires_in_days,
                  allowed_routes: normalizeRoutes(inviteForm.role, inviteForm.allowed_routes),
                })}
                className="primary-btn"
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



