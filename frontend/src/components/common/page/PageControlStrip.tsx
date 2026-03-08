import type { ReactNode } from 'react'

interface PageControlStripProps {
  children: ReactNode
  className?: string
  compact?: boolean
}

export default function PageControlStrip({
  children,
  className = '',
  compact = false,
}: PageControlStripProps) {
  return (
    <section className={`page-control-strip ${compact ? 'page-control-strip-compact' : ''} ${className}`.trim()}>
      {children}
    </section>
  )
}
