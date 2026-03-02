import { Suspense, lazy, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { forgotPassword } from '../lib/api'

const ShaderBackground = lazy(() => import('../components/ShaderBackground'))

export default function ForgotPasswordPage() {
  const [loginId, setLoginId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!loginId.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await forgotPassword({ login_id: loginId.trim() })
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.')
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
        {submitted ? (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-semibold text-[#0f1f3d]">요청 완료</h1>
            <p className="text-sm text-[#64748b]">
              비밀번호 재설정 요청이 접수되었습니다.
              <br />
              관리자가 확인 후 안내할 예정입니다.
            </p>
            <Link to="/login" className="primary-btn inline-flex w-full items-center justify-center">
              로그인 페이지로 이동
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 text-center">
              <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
              <h1 className="mt-3 text-lg font-semibold text-[#0f1f3d]">비밀번호 찾기</h1>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="form-label">아이디 또는 이메일</label>
                <input
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  className="form-input"
                  placeholder="hong 또는 hong@company.com"
                />
              </div>
              {error && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}
              <button type="submit" disabled={submitting || !loginId.trim()} className="primary-btn w-full disabled:opacity-60">
                {submitting ? '요청 중...' : '재설정 요청'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-[#64748b]">
              <Link to="/login" className="text-[#558ef8] hover:underline">
                로그인으로 돌아가기
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

