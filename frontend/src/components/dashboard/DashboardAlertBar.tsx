import type { DashboardHealthAlert } from '../../lib/api'

interface DashboardAlertBarProps {
  alerts: DashboardHealthAlert[]
  onNavigate: (path: string) => void
}

export default function DashboardAlertBar({ alerts, onNavigate }: DashboardAlertBarProps) {
  if (!alerts.length) return null

  return (
    <section className="card-base flex min-h-[36px] items-center gap-2 border-[#bfa5a7] bg-[#f5f9ff] px-3 py-2 text-xs text-[#0f1f3d]">
      <span className="font-semibold text-[#1a3660]">긴급 알림</span>
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {alerts.slice(0, 4).map((alert) => (
          <button
            key={`${alert.type}-${alert.domain}`}
            type="button"
            onClick={() => onNavigate(alert.action_url)}
            className="rounded border border-[#d8e5fb] bg-white px-2 py-0.5 hover:bg-[#f5f9ff]"
          >
            {alert.message}
          </button>
        ))}
      </div>
    </section>
  )
}
