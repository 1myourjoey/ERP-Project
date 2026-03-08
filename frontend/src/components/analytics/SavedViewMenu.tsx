import { Save, Star, Trash2 } from 'lucide-react'

import type { AnalyticsSavedView } from '../../lib/api/analytics'

interface SavedViewMenuProps {
  views: AnalyticsSavedView[]
  activeViewId: number | null
  onSelect: (viewId: number | null) => void
  onSave: () => void
  onSaveAs: () => void
  onDelete: (viewId: number) => void
  onToggleFavorite: (view: AnalyticsSavedView) => void
}

export default function SavedViewMenu({
  views,
  activeViewId,
  onSelect,
  onSave,
  onSaveAs,
  onDelete,
  onToggleFavorite,
}: SavedViewMenuProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={activeViewId ?? ''}
        onChange={(event) => onSelect(event.target.value ? Number(event.target.value) : null)}
        className="form-input-sm min-w-[220px]"
      >
        <option value="">저장된 분석 선택</option>
        {views.map((view) => (
          <option key={view.id} value={view.id}>{view.is_favorite ? '★ ' : ''}{view.name}</option>
        ))}
      </select>
      <button type="button" onClick={onSave} className="secondary-btn btn-sm inline-flex items-center gap-1">
        <Save size={14} /> 저장
      </button>
      <button type="button" onClick={onSaveAs} className="ghost-btn btn-sm">다른 이름으로 저장</button>
      {activeViewId && (
        <>
          <button
            type="button"
            onClick={() => {
              const active = views.find((view) => view.id === activeViewId)
              if (active) onToggleFavorite(active)
            }}
            className="ghost-btn btn-sm inline-flex items-center gap-1"
          >
            <Star size={14} /> 즐겨찾기
          </button>
          <button type="button" onClick={() => onDelete(activeViewId)} className="ghost-btn btn-sm inline-flex items-center gap-1 text-[#6d3e44]">
            <Trash2 size={14} /> 삭제
          </button>
        </>
      )}
    </div>
  )
}
