import * as React from 'react'

import { cn } from '@/lib/utils'

type TabsContextValue = {
  value: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error('Tabs components must be used within <Tabs>.')
  return context
}

interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}

function Tabs({ value: valueProp, defaultValue = '', onValueChange, className, children }: TabsProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const controlled = typeof valueProp === 'string'
  const value = controlled ? valueProp : uncontrolled

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (!controlled) setUncontrolled(nextValue)
      onValueChange?.(nextValue)
    },
    [controlled, onValueChange],
  )

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex h-9 items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800', className)}
      {...props}
    />
  )
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

function TabsTrigger({ className, value, ...props }: TabsTriggerProps) {
  const { value: selected, setValue } = useTabsContext()
  const active = selected === value
  return (
    <button
      role="tab"
      aria-selected={active}
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300',
        className,
      )}
      onClick={() => setValue(value)}
      {...props}
    />
  )
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

function TabsContent({ className, value, ...props }: TabsContentProps) {
  const { value: selected } = useTabsContext()
  if (selected !== value) return null
  return <div role="tabpanel" className={cn('mt-2', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
