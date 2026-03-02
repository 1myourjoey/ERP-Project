import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import RegistrationWizard from '../components/templates/RegistrationWizard'
import DocumentEditorModal, {
  type TemplateCustomData,
  type TemplateKind,
} from '../components/DocumentEditorModal'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import {
  downloadTemplateGeneratedDocument,
  fetchDocumentTemplates,
  fetchDocumentMarkerDefinitions,
  fetchFundLPs,
  fetchFunds,
  generateTemplateDocument,
  generateTemplateDocumentsBulk,
  previewGeneratedTemplateDocument,
  previewTemplate,
  resolveDocumentVariables,
  updateTemplateCustomData,
  type DocumentMarkerDefinition,
  type DocumentTemplate,
  type Fund,
  type LP,
  type TemplateGeneratedDocumentItem,
} from '../lib/api'

const DEFAULT_OFFICIAL_CUSTOM: TemplateCustomData = {
  company_header: {
    company_name: 'Evergreen Partners',
    address: '',
    tel: '02-0000-0000',
    fax: '02-0000-0000',
  },
  body_text:
    '{{fund_name}} 관련 업데이트 내용을 확인하시고 납입 기한을 검토해 주시기 바랍니다.',
  payment_info: {
    unit_price: '1,000,000',
    bank_account: '납입 계좌 정보',
    note: '',
  },
  attachments: [{ no: '1', name: '조합 계약서', ref: '별첨 1', stamp_required: false }],
  required_documents_text: '신분증 사본, 인감증명서',
  cover_attachments: ['결성총회 소집통지서'],
}

const DEFAULT_ASSEMBLY_CUSTOM: TemplateCustomData = {
  greeting: '항상 조합 운용에 협조해 주셔서 감사합니다.',
  regulation_article: 'Article 15',
  body_text:
    '{{regulation_article}}에 따라 {{fund_name}} 관련 안건에 대해 총회를 개최하오니 검토 후 의결해 주시기 바랍니다.',
  agendas: ['안건 1: 제안사항 승인 여부'],
}

const DEFAULT_WRITTEN_RESOLUTION_CUSTOM: TemplateCustomData = {
  introduction_text:
    '직접 참석이 어려워 아래 안건에 대해 서면결의를 요청드립니다.',
  agendas: ['안건 1: 제안사항 승인 여부'],
  vote_note: '*각 안건별 찬반을 명확히 표시해 주세요.',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneCustomData(value: TemplateCustomData): TemplateCustomData {
  return JSON.parse(JSON.stringify(value)) as TemplateCustomData
}

function parseCustomData(raw: string | null | undefined): TemplateCustomData {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function detectTemplateKind(template: DocumentTemplate, customData: TemplateCustomData): TemplateKind {
  const keys = new Set(Object.keys(customData))
  if (
    keys.has('company_header') ||
    keys.has('payment_info') ||
    keys.has('attachments') ||
    keys.has('required_documents_text') ||
    keys.has('cover_attachments')
  ) {
    return 'official'
  }
  if (keys.has('greeting') || keys.has('regulation_article')) {
    return 'assembly'
  }
  if (keys.has('introduction_text') || keys.has('vote_note')) {
    return 'resolution'
  }

  const source = `${template.builder_name ?? ''} ${template.name}`.toLowerCase()
  if (source.includes('official') || source.includes('gongmun')) return 'official'
  if (source.includes('assembly') || source.includes('notice')) return 'assembly'
  return 'resolution'
}

function defaultCustomDataForKind(kind: TemplateKind): TemplateCustomData {
  if (kind === 'official') return cloneCustomData(DEFAULT_OFFICIAL_CUSTOM)
  if (kind === 'assembly') return cloneCustomData(DEFAULT_ASSEMBLY_CUSTOM)
  return cloneCustomData(DEFAULT_WRITTEN_RESOLUTION_CUSTOM)
}

function parseVariables(raw: string): string[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value ?? '').trim()).filter(Boolean)
    }
  } catch {
    // Fall back to simple split.
  }
  return raw
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseExtraVarsInput(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!raw.trim()) return result

  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.includes('=') ? line.indexOf('=') : line.indexOf(':')
      if (separatorIndex <= 0) return
      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()
      if (!key) return
      result[key] = value
    })
  return result
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function formatTemplateDate(value?: string | null): string {
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

export default function TemplateManagementPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editData, setEditData] = useState<TemplateCustomData>({})
  const [previewFundId, setPreviewFundId] = useState<number | ''>('')
  const [wizardFundId, setWizardFundId] = useState<number | ''>('')
  const [wizardMode, setWizardMode] = useState<'single' | 'bulk'>('single')
  const [wizardLpId, setWizardLpId] = useState<number | ''>('')
  const [extraVarsText, setExtraVarsText] = useState('')
  const [resolvedVariables, setResolvedVariables] = useState<Record<string, string>>({})
  const [bulkResults, setBulkResults] = useState<TemplateGeneratedDocumentItem[]>([])

  const { data: templates = [], isLoading } = useQuery<DocumentTemplate[]>({
    queryKey: ['documentTemplates'],
    queryFn: () => fetchDocumentTemplates(),
  })

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  const { data: templateMarkers = [] } = useQuery<DocumentMarkerDefinition[]>({
    queryKey: ['documentMarkers', selectedTemplateId],
    queryFn: () =>
      selectedTemplateId ? fetchDocumentMarkerDefinitions(selectedTemplateId) : Promise.resolve([]),
    enabled: selectedTemplateId !== null,
  })

  const { data: wizardLps = [] } = useQuery<LP[]>({
    queryKey: ['fundLps', wizardFundId],
    queryFn: () => fetchFundLPs(Number(wizardFundId)),
    enabled: wizardFundId !== '',
  })

  useEffect(() => {
    if (selectedTemplateId !== null || templates.length === 0) return
    setSelectedTemplateId(templates[0].id)
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (wizardFundId !== '' || funds.length === 0) return
    setWizardFundId(funds[0].id)
  }, [wizardFundId, funds])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  )

  useEffect(() => {
    if (!selectedTemplate) return
    const parsed = parseCustomData(selectedTemplate.custom_data)
    const kind = detectTemplateKind(selectedTemplate, parsed)
    const initial = Object.keys(parsed).length > 0 ? parsed : defaultCustomDataForKind(kind)
    setEditData(cloneCustomData(initial))
  }, [selectedTemplate])

  const templateKind = useMemo(() => {
    if (!selectedTemplate) return null
    return detectTemplateKind(selectedTemplate, editData)
  }, [selectedTemplate, editData])

  const variables = useMemo(
    () => (selectedTemplate ? parseVariables(selectedTemplate.variables ?? '') : []),
    [selectedTemplate],
  )

  const saveMutation = useMutation({
    mutationFn: ({ templateId, customData }: { templateId: number; customData: TemplateCustomData }) =>
      updateTemplateCustomData(templateId, customData),
    onSuccess: (updatedTemplate) => {
      const parsed = parseCustomData(updatedTemplate.custom_data)
      setEditData(cloneCustomData(parsed))
      queryClient.invalidateQueries({ queryKey: ['documentTemplates'] })
      addToast('success', '템플릿 설정을 저장했습니다.')
    },
    onError: () => {
      addToast('error', '템플릿 설정 저장에 실패했습니다.')
    },
  })

  const previewMutation = useMutation({
    mutationFn: ({
      templateId,
      fundId,
      customData,
    }: {
      templateId: number
      fundId?: number
      customData: TemplateCustomData
    }) => previewTemplate(templateId, fundId, customData),
  })

  const resolveVariablesMutation = useMutation({
    mutationFn: resolveDocumentVariables,
    onSuccess: (response) => {
      setResolvedVariables(response.variables)
    },
    onError: () => {
      addToast('error', '템플릿 변수 확인에 실패했습니다.')
    },
  })

  const wizardPreviewMutation = useMutation({
    mutationFn: previewGeneratedTemplateDocument,
  })

  const wizardGenerateSingleMutation = useMutation({
    mutationFn: generateTemplateDocument,
  })

  const wizardGenerateBulkMutation = useMutation({
    mutationFn: generateTemplateDocumentsBulk,
  })

  const handleSave = () => {
    if (!selectedTemplate) return
    saveMutation.mutate({ templateId: selectedTemplate.id, customData: editData })
  }

  const handlePreview = async () => {
    if (!selectedTemplate) return
    try {
      const blob = await previewMutation.mutateAsync({
        templateId: selectedTemplate.id,
        fundId: previewFundId === '' ? undefined : previewFundId,
        customData: editData,
      })
      downloadBlob(blob, `preview_${selectedTemplate.name}.docx`)
    } catch {
      addToast('error', '미리보기 생성에 실패했습니다.')
    }
  }

  const handleResetToDefault = () => {
    if (!templateKind) return
    setEditData(defaultCustomDataForKind(templateKind))
    addToast('info', 'Reset to default template values.')
  }

  const handleTemplateClick = (template: DocumentTemplate) => {
    setSelectedTemplateId(template.id)
    setEditorOpen(true)
  }

  const handleTemplateRegistered = (templateId: number) => {
    queryClient.invalidateQueries({ queryKey: ['documentTemplates'] })
    setSelectedTemplateId(templateId)
  }

  const buildWizardPayload = () => {
    if (!selectedTemplate || wizardFundId === '') return null
    if (wizardMode === 'single' && wizardLpId === '') return null

    const extraVars = parseExtraVarsInput(extraVarsText)
    const mergedExtraVars = {
      ...extraVars,
      ...resolvedVariables,
    }

    return {
      fund_id: Number(wizardFundId),
      template_id: selectedTemplate.id,
      lp_id: wizardMode === 'single' ? Number(wizardLpId) : undefined,
      extra_vars: mergedExtraVars,
    }
  }

  const handleResolveWizardVariables = async () => {
    const payload = buildWizardPayload()
    if (!payload) {
      addToast('warning', '변수 확인 전 템플릿, 조합, LP를 선택하세요.')
      return
    }
    try {
      await resolveVariablesMutation.mutateAsync(payload)
      addToast('success', 'Fund/LP/GP 데이터에서 변수를 불러왔습니다.')
    } catch {
      // handled in mutation
    }
  }

  const handleWizardPreview = async () => {
    const payload = buildWizardPayload()
    if (!payload) {
      addToast('warning', '미리보기 전 템플릿, 조합, LP를 선택하세요.')
      return
    }
    try {
      const blob = await wizardPreviewMutation.mutateAsync(payload)
      downloadBlob(blob, `wizard_preview_${selectedTemplate?.name ?? 'template'}.docx`)
    } catch {
      addToast('error', 'Failed to generate wizard preview.')
    }
  }

  const handleWizardGenerate = async () => {
    const payload = buildWizardPayload()
    if (!payload) {
      addToast('warning', '생성 전 템플릿, 조합, LP를 선택하세요.')
      return
    }

    try {
      if (wizardMode === 'bulk') {
        const result = await wizardGenerateBulkMutation.mutateAsync({
          fund_id: payload.fund_id,
          template_id: payload.template_id,
          extra_vars: payload.extra_vars,
        })
        setBulkResults(result.documents)
        addToast('success', `${result.generated_count} documents generated for all LPs.`)
        return
      }

      const generated = await wizardGenerateSingleMutation.mutateAsync(payload)
      const blob = await downloadTemplateGeneratedDocument(generated.document_id)
      downloadBlob(blob, generated.filename)
      addToast('success', '문서를 생성하고 다운로드했습니다.')
    } catch {
      addToast('error', '문서 생성에 실패했습니다.')
    }
  }

  const displayedMarkerKeys = useMemo(() => {
    if (templateMarkers.length > 0) return templateMarkers.map((item) => item.marker)
    return variables
  }, [templateMarkers, variables])

  const markerMetaByKey = useMemo(
    () => new Map(templateMarkers.map((item) => [item.marker, item])),
    [templateMarkers],
  )

  useEffect(() => {
    if (wizardMode === 'bulk') {
      setWizardLpId('')
      return
    }
    if (wizardLpId === '' && wizardLps.length > 0) {
      setWizardLpId(wizardLps[0].id)
    }
  }, [wizardMode, wizardLpId, wizardLps])

  useEffect(() => {
    setBulkResults([])
  }, [selectedTemplateId, wizardFundId, wizardMode])

  const canRunWizard = selectedTemplate && wizardFundId !== '' && (wizardMode === 'bulk' || wizardLpId !== '')

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
      <h2 className="page-title">템플릿 관리</h2>
          <p className="page-subtitle">공문/결의서 템플릿을 수정하고 생성 전 미리보기를 확인하세요.</p>
        </div>
      </div>

      <RegistrationWizard onRegistered={handleTemplateRegistered} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card-base space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#0f1f3d]">템플릿 목록</p>
            <span className="text-xs text-[#64748b]">{templates.length}</span>
          </div>
          {isLoading ? (
            <PageLoading />
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#64748b]">등록된 템플릿이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => {
                const active = template.id === selectedTemplateId
                return (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      active ? 'border-[#b2cbfb] bg-[#f5f9ff]' : 'border-[#d8e5fb] bg-white hover:bg-[#f5f9ff]'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#0f1f3d]">{template.name}</p>
                    <p className="mt-1 text-xs text-[#64748b]">{template.category}</p>
                    <p className="mt-2 text-[11px] text-[#64748b]">
                      수정일: {formatTemplateDate(template.updated_at ?? template.created_at)}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card-base space-y-3 xl:col-span-2">
          {!selectedTemplate ? (
            isLoading ? (
              <PageLoading />
            ) : (
              <p className="py-8 text-center text-sm text-[#64748b]">템플릿을 선택하면 상세 화면이 표시됩니다.</p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xl font-bold text-[#0f1f3d]">{selectedTemplate.name}</p>
                  <p className="text-sm text-[#64748b]">
                    {selectedTemplate.description?.trim() || '설명 없음'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleResetToDefault}
                    className="secondary-btn"
                    disabled={!templateKind}
                  >
                    Reset Default
                  </button>
                  <button
                    onClick={handlePreview}
                    className="secondary-btn"
                    disabled={previewMutation.isPending}
                  >
                    {previewMutation.isPending ? '미리보기 생성 중...' : 'DOCX 미리보기'}
                  </button>
                  <button
                    onClick={handleSave}
                    className="primary-btn"
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditorOpen(true)} className="primary-btn">
                    편집기 열기
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
                  <p className="text-xs font-semibold uppercase text-[#64748b]">Metadata</p>
                  <dl className="mt-2 space-y-1 text-sm text-[#0f1f3d]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#64748b]">Category</dt>
                      <dd className="text-right">{selectedTemplate.category}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#64748b]">Builder</dt>
                      <dd className="text-right">{selectedTemplate.builder_name ?? '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#64748b]">Updated</dt>
                      <dd className="text-right">
                        {formatTemplateDate(selectedTemplate.updated_at ?? selectedTemplate.created_at)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
                  <label htmlFor="preview-fund" className="text-xs font-semibold uppercase text-[#64748b]">
                    미리보기 기준 조합
                  </label>
                  <select
                    id="preview-fund"
                    value={previewFundId}
                    onChange={(event) => setPreviewFundId(event.target.value ? Number(event.target.value) : '')}
                    className="mt-2 w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                  >
                    <option value="">조합 컨텍스트 없음</option>
                    {funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-[#64748b]">
                    미리보기 시 조합 데이터가 변수 치환에 사용됩니다.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[#d8e5fb] bg-white p-3">
                <p className="text-xs font-semibold uppercase text-[#64748b]">Variables</p>
                {variables.length === 0 ? (
                  <p className="mt-2 text-sm text-[#64748b]">등록된 변수 메타데이터가 없습니다.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {variables.map((variable) => (
                      <span
                        key={variable}
                        className="rounded-full border border-[#c5d8fb] bg-[#f5f9ff] px-2 py-0.5 text-xs text-[#1a3660]"
                      >
                        {variable}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#0f1f3d]">문서 생성 마법사</p>
                    <p className="text-xs text-[#64748b]">단일 LP 또는 전체 LP 문서 생성을 1~4단계로 진행합니다.</p>
                  </div>
                  <button
                    onClick={handleResolveWizardVariables}
                    className="secondary-btn"
                    disabled={!canRunWizard || resolveVariablesMutation.isPending}
                  >
                    {resolveVariablesMutation.isPending ? '변수 로딩 중...' : '변수 불러오기'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <div className="rounded-xl border border-[#d8e5fb] bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-[#64748b]">1단계. 템플릿</p>
                    <p className="mt-2 text-sm font-semibold text-[#0f1f3d]">{selectedTemplate.name}</p>
                    <p className="mt-1 text-xs text-[#64748b]">{selectedTemplate.category}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {displayedMarkerKeys.length === 0 ? (
                        <span className="text-xs text-[#64748b]">마커 메타데이터 없음</span>
                      ) : (
                        displayedMarkerKeys.slice(0, 10).map((marker) => (
                          <span
                            key={marker}
                            className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                          >
                            {`{{${marker}}}`}
                          </span>
                        ))
                      )}
                      {displayedMarkerKeys.length > 10 && (
                        <span className="text-[11px] text-[#64748b]">+{displayedMarkerKeys.length - 10}개 더보기</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#d8e5fb] bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-[#64748b]">2단계. 대상 선택</p>
                    <label className="mt-2 block text-xs text-[#64748b]">조합</label>
                    <select
                      value={wizardFundId}
                      onChange={(event) => setWizardFundId(event.target.value ? Number(event.target.value) : '')}
                      className="mt-1 w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    >
                      <option value="">조합 선택</option>
                      {funds.map((fund) => (
                        <option key={fund.id} value={fund.id}>
                          {fund.name}
                        </option>
                      ))}
                    </select>

                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="wizard-mode"
                          checked={wizardMode === 'single'}
                          onChange={() => setWizardMode('single')}
                        />
                        단일 LP
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="wizard-mode"
                          checked={wizardMode === 'bulk'}
                          onChange={() => setWizardMode('bulk')}
                        />
                        일괄(전체 LP)
                      </label>
                    </div>

                    {wizardMode === 'single' ? (
                      <>
                        <label className="mt-2 block text-xs text-[#64748b]">LP</label>
                        <select
                          value={wizardLpId}
                          onChange={(event) => setWizardLpId(event.target.value ? Number(event.target.value) : '')}
                          className="mt-1 w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                        >
                          <option value="">LP 선택</option>
                          {wizardLps.map((lp) => (
                            <option key={lp.id} value={lp.id}>
                              {lp.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-[#64748b]">일괄 생성 시 해당 조합의 LP별 DOCX가 1개씩 생성됩니다.</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-[#d8e5fb] bg-white p-3">
                  <p className="text-xs font-semibold uppercase text-[#64748b]">3단계. 변수 확인</p>
                  <label className="mt-2 block text-xs text-[#64748b]">추가 변수 (한 줄에 하나씩, key=value)</label>
                  <textarea
                    value={extraVarsText}
                    onChange={(event) => setExtraVarsText(event.target.value)}
                    className="mt-1 min-h-[72px] w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                    placeholder="분기=2026년 1분기"
                  />

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {displayedMarkerKeys.length === 0 ? (
                      <p className="text-sm text-[#64748b]">편집할 마커가 없습니다.</p>
                    ) : (
                      displayedMarkerKeys.map((key) => (
                        <label key={key} className="space-y-1">
                          <span className="text-[11px] text-[#64748b]">
                            {key}
                            {markerMetaByKey.get(key)?.description ? ` · ${markerMetaByKey.get(key)?.description}` : ''}
                          </span>
                          <input
                            type="text"
                            value={resolvedVariables[key] ?? ''}
                            onChange={(event) =>
                              setResolvedVariables((prev) => ({
                                ...prev,
                                [key]: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-[#d8e5fb] px-2 py-1.5 text-sm"
                          />
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-[#d8e5fb] bg-white p-3">
                  <p className="text-xs font-semibold uppercase text-[#64748b]">4단계. 미리보기 및 생성</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={handleWizardPreview}
                      className="secondary-btn"
                      disabled={!canRunWizard || wizardPreviewMutation.isPending}
                    >
                      {wizardPreviewMutation.isPending ? '미리보기 생성 중...' : '미리보기'}
                    </button>
                    <button
                      onClick={handleWizardGenerate}
                      className="primary-btn"
                      disabled={
                        !canRunWizard ||
                        wizardGenerateSingleMutation.isPending ||
                        wizardGenerateBulkMutation.isPending
                      }
                    >
                      {wizardGenerateSingleMutation.isPending || wizardGenerateBulkMutation.isPending
                        ? '생성 중...'
                        : wizardMode === 'bulk'
                          ? '일괄 생성'
                          : '생성 후 다운로드'}
                    </button>
                  </div>

                  {bulkResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {bulkResults.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-[#0f1f3d]">{item.filename}</p>
                            <p className="text-[11px] text-[#64748b]">{item.document_number || '-'}</p>
                          </div>
                          <button
                            className="secondary-btn"
                            onClick={async () => {
                              const blob = await downloadTemplateGeneratedDocument(item.id)
                              downloadBlob(blob, item.filename)
                            }}
                          >
                            다운로드
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedTemplate && templateKind && (
        <DocumentEditorModal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          template={selectedTemplate}
          templateKind={templateKind}
          editData={editData}
          onEditDataChange={setEditData}
          onSave={handleSave}
          onPreview={handlePreview}
          onReset={handleResetToDefault}
          isSaving={saveMutation.isPending}
          isPreviewing={previewMutation.isPending}
          funds={funds}
          previewFundId={previewFundId}
          onPreviewFundIdChange={setPreviewFundId}
        />
      )}
    </div>
  )
}

