import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}

export default function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-header-copy">
        <div className="min-w-0">
          <h2 className="page-title">{title}</h2>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {meta ? <div className="page-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  )
}
