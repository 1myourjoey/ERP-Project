import * as React from 'react'

import { cn } from '@/lib/utils'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        className,
      )}
      onChange={(event) => {
        onChange?.(event)
        onCheckedChange?.(event.target.checked)
      }}
      {...props}
    />
  ),
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
