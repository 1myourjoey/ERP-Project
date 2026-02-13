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
  fund_name?: string
  company_name?: string
  investment_date?: string | null
  amount?: number | null
  instrument?: string | null
  status?: string
}

const EMPTY_COMPANY: CompanyInput = { name: '', business_number: '', ceo: '', address: '', industry: '', vics_registered: false }
const EMPTY_INVESTMENT: InvestmentInput = { fund_id: 0, company_id: 0, investment_date: '', amount: null, shares: null, share_price: null, valuation: null, contribution_rate: '', instrument: '', status: 'active' }

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

  const companyForm = (initial: CompanyInput, onSubmit: (data: CompanyInput) => void, onCancel: () => void) => {
    const state = initial
    return (
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-2 border rounded bg-slate-50">
        <input defaultValue={state.name} placeholder="회사명" className="px-2 py-1 text-sm border rounded" id="company_name" />
        <input defaultValue={state.business_number || ''} placeholder="사업자번호" className="px-2 py-1 text-sm border rounded" id="company_bn" />
        <input defaultValue={state.ceo || ''} placeholder="CEO" className="px-2 py-1 text-sm border rounded" id="company_ceo" />
        <input defaultValue={state.industry || ''} placeholder="업종" className="px-2 py-1 text-sm border rounded" id="company_industry" />
        <input defaultValue={state.address || ''} placeholder="주소" className="px-2 py-1 text-sm border rounded" id="company_addr" />
        <label className="flex items-center gap-2 text-sm px-2 py-1 border rounded bg-white"><input type="checkbox" defaultChecked={!!state.vics_registered} id="company_vics" /> VICS</label>
        <div className="md:col-span-6 flex gap-2">
          <button className="px-3 py-1 text-xs bg-blue-600 text-white rounded" onClick={() => {
            const payload: CompanyInput = {
              name: (document.getElementById('company_name') as HTMLInputElement).value.trim(),
              business_number: (document.getElementById('company_bn') as HTMLInputElement).value.trim() || null,
              ceo: (document.getElementById('company_ceo') as HTMLInputElement).value.trim() || null,
              industry: (document.getElementById('company_industry') as HTMLInputElement).value.trim() || null,
              address: (document.getElementById('company_addr') as HTMLInputElement).value.trim() || null,
              vics_registered: (document.getElementById('company_vics') as HTMLInputElement).checked,
            }
            if (!payload.name) return
            onSubmit(payload)
          }}>저장</button>
          <button className="px-3 py-1 text-xs bg-white border rounded" onClick={onCancel}>취소</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">투자 관리</h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">포트폴리오 회사</h3>
              <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowCompanyForm(v => !v)}>+ 회사</button>
            </div>
            {showCompanyForm && companyForm(EMPTY_COMPANY, d => createCompanyMut.mutate(d), () => setShowCompanyForm(false))}
            <div className="space-y-2 max-h-72 overflow-auto">
              {companies?.map((c) => (
                <div key={c.id} className="p-2 border rounded">
                  {editingCompanyId === c.id ? (
                    companyForm(c, d => updateCompanyMut.mutate({ id: c.id, data: d }), () => setEditingCompanyId(null))
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800">{c.name}</p>
                        <div className="flex gap-1">
                          <button className="text-xs px-2 py-0.5 bg-slate-100 rounded" onClick={() => setEditingCompanyId(c.id)}>수정</button>
                          <button className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded" onClick={() => { if (confirm('이 회사를 삭제하시겠습니까?')) deleteCompanyMut.mutate(c.id) }}>삭제</button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{c.industry || '-'} | 대표 {c.ceo || '-'} | VICS {c.vics_registered ? 'Y' : 'N'}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">투자 목록</h3>
            <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowInvestmentForm(v => !v)}>+ 투자</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={fundFilter} onChange={e => setFundFilter(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
              <option value="">전체 조합</option>
              {funds?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
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
              onSubmit={d => createInvestmentMut.mutate(d)}
              onCancel={() => setShowInvestmentForm(false)}
            />
          )}

          {invLoading ? <p className="text-sm text-slate-500">불러오는 중...</p> : (
            <div className="space-y-2 max-h-[38rem] overflow-auto">
              {investments?.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => navigate(`/investments/${inv.id}`)}
                  className="w-full text-left p-3 border rounded hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-800">{inv.company_name || `투자 #${inv.id}`}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {inv.fund_name || '-'} | {inv.instrument || '-'} | {inv.amount?.toLocaleString?.() ?? '-'} | {labelStatus(inv.status || 'active')}
                  </p>
                </button>
              ))}
              {!investments?.length && <p className="text-sm text-slate-400">투자 건이 없습니다.</p>}
            </div>
          )}
        </div>
      </div>
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
