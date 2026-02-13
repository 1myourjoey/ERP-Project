import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  fetchFunds,
  fetchCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  fetchInvestments,
  createInvestment,
  type Company,
  type CompanyInput,
  type Fund,
  type InvestmentInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

interface InvestmentListItem {
  id: number
  fund_id?: number
  fund_name?: string
  company_name?: string
  investment_date?: string | null
  amount?: number | null
  instrument?: string | null
  status?: string
}

const EMPTY_COMPANY: CompanyInput = {
  name: '',
  business_number: '',
  ceo: '',
  address: '',
  industry: '',
  vics_registered: false,
  corp_number: '',
  founded_date: '',
  analyst: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  memo: '',
}

const EMPTY_INVESTMENT: InvestmentInput = {
  fund_id: 0,
  company_id: 0,
  investment_date: '',
  amount: null,
  shares: null,
  share_price: null,
  valuation: null,
  contribution_rate: '',
  instrument: '',
  status: 'active',
  round: '',
  valuation_pre: null,
  valuation_post: null,
  ownership_pct: null,
  board_seat: '',
}

function CompanyForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial: CompanyInput
  onSubmit: (data: CompanyInput) => void
  onCancel: () => void
  loading?: boolean
}) {
  const [form, setForm] = useState<CompanyInput>(initial)

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-2 border rounded bg-gray-50">
      <input value={form.name || ''} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="회사명" className="px-2 py-1 text-sm border rounded" />
      <input value={form.business_number || ''} onChange={e => setForm(prev => ({ ...prev, business_number: e.target.value }))} placeholder="사업자번호" className="px-2 py-1 text-sm border rounded" />
      <input value={form.corp_number || ''} onChange={e => setForm(prev => ({ ...prev, corp_number: e.target.value }))} placeholder="법인등록번호" className="px-2 py-1 text-sm border rounded" />
      <input type="date" value={form.founded_date || ''} onChange={e => setForm(prev => ({ ...prev, founded_date: e.target.value }))} className="px-2 py-1 text-sm border rounded" />
      <input value={form.ceo || ''} onChange={e => setForm(prev => ({ ...prev, ceo: e.target.value }))} placeholder="대표자" className="px-2 py-1 text-sm border rounded" />
      <input value={form.analyst || ''} onChange={e => setForm(prev => ({ ...prev, analyst: e.target.value }))} placeholder="담당 심사역" className="px-2 py-1 text-sm border rounded" />
      <input value={form.industry || ''} onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))} placeholder="업종" className="px-2 py-1 text-sm border rounded" />
      <input value={form.address || ''} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="주소" className="px-2 py-1 text-sm border rounded" />
      <input value={form.contact_name || ''} onChange={e => setForm(prev => ({ ...prev, contact_name: e.target.value }))} placeholder="담당자명" className="px-2 py-1 text-sm border rounded" />
      <input value={form.contact_email || ''} onChange={e => setForm(prev => ({ ...prev, contact_email: e.target.value }))} placeholder="이메일" className="px-2 py-1 text-sm border rounded" />
      <input value={form.contact_phone || ''} onChange={e => setForm(prev => ({ ...prev, contact_phone: e.target.value }))} placeholder="전화번호" className="px-2 py-1 text-sm border rounded" />
      <label className="flex items-center gap-2 text-sm px-2 py-1 border rounded bg-white">
        <input type="checkbox" checked={!!form.vics_registered} onChange={e => setForm(prev => ({ ...prev, vics_registered: e.target.checked }))} />
        VICS 등록
      </label>
      <textarea value={form.memo || ''} onChange={e => setForm(prev => ({ ...prev, memo: e.target.value }))} placeholder="비고" className="md:col-span-6 px-2 py-1 text-sm border rounded resize-none" rows={2} />
      <div className="md:col-span-6 flex gap-2">
        <button
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded disabled:bg-gray-300"
          disabled={loading || !form.name?.trim()}
          onClick={() => {
            if (!form.name?.trim()) return
            onSubmit({
              ...form,
              name: form.name.trim(),
              business_number: form.business_number?.trim() || null,
              corp_number: form.corp_number?.trim() || null,
              founded_date: form.founded_date || null,
              ceo: form.ceo?.trim() || null,
              analyst: form.analyst?.trim() || null,
              industry: form.industry?.trim() || null,
              address: form.address?.trim() || null,
              contact_name: form.contact_name?.trim() || null,
              contact_email: form.contact_email?.trim() || null,
              contact_phone: form.contact_phone?.trim() || null,
              memo: form.memo?.trim() || null,
            })
          }}
        >
          저장
        </button>
        <button className="px-3 py-1 text-xs bg-white border rounded" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

export default function InvestmentsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [fundFilter, setFundFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null)
  const [showInvestmentForm, setShowInvestmentForm] = useState(false)

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })

  const investmentParams = useMemo(
    () => ({ fund_id: fundFilter === '' ? undefined : fundFilter, status: statusFilter || undefined }),
    [fundFilter, statusFilter],
  )

  const { data: investments, isLoading: invLoading } = useQuery<InvestmentListItem[]>({
    queryKey: ['investments', investmentParams],
    queryFn: () => fetchInvestments(investmentParams),
  })

  const createCompanyMut = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setShowCompanyForm(false)
      addToast('success', '회사가 추가되었습니다.')
    },
  })

  const updateCompanyMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CompanyInput> }) => updateCompany(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setEditingCompanyId(null)
      addToast('success', '회사 정보가 수정되었습니다.')
    },
  })

  const deleteCompanyMut = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      addToast('success', '회사가 삭제되었습니다.')
    },
  })

  const createInvestmentMut = useMutation({
    mutationFn: createInvestment,
    onSuccess: (created: { id: number }) => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      setShowInvestmentForm(false)
      addToast('success', '투자가 등록되었습니다.')
      navigate(`/investments/${created.id}`)
    },
  })

  const handleCreateInvestment = async (
    investment: InvestmentInput,
    newCompany?: { name: string; business_number?: string | null; ceo?: string | null },
  ) => {
    let companyId = investment.company_id

    if (companyId === -1) {
      const companyName = newCompany?.name?.trim() || ''
      if (!companyName) return

      const company = await createCompany({
        name: companyName,
        business_number: newCompany?.business_number?.trim() || null,
        ceo: newCompany?.ceo?.trim() || null,
        address: null,
        industry: null,
        vics_registered: false,
        corp_number: null,
        founded_date: null,
        analyst: null,
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        memo: null,
      })
      companyId = company.id
      queryClient.invalidateQueries({ queryKey: ['companies'] })
    }

    await createInvestmentMut.mutateAsync({
      ...investment,
      company_id: companyId,
    })
  }

  return (
    <div className="p-6 max-w-7xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-5">투자 관리</h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">포트폴리오 회사</h3>
              <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowCompanyForm(v => !v)}>+ 회사</button>
            </div>
            {showCompanyForm && (
              <CompanyForm
                initial={EMPTY_COMPANY}
                loading={createCompanyMut.isPending}
                onSubmit={data => createCompanyMut.mutate(data)}
                onCancel={() => setShowCompanyForm(false)}
              />
            )}
            <div className="space-y-2 max-h-72 overflow-auto">
              {companies?.map((company) => (
                <div key={company.id} className="p-2 border rounded">
                  {editingCompanyId === company.id ? (
                    <CompanyForm
                      initial={company}
                      loading={updateCompanyMut.isPending}
                      onSubmit={data => updateCompanyMut.mutate({ id: company.id, data })}
                      onCancel={() => setEditingCompanyId(null)}
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{company.name}</p>
                        <div className="flex gap-1">
                          <button className="text-xs px-2 py-0.5 bg-gray-100 rounded" onClick={() => setEditingCompanyId(company.id)}>수정</button>
                          <button
                            className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded"
                            onClick={() => {
                              if (confirm('이 회사를 삭제하시겠습니까?')) {
                                deleteCompanyMut.mutate(company.id)
                              }
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {company.industry || '-'} | 대표 {company.ceo || '-'} | 담당 {company.analyst || '-'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        담당자 {company.contact_name || '-'} | {company.contact_email || '-'} | {company.contact_phone || '-'}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">투자 목록</h3>
            <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowInvestmentForm(v => !v)}>+ 투자</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={fundFilter} onChange={e => setFundFilter(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
              <option value="">전체 조합</option>
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-2 py-1 text-sm border rounded">
              <option value="">전체 상태</option>
              <option value="active">{labelStatus('active')}</option>
              <option value="exited">{labelStatus('exited')}</option>
              <option value="written_off">{labelStatus('written_off')}</option>
            </select>
          </div>

          {showInvestmentForm && (
            <InvestmentForm
              funds={funds || []}
              companies={companies || []}
              initial={EMPTY_INVESTMENT}
              submitting={createInvestmentMut.isPending}
              onSubmit={handleCreateInvestment}
              onCancel={() => setShowInvestmentForm(false)}
            />
          )}

          {invLoading ? <p className="text-sm text-gray-500">불러오는 중...</p> : (
            <div className="space-y-2 max-h-[38rem] overflow-auto">
              {investments?.map((inv) => (
                <div key={inv.id} className="w-full rounded border p-3 text-left hover:bg-gray-50">
                  <div className="flex items-center gap-1 text-sm">
                    {inv.fund_id ? (
                      <button
                        onClick={() => navigate(`/funds/${inv.fund_id}`)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {inv.fund_name || `조합 #${inv.fund_id}`}
                      </button>
                    ) : (
                      <span className="font-medium text-gray-700">{inv.fund_name || '-'}</span>
                    )}
                    <span className="text-gray-400">|</span>
                    <button
                      onClick={() => navigate(`/investments/${inv.id}`)}
                      className="font-medium text-gray-800 hover:text-blue-600"
                    >
                      {inv.company_name || `투자 #${inv.id}`}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {inv.instrument || '-'} | {inv.amount?.toLocaleString?.() ?? '-'} | {labelStatus(inv.status || 'active')}
                  </p>
                </div>
              ))}
              {!investments?.length && <p className="text-sm text-gray-400">투자 건이 없습니다.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InvestmentForm({
  funds,
  companies,
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  funds: Fund[]
  companies: Company[]
  initial: InvestmentInput
  submitting?: boolean
  onSubmit: (
    data: InvestmentInput,
    newCompany?: { name: string; business_number?: string | null; ceo?: string | null },
  ) => Promise<void> | void
  onCancel: () => void
}) {
  const [form, setForm] = useState<InvestmentInput>(initial)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyBizNum, setNewCompanyBizNum] = useState('')
  const [newCompanyCeo, setNewCompanyCeo] = useState('')

  return (
    <div className="grid grid-cols-1 gap-2 rounded border bg-gray-50 p-2 md:grid-cols-3">
      <select value={form.fund_id || ''} onChange={e => setForm(prev => ({ ...prev, fund_id: Number(e.target.value) }))} className="px-2 py-1 text-sm border rounded"><option value="">조합 선택</option>{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select>
      <select value={form.company_id || ''} onChange={e => setForm(prev => ({ ...prev, company_id: Number(e.target.value) }))} className="px-2 py-1 text-sm border rounded">
        <option value="">회사 선택</option>
        <option value={-1}>+ 새 회사 추가</option>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      <input type="date" value={form.investment_date || ''} onChange={e => setForm(prev => ({ ...prev, investment_date: e.target.value }))} className="px-2 py-1 text-sm border rounded" />

      {form.company_id === -1 && (
        <div className="md:col-span-3 rounded border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-700 mb-2">새 회사 정보</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="회사명" className="px-2 py-1 text-sm border rounded" />
            <input value={newCompanyBizNum} onChange={e => setNewCompanyBizNum(e.target.value)} placeholder="사업자번호" className="px-2 py-1 text-sm border rounded" />
            <input value={newCompanyCeo} onChange={e => setNewCompanyCeo(e.target.value)} placeholder="대표자" className="px-2 py-1 text-sm border rounded" />
          </div>
        </div>
      )}

      <input type="number" value={form.amount ?? ''} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value ? Number(e.target.value) : null }))} placeholder="투자금액" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.shares ?? ''} onChange={e => setForm(prev => ({ ...prev, shares: e.target.value ? Number(e.target.value) : null }))} placeholder="주식 수" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.share_price ?? ''} onChange={e => setForm(prev => ({ ...prev, share_price: e.target.value ? Number(e.target.value) : null }))} placeholder="주당 가격" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.valuation ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation: e.target.value ? Number(e.target.value) : null }))} placeholder="밸류에이션" className="px-2 py-1 text-sm border rounded" />
      <input value={form.round || ''} onChange={e => setForm(prev => ({ ...prev, round: e.target.value }))} placeholder="투자 라운드" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.valuation_pre ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_pre: e.target.value ? Number(e.target.value) : null }))} placeholder="프리머니 밸류" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.valuation_post ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_post: e.target.value ? Number(e.target.value) : null }))} placeholder="포스트머니 밸류" className="px-2 py-1 text-sm border rounded" />
      <input type="number" step="0.01" value={form.ownership_pct ?? ''} onChange={e => setForm(prev => ({ ...prev, ownership_pct: e.target.value ? Number(e.target.value) : null }))} placeholder="지분율(%)" className="px-2 py-1 text-sm border rounded" />
      <input value={form.board_seat || ''} onChange={e => setForm(prev => ({ ...prev, board_seat: e.target.value }))} placeholder="이사회 참여" className="px-2 py-1 text-sm border rounded" />
      <input value={form.contribution_rate || ''} onChange={e => setForm(prev => ({ ...prev, contribution_rate: e.target.value }))} placeholder="기존 지분율" className="px-2 py-1 text-sm border rounded" />
      <input value={form.instrument || ''} onChange={e => setForm(prev => ({ ...prev, instrument: e.target.value }))} placeholder="투자수단" className="px-2 py-1 text-sm border rounded" />
      <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태(예: active)" className="px-2 py-1 text-sm border rounded" />

      <div className="md:col-span-3 flex gap-2">
        <button
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded disabled:bg-gray-300"
          disabled={submitting}
          onClick={() => {
            if (!form.fund_id || !form.company_id) return
            if (form.company_id === -1 && !newCompanyName.trim()) return
            onSubmit(
              {
                ...form,
                investment_date: form.investment_date || null,
                round: form.round?.trim() || null,
                board_seat: form.board_seat?.trim() || null,
                contribution_rate: form.contribution_rate?.trim() || null,
                instrument: form.instrument?.trim() || null,
              },
              form.company_id === -1
                ? {
                    name: newCompanyName,
                    business_number: newCompanyBizNum,
                    ceo: newCompanyCeo,
                  }
                : undefined,
            )
          }}
        >
          저장
        </button>
        <button className="px-3 py-1 text-xs bg-white border rounded" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}


