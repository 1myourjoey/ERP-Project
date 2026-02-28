import { Suspense, lazy, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
        message: '영문 소문자, 숫자, _ 만 사용 가능 (4~20자)',
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
      <Card className="relative z-10 w-full max-w-md border-white/50 bg-white/90 backdrop-blur-xl dark:border-gray-700 dark:bg-gray-900/90">
        {submitted ? (
          <CardContent className="space-y-4 pt-6 text-center">
            <CardTitle>가입 요청 완료</CardTitle>
            <CardDescription>
              가입 요청이 접수되었습니다.
              <br />
              관리자 승인 후 로그인할 수 있습니다.
            </CardDescription>
            <Button onClick={() => navigate('/login')} className="w-full">
              로그인 페이지로 이동
            </Button>
          </CardContent>
        ) : inviteLoading ? (
          <CardContent className="py-8 text-center text-sm text-gray-600 dark:text-gray-300">
            초대 정보를 확인하는 중...
          </CardContent>
        ) : inviteMode && !inviteInfo ? (
          <CardContent className="space-y-4 pt-6 text-center">
            <CardTitle>초대 링크를 사용할 수 없습니다</CardTitle>
            <CardDescription>{inviteMessage || '유효하지 않은 초대 링크입니다.'}</CardDescription>
            <Button asChild className="w-full">
              <Link to="/login">로그인으로 이동</Link>
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="space-y-1 text-center">
              <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
              <CardTitle>{inviteMode ? 'V:ON ERP 초대 가입' : 'V:ON ERP 회원가입'}</CardTitle>
              {inviteInfo ? (
                <CardDescription>역할: {inviteInfo.role}</CardDescription>
              ) : (
                <CardDescription>기본 정보 입력 후 가입을 요청하세요.</CardDescription>
              )}
            </CardHeader>

            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username">아이디</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="park_invest"
                  />
                  <p className="text-xs text-gray-500">
                    {usernameState.checking
                      ? '중복 확인 중...'
                      : usernameState.message || '영문 소문자, 숫자, _ 만 사용 가능 (4~20자)'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name">이름</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="홍길동" />
                </div>

                {!inviteMode && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">이메일 (선택)</Label>
                      <Input
                        id="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="name@company.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="department">부서 (선택)</Label>
                      <Input
                        id="department"
                        value={department}
                        onChange={(event) => setDepartment(event.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="password">비밀번호</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <p className="text-xs text-gray-500">
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

                <div className="space-y-1.5">
                  <Label htmlFor="password-confirm">비밀번호 확인</Label>
                  <Input
                    id="password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                  />
                  {passwordConfirm.length > 0 && (
                    <p className={`text-xs ${passwordsMatch ? 'text-green-700' : 'text-red-700'}`}>
                      {passwordsMatch ? '비밀번호가 일치합니다.' : '비밀번호가 일치하지 않습니다.'}
                    </p>
                  )}
                </div>

                {submitError && (
                  <Alert variant="destructive">
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}

                <Button
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
                  className="w-full"
                >
                  {submitting ? '처리 중...' : inviteMode ? '가입 완료' : '가입 요청'}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-gray-500">
                이미 계정이 있으신가요?{' '}
                <Link to="/login" className="text-blue-600 hover:underline">
                  로그인
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
