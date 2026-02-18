import { X } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import LottieAnimation from './LottieAnimation'

const TOAST_COLOR = {
  success: 'bg-green-50 border-green-300 text-green-800',
  error: 'bg-red-50 border-red-300 text-red-800',
  info: 'bg-blue-50 border-blue-300 text-blue-800',
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm text-sm ${TOAST_COLOR[toast.type]}`}
        >
          {toast.type === 'success' && (
            <LottieAnimation src="/animations/success-check.lottie" className="h-6 w-6" loop={false} />
          )}
          {toast.type === 'error' && (
            <LottieAnimation src="/animations/error-alert.lottie" className="h-6 w-6" loop={false} />
          )}
          <span>{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="icon-btn">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}




