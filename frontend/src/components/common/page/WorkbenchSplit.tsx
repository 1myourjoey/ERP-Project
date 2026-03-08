import type { ReactNode } from 'react'

interface WorkbenchSplitProps {
  primary: ReactNode
  secondary: ReactNode
  className?: string
  secondarySticky?: boolean
}

export default function WorkbenchSplit({
  primary,
  secondary,
  className = '',
  secondarySticky = false,
}: WorkbenchSplitProps) {
  return (
    <div className={`workbench-split ${className}`.trim()}>
      <div className="min-w-0">{primary}</div>
      <div className={secondarySticky ? 'workbench-secondary-sticky' : ''}>{secondary}</div>
    </div>
  )
}
