import { Suspense, lazy, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
      <Suspense fallback={null}>
        <ShaderBackground />
      </Suspense>
      <Card className="relative z-10 w-full max-w-md border-white/50 bg-white/90 backdrop-blur-xl dark:border-gray-700 dark:bg-gray-900/90">
        {submitted ? (
          <CardContent className="space-y-4 pt-6 text-center">
            <CardTitle>요청 완료</CardTitle>
            <CardDescription>
              비밀번호 재설정 요청이 접수되었습니다.
              <br />
              관리자 확인 후 안내됩니다.
            </CardDescription>
            <Button asChild className="w-full">
              <Link to="/login">로그인 페이지로 이동</Link>
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="space-y-1 text-center">
              <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
              <CardTitle>비밀번호 찾기</CardTitle>
              <CardDescription>아이디 또는 이메일을 입력하세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="login-id">아이디 / 이메일</Label>
                  <Input
                    id="login-id"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    placeholder="hong or hong@company.com"
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={submitting || !loginId.trim()} className="w-full">
                  {submitting ? '요청 중...' : '재설정 요청'}
                </Button>
              </form>
              <p className="mt-4 text-center text-xs text-gray-500">
                <Link to="/login" className="text-blue-600 hover:underline">
                  로그인으로 돌아가기
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
