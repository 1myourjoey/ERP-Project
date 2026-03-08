import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { GripVertical, X } from 'lucide-react'

import type { AnalyticsFieldMeta, AnalyticsValueSpec } from '../../lib/api/analytics'
import {
  getAnalyticsAggregateLabel,
  getAnalyticsCompactFieldLabel,
} from '../../lib/analytics/labels'
import type { AnalyticsCatalogPointerDragPayload } from './AnalyticsFieldCatalog'

interface AnalyticsBuilderZoneProps {
  zoneId: 'rows' | 'columns' | 'values' | 'selected_fields'
  title: string
  kind: 'dimension' | 'value' | 'any'
  items: string[] | AnalyticsValueSpec[]
  variant?: 'panel' | 'ribbon'
  fieldMap: Record<string, AnalyticsFieldMeta>
  onDropField: (fieldKey: string, targetIndex?: number) => void
  onRemove: (indexOrField: number | string) => void
  onMove: (from: number, to: number) => void
  onUpdateValue?: (index: number, patch: Partial<AnalyticsValueSpec>) => void
  externalDrag: AnalyticsCatalogPointerDragPayload | null
  onExternalHover: (zoneId: AnalyticsBuilderZoneProps['zoneId'], index: number | null) => void
}

type InternalDragState = {
  index: number
  active: boolean
  pointerId: number
  startX: number
  startY: number
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

type MarkerState = {
  index: number
  left: number
  top: number
}

export default function AnalyticsBuilderZone({
  zoneId,
  title,
  kind,
  items,
  variant = 'panel',
  fieldMap,
  onDropField,
  onRemove,
  onMove,
  onUpdateValue,
  externalDrag,
  onExternalHover,
}: AnalyticsBuilderZoneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])

  const [internalDrag, setInternalDrag] = useState<InternalDragState | null>(null)
  const [internalMarker, setInternalMarker] = useState<MarkerState | null>(null)
  const [externalMarker, setExternalMarker] = useState<MarkerState | null>(null)

  const normalizedItems = items as Array<string | AnalyticsValueSpec>
  const activeInternalDrag = internalDrag?.active ? internalDrag : null
  const dragItem = activeInternalDrag ? normalizedItems[activeInternalDrag.index] : null
  const dragValueSpec = dragItem && typeof dragItem !== 'string' ? dragItem : null
  const dragFieldKey = typeof dragItem === 'string' ? dragItem : dragItem?.key
  const dragField = dragFieldKey ? fieldMap[dragFieldKey] : null
  const displayMarker = activeInternalDrag ? internalMarker : externalMarker
  const isRibbon = variant === 'ribbon'

  const clearInternalDrag = () => {
    setInternalDrag(null)
    setInternalMarker(null)
  }

  const calculateMarker = (clientX: number, clientY: number): MarkerState | null => {
    const container = containerRef.current
    if (!container) return null
    const containerRect = container.getBoundingClientRect()
    const itemRects = normalizedItems
      .map((_, index) => itemRefs.current[index]?.getBoundingClientRect() ?? null)
      .filter((rect): rect is DOMRect => rect !== null)

    if (itemRects.length === 0) {
      return { index: 0, left: 12, top: 18 }
    }

    const candidates: Array<{ index: number; x: number; y: number }> = []
    const firstRect = itemRects[0]
    candidates.push({ index: 0, x: firstRect.left - 10, y: firstRect.top + firstRect.height / 2 })

    for (let index = 1; index < itemRects.length; index += 1) {
      const prev = itemRects[index - 1]
      const next = itemRects[index]
      const sameRow = Math.abs(prev.top - next.top) < Math.max(prev.height, next.height) / 2
      candidates.push({
        index,
        x: sameRow ? (prev.right + next.left) / 2 : next.left - 10,
        y: sameRow ? prev.top + prev.height / 2 : next.top + next.height / 2,
      })
    }

    const lastRect = itemRects[itemRects.length - 1]
    candidates.push({
      index: itemRects.length,
      x: lastRect.right + 10,
      y: lastRect.top + lastRect.height / 2,
    })

    const nearest = candidates.reduce((best, candidate) => {
      const bestDistance = Math.hypot(clientX - best.x, clientY - best.y)
      const nextDistance = Math.hypot(clientX - candidate.x, clientY - candidate.y)
      return nextDistance < bestDistance ? candidate : best
    })

    return {
      index: nearest.index,
      left: nearest.x - containerRect.left,
      top: nearest.y - containerRect.top,
    }
  }

  useEffect(() => {
    if (!internalDrag) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== internalDrag.pointerId) return
      const distance = Math.hypot(event.clientX - internalDrag.startX, event.clientY - internalDrag.startY)
      if (!internalDrag.active && distance < 6) return
      const nextMarker = calculateMarker(event.clientX, event.clientY)
      setInternalDrag((current) =>
        current
          ? {
              ...current,
              active: true,
              pointerX: event.clientX,
              pointerY: event.clientY,
            }
          : current,
      )
      setInternalMarker(nextMarker)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== internalDrag.pointerId) return
      if (!internalDrag.active) {
        clearInternalDrag()
        return
      }
      const dropIndex = calculateMarker(event.clientX, event.clientY)?.index ?? internalMarker?.index ?? internalDrag.index
      const normalizedTarget = internalDrag.index < dropIndex ? dropIndex - 1 : dropIndex
      if (normalizedTarget >= 0 && normalizedTarget !== internalDrag.index) {
        onMove(internalDrag.index, normalizedTarget)
      }
      clearInternalDrag()
    }

    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [internalDrag, internalMarker?.index, normalizedItems, onMove])

  useEffect(() => {
    if (!externalDrag) {
      setExternalMarker(null)
      onExternalHover(zoneId, null)
      return
    }

    const acceptsExternalField =
      kind === 'any' ||
      (kind === 'dimension' && externalDrag.kind === 'dimension') ||
      (kind === 'value' && externalDrag.kind === 'measure')

    if (!acceptsExternalField) {
      setExternalMarker(null)
      onExternalHover(zoneId, null)
      return
    }

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const within =
      externalDrag.pointerX >= rect.left - 12 &&
      externalDrag.pointerX <= rect.right + 12 &&
      externalDrag.pointerY >= rect.top - 12 &&
      externalDrag.pointerY <= rect.bottom + 12

    if (!within) {
      setExternalMarker(null)
      onExternalHover(zoneId, null)
      return
    }

    const nextMarker = calculateMarker(externalDrag.pointerX, externalDrag.pointerY)
    setExternalMarker(nextMarker)
    onExternalHover(zoneId, nextMarker?.index ?? null)
  }, [externalDrag, kind, normalizedItems.length, onExternalHover, zoneId])

  const readExternalField = (event: DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/x-analytics-field')
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { key: string; kind: 'dimension' | 'measure' }
      if (kind === 'dimension' && parsed.kind !== 'dimension') return null
      if (kind === 'value' && parsed.kind !== 'measure') return null
      return parsed
    } catch {
      return null
    }
  }

  const handleHtmlDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const parsed = readExternalField(event)
    if (!parsed) return
    const targetIndex = calculateMarker(event.clientX, event.clientY)?.index ?? normalizedItems.length
    onDropField(parsed.key, targetIndex)
    setExternalMarker(null)
    onExternalHover(zoneId, null)
  }

  const preventNestedDrag = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const preventNestedPointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const helperText = useMemo(() => {
    if (activeInternalDrag || externalDrag) return '원하는 위치로 끌어 놓으세요.'
    if (displayMarker) return '표시선 위치에 삽입합니다.'
    if (isRibbon) return ''
    return `${normalizedItems.length}개 · 직접 끌어서 순서 변경`
  }, [activeInternalDrag, displayMarker, externalDrag, isRibbon, normalizedItems.length])

  return (
    <div
      ref={containerRef}
      onDragOver={(event) => {
        event.preventDefault()
        const parsed = readExternalField(event)
        if (!parsed) return
        setExternalMarker(calculateMarker(event.clientX, event.clientY))
      }}
      onDragLeave={() => {
        if (!activeInternalDrag && !externalDrag) {
          setExternalMarker(null)
          onExternalHover(zoneId, null)
        }
      }}
      onDrop={handleHtmlDrop}
      className={`analytics-drop-zone relative ${
        isRibbon
          ? 'min-w-0 rounded-2xl border border-[#d8e5fb] bg-white px-3 py-2 shadow-sm'
          : 'rounded-2xl border border-dashed border-[#bfcff0] bg-[#f7f9ff] p-3'
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${isRibbon ? 'mb-1.5' : 'mb-2'}`}>
        <h4 className="text-xs font-bold text-[#1a3660]">{title}</h4>
        {helperText ? (
          <span className="truncate text-[11px] text-[#64748b]">{helperText}</span>
        ) : (
          <span className="rounded-full border border-[#e7efff] bg-[#f8fbff] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
            {normalizedItems.length}개
          </span>
        )}
      </div>

      {displayMarker && (
        <div
          className="pointer-events-none absolute z-10"
          style={{ left: displayMarker.left, top: displayMarker.top, transform: 'translate(-50%, -50%)' }}
          aria-hidden="true"
        >
          <div className="relative flex h-8 w-3 items-center justify-center">
            <span className="block h-7 w-1.5 rounded-full bg-[#558ef8] shadow-sm" />
            <span className="absolute h-2.5 w-2.5 rounded-full bg-[#558ef8] shadow-sm" />
          </div>
        </div>
      )}

      {activeInternalDrag && dragField && (
        <div
          className="pointer-events-none fixed z-20 inline-flex h-9 items-center gap-1 rounded-full border border-[#558ef8] bg-white px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: activeInternalDrag.pointerX - activeInternalDrag.offsetX,
            top: activeInternalDrag.pointerY - activeInternalDrag.offsetY,
            width: activeInternalDrag.width,
            height: activeInternalDrag.height,
          }}
          aria-hidden="true"
        >
          <span className="text-[#94a3b8]">
            <GripVertical size={12} />
          </span>
          <span className="font-semibold text-[#0f1f3d]">{dragField.label}</span>
          {kind === 'value' && dragValueSpec && (
            <span className="rounded-full border border-[#cfe0ff] bg-[#eef4ff] px-2 py-1 text-[11px] font-semibold text-[#1a3660]">
              {getAnalyticsAggregateLabel(dragValueSpec.aggregate ?? dragField.default_aggregate ?? 'sum')}
            </span>
          )}
        </div>
      )}

      <div
        className={
          isRibbon
            ? 'flex min-h-10 min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden pb-0.5 pr-0.5'
            : 'flex flex-wrap items-center gap-2'
        }
      >
        {normalizedItems.length === 0 && (
          <span className="shrink-0 whitespace-nowrap text-xs text-[#94a3b8]">필드를 드래그하거나 클릭해 추가</span>
        )}
        {normalizedItems.map((item, index) => {
          const key = typeof item === 'string' ? item : item.key
          const field = fieldMap[key]
          if (!field) return null
          const compactLabel = getAnalyticsCompactFieldLabel(key, fieldMap)
          const labelMaxWidthClass = kind === 'value' ? 'max-w-[118px]' : isRibbon ? 'max-w-[156px]' : 'max-w-[180px]'

          return (
            <div
              key={`${key}-${index}`}
              ref={(node) => {
                itemRefs.current[index] = node
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                const rect = event.currentTarget.getBoundingClientRect()
                setInternalDrag({
                  index,
                  active: false,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  offsetX: event.clientX - rect.left,
                  offsetY: event.clientY - rect.top,
                  width: rect.width,
                  height: rect.height,
                })
                setInternalMarker(null)
              }}
              title={field.label}
              className={`inline-flex ${isRibbon ? 'h-9 shrink-0' : 'min-h-10'} touch-none select-none items-center gap-1.5 rounded-2xl border bg-white px-2.5 py-1.5 text-xs shadow-sm transition-colors ${
                activeInternalDrag?.index === index ? 'border-[#558ef8] bg-[#eef4ff] opacity-25' : 'border-[#d8e5fb]'
              } cursor-grab active:cursor-grabbing`}
            >
              <span className="text-[#94a3b8]" aria-hidden="true">
                <GripVertical size={12} />
              </span>
              <span className={`${labelMaxWidthClass} truncate whitespace-nowrap font-semibold text-[#0f1f3d]`}>
                {compactLabel}
              </span>
              {kind === 'value' && typeof item !== 'string' && onUpdateValue && (
                <div className="relative shrink-0">
                  <select
                    draggable={false}
                    onMouseDown={preventNestedDrag}
                    onPointerDown={preventNestedPointer}
                    title={getAnalyticsAggregateLabel(item.aggregate ?? field.default_aggregate ?? 'sum')}
                    value={item.aggregate ?? field.default_aggregate ?? 'sum'}
                    onChange={(event) => onUpdateValue(index, { aggregate: event.target.value as AnalyticsValueSpec['aggregate'] })}
                    className="h-7 min-w-[84px] max-w-[84px] appearance-none rounded-full border border-[#cfe0ff] bg-[#eef4ff] pl-2.5 pr-7 text-[11px] font-semibold leading-none text-[#1a3660] outline-none transition hover:border-[#558ef8] focus:border-[#558ef8] focus:ring-2 focus:ring-[#d8e5fb]"
                  >
                    {(field.allowed_aggregates ?? []).map((aggregate) => (
                      <option key={aggregate} value={aggregate}>
                        {getAnalyticsAggregateLabel(aggregate)}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[#558ef8]">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              )}
              <button
                type="button"
                draggable={false}
                onMouseDown={preventNestedDrag}
                onPointerDown={preventNestedPointer}
                onClick={() => onRemove(kind === 'value' ? index : key)}
                className="rounded-full p-1 text-[#94a3b8] transition hover:bg-[#f6ecec] hover:text-[#6d3e44]"
                aria-label="제거"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
