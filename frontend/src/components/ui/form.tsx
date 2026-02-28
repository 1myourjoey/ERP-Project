import * as React from 'react'

import { cn } from '@/lib/utils'

function Form({ className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn(className)} {...props} />
}

function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1.5', className)} {...props} />
}

function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-semibold text-gray-700 dark:text-gray-200', className)} {...props} />
}

function FormControl({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />
}

function FormDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-gray-500 dark:text-gray-400', className)} {...props} />
}

function FormMessage({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-red-600', className)} {...props} />
}

export { Form, FormControl, FormDescription, FormItem, FormLabel, FormMessage }
