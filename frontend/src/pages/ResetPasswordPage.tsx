import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { resetPassword } from '../lib/api'

const ShaderBackground = lazy(() => import('../components/ShaderBackground'))

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => (searchParams.get('token') || '').trim(), [searchParams])
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return
    if (!password || password !== passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await resetPassword({ token, new_password: password })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 재설정에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <ShaderBackground />
      </Suspense>
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/40 bg-white/90 p-6 shadow-xl backdrop-blur-xl">
        {!token ? (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-semibold text-gray-900">재설정 링크 오류</h1>
            <p className="text-sm text-gray-600">토큰이 없거나 형식이 올바르지 않습니다.</p>
            <Link to="/login" className="primary-btn inline-flex w-full items-center justify-center">
              로그인으로 이동
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-semibold text-gray-900">비밀번호가 변경되었습니다</h1>
            <p className="text-sm text-gray-600">새 비밀번호로 다시 로그인해 주세요.</p>
            <Link to="/login" className="primary-btn inline-flex w-full items-center justify-center">
              로그인하기
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 text-center">
              <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
              <h1 className="mt-3 text-lg font-semibold text-gray-900">비밀번호 재설정</h1>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="form-label">새 비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="form-input"
                  placeholder="새 비밀번호"
                />
              </div>
              <div>
                <label className="form-label">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  className="form-input"
                  placeholder="새 비밀번호 확인"
                />
              </div>
              {error && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}
              <button
                type="submit"
                disabled={submitting || !password || !passwordConfirm}
                className="primary-btn w-full disabled:opacity-60"
              >
                {submitting ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
