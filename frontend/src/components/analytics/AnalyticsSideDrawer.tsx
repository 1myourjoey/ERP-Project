import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface AnalyticsSideDrawerProps {
  open: boolean
  side: 'left' | 'right'
  title: string
  subtitle?: string
  widthClassName?: string
  closeOnOutsidePointerDown?: boolean
  onClose: () => void
  children: ReactNode
}

export default function AnalyticsSideDrawer({
  open,
  side,
  title,
  subtitle,
  widthClassName = 'w-[min(360px,calc(100vw-16px))]',
  closeOnOutsidePointerDown = true,
  onClose,
  children,
}: AnalyticsSideDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (!closeOnOutsidePointerDown) return
      const target = event.target as Node | null
      if (!panelRef.current || !target) return
      if (!panelRef.current.contains(target)) onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeOnOutsidePointerDown, onClose, open])

  if (!open) return null

  return (
    <div
      className={`pointer-events-none fixed inset-y-0 z-40 flex pt-[62px] ${
        side === 'left' ? 'left-0 justify-start pl-3 sm:pl-5' : 'right-0 justify-end pr-3 sm:pr-5'
      }`}
      aria-hidden={!open}
    >
      <aside
        ref={panelRef}
        className={`pointer-events-auto flex h-[calc(100vh-74px)] ${widthClassName} flex-col overflow-hidden rounded-2xl border border-[#d8e5fb] bg-white shadow-[0_20px_44px_rgba(15,31,61,0.18)]`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e7efff] px-4 py-3.5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#0f1f3d]">{title}</h3>
            {subtitle && <p className="mt-1 text-xs text-[#64748b]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn -mr-1 -mt-1 text-[#94a3b8] hover:text-[#64748b]"
            aria-label="패널 닫기"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </div>
  )
}
