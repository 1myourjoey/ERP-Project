import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchFunds,
  fetchCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  fetchInvestments,
  fetchInvestment,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  createInvestmentDocument,
  updateInvestmentDocument,
  deleteInvestmentDocument,
  type CompanyInput,
  type InvestmentInput,
  type InvestmentDocumentInput,
} from '../lib/api'

const EMPTY_COMPANY: CompanyInput = {
  name: '',
  business_number: '',
  ceo: '',
  address: '',
  industry: '',
  vics_registered: false,
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
}

const EMPTY_DOC: InvestmentDocumentInput = {
  name: '',
  doc_type: '',
  status: 'pending',
  note: '',
}

export default function InvestmentsPage() {
  const queryClient = useQueryClient()
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<number | null>(null)
  const [fundFilter, setFundFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState('')

  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null)
  const [showInvestmentForm, setShowInvestmentForm] = useState(false)
  const [editingInvestment, setEditingInvestment] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [editingDocId, setEditingDocId] = useState<number | null>(null)

  const { data: funds } = useQuery({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: fetchCompanies })

  const investmentParams = useMemo(
    () => ({ fund_id: fundFilter === '' ? undefined : fundFilter, status: statusFilter || undefined }),
    [fundFilter, statusFilter],
  )

  const { data: investments, isLoading: invLoading } = useQuery({
    queryKey: ['investments', investmentParams],
    queryFn: () => fetchInvestments(investmentParams),
  })

  const { data: selectedInvestment } = useQuery({
    queryKey: ['investment', selectedInvestmentId],
    queryFn: () => fetchInvestment(selectedInvestmentId as number),
    enabled: !!selectedInvestmentId,
  })

  const createCompanyMut = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setShowCompanyForm(false)
    },
  })

  const updateCompanyMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CompanyInput> }) => updateCompany(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setEditingCompanyId(null)
    },
  })

  const deleteCompanyMut = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  })

  const createInvestmentMut = useMutation({
    mutationFn: createInvestment,
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      setSelectedInvestmentId(created.id)
      setShowInvestmentForm(false)
    },
  })

  const updateInvestmentMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InvestmentInput> }) => updateInvestment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvestmentId] })
      setEditingInvestment(false)
    },
  })

  const deleteInvestmentMut = useMutation({
    mutationFn: deleteInvestment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      setSelectedInvestmentId(null)
    },
  })

  const createDocMut = useMutation({
    mutationFn: ({ investmentId, data }: { investmentId: number; data: InvestmentDocumentInput }) =>
      createInvestmentDocument(investmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvestmentId] })
      setShowDocForm(false)
    },
  })

  const updateDocMut = useMutation({
    mutationFn: ({ investmentId, docId, data }: { investmentId: number; docId: number; data: Partial<InvestmentDocumentInput> }) =>
      updateInvestmentDocument(investmentId, docId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvestmentId] })
      setEditingDocId(null)
    },
  })

  const deleteDocMut = useMutation({
    mutationFn: ({ investmentId, docId }: { investmentId: number; docId: number }) =>
      deleteInvestmentDocument(investmentId, docId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investment', selectedInvestmentId] }),
  })

  const companyForm = (initial: CompanyInput, onSubmit: (data: CompanyInput) => void, onCancel: () => void) => {
    let state = initial
    return (
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-2 border rounded bg-slate-50">
        <input defaultValue={state.name} placeholder="기업명" className="px-2 py-1 text-sm border rounded" id="company_name" />
        <input defaultValue={state.business_number || ''} placeholder="사업자번호" className="px-2 py-1 text-sm border rounded" id="company_bn" />
        <input defaultValue={state.ceo || ''} placeholder="대표" className="px-2 py-1 text-sm border rounded" id="company_ceo" />
        <input defaultValue={state.industry || ''} placeholder="업종" className="px-2 py-1 text-sm border rounded" id="company_industry" />
        <input defaultValue={state.address || ''} placeholder="주소" className="px-2 py-1 text-sm border rounded" id="company_addr" />
        <label className="flex items-center gap-2 text-sm px-2 py-1 border rounded bg-white">
          <input type="checkbox" defaultChecked={!!state.vics_registered} id="company_vics" /> VICS
        </label>
        <div className="md:col-span-6 flex gap-2">
          <button
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded"
            onClick={() => {
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
            }}
          >저장</button>
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
              <h3 className="font-semibold text-slate-800">포트폴리오 기업</h3>
              <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowCompanyForm(v => !v)}>+ 기업</button>
            </div>
            {showCompanyForm && companyForm(EMPTY_COMPANY, d => createCompanyMut.mutate(d), () => setShowCompanyForm(false))}

            <div className="space-y-2 max-h-72 overflow-auto">
              {companies?.map((c: any) => (
                <div key={c.id} className="p-2 border rounded">
                  {editingCompanyId === c.id ? (
                    companyForm(c, d => updateCompanyMut.mutate({ id: c.id, data: d }), () => setEditingCompanyId(null))
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800">{c.name}</p>
                        <div className="flex gap-1">
                          <button className="text-xs px-2 py-0.5 bg-slate-100 rounded" onClick={() => setEditingCompanyId(c.id)}>수정</button>
                          <button
                            className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded"
                            onClick={() => { if (confirm('기업을 삭제할까요?')) deleteCompanyMut.mutate(c.id) }}
                          >삭제</button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{c.industry || '-'} | CEO {c.ceo || '-'} | VICS {c.vics_registered ? 'Y' : 'N'}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">투자 목록</h3>
              <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowInvestmentForm(v => !v)}>+ 투자</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select value={fundFilter} onChange={e => setFundFilter(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 text-sm border rounded">
                <option value="">전체 펀드</option>
                {funds?.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-2 py-1 text-sm border rounded">
                <option value="">전체 상태</option>
                <option value="active">active</option>
                <option value="collected">collected</option>
                <option value="exited">exited</option>
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

            {invLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {investments?.map((inv: any) => (
                  <button
                    key={inv.id}
                    onClick={() => { setSelectedInvestmentId(inv.id); setEditingInvestment(false) }}
                    className={`w-full text-left p-2 border rounded ${selectedInvestmentId === inv.id ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
                  >
                    <p className="text-sm font-medium text-slate-800">{inv.company_name}</p>
                    <p className="text-xs text-slate-500">{inv.fund_name} | {inv.instrument || '-'} | {inv.amount?.toLocaleString?.() ?? '-'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-2">
          {!selectedInvestment || !selectedInvestmentId ? (
            <div className="bg-white border rounded-xl p-4 text-sm text-slate-500">투자건을 선택하세요.</div>
          ) : (
            <div className="bg-white border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">투자 상세 #{selectedInvestment.id}</h3>
                <div className="flex gap-2">
                  <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => setEditingInvestment(v => !v)}>{editingInvestment ? '취소' : '수정'}</button>
                  <button
                    className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded"
                    onClick={() => { if (confirm('투자건을 삭제할까요?')) deleteInvestmentMut.mutate(selectedInvestmentId) }}
                  >삭제</button>
                </div>
              </div>

              {editingInvestment ? (
                <InvestmentForm
                  funds={funds || []}
                  companies={companies || []}
                  initial={{ ...selectedInvestment, investment_date: selectedInvestment.investment_date || '' }}
                  onSubmit={d => updateInvestmentMut.mutate({ id: selectedInvestmentId, data: d })}
                  onCancel={() => setEditingInvestment(false)}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  <div className="p-2 bg-slate-50 rounded">fund_id: {selectedInvestment.fund_id}</div>
                  <div className="p-2 bg-slate-50 rounded">company_id: {selectedInvestment.company_id}</div>
                  <div className="p-2 bg-slate-50 rounded">date: {selectedInvestment.investment_date || '-'}</div>
                  <div className="p-2 bg-slate-50 rounded">amount: {selectedInvestment.amount?.toLocaleString?.() ?? '-'}</div>
                  <div className="p-2 bg-slate-50 rounded">shares: {selectedInvestment.shares ?? '-'}</div>
                  <div className="p-2 bg-slate-50 rounded">share_price: {selectedInvestment.share_price?.toLocaleString?.() ?? '-'}</div>
                  <div className="p-2 bg-slate-50 rounded">valuation: {selectedInvestment.valuation?.toLocaleString?.() ?? '-'}</div>
                  <div className="p-2 bg-slate-50 rounded">contribution: {selectedInvestment.contribution_rate || '-'}</div>
                  <div className="p-2 bg-slate-50 rounded">instrument: {selectedInvestment.instrument || '-'}</div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-700">서류 관리</h4>
                  <button className="text-xs px-2 py-1 bg-blue-600 text-white rounded" onClick={() => setShowDocForm(v => !v)}>+ 서류</button>
                </div>

                {showDocForm && (
                  <DocumentForm
                    initial={EMPTY_DOC}
                    onSubmit={d => createDocMut.mutate({ investmentId: selectedInvestmentId, data: d })}
                    onCancel={() => setShowDocForm(false)}
                  />
                )}

                <div className="space-y-2">
                  {selectedInvestment.documents?.length ? selectedInvestment.documents.map((doc: any) => (
                    <div key={doc.id} className="border rounded p-2">
                      {editingDocId === doc.id ? (
                        <DocumentForm
                          initial={doc}
                          onSubmit={d => updateDocMut.mutate({ investmentId: selectedInvestmentId, docId: doc.id, data: d })}
                          onCancel={() => setEditingDocId(null)}
                        />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{doc.name}</p>
                            <p className="text-xs text-slate-500">{doc.doc_type || '-'} | {doc.status} | {doc.note || '-'}</p>
                          </div>
                          <div className="flex gap-1">
                            <button className="text-xs px-2 py-0.5 bg-slate-100 rounded" onClick={() => setEditingDocId(doc.id)}>수정</button>
                            <button
                              className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded"
                              onClick={() => { if (confirm('서류를 삭제할까요?')) deleteDocMut.mutate({ investmentId: selectedInvestmentId, docId: doc.id }) }}
                            >삭제</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )) : <p className="text-sm text-slate-400">등록된 서류가 없습니다.</p>}
                </div>
              </div>
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
  onSubmit,
  onCancel,
}: {
  funds: any[]
  companies: any[]
  initial: any
  onSubmit: (data: InvestmentInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<InvestmentInput>(initial)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border rounded p-2 bg-slate-50">
      <select value={form.fund_id || ''} onChange={e => setForm(prev => ({ ...prev, fund_id: Number(e.target.value) }))} className="px-2 py-1 text-sm border rounded">
        <option value="">펀드 선택</option>
        {funds.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <select value={form.company_id || ''} onChange={e => setForm(prev => ({ ...prev, company_id: Number(e.target.value) }))} className="px-2 py-1 text-sm border rounded">
        <option value="">기업 선택</option>
        {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input type="date" value={form.investment_date || ''} onChange={e => setForm(prev => ({ ...prev, investment_date: e.target.value }))} className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.amount ?? ''} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value ? Number(e.target.value) : null }))} placeholder="금액" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.shares ?? ''} onChange={e => setForm(prev => ({ ...prev, shares: e.target.value ? Number(e.target.value) : null }))} placeholder="주식수" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.share_price ?? ''} onChange={e => setForm(prev => ({ ...prev, share_price: e.target.value ? Number(e.target.value) : null }))} placeholder="주당가격" className="px-2 py-1 text-sm border rounded" />
      <input type="number" value={form.valuation ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation: e.target.value ? Number(e.target.value) : null }))} placeholder="밸류에이션" className="px-2 py-1 text-sm border rounded" />
      <input value={form.contribution_rate || ''} onChange={e => setForm(prev => ({ ...prev, contribution_rate: e.target.value }))} placeholder="기여율" className="px-2 py-1 text-sm border rounded" />
      <input value={form.instrument || ''} onChange={e => setForm(prev => ({ ...prev, instrument: e.target.value }))} placeholder="투자유형" className="px-2 py-1 text-sm border rounded" />
      <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태" className="px-2 py-1 text-sm border rounded" />
      <div className="md:col-span-3 flex gap-2">
        <button
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded"
          onClick={() => {
            if (!form.fund_id || !form.company_id) return
            onSubmit({ ...form, investment_date: form.investment_date || null })
          }}
        >저장</button>
        <button className="px-3 py-1 text-xs bg-white border rounded" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

function DocumentForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: any
  onSubmit: (data: InvestmentDocumentInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<InvestmentDocumentInput>(initial)
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border rounded p-2 bg-slate-50 mb-2">
      <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="서류명" className="px-2 py-1 text-sm border rounded" />
      <input value={form.doc_type || ''} onChange={e => setForm(prev => ({ ...prev, doc_type: e.target.value }))} placeholder="유형" className="px-2 py-1 text-sm border rounded" />
      <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태" className="px-2 py-1 text-sm border rounded" />
      <input value={form.note || ''} onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))} placeholder="비고" className="px-2 py-1 text-sm border rounded" />
      <div className="md:col-span-4 flex gap-2">
        <button className="px-3 py-1 text-xs bg-blue-600 text-white rounded" onClick={() => { if (form.name.trim()) onSubmit({ ...form, name: form.name.trim() }) }}>저장</button>
        <button className="px-3 py-1 text-xs bg-white border rounded" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
