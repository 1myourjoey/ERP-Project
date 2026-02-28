import * as React from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

type SheetContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function useSheetContext() {
  const context = React.useContext(SheetContext)
  if (!context) {
    throw new Error('Sheet components must be used within <Sheet>.')
  }
  return context
}

interface SheetProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Sheet({ open: openProp, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const controlled = typeof openProp === 'boolean'
  const open = controlled ? openProp : uncontrolledOpen
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!controlled) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [controlled, onOpenChange],
  )
  return <SheetContext.Provider value={{ open, setOpen }}>{children}</SheetContext.Provider>
}

function SheetTrigger({
  asChild,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; children: React.ReactNode }) {
  const { setOpen } = useSheetContext()
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: React.MouseEventHandler }>, {
      onClick: (event: React.MouseEvent) => {
        ;(children.props as { onClick?: React.MouseEventHandler }).onClick?.(event)
        onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>)
        setOpen(true)
      },
    })
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event)
        setOpen(true)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

function SheetPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const SheetOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { open, setOpen } = useSheetContext()
    if (!open) return null
    return (
      <div
        ref={ref}
        className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]', className)}
        onClick={() => setOpen(false)}
        {...props}
      />
    )
  },
)
SheetOverlay.displayName = 'SheetOverlay'

type SheetSide = 'top' | 'right' | 'bottom' | 'left'

const SIDE_CLASS: Record<SheetSide, string> = {
  top: 'inset-x-0 top-0 border-b',
  right: 'inset-y-0 right-0 h-full border-l',
  bottom: 'inset-x-0 bottom-0 border-t',
  left: 'inset-y-0 left-0 h-full border-r',
}

const WIDTH_CLASS: Record<SheetSide, string> = {
  top: 'w-full',
  right: 'w-full max-w-xl',
  bottom: 'w-full',
  left: 'w-full max-w-xl',
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: SheetSide
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = 'right', className, children, ...props }, ref) => {
    const { open, setOpen } = useSheetContext()
    if (!open) return null
    return (
      <SheetPortal>
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div
            ref={ref}
            className={cn(
              'absolute bg-white p-5 shadow-2xl dark:bg-gray-900 dark:text-gray-100',
              SIDE_CLASS[side],
              WIDTH_CLASS[side],
              className,
            )}
            onClick={(event) => event.stopPropagation()}
            {...props}
          >
            {children}
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </SheetPortal>
    )
  },
)
SheetContent.displayName = 'SheetContent'

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex flex-col space-y-1', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex items-center justify-end gap-2', className)} {...props} />
}

const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h2 ref={ref} className={cn('text-base font-semibold', className)} {...props} />,
)
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-gray-500 dark:text-gray-400', className)} {...props} />
  ),
)
SheetDescription.displayName = 'SheetDescription'

function SheetClose({
  asChild,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; children: React.ReactNode }) {
  const { setOpen } = useSheetContext()
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: React.MouseEventHandler }>, {
      onClick: (event: React.MouseEvent) => {
        ;(children.props as { onClick?: React.MouseEventHandler }).onClick?.(event)
        onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>)
        setOpen(false)
      },
    })
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event)
        setOpen(false)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
