import * as React from 'react'

import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'xs' | 'lg' | 'icon'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: 'bg-blue-600 text-white hover:bg-blue-700',
  destructive: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
  link: 'text-blue-600 underline-offset-4 hover:underline',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: 'h-[38px] px-4 py-2 text-sm',
  sm: 'h-8 px-3 py-1.5 text-xs',
  xs: 'h-7 rounded-md px-2 py-1 text-xs',
  lg: 'h-11 px-8 text-base',
  icon: 'h-8 w-8 p-0',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

export const buttonVariants = ({
  className,
  variant = 'default',
  size = 'default',
}: {
  className?: string
  variant?: ButtonVariant
  size?: ButtonSize
}) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-60',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    className,
  )

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', asChild = false, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>
      return React.cloneElement(child, {
        ...props,
        className: buttonVariants({ variant, size, className: cn(child.props.className, className) }),
      })
    }

    return (
      <button
        ref={ref}
        type={type}
        className={buttonVariants({ variant, size, className })}
        {...props}
      >
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

export { Button }
