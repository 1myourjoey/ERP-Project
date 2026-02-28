import * as React from 'react'

import { cn } from '@/lib/utils'

function DropdownMenu({ children }: { children: React.ReactNode }) {
  return <div className="relative inline-block">{children}</div>
}

function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; children: React.ReactNode }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement)
  }
  return (
    <button type="button" {...props}>
      {children}
    </button>
  )
}

function DropdownMenuContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'z-50 mt-2 min-w-[160px] rounded-lg border border-gray-200 bg-white p-1 shadow-md dark:border-gray-700 dark:bg-gray-900',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn('flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800', className)}
      {...props}
    />
  )
}

function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 py-1.5 text-xs font-semibold text-gray-500', className)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('my-1 h-px bg-gray-200 dark:bg-gray-700', className)} {...props} />
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
