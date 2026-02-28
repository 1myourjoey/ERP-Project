import * as React from 'react'

import { cn } from '@/lib/utils'

interface CalendarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value?: string
}

function Calendar({ className, ...props }: CalendarProps) {
  return <input type="date" className={cn('h-9 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-gray-900', className)} {...props} />
}

export { Calendar }
