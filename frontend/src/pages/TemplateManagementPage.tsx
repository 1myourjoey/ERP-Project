import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import DocumentEditorModal, {
  type TemplateCustomData,
  type TemplateKind,
} from '../components/DocumentEditorModal'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import {
  fetchDocumentTemplates,
  fetchFunds,
  previewTemplate,
  updateTemplateCustomData,
  type DocumentTemplate,
  type Fund,
} from '../lib/api'

const DEFAULT_OFFICIAL_CUSTOM: TemplateCustomData = {
  company_header: {
    company_name: 'Evergreen Partners',
    address: '',
    tel: '02-0000-0000',
    fax: '02-0000-0000',
  },
  body_text:
    'Please review the requested update for {{fund_name}} and confirm the payment deadline for this notice.',
  payment_info: {
    unit_price: '1,000,000',
    bank_account: 'Bank account information',
    note: '',
  },
  attachments: [{ no: '1', name: 'Fund Agreement', ref: 'Attachment 1', stamp_required: false }],
  required_documents_text: 'Copy of ID, personal seal certificate',
  cover_attachments: ['General assembly notice'],
}

const DEFAULT_ASSEMBLY_CUSTOM: TemplateCustomData = {
  greeting: 'Thank you for your continued support.',
  regulation_article: 'Article 15',
  body_text:
    'According to {{regulation_article}}, we are scheduling the assembly for {{fund_name}}. Please review and vote.',
  agendas: ['Agenda 1: Confirm and approve the proposal'],
}

const DEFAULT_WRITTEN_RESOLUTION_CUSTOM: TemplateCustomData = {
  introduction_text:
    'Because direct attendance is difficult, this written resolution is requested for the following agenda.',
  agendas: ['Agenda 1: Confirm and approve the proposal'],
  vote_note: '*Mark agree/disagree clearly for each item.',
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

  const { data: templates = [], isLoading } = useQuery<DocumentTemplate[]>({
    queryKey: ['documentTemplates'],
    queryFn: () => fetchDocumentTemplates(),
  })

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  useEffect(() => {
    if (selectedTemplateId !== null || templates.length === 0) return
    setSelectedTemplateId(templates[0].id)
  }, [selectedTemplateId, templates])

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
      addToast('success', 'Template settings saved.')
    },
    onError: () => {
      addToast('error', 'Failed to save template settings.')
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
      addToast('error', 'Failed to generate preview.')
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

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Template Management</h2>
          <p className="page-subtitle">Edit official templates and preview output before generating documents.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card-base space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Template List</p>
            <span className="text-xs text-gray-400">{templates.length}</span>
          </div>
          {isLoading ? (
            <PageLoading />
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No templates found.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => {
                const active = template.id === selectedTemplateId
                return (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-800">{template.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{template.category}</p>
                    <p className="mt-2 text-[11px] text-gray-400">
                      Updated: {formatTemplateDate(template.updated_at ?? template.created_at)}
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
              <p className="py-8 text-center text-sm text-gray-400">Select a template to continue.</p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xl font-bold text-gray-800">{selectedTemplate.name}</p>
                  <p className="text-sm text-gray-500">
                    {selectedTemplate.description?.trim() || 'No description'}
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
                    {previewMutation.isPending ? 'Previewing...' : 'Preview DOCX'}
                  </button>
                  <button
                    onClick={handleSave}
                    className="primary-btn"
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditorOpen(true)} className="primary-btn">
                    Open Editor
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Metadata</p>
                  <dl className="mt-2 space-y-1 text-sm text-gray-700">
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Category</dt>
                      <dd className="text-right">{selectedTemplate.category}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Builder</dt>
                      <dd className="text-right">{selectedTemplate.builder_name ?? '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Updated</dt>
                      <dd className="text-right">
                        {formatTemplateDate(selectedTemplate.updated_at ?? selectedTemplate.created_at)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <label htmlFor="preview-fund" className="text-xs font-semibold uppercase text-gray-500">
                    Preview Fund
                  </label>
                  <select
                    id="preview-fund"
                    value={previewFundId}
                    onChange={(event) => setPreviewFundId(event.target.value ? Number(event.target.value) : '')}
                    className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  >
                    <option value="">No fund context</option>
                    {funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    Fund data will be used for variable substitution during preview.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase text-gray-500">Variables</p>
                {variables.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No variable metadata is registered.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {variables.map((variable) => (
                      <span
                        key={variable}
                        className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                      >
                        {variable}
                      </span>
                    ))}
                  </div>
                )}
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
