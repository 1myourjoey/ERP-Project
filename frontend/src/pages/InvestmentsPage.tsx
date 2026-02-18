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
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'

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

function investmentStatusTagClass(status: string | undefined): string {
  switch (status) {
    case 'exited':
      return 'tag tag-green'
    case 'written_off':
      return 'tag tag-gray'
    case 'active':
    default:
      return 'tag tag-blue'
  }
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

const INSTRUMENT_OPTIONS = [
  '보통주',
  '우선주',
  '전환사채(CB)',
  '신주인수권부사채(BW)',
  '상환전환우선주(RCPS)',
  '전환우선주(CPS)',
  '교환사채(EB)',
  '메자닌',
  '직접대출',
]

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
      <div><label className="mb-1 block text-xs font-medium text-gray-600">회사명</label><input value={form.name || ''} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="예: 주식회사 OOO" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">사업자번호</label><input value={form.business_number || ''} onChange={e => setForm(prev => ({ ...prev, business_number: e.target.value }))} placeholder="예: 123-45-67890" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">법인등록번호</label><input value={form.corp_number || ''} onChange={e => setForm(prev => ({ ...prev, corp_number: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">설립일</label><input type="date" value={form.founded_date || ''} onChange={e => setForm(prev => ({ ...prev, founded_date: e.target.value }))} className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">대표자</label><input value={form.ceo || ''} onChange={e => setForm(prev => ({ ...prev, ceo: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">담당 심사역</label><input value={form.analyst || ''} onChange={e => setForm(prev => ({ ...prev, analyst: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">업종</label><input value={form.industry || ''} onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">주소</label><input value={form.address || ''} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">담당자명</label><input value={form.contact_name || ''} onChange={e => setForm(prev => ({ ...prev, contact_name: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">이메일</label><input value={form.contact_email || ''} onChange={e => setForm(prev => ({ ...prev, contact_email: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">전화번호</label><input value={form.contact_phone || ''} onChange={e => setForm(prev => ({ ...prev, contact_phone: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <label className="flex items-center gap-2 text-sm px-2 py-1 border rounded bg-white">
        <input type="checkbox" checked={!!form.vics_registered} onChange={e => setForm(prev => ({ ...prev, vics_registered: e.target.checked }))} />
        VICS 등록
      </label>
      <div className="md:col-span-6">
        <label className="mb-1 block text-xs font-medium text-gray-600">비고</label>
        <textarea value={form.memo || ''} onChange={e => setForm(prev => ({ ...prev, memo: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded resize-none" rows={2} />
      </div>
      <div className="md:col-span-6 flex gap-2">
        <button
          className="primary-btn"
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
        <button className="secondary-btn" onClick={onCancel}>취소</button>
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
  })

  const handleCreateInvestment = async (
    investment: InvestmentInput,
    newCompany?: { name: string; business_number?: string | null; ceo?: string | null },
    instrumentEntries?: Array<{ instrument: string; amount: number }>,
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

    const entries =
      instrumentEntries && instrumentEntries.length > 0
        ? instrumentEntries
        : [{ instrument: investment.instrument || '', amount: Number(investment.amount || 0) }]

    const validEntries = entries.filter((entry) => entry.instrument.trim() && entry.amount > 0)
    if (!validEntries.length) return

    let firstCreatedId: number | null = null
    for (const entry of validEntries) {
      const created = await createInvestmentMut.mutateAsync({
        ...investment,
        company_id: companyId,
        instrument: entry.instrument,
        amount: entry.amount,
      })
      if (firstCreatedId == null) {
        firstCreatedId = created.id
      }
    }

    queryClient.invalidateQueries({ queryKey: ['investments'] })
    setShowInvestmentForm(false)
    addToast('success', validEntries.length > 1 ? `투자 ${validEntries.length}건이 등록되었습니다.` : '투자가 등록되었습니다.')
    if (firstCreatedId != null) {
      navigate(`/investments/${firstCreatedId}`)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
      <h2 className="page-title">🏢 투자 관리</h2>
          <p className="page-subtitle">투자 포트폴리오와 기업 정보를 관리합니다.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 space-y-4">
          <div className="card-base space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">포트폴리오 회사</h3>
              <button className="primary-btn" onClick={() => setShowCompanyForm(v => !v)}>+ 회사</button>
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
                          <button className="secondary-btn" onClick={() => setEditingCompanyId(company.id)}>수정</button>
                          <button
                            className="danger-btn"
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

        <div className="xl:col-span-2 card-base space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">투자 목록</h3>
            <button className="primary-btn" onClick={() => setShowInvestmentForm(v => !v)}>+ 투자</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
              <select value={fundFilter} onChange={e => setFundFilter(e.target.value ? Number(e.target.value) : '')} className="w-full px-2 py-1 text-sm border rounded">
                <option value="">전체 조합</option>
                {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full px-2 py-1 text-sm border rounded">
                <option value="">전체 상태</option>
                <option value="active">{labelStatus('active')}</option>
                <option value="exited">{labelStatus('exited')}</option>
                <option value="written_off">{labelStatus('written_off')}</option>
              </select>
            </div>
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

          {invLoading ? <PageLoading /> : (
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
                    {inv.instrument || '-'} | {inv.amount?.toLocaleString?.() ?? '-'} |{' '}
                    <span className={investmentStatusTagClass(inv.status || 'active')}>
                      {labelStatus(inv.status || 'active')}
                    </span>
                  </p>
                </div>
              ))}
              {!investments?.length && (
                <EmptyState
                  emoji="🏢"
                  message="등록된 투자건이 없어요"
                  action={() => setShowInvestmentForm(true)}
                  actionLabel="투자 등록"
                  className="py-8"
                />
              )}
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
    instrumentEntries?: Array<{ instrument: string; amount: number }>,
  ) => Promise<void> | void
  onCancel: () => void
}) {
  const [form, setForm] = useState<InvestmentInput>(initial)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyBizNum, setNewCompanyBizNum] = useState('')
  const [newCompanyCeo, setNewCompanyCeo] = useState('')
  const [instrumentEntries, setInstrumentEntries] = useState<Array<{ instrument: string; amount: number | '' }>>([
    { instrument: '', amount: '' },
  ])

  return (
    <div className="grid grid-cols-1 gap-2 rounded border bg-gray-50 p-2 md:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
        <select value={form.fund_id || ''} onChange={e => setForm(prev => ({ ...prev, fund_id: Number(e.target.value) }))} className="w-full px-2 py-1 text-sm border rounded"><option value="">조합 선택</option>{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">회사</label>
        <select value={form.company_id || ''} onChange={e => setForm(prev => ({ ...prev, company_id: Number(e.target.value) }))} className="w-full px-2 py-1 text-sm border rounded">
          <option value="">회사 선택</option>
          <option value={-1}>+ 새 회사 추가</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">투자일</label>
        <input type="date" value={form.investment_date || ''} onChange={e => setForm(prev => ({ ...prev, investment_date: e.target.value }))} className="w-full px-2 py-1 text-sm border rounded" />
      </div>

      {form.company_id === -1 && (
        <div className="md:col-span-3 rounded border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-700 mb-2">새 회사 정보</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-600">회사명</label><input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="예: 주식회사 OOO" className="w-full px-2 py-1 text-sm border rounded" /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-600">사업자번호</label><input value={newCompanyBizNum} onChange={e => setNewCompanyBizNum(e.target.value)} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-600">대표자</label><input value={newCompanyCeo} onChange={e => setNewCompanyCeo(e.target.value)} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
          </div>
        </div>
      )}

      <div><label className="mb-1 block text-xs font-medium text-gray-600">주식 수</label><input type="number" value={form.shares ?? ''} onChange={e => setForm(prev => ({ ...prev, shares: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">주당 가격</label><input type="number" value={form.share_price ?? ''} onChange={e => setForm(prev => ({ ...prev, share_price: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">밸류에이션</label><input type="number" value={form.valuation ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">투자 라운드</label><input value={form.round || ''} onChange={e => setForm(prev => ({ ...prev, round: e.target.value }))} placeholder="예: Series A" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">프리머니 밸류</label><input type="number" value={form.valuation_pre ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_pre: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">포스트머니 밸류</label><input type="number" value={form.valuation_post ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_post: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">지분율(%)</label><input type="number" step="0.01" value={form.ownership_pct ?? ''} onChange={e => setForm(prev => ({ ...prev, ownership_pct: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">이사회 참여</label><input value={form.board_seat || ''} onChange={e => setForm(prev => ({ ...prev, board_seat: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">기존 지분율</label><input value={form.contribution_rate || ''} onChange={e => setForm(prev => ({ ...prev, contribution_rate: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
        <select value={form.status || 'active'} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} className="w-full px-2 py-1 text-sm border rounded">
          <option value="active">{labelStatus('active')}</option>
          <option value="exited">{labelStatus('exited')}</option>
          <option value="written_off">{labelStatus('written_off')}</option>
        </select>
      </div>

      <div className="md:col-span-3 space-y-2 rounded border border-gray-200 bg-white p-2">
        <p className="text-xs font-medium text-gray-600">투자수단별 금액</p>
        {instrumentEntries.map((entry, index) => (
          <div key={`instrument-${index}`} className="flex items-center gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium text-gray-500">투자수단</label>
              <select
                value={entry.instrument}
                onChange={(e) =>
                  setInstrumentEntries((prev) =>
                    prev.map((row, rowIndex) => (rowIndex === index ? { ...row, instrument: e.target.value } : row)),
                  )
                }
                className="w-full px-2 py-1 text-sm border rounded"
              >
                <option value="">투자수단 선택</option>
                {INSTRUMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label className="mb-1 block text-[10px] font-medium text-gray-500">금액</label>
              <input
                type="number"
                value={entry.amount}
                onChange={(e) =>
                  setInstrumentEntries((prev) =>
                    prev.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, amount: e.target.value ? Number(e.target.value) : '' } : row,
                    ),
                  )
                }
                placeholder="숫자 입력"
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
            {index > 0 && (
              <button
                onClick={() => setInstrumentEntries((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setInstrumentEntries((prev) => [...prev, { instrument: '', amount: '' }])}
          className="text-xs text-blue-600 hover:underline"
        >
          + 투자수단 추가
        </button>
      </div>

      <div className="md:col-span-3 flex gap-2">
        <button
          className="primary-btn"
          disabled={submitting}
          onClick={() => {
            if (!form.fund_id || !form.company_id) return
            if (form.company_id === -1 && !newCompanyName.trim()) return
            const entries = instrumentEntries
              .map((entry) => ({
                instrument: entry.instrument.trim(),
                amount: Number(entry.amount || 0),
              }))
              .filter((entry) => entry.instrument && entry.amount > 0)
            if (!entries.length) return
            onSubmit(
              {
                ...form,
                investment_date: form.investment_date || null,
                round: form.round?.trim() || null,
                board_seat: form.board_seat?.trim() || null,
                contribution_rate: form.contribution_rate?.trim() || null,
                instrument: entries[0]?.instrument || null,
                amount: entries[0]?.amount || null,
              },
              form.company_id === -1
                ? {
                    name: newCompanyName,
                    business_number: newCompanyBizNum,
                    ceo: newCompanyCeo,
                  }
                : undefined,
              entries,
            )
          }}
        >
          저장
        </button>
        <button className="secondary-btn" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}











