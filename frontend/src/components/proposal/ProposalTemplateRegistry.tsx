import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, GitBranch, Plus } from 'lucide-react'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import SectionScaffold from '../common/page/SectionScaffold'
import FormModal from '../ui/FormModal'
import { useToast } from '../../contexts/ToastContext'
import { formatDate } from '../../lib/format'
import {
  activateProposalTemplateRegistryVersion,
  cloneProposalTemplateRegistryVersion,
  compareProposalTemplateRegistryVersions,
  createProposalTemplateRegistry,
  createProposalTemplateRegistryVersion,
  fetchProposalTemplateRegistry,
  fetchProposalTemplateRegistryVersion,
  fetchProposalTemplates,
  saveProposalTemplateRegistryVersion,
  type ProposalTemplateRegistryDetail,
  type ProposalTemplateRegistryVersionDetail,
  type ProposalTemplateRegistryVersionCloneInput,
  type ProposalTemplateRegistryVersionCreateInput,
  type ProposalTemplateRegistryVersionDiffItem,
} from '../../lib/api'

type TemplateFormState = {
  code: string
  name: string
  institution_type: string
  legacy_template_type: string
  description: string
}

type VersionFormState = {
  version_label: string
  status: string
  source_path: string
  effective_from: string
  effective_to: string
  notes: string
}

type SheetDraft = {
  sheet_code: string
  sheet_name: string
  sheet_kind: string
  display_order: number
  is_required: boolean
  notes: string
}

type FieldMappingDraft = {
  sheet_code: string
  field_key: string
  target_cell: string
  value_source: string
  transform_rule: string
  default_value_text: string
  source_note_hint: string
  is_required: boolean
  display_order: number
}

type TableMappingDraft = {
  sheet_code: string
  table_key: string
  start_cell: string
  row_source: string
  columns_text: string
  row_key_field: string
  append_mode: string
  max_rows: string
  notes: string
}

type ValidationRuleDraft = {
  sheet_code: string
  rule_code: string
  rule_type: string
  severity: string
  target_ref: string
  rule_payload_text: string
  message: string
}

function buildTemplateForm(): TemplateFormState {
  return {
    code: '',
    name: '',
    institution_type: '',
    legacy_template_type: '',
    description: '',
  }
}

function buildVersionForm(): VersionFormState {
  return {
    version_label: '',
    status: 'draft',
    source_path: '',
    effective_from: '',
    effective_to: '',
    notes: '',
  }
}

function buildRegistryDraft(version: ProposalTemplateRegistryVersionDetail | null) {
  return {
    sheets: version
      ? version.sheets.map((sheet) => ({
          sheet_code: sheet.sheet_code,
          sheet_name: sheet.sheet_name,
          sheet_kind: sheet.sheet_kind,
          display_order: sheet.display_order,
          is_required: sheet.is_required,
          notes: sheet.notes ?? '',
        }))
      : ([] as SheetDraft[]),
    fieldMappings: version
      ? version.field_mappings.map((row) => ({
          sheet_code: row.sheet_code,
          field_key: row.field_key,
          target_cell: row.target_cell,
          value_source: row.value_source ?? '',
          transform_rule: row.transform_rule ?? '',
          default_value_text: row.default_value == null ? '' : JSON.stringify(row.default_value),
          source_note_hint: row.source_note_hint ?? '',
          is_required: row.is_required,
          display_order: row.display_order,
        }))
      : ([] as FieldMappingDraft[]),
    tableMappings: version
      ? version.table_mappings.map((row) => ({
          sheet_code: row.sheet_code,
          table_key: row.table_key,
          start_cell: row.start_cell,
          row_source: row.row_source,
          columns_text: JSON.stringify(row.columns, null, 2),
          row_key_field: row.row_key_field ?? '',
          append_mode: row.append_mode,
          max_rows: row.max_rows == null ? '' : String(row.max_rows),
          notes: row.notes ?? '',
        }))
      : ([] as TableMappingDraft[]),
    validationRules: version
      ? version.validation_rules.map((row) => ({
          sheet_code: row.sheet_code ?? '',
          rule_code: row.rule_code,
          rule_type: row.rule_type,
          severity: row.severity,
          target_ref: row.target_ref ?? '',
          rule_payload_text: JSON.stringify(row.rule_payload ?? {}, null, 2),
          message: row.message,
        }))
      : ([] as ValidationRuleDraft[]),
  }
}

function asNullable(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseJsonInput(raw: string, fallback: unknown) {
  if (!raw.trim()) return fallback
  return JSON.parse(raw)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusTagClass(status: string) {
  if (status === 'active') return 'tag tag-emerald'
  if (status === 'archived') return 'tag tag-gray'
  return 'tag tag-blue'
}

function changeBadgeClass(changeType: string) {
  if (changeType === 'added') return 'tag tag-emerald'
  if (changeType === 'removed') return 'tag tag-gray'
  return 'tag tag-indigo'
}

function previewValue(value: unknown) {
  if (value == null || value === '') return '-'
  if (typeof value === 'string') return value
  const serialized = JSON.stringify(value)
  return serialized.length > 90 ? `${serialized.slice(0, 87)}...` : serialized
}

function summarizePayload(payload: Record<string, unknown> | null, changedFields: string[]) {
  if (!payload) return []
  const keys = changedFields.length > 0 ? changedFields : Object.keys(payload).slice(0, 5)
  return keys.map((key) => `${key}: ${previewValue(payload[key])}`)
}

function DiffGroup({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: ProposalTemplateRegistryVersionDiffItem[]
}) {
  return (
    <SectionScaffold title={title} description={description} className="h-full" bodyClassName="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8e5fb] bg-[#f8fbff] px-4 py-5 text-sm text-[#64748b]">
          변경 없음
        </div>
      ) : (
        rows.map((row) => {
          const beforeLines = summarizePayload(row.before, row.changed_fields)
          const afterLines = summarizePayload(row.after, row.changed_fields)
          return (
            <div key={row.key} className="rounded-2xl border border-[#d8e5fb] bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#0f172a]">{row.key}</div>
                  <div className="mt-1 text-xs text-[#64748b]">
                    {row.sheet_code ? `시트 ${row.sheet_code}` : '시트 공통 규칙'}
                  </div>
                </div>
                <span className={changeBadgeClass(row.change_type)}>{row.change_type}</span>
              </div>
              {row.changed_fields.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.changed_fields.map((field) => (
                    <span key={field} className="rounded-full bg-[#eff6ff] px-2 py-1 text-[11px] font-medium text-[#1d4ed8]">
                      {field}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">Before</div>
                  <div className="mt-2 space-y-1 text-xs text-[#334155]">
                    {beforeLines.length > 0 ? beforeLines.map((line) => <div key={line}>{line}</div>) : <div>-</div>}
                  </div>
                </div>
                <div className="rounded-xl border border-[#d8e5fb] bg-[#f8fbff] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">After</div>
                  <div className="mt-2 space-y-1 text-xs text-[#334155]">
                    {afterLines.length > 0 ? afterLines.map((line) => <div key={line}>{line}</div>) : <div>-</div>}
                  </div>
                </div>
              </div>
            </div>
          )
        })
      )}
    </SectionScaffold>
  )
}

export default function ProposalTemplateRegistry() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [versionModalOpen, setVersionModalOpen] = useState(false)
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(buildTemplateForm)
  const [versionForm, setVersionForm] = useState<VersionFormState>(buildVersionForm)
  const [cloneForm, setCloneForm] = useState<VersionFormState>(buildVersionForm)
  const [draftSheets, setDraftSheets] = useState<SheetDraft[]>([])
  const [draftFieldMappings, setDraftFieldMappings] = useState<FieldMappingDraft[]>([])
  const [draftTableMappings, setDraftTableMappings] = useState<TableMappingDraft[]>([])
  const [draftValidationRules, setDraftValidationRules] = useState<ValidationRuleDraft[]>([])

  const templatesQuery = useQuery({
    queryKey: ['proposal-templates'],
    queryFn: fetchProposalTemplates,
  })

  const templateDetailQuery = useQuery({
    queryKey: ['proposal-template', selectedTemplateId],
    queryFn: () => fetchProposalTemplateRegistry(selectedTemplateId as number),
    enabled: selectedTemplateId != null,
  })

  const versionDetailQuery = useQuery({
    queryKey: ['proposal-template-version', selectedVersionId],
    queryFn: () => fetchProposalTemplateRegistryVersion(selectedVersionId as number),
    enabled: selectedVersionId != null,
  })

  const versionDiffQuery = useQuery({
    queryKey: ['proposal-template-version-diff', selectedVersionId, compareVersionId],
    queryFn: () => compareProposalTemplateRegistryVersions(selectedVersionId as number, compareVersionId as number),
    enabled: selectedVersionId != null && compareVersionId != null && selectedVersionId !== compareVersionId,
  })

  const selectedTemplate: ProposalTemplateRegistryDetail | null =
    templateDetailQuery.data ??
    (templatesQuery.data?.find((row) => row.id === selectedTemplateId) as ProposalTemplateRegistryDetail | undefined) ??
    null
  const versions = selectedTemplate?.versions ?? []
  const selectedVersion = versionDetailQuery.data

  useEffect(() => {
    if (!selectedTemplateId && templatesQuery.data && templatesQuery.data.length > 0) {
      setSelectedTemplateId(templatesQuery.data[0].id)
    }
  }, [selectedTemplateId, templatesQuery.data])

  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersionId(null)
      setCompareVersionId(null)
      return
    }
    if (!selectedVersionId || !versions.some((row) => row.id === selectedVersionId)) {
      setSelectedVersionId(versions[0].id)
    }
  }, [selectedVersionId, versions])

  useEffect(() => {
    const compareCandidates = versions.filter((row) => row.id !== selectedVersionId)
    if (compareCandidates.length === 0) {
      setCompareVersionId(null)
      return
    }
    if (!compareVersionId || !compareCandidates.some((row) => row.id === compareVersionId)) {
      setCompareVersionId(compareCandidates[0].id)
    }
  }, [compareVersionId, selectedVersionId, versions])

  useEffect(() => {
    const draft = buildRegistryDraft(selectedVersion ?? null)
    setDraftSheets(draft.sheets)
    setDraftFieldMappings(draft.fieldMappings)
    setDraftTableMappings(draft.tableMappings)
    setDraftValidationRules(draft.validationRules)
  }, [selectedVersion])

  const invalidateRegistry = (templateId: number | null, versionId?: number | null) => {
    queryClient.invalidateQueries({ queryKey: ['proposal-templates'] })
    if (templateId != null) {
      queryClient.invalidateQueries({ queryKey: ['proposal-template', templateId] })
    }
    if (versionId != null) {
      queryClient.invalidateQueries({ queryKey: ['proposal-template-version', versionId] })
    }
    queryClient.invalidateQueries({ queryKey: ['proposal-template-version-diff'] })
  }

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createProposalTemplateRegistry({
        code: templateForm.code.trim(),
        name: templateForm.name.trim(),
        institution_type: asNullable(templateForm.institution_type),
        legacy_template_type: asNullable(templateForm.legacy_template_type),
        description: asNullable(templateForm.description),
      }),
    onSuccess: (template) => {
      invalidateRegistry(template.id)
      setSelectedTemplateId(template.id)
      setTemplateModalOpen(false)
      setTemplateForm(buildTemplateForm())
      addToast('success', '양식 마스터를 등록했습니다.')
    },
    onError: () => {
      addToast('error', '양식 마스터 등록에 실패했습니다.')
    },
  })

  const createVersionMutation = useMutation({
    mutationFn: () =>
      createProposalTemplateRegistryVersion(selectedTemplateId as number, {
        version_label: versionForm.version_label.trim(),
        status: versionForm.status,
        source_path: asNullable(versionForm.source_path),
        effective_from: asNullable(versionForm.effective_from),
        effective_to: asNullable(versionForm.effective_to),
        notes: asNullable(versionForm.notes),
        import_workbook_sheets: true,
      } satisfies ProposalTemplateRegistryVersionCreateInput),
    onSuccess: (version) => {
      invalidateRegistry(selectedTemplateId, version.id)
      setSelectedVersionId(version.id)
      setVersionModalOpen(false)
      setVersionForm(buildVersionForm())
      addToast('success', '새 양식 버전을 등록했습니다.')
    },
    onError: () => {
      addToast('error', '양식 버전 등록에 실패했습니다. 원본 경로를 확인해 주세요.')
    },
  })

  const cloneVersionMutation = useMutation({
    mutationFn: () =>
      cloneProposalTemplateRegistryVersion(selectedVersionId as number, {
        version_label: cloneForm.version_label.trim(),
        status: cloneForm.status,
        source_path: asNullable(cloneForm.source_path),
        effective_from: asNullable(cloneForm.effective_from),
        effective_to: asNullable(cloneForm.effective_to),
        notes: asNullable(cloneForm.notes),
      } satisfies ProposalTemplateRegistryVersionCloneInput),
    onSuccess: (version) => {
      invalidateRegistry(selectedTemplateId, version.id)
      setSelectedVersionId(version.id)
      setCompareVersionId(selectedVersionId)
      setCloneModalOpen(false)
      setCloneForm(buildVersionForm())
      addToast('success', '이전 버전을 복제해 새 초안을 만들었습니다.')
    },
    onError: () => {
      addToast('error', '버전 복제에 실패했습니다.')
    },
  })

  const activateVersionMutation = useMutation({
    mutationFn: () => activateProposalTemplateRegistryVersion(selectedVersionId as number),
    onSuccess: (version) => {
      invalidateRegistry(selectedTemplateId, version.id)
      addToast('success', '버전을 활성화했습니다.')
    },
    onError: () => {
      addToast('error', '버전 활성화에 실패했습니다.')
    },
  })

  const saveRegistryMutation = useMutation({
    mutationFn: async () => {
      try {
        return await saveProposalTemplateRegistryVersion(selectedVersionId as number, {
          sheets: draftSheets.map((sheet) => ({
            sheet_code: sheet.sheet_code.trim(),
            sheet_name: sheet.sheet_name.trim(),
            sheet_kind: sheet.sheet_kind.trim() || 'table',
            display_order: sheet.display_order,
            is_required: sheet.is_required,
            notes: asNullable(sheet.notes),
          })),
          field_mappings: draftFieldMappings
            .filter((row) => row.sheet_code.trim() && row.field_key.trim() && row.target_cell.trim())
            .map((row) => ({
              sheet_code: row.sheet_code.trim(),
              field_key: row.field_key.trim(),
              target_cell: row.target_cell.trim(),
              value_source: asNullable(row.value_source),
              transform_rule: asNullable(row.transform_rule),
              default_value: row.default_value_text.trim() ? parseJsonInput(row.default_value_text, null) : null,
              source_note_hint: asNullable(row.source_note_hint),
              is_required: row.is_required,
              display_order: row.display_order,
            })),
          table_mappings: draftTableMappings
            .filter((row) => row.sheet_code.trim() && row.table_key.trim() && row.start_cell.trim() && row.row_source.trim())
            .map((row) => ({
              sheet_code: row.sheet_code.trim(),
              table_key: row.table_key.trim(),
              start_cell: row.start_cell.trim(),
              row_source: row.row_source.trim(),
              columns: parseJsonInput(row.columns_text, []),
              row_key_field: asNullable(row.row_key_field),
              append_mode: row.append_mode.trim() || 'insert',
              max_rows: row.max_rows.trim() ? Number(row.max_rows) : null,
              notes: asNullable(row.notes),
            })),
          validation_rules: draftValidationRules
            .filter((row) => row.rule_code.trim() && row.rule_type.trim() && row.message.trim())
            .map((row) => ({
              sheet_code: asNullable(row.sheet_code),
              rule_code: row.rule_code.trim(),
              rule_type: row.rule_type.trim(),
              severity: row.severity.trim() || 'error',
              target_ref: asNullable(row.target_ref),
              rule_payload: parseJsonInput(row.rule_payload_text, {}),
              message: row.message.trim(),
            })),
        })
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        throw new Error('레지스트리 저장 중 형식 오류가 발생했습니다.')
      }
    },
    onSuccess: (version) => {
      invalidateRegistry(selectedTemplateId, version.id)
      addToast('success', '시트/매핑/검증 규칙을 저장했습니다.')
    },
    onError: () => {
      addToast('error', '저장에 실패했습니다. JSON 형식과 필수값을 확인해 주세요.')
    },
  })

  if (templatesQuery.isLoading) {
    return <PageLoading />
  }

  const openVersionModal = () => {
    setVersionForm(buildVersionForm())
    setVersionModalOpen(true)
  }

  const openCloneModal = () => {
    if (!selectedVersion) return
    setCloneForm({
      version_label: `${selectedVersion.version_label}-copy`,
      status: 'draft',
      source_path: selectedVersion.source_path ?? '',
      effective_from: selectedVersion.effective_from ?? '',
      effective_to: selectedVersion.effective_to ?? '',
      notes: selectedVersion.notes ?? '',
    })
    setCloneModalOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionScaffold
          title="양식 마스터"
          description="기관별 제안서 양식을 묶고 활성 버전을 추적합니다."
          actions={
            <button type="button" className="primary-btn" onClick={() => setTemplateModalOpen(true)}>
              <Plus size={16} />
              새 양식
            </button>
          }
        >
          <div className="space-y-3">
            {templatesQuery.data && templatesQuery.data.length > 0 ? (
              templatesQuery.data.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    template.id === selectedTemplateId
                      ? 'border-[#2563eb] bg-[linear-gradient(135deg,#eff6ff,white)] shadow-[0_16px_40px_rgba(37,99,235,0.12)]'
                      : 'border-[#d8e5fb] bg-white hover:bg-[#f8fbff]'
                  }`}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#0f172a]">{template.name}</div>
                      <div className="mt-1 text-xs text-[#64748b]">{template.code}</div>
                    </div>
                    <span className={template.is_active ? 'tag tag-emerald' : 'tag tag-gray'}>
                      {template.is_active ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-[#f8fafc] px-2 py-1 text-[#475569]">버전 {template.version_count}</span>
                    {template.active_version_label ? (
                      <span className="rounded-full bg-[#ecfeff] px-2 py-1 text-[#0f766e]">현재 {template.active_version_label}</span>
                    ) : (
                      <span className="rounded-full bg-[#fff7ed] px-2 py-1 text-[#b45309]">활성 버전 없음</span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                message="등록된 제안서 양식이 없습니다."
                className="py-10"
                action={() => setTemplateModalOpen(true)}
                actionLabel="첫 양식 등록"
              />
            )}
          </div>
        </SectionScaffold>

        {!selectedTemplate ? (
          <EmptyState message="왼쪽에서 양식을 선택하거나 새 양식을 등록해 주세요." className="py-20" />
        ) : (
          <div className="space-y-4">
            <SectionScaffold
              title={selectedTemplate.name}
              description="원본 엑셀 경로로 버전을 만들고, 새 양식이 오면 복제 후 비교해 변경점을 확인합니다."
              actions={
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="secondary-btn" onClick={() => setTemplateModalOpen(true)}>
                    양식 추가
                  </button>
                  <button type="button" className="primary-btn" onClick={openVersionModal}>
                    <Plus size={16} />
                    새 버전
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-[#d8e5fb] bg-[linear-gradient(135deg,#eff6ff,white)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">양식 코드</div>
                  <div className="mt-2 text-sm font-semibold text-[#0f172a]">{selectedTemplate.code}</div>
                </div>
                <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">기관 유형</div>
                  <div className="mt-2 text-sm font-semibold text-[#0f172a]">{selectedTemplate.institution_type || '-'}</div>
                </div>
                <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">현재 활성</div>
                  <div className="mt-2 text-sm font-semibold text-[#0f172a]">{selectedTemplate.active_version_label || '없음'}</div>
                </div>
                <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">업데이트</div>
                  <div className="mt-2 text-sm font-semibold text-[#0f172a]">{formatDate(selectedTemplate.updated_at)}</div>
                </div>
              </div>
              {selectedTemplate.description ? (
                <div className="rounded-2xl border border-[#d8e5fb] bg-[#f8fbff] px-4 py-3 text-sm text-[#475569]">
                  {selectedTemplate.description}
                </div>
              ) : null}
            </SectionScaffold>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
              <SectionScaffold title="버전 목록" description="선택 버전이 비교 기준입니다." className="h-full">
                <div className="space-y-3">
                  {versions.length > 0 ? (
                    versions.map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                          version.id === selectedVersionId
                            ? 'border-[#2563eb] bg-[linear-gradient(135deg,#eff6ff,white)] shadow-[0_16px_40px_rgba(37,99,235,0.12)]'
                            : 'border-[#d8e5fb] bg-white hover:bg-[#f8fbff]'
                        }`}
                        onClick={() => setSelectedVersionId(version.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#0f172a]">{version.version_label}</div>
                            <div className="mt-1 text-xs text-[#64748b]">{formatDateTime(version.created_at)}</div>
                          </div>
                          <span className={statusTagClass(version.status)}>{version.status}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-[#f8fafc] px-2 py-1 text-[#475569]">시트 {version.sheet_count}</span>
                          <span className="rounded-full bg-[#f8fafc] px-2 py-1 text-[#475569]">필드 {version.field_mapping_count}</span>
                          <span className="rounded-full bg-[#f8fafc] px-2 py-1 text-[#475569]">테이블 {version.table_mapping_count}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <EmptyState
                      message="등록된 버전이 없습니다."
                      className="py-12"
                      action={openVersionModal}
                      actionLabel="첫 버전 등록"
                    />
                  )}
                </div>
              </SectionScaffold>

              {!selectedVersion ? (
                <EmptyState message="버전을 선택하면 시트 카탈로그와 비교 작업대가 표시됩니다." className="py-20" />
              ) : (
                <div className="space-y-4">
                  <SectionScaffold
                    title={`버전 ${selectedVersion.version_label}`}
                    description="원본 경로, 시트 수, 매핑 수를 확인하고 바로 복제하거나 활성화할 수 있습니다."
                    actions={
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="secondary-btn" onClick={openCloneModal}>
                          <Copy size={16} />
                          복제
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => saveRegistryMutation.mutate()}
                          disabled={saveRegistryMutation.isPending}
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => void queryClient.invalidateQueries({ queryKey: ['proposal-template-version', selectedVersionId] })}
                        >
                          새로고침
                        </button>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => activateVersionMutation.mutate()}
                          disabled={selectedVersion.status === 'active' || activateVersionMutation.isPending}
                        >
                          <Check size={16} />
                          활성화
                        </button>
                      </div>
                    }
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">상태</div>
                        <div className="mt-2"><span className={statusTagClass(selectedVersion.status)}>{selectedVersion.status}</span></div>
                      </div>
                      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">시트</div>
                        <div className="mt-2 text-sm font-semibold text-[#0f172a]">{selectedVersion.sheet_count}</div>
                      </div>
                      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">필드 매핑</div>
                        <div className="mt-2 text-sm font-semibold text-[#0f172a]">{selectedVersion.field_mapping_count}</div>
                      </div>
                      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">테이블 매핑</div>
                        <div className="mt-2 text-sm font-semibold text-[#0f172a]">{selectedVersion.table_mapping_count}</div>
                      </div>
                      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">검증 규칙</div>
                        <div className="mt-2 text-sm font-semibold text-[#0f172a]">{selectedVersion.validation_rule_count}</div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#d8e5fb] bg-[#f8fbff] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">원본 엑셀 경로</div>
                      <div className="mt-2 break-all text-sm text-[#334155]">{selectedVersion.source_path || '미지정'}</div>
                    </div>
                    {selectedVersion.notes ? (
                      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3 text-sm text-[#475569]">
                        {selectedVersion.notes}
                      </div>
                    ) : null}
                  </SectionScaffold>

                  <SectionScaffold
                    title="매핑 편집"
                    description="시트 구조와 자동 채움 규칙을 수정한 뒤 전체 저장합니다."
                    actions={
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => saveRegistryMutation.mutate()}
                        disabled={saveRegistryMutation.isPending}
                      >
                        전체 저장
                      </button>
                    }
                  >
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-[#d8e5fb] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-[#0f172a]">시트</div>
                            <div className="text-xs text-[#64748b]">코드, 이름, 종류, 순서를 관리합니다.</div>
                          </div>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setDraftSheets((prev) => [
                                ...prev,
                                {
                                  sheet_code: `sheet_${prev.length + 1}`,
                                  sheet_name: '',
                                  sheet_kind: 'table',
                                  display_order: prev.length,
                                  is_required: true,
                                  notes: '',
                                },
                              ])
                            }
                          >
                            + 시트
                          </button>
                        </div>
                        <div className="space-y-2">
                          {draftSheets.map((sheet, index) => (
                            <div key={`${sheet.sheet_code}-${index}`} className="grid grid-cols-1 gap-2 rounded-2xl border border-[#e2e8f0] bg-[#f8fbff] p-3 lg:grid-cols-[1fr_1.2fr_0.8fr_0.7fr_0.7fr_auto]">
                              <input value={sheet.sheet_code} onChange={(event) => setDraftSheets((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, sheet_code: event.target.value } : row))} placeholder="sheet_code" />
                              <input value={sheet.sheet_name} onChange={(event) => setDraftSheets((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, sheet_name: event.target.value } : row))} placeholder="시트명" />
                              <select value={sheet.sheet_kind} onChange={(event) => setDraftSheets((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, sheet_kind: event.target.value } : row))}>
                                <option value="table">table</option>
                                <option value="scalar">scalar</option>
                              </select>
                              <input type="number" value={sheet.display_order} onChange={(event) => setDraftSheets((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, display_order: Number(event.target.value || 0) } : row))} placeholder="순서" />
                              <label className="flex items-center gap-2 rounded-xl border border-[#d8e5fb] bg-white px-3 text-sm text-[#334155]">
                                <input type="checkbox" checked={sheet.is_required} onChange={(event) => setDraftSheets((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, is_required: event.target.checked } : row))} />
                                필수
                              </label>
                              <button type="button" className="secondary-btn" onClick={() => setDraftSheets((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>제거</button>
                              <textarea className="lg:col-span-6" rows={2} value={sheet.notes} onChange={(event) => setDraftSheets((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, notes: event.target.value } : row))} placeholder="메모" />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#d8e5fb] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-[#0f172a]">필드 매핑</div>
                            <div className="text-xs text-[#64748b]">고정 셀 값을 관리합니다.</div>
                          </div>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setDraftFieldMappings((prev) => [
                                ...prev,
                                {
                                  sheet_code: draftSheets[0]?.sheet_code ?? '',
                                  field_key: '',
                                  target_cell: '',
                                  value_source: '',
                                  transform_rule: '',
                                  default_value_text: '',
                                  source_note_hint: '',
                                  is_required: false,
                                  display_order: prev.length,
                                },
                              ])
                            }
                          >
                            + 필드
                          </button>
                        </div>
                        <div className="space-y-2">
                          {draftFieldMappings.map((row, index) => (
                            <div key={`${row.sheet_code}-${row.field_key}-${index}`} className="grid grid-cols-1 gap-2 rounded-2xl border border-[#e2e8f0] bg-[#f8fbff] p-3 xl:grid-cols-[0.9fr_0.9fr_0.7fr_1.2fr_auto]">
                              <select value={row.sheet_code} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, sheet_code: event.target.value } : item))}>
                                <option value="">시트 선택</option>
                                {draftSheets.map((sheet) => (
                                  <option key={sheet.sheet_code} value={sheet.sheet_code}>{sheet.sheet_code}</option>
                                ))}
                              </select>
                              <input value={row.field_key} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, field_key: event.target.value } : item))} placeholder="field_key" />
                              <input value={row.target_cell} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, target_cell: event.target.value } : item))} placeholder="B2" />
                              <input value={row.value_source} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, value_source: event.target.value } : item))} placeholder="selected_gp_entity.name" />
                              <button type="button" className="secondary-btn" onClick={() => setDraftFieldMappings((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>제거</button>
                              <input value={row.transform_rule} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, transform_rule: event.target.value } : item))} placeholder="transform_rule" className="xl:col-span-2" />
                              <input value={row.source_note_hint} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, source_note_hint: event.target.value } : item))} placeholder="source note" className="xl:col-span-2" />
                              <label className="flex items-center gap-2 rounded-xl border border-[#d8e5fb] bg-white px-3 text-sm text-[#334155]">
                                <input type="checkbox" checked={row.is_required} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, is_required: event.target.checked } : item))} />
                                필수
                              </label>
                              <input type="number" value={row.display_order} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, display_order: Number(event.target.value || 0) } : item))} placeholder="순서" />
                              <textarea className="xl:col-span-5" rows={2} value={row.default_value_text} onChange={(event) => setDraftFieldMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, default_value_text: event.target.value } : item))} placeholder='default_value JSON' />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#d8e5fb] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-[#0f172a]">테이블 매핑</div>
                            <div className="text-xs text-[#64748b]">반복 행 규칙과 컬럼 JSON을 관리합니다.</div>
                          </div>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setDraftTableMappings((prev) => [
                                ...prev,
                                {
                                  sheet_code: draftSheets[0]?.sheet_code ?? '',
                                  table_key: '',
                                  start_cell: '',
                                  row_source: '',
                                  columns_text: '[]',
                                  row_key_field: '',
                                  append_mode: 'insert',
                                  max_rows: '',
                                  notes: '',
                                },
                              ])
                            }
                          >
                            + 테이블
                          </button>
                        </div>
                        <div className="space-y-2">
                          {draftTableMappings.map((row, index) => (
                            <div key={`${row.sheet_code}-${row.table_key}-${index}`} className="grid grid-cols-1 gap-2 rounded-2xl border border-[#e2e8f0] bg-[#f8fbff] p-3 xl:grid-cols-[0.9fr_0.9fr_0.7fr_1fr_auto]">
                              <select value={row.sheet_code} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, sheet_code: event.target.value } : item))}>
                                <option value="">시트 선택</option>
                                {draftSheets.map((sheet) => (
                                  <option key={sheet.sheet_code} value={sheet.sheet_code}>{sheet.sheet_code}</option>
                                ))}
                              </select>
                              <input value={row.table_key} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, table_key: event.target.value } : item))} placeholder="table_key" />
                              <input value={row.start_cell} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, start_cell: event.target.value } : item))} placeholder="A5" />
                              <input value={row.row_source} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, row_source: event.target.value } : item))} placeholder="proposal_managers" />
                              <button type="button" className="secondary-btn" onClick={() => setDraftTableMappings((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>제거</button>
                              <input value={row.row_key_field} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, row_key_field: event.target.value } : item))} placeholder="row_key_field" />
                              <input value={row.append_mode} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, append_mode: event.target.value } : item))} placeholder="insert" />
                              <input value={row.max_rows} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, max_rows: event.target.value } : item))} placeholder="max_rows" />
                              <textarea className="xl:col-span-5" rows={4} value={row.columns_text} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, columns_text: event.target.value } : item))} placeholder='columns JSON' />
                              <textarea className="xl:col-span-5" rows={2} value={row.notes} onChange={(event) => setDraftTableMappings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))} placeholder="메모" />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#d8e5fb] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-[#0f172a]">검증 규칙</div>
                            <div className="text-xs text-[#64748b]">필수값과 경고 메시지를 관리합니다.</div>
                          </div>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setDraftValidationRules((prev) => [
                                ...prev,
                                {
                                  sheet_code: draftSheets[0]?.sheet_code ?? '',
                                  rule_code: '',
                                  rule_type: '',
                                  severity: 'error',
                                  target_ref: '',
                                  rule_payload_text: '{}',
                                  message: '',
                                },
                              ])
                            }
                          >
                            + 규칙
                          </button>
                        </div>
                        <div className="space-y-2">
                          {draftValidationRules.map((row, index) => (
                            <div key={`${row.sheet_code}-${row.rule_code}-${index}`} className="grid grid-cols-1 gap-2 rounded-2xl border border-[#e2e8f0] bg-[#f8fbff] p-3 xl:grid-cols-[0.9fr_0.9fr_0.9fr_0.7fr_auto]">
                              <select value={row.sheet_code} onChange={(event) => setDraftValidationRules((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, sheet_code: event.target.value } : item))}>
                                <option value="">시트 공통</option>
                                {draftSheets.map((sheet) => (
                                  <option key={sheet.sheet_code} value={sheet.sheet_code}>{sheet.sheet_code}</option>
                                ))}
                              </select>
                              <input value={row.rule_code} onChange={(event) => setDraftValidationRules((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, rule_code: event.target.value } : item))} placeholder="rule_code" />
                              <input value={row.rule_type} onChange={(event) => setDraftValidationRules((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, rule_type: event.target.value } : item))} placeholder="required / max_rows" />
                              <select value={row.severity} onChange={(event) => setDraftValidationRules((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, severity: event.target.value } : item))}>
                                <option value="error">error</option>
                                <option value="warning">warning</option>
                              </select>
                              <button type="button" className="secondary-btn" onClick={() => setDraftValidationRules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>제거</button>
                              <input className="xl:col-span-2" value={row.target_ref} onChange={(event) => setDraftValidationRules((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, target_ref: event.target.value } : item))} placeholder="target_ref" />
                              <input className="xl:col-span-3" value={row.message} onChange={(event) => setDraftValidationRules((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, message: event.target.value } : item))} placeholder="message" />
                              <textarea className="xl:col-span-5" rows={3} value={row.rule_payload_text} onChange={(event) => setDraftValidationRules((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, rule_payload_text: event.target.value } : item))} placeholder='rule_payload JSON' />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </SectionScaffold>

                  <SectionScaffold
                    title="시트 카탈로그"
                    description="원본 양식에서 읽은 시트 구조입니다."
                    actions={
                      <div className="flex flex-wrap gap-2">
                        <span className="tag tag-blue">기준 {selectedVersion.version_label}</span>
                        {compareVersionId ? (
                          <span className="tag tag-gray">
                            비교 {versions.find((row) => row.id === compareVersionId)?.version_label || compareVersionId}
                          </span>
                        ) : null}
                      </div>
                    }
                  >
                    <div className="overflow-hidden rounded-2xl border border-[#d8e5fb] bg-white">
                      <div className="grid grid-cols-[1.2fr_1.1fr_0.8fr_0.7fr] gap-px bg-[#d8e5fb] text-[11px] font-semibold text-[#334155]">
                        <div className="bg-[#eff6ff] px-3 py-2">시트 코드</div>
                        <div className="bg-[#eff6ff] px-3 py-2">시트명</div>
                        <div className="bg-[#eff6ff] px-3 py-2">종류</div>
                        <div className="bg-[#eff6ff] px-3 py-2">필수</div>
                      </div>
                      <div className="divide-y divide-[#e2e8f0]">
                        {selectedVersion.sheets.map((sheet) => (
                          <div key={sheet.id} className="grid grid-cols-[1.2fr_1.1fr_0.8fr_0.7fr] items-center bg-white px-0 text-sm text-[#334155]">
                            <div className="px-3 py-3 font-medium">{sheet.sheet_code}</div>
                            <div className="px-3 py-3">{sheet.sheet_name}</div>
                            <div className="px-3 py-3">{sheet.sheet_kind}</div>
                            <div className="px-3 py-3">{sheet.is_required ? 'Y' : '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </SectionScaffold>

                  <SectionScaffold
                    title="버전 비교"
                    description="양식이 바뀌었을 때 바뀐 시트와 매핑만 빠르게 확인합니다."
                    actions={
                      <div className="flex items-center gap-2">
                        <GitBranch size={16} className="text-[#64748b]" />
                        <select
                          value={compareVersionId ?? ''}
                          onChange={(event) => setCompareVersionId(Number(event.target.value || 0) || null)}
                          className="min-w-[180px]"
                        >
                          <option value="">비교 버전 선택</option>
                          {versions
                            .filter((row) => row.id !== selectedVersionId)
                            .map((version) => (
                              <option key={version.id} value={version.id}>
                                {version.version_label}
                              </option>
                            ))}
                        </select>
                      </div>
                    }
                  >
                    {!compareVersionId ? (
                      <EmptyState message="비교할 다른 버전을 선택해 주세요." className="py-10" />
                    ) : versionDiffQuery.isLoading ? (
                      <PageLoading />
                    ) : versionDiffQuery.data ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-[#d8e5fb] bg-[linear-gradient(135deg,#eff6ff,#f8fbff)] px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="tag tag-indigo">{versionDiffQuery.data.base_version_label}</span>
                            <span className="text-sm text-[#64748b]">vs</span>
                            <span className="tag tag-emerald">{versionDiffQuery.data.target_version_label}</span>
                            <span className="ml-auto rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0f172a]">
                              변경 시트 {versionDiffQuery.data.changed_sheet_codes.length}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {versionDiffQuery.data.changed_sheet_codes.length > 0 ? (
                              versionDiffQuery.data.changed_sheet_codes.map((sheetCode) => (
                                <span key={sheetCode} className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[#1d4ed8]">
                                  {sheetCode}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-[#64748b]">비교 결과 차이가 없습니다.</span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          <DiffGroup title="시트 변경" description="시트 추가, 삭제, 이름 변경" rows={versionDiffQuery.data.sheet_changes} />
                          <DiffGroup title="필드 매핑 변경" description="고정 셀 매핑 차이" rows={versionDiffQuery.data.field_mapping_changes} />
                          <DiffGroup title="테이블 매핑 변경" description="반복 행 주입 규칙 차이" rows={versionDiffQuery.data.table_mapping_changes} />
                          <DiffGroup title="검증 규칙 변경" description="누락값 및 행 제한 규칙 차이" rows={versionDiffQuery.data.validation_rule_changes} />
                        </div>
                      </div>
                    ) : (
                      <EmptyState message="비교 결과를 불러오지 못했습니다." className="py-10" />
                    )}
                  </SectionScaffold>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <FormModal
        open={templateModalOpen}
        title="새 양식 등록"
        onClose={() => setTemplateModalOpen(false)}
        onSubmit={() => createTemplateMutation.mutate()}
        submitLabel="양식 등록"
        loading={createTemplateMutation.isPending}
      >
        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm font-medium text-[#334155]">
            양식 코드
            <input value={templateForm.code} onChange={(event) => setTemplateForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="growth-finance-2026" />
          </label>
          <label className="text-sm font-medium text-[#334155]">
            양식명
            <input value={templateForm.name} onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="성장금융 제안서" />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[#334155]">
              기관 유형
              <input value={templateForm.institution_type} onChange={(event) => setTemplateForm((prev) => ({ ...prev, institution_type: event.target.value }))} placeholder="growth / nong / motae" />
            </label>
            <label className="text-sm font-medium text-[#334155]">
              legacy template_type
              <input value={templateForm.legacy_template_type} onChange={(event) => setTemplateForm((prev) => ({ ...prev, legacy_template_type: event.target.value }))} placeholder="growth-finance" />
            </label>
          </div>
          <label className="text-sm font-medium text-[#334155]">
            설명
            <textarea value={templateForm.description} onChange={(event) => setTemplateForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} placeholder="기관/연도별 양식 특징을 적어 두면 이후 버전 비교 때 맥락이 남습니다." />
          </label>
        </div>
      </FormModal>

      <FormModal
        open={versionModalOpen}
        title="새 버전 등록"
        onClose={() => setVersionModalOpen(false)}
        onSubmit={() => createVersionMutation.mutate()}
        submitLabel="버전 등록"
        loading={createVersionMutation.isPending}
        size="lg"
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[#334155]">
              버전 라벨
              <input value={versionForm.version_label} onChange={(event) => setVersionForm((prev) => ({ ...prev, version_label: event.target.value }))} placeholder="2026-v1" />
            </label>
            <label className="text-sm font-medium text-[#334155]">
              상태
              <select value={versionForm.status} onChange={(event) => setVersionForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="draft">draft</option>
                <option value="active">active</option>
              </select>
            </label>
          </div>
          <label className="text-sm font-medium text-[#334155]">
            원본 엑셀 경로
            <input value={versionForm.source_path} onChange={(event) => setVersionForm((prev) => ({ ...prev, source_path: event.target.value }))} placeholder="C:\\Users\\1llal\\Desktop\\제안서 엑셀 양식\\성장금융_위탁운용사 선정 제출서류 및 서식(엑셀파일).xlsx" />
          </label>
          <div className="rounded-2xl border border-[#d8e5fb] bg-[#f8fbff] px-4 py-3 text-sm text-[#475569]">
            현재 UI에서는 원본 엑셀 경로를 넣으면 시트 목록을 자동으로 읽어와 버전을 만듭니다.
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[#334155]">
              적용 시작일
              <input type="date" value={versionForm.effective_from} onChange={(event) => setVersionForm((prev) => ({ ...prev, effective_from: event.target.value }))} />
            </label>
            <label className="text-sm font-medium text-[#334155]">
              적용 종료일
              <input type="date" value={versionForm.effective_to} onChange={(event) => setVersionForm((prev) => ({ ...prev, effective_to: event.target.value }))} />
            </label>
          </div>
          <label className="text-sm font-medium text-[#334155]">
            메모
            <textarea value={versionForm.notes} onChange={(event) => setVersionForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} placeholder="예: 2026년 모집공고 기준 시트 순서 변경" />
          </label>
        </div>
      </FormModal>

      <FormModal
        open={cloneModalOpen}
        title="버전 복제"
        onClose={() => setCloneModalOpen(false)}
        onSubmit={() => cloneVersionMutation.mutate()}
        submitLabel="복제 생성"
        loading={cloneVersionMutation.isPending}
        size="lg"
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-2xl border border-[#d8e5fb] bg-[linear-gradient(135deg,#eff6ff,white)] px-4 py-3 text-sm text-[#334155]">
            시트, 필드 매핑, 테이블 매핑, 검증 규칙을 그대로 복제한 뒤 새 버전 초안으로 저장합니다.
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[#334155]">
              새 버전 라벨
              <input value={cloneForm.version_label} onChange={(event) => setCloneForm((prev) => ({ ...prev, version_label: event.target.value }))} placeholder="2026-v2" />
            </label>
            <label className="text-sm font-medium text-[#334155]">
              상태
              <select value={cloneForm.status} onChange={(event) => setCloneForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="draft">draft</option>
                <option value="active">active</option>
              </select>
            </label>
          </div>
          <label className="text-sm font-medium text-[#334155]">
            원본 엑셀 경로
            <input value={cloneForm.source_path} onChange={(event) => setCloneForm((prev) => ({ ...prev, source_path: event.target.value }))} />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[#334155]">
              적용 시작일
              <input type="date" value={cloneForm.effective_from} onChange={(event) => setCloneForm((prev) => ({ ...prev, effective_from: event.target.value }))} />
            </label>
            <label className="text-sm font-medium text-[#334155]">
              적용 종료일
              <input type="date" value={cloneForm.effective_to} onChange={(event) => setCloneForm((prev) => ({ ...prev, effective_to: event.target.value }))} />
            </label>
          </div>
          <label className="text-sm font-medium text-[#334155]">
            메모
            <textarea value={cloneForm.notes} onChange={(event) => setCloneForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} />
          </label>
        </div>
      </FormModal>
    </div>
  )
}
