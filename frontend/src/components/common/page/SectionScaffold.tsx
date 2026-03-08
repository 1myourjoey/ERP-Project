import type { ReactNode } from 'react'

interface SectionScaffoldProps {
  title?: string
  description?: string
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

export default function SectionScaffold({
  title,
  description,
  actions,
  className = '',
  bodyClassName = '',
  children,
}: SectionScaffoldProps) {
  return (
    <section className={`section-scaffold ${className}`.trim()}>
      {(title || description || actions) ? (
        <div className="section-scaffold-header">
          <div className="min-w-0">
            {title ? <h3 className="section-scaffold-title">{title}</h3> : null}
            {description ? <p className="section-scaffold-description">{description}</p> : null}
          </div>
          {actions ? <div className="section-scaffold-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`section-scaffold-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  )
}
