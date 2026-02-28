import * as React from 'react'

import { cn } from '@/lib/utils'

function Breadcrumb({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <nav aria-label="breadcrumb" className={cn(className)} {...props} />
}

function BreadcrumbList({ className, ...props }: React.OlHTMLAttributes<HTMLOListElement>) {
  return <ol className={cn('flex items-center gap-1 text-sm text-gray-500', className)} {...props} />
}

function BreadcrumbItem({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn('inline-flex items-center gap-1', className)} {...props} />
}

function BreadcrumbLink({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn('hover:text-gray-900 dark:hover:text-gray-100', className)} {...props} />
}

function BreadcrumbPage({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('font-medium text-gray-900 dark:text-gray-100', className)} {...props} />
}

function BreadcrumbSeparator({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span role="presentation" aria-hidden="true" className={cn('px-1 text-gray-400', className)} {...props}>
      /
    </span>
  )
}

function BreadcrumbEllipsis({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span role="presentation" aria-hidden="true" className={cn('px-1 text-gray-400', className)} {...props}>
      ...
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
}
