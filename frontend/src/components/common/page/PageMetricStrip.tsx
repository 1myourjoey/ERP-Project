interface MetricItem {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'info' | 'warning' | 'danger' | 'success'
  onClick?: () => void
  interactive?: boolean
  ariaLabel?: string
}

interface PageMetricStripProps {
  items: MetricItem[]
  columns?: 2 | 3 | 4 | 5 | 6
  className?: string
}

const COLUMN_CLASS: Record<NonNullable<PageMetricStripProps['columns']>, string> = {
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
}

export default function PageMetricStrip({
  items,
  columns = 4,
  className = '',
}: PageMetricStripProps) {
  return (
    <section className={`page-metric-strip ${COLUMN_CLASS[columns]} ${className}`.trim()}>
      {items.map((item) => (
        <button
          key={`${item.label}-${item.value}`}
          type="button"
          onClick={item.onClick}
          aria-label={item.ariaLabel || item.label}
          disabled={!item.onClick}
          className={`metric-tile text-left transition duration-200 ${
            item.tone ? `metric-tile-${item.tone}` : ''
          } ${
            item.onClick || item.interactive
              ? 'cursor-pointer hover:-translate-y-[2px] hover:border-[#aac6fa] hover:shadow-[0_14px_32px_rgba(15,31,61,0.08)]'
              : 'cursor-default'
          }`.trim()}
        >
          <p className="metric-tile-label">{item.label}</p>
          <p className="metric-tile-value font-data">{item.value}</p>
          {item.hint ? <p className="metric-tile-hint">{item.hint}</p> : null}
        </button>
      ))}
    </section>
  )
}
