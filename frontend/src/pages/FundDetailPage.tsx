import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createFundLP,
  deleteFund,
  deleteFundLP,
  fetchDocumentStatus,
  fetchFund,
  fetchInvestments,
  updateFund,
  updateFundKeyTerms,
  updateFundLP,
  updateFundNoticePeriods,
  type DocumentStatusItem,
  type Fund,
  type FundInput,
  type FundKeyTermInput,
  type FundNoticePeriodInput,
  type LPInput,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'

interface FundInvestmentListItem {
  id: number
  company_name?: string
  investment_date?: string | null
  amount?: number | null
  instrument?: string | null
  status?: string
}

interface EditableNoticePeriod extends FundNoticePeriodInput {
  _row_id: string
}

interface EditableKeyTerm extends FundKeyTermInput {
  _row_id: string
}

const STANDARD_NOTICE_TYPES = [
  { notice_type: 'assembly', label: '총회 소집 통지', default_days: 14 },
  { notice_type: 'capital_call_initial', label: '최초 출자금 납입 요청', default_days: 10 },
  { notice_type: 'capital_call_additional', label: '수시 출자금 납입 요청', default_days: 10 },
  { notice_type: 'ic_agenda', label: '투자심의위원회 안건 통지', default_days: 7 },
  { notice_type: 'distribution', label: '분배 통지', default_days: 5 },
  { notice_type: 'dissolution', label: '해산/청산 통지', default_days: 30 },
  { notice_type: 'lp_report', label: '조합원 보고', default_days: 0 },
  { notice_type: 'amendment', label: '규약 변경 통지', default_days: 14 },
]

const NOTICE_TYPE_MAP = new Map(STANDARD_NOTICE_TYPES.map((item) => [item.notice_type, item]))

const EMPTY_LP: LPInput = {
  name: '',
  type: '기관투자자',
  commitment: null,
  paid_in: null,
  contact: '',
}

function buildNoticeDraft(fund: Fund | undefined): EditableNoticePeriod[] {
  const existing = fund?.notice_periods ?? []
  if (existing.length > 0) {
    return existing.map((row) => ({
      _row_id: `notice-${row.id}`,
      notice_type: row.notice_type,
      label: row.label,
      business_days: row.business_days,
      memo: row.memo ?? '',
    }))
  }
  return STANDARD_NOTICE_TYPES.map((item, idx) => ({
    _row_id: `notice-new-${idx}`,
    notice_type: item.notice_type,
    label: item.label,
    business_days: item.default_days,
    memo: '',
  }))
}

function buildKeyTermDraft(fund: Fund | undefined): EditableKeyTerm[] {
  const existing = fund?.key_terms ?? []
  if (existing.length > 0) {
    return existing.map((row) => ({
      _row_id: `term-${row.id}`,
      category: row.category,
      label: row.label,
      value: row.value,
      article_ref: row.article_ref ?? '',
    }))
  }
  return [{
    _row_id: 'term-new-0',
    category: '기타',
    label: '',
    value: '',
    article_ref: '',
  }]
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
    <div className="card-base space-y-3">
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
        <input value={form.fund_manager || ''} onChange={e => setForm(prev => ({ ...prev, fund_manager: e.target.value }))} placeholder="대표 펀드매니저" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.co_gp || ''} onChange={e => setForm(prev => ({ ...prev, co_gp: e.target.value }))} placeholder="Co-GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.trustee || ''} onChange={e => setForm(prev => ({ ...prev, trustee: e.target.value }))} placeholder="신탁사" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.commitment_total ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment_total: e.target.value ? Number(e.target.value) : null }))} placeholder="총 약정액" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.gp_commitment ?? ''} onChange={e => setForm(prev => ({ ...prev, gp_commitment: e.target.value ? Number(e.target.value) : null }))} placeholder="GP 출자금" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.aum ?? ''} onChange={e => setForm(prev => ({ ...prev, aum: e.target.value ? Number(e.target.value) : null }))} placeholder="AUM" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="date" value={form.investment_period_end || ''} onChange={e => setForm(prev => ({ ...prev, investment_period_end: e.target.value }))} className="px-3 py-2 text-sm border rounded-lg" />
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
            investment_period_end: form.investment_period_end || null,
            maturity_date: form.maturity_date || null,
            gp: form.gp?.trim() || null,
            fund_manager: form.fund_manager?.trim() || null,
            co_gp: form.co_gp?.trim() || null,
            trustee: form.trustee?.trim() || null,
            account_number: form.account_number?.trim() || null,
          })}
          disabled={loading || !form.name.trim()}
          className="primary-btn"
        >
          저장
        </button>
        <button onClick={onCancel} className="secondary-btn">취소</button>
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
          className="primary-btn"
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
  const [editingNotices, setEditingNotices] = useState(false)
  const [editingKeyTerms, setEditingKeyTerms] = useState(false)
  const [noticeDraft, setNoticeDraft] = useState<EditableNoticePeriod[]>([])
  const [keyTermDraft, setKeyTermDraft] = useState<EditableKeyTerm[]>([])

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

  useEffect(() => {
    if (!fundDetail) return
    if (!editingNotices) {
      setNoticeDraft(buildNoticeDraft(fundDetail))
    }
    if (!editingKeyTerms) {
      setKeyTermDraft(buildKeyTermDraft(fundDetail))
    }
  }, [fundDetail, editingNotices, editingKeyTerms])

  const totalInvestmentAmount = useMemo(
    () => (investments ?? []).reduce((sum, inv) => sum + (inv.amount ?? 0), 0),
    [investments],
  )

  const keyTermsByCategory = useMemo(() => {
    const grouped = new Map<string, { label: string; value: string; article_ref: string | null }[]>()
    for (const term of fundDetail?.key_terms ?? []) {
      const category = term.category || '기타'
      const list = grouped.get(category) ?? []
      list.push({ label: term.label, value: term.value, article_ref: term.article_ref })
      grouped.set(category, list)
    }
    return Array.from(grouped.entries())
  }, [fundDetail?.key_terms])

  const updateFundMut = useMutation({
    mutationFn: ({ id: targetId, data }: { id: number; data: Partial<FundInput> }) => updateFund(targetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      setEditingFund(false)
      addToast('success', '조합이 수정되었습니다.')
    },
  })

  const saveNoticeMut = useMutation({
    mutationFn: (rows: EditableNoticePeriod[]) => {
      const payload: FundNoticePeriodInput[] = rows
        .filter((row) => row.notice_type.trim() && row.label.trim())
        .map((row) => ({
          notice_type: row.notice_type.trim(),
          label: row.label.trim(),
          business_days: Math.max(0, Number(row.business_days) || 0),
          memo: row.memo?.trim() || null,
        }))
      return updateFundNoticePeriods(fundId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      setEditingNotices(false)
      addToast('success', '통지기간이 저장되었습니다.')
    },
  })

  const saveKeyTermsMut = useMutation({
    mutationFn: (rows: EditableKeyTerm[]) => {
      const payload: FundKeyTermInput[] = rows
        .filter((row) => row.label.trim() && row.value.trim())
        .map((row) => ({
          category: row.category.trim() || '기타',
          label: row.label.trim(),
          value: row.value.trim(),
          article_ref: row.article_ref?.trim() || null,
        }))
      return updateFundKeyTerms(fundId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      setEditingKeyTerms(false)
      addToast('success', '주요 계약 조항이 저장되었습니다.')
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
    return <div className="page-container text-sm text-red-600">유효하지 않은 조합 ID입니다.</div>
  }

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/funds" className="hover:text-blue-600">조합 관리</Link>
        <span>/</span>
        <span className="text-gray-900">{fundDetail?.name ?? `조합 #${fundId}`}</span>
      </div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{fundDetail?.name ?? `조합 #${fundId}`}</h2>
          <p className="page-subtitle">조합 상세 정보와 LP/투자 현황을 관리합니다.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state"><div className="loading-spinner" /></div>
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
            <div className="card-base space-y-4">
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
                <div className="p-2 bg-gray-50 rounded">투자기간 종료일: {fundDetail.investment_period_end || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">만기일: {fundDetail.maturity_date || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">GP: {fundDetail.gp || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">대표 펀드매니저: {fundDetail.fund_manager || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">Co-GP: {fundDetail.co_gp || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">신탁사: {fundDetail.trustee || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">약정액: {formatKRW(fundDetail.commitment_total ?? null)}</div>
                <div className="p-2 bg-gray-50 rounded">GP 출자금: {formatKRW(fundDetail.gp_commitment ?? null)}</div>
                <div className="p-2 bg-gray-50 rounded">AUM: {formatKRW(fundDetail.aum ?? null)}</div>
                <div className="p-2 bg-gray-50 rounded">관리보수율: {fundDetail.mgmt_fee_rate != null ? `${fundDetail.mgmt_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded">성과보수율: {fundDetail.performance_fee_rate != null ? `${fundDetail.performance_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded">허들레이트: {fundDetail.hurdle_rate != null ? `${fundDetail.hurdle_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded md:col-span-3">운용계좌번호: {fundDetail.account_number || '-'}</div>
              </div>
            </div>
          )}

          <div className="card-base space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">통지기간 (영업일)</h3>
              {!editingNotices ? (
                <button
                  onClick={() => {
                    setNoticeDraft(buildNoticeDraft(fundDetail))
                    setEditingNotices(true)
                  }}
                  className="secondary-btn"
                >
                  수정
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => saveNoticeMut.mutate(noticeDraft)} disabled={saveNoticeMut.isPending} className="primary-btn">저장</button>
                  <button
                    onClick={() => {
                      setEditingNotices(false)
                      setNoticeDraft(buildNoticeDraft(fundDetail))
                    }}
                    className="secondary-btn"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>

            {!editingNotices ? (
              (fundDetail.notice_periods?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-400">등록된 통지기간이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {(fundDetail.notice_periods ?? []).map((row) => (
                    <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm border border-gray-200 rounded-lg p-2">
                      <div className="md:col-span-5 font-medium text-gray-800">{row.label}</div>
                      <div className="md:col-span-2 text-gray-700">{row.business_days}영업일</div>
                      <div className="md:col-span-5 text-gray-500">{row.memo || '-'}</div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <datalist id="notice-type-options">
                  {STANDARD_NOTICE_TYPES.map((item) => (
                    <option key={item.notice_type} value={item.notice_type}>{item.label}</option>
                  ))}
                </datalist>

                {noticeDraft.map((row, idx) => (
                  <div key={row._row_id} className="grid grid-cols-1 md:grid-cols-12 gap-2 border border-gray-200 rounded-lg p-2">
                    <input
                      value={row.notice_type}
                      onChange={(e) => {
                        const nextType = e.target.value
                        const standard = NOTICE_TYPE_MAP.get(nextType)
                        setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? {
                          ...item,
                          notice_type: nextType,
                          label: item.label || standard?.label || '',
                          business_days: Number.isFinite(item.business_days) ? item.business_days : (standard?.default_days ?? 0),
                        } : item))
                      }}
                      list="notice-type-options"
                      placeholder="notice_type"
                      className="md:col-span-2 px-2 py-1 text-sm border rounded"
                    />
                    <input
                      value={row.label}
                      onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, label: e.target.value } : item))}
                      placeholder="표시명"
                      className="md:col-span-4 px-2 py-1 text-sm border rounded"
                    />
                    <input
                      type="number"
                      min={0}
                      value={row.business_days}
                      onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, business_days: Math.max(0, Number(e.target.value || 0)) } : item))}
                      placeholder="영업일"
                      className="md:col-span-2 px-2 py-1 text-sm border rounded"
                    />
                    <input
                      value={row.memo || ''}
                      onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, memo: e.target.value } : item))}
                      placeholder="메모 / 조항"
                      className="md:col-span-3 px-2 py-1 text-sm border rounded"
                    />
                    <button
                      onClick={() => setNoticeDraft((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))}
                      className="md:col-span-1 px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => setNoticeDraft((prev) => [...prev, {
                    _row_id: `notice-new-${Date.now()}-${prev.length}`,
                    notice_type: '',
                    label: '',
                    business_days: 0,
                    memo: '',
                  }])}
                  className="secondary-btn"
                >
                  + 통지기간 추가
                </button>
              </div>
            )}
          </div>

          <div className="card-base space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">주요 계약 조항</h3>
              {!editingKeyTerms ? (
                <button
                  onClick={() => {
                    setKeyTermDraft(buildKeyTermDraft(fundDetail))
                    setEditingKeyTerms(true)
                  }}
                  className="secondary-btn"
                >
                  수정
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => saveKeyTermsMut.mutate(keyTermDraft)} disabled={saveKeyTermsMut.isPending} className="primary-btn">저장</button>
                  <button
                    onClick={() => {
                      setEditingKeyTerms(false)
                      setKeyTermDraft(buildKeyTermDraft(fundDetail))
                    }}
                    className="secondary-btn"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>

            {!editingKeyTerms ? (
              keyTermsByCategory.length === 0 ? (
                <p className="text-sm text-gray-400">등록된 계약 조항이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {keyTermsByCategory.map(([category, rows]) => (
                    <div key={category} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">[{category}]</p>
                      <div className="space-y-2">
                        {rows.map((row, idx) => (
                          <div key={`${category}-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm">
                            <div className="md:col-span-3 font-medium text-gray-800">{row.label}</div>
                            <div className="md:col-span-7 text-gray-700">{row.value}</div>
                            <div className="md:col-span-2 text-gray-500">{row.article_ref || '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                {keyTermDraft.map((row, idx) => (
                  <div key={row._row_id} className="grid grid-cols-1 md:grid-cols-14 gap-2 border border-gray-200 rounded-lg p-2">
                    <input
                      value={row.category}
                      onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, category: e.target.value } : item))}
                      placeholder="카테고리"
                      className="md:col-span-2 px-2 py-1 text-sm border rounded"
                    />
                    <input
                      value={row.label}
                      onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, label: e.target.value } : item))}
                      placeholder="조항"
                      className="md:col-span-3 px-2 py-1 text-sm border rounded"
                    />
                    <input
                      value={row.value}
                      onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, value: e.target.value } : item))}
                      placeholder="내용"
                      className="md:col-span-5 px-2 py-1 text-sm border rounded"
                    />
                    <input
                      value={row.article_ref || ''}
                      onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, article_ref: e.target.value } : item))}
                      placeholder="조문"
                      className="md:col-span-2 px-2 py-1 text-sm border rounded"
                    />
                    <div className="md:col-span-2 flex gap-1">
                      <button
                        onClick={() => {
                          if (idx === 0) return
                          setKeyTermDraft((prev) => {
                            const next = [...prev]
                            const temp = next[idx - 1]
                            next[idx - 1] = next[idx]
                            next[idx] = temp
                            return next
                          })
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                        title="위로"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => {
                          if (idx === keyTermDraft.length - 1) return
                          setKeyTermDraft((prev) => {
                            const next = [...prev]
                            const temp = next[idx + 1]
                            next[idx + 1] = next[idx]
                            next[idx] = temp
                            return next
                          })
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                        title="아래로"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => setKeyTermDraft((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))}
                        className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setKeyTermDraft((prev) => [...prev, {
                    _row_id: `term-new-${Date.now()}-${prev.length}`,
                    category: '기타',
                    label: '',
                    value: '',
                    article_ref: '',
                  }])}
                  className="secondary-btn"
                >
                  + 조항 추가
                </button>
              </div>
            )}
          </div>

          <div className="card-base">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">LP 목록</h3>
              <button onClick={() => setShowCreateLP(v => !v)} className="primary-btn inline-flex items-center gap-1"><Plus size={12} /> LP 추가</button>
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
                          <button onClick={() => setEditingLPId(lp.id)} className="secondary-btn">수정</button>
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
            <div className="card-base">
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

            <div className="card-base">
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








