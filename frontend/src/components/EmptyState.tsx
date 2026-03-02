import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

import LottieAnimation from './LottieAnimation'

interface EmptyStateProps {
  message: string
  src?: string
  className?: string
  emoji?: string
  icon?: ReactNode
  action?: () => void
  actionLabel?: string
}

export default function EmptyState({
  message,
  src = '/animations/empty-state.lottie',
  className = '',
  emoji,
  icon,
  action,
  actionLabel,
}: EmptyStateProps) {
  if (emoji) {
    return (
      <div className={`empty-emoji-state ${className}`.trim()}>
        <span className="empty-state-icon" aria-hidden="true">
          {icon ?? <Inbox size={20} />}
        </span>
        <p className="message">{message}</p>
        {action && actionLabel && (
          <button onClick={action} className="primary-btn mt-2 text-xs">
            {actionLabel}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`empty-state ${className}`.trim()}>
      {icon ? (
        <span className="empty-state-icon mb-2" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <LottieAnimation src={src} className="h-24 w-24 opacity-70" />
      )}
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      {action && actionLabel && (
        <button onClick={action} className="primary-btn mt-2 text-xs">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
