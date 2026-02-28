import * as React from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const context = React.useContext(DialogContext)
  if (!context) {
    throw new Error('Dialog components must be used within <Dialog>.')
  }
  return context
}

interface DialogProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open: openProp, defaultOpen = false, onOpenChange, children }: DialogProps) {
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
  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>
}

interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: React.ReactNode
}

function DialogTrigger({ asChild, children, onClick, ...props }: DialogTriggerProps) {
  const { setOpen } = useDialogContext()
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

function DialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { open, setOpen } = useDialogContext()
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
DialogOverlay.displayName = 'DialogOverlay'

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useDialogContext()
    if (!open) return null
    return (
      <DialogPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900',
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
      </DialogPortal>
    )
  },
)
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex flex-col space-y-1', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex items-center justify-end gap-2', className)} {...props} />
}

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h2 ref={ref} className={cn('text-base font-semibold', className)} {...props} />,
)
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-gray-500 dark:text-gray-400', className)} {...props} />
  ),
)
DialogDescription.displayName = 'DialogDescription'

interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: React.ReactNode
}

function DialogClose({ asChild, children, onClick, ...props }: DialogCloseProps) {
  const { setOpen } = useDialogContext()
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
