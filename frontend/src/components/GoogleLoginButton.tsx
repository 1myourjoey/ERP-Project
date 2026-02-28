import { useEffect, useRef, useState } from 'react'

interface GoogleLoginButtonProps {
  onSuccess: (credential: string) => void
  onError?: () => void
  disabled?: boolean
}

declare global {
  interface Window {
    google?: any
  }
}

export default function GoogleLoginButton({ onSuccess, onError, disabled = false }: GoogleLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    if (disabled) return
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) {
      setInitError('Google Client ID가 설정되지 않았습니다.')
      return
    }

    let mounted = true
    let tries = 0
    const maxTries = 20

    const tryInitialize = () => {
      if (!mounted) return
      const google = window.google
      const container = containerRef.current
      if (!google?.accounts?.id || !container) {
        tries += 1
        if (tries >= maxTries) {
          setInitError('Google 로그인 SDK를 불러오지 못했습니다.')
          onError?.()
          return
        }
        window.setTimeout(tryInitialize, 250)
        return
      }

      try {
        container.innerHTML = ''
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential?: string }) => {
            const credential = response?.credential
            if (!credential) {
              onError?.()
              return
            }
            onSuccess(credential)
          },
        })
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 320,
        })
      } catch {
        setInitError('Google 로그인 초기화에 실패했습니다.')
        onError?.()
      }
    }

    tryInitialize()
    return () => {
      mounted = false
    }
  }, [disabled, onError, onSuccess])

  if (initError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        {initError}
      </div>
    )
  }

  return <div ref={containerRef} className="inline-flex justify-center" />
}
