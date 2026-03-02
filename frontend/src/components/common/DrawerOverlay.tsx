import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface DrawerOverlayProps {
  open: boolean
  title?: string
  widthClassName?: string
  onClose: () => void
  children: ReactNode
}

export default function DrawerOverlay({
  open,
  title,
  widthClassName = 'w-full max-w-2xl',
  onClose,
  children,
}: DrawerOverlayProps) {
  if (!open) return null

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className={`modal-content h-full ${widthClassName} border-l border-slate-200 bg-white shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-semibold text-slate-800">{title || '상세 정보'}</h3>
            <button
              type="button"
              onClick={onClose}
              className="icon-btn text-slate-400 hover:text-slate-600"
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </aside>
    </div>
  )
}
