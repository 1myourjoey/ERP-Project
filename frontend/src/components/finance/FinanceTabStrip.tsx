interface FinanceTabItem<T extends string> {
  key: T
  label: string
  countLabel?: string
}

interface FinanceTabStripProps<T extends string> {
  tabs: FinanceTabItem<T>[]
  activeTab: T
  onChange: (tab: T) => void
}

export default function FinanceTabStrip<T extends string>({
  tabs,
  activeTab,
  onChange,
}: FinanceTabStripProps<T>) {
  return (
    <div className="segmented-control finance-tab-strip">
      {tabs.map((tab) => {
        const active = tab.key === activeTab
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`tab-btn ${active ? 'active' : ''}`}
          >
            <span>{tab.label}</span>
            {tab.countLabel ? <span className="finance-tab-count">{tab.countLabel}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
