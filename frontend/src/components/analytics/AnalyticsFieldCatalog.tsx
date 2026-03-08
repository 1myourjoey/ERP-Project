import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AnalyticsFieldMeta, AnalyticsSubjectMeta } from '../../lib/api/analytics'

export interface AnalyticsCatalogPointerDragPayload {
  key: string
  kind: AnalyticsFieldMeta['kind']
  label: string
  defaultAggregate?: AnalyticsFieldMeta['default_aggregate'] | null
  pointerId: number
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

interface AnalyticsFieldCatalogProps {
  subject: AnalyticsSubjectMeta | null
  usedKeys: Set<string>
  onAddDimension: (fieldKey: string) => void
  onAddMeasure: (fieldKey: string) => void
  onStartDrag: (payload: AnalyticsCatalogPointerDragPayload) => void
  variant?: 'panel' | 'drawer'
}

type PendingCatalogDrag = AnalyticsCatalogPointerDragPayload & {
  startX: number
  startY: number
}

function groupFields(fields: AnalyticsFieldMeta[]) {
  const groups = new Map<string, AnalyticsFieldMeta[]>()
  fields.forEach((field) => {
    const current = groups.get(field.group) ?? []
    current.push(field)
    groups.set(field.group, current)
  })
  return Array.from(groups.entries())
}

export default function AnalyticsFieldCatalog({
  subject,
  usedKeys,
  onAddDimension,
  onAddMeasure,
  onStartDrag,
  variant = 'panel',
}: AnalyticsFieldCatalogProps) {
  const [query, setQuery] = useState('')
  const [pendingDrag, setPendingDrag] = useState<PendingCatalogDrag | null>(null)
  const suppressClickKeyRef = useRef<string | null>(null)

  const grouped = useMemo(() => {
    if (!subject) return []
    const lowered = query.trim().toLowerCase()
    const filtered = subject.fields.filter((field) => {
      if (!lowered) return true
      return field.label.toLowerCase().includes(lowered) || field.key.toLowerCase().includes(lowered)
    })
    return groupFields(filtered)
  }, [query, subject])

  useEffect(() => {
    if (!pendingDrag) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pendingDrag.pointerId) return
      const distance = Math.hypot(event.clientX - pendingDrag.startX, event.clientY - pendingDrag.startY)
      if (distance < 6) return
      suppressClickKeyRef.current = pendingDrag.key
      onStartDrag({
        key: pendingDrag.key,
        kind: pendingDrag.kind,
        label: pendingDrag.label,
        defaultAggregate: pendingDrag.defaultAggregate,
        pointerId: pendingDrag.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        offsetX: pendingDrag.offsetX,
        offsetY: pendingDrag.offsetY,
        width: pendingDrag.width,
        height: pendingDrag.height,
      })
      setPendingDrag(null)
    }

    const clearPendingDrag = (event: PointerEvent) => {
      if (event.pointerId !== pendingDrag.pointerId) return
      setPendingDrag(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', clearPendingDrag)
    window.addEventListener('pointercancel', clearPendingDrag)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', clearPendingDrag)
      window.removeEventListener('pointercancel', clearPendingDrag)
    }
  }, [onStartDrag, pendingDrag])

  return (
    <div className={`rounded-2xl border border-[#d8e5fb] ${variant === 'drawer' ? 'bg-[#fbfdff] shadow-none' : 'bg-white shadow-sm'}`}>
      <div className="border-b border-[#e7efff] px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-2">
          <Search size={14} className="text-[#64748b]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="필드 검색"
            className="w-full bg-transparent text-sm text-[#0f1f3d] outline-none"
          />
        </div>
      </div>

      <div className={`${variant === 'drawer' ? 'max-h-[calc(100vh-180px)]' : 'max-h-[680px]'} overflow-auto px-3 py-3`}>
        {!subject ? (
          <p className="text-sm text-[#64748b]">분석 기준을 먼저 선택하세요.</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-[#64748b]">일치하는 필드가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([group, fields]) => (
              <section key={group} className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748b]">{group}</h4>
                <div className="space-y-1.5">
                  {fields.map((field) => {
                    const alreadyUsed = usedKeys.has(field.key)
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          const rect = event.currentTarget.getBoundingClientRect()
                          setPendingDrag({
                            key: field.key,
                            kind: field.kind,
                            label: field.label,
                            defaultAggregate: field.default_aggregate ?? null,
                            pointerId: event.pointerId,
                            pointerX: event.clientX,
                            pointerY: event.clientY,
                            startX: event.clientX,
                            startY: event.clientY,
                            offsetX: event.clientX - rect.left,
                            offsetY: event.clientY - rect.top,
                            width: rect.width,
                            height: rect.height,
                          })
                        }}
                        onClick={() => {
                          if (suppressClickKeyRef.current === field.key) {
                            suppressClickKeyRef.current = null
                            return
                          }
                          field.kind === 'measure' ? onAddMeasure(field.key) : onAddDimension(field.key)
                        }}
                        className={`w-full touch-none rounded-xl border px-3 py-2 text-left transition ${alreadyUsed ? 'border-[#d8e5fb] bg-[#f7f9ff] text-[#94a3b8]' : 'border-[#e4e7ee] bg-white text-[#0f1f3d] hover:border-[#558ef8] hover:bg-[#f5f9ff]'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{field.label}</p>
                            <p className="mt-0.5 text-[11px] text-[#64748b]">{field.key}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${field.kind === 'measure' ? 'bg-[#e7efff] text-[#1a3660]' : 'bg-[#f3f5f9] text-[#64748b]'}`}>
                            {field.kind === 'measure' ? '값' : '차원'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
