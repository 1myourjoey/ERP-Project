import * as React from 'react'

import { cn } from '@/lib/utils'

type BadgeVariant =
  | 'default'
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'purple'
  | 'indigo'
  | 'emerald'
  | 'gray'

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  gray: 'bg-gray-100 text-gray-700',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  )
}
