import type { ReactNode } from 'react'

interface DataFilterBarProps {
  title?: string
  description?: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export default function DataFilterBar({
  title,
  description,
  actions,
  className = '',
  children,
}: DataFilterBarProps) {
  return (
    <section className={`card-base space-y-4 ${className}`}>
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold text-gray-800">{title}</h3>}
            {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{children}</div>
    </section>
  )
}
