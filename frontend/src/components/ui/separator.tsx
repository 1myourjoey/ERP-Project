import * as React from 'react'

import { cn } from '@/lib/utils'

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
}

function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        'bg-gray-200 dark:bg-gray-700',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
