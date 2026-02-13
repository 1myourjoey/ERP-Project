import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchWorkflows,
  fetchWorkflow,
  fetchWorkflowInstances,
  createWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
  instantiateWorkflow,
  completeWorkflowStep,
  cancelWorkflowInstance,
  type WorkflowTemplateInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { Play, ChevronRight, Check, X, FileText, AlertTriangle, Clock, Plus, Pencil, Trash2 } from 'lucide-react'

const EMPTY_TEMPLATE: WorkflowTemplateInput = {
  name: '',
  trigger_description: '',
  category: '',
  total_duration: '',
  steps: [
    {
      order: 1,
      name: '',
      timing: 'D-day',
      timing_offset_days: 0,
      estimated_time: '',
      quadrant: 'Q1',
      memo: '',
    },
  ],
  documents: [],
  warnings: [],
}

function normalizeTemplate(wf: any): WorkflowTemplateInput {
  return {
    name: wf?.name ?? '',
    trigger_description: wf?.trigger_description ?? '',
    category: wf?.category ?? '',
    total_duration: wf?.total_duration ?? '',
    steps: (wf?.steps ?? []).map((s: any, idx: number) => ({
      order: s.order ?? idx + 1,
      name: s.name ?? '',
      timing: s.timing ?? 'D-day',
      timing_offset_days: s.timing_offset_days ?? 0,
      estimated_time: s.estimated_time ?? '',
      quadrant: s.quadrant ?? 'Q1',
      memo: s.memo ?? '',
    })),
    documents: (wf?.documents ?? []).map((d: any) => ({
      name: d.name ?? '',
      required: d.required ?? true,
      timing: d.timing ?? '',
      notes: d.notes ?? '',
    })),
    warnings: (wf?.warnings ?? []).map((w: any) => ({ content: w.content ?? '' })),
  }
}

function WorkflowTemplateList({
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: {
  onSelect: (id: number) => void
  onCreate: () => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}) {
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
  })

  if (isLoading) return <div className="text-sm text-slate-500">불러오는 중...</div>

  return (
    <div className="space-y-3">
      <button
        onClick={onCreate}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
      >
        <Plus size={16} /> 새 템플릿
      </button>

      <div className="space-y-2">
        {workflows?.map((wf: any) => (
          <div key={wf.id} className="bg-white rounded-lg border border-slate-200 p-3">
            <button onClick={() => onSelect(wf.id)} className="w-full text-left group">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-800">{wf.name}</h4>
                <ChevronRight size={16} className="text-slate-400 group-hover:text-blue-500" />
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span>{wf.category || '-'}</span>
                <span>{wf.step_count}단계</span>
                <span>{wf.total_duration || '-'}</span>
              </div>
            </button>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onEdit(wf.id)}
                className="px-2 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1"
              >
                <Pencil size={12} /> 수정
              </button>
              <button
                onClick={() => onDelete(wf.id)}
                className="px-2 py-1 text-xs rounded bg-red-50 hover:bg-red-100 text-red-700 flex items-center gap-1"
              >
                <Trash2 size={12} /> 삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TemplateEditor({
  title,
  initialData,
  submitLabel,
  loading,
  onSubmit,
  onCancel,
}: {
  title: string
  initialData: WorkflowTemplateInput
  submitLabel: string
  loading: boolean
  onSubmit: (data: WorkflowTemplateInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<WorkflowTemplateInput>(initialData)

  useEffect(() => {
    setForm(initialData)
  }, [initialData])

  const normalizedSteps = useMemo(
    () => form.steps.map((step, idx) => ({ ...step, order: idx + 1 })),
    [form.steps],
  )

  const submit = () => {
    const payload: WorkflowTemplateInput = {
      name: form.name.trim(),
      trigger_description: form.trigger_description?.trim() || null,
      category: form.category?.trim() || null,
      total_duration: form.total_duration?.trim() || null,
      steps: normalizedSteps
        .filter(s => s.name.trim())
        .map(s => ({
          ...s,
          name: s.name.trim(),
          timing: s.timing.trim() || 'D-day',
          estimated_time: s.estimated_time?.trim() || null,
          quadrant: s.quadrant?.trim() || 'Q1',
          memo: s.memo?.trim() || null,
        })),
      documents: form.documents
        .filter(d => d.name.trim())
        .map(d => ({
          ...d,
          name: d.name.trim(),
          timing: d.timing?.trim() || null,
          notes: d.notes?.trim() || null,
        })),
      warnings: form.warnings
        .filter(w => w.content.trim())
        .map(w => ({ content: w.content.trim() })),
    }

    if (!payload.name || payload.steps.length === 0) return
    onSubmit(payload)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          placeholder="템플릿 이름"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        />
        <input
          value={form.category || ''}
          onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
          placeholder="카테고리"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        />
        <input
          value={form.total_duration || ''}
          onChange={e => setForm(prev => ({ ...prev, total_duration: e.target.value }))}
          placeholder="총 소요 기간"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        />
        <input
          value={form.trigger_description || ''}
          onChange={e => setForm(prev => ({ ...prev, trigger_description: e.target.value }))}
          placeholder="시작 조건 설명"
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">단계</h4>
          <button
            onClick={() => setForm(prev => ({
              ...prev,
              steps: [...prev.steps, { order: prev.steps.length + 1, name: '', timing: 'D-day', timing_offset_days: 0, estimated_time: '', quadrant: 'Q1', memo: '' }],
            }))}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
          >
            + 단계 추가
          </button>
        </div>
        <div className="space-y-2">
          {normalizedSteps.map((step, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-2 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  value={step.name}
                  onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, name: e.target.value } : s) }))}
                  placeholder={`${idx + 1}단계 이름`}
                  className="md:col-span-2 px-2 py-1 text-sm border border-slate-200 rounded"
                />
                <input
                  value={step.timing}
                  onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, timing: e.target.value } : s) }))}
                  placeholder="시점 (D-1, D-day...)"
                  className="px-2 py-1 text-sm border border-slate-200 rounded"
                />
                <input
                  type="number"
                  value={step.timing_offset_days}
                  onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, timing_offset_days: Number(e.target.value || 0) } : s) }))}
                  placeholder="오프셋(일)"
                  className="px-2 py-1 text-sm border border-slate-200 rounded"
                />
                <input
                  value={step.estimated_time || ''}
                  onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, estimated_time: e.target.value } : s) }))}
                  placeholder="예상 시간"
                  className="px-2 py-1 text-sm border border-slate-200 rounded"
                />
                <input
                  value={step.quadrant || 'Q1'}
                  onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, quadrant: e.target.value } : s) }))}
                  placeholder="사분면"
                  className="px-2 py-1 text-sm border border-slate-200 rounded"
                />
                <input
                  value={step.memo || ''}
                  onChange={e => setForm(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, memo: e.target.value } : s) }))}
                  placeholder="메모"
                  className="md:col-span-2 px-2 py-1 text-sm border border-slate-200 rounded"
                />
              </div>
              <button
                onClick={() => setForm(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== idx) }))}
                className="text-xs text-red-600 hover:text-red-700"
              >
                단계 삭제
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">서류</h4>
          <button
            onClick={() => setForm(prev => ({
              ...prev,
              documents: [...prev.documents, { name: '', required: true, timing: '', notes: '' }],
            }))}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
          >
            + 서류 추가
          </button>
        </div>
        <div className="space-y-2">
          {form.documents.map((doc, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-slate-200 rounded-lg p-2">
              <input
                value={doc.name}
                onChange={e => setForm(prev => ({ ...prev, documents: prev.documents.map((d, i) => i === idx ? { ...d, name: e.target.value } : d) }))}
                placeholder="서류명"
                className="md:col-span-2 px-2 py-1 text-sm border border-slate-200 rounded"
              />
              <input
                value={doc.timing || ''}
                onChange={e => setForm(prev => ({ ...prev, documents: prev.documents.map((d, i) => i === idx ? { ...d, timing: e.target.value } : d) }))}
                placeholder="시점"
                className="px-2 py-1 text-sm border border-slate-200 rounded"
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={doc.required}
                  onChange={e => setForm(prev => ({ ...prev, documents: prev.documents.map((d, i) => i === idx ? { ...d, required: e.target.checked } : d) }))}
                />
                필수
              </label>
              <input
                value={doc.notes || ''}
                onChange={e => setForm(prev => ({ ...prev, documents: prev.documents.map((d, i) => i === idx ? { ...d, notes: e.target.value } : d) }))}
                placeholder="비고"
                className="md:col-span-3 px-2 py-1 text-sm border border-slate-200 rounded"
              />
              <button
                onClick={() => setForm(prev => ({ ...prev, documents: prev.documents.filter((_, i) => i !== idx) }))}
                className="text-xs text-red-600 hover:text-red-700 text-left"
              >
                서류 삭제
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">주의사항</h4>
          <button
            onClick={() => setForm(prev => ({ ...prev, warnings: [...prev.warnings, { content: '' }] }))}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
          >
            + 주의사항 추가
          </button>
        </div>
        <div className="space-y-2">
          {form.warnings.map((warning, idx) => (
            <div key={idx} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2">
              <input
                value={warning.content}
                onChange={e => setForm(prev => ({ ...prev, warnings: prev.warnings.map((w, i) => i === idx ? { ...w, content: e.target.value } : w) }))}
                placeholder="주의사항 내용"
                className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded"
              />
              <button
                onClick={() => setForm(prev => ({ ...prev, warnings: prev.warnings.filter((_, i) => i !== idx) }))}
                className="text-xs text-red-600 hover:text-red-700"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={loading || !form.name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-slate-300"
        >
          {submitLabel}
        </button>
        <button onClick={onCancel} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200">
          취소
        </button>
      </div>
    </div>
  )
}

function WorkflowDetail({
  workflowId,
  onClose,
  onEdit,
}: {
  workflowId: number
  onClose: () => void
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const [showInstantiate, setShowInstantiate] = useState(false)
  const [instName, setInstName] = useState('')
  const [instDate, setInstDate] = useState('')
  const [instMemo, setInstMemo] = useState('')

  const { data: wf, isLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchWorkflow(workflowId),
  })

  const instantiateMut = useMutation({
    mutationFn: () => instantiateWorkflow(workflowId, { name: instName, trigger_date: instDate, memo: instMemo || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setShowInstantiate(false)
      setInstName('')
      setInstDate('')
      setInstMemo('')
    },
  })

  if (isLoading) return <div className="text-sm text-slate-500">불러오는 중...</div>
  if (!wf) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{wf.name}</h3>
          <p className="text-sm text-slate-500 mt-0.5">{wf.trigger_description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="px-2 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            수정
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
      </div>

      <h4 className="text-sm font-semibold text-slate-700 mb-2">단계 ({wf.steps.length})</h4>
      <div className="space-y-1 mb-4">
        {wf.steps.map((s: any) => (
          <div key={s.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded text-sm">
            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-medium">
              {s.order}
            </span>
            <span className="flex-1 text-slate-700">{s.name}</span>
            <span className="text-xs text-slate-500">{s.timing}</span>
            {s.estimated_time && (
              <span className="text-xs text-slate-400 flex items-center gap-0.5">
                <Clock size={11} /> {s.estimated_time}
              </span>
            )}
          </div>
        ))}
      </div>

      {wf.documents.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
            <FileText size={14} /> 서류
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {wf.documents.map((d: any) => (
              <span key={d.id} className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded">
                {d.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {wf.warnings.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1">
            <AlertTriangle size={14} /> 주의사항
          </h4>
          <ul className="space-y-1">
            {wf.warnings.map((w: any) => (
              <li key={w.id} className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded">
                {w.content}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showInstantiate ? (
        <button
          onClick={() => setShowInstantiate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Play size={16} /> 워크플로우 시작
        </button>
      ) : (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
          <input
            autoFocus
            value={instName}
            onChange={e => setInstName(e.target.value)}
            placeholder="인스턴스 이름"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
          <input
            type="date"
            value={instDate}
            onChange={e => setInstDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
          <textarea
            value={instMemo}
            onChange={e => setInstMemo(e.target.value)}
            placeholder="메모 (선택)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => instName && instDate && instantiateMut.mutate()}
              disabled={!instName || !instDate}
              className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
            >
              시작
            </button>
            <button onClick={() => setShowInstantiate(false)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveInstances() {
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: instances, isLoading } = useQuery({
    queryKey: ['workflowInstances'],
    queryFn: () => fetchWorkflowInstances('active'),
  })

  const completeStepMut = useMutation({
    mutationFn: ({ instanceId, stepId, data }: any) => completeWorkflowStep(instanceId, stepId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const cancelMut = useMutation({
    mutationFn: cancelWorkflowInstance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
    },
  })

  if (isLoading) return <div className="text-sm text-slate-500">불러오는 중...</div>
  if (!instances?.length) return <p className="text-sm text-slate-400">진행 중인 워크플로우가 없습니다.</p>

  return (
    <div className="space-y-3">
      {instances.map((inst: any) => (
        <div key={inst.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setExpandedId(expandedId === inst.id ? null : inst.id)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
          >
            <div>
              <h4 className="text-sm font-medium text-slate-800">{inst.name}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{inst.workflow_name} | 시작일: {inst.trigger_date}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">{inst.progress}</span>
              <ChevronRight size={16} className={`text-slate-400 transition-transform ${expandedId === inst.id ? 'rotate-90' : ''}`} />
            </div>
          </button>

          {expandedId === inst.id && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="space-y-1.5 mt-3">
                {inst.step_instances.map((si: any) => (
                  <div
                    key={si.id}
                    className={`flex items-center gap-3 p-2 rounded text-sm ${
                      si.status === 'completed' ? 'bg-green-50' : si.status === 'in_progress' ? 'bg-blue-50' : 'bg-slate-50'
                    }`}
                  >
                    {si.status === 'completed' ? (
                      <Check size={16} className="text-green-500 shrink-0" />
                    ) : (
                      <button
                        onClick={() => completeStepMut.mutate({
                          instanceId: inst.id,
                          stepId: si.id,
                          data: { actual_time: si.estimated_time },
                        })}
                        className="w-4 h-4 rounded-full border-2 border-slate-300 hover:border-green-500 shrink-0"
                      />
                    )}
                    <span className={`flex-1 ${si.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {si.step_name}
                    </span>
                    <span className="text-xs text-slate-500">{labelStatus(si.status)}</span>
                    <span className="text-xs text-slate-500">{si.calculated_date}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  if (confirm('이 워크플로우 인스턴스를 취소하시겠습니까?')) cancelMut.mutate(inst.id)
                }}
                className="mt-3 text-xs text-red-500 hover:text-red-700"
              >
                워크플로우 취소
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient()
  const [selectedWfId, setSelectedWfId] = useState<number | null>(null)
  const [mode, setMode] = useState<'list' | 'view' | 'create' | 'edit'>('list')

  const { data: selectedWorkflow } = useQuery({
    queryKey: ['workflow', selectedWfId],
    queryFn: () => fetchWorkflow(selectedWfId as number),
    enabled: !!selectedWfId,
  })

  const createMut = useMutation({
    mutationFn: createWorkflowTemplate,
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedWfId(created.id)
      setMode('view')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkflowTemplateInput }) => updateWorkflowTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', selectedWfId] })
      setMode('view')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteWorkflowTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      if (mode !== 'list') {
        setSelectedWfId(null)
        setMode('list')
      }
    },
  })

  const openDetail = (id: number) => {
    setSelectedWfId(id)
    setMode('view')
  }

  const startCreate = () => {
    setSelectedWfId(null)
    setMode('create')
  }

  const startEdit = (id: number) => {
    setSelectedWfId(id)
    setMode('edit')
  }

  const runDelete = (id: number) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까? 진행 중 인스턴스가 있으면 삭제되지 않습니다.')) return
    deleteMut.mutate(id)
  }

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">워크플로우 템플릿</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">템플릿 관리</h3>

          {mode === 'list' && (
            <WorkflowTemplateList
              onSelect={openDetail}
              onCreate={startCreate}
              onEdit={startEdit}
              onDelete={runDelete}
            />
          )}

          {mode === 'view' && selectedWfId && (
            <WorkflowDetail
              workflowId={selectedWfId}
              onClose={() => setMode('list')}
              onEdit={() => startEdit(selectedWfId)}
            />
          )}

          {mode === 'create' && (
            <TemplateEditor
              title="템플릿 생성"
              initialData={EMPTY_TEMPLATE}
              submitLabel="생성"
              loading={createMut.isPending}
              onSubmit={data => createMut.mutate(data)}
              onCancel={() => setMode('list')}
            />
          )}

          {mode === 'edit' && selectedWfId && selectedWorkflow && (
            <TemplateEditor
              title="템플릿 수정"
              initialData={normalizeTemplate(selectedWorkflow)}
              submitLabel="저장"
              loading={updateMut.isPending}
              onSubmit={data => updateMut.mutate({ id: selectedWfId, data })}
              onCancel={() => setMode('view')}
            />
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">진행 중 인스턴스</h3>
          <ActiveInstances />
        </div>
      </div>
    </div>
  )
}
