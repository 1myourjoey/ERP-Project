import LottieAnimation from './LottieAnimation'

interface EmptyStateProps {
  message: string
  src?: string
  className?: string
  emoji?: string
  action?: () => void
  actionLabel?: string
}

export default function EmptyState({
  message,
  src = '/animations/empty-state.lottie',
  className = '',
  emoji,
  action,
  actionLabel,
}: EmptyStateProps) {
  if (emoji) {
    return (
      <div className={`empty-emoji-state ${className}`.trim()}>
        <span className="emoji" aria-hidden="true">
          {emoji}
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
      <LottieAnimation src={src} className="h-24 w-24 opacity-70" />
      <p className="mt-2 text-sm text-gray-400">{message}</p>
    </div>
  )
}
