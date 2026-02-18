import LottieAnimation from './LottieAnimation'

interface EmptyStateProps {
  message: string
  src?: string
  className?: string
}

export default function EmptyState({ message, src = '/animations/empty-state.lottie', className = '' }: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <LottieAnimation src={src} className="h-24 w-24 opacity-70" />
      <p className="mt-2 text-sm text-gray-400">{message}</p>
    </div>
  )
}
