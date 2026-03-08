import type { AnalyticsExecutivePack } from '../../../lib/api/analytics'

interface ExecutivePackTabsProps {
  packs: AnalyticsExecutivePack[]
  activePackKey: string
  onChange: (packKey: string) => void
}

export default function ExecutivePackTabs({
  packs,
  activePackKey,
  onChange,
}: ExecutivePackTabsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-[#d8e5fb] bg-white p-1 shadow-sm">
      {packs.map((pack) => (
        <button
          key={pack.key}
          type="button"
          onClick={() => onChange(pack.key)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activePackKey === pack.key
              ? 'bg-[#eef4ff] text-[#1a3660]'
              : 'text-[#64748b] hover:bg-[#f5f9ff] hover:text-[#1a3660]'
          }`}
        >
          {pack.label}
        </button>
      ))}
    </div>
  )
}
