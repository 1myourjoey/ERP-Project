import * as React from 'react'

import { cn } from '@/lib/utils'

const Command = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex h-full w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100', className)}
      {...props}
    />
  ),
)
Command.displayName = 'Command'

const CommandInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <div className="flex items-center border-b border-gray-200 px-3 dark:border-gray-700">
      <input
        ref={ref}
        className={cn('flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-500', className)}
        {...props}
      />
    </div>
  ),
)
CommandInput.displayName = 'CommandInput'

const CommandList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden p-1', className)} {...props} />
  ),
)
CommandList.displayName = 'CommandList'

const CommandEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('py-6 text-center text-sm text-gray-500', className)} {...props} />
  ),
)
CommandEmpty.displayName = 'CommandEmpty'

const CommandGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('overflow-hidden px-1 py-1 text-gray-700 dark:text-gray-200', className)} {...props} />
  ),
)
CommandGroup.displayName = 'CommandGroup'

const CommandSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('-mx-1 h-px bg-gray-200 dark:bg-gray-700', className)} {...props} />
  ),
)
CommandSeparator.displayName = 'CommandSeparator'

const CommandItem = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn('relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-gray-100 dark:hover:bg-gray-800', className)}
      {...props}
    />
  ),
)
CommandItem.displayName = 'CommandItem'

function CommandShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ml-auto text-xs tracking-widest text-gray-500', className)} {...props} />
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
