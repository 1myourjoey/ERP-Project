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
  fetchFund,
  fetchFunds,
  fetchInvestments,
  fetchWorkflow,
  fetchWorkflowInstances,
  fetchWorkflows,
  instantiateWorkflow,
  updateWorkflowTemplate,
  type Company,
  type Fund,
  type NoticeDeadlineResult,  type WorkflowInstance,
  type WorkflowListItem,
  type WorkflowStep,
  type WorkflowStepInstance,
  type WorkflowTemplate,
  type WorkflowTemplateInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Check, ChevronRight, Play, Plus, Printer, X } from 'lucide-react'

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
  { notice_type: 'assembly', label: 'Assembly notice' },
  { notice_type: 'capital_call_initial', label: 'Initial capital call notice' },
  { notice_type: 'capital_call_additional', label: 'Additional capital call notice' },
  { notice_type: 'ic_agenda', label: 'IC agenda notice' },
  { notice_type: 'distribution', label: 'Distribution notice' },
  { notice_type: 'dissolution', label: 'Dissolution notice' },
  { notice_type: 'lp_report', label: 'LP report notice' },
  { notice_type: 'amendment', label: 'Amendment notice' },
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
          h1 { margin: 0; font-size: 20px; }
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
    <h1>VC ERP 워크플로우 체크리스트</h1>
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
  steps: [{ order: 1, name: '', timing: 'D-day', timing_offset_days: 0, estimated_time: '', quadrant: 'Q1', memo: '' }],
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
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Template name" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.category || ''} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))} placeholder="Category" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.total_duration || ''} onChange={e => setForm(prev => ({ ...prev, total_duration: e.target.value }))} placeholder="Total duration" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.trigger_description || ''} onChange={e => setForm(prev => ({ ...prev, trigger_description: e.target.value }))} placeholder="Trigger description" className="px-3 py-2 text-sm border rounded-lg" />
      </div>
      <div className="space-y-2">
        {form.steps.map((step, idx) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 border rounded-lg p-2">
            <input value={step.name} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, name: e.target.value } : it) }))} placeholder="Step name" className="md:col-span-2 px-2 py-1 text-sm border rounded" />
            <input value={step.timing} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, timing: e.target.value } : it) }))} placeholder="Timing" className="px-2 py-1 text-sm border rounded" />
            <input type="number" value={step.timing_offset_days} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, timing_offset_days: Number(e.target.value || 0) } : it) }))} placeholder="Offset" className="px-2 py-1 text-sm border rounded" />
            <input value={step.estimated_time || ''} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, estimated_time: e.target.value } : it) }))} placeholder="Estimate" className="px-2 py-1 text-sm border rounded" />
            <input value={step.quadrant || 'Q1'} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, quadrant: e.target.value } : it) }))} placeholder="Quadrant" className="px-2 py-1 text-sm border rounded" />
            <input value={step.memo || ''} onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((it, itIdx) => itIdx === idx ? { ...it, memo: e.target.value } : it) }))} placeholder="Memo" className="md:col-span-2 px-2 py-1 text-sm border rounded" />
            <button onClick={() => setForm(prev => ({ ...prev, steps: prev.steps.filter((_, itIdx) => itIdx !== idx) }))} className="text-xs text-red-600 hover:text-red-700 text-left">Delete step</button>
          </div>
        ))}
        <button onClick={() => setForm(prev => ({ ...prev, steps: [...prev.steps, { order: prev.steps.length + 1, name: '', timing: 'D-day', timing_offset_days: 0, estimated_time: '', quadrant: 'Q1', memo: '' }] }))} className="secondary-btn">+ Add step</button>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={loading} className="primary-btn">{submitLabel}</button>
        <button onClick={onClose} className="secondary-btn">Cancel</button>
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
  const [instCompanyId, setInstCompanyId] = useState<number | ''>('')
  const [instInvestmentId, setInstInvestmentId] = useState<number | ''>('')
  const [instNoticeType, setInstNoticeType] = useState('assembly')

  const { data: wf, isLoading } = useQuery({ queryKey: ['workflow', workflowId], queryFn: () => fetchWorkflow(workflowId) })
  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })
  const { data: investments } = useQuery<InvestmentListItem[]>({ queryKey: ['investments'], queryFn: () => fetchInvestments() })
  const { data: selectedFund } = useQuery({ queryKey: ['fund', instFundId], queryFn: () => fetchFund(instFundId as number), enabled: instFundId !== '' })

  const options = useMemo(() => {
    const rows = selectedFund?.notice_periods ?? []
    if (rows.length > 0) return rows.map((r) => ({ notice_type: r.notice_type, label: r.label }))
    return DEFAULT_NOTICE_TYPES
  }, [selectedFund?.notice_periods])

  useEffect(() => {
    if (!options.some((o) => o.notice_type === instNoticeType)) {
      setInstNoticeType(options[0]?.notice_type ?? 'assembly')
    }
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
      company_id: instCompanyId === '' ? undefined : instCompanyId,
      investment_id: instInvestmentId === '' ? undefined : instInvestmentId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', 'Workflow instance started.')
      setShowRun(false)
      setInstName('')
      setInstDate('')
      setInstMemo('')
      setInstFundId('')
      setInstCompanyId('')
      setInstInvestmentId('')
    },
  })

  if (isLoading) return <div className="loading-state"><div className="loading-spinner" /></div>
  if (!wf) return null

  return (
    <div className="card-base space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{wf.name}</h3>
          <p className="text-sm text-gray-500">{wf.trigger_description || '-'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onPrint(wf)} className="secondary-btn inline-flex items-center gap-1"><Printer size={14} /> Print</button>
          <button onClick={onEdit} className="secondary-btn">Edit</button>
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
        <button onClick={() => setShowRun(true)} className="primary-btn inline-flex items-center gap-2"><Play size={16} /> Start</button>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <input value={instName} onChange={e => setInstName(e.target.value)} placeholder="Instance name" className="w-full px-3 py-2 text-sm border rounded-lg" />
          <input type="date" value={instDate} onChange={e => setInstDate(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg" />
          <select value={instFundId} onChange={e => { const next = e.target.value ? Number(e.target.value) : ''; setInstFundId(next); if (instInvestmentId !== '') setInstInvestmentId('') }} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="">Related fund (optional)</option>
            {(funds ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={instCompanyId} onChange={e => { const next = e.target.value ? Number(e.target.value) : ''; setInstCompanyId(next); if (instInvestmentId !== '') setInstInvestmentId('') }} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="">Related company (optional)</option>
            {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={instInvestmentId} onChange={e => setInstInvestmentId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="">Related investment (optional)</option>
            {filteredInvestments.map((inv) => <option key={inv.id} value={inv.id}>#{inv.id} {inv.fund_name} - {inv.company_name}</option>)}
          </select>
          {instFundId !== '' && (
            <select value={instNoticeType} onChange={e => setInstNoticeType(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
              {options.map((opt) => <option key={opt.notice_type} value={opt.notice_type}>{opt.label}</option>)}
            </select>
          )}
          {instFundId !== '' && instDate && deadline && (
            <div className="rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
              <p>{deadline.label}: {deadline.business_days} business days before target date.</p>
              <p>Target {deadline.target_date} / notice deadline {deadline.deadline}</p>
            </div>
          )}
          <textarea value={instMemo} onChange={e => setInstMemo(e.target.value)} placeholder="Memo (optional)" rows={2} className="w-full px-3 py-2 text-sm border rounded-lg" />
          <div className="flex gap-2">
            <button onClick={() => instName && instDate && runMut.mutate()} disabled={!instName || !instDate} className="flex-1 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300">Run</button>
            <button onClick={() => setShowRun(false)} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
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

  const { data, isLoading } = useQuery({ queryKey: ['workflowInstances', { status }], queryFn: () => fetchWorkflowInstances({ status }) })

  const completeMut = useMutation({
    mutationFn: ({ instanceId, stepId, estimated }: { instanceId: number; stepId: number; estimated?: string | null }) => completeWorkflowStep(instanceId, stepId, { actual_time: estimated || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', 'Step completed.')
    },
  })

  const cancelMut = useMutation({
    mutationFn: cancelWorkflowInstance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      addToast('success', 'Instance cancelled.')
    },
  })

  if (isLoading) return <div className="loading-state"><div className="loading-spinner" /></div>
  if (!(data?.length)) return <p className="text-sm text-gray-400">No instances.</p>

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
                <Printer size={14} /> Print
              </button>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{inst.progress}</span>
              <ChevronRight size={16} className={`text-gray-400 transition-transform ${openId === inst.id ? 'rotate-90' : ''}`} />
            </div>
          </div>
          {openId === inst.id && (
            <div className="border-t border-gray-100 p-3 space-y-1.5">
              {inst.step_instances.map((step: WorkflowStepInstance) => (
                <div key={step.id} className="flex items-center gap-2 rounded bg-gray-50 p-2 text-sm">
                  {step.status === 'completed' ? (
                    <Check size={14} className="text-emerald-600" />
                  ) : status === 'active' ? (
                    <button onClick={() => completeMut.mutate({ instanceId: inst.id, stepId: step.id, estimated: step.estimated_time })} className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-green-500" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className={`flex-1 ${step.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{step.step_name}</span>
                  <span className="text-xs text-gray-500">{labelStatus(step.status)}</span>
                  <span className="text-xs text-gray-500">{step.calculated_date}</span>
                </div>
              ))}
              {status === 'active' && <button onClick={() => { if (confirm('Cancel this instance?')) cancelMut.mutate(inst.id) }} className="text-xs text-red-600 hover:text-red-700">Cancel instance</button>}
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

  const { data: templates, isLoading } = useQuery({ queryKey: ['workflows'], queryFn: fetchWorkflows })
  const { data: selected } = useQuery({ queryKey: ['workflow', selectedId], queryFn: () => fetchWorkflow(selectedId as number), enabled: !!selectedId })

  useEffect(() => {
    if (locationState?.expandInstanceId) setTab('active')
  }, [locationState?.expandInstanceId])

  const createMut = useMutation({
    mutationFn: createWorkflowTemplate,
    onSuccess: (row: WorkflowTemplate) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedId(row.id)
      setMode(null)
      addToast('success', 'Template created.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkflowTemplateInput }) => updateWorkflowTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', selectedId] })
      setMode(null)
      addToast('success', 'Template updated.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteWorkflowTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      if (selectedId) setSelectedId(null)
      addToast('success', 'Template deleted.')
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
      addToast('error', '?쒗뵆由??뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??')
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
          <h2 className="page-title">Workflows</h2>
          <p className="page-subtitle">Template and instance management</p>
        </div>
        <button onClick={() => setMode('create')} className="primary-btn inline-flex items-center gap-2"><Plus size={16} /> New template</button>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {[
            { key: 'templates' as const, label: 'Templates' },
            { key: 'active' as const, label: 'Active' },
            { key: 'completed' as const, label: 'Completed' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`border-b-2 pb-2 text-sm ${tab === t.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'templates' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="card-base space-y-2">
            {isLoading ? (
              <div className="loading-state"><div className="loading-spinner" /></div>
            ) : !(templates?.length) ? (
              <p className="text-sm text-gray-400">No templates.</p>
            ) : (
              templates.map((row: WorkflowListItem) => (
                <div key={row.id} className={`border rounded-lg p-2 ${selectedId === row.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                  <button onClick={() => setSelectedId(row.id)} className="w-full text-left">
                    <p className="text-sm font-medium text-gray-800">{row.name}</p>
                    <p className="text-xs text-gray-500">{row.step_count} steps{row.total_duration ? ` 鸚?${row.total_duration}` : ''}</p>
                  </button>
                  <div className="mt-2 flex gap-1">
                    <button
                      onClick={() => handlePrintTemplateById(row.id)}
                      className="secondary-btn inline-flex items-center gap-1"
                    >
                      <Printer size={14} /> Print
                    </button>
                    <button onClick={() => { setSelectedId(row.id); setMode('edit') }} className="secondary-btn">Edit</button>
                    <button onClick={() => { if (confirm('Delete this template?')) deleteMut.mutate(row.id) }} className="danger-btn">Delete</button>
                  </div>
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
              <div className="card-base text-sm text-gray-400">Select a template.</div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMode(null)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <TemplateModal initial={EMPTY_TEMPLATE} title="Create template" submitLabel="Create" loading={createMut.isPending} onSubmit={(data) => createMut.mutate(data)} onClose={() => setMode(null)} />
          </div>
        </div>
      )}

      {mode === 'edit' && selectedId && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMode(null)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <TemplateModal initial={normalizeTemplate(selected)} title="Edit template" submitLabel="Save" loading={updateMut.isPending} onSubmit={(data) => updateMut.mutate({ id: selectedId, data })} onClose={() => setMode(null)} />
          </div>
        </div>
      )}
    </div>
  )
}



