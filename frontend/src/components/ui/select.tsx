import * as React from 'react'

import { cn } from '@/lib/utils'

type SelectItemNode = {
  value: string
  label: React.ReactNode
}

function collectSelectItems(children: React.ReactNode, output: SelectItemNode[] = []): SelectItemNode[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const displayName = (child.type as { displayName?: string }).displayName
    if (displayName === 'SelectItem') {
      const value = String((child.props as { value: string }).value)
      output.push({ value, label: (child.props as { children: React.ReactNode }).children })
      return
    }
    collectSelectItems((child.props as { children?: React.ReactNode }).children, output)
  })
  return output
}

interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}

function Select({ value, defaultValue, onValueChange, children, disabled, className }: SelectProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? '')
  const currentValue = value ?? uncontrolled
  const items = React.useMemo(() => collectSelectItems(children), [children])

  return (
    <select
      value={currentValue}
      disabled={disabled}
      onChange={(event) => {
        if (value === undefined) setUncontrolled(event.target.value)
        onValueChange?.(event.target.value)
      }}
      className={cn(
        'flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
        className,
      )}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  )
}

function SelectTrigger({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  return <>{placeholder}</>
}

function SelectContent({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function SelectItem({ children }: { value: string; children: React.ReactNode }) {
  return <>{children}</>
}
SelectItem.displayName = 'SelectItem'

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
