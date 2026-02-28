import * as React from 'react'

import { cn } from '@/lib/utils'

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-xs font-semibold text-gray-700 dark:text-gray-200', className)} {...props} />
  ),
)

Label.displayName = 'Label'

export { Label }
