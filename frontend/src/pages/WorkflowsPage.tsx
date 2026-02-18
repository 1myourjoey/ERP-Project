import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  calculateDeadline,
  cancelWorkflowInstance,
  completeWorkflowStep,
  createWorkflowTemplate,
  deleteWorkflowTemplate,
  fetchCompanies,
  fetchDocumentTemplates,
  fetchFund,
  fetchFunds,
  fetchGPEntities,
  fetchInvestments,
  fetchWorkflow,
  fetchWorkflowInstances,
  fetchWorkflows,
  generateDocument,
  instantiateWorkflow,
  undoWorkflowStep,
  updateWorkflowInstance,
  updateWorkflowTemplate,
  type Company,
  type DocumentTemplate,
  type Fund,
  type GPEntity,
  type NoticeDeadlineResult,
  type WorkflowInstance,
  type WorkflowListItem,
  type WorkflowStep,
  type WorkflowStepInstance,
  type WorkflowTemplate,
  type WorkflowTemplateInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Check, ChevronRight, Play, Plus, Printer, X } from 'lucide-react'
import PageLoading from '../components/PageLoading'

type WorkflowLocationState = {
  expandInstanceId?: number
}

interface InvestmentListItem {
  id: number
  fund_id: number
  company_id: number
  fund_name: string
  company_name: string
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
          body { font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; margin: 0; padding: 24px; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet { max-width: 900px; margin: 0 auto; }
          h1 { margin: 0; font-size: 20px; color: #1E3A5F; }
          .meta { margin-top: 8px; color: #4b5563; font-size: 13px; line-height: 1.6; }
          h2 { margin-top: 20px; margin-bottom: 8px; font-size: 14px; color: #374151; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
          th { border-bottom: 2px solid #111827; }
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
  const stepRows = instance.step_instances
    .map((step) => {
      const statusMark = step.status === 'completed' ? '[x]' : '[ ]'
      const dateText = new Date(step.calculated_date).toLocaleDateString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
      })
      return `<tr>
        <td>${statusMark}</td>
        <td>${escapeHtml(step.step_timing || '')}</td>
        <td>${escapeHtml(dateText)}</td>
        <td>${escapeHtml(step.step_name || '')}</td>
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
      (step) => `<tr>
        <td>[ ]</td>
        <td>${escapeHtml(step.timing || '')}</td>
        <td></td>
        <td>${escapeHtml(step.name || '')}</td>
        <td>${escapeHtml(step.memo || '')}</td>
      </tr>`,
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
  steps: [{ order: 1, name: '', timing: 'D-day', timing_offset_days: 0, estimated_time: '', quadrant: 'Q1', memo: '', is_notice: false, is_report: false }],
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
    })),
    documents: (wf?.documents ?? []).map((d) => ({ name: d.name, required: d.required, timing: d.timing ?? '', notes: d.notes ?? '' })),
    warnings: (wf?.warnings ?? []).map((w) => ({ content: w.content, category: (w.category as 'warning' | 'lesson' | 'tip') || 'warning' })),
  }
}

function TemplateModal({
  initial,
  title,
  submitLabel,
  loading,
  onSubmit,
  onClose,
}: {
  initial: WorkflowTemplateInput
  title: string
  submitLabel: string
  loading: boolean
  onSubmit: (data: WorkflowTemplateInput) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<WorkflowTemplateInput>(initial)

  useEffect(() => {
    setForm(initial)
  }, [initial])

  const submit = () => {
    const payload: WorkflowTemplateInput = {
      name: form.name.trim(),
      trigger_description: form.trigger_description?.trim() || null,
      category: form.category?.trim() || null,
      total_duration: form.total_duration?.trim() || null,
      steps: form.steps
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
    <div className="card-base flex max-h-[calc(100vh-2rem)] min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="mt-3 min-h-0 space-y-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="템플릿 이름" className="px-3 py-2 text-sm border rounded-lg" />
          <input value={form.category || ''} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))} placeholder="카테고리" className="px-3 py-2 text-sm border rounded-lg" />
          <input value={form.total_duration || ''} onChange={e => setForm(prev => ({ ...prev, total_duration: e.target.value }))} placeholder="총 기간" className="px-3 py-2 text-sm border rounded-lg" />
          <input value={form.trigger_description || ''} onChange={e => setForm(prev => ({ ...prev, trigger_description: e.target.value }))} placeholder="트리거 설명" className="px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div className="space-y-2">
          {form.steps.map((step, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border p-2 md:grid-cols-4">
              <input value={step.name} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, name: e.target.value } : it) }))} placeholder="단계 이름" className="md:col-span-2 px-2 py-1 text-sm border rounded" />
              <input value={step.timing} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, timing: e.target.value } : it) }))} placeholder="시점" className="px-2 py-1 text-sm border rounded" />
              <input type="number" value={step.timing_offset_days} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, timing_offset_days: Number(e.target.value || 0) } : it) }))} placeholder="오프셋" className="px-2 py-1 text-sm border rounded" />
              <input value={step.estimated_time || ''} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, estimated_time: e.target.value } : it) }))} placeholder="예상 시간" className="px-2 py-1 text-sm border rounded" />
              <input value={step.quadrant || 'Q1'} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, quadrant: e.target.value } : it) }))} placeholder="사분면" className="px-2 py-1 text-sm border rounded" />
              <input value={step.memo || ''} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, memo: e.target.value } : it) }))} placeholder="메모" className="md:col-span-2 px-2 py-1 text-sm border rounded" />
              <div className="md:col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={Boolean(step.is_notice)}
                    onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, is_notice: e.target.checked } : it) }))}
                    className="rounded border-gray-300"
                  />
                  통지
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={Boolean(step.is_report)}
                    onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, is_report: e.target.checked } : it) }))}
                    className="rounded border-gray-300"
                  />
                  보고
                </label>
                <button onClick={() => setForm(prev => ({ ...prev, steps: prev.steps.filter((_, itIdx) => itIdx !== idx) }))} className="text-xs text-red-600 hover:text-red-700 text-left">단계 삭제</button>
              </div>
            </div>
          ))}
          <button onClick={() => setForm(prev => ({ ...prev, steps: [...prev.steps, { order: prev.steps.length + 1, name: '', timing: 'D-day', timing_offset_days: 0, estimated_time: '', quadrant: 'Q1', memo: '', is_notice: false, is_report: false }] }))} className="secondary-btn">+ 단계 추가</button>
        </div>
      </div>
      <div className="mt-3 flex shrink-0 gap-2">
        <button onClick={submit} disabled={loading} className="primary-btn">{submitLabel}</button>
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
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
          <h3 className="text-lg font-semibold text-gray-800">{wf.name}</h3>
          <p className="text-sm text-gray-500">{wf.trigger_description || '-'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onPrint(wf)} className="secondary-btn inline-flex items-center gap-1"><Printer size={14} /> 인쇄</button>
          <button onClick={onEdit} className="secondary-btn">수정</button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
      </div>

      <div className="space-y-1">
        {wf.steps.map((s: WorkflowStep) => (
          <div key={s.id} className="flex items-center gap-2 rounded bg-gray-50 p-2 text-sm">
            <span className="w-6 text-center text-xs text-gray-500">{s.order}</span>
            <span className="flex-1">{s.name}</span>
            <span className="text-xs text-gray-500">{s.timing}</span>
          </div>
        ))}
      </div>

      {!showRun ? (
        <button onClick={() => setShowRun(true)} className="primary-btn inline-flex items-center gap-2"><Play size={16} /> 실행</button>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <input value={instName} onChange={e => setInstName(e.target.value)} placeholder="인스턴스 이름" className="w-full px-3 py-2 text-sm border rounded-lg" />
          <input type="date" value={instDate} onChange={e => setInstDate(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg" />
          <select value={instFundId} onChange={e => { const next = e.target.value ? Number(e.target.value) : ''; setInstFundId(next); setInstGpEntityId(''); if (instInvestmentId !== '') setInstInvestmentId('') }} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="">관련 조합 (선택)</option>
            {(funds ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select
            value={instGpEntityId}
            onChange={e => {
              const next = e.target.value ? Number(e.target.value) : ''
              setInstGpEntityId(next)
              setInstFundId('')
              if (instInvestmentId !== '') setInstInvestmentId('')
            }}
            className="w-full px-3 py-2 text-sm border rounded-lg bg-white"
          >
            <option value="">관련 고유계정 (선택)</option>
            {(gpEntities ?? []).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
          <select value={instCompanyId} onChange={e => { const next = e.target.value ? Number(e.target.value) : ''; setInstCompanyId(next); if (instInvestmentId !== '') setInstInvestmentId('') }} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="">관련 회사 (선택)</option>
            {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={instInvestmentId} onChange={e => setInstInvestmentId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="">관련 투자 (선택)</option>
            {filteredInvestments.map((inv) => <option key={inv.id} value={inv.id}>#{inv.id} {inv.fund_name} - {inv.company_name}</option>)}
          </select>
          {instFundId !== '' && (
            <select value={instNoticeType} onChange={e => setInstNoticeType(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
              {options.map((opt) => <option key={opt.notice_type} value={opt.notice_type}>{opt.label}</option>)}
            </select>
          )}
          {instFundId !== '' && instDate && deadline && (
            <div className="rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
              <p>{deadline.label}: 기준일 전 영업일 {deadline.business_days}일 필요.</p>
              <p>기준일 {deadline.target_date} / 통지 기한 {deadline.deadline}</p>
            </div>
          )}
          <textarea value={instMemo} onChange={e => setInstMemo(e.target.value)} placeholder="메모 (선택)" rows={2} className="w-full px-3 py-2 text-sm border rounded-lg" />
          <div className="flex gap-2">
            <button onClick={() => instName && instDate && runMut.mutate()} disabled={!instName || !instDate} className="flex-1 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300">실행</button>
            <button onClick={() => setShowRun(false)} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">취소</button>
          </div>
        </div>
      )}
    </div>
  )
}

function InstanceList({
  status,
  expandId,
  onPrintInstance,
}: {
  status: 'active' | 'completed'
  expandId?: number | null
  onPrintInstance: (instance: WorkflowInstance) => void
}) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [openId, setOpenId] = useState<number | null>(expandId ?? null)
  const [editingInstanceId, setEditingInstanceId] = useState<number | null>(null)
  const [editInstance, setEditInstance] = useState<{ name: string; trigger_date: string; memo: string } | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['workflowInstances', { status }], queryFn: () => fetchWorkflowInstances({ status }) })
  const { data: docTemplates = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ['documentTemplates'],
    queryFn: () => fetchDocumentTemplates(),
  })

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
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${template.name}.docx`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
        successCount += 1
      } catch {
        addToast('error', `${template.name} 생성 실패`)
      }
    }

    if (successCount > 0) {
      addToast('success', `${successCount}종 문서가 생성되었습니다.`)
    }
  }

  const completeMut = useMutation({
    mutationFn: ({ instanceId, stepId, estimated }: { instanceId: number; stepId: number; estimated?: string | null }) => completeWorkflowStep(instanceId, stepId, { actual_time: estimated || undefined }),
    onSuccess: (instance) => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems'] })
      queryClient.invalidateQueries({ queryKey: ['fund'] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallSummary'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      const isFormationWorkflow = instance.workflow_name.includes('결성')
      if (instance.status === 'completed' && isFormationWorkflow) {
        addToast('success', "워크플로우가 완료되어 조합 상태가 '운용 중'으로 변경되었습니다.")
      } else {
        addToast('success', '단계가 완료되었습니다.')
      }
    },
  })

  const undoStepMut = useMutation({
    mutationFn: ({ instanceId, stepId }: { instanceId: number; stepId: number }) => undoWorkflowStep(instanceId, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems'] })
      queryClient.invalidateQueries({ queryKey: ['fund'] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallSummary'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      addToast('success', '단계 완료가 취소되었습니다.')
    },
  })

  const updateInstanceMut = useMutation({
    mutationFn: ({ instanceId, data }: { instanceId: number; data: { name: string; trigger_date: string; memo: string | null } }) =>
      updateWorkflowInstance(instanceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditingInstanceId(null)
      setEditInstance(null)
      addToast('success', '인스턴스를 수정했습니다.')
    },
  })

  const cancelMut = useMutation({
    mutationFn: cancelWorkflowInstance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      addToast('success', '인스턴스가 취소되었습니다.')
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

  if (isLoading) return <PageLoading />
  if (!(data?.length)) return <p className="text-sm text-gray-400">인스턴스가 없습니다.</p>

  return (
    <div className="space-y-3">
      {data.map((inst: WorkflowInstance) => (
        <div key={inst.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div onClick={() => setOpenId(openId === inst.id ? null : inst.id)} className="w-full cursor-pointer p-4 text-left hover:bg-gray-50 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">{inst.name}</p>
              <p className="text-xs text-gray-500">{inst.workflow_name} | {inst.trigger_date}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onPrintInstance(inst)
                }}
                className="secondary-btn inline-flex items-center gap-1"
              >
                <Printer size={14} /> 인쇄
              </button>
              {status === 'active' && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleInstanceEdit(inst)
                  }}
                  className="secondary-btn text-sm"
                >
                  수정
                </button>
              )}
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{inst.progress}</span>
              <ChevronRight size={16} className={`text-gray-400 transition-transform ${openId === inst.id ? 'rotate-90' : ''}`} />
            </div>
          </div>
          {openId === inst.id && (
            <div className="border-t border-gray-100 p-3 space-y-1.5">
              {status === 'active' && editingInstanceId === inst.id && editInstance && (
                <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <input
                    value={editInstance.name}
                    onChange={(event) => setEditInstance((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                    placeholder="인스턴스 이름"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                  <input
                    type="date"
                    value={editInstance.trigger_date}
                    onChange={(event) => setEditInstance((prev) => (prev ? { ...prev, trigger_date: event.target.value } : prev))}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={editInstance.memo}
                    onChange={(event) => setEditInstance((prev) => (prev ? { ...prev, memo: event.target.value } : prev))}
                    rows={2}
                    placeholder="메모"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!editInstance.name.trim() || !editInstance.trigger_date) return
                        updateInstanceMut.mutate({
                          instanceId: inst.id,
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

              {inst.step_instances.map((step: WorkflowStepInstance) => (
                <div key={step.id} className="flex items-center gap-2 rounded bg-gray-50 p-2 text-sm">
                  {step.status === 'completed' ? (
                    <div className="flex items-center gap-1">
                      <Check size={14} className="text-emerald-600" />
                      {status === 'active' && (
                        <button
                          onClick={() => undoStepMut.mutate({ instanceId: inst.id, stepId: step.id })}
                          className="text-[10px] text-gray-400 hover:text-blue-600"
                        >
                          되돌리기
                        </button>
                      )}
                    </div>
                  ) : status === 'active' ? (
                    <button onClick={() => completeMut.mutate({ instanceId: inst.id, stepId: step.id, estimated: step.estimated_time })} className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-green-500" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className={`flex-1 ${step.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{step.step_name}</span>
                  <span className="text-xs text-gray-500">{labelStatus(step.status)}</span>
                  <span className="text-xs text-gray-500">{step.calculated_date}</span>
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
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-600 transition-colors hover:bg-blue-100"
                      >
                        📄 문서 ({matchingDocs.length}종)
                      </button>
                    )
                  })()}
                  {step.completed_at && <span className="text-[10px] text-gray-400">{formatCompletedAt(step.completed_at)}</span>}
                </div>
              ))}
              {status === 'active' && <button onClick={() => { if (confirm('이 인스턴스를 취소하시겠습니까?')) cancelMut.mutate(inst.id) }} className="text-xs text-red-600 hover:text-red-700">인스턴스 취소</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const location = useLocation()
  const locationState = (location.state as WorkflowLocationState | null) ?? null

  const [tab, setTab] = useState<'templates' | 'active' | 'completed'>('templates')
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
    if (!locationState?.expandInstanceId) return
    const frame = window.requestAnimationFrame(() => {
      setTab('active')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [locationState?.expandInstanceId])

  const createMut = useMutation({
    mutationFn: createWorkflowTemplate,
    onSuccess: (row: WorkflowTemplate) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedId(row.id)
      setMode(null)
      addToast('success', '템플릿이 생성되었습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkflowTemplateInput }) => updateWorkflowTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', selectedId] })
      setMode(null)
      addToast('success', '템플릿이 수정되었습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteWorkflowTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
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

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">워크플로우</h2>
          <p className="page-subtitle">템플릿 및 인스턴스 관리</p>
        </div>
        <button onClick={() => setMode('create')} className="primary-btn inline-flex items-center gap-2"><Plus size={16} /> + 새 템플릿</button>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {[
            { key: 'templates' as const, label: '템플릿' },
            { key: 'active' as const, label: '진행 중' },
            { key: 'completed' as const, label: '완료' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`border-b-2 pb-2 text-sm ${tab === t.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'templates' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="card-base space-y-2">
            {isLoading ? (
              <PageLoading />
            ) : !(templates?.length) ? (
              <p className="text-sm text-gray-400">등록된 템플릿이 없습니다.</p>
            ) : (
              Array.from(groupedTemplates.entries()).map(([category, items]) => (
                <div key={category} className="space-y-1">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-2 py-1 text-left hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      <ChevronRight
                        size={12}
                        className={`text-gray-400 transition-transform ${collapsedCategories.has(category) ? '' : 'rotate-90'}`}
                      />
                      <span className="text-xs font-semibold text-gray-600">{category}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{items.length}개</span>
                  </button>
                  {!collapsedCategories.has(category) && (
                    <div className="space-y-2">
                      {items.map((row: WorkflowListItem) => (
                        <div key={row.id} className={`border rounded-lg p-2 ${selectedId === row.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <button onClick={() => setSelectedId(row.id)} className="w-full text-left">
                              <p className="text-sm font-medium text-gray-800">{row.name}</p>
                              <p className="text-xs text-gray-500">{row.step_count}단계{row.total_duration ? ` · ${row.total_duration}` : ''}</p>
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelectedId(selectedId === row.id ? null : row.id)
                              }}
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selectedId === row.id
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-gray-300 bg-white hover:border-gray-400'
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
                            <button onClick={() => { setSelectedId(row.id); setMode('edit') }} className="secondary-btn">수정</button>
                            <button onClick={() => { if (confirm('이 템플릿을 삭제하시겠습니까?')) deleteMut.mutate(row.id) }} className="danger-btn">삭제</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="xl:col-span-2">
            {selectedId ? (
              <WorkflowDetail
                workflowId={selectedId}
                onClose={() => setSelectedId(null)}
                onEdit={() => setMode('edit')}
                onPrint={handlePrintTemplate}
              />
            ) : (
              <div className="card-base text-sm text-gray-400">템플릿을 선택하세요.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'active' && (
        <InstanceList
          status="active"
          expandId={locationState?.expandInstanceId ?? null}
          onPrintInstance={handlePrintInstance}
        />
      )}
      {tab === 'completed' && <InstanceList status="completed" onPrintInstance={handlePrintInstance} />}

      {mode === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={() => setMode(null)}>
          <div className="max-h-full w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <TemplateModal initial={EMPTY_TEMPLATE} title="템플릿 생성" submitLabel="생성" loading={createMut.isPending} onSubmit={(data) => createMut.mutate(data)} onClose={() => setMode(null)} />
          </div>
        </div>
      )}

      {mode === 'edit' && selectedId && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={() => setMode(null)}>
          <div className="max-h-full w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <TemplateModal initial={normalizeTemplate(selected)} title="템플릿 수정" submitLabel="저장" loading={updateMut.isPending} onSubmit={(data) => updateMut.mutate({ id: selectedId, data })} onClose={() => setMode(null)} />
          </div>
        </div>
      )}
    </div>
  )
}



