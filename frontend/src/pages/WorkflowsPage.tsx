import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWorkflows, fetchWorkflow, fetchWorkflowInstances,
  instantiateWorkflow, completeWorkflowStep, cancelWorkflowInstance,
} from '../lib/api'
import { Play, ChevronRight, Check, X, FileText, AlertTriangle, Clock } from 'lucide-react'

function WorkflowTemplateList({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
  })

  if (isLoading) return <div className="text-sm text-slate-500">로딩 중...</div>

  return (
    <div className="space-y-2">
      {workflows?.map((wf: any) => (
        <button
          key={wf.id}
          onClick={() => onSelect(wf.id)}
          className="w-full text-left p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-800">{wf.name}</h4>
            <ChevronRight size={16} className="text-slate-400 group-hover:text-blue-500" />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span>{wf.category}</span>
            <span>{wf.step_count}단계</span>
            <span>{wf.total_duration}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function WorkflowDetail({ workflowId, onClose }: { workflowId: number; onClose: () => void }) {
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

  if (isLoading) return <div className="text-sm text-slate-500">로딩 중...</div>
  if (!wf) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{wf.name}</h3>
          <p className="text-sm text-slate-500 mt-0.5">{wf.trigger_description}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
      </div>

      {/* Steps */}
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

      {/* Documents */}
      {wf.documents.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
            <FileText size={14} /> 필요 서류
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

      {/* Warnings */}
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

      {/* Instantiate */}
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
            placeholder="인스턴스 이름 (예: A기업 투자계약)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="date"
            value={instDate}
            onChange={e => setInstDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <textarea
            value={instMemo}
            onChange={e => setInstMemo(e.target.value)}
            placeholder="메모 (선택)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => instName && instDate && instantiateMut.mutate()}
              disabled={!instName || !instDate}
              className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
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

  if (isLoading) return <div className="text-sm text-slate-500">로딩 중...</div>
  if (!instances?.length) return <p className="text-sm text-slate-400">진행 중인 워크플로우 없음</p>

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
              <p className="text-xs text-slate-500 mt-0.5">{inst.workflow_name} | 기준일: {inst.trigger_date}</p>
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
                  <div key={si.id} className={`flex items-center gap-3 p-2 rounded text-sm ${
                    si.status === 'completed' ? 'bg-green-50' : si.status === 'in_progress' ? 'bg-blue-50' : 'bg-slate-50'
                  }`}>
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
                    <span className="text-xs text-slate-500">{si.calculated_date}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { if (confirm('이 워크플로우를 취소하시겠습니까?')) cancelMut.mutate(inst.id) }}
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
  const [selectedWfId, setSelectedWfId] = useState<number | null>(null)

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">워크플로우</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Templates or Detail */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">템플릿</h3>
          {selectedWfId ? (
            <WorkflowDetail workflowId={selectedWfId} onClose={() => setSelectedWfId(null)} />
          ) : (
            <WorkflowTemplateList onSelect={setSelectedWfId} />
          )}
        </div>

        {/* Right: Active Instances */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">진행 중</h3>
          <ActiveInstances />
        </div>
      </div>
    </div>
  )
}
