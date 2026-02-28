import * as React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info' | 'warning'

type ToastItem = {
  id: number
  type: ToastType
  message: string
  duration: number
}

type ToastListener = (items: ToastItem[]) => void

const listeners = new Set<ToastListener>()
let items: ToastItem[] = []
let nextId = 1

function emit() {
  for (const listener of listeners) listener(items)
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id)
  emit()
}

function push(type: ToastType, message: string, duration = 3000) {
  const id = nextId++
  items = [...items, { id, type, message, duration }]
  emit()
  window.setTimeout(() => dismiss(id), duration)
  return id
}

function subscribe(listener: ToastListener) {
  listeners.add(listener)
  listener(items)
  return () => {
    listeners.delete(listener)
  }
}

type ToastFn = ((message: string) => number) & {
  success: (message: string) => number
  error: (message: string) => number
  info: (message: string) => number
  warning: (message: string) => number
  dismiss: (id?: number) => void
}

const baseToast = ((message: string) => push('info', message)) as ToastFn
baseToast.success = (message: string) => push('success', message)
baseToast.error = (message: string) => push('error', message)
baseToast.info = (message: string) => push('info', message)
baseToast.warning = (message: string) => push('warning', message)
baseToast.dismiss = (id?: number) => {
  if (typeof id === 'number') {
    dismiss(id)
    return
  }
  items = []
  emit()
}

export const toast = baseToast

const TOAST_STYLE: Record<ToastType, string> = {
  success: 'border-green-300 bg-green-50 text-green-800',
  error: 'border-red-300 bg-red-50 text-red-800',
  info: 'border-blue-300 bg-blue-50 text-blue-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
}

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
}

interface ToasterProps {
  position?:
    | 'top-right'
    | 'top-left'
    | 'top-center'
    | 'bottom-right'
    | 'bottom-left'
    | 'bottom-center'
  className?: string
  richColors?: boolean
}

const POSITION_CLASS: Record<NonNullable<ToasterProps['position']>, string> = {
  'top-right': 'top-4 right-4 items-end',
  'top-left': 'top-4 left-4 items-start',
  'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-4 right-4 items-end',
  'bottom-left': 'bottom-4 left-4 items-start',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
}

export function Toaster({ position = 'top-right', className }: ToasterProps) {
  const [state, setState] = React.useState<ToastItem[]>([])

  React.useEffect(() => subscribe(setState), [])

  return (
    <div
      className={cn(
        'pointer-events-none fixed z-[110] flex max-w-sm flex-col gap-2',
        POSITION_CLASS[position],
        className,
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      {state.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-md',
            TOAST_STYLE[item.type],
          )}
        >
          <span className="mt-0.5 shrink-0">{ICON_MAP[item.type]}</span>
          <span className="flex-1">{item.message}</span>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/5"
            onClick={() => dismiss(item.id)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
