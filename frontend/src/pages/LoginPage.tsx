import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={null}>
        <ShaderBackground />
      </Suspense>
      <Card className="relative z-10 w-full max-w-md border-white/50 bg-white/90 backdrop-blur-xl dark:border-gray-700 dark:bg-gray-900/90">
        <CardHeader className="space-y-2 text-center">
          <img src="/logo.svg" alt="V:ON" className="mx-auto h-8 w-auto" />
          <CardTitle className="text-xl">V:ON ERP Login</CardTitle>
          <CardDescription>아이디 또는 이메일로 로그인하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login-id">아이디 / 이메일</Label>
              <Input
                id="login-id"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                autoFocus
                placeholder="admin or admin@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
              />
            </div>
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || !loginId.trim() || !password.trim()}
              className="w-full"
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </Button>
          </form>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Separator className="flex-1" />
            또는
            <Separator className="flex-1" />
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

          <div className="space-y-1 text-center text-xs text-gray-500">
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
        </CardContent>
      </Card>
    </div>
  )
}
