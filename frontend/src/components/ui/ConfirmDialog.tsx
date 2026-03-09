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
  if (variant === 'danger') return <AlertTriangle size={18} className="text-red-600" />
  if (variant === 'warning') return <AlertTriangle size={18} className="text-amber-600" />
  return <Info size={18} className="text-[#558ef8]" />
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
      <div className="fixed inset-0 bg-[#0f172a]/45 backdrop-blur-[2px]" onClick={() => !loading && onCancel()} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-[28px] border border-[#d8e5fb] bg-white p-6 shadow-[0_24px_80px_rgba(15,31,61,0.22)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d8e5fb] bg-[#f5f9ff]">
              {variantIcon(variant)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-[#0f1f3d]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#64748b]">{message}</p>
            </div>
          </div>

          {detail && (
            <div className="mt-4 rounded-2xl border border-[#f1d0d4] bg-[#fdf4f5] px-4 py-3 text-xs leading-5 text-[#7a2d36]">
              {detail}
            </div>
          )}

          {promptMode && (
            <div className="mt-4 rounded-2xl border border-[#d8e5fb] bg-[#fbfdff] p-4">
              {promptLabel && <label className="form-label">{promptLabel}</label>}
              <input
                ref={inputRef}
                type={promptType}
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                className="form-input mt-2"
              />
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#eef3fb] pt-4 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              className="secondary-btn justify-center sm:min-w-[96px]"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={`${confirmButtonClass} justify-center sm:min-w-[112px]`}
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
