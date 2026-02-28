import * as React from 'react'

import { cn } from '@/lib/utils'

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => (
    <label className={cn('inline-flex cursor-pointer items-center', className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange?.(event)
          onCheckedChange?.(event.target.checked)
        }}
        className="peer sr-only"
        {...props}
      />
      <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">
        <span className="ml-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  ),
)
Switch.displayName = 'Switch'

export { Switch }
