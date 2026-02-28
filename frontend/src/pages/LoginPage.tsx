import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import GoogleLoginButton from '../components/GoogleLoginButton'
import { useAuth } from '../contexts/AuthContext'

const ShaderBackground = lazy(() => import('../components/ShaderBackground'))

type LocationState = {
  from?: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loginWithGoogle, isAuthenticated } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const from = useMemo(() => {
    const state = (location.state as LocationState | null) ?? null
    if (state?.from && state.from !== '/login') return state.from
    return '/dashboard'
  }, [location.state])

  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!loginId.trim() || !password.trim()) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await login(loginId.trim(), password)
      navigate(from, { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : '로그인에 실패했습니다.'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <ShaderBackground />
      </Suspense>
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/40 bg-white/90 p-6 shadow-xl backdrop-blur-xl">
        <div className="mb-5 text-center">
          <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
          <p className="mt-3 text-sm text-gray-600">V:ON ERP 로그인</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="form-label">아이디 또는 이메일</label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoFocus
              className="form-input"
              placeholder="admin 또는 admin@company.com"
            />
          </div>
          <div>
            <label className="form-label">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="비밀번호"
            />
          </div>
          {errorMessage && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorMessage}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !loginId.trim() || !password.trim()}
            className="primary-btn w-full disabled:opacity-60"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2 text-xs text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          또는
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <div className="flex justify-center">
          <GoogleLoginButton
            onSuccess={async (credential) => {
              setErrorMessage(null)
              setIsSubmitting(true)
              try {
                await loginWithGoogle(credential)
                navigate(from, { replace: true })
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Google 로그인에 실패했습니다.'
                setErrorMessage(message)
              } finally {
                setIsSubmitting(false)
              }
            }}
            onError={() => {
              setErrorMessage('Google 로그인 버튼을 초기화하지 못했습니다.')
            }}
            disabled={isSubmitting}
          />
        </div>

        <div className="mt-4 space-y-1 text-center text-xs text-gray-500">
          <p>
            계정이 없으신가요?{' '}
            <Link to="/register" className="text-blue-600 hover:underline">
              회원가입
            </Link>
          </p>
          <p>
            비밀번호를 잊으셨나요?{' '}
            <Link to="/forgot-password" className="text-blue-600 hover:underline">
              비밀번호 찾기
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
