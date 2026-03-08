interface ProvisionalStepRailItem {
  id: string
  label: string
  description: string
  tone?: 'default' | 'info' | 'warning' | 'success'
}

interface ProvisionalStepRailProps {
  items: ProvisionalStepRailItem[]
}

export default function ProvisionalStepRail({ items }: ProvisionalStepRailProps) {
  return (
    <div className="finance-step-rail">
      {items.map((item, index) => (
        <div key={item.id} className={`finance-step-rail-item finance-step-rail-${item.tone || 'default'}`}>
          <div className="finance-step-index">{index + 1}</div>
          <div className="min-w-0">
            <p className="finance-step-label">{item.label}</p>
            <p className="finance-step-description">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
