import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

function Progress({ className, value = 0, ...props }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700', className)} {...props}>
      <div className="h-full bg-blue-600 transition-all" style={{ width: `${safeValue}%` }} />
    </div>
  )
}

export { Progress }
