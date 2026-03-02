import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Info, Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  promptMode?: boolean
  promptLabel?: string
  promptType?: 'text' | 'number' | 'date'
  promptDefaultValue?: string
  onPromptConfirm?: (value: string) => void
}

function variantIcon(variant: ConfirmDialogProps['variant']) {
  if (variant === 'danger') return <AlertTriangle size={16} className="text-red-600" />
  if (variant === 'warning') return <AlertTriangle size={16} className="text-amber-600" />
  return <Info size={16} className="text-[#558ef8]" />
}

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'info',
  onConfirm,
  onCancel,
  loading = false,
  promptMode = false,
  promptLabel,
  promptType = 'text',
  promptDefaultValue = '',
  onPromptConfirm,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [promptValue, setPromptValue] = useState(promptDefaultValue)

  useEffect(() => {
    if (!open) return
    setPromptValue(promptDefaultValue)
    const timer = window.setTimeout(() => {
      if (promptMode && inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      } else {
        confirmRef.current?.focus()
      }
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!loading) onCancel()
      }
      if (event.key === 'Tab') {
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLButtonElement[]
        if (focusables.length === 0) return
        const current = document.activeElement as HTMLElement | null
        const currentIndex = focusables.findIndex((node) => node === current)
        const nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
          : (currentIndex === focusables.length - 1 ? 0 : currentIndex + 1)
        event.preventDefault()
        focusables[nextIndex]?.focus()
      }
      if (event.key === 'Enter' && promptMode && onPromptConfirm && !loading) {
        event.preventDefault()
        onPromptConfirm(promptValue)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [loading, onCancel, onPromptConfirm, open, promptDefaultValue, promptMode, promptValue])

  const confirmButtonClass = useMemo(() => {
    if (variant === 'danger') return 'danger-btn'
    return 'primary-btn'
  }, [variant])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="modal-overlay fixed inset-0 bg-black/40" onClick={() => !loading && onCancel()} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="modal-content w-full max-w-md" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center gap-2">
            {variantIcon(variant)}
            <h3 className="text-base font-semibold">{title}</h3>
          </div>

          <p className="text-sm text-[#64748b]">{message}</p>
          {detail && (
            <div className="warning-banner mt-3">
              <div className="info-banner-icon">
                <AlertTriangle size={14} />
              </div>
              <div className="info-banner-text text-xs">{detail}</div>
            </div>
          )}

          {promptMode && (
            <div className="mt-3">
              {promptLabel && <label className="form-label">{promptLabel}</label>}
              <input
                ref={inputRef}
                type={promptType}
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                className="form-input"
              />
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button ref={cancelRef} type="button" className="secondary-btn" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={confirmButtonClass}
              onClick={() => {
                if (promptMode && onPromptConfirm) {
                  onPromptConfirm(promptValue)
                  return
                }
                onConfirm()
              }}
              disabled={loading}
            >
              {loading ? <Loader2 size={14} className="inline animate-spin" /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
