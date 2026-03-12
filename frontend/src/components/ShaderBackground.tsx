import { Suspense, lazy, useEffect, useState } from 'react'

const ShaderBackgroundScene = lazy(() => import('./ShaderBackgroundScene'))

export default function ShaderBackground() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const viewportQuery = window.matchMedia('(max-width: 767px)')
    const updatePreference = () => {
      setPrefersReducedMotion(motionQuery.matches)
      setIsCompactViewport(viewportQuery.matches)
    }

    updatePreference()
    motionQuery.addEventListener('change', updatePreference)
    viewportQuery.addEventListener('change', updatePreference)
    return () => {
      motionQuery.removeEventListener('change', updatePreference)
      viewportQuery.removeEventListener('change', updatePreference)
    }
  }, [])

  if (prefersReducedMotion || isCompactViewport) return null

  return (
    <Suspense fallback={null}>
      <ShaderBackgroundScene />
    </Suspense>
  )
}
