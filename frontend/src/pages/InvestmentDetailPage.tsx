import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  fetchCompanies,
  fetchFunds,
  fetchInvestment,
  updateInvestment,
  deleteInvestment,
  createInvestmentDocument,
  updateInvestmentDocument,
  deleteInvestmentDocument,
  fetchWorkflowInstances,
  type Company,
  type Fund,
  type InvestmentDocumentInput,
  type InvestmentInput,
  type WorkflowInstance,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { ArrowLeft } from 'lucide-react'

interface InvestmentDocument {
  id: number
  name: string
  doc_type?: string | null
  status?: string
  note?: string | null
  due_date?: string | null
}

interface InvestmentDetail {
  id: number
  fund_id: number
  company_id: number
  investment_date?: string | null
  amount?: number | null
  shares?: number | null
  share_price?: number | null
  valuation?: number | null
  contribution_rate?: string | null
  instrument?: string | null
  status?: string
  documents?: InvestmentDocument[]
}

const EMPTY_DOC: InvestmentDocumentInput = { name: '', doc_type: '', status: 'pending', note: '', due_date: null }

function toInvestmentInput(detail: InvestmentDetail): InvestmentInput {
  return {
    fund_id: detail.fund_id,
    company_id: detail.company_id,
    investment_date: detail.investment_date || '',
    amount: detail.amount ?? null,
    shares: detail.shares ?? null,
    share_price: detail.share_price ?? null,
    valuation: detail.valuation ?? null,
    contribution_rate: detail.contribution_rate || '',
    instrument: detail.instrument || '',
    status: detail.status || 'active',
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

export default function InvestmentDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const investmentId = Number(id)
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [editingInvestment, setEditingInvestment] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [editingDocId, setEditingDocId] = useState<number | null>(null)

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })

  const { data: selectedInvestment, isLoading } = useQuery<InvestmentDetail>({
    queryKey: ['investment', investmentId],
    queryFn: () => fetchInvestment(investmentId),
    enabled: Number.isFinite(investmentId) && investmentId > 0,
  })

  const { data: linkedWorkflows } = useQuery<WorkflowInstance[]>({
    queryKey: ['workflowInstances', { status: 'all', investment_id: investmentId }],
    queryFn: () => fetchWorkflowInstances({ status: 'all', investment_id: investmentId }),
    enabled: Number.isFinite(investmentId) && investmentId > 0,
  })

  const fundName = useMemo(
    () => funds?.find(f => f.id === selectedInvestment?.fund_id)?.name || '-',
    [funds, selectedInvestment?.fund_id],
  )
  const companyName = useMemo(
    () => companies?.find(c => c.id === selectedInvestment?.company_id)?.name || '-',
    [companies, selectedInvestment?.company_id],
  )

  const updateInvestmentMut = useMutation({
    mutationFn: ({ id: targetId, data }: { id: number; data: Partial<InvestmentInput> }) => updateInvestment(targetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      queryClient.invalidateQueries({ queryKey: ['investment', investmentId] })
      setEditingInvestment(false)
      addToast('success', '투자 정보가 수정되었습니다.')
    },
  })

  const deleteInvestmentMut = useMutation({
    mutationFn: deleteInvestment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      addToast('success', '투자가 삭제되었습니다.')
      navigate('/investments')
    },
  })

  const createDocMut = useMutation({
    mutationFn: (data: InvestmentDocumentInput) => createInvestmentDocument(investmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', investmentId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setShowDocForm(false)
      addToast('success', '서류가 추가되었습니다.')
    },
  })

  const updateDocMut = useMutation({
    mutationFn: ({ docId, data }: { docId: number; data: Partial<InvestmentDocumentInput> }) => updateInvestmentDocument(investmentId, docId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', investmentId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditingDocId(null)
      addToast('success', '서류가 수정되었습니다.')
    },
  })

  const deleteDocMut = useMutation({
    mutationFn: (docId: number) => deleteInvestmentDocument(investmentId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', investmentId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', '서류가 삭제되었습니다.')
    },
  })

  if (!Number.isFinite(investmentId) || investmentId <= 0) {
    return <div className="p-6 text-sm text-red-600">유효하지 않은 투자 ID입니다.</div>
  }

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <button onClick={() => navigate('/investments')} className="text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft size={16} /> 투자 목록으로
      </button>

      {isLoading ? (
        <p className="text-sm text-slate-500">불러오는 중...</p>
      ) : !selectedInvestment ? (
        <p className="text-sm text-slate-500">투자를 찾을 수 없습니다.</p>
      ) : (
        <>
          <div className="bg-white border rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">투자 #{selectedInvestment.id}</h2>
              <div className="flex gap-2">
                <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => setEditingInvestment(v => !v)}>{editingInvestment ? '취소' : '수정'}</button>
                <button className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded" onClick={() => { if (confirm('이 투자를 삭제하시겠습니까?')) deleteInvestmentMut.mutate(investmentId) }}>삭제</button>
              </div>
            </div>

            {editingInvestment ? (
              <InvestmentForm
                funds={funds || []}
                companies={companies || []}
                initial={toInvestmentInput(selectedInvestment)}
                onSubmit={d => updateInvestmentMut.mutate({ id: investmentId, data: d })}
                onCancel={() => setEditingInvestment(false)}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="p-2 bg-slate-50 rounded">조합: {fundName}</div>
                <div className="p-2 bg-slate-50 rounded">회사: {companyName}</div>
                <div className="p-2 bg-slate-50 rounded">상태: {labelStatus(selectedInvestment.status || 'active')}</div>
                <div className="p-2 bg-slate-50 rounded">투자일: {selectedInvestment.investment_date || '-'}</div>
                <div className="p-2 bg-slate-50 rounded">투자금액: {selectedInvestment.amount?.toLocaleString?.() ?? '-'}</div>
                <div className="p-2 bg-slate-50 rounded">주식 수: {selectedInvestment.shares ?? '-'}</div>
                <div className="p-2 bg-slate-50 rounded">주당 가격: {selectedInvestment.share_price?.toLocaleString?.() ?? '-'}</div>
                <div className="p-2 bg-slate-50 rounded">밸류에이션: {selectedInvestment.valuation?.toLocaleString?.() ?? '-'}</div>
                <div className="p-2 bg-slate-50 rounded">지분율: {selectedInvestment.contribution_rate || '-'}</div>
                <div className="p-2 bg-slate-50 rounded md:col-span-3">투자수단: {selectedInvestment.instrument || '-'}</div>
              </div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">연결된 워크플로우</h3>
            {!linkedWorkflows?.length ? (
              <p className="text-sm text-slate-400">연결된 워크플로우 인스턴스가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {linkedWorkflows.map((instance) => (
                  <button
                    key={instance.id}
                    onClick={() => navigate('/workflows', { state: { expandInstanceId: instance.id } })}
                    className="w-full text-left border border-indigo-200 bg-indigo-50 rounded-lg p-2 hover:bg-indigo-100"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-indigo-900">{instance.name}</p>
                      <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{instance.progress}</span>
                    </div>
                    <p className="text-xs text-indigo-700 mt-0.5">{instance.workflow_name} | {labelStatus(instance.status)} | 시작일 {formatDate(instance.trigger_date)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">서류</h3>
              <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowDocForm(v => !v)}>+ 서류</button>
            </div>

            {showDocForm && <DocumentForm initial={EMPTY_DOC} onSubmit={d => createDocMut.mutate(d)} onCancel={() => setShowDocForm(false)} />}

            <div className="space-y-2">
              {selectedInvestment.documents?.length ? selectedInvestment.documents.map((doc) => (
                <div key={doc.id} className="border rounded p-2">
                  {editingDocId === doc.id ? (
                    <DocumentForm initial={doc} onSubmit={d => updateDocMut.mutate({ docId: doc.id, data: d })} onCancel={() => setEditingDocId(null)} />
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{doc.name}</p>
                        <p className="text-xs text-slate-500">{doc.doc_type || '-'} | {labelStatus(doc.status || 'pending')} | 마감 {formatDate(doc.due_date)} | {doc.note || '-'}</p>
                      </div>
                      <div className="flex gap-1">
                        <button className="text-xs px-2 py-0.5 bg-slate-100 rounded" onClick={() => setEditingDocId(doc.id)}>수정</button>
                        <button className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded" onClick={() => { if (confirm('이 서류를 삭제하시겠습니까?')) deleteDocMut.mutate(doc.id) }}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              )) : <p className="text-sm text-slate-400">서류가 없습니다.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function InvestmentForm({ funds, companies, initial, onSubmit, onCancel }: { funds: Fund[]; companies: Company[]; initial: InvestmentInput; onSubmit: (data: InvestmentInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState<InvestmentInput>(initial)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border rounded p-2 bg-slate-50">
      <select value={form.fund_id || ''} onChange={e => setForm(prev => ({ ...prev, fund_id: Number(e.target.value) }))} className="px-2 py-1 text-sm border rounded"><option value="">조합 선택</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <select value={form.company_id || ''} onChange={e => setForm(prev => ({ ...prev, company_id: Number(e.target.value) }))} className="px-2 py-1 text-sm border rounded"><option value="">회사 선택</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input type="date" value={form.investment_date || ''} onChange={e => setForm(prev => ({ ...prev, investment_date: e.target.value }))} className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.amount ?? ''} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value ? Number(e.target.value) : null }))} placeholder="투자금액" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.shares ?? ''} onChange={e => setForm(prev => ({ ...prev, shares: e.target.value ? Number(e.target.value) : null }))} placeholder="주식 수" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.share_price ?? ''} onChange={e => setForm(prev => ({ ...prev, share_price: e.target.value ? Number(e.target.value) : null }))} placeholder="주당 가격" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.valuation ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation: e.target.value ? Number(e.target.value) : null }))} placeholder="밸류에이션" className="px-2 py-1 text-sm border rounded" />
      <input value={form.contribution_rate || ''} onChange={e => setForm(prev => ({ ...prev, contribution_rate: e.target.value }))} placeholder="지분율" className="px-2 py-1 text-sm border rounded" />
      <input value={form.instrument || ''} onChange={e => setForm(prev => ({ ...prev, instrument: e.target.value }))} placeholder="투자수단" className="px-2 py-1 text-sm border rounded" />
      <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태(예: active)" className="px-2 py-1 text-sm border rounded" />
      <div className="md:col-span-3 flex gap-2">
        <button className="px-3 py-1 text-xs bg-blue-600 text-white rounded" onClick={() => { if (!form.fund_id || !form.company_id) return; onSubmit({ ...form, investment_date: form.investment_date || null }) }}>저장</button>
        <button className="px-3 py-1 text-xs bg-white border rounded" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

function DocumentForm({ initial, onSubmit, onCancel }: { initial: InvestmentDocumentInput; onSubmit: (data: InvestmentDocumentInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState<InvestmentDocumentInput>(initial)

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 border rounded p-2 bg-slate-50 mb-2">
      <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="서류명" className="px-2 py-1 text-sm border rounded" />
      <input value={form.doc_type || ''} onChange={e => setForm(prev => ({ ...prev, doc_type: e.target.value }))} placeholder="유형" className="px-2 py-1 text-sm border rounded" />
      <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태(예: pending)" className="px-2 py-1 text-sm border rounded" />
      <input type="date" value={form.due_date || ''} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value || null }))} className="px-2 py-1 text-sm border rounded" />
      <input value={form.note || ''} onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))} placeholder="비고" className="px-2 py-1 text-sm border rounded" />
      <div className="md:col-span-5 flex gap-2">
        <button className="px-3 py-1 text-xs bg-blue-600 text-white rounded" onClick={() => { if (form.name.trim()) onSubmit({ ...form, name: form.name.trim(), due_date: form.due_date || null }) }}>저장</button>
        <button className="px-3 py-1 text-xs bg-white border rounded" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
