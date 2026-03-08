import type { AnalyticsStarterView } from '../../lib/api/analytics'
import { getAnalyticsSubjectLabel } from '../../lib/analytics/labels'

interface StarterViewGalleryProps {
  views: AnalyticsStarterView[]
  subjects: Array<{ key: string; label: string }>
  onSelect: (view: AnalyticsStarterView) => void
}

export default function StarterViewGallery({ views, subjects, onSelect }: StarterViewGalleryProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {views.map((view) => (
        <button
          key={view.key}
          type="button"
          onClick={() => onSelect(view)}
          className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-4 text-left shadow-sm transition hover:border-[#558ef8] hover:bg-[#f5f9ff]"
        >
          <p className="text-sm font-semibold text-[#0f1f3d]">{view.label}</p>
          <p className="mt-1 text-xs text-[#64748b]">{view.description}</p>
          <p className="mt-3 text-[11px] font-semibold text-[#1a3660]">
            {getAnalyticsSubjectLabel(view.subject_key, subjects)}
          </p>
        </button>
      ))}
    </div>
  )
}
