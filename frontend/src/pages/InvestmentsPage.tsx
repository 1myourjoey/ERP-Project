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
import DrawerOverlay from '../components/common/DrawerOverlay'
import DataFilterBar from '../components/common/DataFilterBar'

interface InvestmentListItem {
  id: number
  fund_id?: number
  fund_name?: string
  company_name?: string
  investment_date?: string | null
  amount?: number | null
  valuation?: number | null
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
    <div className="grid grid-cols-1 gap-2 rounded border bg-gray-50 p-2 md:grid-cols-6">
      <div><label className="form-label">회사명</label><input value={form.name || ''} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="예: 주식회사 OOO" className="form-input" /></div>
      <div><label className="form-label">사업자번호</label><input value={form.business_number || ''} onChange={e => setForm(prev => ({ ...prev, business_number: e.target.value }))} placeholder="예: 123-45-67890" className="form-input" /></div>
      <div><label className="form-label">법인등록번호</label><input value={form.corp_number || ''} onChange={e => setForm(prev => ({ ...prev, corp_number: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">설립일</label><input type="date" value={form.founded_date || ''} onChange={e => setForm(prev => ({ ...prev, founded_date: e.target.value }))} className="form-input" /></div>
      <div><label className="form-label">대표자</label><input value={form.ceo || ''} onChange={e => setForm(prev => ({ ...prev, ceo: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">담당 심사역</label><input value={form.analyst || ''} onChange={e => setForm(prev => ({ ...prev, analyst: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">업종</label><input value={form.industry || ''} onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">주소</label><input value={form.address || ''} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">담당자명</label><input value={form.contact_name || ''} onChange={e => setForm(prev => ({ ...prev, contact_name: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">이메일</label><input value={form.contact_email || ''} onChange={e => setForm(prev => ({ ...prev, contact_email: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">전화번호</label><input value={form.contact_phone || ''} onChange={e => setForm(prev => ({ ...prev, contact_phone: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <label className="flex items-center gap-2 rounded border bg-white px-2 py-1 text-sm">
        <input type="checkbox" checked={!!form.vics_registered} onChange={e => setForm(prev => ({ ...prev, vics_registered: e.target.checked }))} />
        VICS 등록
      </label>
      <div className="md:col-span-6">
        <label className="form-label">비고</label>
        <textarea value={form.memo || ''} onChange={e => setForm(prev => ({ ...prev, memo: e.target.value }))} placeholder="선택 입력" className="form-input resize-none" rows={2} />
      </div>
      <div className="flex gap-2 md:col-span-6">
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
  const [searchKeyword, setSearchKeyword] = useState('')

  const [companyDrawerOpen, setCompanyDrawerOpen] = useState(false)
  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null)
  const [companySearch, setCompanySearch] = useState('')

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

  const filteredInvestments = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return investments ?? []
    return (investments ?? []).filter((inv) => {
      const source = [inv.fund_name, inv.company_name, inv.instrument].join(' ').toLowerCase()
      return source.includes(keyword)
    })
  }, [investments, searchKeyword])

  const filteredCompanies = useMemo(() => {
    const keyword = companySearch.trim().toLowerCase()
    if (!keyword) return companies ?? []
    return (companies ?? []).filter((company) => {
      const source = [
        company.name,
        company.industry,
        company.ceo,
        company.analyst,
        company.business_number,
      ]
        .join(' ')
        .toLowerCase()
      return source.includes(keyword)
    })
  }, [companies, companySearch])

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

  const handleCloseCompanyDrawer = () => {
    setCompanyDrawerOpen(false)
    setShowCompanyForm(false)
    setEditingCompanyId(null)
    setCompanySearch('')
  }

  return (
    <div className="page-container flex h-full min-h-0 flex-col gap-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">투자 포트폴리오</h2>
          <p className="page-subtitle">목록 모니터링은 이 화면에서, 상세 업무는 투자 통제실에서 처리합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-btn" onClick={() => setCompanyDrawerOpen(true)}>회사 관리</button>
          <button className="primary-btn" onClick={() => setShowInvestmentForm(true)}>+ 투자 등록</button>
        </div>
      </div>

      <DataFilterBar
        title="투자 필터"
        description="조합/상태/검색어로 포트폴리오를 빠르게 필터링합니다."
      >
        <div>
          <label className="form-label">조합</label>
          <select value={fundFilter} onChange={e => setFundFilter(e.target.value ? Number(e.target.value) : '')} className="form-input">
            <option value="">전체 조합</option>
            {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">상태</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input">
            <option value="">전체 상태</option>
            <option value="active">{labelStatus('active')}</option>
            <option value="exited">{labelStatus('exited')}</option>
            <option value="written_off">{labelStatus('written_off')}</option>
          </select>
        </div>
        <div>
          <label className="form-label">검색</label>
          <input
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            placeholder="조합명, 회사명, 투자수단"
            className="form-input"
          />
        </div>
      </DataFilterBar>

      <section className="card-base flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">투자 포트폴리오 그리드</h3>
          <span className="text-xs text-gray-500">총 {filteredInvestments.length}건</span>
        </div>

        {invLoading ? (
          <PageLoading />
        ) : filteredInvestments.length === 0 ? (
          <EmptyState
            emoji="INV"
            message="등록된 투자건이 없어요"
            action={() => setShowInvestmentForm(true)}
            actionLabel="투자 등록"
            className="py-10"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head-row sticky top-0 z-10">
                <tr>
                  <th className="table-head-cell">조합</th>
                  <th className="table-head-cell">회사</th>
                  <th className="table-head-cell">투자수단</th>
                  <th className="table-head-cell text-right">총 투자금</th>
                  <th className="table-head-cell text-right">현재 밸류</th>
                  <th className="table-head-cell text-right">수익률</th>
                  <th className="table-head-cell">상태</th>
                  <th className="table-head-cell">투자일</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvestments.map((inv) => {
                  const amount = Number(inv.amount || 0)
                  const valuation = Number(inv.valuation || 0)
                  const roi = amount > 0 && valuation > 0
                    ? ((valuation - amount) / amount) * 100
                    : null

                  return (
                    <tr
                      key={inv.id}
                      className="cursor-pointer border-b hover:bg-gray-50"
                      onClick={() => navigate(`/investments/${inv.id}`)}
                    >
                      <td className="table-body-cell text-gray-700">{inv.fund_name || '-'}</td>
                      <td className="table-body-cell font-medium text-gray-800">{inv.company_name || `투자 #${inv.id}`}</td>
                      <td className="table-body-cell text-gray-700">{inv.instrument || '-'}</td>
                      <td className="table-body-cell text-right text-gray-700">{inv.amount?.toLocaleString?.() ?? '-'}</td>
                      <td className="table-body-cell text-right text-gray-700">{inv.valuation?.toLocaleString?.() ?? '-'}</td>
                      <td className="table-body-cell text-right text-gray-700">{roi == null ? '-' : `${roi.toFixed(2)}%`}</td>
                      <td className="table-body-cell">
                        <span className={investmentStatusTagClass(inv.status || 'active')}>
                          {labelStatus(inv.status || 'active')}
                        </span>
                      </td>
                      <td className="table-body-cell text-gray-700">{inv.investment_date || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DrawerOverlay
        open={showInvestmentForm}
        onClose={() => setShowInvestmentForm(false)}
        title="투자 등록"
        widthClassName="w-full max-w-5xl"
      >
        <InvestmentForm
          funds={funds || []}
          companies={companies || []}
          initial={EMPTY_INVESTMENT}
          submitting={createInvestmentMut.isPending}
          onSubmit={handleCreateInvestment}
          onCancel={() => setShowInvestmentForm(false)}
        />
      </DrawerOverlay>

      <DrawerOverlay
        open={companyDrawerOpen}
        onClose={handleCloseCompanyDrawer}
        title="포트폴리오 회사 관리"
        widthClassName="w-full max-w-4xl"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className="primary-btn" onClick={() => setShowCompanyForm((prev) => !prev)}>
              {showCompanyForm ? '입력 닫기' : '+ 회사 추가'}
            </button>
            <input
              value={companySearch}
              onChange={(event) => setCompanySearch(event.target.value)}
              placeholder="회사명/업종/대표자 검색"
              className="form-input md:max-w-xs"
            />
          </div>

          {showCompanyForm && (
            <CompanyForm
              key="new-company-form"
              initial={EMPTY_COMPANY}
              loading={createCompanyMut.isPending}
              onSubmit={data => createCompanyMut.mutate(data)}
              onCancel={() => setShowCompanyForm(false)}
            />
          )}

          <div className="space-y-2">
            {filteredCompanies.map((company) => (
              <div key={company.id} className="rounded border p-2">
                {editingCompanyId === company.id ? (
                  <CompanyForm
                    key={`edit-company-${company.id}`}
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
                    <p className="mt-1 text-xs text-gray-500">
                      {company.industry || '-'} | 대표 {company.ceo || '-'} | 담당 {company.analyst || '-'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      담당자 {company.contact_name || '-'} | {company.contact_email || '-'} | {company.contact_phone || '-'}
                    </p>
                  </>
                )}
              </div>
            ))}
            {filteredCompanies.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">검색 조건에 맞는 회사가 없습니다.</p>
            )}
          </div>
        </div>
      </DrawerOverlay>
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
        <label className="form-label">조합</label>
        <select value={form.fund_id || ''} onChange={e => setForm(prev => ({ ...prev, fund_id: Number(e.target.value) }))} className="form-input"><option value="">조합 선택</option>{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select>
      </div>
      <div>
        <label className="form-label">회사</label>
        <select value={form.company_id || ''} onChange={e => setForm(prev => ({ ...prev, company_id: Number(e.target.value) }))} className="form-input">
          <option value="">회사 선택</option>
          <option value={-1}>+ 새 회사 추가</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">투자일</label>
        <input type="date" value={form.investment_date || ''} onChange={e => setForm(prev => ({ ...prev, investment_date: e.target.value }))} className="form-input" />
      </div>

      {form.company_id === -1 && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 md:col-span-3">
          <p className="mb-2 text-xs font-medium text-blue-700">새 회사 정보</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div><label className="form-label">회사명</label><input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="예: 주식회사 OOO" className="form-input" /></div>
            <div><label className="form-label">사업자번호</label><input value={newCompanyBizNum} onChange={e => setNewCompanyBizNum(e.target.value)} placeholder="선택 입력" className="form-input" /></div>
            <div><label className="form-label">대표자</label><input value={newCompanyCeo} onChange={e => setNewCompanyCeo(e.target.value)} placeholder="선택 입력" className="form-input" /></div>
          </div>
        </div>
      )}

      <div><label className="form-label">주식 수</label><input type="number" value={form.shares ?? ''} onChange={e => setForm(prev => ({ ...prev, shares: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="form-input" /></div>
      <div><label className="form-label">주당 가격</label><input type="number" value={form.share_price ?? ''} onChange={e => setForm(prev => ({ ...prev, share_price: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="form-input" /></div>
      <div><label className="form-label">밸류에이션</label><input type="number" value={form.valuation ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="form-input" /></div>
      <div><label className="form-label">투자 라운드</label><input value={form.round || ''} onChange={e => setForm(prev => ({ ...prev, round: e.target.value }))} placeholder="예: Series A" className="form-input" /></div>
      <div><label className="form-label">프리머니 밸류</label><input type="number" value={form.valuation_pre ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_pre: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="form-input" /></div>
      <div><label className="form-label">포스트머니 밸류</label><input type="number" value={form.valuation_post ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_post: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="form-input" /></div>
      <div><label className="form-label">지분율(%)</label><input type="number" step="0.01" value={form.ownership_pct ?? ''} onChange={e => setForm(prev => ({ ...prev, ownership_pct: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="form-input" /></div>
      <div><label className="form-label">이사회 참여</label><input value={form.board_seat || ''} onChange={e => setForm(prev => ({ ...prev, board_seat: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div><label className="form-label">기존 지분율</label><input value={form.contribution_rate || ''} onChange={e => setForm(prev => ({ ...prev, contribution_rate: e.target.value }))} placeholder="선택 입력" className="form-input" /></div>
      <div>
        <label className="form-label">상태</label>
        <select value={form.status || 'active'} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} className="form-input">
          <option value="active">{labelStatus('active')}</option>
          <option value="exited">{labelStatus('exited')}</option>
          <option value="written_off">{labelStatus('written_off')}</option>
        </select>
      </div>

      <div className="space-y-2 rounded border border-gray-200 bg-white p-2 md:col-span-3">
        <p className="text-xs font-medium text-gray-600">투자수단별 금액</p>
        {instrumentEntries.map((entry, index) => (
          <div key={`instrument-${index}`} className="flex items-center gap-2">
            <div className="flex-1">
              <label className="form-label text-[10px]">투자수단</label>
              <select
                value={entry.instrument}
                onChange={(e) =>
                  setInstrumentEntries((prev) =>
                    prev.map((row, rowIndex) => (rowIndex === index ? { ...row, instrument: e.target.value } : row)),
                  )
                }
                className="form-input"
              >
                <option value="">투자수단 선택</option>
                {INSTRUMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label className="form-label text-[10px]">금액</label>
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
                className="form-input"
              />
            </div>
            {index > 0 && (
              <button
                onClick={() => setInstrumentEntries((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                className="text-icon-btn text-red-600 hover:text-red-700"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setInstrumentEntries((prev) => [...prev, { instrument: '', amount: '' }])}
          className="text-icon-btn"
        >
          + 투자수단 추가
        </button>
      </div>

      <div className="flex gap-2 md:col-span-3">
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


