import { useEffect, useMemo, useState, type ComponentType } from 'react'

type DotLottieProps = {
  src: string
  loop?: boolean
  autoplay?: boolean
  className?: string
  speed?: number
}

type DotLottieComponent = ComponentType<DotLottieProps>

let cachedDotLottie: DotLottieComponent | null | undefined

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reduced
}

export default function LottieAnimation({ src, loop = true, autoplay = true, className, speed = 1 }: DotLottieProps) {
  const [DotLottieReact, setDotLottieReact] = useState<DotLottieComponent | null>(() => cachedDotLottie ?? null)
  const [loadFailed, setLoadFailed] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (cachedDotLottie !== undefined) {
      setDotLottieReact(cachedDotLottie)
      setLoadFailed(cachedDotLottie == null)
      return
    }

    let active = true
    const moduleName = '@lottiefiles/dotlottie-react'

    import(/* @vite-ignore */ moduleName)
      .then((mod: unknown) => {
        if (!active) return
        const component = (mod as { DotLottieReact?: DotLottieComponent }).DotLottieReact ?? null
        cachedDotLottie = component
        setDotLottieReact(component)
        setLoadFailed(component == null)
      })
      .catch(() => {
        if (!active) return
        cachedDotLottie = null
        setLoadFailed(true)
      })

    return () => {
      active = false
    }
  }, [])

  const fallbackClass = useMemo(() => {
    const base = className || 'h-10 w-10'
    return `inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-400 ${base}`
  }, [className])

  if (reducedMotion || loadFailed || !DotLottieReact) {
    return (
      <div className={fallbackClass} aria-hidden="true">
        <span className="block h-2 w-2 rounded-full bg-current opacity-70" />
      </div>
    )
  }

  return <DotLottieReact src={src} loop={loop} autoplay={autoplay} className={className} speed={speed} />
}

