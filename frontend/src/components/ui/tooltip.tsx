import * as React from 'react'

import { cn } from '@/lib/utils'

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function TooltipTrigger({
  asChild,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { asChild?: boolean; children: React.ReactNode }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement)
  }
  return <span {...props}>{children}</span>
}

function TooltipContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tooltip"
      className={cn(
        'sr-only rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
