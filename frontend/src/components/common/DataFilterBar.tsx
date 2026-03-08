import type { ReactNode } from 'react'

interface DataFilterBarProps {
  title?: string
  description?: string
  actions?: ReactNode
  className?: string
  variant?: 'default' | 'compact'
  layout?: 'grid' | 'inline'
  summarySlot?: ReactNode
  children: ReactNode
}

export default function DataFilterBar({
  title,
  description,
  actions,
  className = '',
  variant = 'default',
  layout = 'grid',
  summarySlot,
  children,
}: DataFilterBarProps) {
  return (
    <section className={`page-control-strip ${variant === 'compact' ? 'page-control-strip-compact' : ''} ${className}`.trim()}>
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold text-[#0f1f3d]">{title}</h3>}
            {description && <p className="mt-1 text-xs text-[#64748b]">{description}</p>}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {summarySlot ? <div>{summarySlot}</div> : null}
      <div className={layout === 'inline' ? 'flex flex-wrap items-end gap-2.5' : 'grid grid-cols-1 gap-3 md:grid-cols-3'}>
        {children}
      </div>
    </section>
  )
}

