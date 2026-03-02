import { Suspense, lazy, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'
import {
  checkUsernameAvailability,
  verifyInvitation,
  type InvitationResponse,
} from '../lib/api'

const ShaderBackground = lazy(() => import('../components/ShaderBackground'))

type UsernameState = {
  checking: boolean
  available: boolean | null
  message: string | null
}

function passwordStrength(password: string): 'weak' | 'medium' | 'strong' {
  const value = password.trim()
  if (!value) return 'weak'
  let score = 0
  if (value.length >= 8) score += 1
  if (/[A-Za-z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  if (score >= 4) return 'strong'
  if (score >= 3) return 'medium'
  return 'weak'
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = (searchParams.get('invite') || '').trim()
  const inviteMode = Boolean(inviteToken)
  const { isAuthenticated, register, loginWithInvite } = useAuth()

  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [usernameState, setUsernameState] = useState<UsernameState>({
    checking: false,
    available: null,
    message: null,
  })
  const [inviteInfo, setInviteInfo] = useState<InvitationResponse | null>(null)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!inviteMode) return
    let mounted = true
    setInviteLoading(true)
    setInviteMessage(null)
    void verifyInvitation(inviteToken)
      .then((payload) => {
        if (!mounted) return
        if (!payload.valid || !payload.invitation) {
          setInviteInfo(null)
          setInviteMessage(payload.message || '유효하지 않은 초대 링크입니다.')
          return
        }
        setInviteInfo(payload.invitation)
        setName((prev) => prev || payload.invitation?.name || '')
        setEmail(payload.invitation.email || '')
        setDepartment(payload.invitation.department || '')
      })
      .catch((error) => {
        if (!mounted) return
        setInviteInfo(null)
        setInviteMessage(error instanceof Error ? error.message : '초대 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (mounted) setInviteLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [inviteMode, inviteToken])

  useEffect(() => {
    const normalized = username.trim().toLowerCase()
    if (!normalized) {
      setUsernameState({ checking: false, available: null, message: null })
      return
    }
    if (!/^[a-z0-9_]{4,20}$/.test(normalized)) {
      setUsernameState({
        checking: false,
        available: false,
        message: '영문 소문자/숫자/_ 4~20자',
      })
      return
    }
    const timer = window.setTimeout(() => {
      setUsernameState((prev) => ({ ...prev, checking: true }))
      void checkUsernameAvailability(normalized)
        .then((payload) => {
          setUsernameState({
            checking: false,
            available: payload.available,
            message: payload.message ?? (payload.available ? '사용 가능한 아이디입니다.' : null),
          })
        })
        .catch((error) => {
          setUsernameState({
            checking: false,
            available: null,
            message: error instanceof Error ? error.message : '중복 확인에 실패했습니다.',
          })
        })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [username])

  const strength = useMemo(() => passwordStrength(password), [password])
  const passwordsMatch = passwordConfirm.length > 0 && password === passwordConfirm

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    if (!/^[a-z0-9_]{4,20}$/.test(username.trim().toLowerCase())) {
      setSubmitError('아이디 형식을 확인해 주세요.')
      return
    }
    if (!password || password !== passwordConfirm) {
      setSubmitError('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setSubmitting(true)
    try {
      if (inviteMode) {
        await loginWithInvite(inviteToken, username.trim().toLowerCase(), password, name.trim())
        navigate('/dashboard', { replace: true })
        return
      }

      await register({
        username: username.trim().toLowerCase(),
        name: name.trim(),
        email: email.trim() || null,
        department: department.trim() || null,
        password,
      })
      setSubmitted(true)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '회원가입 요청에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
      <Suspense fallback={null}>
        <ShaderBackground />
      </Suspense>
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/40 bg-white/90 p-6 shadow-xl backdrop-blur-xl">
        {submitted ? (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-semibold text-[#0f1f3d]">가입 신청 완료</h1>
            <p className="text-sm text-[#64748b]">
              가입 신청이 정상적으로 접수되었습니다.
              <br />
              관리자 승인 후 로그인할 수 있습니다.
            </p>
            <button onClick={() => navigate('/login')} className="primary-btn w-full">
              로그인 페이지로 이동
            </button>
          </div>
        ) : inviteLoading ? (
          <div className="py-6 text-center text-sm text-[#64748b]">초대 정보를 확인하는 중...</div>
        ) : inviteMode && !inviteInfo ? (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-semibold text-[#0f1f3d]">초대 링크를 사용할 수 없습니다</h1>
            <p className="text-sm text-[#64748b]">{inviteMessage || '유효하지 않은 초대 링크입니다.'}</p>
            <Link to="/login" className="primary-btn inline-flex w-full items-center justify-center">
              로그인으로 이동
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 text-center">
              <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
              <h1 className="mt-3 text-lg font-semibold text-[#0f1f3d]">
                {inviteMode ? 'V:ON ERP 초대 가입' : 'V:ON ERP 회원가입'}
              </h1>
              {inviteInfo && (
                <p className="mt-1 text-xs text-[#64748b]">
                  역할: <span className="font-medium">{inviteInfo.role}</span>
                </p>
              )}
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="form-label">아이디</label>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="form-input"
                  placeholder="park_invest"
                />
                <p className="mt-1 text-xs text-[#64748b]">
                  {usernameState.checking
                    ? '중복 확인 중...'
                    : usernameState.message || '영문 소문자, 숫자, _ 만 가능 (4~20자)'}
                </p>
              </div>

              <div>
                <label className="form-label">이름</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="form-input"
                  placeholder="홍길동"
                />
              </div>

              {!inviteMode && (
                <>
                  <div>
                    <label className="form-label">이메일 (선택)</label>
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="form-input"
                      placeholder="name@company.com"
                    />
                  </div>
                  <div>
                    <label className="form-label">부서 (선택)</label>
                    <input
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      className="form-input"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="form-label">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="form-input"
                />
                <p className="mt-1 text-xs text-[#64748b]">
                  강도:{' '}
                  <span
                    className={
                      strength === 'strong'
                        ? 'text-green-700'
                        : strength === 'medium'
                          ? 'text-amber-700'
                          : 'text-red-700'
                    }
                  >
                    {strength === 'strong' ? '강함' : strength === 'medium' ? '보통' : '약함'}
                  </span>
                </p>
              </div>

              <div>
                <label className="form-label">비밀번호 확인</label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  className="form-input"
                />
                {passwordConfirm.length > 0 && (
                  <p className={`mt-1 text-xs ${passwordsMatch ? 'text-green-700' : 'text-red-700'}`}>
                    {passwordsMatch ? '비밀번호가 일치합니다.' : '비밀번호가 일치하지 않습니다.'}
                  </p>
                )}
              </div>

              {submitError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  !username.trim() ||
                  !name.trim() ||
                  !password ||
                  !passwordConfirm ||
                  password !== passwordConfirm ||
                  usernameState.available === false
                }
                className="primary-btn w-full disabled:opacity-60"
              >
                {submitting ? '처리 중...' : inviteMode ? '가입 완료' : '가입 신청'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-[#64748b]">
              이미 계정이 있으신가요?{' '}
              <Link to="/login" className="text-[#558ef8] hover:underline">
                로그인
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

