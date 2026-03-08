interface ExecutiveSurfaceTabsProps {
  value: 'executive' | 'studio'
  onChange: (next: 'executive' | 'studio') => void
}

export default function ExecutiveSurfaceTabs({ value, onChange }: ExecutiveSurfaceTabsProps) {
  return (
    <div className="inline-flex items-center rounded-xl border border-[#d8e5fb] bg-white p-1 shadow-sm">
      {[
        { key: 'executive' as const, label: '임원 뷰' },
        { key: 'studio' as const, label: '직접 분석' },
      ].map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            value === item.key
              ? 'bg-[#0f1f3d] text-white shadow-sm'
              : 'text-[#64748b] hover:bg-[#f5f9ff] hover:text-[#1a3660]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
