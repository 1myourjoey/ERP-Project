import * as React from 'react'

import { cn } from '@/lib/utils'

type AlertVariant = 'default' | 'destructive'

const VARIANT_CLASS: Record<AlertVariant, string> = {
  default: 'border-blue-200 bg-blue-50 text-blue-900',
  destructive: 'border-red-300 bg-red-50 text-red-900',
}

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
}

function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'relative w-full rounded-lg border p-4 text-sm [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7',
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  )
}

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />,
)
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm leading-relaxed [&_p]:leading-relaxed', className)} {...props} />
  ),
)
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertDescription, AlertTitle }
