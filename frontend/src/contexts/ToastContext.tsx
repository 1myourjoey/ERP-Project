import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'

import { toast } from '@/components/ui/sonner'
import { setToastHandler, type ToastType } from '../lib/toastBridge'

interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface ToastContextType {
  toasts: ToastItem[]
  addToast: (type: ToastType, message: string) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const addToast = useCallback((type: ToastType, message: string) => {
    if (type === 'success') {
      toast.success(message)
      return
    }
    if (type === 'error') {
      toast.error(message)
      return
    }
    if (type === 'warning') {
      toast.warning(message)
      return
    }
    toast.info(message)
  }, [])

  const removeToast = useCallback((id: string) => {
    const parsed = Number(id)
    if (!Number.isNaN(parsed)) toast.dismiss(parsed)
  }, [])

  useEffect(() => {
    setToastHandler(addToast)
    return () => setToastHandler(null)
  }, [addToast])

  const value = useMemo<ToastContextType>(
    () => ({
      toasts: [],
      addToast,
      removeToast,
    }),
    [addToast, removeToast],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}
