import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  addWorkflowStepInstanceDocument,
  calculateDeadline,
  cancelWorkflowInstance,
  checkWorkflowStepInstanceDocument,
  completeWorkflowStep,
  createWorkflowTemplate,
  createPeriodicSchedule,
  deleteWorkflowStepInstanceDocument,
  deleteWorkflowInstance,
  deleteWorkflowTemplate,
  deletePeriodicSchedule,
  downloadAttachment,
  fetchCompanies,
  fetchDocumentTemplates,
  fetchFund,
  fetchFundLPs,
  fetchFunds,
  fetchGPEntities,
  fetchInvestments,
  fetchAttachments,
  fetchPeriodicSchedules,
  fetchTaskCategories,
  fetchWorkflow,
  fetchWorkflowInstances,
  fetchWorkflows,
  generatePeriodicSchedulesForYear,
  generateDocument,
  instantiateWorkflow,
  removeAttachment,
  swapWorkflowInstanceTemplate,
  undoWorkflowStep,
  updateWorkflowStepInstanceDocument,
  updateWorkflowInstance,
  updateWorkflowTemplate,
  updatePeriodicSchedule,
  uploadAttachment,
  type Attachment,
  type Company,
  type DocumentTemplate,
  type Fund,
  type GPEntity,
  type NoticeDeadlineResult,
  type LP,
  type PeriodicSchedule,
  type PeriodicScheduleInput,
  type TaskCategory,
  type WorkflowInstance,
  type WorkflowListItem,
  type WorkflowStep,
  type WorkflowStepDocumentInput,
  type WorkflowStepLPPaidInInput,
  type WorkflowStepInstance,
  type WorkflowStepInstanceDocument,
  type WorkflowTemplate,
  type WorkflowTemplateInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Check, ChevronRight, Play, Plus, Printer, RefreshCcw, X } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import DrawerOverlay from '../components/common/DrawerOverlay'
import FileAttachmentPanel from '../components/common/FileAttachmentPanel'
import { invalidateFundRelated, invalidateWorkflowRelated } from '../lib/queryInvalidation'
import {
  buildWorkflowInstanceView,
  isWithinRecentDays,
  workflowPrimaryBucketRank,
  type InstanceDueTone,
  type WorkflowCompletionBucket,
  type WorkflowPrimaryBucket,
} from '../lib/workflowInstanceView'
import ChecklistsPage from './ChecklistsPage'

type WorkflowLocationState = {
  expandInstanceId?: number
}

type StepDocumentDraft = {
  name: string
  required: boolean
  timing: string
  notes: string
  attachment_ids: number[]
}

const EMPTY_STEP_DOCUMENT_DRAFT: StepDocumentDraft = {
  name: '',
  required: true,
  timing: '',
  notes: '',
  attachment_ids: [],
}

interface InvestmentListItem {
  id: number
  fund_id: number
  company_id: number
  fund_name: string
  company_name: string
}

function saveBlobAsFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const DEFAULT_NOTICE_TYPES = [
  { notice_type: 'assembly', label: '총회 소집 통지' },
  { notice_type: 'capital_call_initial', label: '최초 출자금 납입 요청' },
  { notice_type: 'capital_call_additional', label: '수시 출자금 납입 요청' },
  { notice_type: 'ic_agenda', label: '투자심의위원회 안건 통지' },
  { notice_type: 'distribution', label: '분배 통지' },
  { notice_type: 'dissolution', label: '해산/청산 통지' },
  { notice_type: 'lp_report', label: '조합원 보고' },
  { notice_type: 'amendment', label: '규약 변경 통지' },
]

function normalizeKeyword(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, '').toLowerCase()
}

function isFormationWorkflowInstance(instance: WorkflowInstance): boolean {
  const workflowName = normalizeKeyword(instance.workflow_name)
  const instanceName = normalizeKeyword(instance.name)
  return workflowName.includes('결성') || instanceName.includes('결성') || workflowName.includes('formation')
}

function isFormationPaidInConfirmationStep(stepName: string): boolean {
  const normalized = normalizeKeyword(stepName)
  const hasPaidToken =
    normalized.includes('출자') ||
    normalized.includes('납입') ||
    normalized.includes('입금') ||
    normalized.includes('납부') ||
    normalized.includes('payment')
  const hasConfirmToken =
    normalized.includes('확인') ||
    normalized.includes('check') ||
    normalized.includes('confirm')
  return hasPaidToken && hasConfirmToken
}

function canSwapWorkflowTemplate(instance: WorkflowInstance): boolean {
  const completedCount = instance.step_instances.filter(
    (step) => step.status === 'completed' || step.status === 'skipped',
  ).length
  return (instance.status || '').trim().toLowerCase() === 'active' && completedCount === 0
}

function isFormationAssemblyWorkflow(instance: WorkflowInstance): boolean {
  const workflowName = normalizeKeyword(instance.workflow_name)
  const instanceName = normalizeKeyword(instance.name)
  const memo = normalizeKeyword(instance.memo || '')
  return workflowName.includes('결성총회') || instanceName.includes('결성총회') || memo.includes('formation_slot=결성총회개최')
}

type InstanceListView = 'active' | 'completed'
type ActiveFilter = 'all' | 'not_started' | 'in_progress' | 'overdue'
type CompletedRange = 'all' | '7d' | '30d'

function dueToneBadge(meta: { tone: InstanceDueTone; diffDays: number | null }): { label: string; className: string } | null {
  if (meta.tone === 'overdue') {
    return {
      label: '지연',
      className: 'rounded-full border border-[#bfa5a7] bg-[#f1e8e9] px-2 py-0.5 text-xs font-semibold text-[#3b1219]',
    }
  }
  if (meta.tone === 'today') {
    return {
      label: '오늘',
      className: 'rounded-full border border-[#d4a418] bg-[#fff7d6] px-2 py-0.5 text-xs font-semibold text-[#624100]',
    }
  }
  if (meta.tone === 'this_week') {
    return {
      label: meta.diffDays && meta.diffDays > 0 ? `D-${meta.diffDays}` : '이번주',
      className: 'rounded-full border border-[#d4a418] bg-[#fff7d6] px-2 py-0.5 text-xs font-semibold text-[#624100]',
    }
  }
  return null
}

function primaryBucketBadge(bucket: WorkflowPrimaryBucket | null): { label: string; className: string } | null {
  if (bucket === 'overdue') {
    return { label: '지연', className: 'rounded-full border border-[#bfa5a7] bg-[#f1e8e9] px-2 py-0.5 text-[11px] font-semibold text-[#3b1219]' }
  }
  if (bucket === 'in_progress') {
    return { label: '진행 중', className: 'rounded-full border border-[#b2cbfb] bg-[#e6efff] px-2 py-0.5 text-[11px] font-semibold text-[#1a3660]' }
  }
  if (bucket === 'not_started') {
    return { label: '시작 전', className: 'rounded-full border border-[#d8e5fb] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#64748b]' }
  }
  return null
}

function completionBucketBadge(bucket: WorkflowCompletionBucket | null): { label: string; className: string } | null {
  if (bucket === 'completed') {
    return { label: '완료', className: 'rounded-full border border-[#bed7c9] bg-[#eef6f2] px-2 py-0.5 text-[11px] font-semibold text-[#1f5b45]' }
  }
  if (bucket === 'cancelled') {
    return { label: '취소', className: 'rounded-full border border-[#cbd5e1] bg-[#f8fafc] px-2 py-0.5 text-[11px] font-semibold text-[#475569]' }
  }
  return null
}

function formatInstanceDate(value: string | null): string {
  if (!value) return '기록 없음'
  return new Date(value).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function filterChipClass(active: boolean): string {
  return active
    ? 'border-[#558ef8] bg-white text-[#1a3660] shadow-sm'
    : 'border-[#d8e5fb] bg-[#f5f9ff] text-[#64748b] hover:bg-white'
}

const PERIODIC_MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function periodicOccurrenceMonths(schedule: Pick<PeriodicSchedule, 'recurrence' | 'base_month'>): number[] {
  const baseMonth = Math.max(1, Math.min(12, Number(schedule.base_month || 1)))
  if (schedule.recurrence === 'quarterly') {
    const months: number[] = []
    for (let month = baseMonth; month <= 12; month += 3) months.push(month)
    return months
  }
  if (schedule.recurrence === 'semi-annual') {
    return [baseMonth, ...(baseMonth + 6 <= 12 ? [baseMonth + 6] : [])]
  }
  return [baseMonth]
}

function periodicRecurrenceLabel(value: string): string {
  if (value === 'quarterly') return '분기'
  if (value === 'semi-annual') return '반기'
  if (value === 'annual') return '연간'
  return value || '-'
}

function periodicCategoryClass(value: string): string {
  const normalized = normalizeKeyword(value)
  if (normalized.includes('분기')) return 'border-sky-200 bg-sky-100 text-sky-700'
  if (normalized.includes('영업')) return 'border-emerald-200 bg-emerald-100 text-emerald-700'
  if (normalized.includes('총회')) return 'border-indigo-200 bg-indigo-100 text-indigo-700'
  return 'border-[#d8e5fb] bg-[#f5f9ff] text-[#0f1f3d]'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderPrintWindow(title: string, body: string) {
  const popup = window.open('', '_blank')
  if (!popup) return

  popup.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: 'Pretendard', 'Apple SD Gothic Neo', '맑은 고딕', sans-serif; font-weight: 600; margin: 0; padding: 24px; color: #0f1f3d; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet { max-width: 900px; margin: 0 auto; }
          h1 { margin: 0; font-size: 20px; color: #0f1f3d; font-family: 'GmarketSans', 'Pretendard', sans-serif; }
          .meta { margin-top: 8px; color: #64748b; font-size: 13px; line-height: 1.6; }
          h2 { margin-top: 20px; margin-bottom: 8px; font-size: 14px; color: #0f1f3d; font-family: 'GmarketSans', 'Pretendard', sans-serif; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: 'IBM Plex Sans KR', 'Pretendard', sans-serif; }
          th, td { text-align: left; border-bottom: 1px solid #d8e5fb; padding: 8px; vertical-align: top; }
          th { border-bottom: 2px solid #0f1f3d; }
          ul { margin: 0; padding-left: 18px; font-size: 13px; }
          li { margin: 4px 0; }
          @media print { @page { margin: 20mm; } body { padding: 12px; } }
        </style>
      </head>
      <body>
        <div class="sheet">${body}</div>
        <script>
          window.onload = function () { window.print(); };
        </script>
      </body>
    </html>
  `)
  popup.document.close()
}

function printWorkflowInstanceChecklist(instance: WorkflowInstance, template?: WorkflowTemplate) {
  const stepDocsByStepId = new Map<number, WorkflowTemplate['steps'][number]['step_documents']>(
    (template?.steps ?? []).map((step) => [step.id, step.step_documents ?? []]),
  )
  const stepRows = instance.step_instances
    .map((step) => {
      const statusMark = step.status === 'completed' ? '[x]' : '[ ]'
      const dateText = new Date(step.calculated_date).toLocaleDateString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
      })
      const stepDocuments = stepDocsByStepId.get(step.workflow_step_id) ?? []
      const stepDocumentsHtml = stepDocuments.length > 0
        ? `<div style="margin-top:4px; color:#6b7280; font-size:11px;">${stepDocuments
          .map((doc) => `- ${escapeHtml(doc.name)}${doc.document_template_id ? ' [템플릿]' : ''}`)
          .join('<br />')}</div>`
        : ''
      return `<tr>
        <td>${statusMark}</td>
        <td>${escapeHtml(step.step_timing || '')}</td>
        <td>${escapeHtml(dateText)}</td>
        <td>${escapeHtml(step.step_name || '')}${stepDocumentsHtml}</td>
        <td>${escapeHtml(step.memo || '')}</td>
      </tr>`
    })
    .join('')

  const documents =
    (template?.documents ?? [])
      .map((doc) => `<li>[ ] ${escapeHtml(doc.name)}${doc.notes ? ` - ${escapeHtml(doc.notes)}` : ''}</li>`)
      .join('') || '<li>없음</li>'

  const warnings = (template?.warnings ?? [])
    .map((warning) => `<li>${escapeHtml(warning.content)}</li>`)
    .join('')

  const body = `
    <h1>V:ON 워크플로우 체크리스트</h1>
    <div class="meta">
      <strong>${escapeHtml(instance.name)}</strong><br />
      ${instance.fund_name ? `조합: ${escapeHtml(instance.fund_name)}<br />` : ''}
      ${instance.company_name ? `회사: ${escapeHtml(instance.company_name)}<br />` : ''}
      시작일: ${escapeHtml(instance.trigger_date)}<br />
      인쇄일: ${new Date().toLocaleDateString('ko-KR')}
    </div>
    <h2>진행 단계</h2>
    <table>
      <thead>
        <tr><th>완료</th><th>시점</th><th>일자</th><th>단계</th><th>비고</th></tr>
      </thead>
      <tbody>${stepRows}</tbody>
    </table>
    <h2>필요 서류</h2>
    <ul>${documents}</ul>
    ${warnings ? `<h2>주의사항</h2><ul>${warnings}</ul>` : ''}
  `
  renderPrintWindow(`${instance.name} 체크리스트`, body)
}

function printWorkflowTemplateChecklist(template: WorkflowTemplate) {
  const stepRows = template.steps
    .map(
      (step) => {
        const stepDocuments = step.step_documents ?? []
        const stepDocumentsHtml = stepDocuments.length > 0
          ? `<div style="margin-top:4px; color:#6b7280; font-size:11px;">${stepDocuments
            .map((doc) => `- ${escapeHtml(doc.name)}${doc.document_template_id ? ' [템플릿]' : ''}`)
            .join('<br />')}</div>`
          : ''
        return `<tr>
        <td>[ ]</td>
        <td>${escapeHtml(step.timing || '')}</td>
        <td></td>
        <td>${escapeHtml(step.name || '')}${stepDocumentsHtml}</td>
        <td>${escapeHtml(step.memo || '')}</td>
      </tr>`
      },
    )
    .join('')

  const documents =
    template.documents
      .map((doc) => `<li>[ ] ${escapeHtml(doc.name)}${doc.notes ? ` - ${escapeHtml(doc.notes)}` : ''}</li>`)
      .join('') || '<li>없음</li>'

  const warnings = template.warnings
    .map((warning) => `<li>${escapeHtml(warning.content)}</li>`)
    .join('')

  const body = `
    <h1>워크플로우 템플릿 체크리스트</h1>
    <div class="meta">
      <strong>${escapeHtml(template.name)}</strong><br />
      카테고리: ${escapeHtml(template.category || '-')}<br />
      총 기간: ${escapeHtml(template.total_duration || '-')}<br />
      인쇄일: ${new Date().toLocaleDateString('ko-KR')}
    </div>
    <h2>기본 단계</h2>
    <table>
      <thead>
        <tr><th>완료</th><th>시점</th><th>일자</th><th>단계</th><th>비고</th></tr>
      </thead>
      <tbody>${stepRows}</tbody>
    </table>
    <h2>필요 서류</h2>
    <ul>${documents}</ul>
    ${warnings ? `<h2>주의사항</h2><ul>${warnings}</ul>` : ''}
  `
  renderPrintWindow(`${template.name} 체크리스트`, body)
}

const EMPTY_TEMPLATE: WorkflowTemplateInput = {
  name: '',
  trigger_description: '',
  category: '',
  total_duration: '',
  steps: [{
    order: 1,
    name: '',
    timing: 'D-day',
    timing_offset_days: 0,
    estimated_time: '',
    quadrant: 'Q1',
    memo: '',
    is_notice: false,
    is_report: false,
    step_documents: [],
  }],
  documents: [],
  warnings: [],
}

function normalizeTemplate(wf: WorkflowTemplate | null | undefined): WorkflowTemplateInput {
  return {
    name: wf?.name ?? '',
    trigger_description: wf?.trigger_description ?? '',
    category: wf?.category ?? '',
    total_duration: wf?.total_duration ?? '',
    steps: (wf?.steps ?? []).map((s, idx) => ({
      order: s.order ?? idx + 1,
      name: s.name ?? '',
      timing: s.timing ?? 'D-day',
      timing_offset_days: s.timing_offset_days ?? 0,
      estimated_time: s.estimated_time ?? '',
      quadrant: s.quadrant ?? 'Q1',
      memo: s.memo ?? '',
      is_notice: s.is_notice ?? false,
      is_report: s.is_report ?? false,
        step_documents: (s.step_documents ?? []).map((doc) => ({
          name: doc.name,
          required: doc.required,
          timing: doc.timing ?? '',
          notes: doc.notes ?? '',
          document_template_id: doc.document_template_id ?? null,
          attachment_ids: doc.attachment_ids ?? [],
        })),
      })),
    documents: (wf?.documents ?? []).map((d) => ({ name: d.name, required: d.required, timing: d.timing ?? '', notes: d.notes ?? '' })),
    warnings: (wf?.warnings ?? []).map((w) => ({ content: w.content, category: (w.category as 'warning' | 'lesson' | 'tip') || 'warning' })),
  }
}

function cloneTemplateInput(input: WorkflowTemplateInput): WorkflowTemplateInput {
  return {
    ...input,
    steps: (input.steps ?? []).map((step, idx) => ({
      ...step,
      order: step.order ?? idx + 1,
      step_documents: (step.step_documents ?? []).map((doc) => ({
        ...doc,
        attachment_ids: [...(doc.attachment_ids ?? [])],
      })),
    })),
    documents: (input.documents ?? []).map((doc) => ({ ...doc })),
    warnings: (input.warnings ?? []).map((warning) => ({ ...warning })),
  }
}

function TemplateModal({
  initial,
  resetKey,
  title,
  submitLabel,
  loading,
  onSubmit,
  onClose,
}: {
  initial: WorkflowTemplateInput
  resetKey: string | number
  title: string
  submitLabel: string
  loading: boolean
  onSubmit: (data: WorkflowTemplateInput) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<WorkflowTemplateInput>(() => cloneTemplateInput(initial))
  const { data: docTemplates = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ['documentTemplates'],
    queryFn: () => fetchDocumentTemplates(),
  })
  const { data: taskCategories = [] } = useQuery<TaskCategory[]>({
    queryKey: ['task-categories'],
    queryFn: () => fetchTaskCategories(),
  })
  const categoryOptions = useMemo(
    () =>
      taskCategories
        .map((row) => row.name.trim())
        .filter((name) => name.length > 0),
    [taskCategories],
  )
  const [documentDraft, setDocumentDraft] = useState({
    name: '',
    required: true,
    timing: '',
    notes: '',
  })
  const [warningDraft, setWarningDraft] = useState('')
  const [isAttachmentProcessing, setIsAttachmentProcessing] = useState(false)
  const [stepDocDrafts, setStepDocDrafts] = useState<Record<number, {
    name: string
    required: boolean
    timing: string
    notes: string
    documentTemplateId: string
    attachmentIds: number[]
  }>>({})

  useEffect(() => {
    setForm(cloneTemplateInput(initial))
    setDocumentDraft({
      name: '',
      required: true,
      timing: '',
      notes: '',
    })
    setWarningDraft('')
    setStepDocDrafts({})
    setIsAttachmentProcessing(false)
  }, [resetKey])

  const addDocument = () => {
    const name = documentDraft.name.trim()
    if (!name) return
    setForm((prev) => ({
      ...prev,
      documents: [
        ...prev.documents,
        {
          name,
          required: documentDraft.required,
          timing: documentDraft.timing.trim() || null,
          notes: documentDraft.notes.trim() || null,
        },
      ],
    }))
    setDocumentDraft({
      name: '',
      required: true,
      timing: '',
      notes: '',
    })
  }

  const removeDocument = (index: number) => {
    setForm((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, docIndex) => docIndex !== index),
    }))
  }

  const addWarning = () => {
    const content = warningDraft.trim()
    if (!content) return
    setForm((prev) => ({
      ...prev,
      warnings: [...prev.warnings, { content, category: 'warning' }],
    }))
    setWarningDraft('')
  }

  const removeWarning = (index: number) => {
    setForm((prev) => ({
      ...prev,
      warnings: prev.warnings.filter((_, warningIdx) => warningIdx !== index),
    }))
  }

  const ensureStepDocDraft = (stepIdx: number) => {
    const existing = stepDocDrafts[stepIdx]
    if (existing) return existing
    return {
      name: '',
      required: true,
      timing: '',
      notes: '',
      documentTemplateId: '',
      attachmentIds: [],
    }
  }

  const setStepDocDraft = (
    stepIdx: number,
    patch: Partial<{
      name: string
      required: boolean
      timing: string
      notes: string
      documentTemplateId: string
      attachmentIds: number[]
    }>,
  ) => {
    setStepDocDrafts((prev) => {
      const base = prev[stepIdx] ?? {
        name: '',
        required: true,
        timing: '',
        notes: '',
        documentTemplateId: '',
        attachmentIds: [],
      }
      return {
        ...prev,
        [stepIdx]: {
          ...base,
          ...patch,
        },
      }
    })
  }

  const resetStepDocDraft = (stepIdx: number) => {
    setStepDocDrafts((prev) => ({
      ...prev,
      [stepIdx]: {
        name: '',
        required: true,
        timing: '',
        notes: '',
        documentTemplateId: '',
        attachmentIds: [],
      },
    }))
  }

  const appendStepDocDraftAttachment = (stepIdx: number, attachmentId: number) => {
    setStepDocDrafts((prev) => {
      const draft = prev[stepIdx] ?? {
        name: '',
        required: true,
        timing: '',
        notes: '',
        documentTemplateId: '',
        attachmentIds: [],
      }
      return {
        ...prev,
        [stepIdx]: {
          ...draft,
          attachmentIds: [...new Set([...(draft.attachmentIds ?? []), attachmentId])],
        },
      }
    })
  }

  const removeStepDocDraftAttachment = (stepIdx: number, attachmentId: number) => {
    setStepDocDrafts((prev) => {
      const draft = prev[stepIdx] ?? {
        name: '',
        required: true,
        timing: '',
        notes: '',
        documentTemplateId: '',
        attachmentIds: [],
      }
      return {
        ...prev,
        [stepIdx]: {
          ...draft,
          attachmentIds: (draft.attachmentIds ?? []).filter((id) => id !== attachmentId),
        },
      }
    })
  }

  const addStepDocument = (stepIdx: number, data: WorkflowStepDocumentInput) => {
    const trimmedName = (data.name || '').trim()
    if (!trimmedName) return
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, idx) => {
        if (idx !== stepIdx) return step
        const nextDocs = [...(step.step_documents ?? []), {
          name: trimmedName,
          required: data.required ?? true,
          timing: data.timing ?? null,
          notes: data.notes ?? null,
          document_template_id: data.document_template_id ?? null,
          attachment_ids: data.attachment_ids ?? [],
        }]
        return { ...step, step_documents: nextDocs }
      }),
    }))
  }

  const removeStepDocument = (stepIdx: number, docIdx: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, idx) => {
        if (idx !== stepIdx) return step
        return {
          ...step,
          step_documents: (step.step_documents ?? []).filter((_, index) => index !== docIdx),
        }
      }),
    }))
  }

  const appendStepDocumentAttachment = (stepIdx: number, docIdx: number, attachmentId: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, idx) => {
        if (idx !== stepIdx) return step
        return {
          ...step,
          step_documents: (step.step_documents ?? []).map((doc, targetIdx) => {
            if (targetIdx !== docIdx) return doc
            return {
              ...doc,
              attachment_ids: [...new Set([...(doc.attachment_ids ?? []), attachmentId])],
            }
          }),
        }
      }),
    }))
  }

  const removeStepDocumentAttachment = (stepIdx: number, docIdx: number, attachmentId: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, idx) => {
        if (idx !== stepIdx) return step
        return {
          ...step,
          step_documents: (step.step_documents ?? []).map((doc, targetIdx) => {
            if (targetIdx !== docIdx) return doc
            return {
              ...doc,
              attachment_ids: (doc.attachment_ids ?? []).filter((id) => id !== attachmentId),
            }
          }),
        }
      }),
    }))
  }

  const addStepDocumentFromDraft = (stepIdx: number) => {
    const draft = ensureStepDocDraft(stepIdx)
    const templateId = Number(draft.documentTemplateId || 0)
    const template = templateId ? docTemplates.find((row) => row.id === templateId) : null
    const name = (draft.name || template?.name || '').trim()
    if (!name) return
    addStepDocument(stepIdx, {
      name,
      required: draft.required,
      timing: draft.timing.trim() || null,
      notes: draft.notes.trim() || null,
      document_template_id: template?.id ?? null,
      attachment_ids: draft.attachmentIds,
    })
    resetStepDocDraft(stepIdx)
  }

  const moveStep = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    setForm((prev) => {
      if (toIndex < 0 || toIndex >= prev.steps.length) return prev
      const nextSteps = [...prev.steps]
      const temp = nextSteps[fromIndex]
      nextSteps[fromIndex] = nextSteps[toIndex]
      nextSteps[toIndex] = temp
      return {
        ...prev,
        steps: nextSteps.map((step, idx) => ({ ...step, order: idx + 1 })),
      }
    })
  }

  const submit = () => {
    if (isAttachmentProcessing) return
    const hasInvalidDraftAttachment = Object.values(stepDocDrafts).some((draft) => {
      const templateId = Number(draft.documentTemplateId || 0)
      const name = (draft.name || '').trim()
      const attachmentIds = draft.attachmentIds ?? []
      return attachmentIds.length > 0 && !name && templateId <= 0
    })
    if (hasInvalidDraftAttachment) {
      window.alert('드래프트 서류에 첨부가 있으면 서류명을 입력하거나 템플릿을 선택해 주세요.')
      return
    }

    const mergedSteps = form.steps.map((step, stepIdx) => {
      const draft = stepDocDrafts[stepIdx]
      if (!draft) return step

      const templateId = Number(draft.documentTemplateId || 0)
      const template = templateId ? docTemplates.find((row) => row.id === templateId) : null
      const name = (draft.name || template?.name || '').trim()
      const attachmentIds = [...new Set((draft.attachmentIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]
      const hasDraftContent =
        name.length > 0 ||
        Boolean(draft.timing.trim()) ||
        Boolean(draft.notes.trim()) ||
        templateId > 0 ||
        attachmentIds.length > 0

      if (!hasDraftContent) return step
      if (!name) return step

      return {
        ...step,
        step_documents: [
          ...(step.step_documents ?? []),
          {
            name,
            required: draft.required,
            timing: draft.timing.trim() || null,
            notes: draft.notes.trim() || null,
            document_template_id: template?.id ?? null,
            attachment_ids: attachmentIds,
          },
        ],
      }
    })

    if (mergedSteps.some((step) => (step.step_documents ?? []).some((doc) => !String(doc.name || '').trim()))) {
      return
    }

    const payload: WorkflowTemplateInput = {
      name: form.name.trim(),
      trigger_description: form.trigger_description?.trim() || null,
      category: form.category?.trim() || null,
      total_duration: form.total_duration?.trim() || null,
      steps: mergedSteps
        .map((s, idx) => ({ ...s, order: idx + 1 }))
        .filter((s) => s.name.trim())
        .map((s) => ({
          ...s,
          name: s.name.trim(),
          timing: s.timing || 'D-day',
          estimated_time: s.estimated_time || null,
          quadrant: s.quadrant || 'Q1',
          memo: s.memo || null,
          is_notice: Boolean(s.is_notice),
          is_report: Boolean(s.is_report),
          step_documents: (s.step_documents ?? [])
            .map((doc) => ({
              name: doc.name?.trim() || '',
              required: doc.required ?? true,
              timing: doc.timing?.trim() || null,
              notes: doc.notes?.trim() || null,
              document_template_id: doc.document_template_id ?? null,
              attachment_ids: doc.attachment_ids ?? [],
            }))
            .filter((doc) => doc.name),
        })),
      documents: form.documents.map((d) => ({
        name: d.name?.trim() || '',
        required: d.required ?? true,
        timing: d.timing?.trim() || null,
        notes: d.notes?.trim() || null,
      })).filter((d) => d.name),
      warnings: form.warnings.map((w) => ({
        content: w.content?.trim() || '',
        category: (w.category as 'warning' | 'lesson' | 'tip') || 'warning',
      })).filter((w) => w.content),
    }
    if (!payload.name || payload.steps.length === 0) return
    onSubmit(payload)
  }

  return (
    <div className="card-base flex max-h-[calc(100vh-5.5rem)] min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[#0f1f3d]">{title}</h3>
        <button onClick={onClose} className="icon-btn text-[#64748b] hover:text-[#64748b]"><X size={18} /></button>
      </div>
      <div className="mt-3 min-h-0 space-y-3 overflow-y-auto pr-1">
        <details open className="rounded-lg border border-[#d8e5fb] bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#0f1f3d]">기본 정보</summary>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <div><input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="예: 정기 출자 요청" className="form-input" /></div>
          <div>
            <input
              value={form.category || ''}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
              placeholder="카테고리"
              list="workflow-template-category-options"
              className="form-input"
            />
            <datalist id="workflow-template-category-options">
              {categoryOptions.map((categoryName) => (
                <option key={categoryName} value={categoryName} />
              ))}
            </datalist>
          </div>
          <div><input value={form.total_duration || ''} onChange={e => setForm(prev => ({ ...prev, total_duration: e.target.value }))} placeholder="예: 30일" className="form-input" /></div>
          <div><input value={form.trigger_description || ''} onChange={e => setForm(prev => ({ ...prev, trigger_description: e.target.value }))} placeholder="템플릿 설명 (선택)" className="form-input" /></div>
          </div>
        </details>
        <details open className="rounded-lg border border-[#d8e5fb] bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#0f1f3d]">단계 ({form.steps.length})</summary>
          <div className="mt-2 space-y-2">
          {form.steps.map((step, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border p-2 md:grid-cols-4">
              <div className="md:col-span-2"><input value={step.name} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, name: e.target.value } : it) }))} placeholder="단계명" className="form-input" /></div>
              <div><label className="form-label text-xs">시점</label><input value={step.timing} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, timing: e.target.value } : it) }))} placeholder="예: T-7" className="form-input" /></div>
              <div><input type="number" value={step.timing_offset_days} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, timing_offset_days: Number(e.target.value || 0) } : it) }))} placeholder="D+일수" className="form-input" /></div>
              <div><label className="form-label text-xs">예상 시간</label><input value={step.estimated_time || ''} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, estimated_time: e.target.value } : it) }))} placeholder="예: 1h" className="form-input" /></div>
              <div><label className="form-label text-xs">사분면</label><input value={step.quadrant || 'Q1'} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, quadrant: e.target.value } : it) }))} placeholder="Q1~Q4" className="form-input" /></div>
              <div className="md:col-span-2"><label className="form-label text-xs">메모</label><input value={step.memo || ''} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, memo: e.target.value } : it) }))} placeholder="선택 입력" className="form-input" /></div>
              <div className="md:col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-[#64748b]">
                  <input
                    type="checkbox"
                    checked={Boolean(step.is_notice)}
                    onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, is_notice: e.target.checked } : it) }))}
                    className="rounded border-[#bfcff0]"
                  />
                  통지
                </label>
                <label className="flex items-center gap-1 text-xs text-[#64748b]">
                  <input
                    type="checkbox"
                    checked={Boolean(step.is_report)}
                    onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, is_report: e.target.checked } : it) }))}
                    className="rounded border-[#bfcff0]"
                  />
                  보고
                </label>
                <button
                  type="button"
                  onClick={() => moveStep(idx, 'up')}
                  disabled={idx === 0}
                  className="secondary-btn text-xs"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(idx, 'down')}
                  disabled={idx === form.steps.length - 1}
                  className="secondary-btn text-xs"
                >
                  ↓
                </button>
                <button onClick={() => setForm(prev => ({ ...prev, steps: prev.steps.filter((_, itIdx) => itIdx !== idx) }))} className="text-xs text-red-600 hover:text-red-700 text-left">단계 삭제</button>
              </div>
                <div className="md:col-span-4 space-y-2 rounded border border-dashed border-[#bfcff0] bg-[#f5f9ff]/60 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#0f1f3d]">단계 서류</p>
                  <span className="text-xs text-[#64748b]">{step.step_documents?.length ?? 0}개</span>
                </div>
                {(step.step_documents?.length ?? 0) === 0 ? (
                  <p className="text-xs text-[#64748b]">연결된 서류가 없습니다.</p>
                ) : (
                  <div className="space-y-1">
                    {(step.step_documents ?? []).map((doc, docIdx) => (
                      <div key={`${doc.name}-${docIdx}`} className="grid grid-cols-1 gap-2 rounded border border-[#d8e5fb] bg-white p-2 md:grid-cols-6">
                        <div className="md:col-span-2">
                          <p className="text-xs font-medium text-[#0f1f3d]">{doc.name}</p>
                          <p className="text-xs text-[#64748b]">{doc.notes || '-'}</p>
                          <div className="mt-1">
                            <FileAttachmentPanel
                              attachmentIds={doc.attachment_ids ?? []}
                              onUpload={async (file) => {
                                setIsAttachmentProcessing(true)
                                try {
                                  const uploaded = await uploadAttachment(file)
                                  appendStepDocumentAttachment(idx, docIdx, uploaded.id)
                                  return uploaded.id
                                } finally {
                                  setIsAttachmentProcessing(false)
                                }
                              }}
                              onRemove={async (attachmentId) => {
                                setIsAttachmentProcessing(true)
                                try {
                                  await removeAttachment(attachmentId)
                                  removeStepDocumentAttachment(idx, docIdx, attachmentId)
                                } finally {
                                  setIsAttachmentProcessing(false)
                                }
                              }}
                              compact
                              label="서류 파일"
                            />
                          </div>
                        </div>
                        <div className="text-xs text-[#64748b]">{doc.required ? '필수' : '선택'}</div>
                        <div className="text-xs text-[#64748b]">{doc.timing || '-'}</div>
                        <div className="text-xs text-[#558ef8]">{doc.document_template_id ? '[템플릿]' : '[직접]'}</div>
                        <div className="text-right">
                          <button
                            onClick={() => removeStepDocument(idx, docIdx)}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 rounded border border-[#d8e5fb] bg-white p-2 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <label className="form-label text-xs">서류명</label>
                    <input
                      value={ensureStepDocDraft(idx).name}
                      onChange={e => setStepDocDraft(idx, { name: e.target.value })}
                      placeholder="예: 투심 보고서"
                      className="form-input text-xs"
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">시점</label>
                    <input
                      value={ensureStepDocDraft(idx).timing}
                      onChange={e => setStepDocDraft(idx, { timing: e.target.value })}
                      placeholder="예: D-1"
                      className="form-input text-xs"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="form-label text-xs">메모</label>
                    <input
                      value={ensureStepDocDraft(idx).notes}
                      onChange={e => setStepDocDraft(idx, { notes: e.target.value })}
                      placeholder="선택 입력"
                      className="form-input text-xs"
                    />
                  </div>
                  <div className="flex items-end justify-start gap-1">
                    <label className="mb-1 flex items-center gap-1 text-xs text-[#64748b]">
                      <input
                        type="checkbox"
                        checked={ensureStepDocDraft(idx).required}
                        onChange={e => setStepDocDraft(idx, { required: e.target.checked })}
                        className="rounded border-[#bfcff0]"
                      />
                      필수
                    </label>
                  </div>
                </div>
                <FileAttachmentPanel
                  attachmentIds={ensureStepDocDraft(idx).attachmentIds ?? []}
                  onUpload={async (file) => {
                    setIsAttachmentProcessing(true)
                    try {
                      const uploaded = await uploadAttachment(file)
                      appendStepDocDraftAttachment(idx, uploaded.id)
                      return uploaded.id
                    } finally {
                      setIsAttachmentProcessing(false)
                    }
                  }}
                  onRemove={async (attachmentId) => {
                    setIsAttachmentProcessing(true)
                    try {
                      await removeAttachment(attachmentId)
                      removeStepDocDraftAttachment(idx, attachmentId)
                    } finally {
                      setIsAttachmentProcessing(false)
                    }
                  }}
                  compact
                  label="서류 파일"
                />
                <div className="flex flex-col gap-2 md:flex-row md:items-end">
                  <div className="flex-1">
                    <label className="form-label text-xs">템플릿에서 선택</label>
                    <select
                      value={ensureStepDocDraft(idx).documentTemplateId}
                      onChange={e => {
                        const nextTemplateId = e.target.value
                        const selectedTemplate = docTemplates.find((row) => row.id === Number(nextTemplateId))
                        setStepDocDraft(idx, {
                          documentTemplateId: nextTemplateId,
                          name: selectedTemplate ? selectedTemplate.name : ensureStepDocDraft(idx).name,
                        })
                      }}
                      className="form-input text-xs"
                    >
                      <option value="">템플릿 선택...</option>
                      {docTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.category} - {template.name}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={() => addStepDocumentFromDraft(idx)} className="secondary-btn text-xs">서류 추가</button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setForm(prev => ({ ...prev, steps: [...prev.steps, { order: prev.steps.length + 1, name: '', timing: 'D-day', timing_offset_days: 0, estimated_time: '', quadrant: 'Q1', memo: '', is_notice: false, is_report: false, step_documents: [] }] }))} className="secondary-btn">+ 단계 추가</button>
          </div>
        </details>
        <details open className="rounded-lg border border-[#d8e5fb] bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#0f1f3d]">공통 서류</summary>
          <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#0f1f3d]">서류</p>
            <span className="text-xs text-[#64748b]">{form.documents.length}개</span>
          </div>
          {form.documents.length === 0 ? (
            <p className="text-xs text-[#64748b]">등록된 서류가 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {form.documents.map((doc, idx) => (
                <div key={`${doc.name}-${idx}`} className="grid grid-cols-1 gap-2 rounded border border-[#d8e5fb] bg-[#f5f9ff] p-2 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <p className="text-xs font-medium text-[#0f1f3d]">{doc.name || '-'}</p>
                    <p className="text-xs text-[#64748b]">{doc.notes || '-'}</p>
                  </div>
                  <div className="text-xs text-[#64748b]">{doc.required ? '필수' : '선택'}</div>
                  <div className="text-xs text-[#64748b]">{doc.timing || '-'}</div>
                  <div className="md:col-span-2 text-right">
                    <button onClick={() => removeDocument(idx)} className="text-xs text-red-600 hover:text-red-700">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 rounded border border-dashed border-[#bfcff0] p-2 md:grid-cols-6">
            <div className="md:col-span-2">
              <label className="form-label text-xs">서류명</label>
              <input
                value={documentDraft.name}
                onChange={e => setDocumentDraft(prev => ({ ...prev, name: e.target.value }))}
                placeholder="예: 출자 요청 공문"
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label text-xs">시점</label>
              <input
                value={documentDraft.timing}
                onChange={e => setDocumentDraft(prev => ({ ...prev, timing: e.target.value }))}
                placeholder="예: D-day"
                className="form-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="form-label text-xs">메모</label>
              <input
                value={documentDraft.notes}
                onChange={e => setDocumentDraft(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="선택 입력"
                className="form-input"
              />
            </div>
            <div className="flex items-end justify-between gap-2">
              <label className="mb-1 flex items-center gap-1 text-xs text-[#64748b]">
                <input
                  type="checkbox"
                  checked={documentDraft.required}
                  onChange={e => setDocumentDraft(prev => ({ ...prev, required: e.target.checked }))}
                  className="rounded border-[#bfcff0]"
                />
                필수
              </label>
              <button onClick={addDocument} className="secondary-btn text-xs">추가</button>
            </div>
          </div>
          </div>
        </details>
        <details className="rounded-lg border border-[#d8e5fb] bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#0f1f3d]">주의사항</summary>
          <div className="mt-2 space-y-2">
            {(form.warnings ?? []).map((warning, idx) => (
              <div key={`${warning.content}-${idx}`} className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs">
                <span>{warning.content}</span>
                <button onClick={() => removeWarning(idx)} className="text-red-600 hover:text-red-700">삭제</button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={warningDraft}
                onChange={(event) => setWarningDraft(event.target.value)}
                placeholder="주의사항 입력"
                className="form-input"
              />
              <button onClick={addWarning} className="secondary-btn text-xs">추가</button>
            </div>
          </div>
        </details>
      </div>
      <div className="mt-3 flex shrink-0 gap-2">
        <button onClick={submit} disabled={loading || isAttachmentProcessing} className="primary-btn disabled:opacity-60">
          {isAttachmentProcessing ? '첨부 처리 중...' : submitLabel}
        </button>
        <button onClick={onClose} className="secondary-btn">취소</button>
      </div>
    </div>
  )
}

function WorkflowDetail({
  workflowId,
  onClose,
  onEdit,
  onPrint,
}: {
  workflowId: number
  onClose: () => void
  onEdit: () => void
  onPrint: (template: WorkflowTemplate) => void
}) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [showRun, setShowRun] = useState(false)
  const [instName, setInstName] = useState('')
  const [instDate, setInstDate] = useState('')
  const [instMemo, setInstMemo] = useState('')
  const [instFundId, setInstFundId] = useState<number | ''>('')
  const [instGpEntityId, setInstGpEntityId] = useState<number | ''>('')
  const [instCompanyId, setInstCompanyId] = useState<number | ''>('')
  const [instInvestmentId, setInstInvestmentId] = useState<number | ''>('')
  const [instNoticeType, setInstNoticeType] = useState('assembly')

  const { data: wf, isLoading } = useQuery({ queryKey: ['workflow', workflowId], queryFn: () => fetchWorkflow(workflowId) })
  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: gpEntities } = useQuery<GPEntity[]>({ queryKey: ['gp-entities'], queryFn: fetchGPEntities })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })
  const { data: investments } = useQuery<InvestmentListItem[]>({ queryKey: ['investments'], queryFn: () => fetchInvestments() })
  const { data: selectedFund } = useQuery({ queryKey: ['fund', instFundId], queryFn: () => fetchFund(instFundId as number), enabled: instFundId !== '' })

  const options = useMemo(() => {
    const rows = selectedFund?.notice_periods ?? []
    if (rows.length > 0) return rows.map((r) => ({ notice_type: r.notice_type, label: r.label }))
    return DEFAULT_NOTICE_TYPES
  }, [selectedFund?.notice_periods])

  useEffect(() => {
    if (options.some((o) => o.notice_type === instNoticeType)) return
    const nextType = options[0]?.notice_type ?? 'assembly'
    const frame = window.requestAnimationFrame(() => {
      setInstNoticeType(nextType)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [options, instNoticeType])

  const filteredInvestments = useMemo(() => (investments ?? []).filter((inv) => {
    if (instFundId !== '' && inv.fund_id !== instFundId) return false
    if (instCompanyId !== '' && inv.company_id !== instCompanyId) return false
    return true
  }), [investments, instFundId, instCompanyId])

  const { data: deadline } = useQuery<NoticeDeadlineResult>({
    queryKey: ['deadline', instFundId, instDate, instNoticeType],
    queryFn: () => calculateDeadline(instFundId as number, instDate, instNoticeType),
    enabled: instFundId !== '' && !!instDate && !!instNoticeType,
    retry: false,
  })

  const runMut = useMutation({
    mutationFn: () => instantiateWorkflow(workflowId, {
      name: instName,
      trigger_date: instDate,
      memo: instMemo || undefined,
      fund_id: instFundId === '' ? undefined : instFundId,
      gp_entity_id: instGpEntityId === '' ? undefined : instGpEntityId,
      company_id: instCompanyId === '' ? undefined : instCompanyId,
      investment_id: instInvestmentId === '' ? undefined : instInvestmentId,
    }),
    onSuccess: (instance) => {
      invalidateFundRelated(queryClient, instance.fund_id)
      addToast('success', '워크플로우 인스턴스가 시작되었습니다.')
      setShowRun(false)
      setInstName('')
      setInstDate('')
      setInstMemo('')
      setInstFundId('')
      setInstGpEntityId('')
      setInstCompanyId('')
      setInstInvestmentId('')
    },
  })

  if (isLoading) return <PageLoading />
  if (!wf) return null

  return (
    <div className="card-base space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#0f1f3d]">{wf.name}</h3>
          <p className="text-sm text-[#64748b]">{wf.trigger_description || '-'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onPrint(wf)} className="secondary-btn inline-flex items-center gap-1"><Printer size={14} /> 인쇄</button>
          <button onClick={onEdit} className="secondary-btn">수정</button>
          <button onClick={onClose} className="icon-btn text-[#64748b] hover:text-[#64748b]"><X size={18} /></button>
        </div>
      </div>

      <div className="space-y-1">
        {wf.steps.map((s: WorkflowStep) => (
          <div key={s.id} className="rounded bg-[#f5f9ff] p-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-6 text-center text-xs text-[#64748b]">{s.order}</span>
              <span className="flex-1">{s.name}</span>
              <span className="text-xs text-[#64748b]">{s.timing}</span>
            </div>
            {(s.step_documents?.length ?? 0) > 0 && (
              <div className="ml-8 mt-1 space-y-0.5">
                {(s.step_documents ?? []).map((doc, docIdx) => (
                  <div key={`${s.id}-doc-${doc.id ?? docIdx}`} className="flex items-center gap-1 text-xs text-[#64748b]">
                    <span>•</span>
                    <span>{doc.name}</span>
                    {doc.document_template_id ? <span className="text-[#558ef8]">[템플릿]</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!showRun ? (
        <button onClick={() => setShowRun(true)} className="primary-btn inline-flex items-center gap-2"><Play size={16} /> 실행</button>
      ) : (
        <div className="rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] p-3 space-y-2">
          <div><input value={instName} onChange={e => setInstName(e.target.value)} placeholder="예: 2026년 1차 출자요청" className="form-input" /></div>
          <div><label className="form-label text-[#1a3660]">기준일</label><input type="date" value={instDate} onChange={e => setInstDate(e.target.value)} className="form-input" /></div>
          <div>
            <label className="form-label text-[#1a3660]">관련 조합</label>
            <select value={instFundId} onChange={e => { const next = e.target.value ? Number(e.target.value) : ''; setInstFundId(next); setInstGpEntityId(''); if (instInvestmentId !== '') setInstInvestmentId('') }} className="form-input">
              <option value="">관련 조합 (선택)</option>
              {(funds ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label text-[#1a3660]">관련 고유계정</label>
            <select
              value={instGpEntityId}
              onChange={e => {
                const next = e.target.value ? Number(e.target.value) : ''
                setInstGpEntityId(next)
                setInstFundId('')
                if (instInvestmentId !== '') setInstInvestmentId('')
              }}
              className="form-input"
            >
              <option value="">관련 고유계정 (선택)</option>
              {(gpEntities ?? []).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label text-[#1a3660]">관련 회사</label>
            <select value={instCompanyId} onChange={e => { const next = e.target.value ? Number(e.target.value) : ''; setInstCompanyId(next); if (instInvestmentId !== '') setInstInvestmentId('') }} className="form-input">
              <option value="">관련 회사 (선택)</option>
              {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label text-[#1a3660]">관련 투자</label>
            <select value={instInvestmentId} onChange={e => setInstInvestmentId(e.target.value ? Number(e.target.value) : '')} className="form-input">
              <option value="">관련 투자 (선택)</option>
              {filteredInvestments.map((inv) => <option key={inv.id} value={inv.id}>#{inv.id} {inv.fund_name} - {inv.company_name}</option>)}
            </select>
          </div>
          {instFundId !== '' && (
            <div>
              <label className="form-label text-[#1a3660]">통지유형</label>
              <select value={instNoticeType} onChange={e => setInstNoticeType(e.target.value)} className="form-input">
                {options.map((opt) => <option key={opt.notice_type} value={opt.notice_type}>{opt.label}</option>)}
              </select>
            </div>
          )}
          {instFundId !== '' && instDate && deadline && (
            <div className="rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
              <p>{deadline.label}: 기준일 전 영업일 {deadline.business_days}일 필요.</p>
              <p>기준일 {deadline.target_date} / 통지 기한 {deadline.deadline}</p>
            </div>
          )}
          <div>
            <textarea value={instMemo} onChange={e => setInstMemo(e.target.value)} placeholder="메모 (선택)" rows={2} className="form-input" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => instName && instDate && runMut.mutate()} disabled={!instName || !instDate} className="primary-btn flex-1">실행</button>
            <button onClick={() => setShowRun(false)} className="secondary-btn">취소</button>
          </div>
        </div>
      )}
    </div>
  )
}

function InstanceList({
  view,
  expandId,
  onPrintInstance,
  onResumeInstance,
}: {
  view: InstanceListView
  expandId?: number | null
  onPrintInstance: (instance: WorkflowInstance) => void
  onResumeInstance?: (instanceId: number) => void
}) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [openId, setOpenId] = useState<number | null>(expandId ?? null)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [completedRange, setCompletedRange] = useState<CompletedRange>('all')
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [editingInstanceId, setEditingInstanceId] = useState<number | null>(null)
  const [editInstance, setEditInstance] = useState<{ name: string; trigger_date: string; memo: string } | null>(null)
  const [swapTarget, setSwapTarget] = useState<WorkflowInstance | null>(null)
  const [swapTemplateId, setSwapTemplateId] = useState<number | ''>('')
  const [newStepDocDrafts, setNewStepDocDrafts] = useState<Record<number, StepDocumentDraft>>({})
  const [editingStepDocument, setEditingStepDocument] = useState<{
    stepId: number
    documentId: number
    draft: StepDocumentDraft
  } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['workflowInstances', { status: 'all' }],
    queryFn: () => fetchWorkflowInstances({ status: 'all' }),
  })
  const { data: workflowTemplates = [] } = useQuery<WorkflowListItem[]>({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
  })
  const { data: docTemplates = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ['documentTemplates'],
    queryFn: () => fetchDocumentTemplates(),
  })
  const attachmentIds = useMemo(() => {
    const ids = new Set<number>()
    for (const instance of data ?? []) {
      for (const step of instance.step_instances ?? []) {
        for (const doc of step.step_documents ?? []) {
          for (const id of doc.attachment_ids ?? []) {
            if (Number.isInteger(id) && id > 0) ids.add(id)
          }
        }
      }
    }
    return [...ids]
  }, [data])
  const { data: attachments = [] } = useQuery<Attachment[]>({
    queryKey: ['attachments', 'workflow-instance', attachmentIds.join(',')],
    queryFn: () => fetchAttachments(attachmentIds),
    enabled: attachmentIds.length > 0,
  })
  const attachmentById = useMemo(
    () => new Map<number, Attachment>(attachments.map((row) => [row.id, row])),
    [attachments],
  )

  const handleDownloadAttachment = async (attachmentId: number) => {
    try {
      const blob = await downloadAttachment(attachmentId)
      const filename = attachmentById.get(attachmentId)?.original_filename || `attachment-${attachmentId}`
      saveBlobAsFile(blob, filename)
    } catch {
      addToast('error', '첨부 파일 다운로드에 실패했습니다.')
    }
  }

  const handleGenerateDocuments = async (
    templates: DocumentTemplate[],
    instance: WorkflowInstance,
  ) => {
    if (!instance.fund_id) {
      addToast('error', '연결된 조합이 없습니다.')
      return
    }

    let successCount = 0
    for (const template of templates) {
      try {
        const blob = await generateDocument(template.id, instance.fund_id, instance.trigger_date)
        saveBlobAsFile(blob, `${template.name}.docx`)
        successCount += 1
      } catch {
        addToast('error', `${template.name} 생성 실패`)
      }
    }

    if (successCount > 0) {
      addToast('success', `${successCount}종 문서가 생성되었습니다.`)
    }
  }

  const invalidateCapitalLinkedQueries = (fundId?: number | null) => {
    invalidateFundRelated(queryClient, fundId)
    queryClient.invalidateQueries({ queryKey: ['capitalCallItemsByCallId'] })
    if (fundId) {
      queryClient.invalidateQueries({ queryKey: ['capitalCallItemsByCallId', fundId] })
    }
  }

  const getNewStepDocDraft = (stepId: number): StepDocumentDraft =>
    newStepDocDrafts[stepId] ?? EMPTY_STEP_DOCUMENT_DRAFT

  const setNewStepDocDraft = (stepId: number, patch: Partial<StepDocumentDraft>) => {
    setNewStepDocDrafts((prev) => {
      const base = prev[stepId] ?? EMPTY_STEP_DOCUMENT_DRAFT
      return {
        ...prev,
        [stepId]: {
          ...base,
          ...patch,
        },
      }
    })
  }

  const clearNewStepDocDraft = (stepId: number) => {
    setNewStepDocDrafts((prev) => {
      const next = { ...prev }
      delete next[stepId]
      return next
    })
  }

  const startEditingStepDocument = (stepId: number, document: WorkflowStepInstanceDocument) => {
    setEditingStepDocument({
      stepId,
      documentId: document.id,
      draft: {
        name: document.name,
        required: document.required,
        timing: document.timing ?? '',
        notes: document.notes ?? '',
        attachment_ids: [...(document.attachment_ids ?? [])],
      },
    })
  }

  const collectFormationLPPaidInUpdates = async (fundId: number): Promise<WorkflowStepLPPaidInInput[] | null> => {
    let lps: LP[] = []
    try {
      lps = await queryClient.fetchQuery({
        queryKey: ['fundLPs', fundId],
        queryFn: () => fetchFundLPs(fundId),
      })
    } catch {
      addToast('error', 'LP 목록을 불러오지 못했습니다.')
      return null
    }

    if (lps.length === 0) {
      addToast('error', '납입 금액을 입력할 LP가 없습니다.')
      return null
    }

    const updates: WorkflowStepLPPaidInInput[] = []
    for (const lp of lps) {
      const currentValue = Math.max(0, Number(lp.paid_in ?? 0))
      const inputValue = prompt(
        `[${lp.name}] 누적 납입액(원)을 입력하세요.`,
        String(currentValue),
      )
      if (inputValue === null) {
        return null
      }

      const normalized = inputValue.replace(/,/g, '').trim()
      const parsed = normalized === '' ? 0 : Number(normalized)
      if (!Number.isFinite(parsed) || parsed < 0) {
        addToast('error', `${lp.name} 납입액은 0 이상의 숫자로 입력해야 합니다.`)
        return null
      }
      updates.push({
        lp_id: lp.id,
        paid_in: Math.round(parsed),
      })
    }

    return updates
  }

  const handleCompleteStep = async (instance: WorkflowInstance, step: WorkflowStepInstance) => {
    const requiredUncheckedCount = (step.step_documents ?? []).filter(
      (doc) => doc.required && !doc.checked,
    ).length
    if (requiredUncheckedCount > 0) {
      const shouldComplete = confirm(
        `필수 서류 ${requiredUncheckedCount}건이 미확인 상태입니다. 그래도 완료하시겠습니까?`,
      )
      if (!shouldComplete) return
    }

    const isFormationPaidInStep =
      !!instance.fund_id &&
      isFormationWorkflowInstance(instance) &&
      isFormationPaidInConfirmationStep(step.step_name)

    let lpPaidInUpdates: WorkflowStepLPPaidInInput[] | undefined
    if (isFormationPaidInStep) {
      const updates = await collectFormationLPPaidInUpdates(instance.fund_id as number)
      if (!updates) {
        return
      }
      lpPaidInUpdates = updates
    }

    completeMut.mutate({
      instanceId: instance.id,
      stepId: step.id,
      estimated: step.estimated_time,
      lpPaidInUpdates,
    })
  }

  const completeMut = useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      estimated,
      lpPaidInUpdates,
    }: {
      instanceId: number
      stepId: number
      estimated?: string | null
      lpPaidInUpdates?: WorkflowStepLPPaidInInput[]
    }) =>
      completeWorkflowStep(instanceId, stepId, {
        actual_time: estimated || undefined,
        lp_paid_in_updates: lpPaidInUpdates,
      }),
    onSuccess: (instance) => {
      invalidateCapitalLinkedQueries(instance.fund_id)
      const isFormationWorkflow = instance.workflow_name.includes('결성')
      if (instance.status === 'completed' && isFormationWorkflow) {
        addToast('success', "워크플로우가 완료되어 조합 상태가 '운용 중'으로 변경되었습니다. 업무일지에 자동 기록됩니다.")
      } else {
        addToast('success', '단계가 완료되었습니다. 업무일지에 자동 기록됩니다.')
      }
    },
  })

  const checkStepDocumentMut = useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      documentId,
      checked,
    }: {
      instanceId: number
      stepId: number
      documentId: number
      checked: boolean
      fundId?: number | null
    }) => checkWorkflowStepInstanceDocument(instanceId, stepId, documentId, checked),
    onSuccess: (_document, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
    },
  })

  const addStepDocumentMut = useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      data,
    }: {
      instanceId: number
      stepId: number
      data: StepDocumentDraft
      fundId?: number | null
    }) =>
      addWorkflowStepInstanceDocument(instanceId, stepId, {
        name: data.name.trim(),
        required: data.required,
        timing: data.timing.trim() || null,
        notes: data.notes.trim() || null,
        attachment_ids: data.attachment_ids,
      }),
    onSuccess: (_document, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
      clearNewStepDocDraft(variables.stepId)
      addToast('success', '단계 서류를 추가했습니다.')
    },
  })

  const updateStepDocumentMut = useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      documentId,
      data,
    }: {
      instanceId: number
      stepId: number
      documentId: number
      data: StepDocumentDraft
      fundId?: number | null
    }) =>
      updateWorkflowStepInstanceDocument(instanceId, stepId, documentId, {
        name: data.name.trim(),
        required: data.required,
        timing: data.timing.trim() || null,
        notes: data.notes.trim() || null,
        attachment_ids: data.attachment_ids,
      }),
    onSuccess: (_document, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
      if (editingStepDocument?.documentId === variables.documentId) {
        setEditingStepDocument(null)
      }
      addToast('success', '단계 서류를 수정했습니다.')
    },
  })

  const attachFileToStepDocumentMut = useMutation({
    mutationFn: async ({
      instanceId,
      stepId,
      document,
      file,
    }: {
      instanceId: number
      stepId: number
      document: WorkflowStepInstanceDocument
      file: File
      fundId?: number | null
    }) => {
      const uploaded = await uploadAttachment(file, 'workflow_step_instance_document', document.id)
      const nextAttachmentIds = [...new Set([...(document.attachment_ids ?? []), uploaded.id])]
      return updateWorkflowStepInstanceDocument(instanceId, stepId, document.id, {
        attachment_ids: nextAttachmentIds,
      })
    },
    onSuccess: (_document, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
      addToast('success', '첨부 파일을 추가했습니다.')
    },
  })

  const removeFileFromStepDocumentMut = useMutation({
    mutationFn: async ({
      instanceId,
      stepId,
      document,
      attachmentId,
    }: {
      instanceId: number
      stepId: number
      document: WorkflowStepInstanceDocument
      attachmentId: number
      fundId?: number | null
    }) => {
      const nextAttachmentIds = (document.attachment_ids ?? []).filter((id) => id !== attachmentId)
      await updateWorkflowStepInstanceDocument(instanceId, stepId, document.id, {
        attachment_ids: nextAttachmentIds,
      })
    },
    onSuccess: (_document, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
      addToast('success', '첨부 파일을 제거했습니다.')
    },
  })

  const deleteStepDocumentMut = useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      documentId,
    }: {
      instanceId: number
      stepId: number
      documentId: number
      fundId?: number | null
    }) => deleteWorkflowStepInstanceDocument(instanceId, stepId, documentId),
    onSuccess: (_result, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
      addToast('success', '단계 서류를 삭제했습니다.')
    },
  })

  const undoStepMut = useMutation({
    mutationFn: ({ instanceId, stepId }: { instanceId: number; stepId: number }) => undoWorkflowStep(instanceId, stepId),
    onSuccess: (instance) => {
      invalidateCapitalLinkedQueries(instance.fund_id)
      addToast('success', '단계 완료가 취소되었습니다.')
    },
  })

  const updateInstanceMut = useMutation({
    mutationFn: ({
      instanceId,
      data,
    }: {
      instanceId: number
      data: { name: string; trigger_date: string; memo: string | null }
      fundId?: number | null
    }) =>
      updateWorkflowInstance(instanceId, data),
    onSuccess: (_instance, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
      setEditingInstanceId(null)
      setEditInstance(null)
      addToast('success', '인스턴스를 수정했습니다.')
    },
  })

  const cancelMut = useMutation({
    mutationFn: cancelWorkflowInstance,
    onSuccess: (instance) => {
      invalidateCapitalLinkedQueries(instance.fund_id)
      addToast('success', '인스턴스가 취소되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: ({ instanceId }: { instanceId: number; fundId?: number | null }) => deleteWorkflowInstance(instanceId),
    onSuccess: (_, variables) => {
      invalidateCapitalLinkedQueries(variables.fundId)
      addToast('success', '인스턴스를 삭제했습니다.')
    },
  })

  const swapTemplateMut = useMutation({
    mutationFn: ({ instanceId, templateId }: { instanceId: number; templateId: number }) =>
      swapWorkflowInstanceTemplate(instanceId, { template_id: templateId }),
    onSuccess: (instance) => {
      invalidateCapitalLinkedQueries(instance.fund_id)
      setSwapTarget(null)
      setSwapTemplateId('')
      addToast('success', '워크플로 템플릿을 교체했습니다.')
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : '템플릿 교체에 실패했습니다.'
      addToast('error', message)
    },
  })

  const toggleInstanceEdit = (inst: WorkflowInstance) => {
    if (editingInstanceId === inst.id) {
      setEditingInstanceId(null)
      setEditInstance(null)
      return
    }
    setEditingInstanceId(inst.id)
    setEditInstance({
      name: inst.name,
      trigger_date: inst.trigger_date,
      memo: inst.memo || '',
    })
  }

  const formatCompletedAt = (value: string | null): string | null => {
    if (!value) return null
    return new Date(value).toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const openSwapTemplateModal = (instance: WorkflowInstance) => {
    setSwapTemplateId(instance.workflow_id)
    setSwapTarget(instance)
  }

  const handleSwapTemplate = () => {
    if (!swapTarget) return
    if (!swapTemplateId) {
      addToast('error', '교체할 템플릿을 선택해주세요.')
      return
    }
    if (!confirm('기존 단계와 미완료 업무를 초기화하고 새 템플릿으로 교체하시겠습니까?')) {
      return
    }
    swapTemplateMut.mutate({
      instanceId: swapTarget.id,
      templateId: Number(swapTemplateId),
    })
  }

  useEffect(() => {
    if (expandId === undefined) return
    setOpenId(expandId ?? null)
  }, [expandId])

  useEffect(() => {
    if (!openId) return
    if (!(data ?? []).some((instance) => instance.id === openId)) {
      setOpenId(null)
    }
  }, [data, openId])

  const instanceRows = useMemo(() => {
    const now = new Date()
    return (data ?? []).map((inst) => buildWorkflowInstanceView(inst, now))
  }, [data])

  const activeRows = useMemo(() => (
    [...instanceRows]
      .filter((row) => row.inst.status === 'active')
      .sort((a, b) => {
        const bucketDiff = workflowPrimaryBucketRank(a.primaryBucket) - workflowPrimaryBucketRank(b.primaryBucket)
        if (bucketDiff !== 0) return bucketDiff
        if (a.dueMeta.dueTime !== b.dueMeta.dueTime) return a.dueMeta.dueTime - b.dueMeta.dueTime
        return a.inst.id - b.inst.id
      })
  ), [instanceRows])

  const visibleActiveRows = useMemo(() => {
    if (activeFilter === 'all') return activeRows
    return activeRows.filter((row) => row.primaryBucket === activeFilter)
  }, [activeFilter, activeRows])

  const completedRows = useMemo(() => {
    const now = new Date()
    return [...instanceRows]
      .filter((row) => row.isCompleted)
      .filter((row) => {
        if (completedRange === 'all') return true
        return isWithinRecentDays(row.inst.completed_at, completedRange === '7d' ? 7 : 30, now)
      })
      .sort((a, b) => {
        if (a.completedAtMs !== b.completedAtMs) return b.completedAtMs - a.completedAtMs
        return b.inst.id - a.inst.id
      })
  }, [completedRange, instanceRows])

  const cancelledRows = useMemo(() => {
    const now = new Date()
    return [...instanceRows]
      .filter((row) => row.isCancelled)
      .filter((row) => {
        if (completedRange === 'all') return true
        return isWithinRecentDays(row.inst.created_at, completedRange === '7d' ? 7 : 30, now)
      })
      .sort((a, b) => {
        if (a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs
        return b.inst.id - a.inst.id
      })
  }, [completedRange, instanceRows])

  const activeSummary = useMemo(() => ({
    total: activeRows.length,
    notStarted: activeRows.filter((row) => row.primaryBucket === 'not_started').length,
    inProgress: activeRows.filter((row) => row.primaryBucket === 'in_progress').length,
    overdue: activeRows.filter((row) => row.primaryBucket === 'overdue').length,
    today: activeRows.filter((row) => row.dueMeta.tone === 'today').length,
    weekDue: activeRows.filter((row) => row.dueMeta.tone === 'today' || row.dueMeta.tone === 'this_week').length,
  }), [activeRows])

  const completedSummary = useMemo(() => {
    const now = new Date()
    return {
      total: instanceRows.filter((row) => row.isCompleted).length,
      recent7d: instanceRows.filter((row) => row.isCompleted && isWithinRecentDays(row.inst.completed_at, 7, now)).length,
      recent30d: instanceRows.filter((row) => row.isCompleted && isWithinRecentDays(row.inst.completed_at, 30, now)).length,
      cancelled: instanceRows.filter((row) => row.isCancelled).length,
    }
  }, [instanceRows])

  const isActiveView = view === 'active'
  const visibleRows = isActiveView ? visibleActiveRows : completedRows

  if (isLoading) return <PageLoading />

  return (
    <div className="space-y-2.5">
      {isActiveView ? (
        <div className="rounded-xl border border-[#d8e5fb] bg-white px-3 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {[
              { key: 'all' as const, label: '전체', count: activeSummary.total },
              { key: 'not_started' as const, label: '시작 전', count: activeSummary.notStarted },
              { key: 'in_progress' as const, label: '진행 중', count: activeSummary.inProgress },
              { key: 'overdue' as const, label: '지연', count: activeSummary.overdue },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${filterChipClass(activeFilter === filter.key)}`}
              >
                {filter.label} {filter.count}건
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 font-medium text-[#64748b]">
              오늘 마감 {activeSummary.today}건
            </span>
            <span className="rounded-full border border-[#d4a418] bg-[#fff7d6] px-2.5 py-1 font-medium text-[#624100]">
              이번 주 마감 {activeSummary.weekDue}건
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#d8e5fb] bg-white px-3 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {[
              { key: 'all' as const, label: '전체', count: completedSummary.total },
              { key: '7d' as const, label: '최근 7일', count: completedSummary.recent7d },
              { key: '30d' as const, label: '최근 30일', count: completedSummary.recent30d },
            ].map((range) => (
              <button
                key={range.key}
                type="button"
                onClick={() => setCompletedRange(range.key)}
                className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${filterChipClass(completedRange === range.key)}`}
              >
                {range.label} {range.count}건
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIncludeCancelled((prev) => !prev)}
              className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${filterChipClass(includeCancelled)}`}
            >
              취소 포함 {completedSummary.cancelled}건
            </button>
          </div>
        </div>
      )}

      {!visibleRows.length && !(view === 'completed' && includeCancelled && cancelledRows.length > 0) ? (
        <EmptyState message={isActiveView ? '미완료 워크플로우가 없습니다.' : '완료된 워크플로우가 없습니다.'} className="py-10" />
      ) : null}

      {visibleRows.map((row) => {
        const { inst } = row
        const nextCompletableStep = row.currentStep
        const dueMeta = row.dueMeta
        const progressPercent = row.progressPercent
        const dueBadge = dueToneBadge(dueMeta)
        const instanceToneClass =
          isActiveView
            ? row.primaryBucket === 'overdue'
              ? 'border-[#bfa5a7] bg-[#fffafb]'
              : row.primaryBucket === 'in_progress'
                ? 'border-[#b2cbfb] bg-white'
                : 'border-[#d8e5fb] bg-white'
            : row.isCancelled
              ? 'border-[#cbd5e1] bg-[#f8fafc]'
              : 'border-[#d8e5fb] bg-white'
        const primaryBadge = primaryBucketBadge(row.primaryBucket)
        const completionBadge = completionBucketBadge(row.completionBucket)
        return (
        <div key={inst.id} className={`overflow-hidden rounded-xl border shadow-sm ${instanceToneClass}`}>
          <div onClick={() => setOpenId(openId === inst.id ? null : inst.id)} className="flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-3 text-left hover:bg-[#f5f9ff]">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-[13px] font-semibold text-[#0f1f3d]">{inst.name}</p>
                {isActiveView && primaryBadge && <span className={primaryBadge.className}>{primaryBadge.label}</span>}
                {!isActiveView && completionBadge && <span className={completionBadge.className}>{completionBadge.label}</span>}
                {isActiveView && dueBadge && <span className={dueBadge.className}>{dueBadge.label}</span>}
              </div>
              <p className="truncate text-xs text-[#64748b]">{inst.workflow_name} · {inst.trigger_date} · {row.displayConnection}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#64748b]">
                <span>완료 단계 {row.completedStepCount + row.skippedStepCount}/{row.totalStepCount}</span>
                {isActiveView ? (
                  <span>현재 단계 {row.currentStep?.step_name ?? '없음'}</span>
                ) : (
                  <span>마지막 완료 {row.lastCompletedStep?.step_name ?? '-'}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-36 overflow-hidden rounded-full bg-[#d8e5fb]">
                  <div className="h-full rounded-full bg-[#558ef8] transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="text-xs font-medium text-[#64748b]">
                  {inst.progress || `${row.completedStepCount + row.skippedStepCount}/${row.totalStepCount}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onPrintInstance(inst)
                }}
                className="secondary-btn btn-sm inline-flex items-center gap-1"
              >
                <Printer size={13} /> 인쇄
              </button>
              {isActiveView && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleInstanceEdit(inst)
                  }}
                  className="secondary-btn btn-sm text-xs"
                >
                  수정
                </button>
              )}
              {isActiveView && nextCompletableStep && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenId(inst.id)
                  }}
                  className="secondary-btn btn-sm text-xs"
                >
                  다음 단계 보기
                </button>
              )}
              {isActiveView && canSwapWorkflowTemplate(inst) && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    openSwapTemplateModal(inst)
                  }}
                  className="secondary-btn btn-sm inline-flex items-center gap-1 text-xs"
                  title="진행 전(0%) 워크플로 템플릿 교체"
                >
                  <RefreshCcw size={13} />
                  템플릿 교체
                </button>
              )}
              <ChevronRight size={16} className={`text-[#64748b] transition-transform ${openId === inst.id ? 'rotate-90' : ''}`} />
            </div>
          </div>
          {openId === inst.id && (
            <div className="space-y-2 border-t border-[#e6eefc] px-3 py-2.5">
              {isActiveView && editingInstanceId === inst.id && editInstance && (
                <div className="mb-2 space-y-2 rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] p-2.5">
                  <div>
                    <label className="form-label">인스턴스 이름</label>
                    <input
                      value={editInstance.name}
                      onChange={(event) => setEditInstance((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                      placeholder="예: 2026년 1차 출자요청"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">기준일</label>
                    <input
                      type="date"
                      value={editInstance.trigger_date}
                      onChange={(event) => setEditInstance((prev) => (prev ? { ...prev, trigger_date: event.target.value } : prev))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">메모</label>
                    <textarea
                      value={editInstance.memo}
                      onChange={(event) => setEditInstance((prev) => (prev ? { ...prev, memo: event.target.value } : prev))}
                      rows={2}
                      placeholder="선택 입력"
                      className="form-input"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!editInstance.name.trim() || !editInstance.trigger_date) return
                        updateInstanceMut.mutate({
                          instanceId: inst.id,
                          fundId: inst.fund_id,
                          data: {
                            name: editInstance.name.trim(),
                            trigger_date: editInstance.trigger_date,
                            memo: editInstance.memo.trim() || null,
                          },
                        })
                      }}
                      disabled={updateInstanceMut.isPending || !editInstance.name.trim() || !editInstance.trigger_date}
                      className="primary-btn"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingInstanceId(null)
                        setEditInstance(null)
                      }}
                      className="secondary-btn"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {!isActiveView && (
                <div className="mb-2 grid gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Completed</p>
                    <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">
                      {row.isCompleted ? formatInstanceDate(inst.completed_at) : '취소 시점 미기록'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Last Step</p>
                    <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{row.lastCompletedStep?.step_name ?? '-'}</p>
                  </div>
                  <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Progress</p>
                    <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{row.completedStepCount + row.skippedStepCount}/{row.totalStepCount} 단계 완료</p>
                  </div>
                  <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Connection</p>
                    <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{row.displayConnection}</p>
                  </div>
                </div>
              )}

              {!isActiveView && row.isCompleted && row.lastCompletedStep && onResumeInstance && (
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm('가장 최근 완료 단계를 되돌리고 워크플로우를 재개하시겠습니까?')) return
                      undoStepMut.mutate(
                        { instanceId: inst.id, stepId: row.lastCompletedStep!.id },
                        {
                          onSuccess: (instance) => {
                            setOpenId(null)
                            onResumeInstance(instance.id)
                          },
                        },
                      )
                    }}
                    className="secondary-btn btn-sm"
                  >
                    재개
                  </button>
                </div>
              )}

              {(
                isActiveView
                  ? [...(row.currentStep ? [row.currentStep] : []), ...row.upcomingSteps, ...row.completedSteps]
                  : row.orderedSteps
              ).map((step: WorkflowStepInstance) => {
                const canComplete =
                  isActiveView &&
                  nextCompletableStep?.id === step.id &&
                  step.status !== 'completed' &&
                  step.status !== 'skipped'
                const isCurrentStep =
                  isActiveView &&
                  nextCompletableStep?.id === step.id &&
                  step.status !== 'completed' &&
                  step.status !== 'skipped'
                const stepDocuments = step.step_documents ?? []
                const requiredUncheckedCount = stepDocuments.filter((doc) => doc.required && !doc.checked).length
                const canMutateStepDocuments =
                  isActiveView && step.status !== 'completed' && step.status !== 'skipped'
                const hasDraft = Boolean(newStepDocDrafts[step.id])
                const newDraft = getNewStepDocDraft(step.id)
                const editingCurrentDocument =
                  editingStepDocument && editingStepDocument.stepId === step.id ? editingStepDocument : null
                return (
                  <div key={step.id} className="space-y-1.5">
                    {isActiveView && row.currentStep?.id === step.id && (
                      <div className="px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Current</p>
                        <p className="text-sm font-semibold text-[#0f1f3d]">현재 단계</p>
                      </div>
                    )}
                    {isActiveView && row.upcomingSteps[0]?.id === step.id && (
                      <div className="px-1 pt-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Upcoming</p>
                        <p className="text-sm font-semibold text-[#0f1f3d]">예정 단계</p>
                      </div>
                    )}
                    {isActiveView && row.completedSteps[0]?.id === step.id && (
                      <div className="px-1 pt-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Completed</p>
                        <p className="text-sm font-semibold text-[#0f1f3d]">완료된 단계</p>
                      </div>
                    )}
                    {!isActiveView && row.orderedSteps[0]?.id === step.id && (
                      <div className="px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Timeline</p>
                        <p className="text-sm font-semibold text-[#0f1f3d]">전체 단계 타임라인</p>
                      </div>
                    )}
                    <div className={`flex-col space-y-1.5 rounded-lg px-2.5 py-2 text-xs ${step.status === 'completed' && !isActiveView ? 'border border-[#e2e8f0] bg-[#f8fafc] opacity-75' : step.status === 'completed' ? 'border border-[#e2e8f0] bg-[#f8fafc] opacity-85' : isCurrentStep ? 'border border-[#b2cbfb] bg-[#f5f9ff]' : 'border border-[#d8e5fb] bg-white'}`}>
                    <div className="flex items-center gap-1.5">
                      {step.status === 'completed' ? (
                        <div className="flex items-center gap-1">
                          <Check size={14} className="text-emerald-600" />
                          {isActiveView && row.lastCompletedStep?.id === step.id && (
                            <button
                              onClick={() => undoStepMut.mutate({ instanceId: inst.id, stepId: step.id })}
                              className="text-xs text-[#64748b] hover:text-[#558ef8]"
                            >
                              되돌리기
                            </button>
                          )}
                        </div>
                      ) : isActiveView ? (
                        canComplete ? (
                          <button
                            onClick={() => handleCompleteStep(inst, step)}
                            className="h-4 w-4 rounded-full border-2 border-[#bfcff0] hover:border-green-500"
                            disabled={completeMut.isPending}
                          />
                        ) : (
                          <span title="이전 단계를 먼저 완료해주세요" className="h-4 w-4 rounded-full border-2 border-[#d8e5fb] bg-[#f5f9ff]" />
                        )
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className={`flex-1 ${step.status === 'completed' ? 'line-through text-[#64748b]' : isCurrentStep ? 'font-semibold text-[#1a3660]' : 'text-[#0f1f3d]'}`}>{step.step_name}</span>
                      <span className="text-xs text-[#64748b]">{labelStatus(step.status)}</span>
                      {isCurrentStep && (
                        <span className="rounded-full border border-[#b2cbfb] bg-[#e6efff] px-1.5 py-0.5 text-[9px] font-semibold text-[#1a3660]">
                          현재 단계
                        </span>
                      )}
                      <span className="text-xs text-[#64748b]">{step.calculated_date}</span>
                      {(() => {
                        const matchingDocs = docTemplates.filter(
                          (template) =>
                            template.workflow_step_label &&
                            step.step_name.includes(template.workflow_step_label),
                        )
                        if (matchingDocs.length === 0 || !inst.fund_id) return null
                        return (
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              handleGenerateDocuments(matchingDocs, inst)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#f5f9ff] px-2 py-1 text-xs text-[#558ef8] transition-colors hover:bg-[#e6efff]"
                          >
                            문서 생성 ({matchingDocs.length}종)
                          </button>
                        )
                      })()}
                      {step.completed_at && <span className="text-xs text-[#64748b]">{formatCompletedAt(step.completed_at)}</span>}
                    </div>

                    <div className="mt-1 overflow-hidden rounded-lg border border-[#d8e5fb] bg-white px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#0f1f3d]">단계 서류 {stepDocuments.length}건</p>
                        {canMutateStepDocuments && (
                          <button
                            onClick={() => setNewStepDocDraft(step.id, {})}
                            className="text-xs text-[#558ef8] hover:text-[#1a3660]"
                          >
                            + 서류 추가
                          </button>
                        )}
                      </div>

                      {stepDocuments.length === 0 ? (
                        <p className="text-xs text-[#64748b]">등록된 단계 서류가 없습니다.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {stepDocuments.map((doc) => {
                            const isEditing = editingCurrentDocument?.documentId === doc.id
                            return (
                              <div key={doc.id} className={`rounded border px-2 py-1.5 ${doc.checked ? 'border-emerald-200 bg-emerald-50/60' : 'border-[#d8e5fb] bg-white'}`}>
                                {isEditing && editingCurrentDocument ? (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                      <input
                                        value={editingCurrentDocument.draft.name}
                                        onChange={(event) =>
                                          setEditingStepDocument((prev) => (prev ? {
                                            ...prev,
                                            draft: { ...prev.draft, name: event.target.value },
                                          } : prev))
                                        }
                                        placeholder="서류명"
                                        className="form-input"
                                      />
                                      <input
                                        value={editingCurrentDocument.draft.timing}
                                        onChange={(event) =>
                                          setEditingStepDocument((prev) => (prev ? {
                                            ...prev,
                                            draft: { ...prev.draft, timing: event.target.value },
                                          } : prev))
                                        }
                                        placeholder="시점 (선택)"
                                        className="form-input"
                                      />
                                      <input
                                        value={editingCurrentDocument.draft.notes}
                                        onChange={(event) =>
                                          setEditingStepDocument((prev) => (prev ? {
                                            ...prev,
                                            draft: { ...prev.draft, notes: event.target.value },
                                          } : prev))
                                        }
                                        placeholder="메모 (선택)"
                                        className="form-input"
                                      />
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <label className="inline-flex items-center gap-1 text-xs text-[#64748b]">
                                        <input
                                          type="checkbox"
                                          checked={editingCurrentDocument.draft.required}
                                          onChange={(event) =>
                                            setEditingStepDocument((prev) => (prev ? {
                                              ...prev,
                                              draft: { ...prev.draft, required: event.target.checked },
                                            } : prev))
                                          }
                                        />
                                        필수
                                      </label>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() =>
                                            updateStepDocumentMut.mutate({
                                              instanceId: inst.id,
                                              stepId: step.id,
                                              documentId: doc.id,
                                              data: editingCurrentDocument.draft,
                                              fundId: inst.fund_id,
                                            })
                                          }
                                          disabled={updateStepDocumentMut.isPending || !editingCurrentDocument.draft.name.trim()}
                                          className="primary-btn btn-sm"
                                        >
                                          저장
                                        </button>
                                        <button
                                          onClick={() => setEditingStepDocument(null)}
                                          className="secondary-btn btn-sm"
                                        >
                                          취소
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={doc.checked}
                                      disabled={!canMutateStepDocuments || checkStepDocumentMut.isPending}
                                      onChange={(event) =>
                                        checkStepDocumentMut.mutate({
                                          instanceId: inst.id,
                                          stepId: step.id,
                                          documentId: doc.id,
                                          checked: event.target.checked,
                                          fundId: inst.fund_id,
                                        })
                                      }
                                      className="mt-1"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[12px] font-medium text-[#0f1f3d]">
                                        {doc.name}
                                        <span className={`ml-1 rounded px-1 py-0.5 text-xs ${doc.required ? 'bg-rose-100 text-rose-700' : 'bg-[#f5f9ff] text-[#64748b]'}`}>
                                          {doc.required ? '필수' : '선택'}
                                        </span>
                                      </p>
                                      <p className="text-xs text-[#64748b]">
                                        {doc.timing || '시점 미정'}
                                        {doc.notes ? ` | ${doc.notes}` : ''}
                                        {doc.template_name ? ` | 템플릿: ${doc.template_name}` : ''}
                                      </p>
                                      {(doc.attachment_ids?.length ?? 0) > 0 && (
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                          {(doc.attachment_ids ?? []).map((attachmentId) => {
                                            const meta = attachmentById.get(attachmentId)
                                            return (
                                              <span key={attachmentId} className="inline-flex items-center gap-1 rounded border border-[#d8e5fb] bg-[#f5f9ff] px-1.5 py-0.5 text-xs">
                                                <button
                                                  type="button"
                                                  onClick={() => handleDownloadAttachment(attachmentId)}
                                                  className="text-[#558ef8] hover:text-[#1a3660]"
                                                >
                                                  {meta?.original_filename || `파일 #${attachmentId}`}
                                                </button>
                                                {canMutateStepDocuments && (
                                                  <button
                                                    type="button"
                                                    onClick={() => removeFileFromStepDocumentMut.mutate({
                                                      instanceId: inst.id,
                                                      stepId: step.id,
                                                      document: doc,
                                                      attachmentId,
                                                      fundId: inst.fund_id,
                                                    })}
                                                    className="text-red-600 hover:text-red-700"
                                                  >
                                                    제거
                                                  </button>
                                                )}
                                              </span>
                                            )
                                          })}
                                        </div>
                                      )}
                                      {canMutateStepDocuments && (
                                        <label className="mt-1 inline-flex cursor-pointer rounded border border-[#c5d8fb] bg-[#f5f9ff] px-2 py-0.5 text-xs text-[#1a3660]">
                                          파일 첨부
                                          <input
                                            type="file"
                                            className="hidden"
                                            onChange={(event) => {
                                              const file = event.target.files?.[0]
                                              event.currentTarget.value = ''
                                              if (!file) return
                                              attachFileToStepDocumentMut.mutate({
                                                instanceId: inst.id,
                                                stepId: step.id,
                                                document: doc,
                                                file,
                                                fundId: inst.fund_id,
                                              })
                                            }}
                                          />
                                        </label>
                                      )}
                                    </div>
                                    <span className={`rounded px-1.5 py-0.5 text-xs ${doc.checked ? 'bg-emerald-100 text-emerald-700' : 'bg-[#fff7d6] text-[#624100]'}`}>
                                      {doc.checked ? '확인 완료' : '미확인'}
                                    </span>
                                    {canMutateStepDocuments && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => startEditingStepDocument(step.id, doc)}
                                          className="text-xs text-[#558ef8] hover:text-[#1a3660]"
                                        >
                                          수정
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (!confirm('이 단계 서류를 삭제하시겠습니까?')) return
                                            deleteStepDocumentMut.mutate({
                                              instanceId: inst.id,
                                              stepId: step.id,
                                              documentId: doc.id,
                                              fundId: inst.fund_id,
                                            })
                                          }}
                                          className="text-xs text-red-600 hover:text-red-700"
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {hasDraft && (
                        <div className="mt-2 space-y-2 rounded border border-dashed border-[#b2cbfb] bg-[#f5f9ff] p-2">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <input
                              value={newDraft.name}
                              onChange={(event) => setNewStepDocDraft(step.id, { name: event.target.value })}
                              placeholder="서류명"
                              className="form-input"
                            />
                            <input
                              value={newDraft.timing}
                              onChange={(event) => setNewStepDocDraft(step.id, { timing: event.target.value })}
                              placeholder="시점 (선택)"
                              className="form-input"
                            />
                            <input
                              value={newDraft.notes}
                              onChange={(event) => setNewStepDocDraft(step.id, { notes: event.target.value })}
                              placeholder="메모 (선택)"
                              className="form-input"
                            />
                          </div>
                          {(newDraft.attachment_ids?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(newDraft.attachment_ids ?? []).map((attachmentId) => {
                                const meta = attachmentById.get(attachmentId)
                                return (
                                  <span key={attachmentId} className="inline-flex items-center gap-1 rounded border border-[#d8e5fb] bg-white px-1.5 py-0.5 text-xs">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadAttachment(attachmentId)}
                                      className="text-[#558ef8] hover:text-[#1a3660]"
                                    >
                                      {meta?.original_filename || `파일 #${attachmentId}`}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setNewStepDocDraft(step.id, {
                                        attachment_ids: (newDraft.attachment_ids ?? []).filter((id) => id !== attachmentId),
                                      })}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      제거
                                    </button>
                                  </span>
                                )
                              })}
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <label className="inline-flex items-center gap-1 text-xs text-[#64748b]">
                              <input
                                type="checkbox"
                                checked={newDraft.required}
                                onChange={(event) => setNewStepDocDraft(step.id, { required: event.target.checked })}
                              />
                              필수
                            </label>
                            <div className="flex items-center gap-2">
                              <label className="inline-flex cursor-pointer rounded border border-[#c5d8fb] bg-white px-2 py-1 text-xs text-[#1a3660]">
                                파일 업로드
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={async (event) => {
                                    const file = event.target.files?.[0]
                                    event.currentTarget.value = ''
                                    if (!file) return
                                    try {
                                      const uploaded = await uploadAttachment(file)
                                      setNewStepDocDraft(step.id, {
                                        attachment_ids: [...new Set([...(newDraft.attachment_ids ?? []), uploaded.id])],
                                      })
                                    } catch {
                                      addToast('error', '파일 업로드에 실패했습니다.')
                                    }
                                  }}
                                />
                              </label>
                              <button
                                onClick={() =>
                                  addStepDocumentMut.mutate({
                                    instanceId: inst.id,
                                    stepId: step.id,
                                    data: newDraft,
                                    fundId: inst.fund_id,
                                  })
                                }
                                disabled={addStepDocumentMut.isPending || !newDraft.name.trim()}
                                className="primary-btn btn-sm"
                              >
                                추가
                              </button>
                              <button
                                onClick={() => clearNewStepDocDraft(step.id)}
                                className="secondary-btn btn-sm"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {requiredUncheckedCount > 0 && (
                        <p className="mt-1 text-xs font-medium text-[#624100]">
                          필수 서류 {requiredUncheckedCount}건 미확인
                        </p>
                      )}
                    </div>
                  </div>
                  </div>
                )
              })}
              {isActiveView && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm('이 인스턴스를 취소하시겠습니까?')) cancelMut.mutate(inst.id)
                    }}
                    className="text-xs text-red-600 hover:text-red-700"
                    disabled={cancelMut.isPending}
                  >
                    인스턴스 취소
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('이 인스턴스를 삭제하시겠습니까?\n미완료 업무는 함께 삭제됩니다.')) {
                        deleteMut.mutate({ instanceId: inst.id, fundId: inst.fund_id })
                      }
                    }}
                    className="text-xs text-red-700 hover:text-red-800"
                    disabled={deleteMut.isPending}
                  >
                    인스턴스 삭제
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        )
      })}

      {!isActiveView && includeCancelled && cancelledRows.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Cancelled</p>
              <p className="text-sm font-semibold text-[#0f1f3d]">취소된 워크플로우</p>
            </div>
            <span className="text-xs text-[#64748b]">취소 시점은 별도 기록되지 않습니다.</span>
          </div>
          {cancelledRows.map((row) => {
            const { inst } = row
            const dueMeta = row.dueMeta
            const progressPercent = row.progressPercent
            const dueBadge = dueToneBadge(dueMeta)
            const instanceToneClass = 'border-[#cbd5e1] bg-[#f8fafc]'
            const completionBadge = completionBucketBadge(row.completionBucket)
            return (
              <div key={`cancelled-${inst.id}`} className={`overflow-hidden rounded-xl border shadow-sm ${instanceToneClass}`}>
                <div onClick={() => setOpenId(openId === inst.id ? null : inst.id)} className="flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-3 text-left hover:bg-[#f5f9ff]">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold text-[#0f1f3d]">{inst.name}</p>
                      {completionBadge && <span className={completionBadge.className}>{completionBadge.label}</span>}
                      {dueBadge && <span className={dueBadge.className}>{dueBadge.label}</span>}
                    </div>
                    <p className="truncate text-xs text-[#64748b]">{inst.workflow_name} · {inst.trigger_date} · {row.displayConnection}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#64748b]">
                      <span>완료 단계 {row.completedStepCount + row.skippedStepCount}/{row.totalStepCount}</span>
                      <span>마지막 완료 {row.lastCompletedStep?.step_name ?? '-'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-36 overflow-hidden rounded-full bg-[#d8e5fb]">
                        <div className="h-full rounded-full bg-[#94a3b8] transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                      </div>
                      <span className="text-xs font-medium text-[#64748b]">
                        {inst.progress || `${row.completedStepCount + row.skippedStepCount}/${row.totalStepCount}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        onPrintInstance(inst)
                      }}
                      className="secondary-btn btn-sm inline-flex items-center gap-1"
                    >
                      <Printer size={13} /> 인쇄
                    </button>
                    <ChevronRight size={16} className={`text-[#64748b] transition-transform ${openId === inst.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
                {openId === inst.id && (
                  <div className="space-y-2 border-t border-[#e6eefc] px-3 py-2.5">
                    <div className="mb-2 grid gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Completed</p>
                        <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">취소 시점 미기록</p>
                      </div>
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Last Step</p>
                        <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{row.lastCompletedStep?.step_name ?? '-'}</p>
                      </div>
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Progress</p>
                        <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{row.completedStepCount + row.skippedStepCount}/{row.totalStepCount} 단계 완료</p>
                      </div>
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Connection</p>
                        <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{row.displayConnection}</p>
                      </div>
                    </div>
                    {row.orderedSteps.map((step) => (
                      <div key={`cancelled-step-${step.id}`} className={`flex-col space-y-1.5 rounded-lg border px-2.5 py-2 text-xs ${step.status === 'completed' ? 'border-[#e2e8f0] bg-[#f8fafc] opacity-75' : 'border-[#d8e5fb] bg-white'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className="h-4 w-4 rounded-full border border-[#d8e5fb] bg-white" />
                          <span className={`flex-1 ${step.status === 'completed' ? 'line-through text-[#64748b]' : 'text-[#0f1f3d]'}`}>{step.step_name}</span>
                          <span className="text-xs text-[#64748b]">{labelStatus(step.status)}</span>
                          <span className="text-xs text-[#64748b]">{step.calculated_date}</span>
                          {step.completed_at && <span className="text-xs text-[#64748b]">{formatCompletedAt(step.completed_at)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      <DrawerOverlay
        open={!!swapTarget}
        onClose={() => {
          if (swapTemplateMut.isPending) return
          setSwapTarget(null)
        }}
        title="템플릿 교체"
        widthClassName="w-full max-w-xl"
      >
        {swapTarget && (
          <div className="space-y-4">
            <p className="text-sm text-[#64748b]">
              [{swapTarget.name}] 워크플로를 다른 템플릿으로 교체합니다.
            </p>

            <div className="space-y-1">
              <label className="form-label">새 템플릿</label>
              <select
                value={swapTemplateId}
                onChange={(event) => {
                  const next = event.target.value
                  setSwapTemplateId(next ? Number(next) : '')
                }}
                className="form-input"
              >
                <option value="">템플릿을 선택하세요</option>
                {[...workflowTemplates]
                  .sort((a, b) => {
                    const categoryA = (a.category || '').trim()
                    const categoryB = (b.category || '').trim()
                    if (categoryA !== categoryB) return categoryA.localeCompare(categoryB, 'ko')
                    return a.name.localeCompare(b.name, 'ko')
                  })
                  .map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.category ? ` (${template.category})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {isFormationAssemblyWorkflow(swapTarget) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                결성총회 관련 템플릿은 스텝명에
                {' '}
                <strong>출자금 납입 확인</strong>
                {' '}
                등 납입/출자 확인 키워드가 포함되어야 결성금액 동기화가 정상 작동합니다.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSwapTarget(null)}
                className="secondary-btn"
                disabled={swapTemplateMut.isPending}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSwapTemplate}
                className="primary-btn"
                disabled={swapTemplateMut.isPending || !swapTemplateId}
              >
                {swapTemplateMut.isPending ? '교체 중...' : '교체하기'}
              </button>
            </div>
          </div>
        )}
      </DrawerOverlay>
    </div>
  )
}

function PeriodicSchedulesPanel() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<PeriodicScheduleInput>({
    name: '',
    category: '분기보고',
    recurrence: 'quarterly',
    base_month: 1,
    base_day: 1,
    workflow_template_id: null,
    fund_type_filter: null,
    is_active: true,
    steps: [],
    description: '',
  })

  const { data: schedules = [], isLoading } = useQuery<PeriodicSchedule[]>({
    queryKey: ['periodic-schedules'],
    queryFn: () => fetchPeriodicSchedules(false),
  })
  const { data: templates = [] } = useQuery<WorkflowListItem[]>({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
  })

  const resetForm = () => {
    setEditingId(null)
    setForm({
      name: '',
      category: '분기보고',
      recurrence: 'quarterly',
      base_month: 1,
      base_day: 1,
      workflow_template_id: null,
      fund_type_filter: null,
      is_active: true,
      steps: [],
      description: '',
    })
  }

  useEffect(() => {
    if (!editingId) return
    const target = schedules.find((row) => row.id === editingId)
    if (!target) return
    setForm({
      name: target.name,
      category: target.category,
      recurrence: target.recurrence,
      base_month: target.base_month,
      base_day: target.base_day,
      workflow_template_id: target.workflow_template_id,
      fund_type_filter: target.fund_type_filter,
      is_active: target.is_active,
      steps: [...(target.steps ?? [])],
      description: target.description ?? '',
    })
  }, [editingId, schedules])

  const saveMut = useMutation({
    mutationFn: () => {
      if (editingId) return updatePeriodicSchedule(editingId, form)
      return createPeriodicSchedule(form)
    },
    onSuccess: () => {
      invalidateWorkflowRelated(queryClient)
      addToast('success', editingId ? '정기 업무를 수정했습니다.' : '정기 업무를 추가했습니다.')
      resetForm()
    },
  })

  const deleteMut = useMutation({
    mutationFn: (scheduleId: number) => deletePeriodicSchedule(scheduleId),
    onSuccess: () => {
      invalidateWorkflowRelated(queryClient)
      addToast('success', '정기 업무를 삭제했습니다.')
      if (editingId) resetForm()
    },
  })

  const generateMut = useMutation({
    mutationFn: (dryRun: boolean) => generatePeriodicSchedulesForYear(year, dryRun),
    onSuccess: (result) => {
      invalidateWorkflowRelated(queryClient)
      addToast(
        'success',
        `${result.year}년 생성 완료: 인스턴스 ${result.created_instances}건, Task ${result.created_tasks}건`,
      )
    },
  })

  const timelineByMonth = useMemo(() => {
    const byMonth = new Map<number, PeriodicSchedule[]>()
    for (let month = 1; month <= 12; month += 1) byMonth.set(month, [])
    for (const schedule of schedules) {
      const months = periodicOccurrenceMonths(schedule)
      for (const month of months) {
        byMonth.get(month)?.push(schedule)
      }
    }
    return byMonth
  }, [schedules])

  return (
    <div className="space-y-4">
      <div className="card-base flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#0f1f3d]">정기 업무 캘린더</h3>
          <p className="text-sm text-[#64748b]">분기/반기/연간 템플릿을 연간 단위로 일괄 생성합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(event) => setYear(Number(event.target.value || new Date().getFullYear()))}
            className="form-input w-28"
          />
          <button
            onClick={() => generateMut.mutate(true)}
            className="secondary-btn"
            disabled={generateMut.isPending}
          >
            {generateMut.isPending ? '실행 중...' : '드라이런'}
          </button>
          <button
            onClick={() => {
              if (!confirm(`${year}년 정기 일정을 실제 생성하시겠습니까?`)) return
              generateMut.mutate(false)
            }}
            className="primary-btn"
            disabled={generateMut.isPending}
          >
            {generateMut.isPending ? '생성 중...' : `${year}년 일정 생성`}
          </button>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-max grid-cols-12 gap-2 px-0.5">
            {PERIODIC_MONTH_LABELS.map((label, monthIndex) => {
              const month = monthIndex + 1
              const rows = timelineByMonth.get(month) ?? []
              return (
                <div key={label} className="w-[96px] min-w-[96px] max-w-[96px] rounded-lg border border-[#d8e5fb] bg-white p-2">
                  <p className="mb-2 text-xs font-semibold text-[#0f1f3d]">{label}</p>
                  <div className="space-y-1">
                    {rows.length === 0 ? (
                      <p className="text-xs text-[#64748b]">-</p>
                    ) : (
                      rows.map((schedule) => (
                        <p
                          key={`${month}-${schedule.id}`}
                          className={`rounded border px-1.5 py-0.5 text-xs leading-snug break-all ${periodicCategoryClass(schedule.category)}`}
                        >
                          {schedule.name}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card-base space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#0f1f3d]">정기 업무 목록</h4>
            <span className="text-xs text-[#64748b]">{schedules.length}건</span>
          </div>
          {isLoading ? (
            <PageLoading />
          ) : schedules.length === 0 ? (
            <EmptyState message="등록된 정기 업무가 없습니다." className="py-8" />
          ) : (
            <div className="space-y-1.5">
              {schedules.map((schedule) => (
                <div key={schedule.id} className={`rounded-lg border p-2 ${editingId === schedule.id ? 'border-[#b2cbfb] bg-[#f5f9ff]' : 'border-[#d8e5fb] bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0f1f3d] break-all">{schedule.name}</p>
                      <p className="text-xs text-[#64748b] break-all">
                        {schedule.category} | {periodicRecurrenceLabel(schedule.recurrence)} | {schedule.base_month}/{schedule.base_day}
                        {schedule.fund_type_filter ? ` | 필터 ${schedule.fund_type_filter}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setEditingId(schedule.id)} className="secondary-btn text-xs">수정</button>
                      <button
                        onClick={() => {
                          if (!confirm('이 정기 업무를 삭제하시겠습니까?')) return
                          deleteMut.mutate(schedule.id)
                        }}
                        className="danger-btn text-xs"
                        disabled={deleteMut.isPending}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-base space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#0f1f3d]">{editingId ? '정기 업무 수정' : '정기 업무 추가'}</h4>
            {editingId && <button onClick={resetForm} className="secondary-btn text-xs">새로 작성</button>}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="업무명" className="form-input" />
            </div>
            <div>
              <input value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="카테고리" className="form-input" />
            </div>
            <div>
              <label className="form-label">주기</label>
              <select value={form.recurrence} onChange={(event) => setForm((prev) => ({ ...prev, recurrence: event.target.value }))} className="form-input">
                <option value="quarterly">분기</option>
                <option value="semi-annual">반기</option>
                <option value="annual">연간</option>
              </select>
            </div>
            <div>
              <label className="form-label">워크플로 템플릿</label>
              <select
                value={form.workflow_template_id ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, workflow_template_id: event.target.value ? Number(event.target.value) : null }))}
                className="form-input"
              >
                <option value="">선택 안 함</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">기준 월</label>
              <input type="number" min={1} max={12} value={form.base_month} onChange={(event) => setForm((prev) => ({ ...prev, base_month: Number(event.target.value || 1) }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">기준 일</label>
              <input type="number" min={1} max={31} value={form.base_day} onChange={(event) => setForm((prev) => ({ ...prev, base_day: Number(event.target.value || 1) }))} className="form-input" />
            </div>
            <div>
              <input
                value={form.fund_type_filter || ''}
                onChange={(event) => setForm((prev) => ({ ...prev, fund_type_filter: event.target.value || null }))}
                placeholder="예: LLC"
                className="form-input"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-[#0f1f3d]">
                <input type="checkbox" checked={!!form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
                활성 상태
              </label>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-[#d8e5fb] p-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#0f1f3d]">단계 설정</p>
              <button
                onClick={() => setForm((prev) => ({
                  ...prev,
                  steps: [...prev.steps, { name: '', offset_days: 0, is_notice: false, is_report: false }],
                }))}
                className="secondary-btn text-xs"
              >
                + 단계
              </button>
            </div>
            {(form.steps ?? []).map((step, stepIdx) => (
              <div key={`${step.name}-${stepIdx}`} className="grid grid-cols-1 gap-2 rounded border border-[#d8e5fb] bg-[#f5f9ff] p-2 md:grid-cols-6">
                <div className="md:col-span-2">
                  <input
                    value={step.name}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      steps: prev.steps.map((row, idx) => (idx === stepIdx ? { ...row, name: event.target.value } : row)),
                    }))}
                    placeholder="단계명"
                    className="form-input"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={step.offset_days}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      steps: prev.steps.map((row, idx) => (idx === stepIdx ? { ...row, offset_days: Number(event.target.value || 0) } : row)),
                    }))}
                    className="form-input"
                  />
                </div>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={!!step.is_notice}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      steps: prev.steps.map((row, idx) => (idx === stepIdx ? { ...row, is_notice: event.target.checked } : row)),
                    }))}
                  />
                  통지
                </label>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={!!step.is_report}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      steps: prev.steps.map((row, idx) => (idx === stepIdx ? { ...row, is_report: event.target.checked } : row)),
                    }))}
                  />
                  보고
                </label>
                <button
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    steps: prev.steps.filter((_, idx) => idx !== stepIdx),
                  }))}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="form-label">설명</label>
            <textarea value={form.description || ''} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} className="form-input min-h-[72px]" />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!form.name.trim() || !form.category.trim()) {
                  addToast('error', '업무명/카테고리를 입력하세요.')
                  return
                }
                saveMut.mutate()
              }}
              className="primary-btn"
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? '저장 중...' : editingId ? '수정 저장' : '추가'}
            </button>
            <button onClick={resetForm} className="secondary-btn">초기화</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const locationState = (location.state as WorkflowLocationState | null) ?? null

  const requestedTab = searchParams.get('tab')
  const isSupportedTab = (value: string | null): value is 'templates' | 'active' | 'completed' | 'checklists' | 'periodic' =>
    value === 'templates' || value === 'active' || value === 'completed' || value === 'checklists' || value === 'periodic'
  const [tab, setTab] = useState<'templates' | 'active' | 'completed' | 'checklists' | 'periodic'>(
    isSupportedTab(requestedTab) ? requestedTab : 'active',
  )
  const [focusedInstanceId, setFocusedInstanceId] = useState<number | null>(locationState?.expandInstanceId ?? null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<'create' | 'edit' | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const { data: templates, isLoading } = useQuery({ queryKey: ['workflows'], queryFn: fetchWorkflows })
  const { data: selected } = useQuery({ queryKey: ['workflow', selectedId], queryFn: () => fetchWorkflow(selectedId as number), enabled: !!selectedId })

  const groupedTemplates = useMemo(() => {
    if (!templates) return new Map<string, WorkflowListItem[]>()
    const map = new Map<string, WorkflowListItem[]>()
    for (const template of templates) {
      const category = template.category || '미분류'
      if (!map.has(category)) map.set(category, [])
      map.get(category)!.push(template)
    }
    return map
  }, [templates])

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  useEffect(() => {
    if (!isSupportedTab(requestedTab)) {
      if (tab !== 'active') setTab('active')
      return
    }
    if (requestedTab !== tab) {
      setTab(requestedTab)
    }
  }, [requestedTab, tab])

  const changeTab = (nextTab: 'templates' | 'active' | 'completed' | 'checklists' | 'periodic') => {
    setTab(nextTab)
    const nextParams = new URLSearchParams(searchParams)
    if (nextTab === 'active') nextParams.delete('tab')
    else nextParams.set('tab', nextTab)
    setSearchParams(nextParams, { replace: true })
  }

  useEffect(() => {
    if (!locationState?.expandInstanceId) return
    setFocusedInstanceId(locationState.expandInstanceId)
    if (tab !== 'active') {
      setTab('active')
    }
    if (requestedTab == null) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('tab')
    setSearchParams(nextParams, { replace: true })
  }, [locationState?.expandInstanceId, requestedTab, searchParams, setSearchParams, tab])

  const createMut = useMutation({
    mutationFn: createWorkflowTemplate,
    onSuccess: (row: WorkflowTemplate) => {
      invalidateWorkflowRelated(queryClient)
      setSelectedId(row.id)
      setMode(null)
      addToast('success', '템플릿이 생성되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkflowTemplateInput }) => updateWorkflowTemplate(id, data),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(['workflow', variables.id], updated)
      invalidateWorkflowRelated(queryClient)
      setMode(null)
      addToast('success', '템플릿이 수정되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteWorkflowTemplate,
    onSuccess: () => {
      invalidateWorkflowRelated(queryClient)
      if (selectedId) setSelectedId(null)
      addToast('success', '템플릿이 삭제되었습니다.')
    },
  })

  const handlePrintTemplate = (template: WorkflowTemplate) => {
    printWorkflowTemplateChecklist(template)
  }

  const handlePrintTemplateById = async (workflowId: number) => {
    try {
      const template = await queryClient.fetchQuery({
        queryKey: ['workflow', workflowId],
        queryFn: () => fetchWorkflow(workflowId),
      })
      printWorkflowTemplateChecklist(template)
    } catch {
      addToast('error', '템플릿 정보를 불러오지 못했습니다.')
    }
  }

  const handlePrintInstance = async (instance: WorkflowInstance) => {
    try {
      const template = await queryClient.fetchQuery({
        queryKey: ['workflow', instance.workflow_id],
        queryFn: () => fetchWorkflow(instance.workflow_id),
      })
      printWorkflowInstanceChecklist(instance, template)
    } catch {
      printWorkflowInstanceChecklist(instance)
    }
  }

  const openEditModal = async (workflowId: number) => {
    setSelectedId(workflowId)
    try {
      await queryClient.fetchQuery({
        queryKey: ['workflow', workflowId],
        queryFn: () => fetchWorkflow(workflowId),
        staleTime: 0,
      })
      setMode('edit')
    } catch {
      addToast('error', '템플릿 최신 정보를 불러오지 못했습니다.')
    }
  }

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">워크플로우</h2>
          <p className="page-subtitle">미완료 워크플로우를 우선 처리하고, 완료 이력을 감사 관점에서 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => changeTab('templates')} className="secondary-btn">템플릿 관리</button>
          <button onClick={() => { changeTab('templates'); setMode('create') }} className="primary-btn inline-flex items-center gap-2"><Plus size={16} /> 템플릿 생성</button>
        </div>
      </div>

      <div className="border-b border-[#d8e5fb]">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {[
            { key: 'active' as const, label: '미완료' },
            { key: 'completed' as const, label: '완료' },
            { key: 'templates' as const, label: '템플릿 관리' },
            { key: 'periodic' as const, label: '정기 업무' },
            { key: 'checklists' as const, label: '체크리스트' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => changeTab(t.key)}
              className={`tab-btn border-b-2 border-x-0 border-t-0 rounded-none px-4 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'active border-[#558ef8] bg-transparent text-[#1a3660]'
                  : 'border-transparent text-[#0f1f3d] hover:border-[#bfcff0] hover:bg-transparent hover:text-[#0f1f3d]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'templates' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:items-start">
          <div className="card-base space-y-2 xl:sticky xl:top-24 xl:flex xl:max-h-[calc(100vh-8rem)] xl:min-h-0 xl:flex-col xl:overflow-hidden">
            {isLoading ? (
              <PageLoading />
            ) : !(templates?.length) ? (
              <EmptyState message="등록된 템플릿이 없습니다." className="py-10" />
            ) : (
              <div className="space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                {Array.from(groupedTemplates.entries()).map(([category, items]) => (
                  <div key={category} className="space-y-1">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="flex w-full items-center justify-between rounded-lg bg-[#f5f9ff] px-2 py-1 text-left hover:bg-[#f5f9ff]"
                    >
                      <div className="flex items-center gap-1">
                        <ChevronRight
                          size={12}
                          className={`text-[#64748b] transition-transform ${collapsedCategories.has(category) ? '' : 'rotate-90'}`}
                        />
                        <span className="text-xs font-semibold text-[#64748b]">{category}</span>
                      </div>
                      <span className="text-xs text-[#64748b]">{items.length}개</span>
                    </button>
                    {!collapsedCategories.has(category) && (
                      <div className="space-y-2">
                        {items.map((row: WorkflowListItem) => (
                          <div key={row.id} className={`border rounded-lg p-2 ${selectedId === row.id ? 'border-[#b2cbfb] bg-[#f5f9ff]' : 'border-[#d8e5fb]'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <button onClick={() => setSelectedId(row.id)} className="w-full text-left">
                                <p className="text-sm font-medium text-[#0f1f3d]">{row.name}</p>
                                <p className="text-xs text-[#64748b]">{row.step_count}단계{row.total_duration ? ` · ${row.total_duration}` : ''}</p>
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedId(selectedId === row.id ? null : row.id)
                                }}
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selectedId === row.id
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-[#bfcff0] bg-white hover:border-[#9fb7e5]'
                                  }`}
                                aria-label="템플릿 체크"
                                title={selectedId === row.id ? '체크 해제' : '체크'}
                              >
                                {selectedId === row.id && <Check size={12} />}
                              </button>
                            </div>
                            <div className="mt-2 flex gap-1">
                              <button
                                onClick={() => handlePrintTemplateById(row.id)}
                                className="secondary-btn inline-flex items-center gap-1"
                              >
                                <Printer size={14} /> 인쇄
                              </button>
                              <button onClick={() => { void openEditModal(row.id) }} className="secondary-btn">수정</button>
                              <button onClick={() => { if (confirm('이 템플릿을 삭제하시겠습니까?')) deleteMut.mutate(row.id) }} className="danger-btn">삭제</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="xl:col-span-2">
            {selectedId ? (
              <WorkflowDetail
                workflowId={selectedId}
                onClose={() => setSelectedId(null)}
                onEdit={() => { void openEditModal(selectedId) }}
                onPrint={handlePrintTemplate}
              />
            ) : (
              <div className="card-base text-sm text-[#64748b]">템플릿을 선택하세요.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'active' && (
        <InstanceList
          view="active"
          expandId={focusedInstanceId}
          onPrintInstance={handlePrintInstance}
        />
      )}
      {tab === 'completed' && (
        <InstanceList
          view="completed"
          onPrintInstance={handlePrintInstance}
          onResumeInstance={(instanceId) => {
            setFocusedInstanceId(instanceId)
            changeTab('active')
          }}
        />
      )}
      {tab === 'periodic' && <PeriodicSchedulesPanel />}
      {tab === 'checklists' && (
        <ChecklistsPage embedded />
      )}

      {mode === 'create' && (
        <DrawerOverlay
          open={mode === 'create'}
          onClose={() => setMode(null)}
          title="템플릿 생성"
          widthClassName="w-full max-w-6xl"
        >
          <TemplateModal
            initial={EMPTY_TEMPLATE}
            resetKey="create"
            title="템플릿 생성"
            submitLabel="생성"
            loading={createMut.isPending}
            onSubmit={(data) => createMut.mutate(data)}
            onClose={() => setMode(null)}
          />
        </DrawerOverlay>
      )}

      {mode === 'edit' && selectedId && selected && (
        <DrawerOverlay
          open={mode === 'edit' && !!selectedId}
          onClose={() => setMode(null)}
          title="템플릿 수정"
          widthClassName="w-full max-w-6xl"
        >
          <TemplateModal
            initial={normalizeTemplate(selected)}
            resetKey={`edit-${selectedId}`}
            title="템플릿 수정"
            submitLabel="저장"
            loading={updateMut.isPending}
            onSubmit={(data) => updateMut.mutate({ id: selectedId, data })}
            onClose={() => setMode(null)}
          />
        </DrawerOverlay>
      )}
    </div>
  )
}








