import type { ReactNode } from 'react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface DrawerOverlayProps {
  open: boolean
  title?: string
  widthClassName?: string
  onClose: () => void
  children: ReactNode
}

export default function DrawerOverlay({
  open,
  title,
  widthClassName = 'w-full max-w-2xl',
  onClose,
  children,
}: DrawerOverlayProps) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent side="right" className={`${widthClassName} p-0`}>
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <SheetTitle>{title || 'Detail'}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
