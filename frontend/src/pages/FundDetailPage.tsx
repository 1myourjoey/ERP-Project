import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createFundLP,
  deleteFund,
  deleteFundLP,
  fetchDocumentStatus,
  fetchFund,
  fetchInvestments,
  updateFund,
  updateFundLP,
  type DocumentStatusItem,
  type Fund,
  type FundInput,
  type LPInput,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { ArrowLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'

interface FundInvestmentListItem {
  id: number
  company_name?: string
  investment_date?: string | null
  amount?: number | null
  instrument?: string | null
  status?: string
}

const EMPTY_LP: LPInput = {
  name: '',
  type: '기관투자자',
  commitment: null,
  paid_in: null,
  contact: '',
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-800 mt-1">{value}</p>
    </div>
  )
}

function dueText(doc: DocumentStatusItem): string | null {
  if (doc.days_remaining == null) return null
  if (doc.days_remaining < 0) return `지연 ${Math.abs(doc.days_remaining)}일`
  return `D-${doc.days_remaining}`
}

function FundForm({
  initial,
  loading,
  onSubmit,
  onCancel,
}: {
  initial: FundInput
  loading: boolean
  onSubmit: (data: FundInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FundInput>(initial)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">조합 수정</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="조합명" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} placeholder="조합 유형" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="date" value={form.formation_date || ''} onChange={e => setForm(prev => ({ ...prev, formation_date: e.target.value }))} className="px-3 py-2 text-sm border rounded-lg" />
        <input type="date" value={form.maturity_date || ''} onChange={e => setForm(prev => ({ ...prev, maturity_date: e.target.value }))} className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태(예: active)" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.gp || ''} onChange={e => setForm(prev => ({ ...prev, gp: e.target.value }))} placeholder="GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.co_gp || ''} onChange={e => setForm(prev => ({ ...prev, co_gp: e.target.value }))} placeholder="Co-GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.trustee || ''} onChange={e => setForm(prev => ({ ...prev, trustee: e.target.value }))} placeholder="신탁사" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.commitment_total ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment_total: e.target.value ? Number(e.target.value) : null }))} placeholder="총 약정액" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.aum ?? ''} onChange={e => setForm(prev => ({ ...prev, aum: e.target.value ? Number(e.target.value) : null }))} placeholder="AUM" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" step="0.01" value={form.mgmt_fee_rate ?? ''} onChange={e => setForm(prev => ({ ...prev, mgmt_fee_rate: e.target.value ? Number(e.target.value) : null }))} placeholder="관리보수율(%)" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" step="0.01" value={form.performance_fee_rate ?? ''} onChange={e => setForm(prev => ({ ...prev, performance_fee_rate: e.target.value ? Number(e.target.value) : null }))} placeholder="성과보수율(%)" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" step="0.01" value={form.hurdle_rate ?? ''} onChange={e => setForm(prev => ({ ...prev, hurdle_rate: e.target.value ? Number(e.target.value) : null }))} placeholder="허들레이트(%)" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.account_number || ''} onChange={e => setForm(prev => ({ ...prev, account_number: e.target.value }))} placeholder="운용계좌번호" className="px-3 py-2 text-sm border rounded-lg" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            name: form.name.trim(),
            type: form.type.trim(),
            formation_date: form.formation_date || null,
            maturity_date: form.maturity_date || null,
            gp: form.gp?.trim() || null,
            co_gp: form.co_gp?.trim() || null,
            trustee: form.trustee?.trim() || null,
            account_number: form.account_number?.trim() || null,
          })}
          disabled={loading || !form.name.trim()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          저장
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">취소</button>
      </div>
    </div>
  )
}

function LPForm({ initial, loading, onSubmit, onCancel }: { initial: LPInput; loading: boolean; onSubmit: (data: LPInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState<LPInput>(initial)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="LP 이름" className="px-2 py-1 text-sm border rounded" />
        <input value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} placeholder="LP 유형" className="px-2 py-1 text-sm border rounded" />
        <input type="number" value={form.commitment ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment: e.target.value ? Number(e.target.value) : null }))} placeholder="약정액" className="px-2 py-1 text-sm border rounded" />
        <input type="number" value={form.paid_in ?? ''} onChange={e => setForm(prev => ({ ...prev, paid_in: e.target.value ? Number(e.target.value) : null }))} placeholder="납입액" className="px-2 py-1 text-sm border rounded" />
        <input value={form.contact || ''} onChange={e => setForm(prev => ({ ...prev, contact: e.target.value }))} placeholder="연락처" className="px-2 py-1 text-sm border rounded" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ ...form, name: form.name.trim(), type: form.type.trim(), contact: form.contact?.trim() || null })}
          disabled={loading || !form.name.trim() || !form.type.trim()}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
        >
          저장
        </button>
        <button onClick={onCancel} className="px-3 py-1 text-xs bg-white border rounded hover:bg-gray-100">취소</button>
      </div>
    </div>
  )
}

export default function FundDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const fundId = Number(id)
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [editingFund, setEditingFund] = useState(false)
  const [showCreateLP, setShowCreateLP] = useState(false)
  const [editingLPId, setEditingLPId] = useState<number | null>(null)

  const { data: fundDetail, isLoading } = useQuery<Fund>({
    queryKey: ['fund', fundId],
    queryFn: () => fetchFund(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: investments } = useQuery<FundInvestmentListItem[]>({
    queryKey: ['investments', { fund_id: fundId }],
    queryFn: () => fetchInvestments({ fund_id: fundId }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: missingDocs } = useQuery<DocumentStatusItem[]>({
    queryKey: ['documentStatus', { fund_id: fundId, status: 'pending' }],
    queryFn: () => fetchDocumentStatus({ fund_id: fundId, status: 'pending' }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const totalInvestmentAmount = useMemo(
    () => (investments ?? []).reduce((sum, inv) => sum + (inv.amount ?? 0), 0),
    [investments],
  )

  const updateFundMut = useMutation({
    mutationFn: ({ id: targetId, data }: { id: number; data: Partial<FundInput> }) => updateFund(targetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      setEditingFund(false)
      addToast('success', '조합이 수정되었습니다.')
    },
  })

  const deleteFundMut = useMutation({
    mutationFn: deleteFund,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      addToast('success', '조합이 삭제되었습니다.')
      navigate('/funds')
    },
  })

  const createLPMut = useMutation({
    mutationFn: ({ data }: { data: LPInput }) => createFundLP(fundId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      setShowCreateLP(false)
      addToast('success', 'LP가 추가되었습니다.')
    },
  })

  const updateLPMut = useMutation({
    mutationFn: ({ lpId, data }: { lpId: number; data: Partial<LPInput> }) => updateFundLP(fundId, lpId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      setEditingLPId(null)
      addToast('success', 'LP가 수정되었습니다.')
    },
  })

  const deleteLPMut = useMutation({
    mutationFn: (lpId: number) => deleteFundLP(fundId, lpId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      addToast('success', 'LP가 삭제되었습니다.')
    },
  })

  if (!Number.isFinite(fundId) || fundId <= 0) {
    return <div className="p-6 text-sm text-red-600">유효하지 않은 조합 ID입니다.</div>
  }

  return (
    <div className="p-6 max-w-7xl space-y-4">
      <button onClick={() => navigate('/funds')} className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1">
        <ArrowLeft size={16} /> 조합 목록으로
      </button>

      {isLoading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : !fundDetail ? (
        <p className="text-sm text-gray-500">조합을 찾을 수 없습니다.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="총 약정" value={formatKRW(fundDetail.commitment_total ?? null)} />
            <SummaryCard label="운용규모(AUM)" value={formatKRW(fundDetail.aum ?? null)} />
            <SummaryCard label="투자 건수" value={`${investments?.length ?? 0}건`} />
            <SummaryCard label="투자 금액 합계" value={formatKRW(totalInvestmentAmount)} />
          </div>

          {editingFund ? (
            <FundForm
              initial={{ ...fundDetail, formation_date: fundDetail.formation_date || '' }}
              loading={updateFundMut.isPending}
              onSubmit={data => updateFundMut.mutate({ id: fundId, data })}
              onCancel={() => setEditingFund(false)}
            />
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{fundDetail.name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{fundDetail.type} | {labelStatus(fundDetail.status)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingFund(true)} className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1"><Pencil size={12} />수정</button>
                  <button onClick={() => { if (confirm('이 조합을 삭제하시겠습니까?')) deleteFundMut.mutate(fundId) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center gap-1"><Trash2 size={12} />삭제</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="p-2 bg-gray-50 rounded">결성일: {fundDetail.formation_date || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">만기일: {fundDetail.maturity_date || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">GP: {fundDetail.gp || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">Co-GP: {fundDetail.co_gp || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">신탁사: {fundDetail.trustee || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">약정액: {formatKRW(fundDetail.commitment_total ?? null)}</div>
                <div className="p-2 bg-gray-50 rounded">AUM: {formatKRW(fundDetail.aum ?? null)}</div>
                <div className="p-2 bg-gray-50 rounded">관리보수율: {fundDetail.mgmt_fee_rate != null ? `${fundDetail.mgmt_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded">성과보수율: {fundDetail.performance_fee_rate != null ? `${fundDetail.performance_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded">허들레이트: {fundDetail.hurdle_rate != null ? `${fundDetail.hurdle_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded md:col-span-3">운용계좌번호: {fundDetail.account_number || '-'}</div>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">LP 목록</h3>
              <button onClick={() => setShowCreateLP(v => !v)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"><Plus size={12} /> LP 추가</button>
            </div>

            {showCreateLP && <div className="mb-2"><LPForm initial={EMPTY_LP} loading={createLPMut.isPending} onSubmit={data => createLPMut.mutate({ data })} onCancel={() => setShowCreateLP(false)} /></div>}

            <div className="space-y-2">
              {fundDetail.lps?.length ? fundDetail.lps.map((lp) => (
                <div key={lp.id} className="border border-gray-200 rounded-lg p-3">
                  {editingLPId === lp.id ? (
                    <LPForm initial={lp} loading={updateLPMut.isPending} onSubmit={data => updateLPMut.mutate({ lpId: lp.id, data })} onCancel={() => setEditingLPId(null)} />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{lp.name}</p>
                          <p className="text-xs text-gray-500">{lp.type} | 연락처: {lp.contact || '-'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingLPId(lp.id)} className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200">수정</button>
                          <button onClick={() => { if (confirm('이 LP를 삭제하시겠습니까?')) deleteLPMut.mutate(lp.id) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">삭제</button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">약정액: {formatKRW(lp.commitment ?? null)} | 납입액: {formatKRW(lp.paid_in ?? null)}</p>
                    </>
                  )}
                </div>
              )) : <p className="text-sm text-gray-400">등록된 LP가 없습니다.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">투자 내역</h3>
              {!investments?.length ? (
                <p className="text-sm text-gray-400">등록된 투자가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {investments.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => navigate(`/investments/${inv.id}`)}
                      className="w-full rounded-xl border border-gray-100 p-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">{inv.company_name || `투자 #${inv.id}`}</span>
                        <ChevronRight size={16} className="text-gray-400" />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {inv.investment_date ? new Date(inv.investment_date).toLocaleDateString('ko-KR') : '-'} |
                        {' '}{formatKRW(inv.amount ?? null)} |
                        {' '}{labelStatus(inv.status || 'pending')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">미수 서류</h3>
              {!missingDocs?.length ? (
                <p className="text-sm text-gray-400">미수 서류가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {missingDocs.map((doc) => (
                    <div key={doc.id} className="border border-gray-100 rounded p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{doc.document_name}</p>
                        {dueText(doc) && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded ${doc.days_remaining != null && doc.days_remaining < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {dueText(doc)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{doc.company_name} | {doc.note || '-'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}


