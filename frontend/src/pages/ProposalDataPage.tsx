import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, FileSpreadsheet, Plus, Save } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import ProposalManagerWorkspace from '../components/proposal/ProposalManagerWorkspace'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import SectionScaffold from '../components/common/page/SectionScaffold'
import { useToast } from '../contexts/ToastContext'
import {
  createProposalApplication,
  exportProposalApplicationSheet,
  fetchProposalApplication,
  fetchProposalApplicationSheet,
  fetchProposalApplicationSheets,
  fetchProposalApplications,
  fetchProposalWorkspace,
  freezeProposalApplication,
  saveProposalFieldOverrides,
  saveProposalRowOverrides,
  type ProposalApplicationInput,
  type ProposalRowOverrideInput,
  type ProposalSheetDescriptor,
  type ProposalSheetField,
  type ProposalSheetView,
  type ProposalTemplateType,
} from '../lib/api'

type ViewMode = 'workbench' | 'reference'
type EditableRow = {
  row_key: string
  cells: Record<string, unknown>
  is_manual: boolean
  source: string
  is_overridden: boolean
}

const TEMPLATE_OPTIONS: Array<{ value: ProposalTemplateType; label: string }> = [
  { value: 'growth-finance', label: '성장금융' },
  { value: 'motae-5', label: '모태 별첨5' },
  { value: 'motae-6', label: '모태 별첨6' },
  { value: 'motae-7', label: '모태 별첨7' },
  { value: 'nong-motae', label: '농모태' },
]

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function parseNumber(value: string | null) {
  const parsed = Number(value || '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function templateLabel(templateType: ProposalTemplateType) {
  return TEMPLATE_OPTIONS.find((item) => item.value === templateType)?.label ?? templateType
}

function textValue(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Y' : 'N'
  return String(value)
}

function normalizeValue(value: unknown, key: string) {
  if (typeof value === 'boolean') return value
  if (key.startsWith('is_') || key.startsWith('has_')) {
    if (value === '' || value == null) return false
    return value === true || value === 'true' || value === 'Y'
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value == null ? null : value
}

function sameValue(left: unknown, right: unknown, key = 'value') {
  return JSON.stringify(normalizeValue(left, key)) === JSON.stringify(normalizeValue(right, key))
}

function copyText(text: string, addToast: (type: 'success' | 'info' | 'error' | 'warning', message: string) => void) {
  navigator.clipboard.writeText(text).then(
    () => addToast('success', '복사했습니다.'),
    () => addToast('error', '복사에 실패했습니다.'),
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

function buildCreateForm(): ProposalApplicationInput {
  return {
    title: '',
    template_type: 'growth-finance',
    institution_type: null,
    gp_entity_id: null,
    as_of_date: todayString(),
    fund_ids: [],
  }
}

function fieldOverridesFromSheet(fields: ProposalSheetField[], values: Record<string, unknown>) {
  return fields
    .map((field) => {
      const nextValue = normalizeValue(values[field.key], field.key)
      if (sameValue(nextValue, field.default_value, field.key)) return null
      return { field_key: field.key, value: nextValue }
    })
    .filter(Boolean) as Array<{ field_key: string; value: unknown }>
}

function rowOverridesFromSheet(sheet: ProposalSheetView, rows: EditableRow[]): ProposalRowOverrideInput[] {
  const baseRows = new Map(sheet.rows.filter((row) => !row.is_manual).map((row) => [row.row_key, row]))
  const overrides: ProposalRowOverrideInput[] = []
  rows.forEach((row) => {
    const cleaned = Object.fromEntries(
      sheet.columns.map((column) => [column.key, normalizeValue(row.cells[column.key], column.key)]),
    )
    const hasAnyValue = Object.values(cleaned).some((value) => value !== null && value !== '')
    if (row.is_manual) {
      if (hasAnyValue) {
        overrides.push({ row_key: row.row_key, row_mode: 'add', row_payload: cleaned })
      }
      return
    }
    const baseRow = baseRows.get(row.row_key)
    if (!baseRow) return
    const diff = Object.fromEntries(
      sheet.columns
        .filter((column) => !sameValue(cleaned[column.key], baseRow.default_cells[column.key], column.key))
        .map((column) => [column.key, cleaned[column.key]]),
    )
    if (Object.keys(diff).length > 0) {
      overrides.push({ row_key: row.row_key, row_mode: 'override', row_payload: diff })
    }
  })
  return overrides
}

export default function ProposalDataPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const selectedDraftId = parseNumber(searchParams.get('draftId'))
  const selectedSheetCode = searchParams.get('sheet')
  const selectedManagerId = parseNumber(searchParams.get('managerId'))
  const view = (searchParams.get('view') as ViewMode) || 'workbench'

  const [createForm, setCreateForm] = useState<ProposalApplicationInput>(buildCreateForm)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [editableRows, setEditableRows] = useState<EditableRow[]>([])

  const patchSearchParams = (updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, value]) => {
        if (!value) next.delete(key)
        else next.set(key, value)
      })
      return next
    })
  }

  const draftsQuery = useQuery({
    queryKey: ['proposal-applications'],
    queryFn: fetchProposalApplications,
  })

  const createContextQuery = useQuery({
    queryKey: ['proposal-draft-create-context', createForm.template_type, createForm.as_of_date, createForm.gp_entity_id],
    queryFn: () =>
      fetchProposalWorkspace({
        template_type: createForm.template_type,
        as_of_date: createForm.as_of_date,
        gp_entity_id: createForm.gp_entity_id,
      }),
  })

  const selectedDraftQuery = useQuery({
    queryKey: ['proposal-application', selectedDraftId],
    queryFn: () => fetchProposalApplication(selectedDraftId as number),
    enabled: selectedDraftId != null,
  })

  const selectedSheetsQuery = useQuery({
    queryKey: ['proposal-application-sheets', selectedDraftId],
    queryFn: () => fetchProposalApplicationSheets(selectedDraftId as number),
    enabled: selectedDraftId != null,
  })

  const selectedSheetQuery = useQuery({
    queryKey: ['proposal-application-sheet', selectedDraftId, selectedSheetCode],
    queryFn: () => fetchProposalApplicationSheet(selectedDraftId as number, selectedSheetCode as string),
    enabled: selectedDraftId != null && Boolean(selectedSheetCode),
  })

  const referenceContext = selectedDraftQuery.data
    ? {
        template_type: selectedDraftQuery.data.template_type,
        as_of_date: selectedDraftQuery.data.as_of_date,
        gp_entity_id: selectedDraftQuery.data.gp_entity_id,
        fund_ids: selectedDraftQuery.data.fund_ids,
      }
    : {
        template_type: createForm.template_type,
        as_of_date: createForm.as_of_date,
        gp_entity_id: createForm.gp_entity_id,
        fund_ids: createForm.fund_ids,
      }

  const referenceWorkspaceQuery = useQuery({
    queryKey: ['proposal-reference-workspace', referenceContext],
    queryFn: () => fetchProposalWorkspace(referenceContext),
    enabled: referenceContext.gp_entity_id != null,
  })

  useEffect(() => {
    if (!selectedDraftId && draftsQuery.data && draftsQuery.data.length > 0) {
      patchSearchParams({ draftId: String(draftsQuery.data[0].id) })
    }
  }, [draftsQuery.data, selectedDraftId])

  useEffect(() => {
    const gpId = createContextQuery.data?.selected_gp_entity?.id
    if (!createForm.gp_entity_id && gpId) {
      setCreateForm((prev) => ({ ...prev, gp_entity_id: gpId }))
    }
  }, [createContextQuery.data?.selected_gp_entity?.id, createForm.gp_entity_id])

  useEffect(() => {
    const candidateIds = createContextQuery.data?.available_funds.map((fund) => fund.id) ?? []
    if (candidateIds.length === 0) return
    setCreateForm((prev) => {
      const filtered = prev.fund_ids.filter((fundId) => candidateIds.includes(fundId))
      if (filtered.length === prev.fund_ids.length && filtered.length > 0) return prev
      return { ...prev, fund_ids: filtered.length > 0 ? filtered : candidateIds }
    })
  }, [createContextQuery.data?.available_funds])

  useEffect(() => {
    const sheets = selectedSheetsQuery.data ?? []
    if (selectedDraftId && sheets.length > 0 && !sheets.some((sheet) => sheet.code === selectedSheetCode)) {
      patchSearchParams({ sheet: sheets[0].code })
    }
  }, [selectedDraftId, selectedSheetCode, selectedSheetsQuery.data])

  useEffect(() => {
    const sheet = selectedSheetQuery.data
    if (!sheet) return
    setFieldValues(Object.fromEntries(sheet.fields.map((field) => [field.key, field.final_value])))
    setEditableRows(
      sheet.rows.map((row) => ({
        row_key: row.row_key,
        cells: { ...row.final_cells },
        is_manual: row.is_manual,
        source: row.source,
        is_overridden: row.is_overridden,
      })),
    )
  }, [selectedSheetQuery.data])

  const invalidateDraft = (draftId: number | null) => {
    queryClient.invalidateQueries({ queryKey: ['proposal-applications'] })
    queryClient.invalidateQueries({ queryKey: ['proposal-application', draftId] })
    queryClient.invalidateQueries({ queryKey: ['proposal-application-sheets', draftId] })
    queryClient.invalidateQueries({ queryKey: ['proposal-application-sheet', draftId] })
    queryClient.invalidateQueries({ queryKey: ['proposal-reference-workspace'] })
  }

  const createDraftMutation = useMutation({
    mutationFn: () => createProposalApplication({ ...createForm, title: createForm.title || `${templateLabel(createForm.template_type)} ${createForm.as_of_date} 초안` }),
    onSuccess: (draft) => {
      invalidateDraft(draft.id)
      patchSearchParams({ draftId: String(draft.id), sheet: null, view: 'workbench' })
      addToast('success', '초안을 생성했습니다.')
    },
  })

  const freezeDraftMutation = useMutation({
    mutationFn: () => freezeProposalApplication(selectedDraftId as number),
    onSuccess: (draft) => {
      invalidateDraft(draft.id)
      addToast('success', '초안을 동결했습니다.')
    },
  })

  const saveFieldMutation = useMutation({
    mutationFn: () => saveProposalFieldOverrides(selectedDraftId as number, selectedSheetCode as string, fieldOverridesFromSheet(selectedSheetQuery.data?.fields ?? [], fieldValues)),
    onSuccess: () => {
      invalidateDraft(selectedDraftId)
      addToast('success', '시트 값을 저장했습니다.')
    },
  })

  const saveRowMutation = useMutation({
    mutationFn: () => saveProposalRowOverrides(selectedDraftId as number, selectedSheetCode as string, rowOverridesFromSheet(selectedSheetQuery.data as ProposalSheetView, editableRows)),
    onSuccess: () => {
      invalidateDraft(selectedDraftId)
      addToast('success', '행 변경사항을 저장했습니다.')
    },
  })

  const exportSheetMutation = useMutation({
    mutationFn: (params: { scope: 'sheet' | 'all'; format: 'xlsx' | 'csv' }) =>
      exportProposalApplicationSheet(selectedDraftId as number, { ...params, sheet_code: params.scope === 'sheet' ? selectedSheetCode : null }),
    onSuccess: (blob, variables) => {
      const filename =
        variables.scope === 'all'
          ? `proposal-${selectedDraftId}-all.xlsx`
          : `proposal-${selectedDraftId}-${selectedSheetCode}.${variables.format}`
      downloadBlob(blob, filename)
      addToast('success', '다운로드를 시작했습니다.')
    },
  })

  if (draftsQuery.isLoading) {
    return <PageLoading />
  }

  const selectedDraft = selectedDraftQuery.data
  const selectedSheet = selectedSheetQuery.data
  const sheets = selectedSheetsQuery.data ?? []
  const referenceWorkspace = referenceWorkspaceQuery.data
  const createContext = createContextQuery.data

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="제안서 데이터 관리"
        subtitle="청약 건별 초안을 만들고, 시트 단위로 값을 복사하거나 내려받는 반자동 작업대입니다."
        meta={
          <>
            <span className="tag tag-blue">{selectedDraft ? templateLabel(selectedDraft.template_type) : templateLabel(createForm.template_type)}</span>
            <span className="tag tag-gray">기준일 {selectedDraft?.as_of_date || createForm.as_of_date}</span>
            {selectedDraft ? <span className={`tag ${selectedDraft.status === 'frozen' ? 'tag-indigo' : 'tag-emerald'}`}>초안 #{selectedDraft.id} · {selectedDraft.status}</span> : null}
          </>
        }
      />

      <PageControlStrip className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={view === 'workbench' ? 'primary-btn' : 'secondary-btn'} onClick={() => patchSearchParams({ view: 'workbench' })}>초안 작업대</button>
          <button type="button" className={view === 'reference' ? 'primary-btn' : 'secondary-btn'} onClick={() => patchSearchParams({ view: 'reference' })}>기준 데이터 보완</button>
        </div>
      </PageControlStrip>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionScaffold title="초안 만들기" description="템플릿, 기준일, GP, 대상 조합을 선택해 청약 건별 초안을 생성합니다.">
            <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              <input value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="초안명" />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-1">
                <select value={createForm.template_type} onChange={(event) => setCreateForm((prev) => ({ ...prev, template_type: event.target.value as ProposalTemplateType, fund_ids: [] }))}>
                  {TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input type="date" value={createForm.as_of_date} onChange={(event) => setCreateForm((prev) => ({ ...prev, as_of_date: event.target.value }))} />
              </div>
              <select value={createForm.gp_entity_id ?? ''} onChange={(event) => setCreateForm((prev) => ({ ...prev, gp_entity_id: Number(event.target.value || 0) || null, fund_ids: [] }))}>
                <option value="">GP 선택</option>
                {createContext?.gp_entities.map((gp) => (
                  <option key={gp.id} value={gp.id}>{gp.name}</option>
                ))}
              </select>
              <div className="rounded-xl border border-[#d8e5fb] bg-[#f8fbff] p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-[#64748b]">
                  <span>대상 조합</span>
                  <span>{createForm.fund_ids.length}개 선택</span>
                </div>
                <div className="max-h-52 space-y-2 overflow-auto">
                  {createContext?.available_funds.map((fund) => {
                    const checked = createForm.fund_ids.includes(fund.id)
                    return (
                      <label key={fund.id} className="flex items-start gap-2 rounded-lg border border-[#d8e5fb] bg-white px-3 py-2 text-sm text-[#334155]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCreateForm((prev) => ({
                              ...prev,
                              fund_ids: checked ? prev.fund_ids.filter((id) => id !== fund.id) : [...prev.fund_ids, fund.id],
                            }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{fund.name}</span>
                          <span className="block text-xs text-[#64748b]">{fund.type} · 약정 {textValue(fund.commitment_total)}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <button type="button" className="primary-btn w-full" onClick={() => createDraftMutation.mutate()} disabled={!createForm.gp_entity_id || createForm.fund_ids.length === 0 || createDraftMutation.isPending}>
                <Plus size={16} />
                초안 생성
              </button>
            </div>
          </SectionScaffold>

          <SectionScaffold title="초안 목록" description="제출 건별 작업본입니다. 동일 GP/조합이라도 제출 회차가 다르면 별도 초안으로 관리합니다.">
            <div className="space-y-2">
              {draftsQuery.data?.length ? draftsQuery.data.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${draft.id === selectedDraftId ? 'border-[#2563eb] bg-[#eff6ff]' : 'border-[#d8e5fb] bg-white hover:bg-[#f8fbff]'}`}
                  onClick={() => patchSearchParams({ draftId: String(draft.id), view: 'workbench' })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#0f172a]">{draft.title}</div>
                      <div className="mt-1 text-xs text-[#64748b]">{templateLabel(draft.template_type)} · {draft.gp_entity_name || 'GP 미지정'} · 조합 {draft.fund_count}개</div>
                      <div className="mt-1 text-[11px] text-[#94a3b8]">기준일 {draft.as_of_date}</div>
                    </div>
                    <span className={`tag ${draft.status === 'frozen' ? 'tag-indigo' : 'tag-emerald'}`}>{draft.status}</span>
                  </div>
                </button>
              )) : <EmptyState message="아직 생성한 초안이 없습니다." className="py-10" />}
            </div>
          </SectionScaffold>
        </div>

        {view === 'reference' ? (
          referenceWorkspace ? (
            <ProposalManagerWorkspace
              gpEntityId={referenceWorkspace.selected_gp_entity?.id ?? null}
              fundOptions={referenceWorkspace.available_funds}
              managers={referenceWorkspace.fund_managers}
              careers={referenceWorkspace.manager_careers}
              educations={referenceWorkspace.manager_educations}
              awards={referenceWorkspace.manager_awards}
              investments={referenceWorkspace.manager_investments}
              histories={referenceWorkspace.fund_manager_histories}
              selectedManagerId={selectedManagerId}
              onSelectManager={(managerId) => patchSearchParams({ managerId: managerId ? String(managerId) : null })}
            />
          ) : (
            <EmptyState message="초안이나 GP를 선택하면 운용인력 기준 데이터를 보완할 수 있습니다." className="py-16" />
          )
        ) : (
          <div className="space-y-4">
            {!selectedDraft ? (
              <EmptyState message="왼쪽에서 초안을 선택하면 시트 단위 작업대를 열 수 있습니다." className="py-20" />
            ) : (
              <>
                <SectionScaffold
                  title={selectedDraft.title}
                  description={`${templateLabel(selectedDraft.template_type)} · ${selectedDraft.gp_entity_name || 'GP 미지정'} · 기준일 ${selectedDraft.as_of_date}`}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="secondary-btn" onClick={() => exportSheetMutation.mutate({ scope: 'all', format: 'xlsx' })} disabled={exportSheetMutation.isPending}>전체 XLSX</button>
                      <button type="button" className="secondary-btn" onClick={() => freezeDraftMutation.mutate()} disabled={selectedDraft.status === 'frozen' || freezeDraftMutation.isPending}>동결</button>
                    </div>
                  }
                >
                  <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-[#d8e5fb] bg-[#f8fbff] p-3">
                      <div className="mb-2 text-xs font-semibold text-[#475569]">시트 목록</div>
                      <div className="mb-2 flex justify-end text-[11px] text-[#64748b]">
                        <span className="rounded-full bg-white px-2 py-1">{sheets.length}개</span>
                      </div>
                      <div className="max-h-[72vh] space-y-2 overflow-y-auto pr-1">
                        {sheets.map((sheet: ProposalSheetDescriptor) => (
                          <button
                            key={sheet.code}
                            type="button"
                            className={`w-full rounded-xl border px-3 py-3 text-left ${sheet.code === selectedSheetCode ? 'border-[#2563eb] bg-white' : 'border-transparent bg-white/70 hover:bg-white'}`}
                            onClick={() => patchSearchParams({ sheet: sheet.code })}
                          >
                            <div className="text-sm font-semibold text-[#0f172a]">{sheet.title}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                              <span className={`rounded-full px-2 py-1 ${sheet.kind === 'scalar' ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'bg-[#ecfccb] text-[#3f6212]'}`}>
                                {sheet.kind === 'scalar' ? '단일값' : '반복표'}
                              </span>
                              <span className="rounded-full bg-[#f8fafc] px-2 py-1 text-[#475569]">
                                {sheet.kind === 'scalar' ? `필드 ${sheet.field_count}개` : `행 ${sheet.row_count}개`}
                              </span>
                              {sheet.empty_value_count > 0 ? <span className="rounded-full bg-[#fff7ed] px-2 py-1 text-[#b45309]">빈 값 {sheet.empty_value_count}개</span> : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {!selectedSheet ? (
                      <EmptyState message="시트를 선택하세요." className="py-16" />
                    ) : (
                      <SectionScaffold
                        title={selectedSheet.title}
                        description={selectedSheet.description || '현재 시트 값을 검토하고 복사 또는 다운로드할 수 있습니다.'}
                        bodyClassName="p-3"
                        actions={
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="secondary-btn" onClick={() => copyText(selectedSheet.copy_text, addToast)}><Copy size={16} />시트 복사</button>
                            <button type="button" className="secondary-btn" onClick={() => exportSheetMutation.mutate({ scope: 'sheet', format: 'csv' })}><Download size={16} />CSV</button>
                            <button type="button" className="secondary-btn" onClick={() => exportSheetMutation.mutate({ scope: 'sheet', format: 'xlsx' })}><FileSpreadsheet size={16} />XLSX</button>
                            {selectedSheet.kind === 'scalar' && selectedDraft.status !== 'frozen' ? <button type="button" className="primary-btn" onClick={() => saveFieldMutation.mutate()} disabled={saveFieldMutation.isPending}><Save size={16} />시트 저장</button> : null}
                            {selectedSheet.kind === 'table' && selectedDraft.status !== 'frozen' ? <button type="button" className="primary-btn" onClick={() => saveRowMutation.mutate()} disabled={saveRowMutation.isPending}><Save size={16} />행 저장</button> : null}
                          </div>
                        }
                      >
                        {selectedSheet.kind === 'scalar' ? (
                          <div className="overflow-hidden rounded-xl border border-[#d8e5fb] bg-white">
                            <div className="grid grid-cols-1 gap-px bg-[#d8e5fb] text-[10px] font-semibold text-[#334155] lg:grid-cols-[172px_minmax(0,0.88fr)_minmax(0,1fr)_88px]">
                              <div className="bg-[#eff6ff] px-2 py-1.5">Field</div>
                              <div className="bg-[#eff6ff] px-2 py-1.5">ERP</div>
                              <div className="bg-[#eff6ff] px-2 py-1.5">Draft</div>
                              <div className="bg-[#eff6ff] px-2 py-1.5">Action</div>
                            </div>
                            <div className="max-h-[72vh] space-y-px overflow-auto bg-[#d8e5fb]">
                            {selectedSheet.fields.map((field, fieldIndex) => (
                              <div key={field.key} className={`grid grid-cols-1 gap-1.5 px-2 py-1.5 lg:grid-cols-[172px_minmax(0,0.88fr)_minmax(0,1fr)_88px] ${fieldIndex % 2 === 0 ? 'bg-white' : 'bg-[#f8fbff]'}`}>
                                <div className="min-w-0">
                                  <div className="truncate text-[12px] font-semibold leading-4 text-[#0f172a]">{field.label}</div>
                                  <div className="mt-0.5 inline-flex rounded-full bg-[#eff6ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#1d4ed8]">{field.source}</div>
                                </div>
                                <div className="whitespace-pre-wrap break-words text-[12px] leading-4 text-[#64748b]">{textValue(field.default_value) || '-'}</div>
                                <input
                                  className="w-full rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[12px] text-[#0f172a] shadow-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe] disabled:cursor-not-allowed disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
                                  value={typeof fieldValues[field.key] === 'boolean' ? (fieldValues[field.key] ? 'Y' : 'N') : textValue(fieldValues[field.key])}
                                  onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                                  disabled={selectedDraft.status === 'frozen'}
                                />
                                <div className="flex flex-col gap-0.5">
                                  <button type="button" className="inline-flex items-center justify-center rounded-md border border-[#cbd5e1] bg-white px-1.5 py-1 text-[10px] font-semibold text-[#334155] transition hover:border-[#94a3b8] hover:bg-[#f8fafc]" onClick={() => copyText(textValue(fieldValues[field.key]), addToast)}>복사</button>
                                  <span className={`inline-flex justify-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${field.is_overridden ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[#f1f5f9] text-[#64748b]'}`}>
                                    {field.is_overridden ? '수정됨' : '기본값'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        ) : (
                          <div className="space-y-1.5">
                            {selectedSheet.kind === 'table' && selectedDraft.status !== 'frozen' ? (
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[10px] font-semibold text-[#64748b]">{editableRows.length}개 행</div>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[10px] font-semibold text-[#334155] transition hover:border-[#94a3b8] hover:bg-[#f8fafc]"
                                  onClick={() => setEditableRows((prev) => [...prev, { row_key: `manual-${crypto.randomUUID()}`, cells: Object.fromEntries(selectedSheet.columns.map((column) => [column.key, ''])), is_manual: true, source: 'manual', is_overridden: true }])}
                                >
                                  <Plus size={12} />
                                  수기 행 추가
                                </button>
                              </div>
                            ) : null}
                            <div className="overflow-hidden rounded-xl border border-[#d8e5fb] bg-white">
                              <div className="max-h-[72vh] overflow-auto">
                              <table className="min-w-[820px] w-full border-collapse text-sm">
                                <thead className="sticky top-0 z-10 bg-[#eff6ff] text-[#0f172a] shadow-[inset_0_-1px_0_0_#d8e5fb]">
                                  <tr>
                                    {selectedSheet.columns.map((column) => (
                                      <th key={column.key} className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.02em] text-[#334155]">{column.label}</th>
                                    ))}
                                    <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.02em] text-[#334155]">작업</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {editableRows.map((row, rowIndex) => (
                                    <tr key={row.row_key} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-[#f8fbff]'}>
                                      {selectedSheet.columns.map((column) => (
                                        <td key={column.key} className="border-b border-[#eef2ff] px-1.5 py-1 align-top">
                                          <input
                                            className="w-full min-w-[104px] rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[12px] text-[#0f172a] shadow-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe] disabled:cursor-not-allowed disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
                                            value={textValue(row.cells[column.key])}
                                            onChange={(event) =>
                                              setEditableRows((prev) =>
                                                prev.map((candidate, candidateIndex) =>
                                                  candidateIndex === rowIndex
                                                    ? { ...candidate, cells: { ...candidate.cells, [column.key]: event.target.value } }
                                                    : candidate,
                                                ),
                                              )
                                            }
                                            disabled={selectedDraft.status === 'frozen' || selectedSheet.kind !== 'table'}
                                          />
                                        </td>
                                      ))}
                                      <td className="border-b border-[#eef2ff] px-1.5 py-1 align-top">
                                        <div className="flex flex-wrap gap-1">
                                          <button type="button" className="inline-flex items-center justify-center rounded-md border border-[#cbd5e1] bg-white px-1.5 py-1 text-[10px] font-semibold text-[#334155] transition hover:border-[#94a3b8] hover:bg-[#f8fafc]" onClick={() => copyText(selectedSheet.columns.map((column) => textValue(row.cells[column.key])).join('\t'), addToast)}>복사</button>
                                          {row.is_manual && selectedDraft.status !== 'frozen' ? (
                                            <button type="button" className="inline-flex items-center justify-center rounded-md border border-[#fecaca] bg-[#fff1f2] px-1.5 py-1 text-[10px] font-semibold text-[#b91c1c] transition hover:bg-[#ffe4e6]" onClick={() => setEditableRows((prev) => prev.filter((candidate) => candidate.row_key !== row.row_key))}>삭제</button>
                                          ) : null}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-semibold">
                                          <span className="rounded-full bg-[#eff6ff] px-1.5 py-0.5 text-[#1d4ed8]">{row.source}</span>
                                          {row.is_manual ? <span className="rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[#b45309]">수기 추가</span> : null}
                                          {row.is_overridden ? <span className="rounded-full bg-[#dbeafe] px-1.5 py-0.5 text-[#1d4ed8]">수정됨</span> : null}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </SectionScaffold>
                    )}
                  </div>
                </SectionScaffold>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
