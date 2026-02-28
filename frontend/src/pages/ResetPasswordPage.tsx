import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
      <Suspense fallback={null}>
        <ShaderBackground />
      </Suspense>
      <Card className="relative z-10 w-full max-w-md border-white/50 bg-white/90 backdrop-blur-xl dark:border-gray-700 dark:bg-gray-900/90">
        {!token ? (
          <CardContent className="space-y-3 pt-6 text-center">
            <CardTitle>재설정 링크 오류</CardTitle>
            <CardDescription>토큰이 없거나 형식이 올바르지 않습니다.</CardDescription>
            <Button asChild className="w-full">
              <Link to="/login">로그인으로 이동</Link>
            </Button>
          </CardContent>
        ) : done ? (
          <CardContent className="space-y-3 pt-6 text-center">
            <CardTitle>비밀번호가 변경되었습니다</CardTitle>
            <CardDescription>새 비밀번호로 다시 로그인해 주세요.</CardDescription>
            <Button asChild className="w-full">
              <Link to="/login">로그인하기</Link>
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="space-y-1 text-center">
              <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
              <CardTitle>비밀번호 재설정</CardTitle>
              <CardDescription>새 비밀번호를 입력하세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">새 비밀번호</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="새 비밀번호"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password-confirm">새 비밀번호 확인</Label>
                  <Input
                    id="new-password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="새 비밀번호 확인"
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={submitting || !password || !passwordConfirm} className="w-full">
                  {submitting ? '변경 중...' : '비밀번호 변경'}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
