import { useEffect, useMemo, useReducer, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import AnalyticsActiveSummaryBar from '../components/analytics/AnalyticsActiveSummaryBar'
import AnalyticsBuilderZone from '../components/analytics/AnalyticsBuilderZone'
import AnalyticsDetailTable from '../components/analytics/AnalyticsDetailTable'
import AnalyticsFieldCatalog, {
  type AnalyticsCatalogPointerDragPayload,
} from '../components/analytics/AnalyticsFieldCatalog'
import AnalyticsFilterEditor from '../components/analytics/AnalyticsFilterEditor'
import AnalyticsInspector from '../components/analytics/AnalyticsInspector'
import AnalyticsSideDrawer from '../components/analytics/AnalyticsSideDrawer'
import AnalyticsSubjectPicker from '../components/analytics/AnalyticsSubjectPicker'
import PivotMatrixTable from '../components/analytics/PivotMatrixTable'
import SavedViewMenu from '../components/analytics/SavedViewMenu'
import StarterViewGallery from '../components/analytics/StarterViewGallery'
import ExecutiveSurface from '../components/analytics/executive/ExecutiveSurface'
import ExecutiveSurfaceTabs from '../components/analytics/executive/ExecutiveSurfaceTabs'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import { useToast } from '../contexts/ToastContext'
import {
  type AnalyticsExecutiveCard,
  createAnalyticsView,
  deleteAnalyticsView,
  exportAnalyticsXlsx,
  fetchAnalyticsCatalog,
  fetchAnalyticsViews,
  runAnalyticsBatchQuery,
  runAnalyticsQuery,
  updateAnalyticsView,
  type AnalyticsFieldMeta,
  type AnalyticsQueryRequest,
  type AnalyticsSavedView,
  type AnalyticsStarterView,
} from '../lib/api'
import { buildExecutiveCardQuery, type ExecutiveFilterState } from '../lib/analytics/executiveFilters'
import { downloadBlob } from '../lib/analytics/formatters'
import { getAnalyticsAggregateLabel } from '../lib/analytics/labels'
import {
  analyticsQueryReducer,
  buildEmptyAnalyticsState,
  type AnalyticsBuilderState,
  stateToQueryRequest,
} from '../lib/analytics/queryReducer'

function buildStateFromConfig(config: AnalyticsQueryRequest, viewId: number | null = null): AnalyticsBuilderState {
  return {
    ...buildEmptyAnalyticsState(config.subject_key ?? ''),
    ...config,
    activeViewId: viewId,
    dirty: false,
  }
}

type ZoneId = 'rows' | 'columns' | 'values' | 'selected_fields'
type DataStudioSurface = 'executive' | 'studio'

const DATA_STUDIO_SURFACE_KEY = 'dataStudioSurface'
const DEFAULT_EXECUTIVE_FILTERS: ExecutiveFilterState = {
  datePreset: 'recent_30_days',
  funds: [],
}

function drawerToggleClass(active: boolean) {
  return `btn-sm inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? 'border-[#558ef8] bg-[#eef4ff] text-[#1a3660]'
      : 'border-[#d8e5fb] bg-white text-[#64748b] hover:bg-[#f5f9ff] hover:text-[#1a3660]'
  }`
}

export default function DataStudioPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [state, dispatch] = useReducer(analyticsQueryReducer, buildEmptyAnalyticsState())
  const [surface, setSurface] = useState<DataStudioSurface>(() => {
    if (typeof window === 'undefined') return 'executive'
    const saved = window.localStorage.getItem(DATA_STUDIO_SURFACE_KEY)
    return saved === 'studio' ? 'studio' : 'executive'
  })
  const [externalDrag, setExternalDrag] = useState<AnalyticsCatalogPointerDragPayload | null>(null)
  const [externalHover, setExternalHover] = useState<{ zoneId: ZoneId; index: number } | null>(null)
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [activePackKey, setActivePackKey] = useState('all')
  const [executiveFilters, setExecutiveFilters] = useState<ExecutiveFilterState>(DEFAULT_EXECUTIVE_FILTERS)
  const [drilldownCard, setDrilldownCard] = useState<AnalyticsExecutiveCard | null>(null)

  const catalogQuery = useQuery({
    queryKey: ['analytics', 'catalog'],
    queryFn: fetchAnalyticsCatalog,
    staleTime: 60 * 60 * 1000,
  })

  const savedViewsQuery = useQuery({
    queryKey: ['analytics', 'views'],
    queryFn: fetchAnalyticsViews,
  })

  const requestPayload = useMemo(() => stateToQueryRequest(state), [state])

  const resultQuery = useQuery({
    queryKey: ['analytics', 'query', requestPayload],
    queryFn: () => runAnalyticsQuery(requestPayload),
    enabled: surface === 'studio' && Boolean(state.subject_key),
  })

  const subjectMap = useMemo(
    () => new Map((catalogQuery.data?.subjects ?? []).map((subject) => [subject.key, subject])),
    [catalogQuery.data?.subjects],
  )
  const activeSubject = state.subject_key ? subjectMap.get(state.subject_key) ?? null : null
  const fieldMap = useMemo<Record<string, AnalyticsFieldMeta>>(() => {
    if (!activeSubject) return {}
    return Object.fromEntries(activeSubject.fields.map((field) => [field.key, field]))
  }, [activeSubject])
  const executivePacks = catalogQuery.data?.executive_packs ?? []
  const activePack = executivePacks.find((pack) => pack.key === activePackKey) ?? executivePacks[0] ?? null
  const activePackCards = useMemo(() => activePack?.sections.flatMap((section) => section.cards) ?? [], [activePack])
  const executiveBatchPayload = useMemo(
    () => ({
      items: activePackCards.map((card) => ({
        key: card.key,
        query: buildExecutiveCardQuery(card, executiveFilters),
      })),
    }),
    [activePackCards, executiveFilters],
  )

  const executiveQuery = useQuery({
    queryKey: ['analytics', 'executive-pack', activePack?.key, executiveFilters, executiveBatchPayload],
    queryFn: () => runAnalyticsBatchQuery(executiveBatchPayload),
    enabled: surface === 'executive' && activePackCards.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  const executiveResultMap = useMemo(
    () => new Map((executiveQuery.data?.results ?? []).map((result) => [result.key, result] as const)),
    [executiveQuery.data?.results],
  )

  const usedKeys = useMemo(() => {
    const keys = new Set<string>([
      ...state.rows,
      ...state.columns,
      ...state.selected_fields,
      ...state.values.map((value) => value.key),
      ...state.filters.map((filter) => filter.field),
    ])
    return keys
  }, [state.columns, state.filters, state.rows, state.selected_fields, state.values])

  useEffect(() => {
    if (!activeSubject || state.mode !== 'table' || state.selected_fields.length > 0) return
    dispatch({
      type: 'reset',
      payload: { ...state, selected_fields: activeSubject.default_table_fields, dirty: false },
    })
  }, [activeSubject, state])

  useEffect(() => {
    if (state.subject_key) return
    setLeftPanelOpen(false)
    setRightPanelOpen(false)
  }, [state.subject_key])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DATA_STUDIO_SURFACE_KEY, surface)
  }, [surface])

  useEffect(() => {
    if (!activePack && executivePacks.length > 0) {
      setActivePackKey(executivePacks[0].key)
    }
  }, [activePack, executivePacks])

  useEffect(() => {
    setDrilldownCard((current) => {
      if (!current) return current
      return activePackCards.some((card) => card.key === current.key) ? current : null
    })
  }, [activePackCards])

  useEffect(() => {
    if (!externalDrag) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== externalDrag.pointerId) return
      setExternalDrag((current) =>
        current
          ? {
              ...current,
              pointerX: event.clientX,
              pointerY: event.clientY,
            }
          : current,
      )
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== externalDrag.pointerId) return
      if (externalHover) {
        if (externalHover.zoneId === 'values') {
          dispatch({
            type: 'insert-value',
            value: {
              key: externalDrag.key,
              aggregate: externalDrag.defaultAggregate ?? 'sum',
            },
            index: externalHover.index,
          })
        } else {
          dispatch({
            type: 'insert-zone-field',
            zone: externalHover.zoneId,
            field: externalDrag.key,
            index: externalHover.index,
          })
        }
      }
      setExternalDrag(null)
      setExternalHover(null)
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
  }, [externalDrag, externalHover])

  const createViewMut = useMutation({
    mutationFn: createAnalyticsView,
    onSuccess: (view) => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'views'] })
      dispatch({ type: 'set-active-view', viewId: view.id })
      dispatch({ type: 'set-dirty', dirty: false })
      addToast('success', '분석 뷰를 저장했습니다.')
    },
  })

  const updateViewMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateAnalyticsView>[1] }) => updateAnalyticsView(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'views'] })
      dispatch({ type: 'set-dirty', dirty: false })
      addToast('success', '분석 뷰를 업데이트했습니다.')
    },
  })

  const deleteViewMut = useMutation({
    mutationFn: deleteAnalyticsView,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'views'] })
      dispatch({ type: 'reset', payload: buildEmptyAnalyticsState() })
      addToast('success', '분석 뷰를 삭제했습니다.')
    },
  })

  const exportMut = useMutation({
    mutationFn: () => exportAnalyticsXlsx({ query: requestPayload, file_name: `data_studio_${state.subject_key}` }),
    onSuccess: (blob) => {
      downloadBlob(blob, `data_studio_${state.subject_key || 'export'}.xlsx`)
      addToast('success', 'Excel 파일을 내려받았습니다.')
    },
  })

  const handleSelectSavedView = (viewId: number | null) => {
    if (viewId === null) {
      dispatch({ type: 'reset', payload: buildEmptyAnalyticsState(state.subject_key) })
      setSurface('studio')
      return
    }
    const view = (savedViewsQuery.data ?? []).find((item) => item.id === viewId)
    if (!view) return
    dispatch({ type: 'reset', payload: buildStateFromConfig(view.config, view.id) })
    setSurface('studio')
  }

  const handleSave = () => {
    if (!state.subject_key) {
      addToast('warning', '분석 기준을 먼저 선택하세요.')
      return
    }
    const activeView = (savedViewsQuery.data ?? []).find((view) => view.id === state.activeViewId)
    if (activeView) {
      updateViewMut.mutate({
        id: activeView.id,
        payload: {
          subject_key: state.subject_key,
          config: requestPayload,
        },
      })
      return
    }
    handleSaveAs()
  }

  const handleSaveAs = () => {
    if (!state.subject_key) {
      addToast('warning', '분석 기준을 먼저 선택하세요.')
      return
    }
    const name = prompt('저장할 분석 뷰 이름')
    if (!name?.trim()) return
    createViewMut.mutate({
      name: name.trim(),
      description: activeSubject?.description ?? null,
      subject_key: state.subject_key,
      config: requestPayload,
      is_favorite: false,
    })
  }

  const handleDelete = (viewId: number) => {
    if (!confirm('이 분석 뷰를 삭제할까요?')) return
    deleteViewMut.mutate(viewId)
  }

  const handleFavorite = (view: AnalyticsSavedView) => {
    updateViewMut.mutate({ id: view.id, payload: { is_favorite: !view.is_favorite } })
  }

  const handleStarterSelect = (view: AnalyticsStarterView) => {
    dispatch({ type: 'reset', payload: buildStateFromConfig(view.config, null) })
    setSurface('studio')
  }

  const handleExternalHover = (zoneId: ZoneId, index: number | null) => {
    setExternalHover((current) => {
      if (index == null) return current?.zoneId === zoneId ? null : current
      return { zoneId, index }
    })
  }

  const toggleLeftPanel = () => {
    if (!state.subject_key) return
    setLeftPanelOpen((current) => {
      const next = !current
      if (next) setRightPanelOpen(false)
      return next
    })
  }

  const toggleRightPanel = () => {
    if (!state.subject_key) return
    setRightPanelOpen((current) => {
      const next = !current
      if (next) setLeftPanelOpen(false)
      return next
    })
  }

  const handleExecutiveSurfaceChange = (next: DataStudioSurface) => {
    setSurface(next)
    if (next === 'executive') {
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
    }
  }

  const handleExecutiveOpenStudio = (card: AnalyticsExecutiveCard) => {
    const query = buildExecutiveCardQuery(card, executiveFilters)
    dispatch({ type: 'reset', payload: buildStateFromConfig(query, null) })
    setSurface('studio')
    setDrilldownCard(null)
  }

  const toggleExecutiveFund = (fundValue: string) => {
    setExecutiveFilters((current) => ({
      ...current,
      funds: current.funds.includes(fundValue)
        ? current.funds.filter((item) => item !== fundValue)
        : [...current.funds, fundValue],
    }))
  }

  const workspaceShiftClass = leftPanelOpen
    ? 'transition-[padding] duration-200 ease-out lg:pl-[254px] xl:pl-[262px]'
    : 'transition-[padding] duration-200 ease-out'

  if (catalogQuery.isLoading || savedViewsQuery.isLoading) {
    return <PageLoading />
  }

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="데이터 스튜디오"
        subtitle={
          surface === 'executive'
            ? '임원용 핵심 지표와 차트로 전사 운영·재무 흐름을 빠르게 확인합니다.'
            : '핵심 운영·재무 데이터를 피벗과 상세 행으로 교차 분석합니다.'
        }
        actions={
          surface === 'studio' ? (
            <SavedViewMenu
              views={savedViewsQuery.data ?? []}
              activeViewId={state.activeViewId}
              onSelect={handleSelectSavedView}
              onSave={handleSave}
              onSaveAs={handleSaveAs}
              onDelete={handleDelete}
              onToggleFavorite={handleFavorite}
            />
          ) : (
            <button type="button" onClick={() => handleExecutiveSurfaceChange('studio')} className="secondary-btn btn-sm">
              직접 분석으로 이동
            </button>
          )
        }
      />

      <PageControlStrip compact>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ExecutiveSurfaceTabs value={surface} onChange={handleExecutiveSurfaceChange} />
          <div className="flex items-center gap-2 text-xs">
            {surface === 'executive' ? (
              <>
                <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 text-[#1a3660]">
                  {activePack?.label ?? '전체'} 팩
                </span>
                <span className="rounded-full border border-[#d8e5fb] bg-white px-2.5 py-1 text-[#64748b]">
                  {activePackCards.length} 카드
                </span>
              </>
            ) : state.subject_key ? (
              <>
                <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 text-[#1a3660]">
                  {resultQuery.data?.meta.result_count ?? 0}건
                </span>
                <span className="rounded-full border border-[#d8e5fb] bg-white px-2.5 py-1 text-[#64748b]">
                  {resultQuery.data?.meta.execution_ms ?? 0}ms
                </span>
                {state.dirty && (
                  <span className="rounded-full border border-[#d4a418] bg-[#fff7d6] px-2.5 py-1 text-[#624100]">
                    저장 안 됨
                  </span>
                )}
              </>
            ) : null}
          </div>
        </div>
      </PageControlStrip>

      {surface === 'executive' ? (
        <ExecutiveSurface
          packs={executivePacks}
          activePackKey={activePackKey}
          filterOptions={catalogQuery.data?.executive_filter_options ?? { funds: [] }}
          filters={executiveFilters}
          loading={executiveQuery.isLoading}
          resultMap={executiveResultMap}
          drilldownCard={drilldownCard}
          onPackChange={setActivePackKey}
          onDatePresetChange={(datePreset) => setExecutiveFilters((current) => ({ ...current, datePreset }))}
          onToggleFund={toggleExecutiveFund}
          onResetFilters={() => setExecutiveFilters(DEFAULT_EXECUTIVE_FILTERS)}
          onOpenDetail={setDrilldownCard}
          onCloseDetail={() => setDrilldownCard(null)}
          onOpenStudio={handleExecutiveOpenStudio}
        />
      ) : (
        <div className={workspaceShiftClass}>
          <PageControlStrip compact>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <AnalyticsSubjectPicker
                  subjects={catalogQuery.data?.subjects ?? []}
                  value={state.subject_key}
                  onChange={(next) => dispatch({ type: 'set-subject', subjectKey: next })}
                  variant="inline"
                />
                <div className="inline-flex items-center rounded-xl border border-[#d8e5fb] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'set-mode', mode: 'pivot' })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${state.mode === 'pivot' ? 'bg-[#0f1f3d] text-white' : 'text-[#64748b]'}`}
                  >
                    피벗
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'set-mode', mode: 'table' })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${state.mode === 'table' ? 'bg-[#0f1f3d] text-white' : 'text-[#64748b]'}`}
                  >
                    상세 행
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={toggleLeftPanel}
                  disabled={!state.subject_key}
                  className={`${drawerToggleClass(leftPanelOpen)} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  필드
                </button>
                <button
                  type="button"
                  onClick={toggleRightPanel}
                  disabled={!state.subject_key}
                  className={`${drawerToggleClass(rightPanelOpen)} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  옵션
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'reset', payload: buildEmptyAnalyticsState(state.subject_key) })}
                  className="ghost-btn btn-sm"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => exportMut.mutate()}
                  disabled={exportMut.isPending || !state.subject_key}
                  className="secondary-btn btn-sm disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Excel 내보내기
                </button>
              </div>
            </div>
          </PageControlStrip>

          {externalDrag && (
            <div
              className="pointer-events-none fixed z-30 inline-flex h-9 items-center gap-1 rounded-full border border-[#558ef8] bg-white px-2.5 py-1.5 text-xs shadow-lg"
              style={{
                left: externalDrag.pointerX - externalDrag.offsetX,
                top: externalDrag.pointerY - externalDrag.offsetY,
                width: externalDrag.width,
                height: externalDrag.height,
              }}
              aria-hidden="true"
            >
              <span className="font-semibold text-[#0f1f3d]">{externalDrag.label}</span>
              {externalDrag.kind === 'measure' && (
                <span className="rounded-full border border-[#cfe0ff] bg-[#eef4ff] px-2 py-1 text-[11px] font-semibold text-[#1a3660]">
                  {getAnalyticsAggregateLabel(externalDrag.defaultAggregate ?? 'sum')}
                </span>
              )}
            </div>
          )}

          <div className="mt-4">
            {!state.subject_key ? (
              <section className="space-y-4">
                <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-[#0f1f3d]">스타터 분석</h3>
                  <p className="mt-1 text-xs text-[#64748b]">자주 쓰는 기본 분석을 바로 불러와 시작할 수 있습니다.</p>
                </div>
                <StarterViewGallery
                  views={catalogQuery.data?.starter_views ?? []}
                  subjects={catalogQuery.data?.subjects ?? []}
                  onSelect={handleStarterSelect}
                />
              </section>
            ) : (
              <div className="min-w-0 space-y-3">
                {state.mode === 'pivot' ? (
                  <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
                    <AnalyticsBuilderZone
                      zoneId="rows"
                      title="행"
                      kind="dimension"
                      variant="ribbon"
                      items={state.rows}
                      fieldMap={fieldMap}
                      externalDrag={externalDrag}
                      onExternalHover={handleExternalHover}
                      onDropField={(fieldKey, targetIndex) =>
                        dispatch(
                          targetIndex == null
                            ? { type: 'add-zone-field', zone: 'rows', field: fieldKey }
                            : { type: 'insert-zone-field', zone: 'rows', field: fieldKey, index: targetIndex },
                        )
                      }
                      onRemove={(fieldKey) => dispatch({ type: 'remove-zone-field', zone: 'rows', field: String(fieldKey) })}
                      onMove={(from, to) => dispatch({ type: 'move-zone-field', zone: 'rows', from, to })}
                    />
                    <AnalyticsBuilderZone
                      zoneId="columns"
                      title="열"
                      kind="dimension"
                      variant="ribbon"
                      items={state.columns}
                      fieldMap={fieldMap}
                      externalDrag={externalDrag}
                      onExternalHover={handleExternalHover}
                      onDropField={(fieldKey, targetIndex) =>
                        dispatch(
                          targetIndex == null
                            ? { type: 'add-zone-field', zone: 'columns', field: fieldKey }
                            : { type: 'insert-zone-field', zone: 'columns', field: fieldKey, index: targetIndex },
                        )
                      }
                      onRemove={(fieldKey) => dispatch({ type: 'remove-zone-field', zone: 'columns', field: String(fieldKey) })}
                      onMove={(from, to) => dispatch({ type: 'move-zone-field', zone: 'columns', from, to })}
                    />
                    <AnalyticsBuilderZone
                      zoneId="values"
                      title="값"
                      kind="value"
                      variant="ribbon"
                      items={state.values}
                      fieldMap={fieldMap}
                      externalDrag={externalDrag}
                      onExternalHover={handleExternalHover}
                      onDropField={(fieldKey, targetIndex) =>
                        dispatch(
                          targetIndex == null
                            ? { type: 'add-value', value: { key: fieldKey, aggregate: fieldMap[fieldKey]?.default_aggregate ?? 'sum' } }
                            : { type: 'insert-value', value: { key: fieldKey, aggregate: fieldMap[fieldKey]?.default_aggregate ?? 'sum' }, index: targetIndex },
                        )
                      }
                      onRemove={(index) => dispatch({ type: 'remove-value', index: Number(index) })}
                      onMove={(from, to) => dispatch({ type: 'move-value', from, to })}
                      onUpdateValue={(index, patch) => dispatch({ type: 'update-value', index, value: patch })}
                    />
                  </div>
                ) : (
                  <AnalyticsBuilderZone
                    zoneId="selected_fields"
                    title="표시 열"
                    kind="any"
                    variant="ribbon"
                    items={state.selected_fields}
                    fieldMap={fieldMap}
                    externalDrag={externalDrag}
                    onExternalHover={handleExternalHover}
                    onDropField={(fieldKey, targetIndex) =>
                      dispatch(
                        targetIndex == null
                          ? { type: 'add-zone-field', zone: 'selected_fields', field: fieldKey }
                          : { type: 'insert-zone-field', zone: 'selected_fields', field: fieldKey, index: targetIndex },
                      )
                    }
                    onRemove={(fieldKey) => dispatch({ type: 'remove-zone-field', zone: 'selected_fields', field: String(fieldKey) })}
                    onMove={(from, to) => dispatch({ type: 'move-zone-field', zone: 'selected_fields', from, to })}
                  />
                )}

                <AnalyticsActiveSummaryBar
                  filters={state.filters}
                  sorts={state.sorts}
                  options={state.options}
                  fieldMap={fieldMap}
                />

                <div className="min-w-0">
                  {resultQuery.isLoading ? (
                    <PageLoading />
                  ) : resultQuery.data ? (
                    state.mode === 'pivot' ? (
                      <PivotMatrixTable response={resultQuery.data} />
                    ) : (
                      <AnalyticsDetailTable response={resultQuery.data} />
                    )
                  ) : (
                    <EmptyState message="분석 결과가 없습니다." className="py-12" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {surface === 'studio' && (
        <>
          <AnalyticsSideDrawer
            open={leftPanelOpen}
            side="left"
            title="필드"
            subtitle="필드를 검색하고 상단 리본에 드래그하거나 클릭해 추가합니다."
            closeOnOutsidePointerDown={false}
            onClose={() => setLeftPanelOpen(false)}
          >
            <AnalyticsFieldCatalog
              subject={activeSubject}
              usedKeys={usedKeys}
              variant="drawer"
              onStartDrag={(payload) => {
                setExternalDrag(payload)
                setExternalHover(null)
              }}
              onAddDimension={(fieldKey) => {
                if (state.mode === 'table') {
                  dispatch({ type: 'add-zone-field', zone: 'selected_fields', field: fieldKey })
                } else {
                  dispatch({ type: 'add-zone-field', zone: 'rows', field: fieldKey })
                }
              }}
              onAddMeasure={(fieldKey) => {
                if (state.mode === 'table') {
                  dispatch({ type: 'add-zone-field', zone: 'selected_fields', field: fieldKey })
                } else {
                  dispatch({ type: 'add-value', value: { key: fieldKey, aggregate: fieldMap[fieldKey]?.default_aggregate ?? 'sum' } })
                }
              }}
            />
          </AnalyticsSideDrawer>

          <AnalyticsSideDrawer
            open={rightPanelOpen}
            side="right"
            title="옵션"
            subtitle="필터, 정렬, 표시 옵션을 조정해 결과를 정리합니다."
            widthClassName="w-[min(420px,calc(100vw-16px))]"
            onClose={() => setRightPanelOpen(false)}
          >
            <div className="space-y-4">
              <AnalyticsFilterEditor
                fields={activeSubject?.fields ?? []}
                filters={state.filters}
                onChange={(filters) => dispatch({ type: 'set-filters', filters })}
              />
              <AnalyticsInspector
                options={state.options}
                sorts={state.sorts}
                fieldMap={fieldMap}
                onOptionsChange={(patch) => dispatch({ type: 'set-options', options: patch })}
                onSortsChange={(sorts) => dispatch({ type: 'set-sorts', sorts })}
              />
            </div>
          </AnalyticsSideDrawer>
        </>
      )}
    </div>
  )
}
