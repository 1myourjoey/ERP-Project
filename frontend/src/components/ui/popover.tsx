import * as React from 'react'

function Popover({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function PopoverTrigger({
  asChild,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; children: React.ReactNode }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement)
  }
  return (
    <button type="button" {...props}>
      {children}
    </button>
  )
}

function PopoverContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props}>
      {children}
    </div>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
