import * as React from 'react'

import { cn } from '@/lib/utils'

function NavigationMenu({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <nav className={cn('flex items-center gap-2', className)} {...props} />
}

function NavigationMenuList({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('flex items-center gap-2', className)} {...props} />
}

function NavigationMenuItem({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn(className)} {...props} />
}

function NavigationMenuLink({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn('text-sm text-gray-700 hover:text-blue-600 dark:text-gray-200', className)} {...props} />
}

function NavigationMenuTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn('rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800', className)}
      {...props}
    />
  )
}

function NavigationMenuContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-gray-200 bg-white p-2 shadow-sm', className)} {...props} />
}

function navigationMenuTriggerStyle() {
  return 'rounded-md px-3 py-2 text-sm'
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
}
