import { type ReactNode } from 'react'
import { X } from 'lucide-react'

interface FormModalProps {
  open: boolean
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel?: string
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const SIZE_CLASS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

export function FormModal({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel = '저장',
  loading = false,
  size = 'md',
  children,
}: FormModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="modal-overlay fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className={`modal-content w-full ${SIZE_CLASS[size]}`} onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3">{children}</div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={loading}>
              취소
            </button>
            <button type="button" className="primary-btn" onClick={onSubmit} disabled={loading}>
              {loading ? '처리중...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FormModal
