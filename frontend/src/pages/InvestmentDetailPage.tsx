import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchCompanies,
  fetchFunds,
  fetchInvestment,
  updateInvestment,
  deleteInvestment,
  createInvestmentDocument,
  updateInvestmentDocument,
  deleteInvestmentDocument,
  fetchVoteRecords,
  createVoteRecord,
  updateVoteRecord,
  deleteVoteRecord,
  fetchChecklists,
  fetchInvestmentValuations,
  createValuation,
  updateValuation,
  deleteValuation,
  fetchWorkflowInstances,
  type Company,
  type Fund,
  type InvestmentDocumentInput,
  type InvestmentInput,
  type VoteRecord,
  type VoteRecordInput,
  type Valuation,
  type ValuationInput,
  type WorkflowInstance,
  type ChecklistListItem,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import PageLoading from '../components/PageLoading'
import DrawerOverlay from '../components/common/DrawerOverlay'

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
  round?: string | null
  valuation_pre?: number | null
  valuation_post?: number | null
  ownership_pct?: number | null
  board_seat?: string | null
  documents?: InvestmentDocument[]
}

const EMPTY_DOC: InvestmentDocumentInput = { name: '', doc_type: '', status: 'pending', note: '', due_date: null }
const EMPTY_VALUATION: ValuationInput = {
  investment_id: 0,
  fund_id: 0,
  company_id: 0,
  as_of_date: '',
  evaluator: '',
  method: '',
  instrument: '',
  value: 0,
  prev_value: null,
  change_amount: null,
  change_pct: null,
  basis: '',
}

const VOTE_TYPE_OPTIONS = ['주주총회', '이사회', '서면결의']
const VOTE_DECISION_OPTIONS = ['찬성', '반대', '기권', '미행사']

type DetailTab = 'overview' | 'post' | 'workflows' | 'documents' | 'exit'

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
    round: detail.round || '',
    valuation_pre: detail.valuation_pre ?? null,
    valuation_post: detail.valuation_post ?? null,
    ownership_pct: detail.ownership_pct ?? null,
    board_seat: detail.board_seat || '',
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString()
}

export default function InvestmentDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const investmentId = Number(id)
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [editingInvestment, setEditingInvestment] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [editingDocId, setEditingDocId] = useState<number | null>(null)
  const [showValuationForm, setShowValuationForm] = useState(false)
  const [editingValuationId, setEditingValuationId] = useState<number | null>(null)
  const [showVoteForm, setShowVoteForm] = useState(false)
  const [editingVoteId, setEditingVoteId] = useState<number | null>(null)
  const [exitMultiple, setExitMultiple] = useState(2)
  const [exitFeeRate, setExitFeeRate] = useState(20)

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

  const { data: valuations } = useQuery<Valuation[]>({
    queryKey: ['valuations', { investment_id: investmentId }],
    queryFn: () => fetchInvestmentValuations(investmentId),
    enabled: Number.isFinite(investmentId) && investmentId > 0,
  })

  const { data: voteRecords } = useQuery<VoteRecord[]>({
    queryKey: ['voteRecords', { investment_id: investmentId }],
    queryFn: () => fetchVoteRecords({ investment_id: investmentId }),
    enabled: Number.isFinite(investmentId) && investmentId > 0,
  })

  const { data: linkedChecklists } = useQuery<ChecklistListItem[]>({
    queryKey: ['checklists', { investment_id: investmentId }],
    queryFn: () => fetchChecklists({ investment_id: investmentId }),
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
  const exitSimulation = useMemo(() => {
    const invested = Number(selectedInvestment?.amount || 0)
    const gross = invested * Math.max(exitMultiple, 0)
    const gain = gross - invested
    const fee = gain > 0 ? gain * (Math.max(exitFeeRate, 0) / 100) : 0
    const net = gross - fee
    const moic = invested > 0 ? net / invested : null
    return { invested, gross, gain, fee, net, moic }
  }, [selectedInvestment?.amount, exitMultiple, exitFeeRate])

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

  const createValuationMut = useMutation({
    mutationFn: (data: ValuationInput) => createValuation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations', { investment_id: investmentId }] })
      setShowValuationForm(false)
      addToast('success', '가치평가를 등록했습니다.')
    },
  })

  const updateValuationMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ValuationInput> }) => updateValuation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations', { investment_id: investmentId }] })
      setEditingValuationId(null)
      addToast('success', '가치평가를 수정했습니다.')
    },
  })

  const deleteValuationMut = useMutation({
    mutationFn: (id: number) => deleteValuation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations', { investment_id: investmentId }] })
      addToast('success', '가치평가를 삭제했습니다.')
    },
  })

  const createVoteRecordMut = useMutation({
    mutationFn: (data: VoteRecordInput) => createVoteRecord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voteRecords', { investment_id: investmentId }] })
      setShowVoteForm(false)
      addToast('success', '의결권 행사 이력을 등록했습니다.')
    },
  })

  const updateVoteRecordMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<VoteRecordInput> }) => updateVoteRecord(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voteRecords', { investment_id: investmentId }] })
      setEditingVoteId(null)
      addToast('success', '의결권 행사 이력을 수정했습니다.')
    },
  })

  const deleteVoteRecordMut = useMutation({
    mutationFn: (id: number) => deleteVoteRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voteRecords', { investment_id: investmentId }] })
      addToast('success', '의결권 행사 이력을 삭제했습니다.')
    },
  })
  if (!Number.isFinite(investmentId) || investmentId <= 0) {
    return <div className="page-container text-sm text-red-600">유효하지 않은 투자 ID입니다.</div>
  }

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/investments" className="hover:text-blue-600">투자 관리</Link>
        <span>/</span>
        <span className="text-gray-900">{companyName === '-' ? `투자 #${investmentId}` : companyName}</span>
      </div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{companyName === '-' ? `투자 #${investmentId}` : companyName}</h2>
          <p className="page-subtitle">투자 통제실에서 정보, 사후관리, 워크플로, 문서를 탭 단위로 관리합니다.</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex flex-wrap gap-4">
          {[
            { key: 'overview' as const, label: '① 투자 개요' },
            { key: 'post' as const, label: '② 사후 관리' },
            { key: 'workflows' as const, label: '③ 관련된 워크플로' },
            { key: 'documents' as const, label: '④ 문서 및 계약서' },
            { key: 'exit' as const, label: '⑤ 회수(Exit) 시뮬레이션' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-2 text-sm ${activeTab === tab.key
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : !selectedInvestment ? (
        <p className="text-sm text-gray-500">투자를 찾을 수 없습니다.</p>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="card-base space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">투자 #{selectedInvestment.id}</h2>
              <div className="flex gap-2">
                <button className="secondary-btn" onClick={() => setEditingInvestment(true)}>수정</button>
                <button className="danger-btn" onClick={() => { if (confirm('이 투자를 삭제하시겠습니까?')) deleteInvestmentMut.mutate(investmentId) }}>삭제</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div className="p-2 bg-gray-50 rounded">
                조합:{' '}
                {selectedInvestment.fund_id ? (
                  <button
                    onClick={() => navigate(`/funds/${selectedInvestment.fund_id}`)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {fundName || `조합 #${selectedInvestment.fund_id}`} →
                  </button>
                ) : (
                  '-'
                )}
              </div>
              <div className="p-2 bg-gray-50 rounded">회사: {companyName}</div>
              <div className="p-2 bg-gray-50 rounded">상태: {labelStatus(selectedInvestment.status || 'active')}</div>
              <div className="p-2 bg-gray-50 rounded">투자일: {selectedInvestment.investment_date || '-'}</div>
              <div className="p-2 bg-gray-50 rounded">투자금액: {selectedInvestment.amount?.toLocaleString?.() ?? '-'}</div>
              <div className="p-2 bg-gray-50 rounded">주식 수: {selectedInvestment.shares ?? '-'}</div>
              <div className="p-2 bg-gray-50 rounded">주당 가격: {selectedInvestment.share_price?.toLocaleString?.() ?? '-'}</div>
              <div className="p-2 bg-gray-50 rounded">밸류에이션: {selectedInvestment.valuation?.toLocaleString?.() ?? '-'}</div>
              <div className="p-2 bg-gray-50 rounded">기존 지분율: {selectedInvestment.contribution_rate || '-'}</div>
              <div className="p-2 bg-gray-50 rounded">투자 라운드: {selectedInvestment.round || '-'}</div>
              <div className="p-2 bg-gray-50 rounded">프리머니 밸류: {selectedInvestment.valuation_pre?.toLocaleString?.() ?? '-'}</div>
              <div className="p-2 bg-gray-50 rounded">포스트머니 밸류: {selectedInvestment.valuation_post?.toLocaleString?.() ?? '-'}</div>
              <div className="p-2 bg-gray-50 rounded">지분율: {selectedInvestment.ownership_pct != null ? `${selectedInvestment.ownership_pct}%` : '-'}</div>
              <div className="p-2 bg-gray-50 rounded">이사회 참여: {selectedInvestment.board_seat || '-'}</div>
              <div className="p-2 bg-gray-50 rounded md:col-span-3">투자수단: {selectedInvestment.instrument || '-'}</div>
            </div>
            </div>
          )}

          {activeTab === 'workflows' && (
            <>
              <div className="card-base">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">연결된 워크플로우</h3>
            {!linkedWorkflows?.length ? (
              <p className="text-sm text-gray-400">연결된 워크플로우 인스턴스가 없습니다.</p>
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
                <span className="tag tag-indigo">{instance.progress}</span>
                    </div>
                    <p className="text-xs text-indigo-700 mt-0.5">{instance.workflow_name} | {labelStatus(instance.status)} | 시작일 {formatDate(instance.trigger_date)}</p>
                  </button>
                ))}
              </div>
            )}
              </div>

              <div className="card-base">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">체크리스트</h3>
            {!linkedChecklists?.length ? (
              <p className="text-sm text-gray-400">연결된 체크리스트가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {linkedChecklists.map((checklist) => {
                  const progress = checklist.total_items > 0
                    ? Math.round((checklist.checked_items / checklist.total_items) * 100)
                    : 0
                  return (
                    <button
                      key={checklist.id}
                      onClick={() => navigate('/checklists')}
                      className="w-full text-left rounded border border-gray-200 p-2 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{checklist.name}</p>
                        <span className="text-xs text-gray-500">{checklist.checked_items}/{checklist.total_items}</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
              </div>
            </>
          )}

          {activeTab === 'documents' && (
            <div className="card-base">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">서류</h3>
              <button className="primary-btn" onClick={() => setShowDocForm(v => !v)}>+ 서류</button>
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
                        <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                        <p className="text-xs text-gray-500">{doc.doc_type || '-'} | {labelStatus(doc.status || 'pending')} | 마감 {formatDate(doc.due_date)} | {doc.note || '-'}</p>
                      </div>
                      <div className="flex gap-1">
                        <button className="secondary-btn" onClick={() => setEditingDocId(doc.id)}>수정</button>
                        <button className="danger-btn" onClick={() => { if (confirm('이 서류를 삭제하시겠습니까?')) deleteDocMut.mutate(doc.id) }}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              )) : <p className="text-sm text-gray-400">서류가 없습니다.</p>}
            </div>
            </div>
          )}
          {activeTab === 'post' && (
            <>
              <div className="card-base">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">가치평가</h3>
              <button className="text-xs px-2 py-1 bg-indigo-600 text-white rounded" onClick={() => setShowValuationForm(v => !v)}>+ 가치평가</button>
            </div>

            {showValuationForm && selectedInvestment && (
              <ValuationForm
                initial={{
                  ...EMPTY_VALUATION,
                  investment_id: selectedInvestment.id,
                  fund_id: selectedInvestment.fund_id,
                  company_id: selectedInvestment.company_id,
                }}
                onSubmit={d => createValuationMut.mutate(d)}
                onCancel={() => setShowValuationForm(false)}
              />
            )}

            <div className="space-y-2">
              {valuations?.length ? valuations.map((valuation) => (
                <div key={valuation.id} className="border rounded p-2">
                  {editingValuationId === valuation.id ? (
                    <ValuationForm
                      initial={{
                        investment_id: valuation.investment_id,
                        fund_id: valuation.fund_id,
                        company_id: valuation.company_id,
                        as_of_date: valuation.as_of_date,
                        evaluator: valuation.evaluator || '',
                        method: valuation.method || '',
                        instrument: valuation.instrument || '',
                        value: valuation.value,
                        prev_value: valuation.prev_value,
                        change_amount: valuation.change_amount,
                        change_pct: valuation.change_pct,
                        basis: valuation.basis || '',
                      }}
                      onSubmit={d => updateValuationMut.mutate({ id: valuation.id, data: d })}
                      onCancel={() => setEditingValuationId(null)}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{formatDate(valuation.as_of_date)} | {valuation.method || '-'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">평가금액 {formatNumber(valuation.value)} | 전기 {formatNumber(valuation.prev_value)} | 증감 {formatNumber(valuation.change_amount)} ({valuation.change_pct != null ? `${valuation.change_pct}%` : '-'})</p>
                        <p className="text-xs text-gray-500 mt-0.5">{valuation.instrument || '-'} | {valuation.evaluator || '-'} | {valuation.basis || '-'}</p>
                      </div>
                      <div className="flex gap-1">
                        <button className="secondary-btn" onClick={() => setEditingValuationId(valuation.id)}>수정</button>
                        <button className="danger-btn" onClick={() => { if (confirm('이 가치평가를 삭제하시겠습니까?')) deleteValuationMut.mutate(valuation.id) }}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              )) : <p className="text-sm text-gray-400">등록된 가치평가가 없습니다.</p>}
            </div>
              </div>

              <div className="card-base">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">의결권 행사 이력</h3>
              <button
                className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                onClick={() => setShowVoteForm(v => !v)}
              >
                + 이력 등록
              </button>
            </div>

            {showVoteForm && selectedInvestment && (
              <VoteRecordForm
                initial={{
                  company_id: selectedInvestment.company_id,
                  investment_id: selectedInvestment.id,
                  vote_type: VOTE_TYPE_OPTIONS[0],
                  date: new Date().toISOString().slice(0, 10),
                  agenda: '',
                  decision: '',
                  memo: '',
                }}
                onSubmit={d => createVoteRecordMut.mutate(d)}
                onCancel={() => setShowVoteForm(false)}
              />
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="px-2 py-2">행사일</th>
                    <th className="px-2 py-2">의결 유형</th>
                    <th className="px-2 py-2">안건</th>
                    <th className="px-2 py-2">의결 결과</th>
                    <th className="px-2 py-2">비고</th>
                    <th className="px-2 py-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {voteRecords?.flatMap(record => [
                    <tr key={`vote-row-${record.id}`} className="border-b">
                      <td className="px-2 py-2">{formatDate(record.date)}</td>
                      <td className="px-2 py-2">{record.vote_type}</td>
                      <td className="px-2 py-2">{record.agenda || '-'}</td>
                      <td className="px-2 py-2">{record.decision || '-'}</td>
                      <td className="px-2 py-2">{record.memo || '-'}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button
                            className="rounded bg-gray-100 px-2 py-0.5 text-xs"
                            onClick={() => setEditingVoteId(record.id)}
                          >
                            수정
                          </button>
                          <button
                            className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700"
                            onClick={() => {
                              if (confirm('이 의결권 행사 이력을 삭제하시겠습니까?')) {
                                deleteVoteRecordMut.mutate(record.id)
                              }
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>,
                    editingVoteId === record.id ? (
                      <tr key={`vote-form-${record.id}`} className="border-b">
                        <td colSpan={6} className="px-2 py-2">
                          <VoteRecordForm
                            initial={{
                              company_id: record.company_id,
                              investment_id: record.investment_id,
                              vote_type: record.vote_type,
                              date: record.date,
                              agenda: record.agenda || '',
                              decision: record.decision || '',
                              memo: record.memo || '',
                            }}
                            onSubmit={d => updateVoteRecordMut.mutate({ id: record.id, data: d })}
                            onCancel={() => setEditingVoteId(null)}
                          />
                        </td>
                      </tr>
                    ) : null,
                  ])}
                  {!voteRecords?.length && (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-center text-sm text-gray-400">
                        의결권 행사 이력이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
              </div>
            </>
          )}

          {activeTab === 'exit' && (
            <div className="card-base space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">회수 시뮬레이션</h3>
              <p className="text-xs text-gray-500">가정 배수와 성과보수율을 기준으로 순회수금과 MOIC를 계산합니다.</p>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">기준 투자금</label>
                  <input value={formatNumber(exitSimulation.invested)} disabled className="w-full rounded border bg-gray-100 px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">회수 배수(MOIC)</label>
                  <input type="number" step="0.1" value={exitMultiple} onChange={(event) => setExitMultiple(Number(event.target.value || 0))} className="w-full rounded border px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">성과보수율(%)</label>
                  <input type="number" step="0.1" value={exitFeeRate} onChange={(event) => setExitFeeRate(Number(event.target.value || 0))} className="w-full rounded border px-2 py-1 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <div className="rounded bg-gray-50 p-2">총 회수금(가정): {formatNumber(exitSimulation.gross)}</div>
                <div className="rounded bg-gray-50 p-2">평가차익: {formatNumber(exitSimulation.gain)}</div>
                <div className="rounded bg-gray-50 p-2">성과보수: {formatNumber(exitSimulation.fee)}</div>
                <div className="rounded bg-blue-50 p-2 font-semibold text-blue-700">순회수금: {formatNumber(exitSimulation.net)}</div>
                <div className="rounded bg-indigo-50 p-2 font-semibold text-indigo-700 md:col-span-2">
                  순 MOIC: {exitSimulation.moic == null ? '-' : `${exitSimulation.moic.toFixed(2)}x`}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {selectedInvestment && (
        <DrawerOverlay
          open={editingInvestment}
          onClose={() => setEditingInvestment(false)}
          title="투자 정보 수정"
          widthClassName="w-full max-w-5xl"
        >
          <InvestmentForm
            funds={funds || []}
            companies={companies || []}
            initial={toInvestmentInput(selectedInvestment)}
            onSubmit={d => updateInvestmentMut.mutate({ id: investmentId, data: d })}
            onCancel={() => setEditingInvestment(false)}
          />
        </DrawerOverlay>
      )}
    </div>
  )
}

function InvestmentForm({ funds, companies, initial, onSubmit, onCancel }: { funds: Fund[]; companies: Company[]; initial: InvestmentInput; onSubmit: (data: InvestmentInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState<InvestmentInput>(initial)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border rounded p-2 bg-gray-50">
      <div><label className="mb-1 block text-xs font-medium text-gray-600">조합</label><select value={form.fund_id || ''} onChange={e => setForm(prev => ({ ...prev, fund_id: Number(e.target.value) }))} className="w-full px-2 py-1 text-sm border rounded"><option value="">조합 선택</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">회사</label><select value={form.company_id || ''} onChange={e => setForm(prev => ({ ...prev, company_id: Number(e.target.value) }))} className="w-full px-2 py-1 text-sm border rounded"><option value="">회사 선택</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">투자일</label><input type="date" value={form.investment_date || ''} onChange={e => setForm(prev => ({ ...prev, investment_date: e.target.value }))} className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">투자금액</label><input type="number" value={form.amount ?? ''} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">주식 수</label><input type="number" value={form.shares ?? ''} onChange={e => setForm(prev => ({ ...prev, shares: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">주당 가격</label><input type="number" value={form.share_price ?? ''} onChange={e => setForm(prev => ({ ...prev, share_price: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">밸류에이션</label><input type="number" value={form.valuation ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">투자 라운드</label><input value={form.round || ''} onChange={e => setForm(prev => ({ ...prev, round: e.target.value }))} placeholder="예: Series A" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">프리머니 밸류</label><input type="number" value={form.valuation_pre ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_pre: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">포스트머니 밸류</label><input type="number" value={form.valuation_post ?? ''} onChange={e => setForm(prev => ({ ...prev, valuation_post: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">지분율(%)</label><input type="number" step="0.01" value={form.ownership_pct ?? ''} onChange={e => setForm(prev => ({ ...prev, ownership_pct: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">이사회 참여</label><input value={form.board_seat || ''} onChange={e => setForm(prev => ({ ...prev, board_seat: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">기존 지분율</label><input value={form.contribution_rate || ''} onChange={e => setForm(prev => ({ ...prev, contribution_rate: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">투자수단</label><input value={form.instrument || ''} onChange={e => setForm(prev => ({ ...prev, instrument: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">상태</label><input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="예: active" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div className="md:col-span-3 flex gap-2">
        <button className="primary-btn" onClick={() => { if (!form.fund_id || !form.company_id) return; onSubmit({ ...form, investment_date: form.investment_date || null, round: form.round?.trim() || null, board_seat: form.board_seat?.trim() || null, contribution_rate: form.contribution_rate?.trim() || null, instrument: form.instrument?.trim() || null }) }}>저장</button>
        <button className="secondary-btn" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

function DocumentForm({ initial, onSubmit, onCancel }: { initial: InvestmentDocumentInput; onSubmit: (data: InvestmentDocumentInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState<InvestmentDocumentInput>(initial)

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 border rounded p-2 bg-gray-50 mb-2">
      <div><label className="mb-1 block text-xs font-medium text-gray-600">서류명</label><input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="예: 주주명부" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">유형</label><input value={form.doc_type || ''} onChange={e => setForm(prev => ({ ...prev, doc_type: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">상태</label><input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="예: pending" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">마감일</label><input type="date" value={form.due_date || ''} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value || null }))} className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">비고</label><input value={form.note || ''} onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div className="md:col-span-5 flex gap-2">
        <button className="primary-btn" onClick={() => { if (form.name.trim()) onSubmit({ ...form, name: form.name.trim(), due_date: form.due_date || null }) }}>저장</button>
        <button className="secondary-btn" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

function VoteRecordForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: VoteRecordInput
  onSubmit: (data: VoteRecordInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<VoteRecordInput>(initial)

  return (
    <div className="mb-2 grid grid-cols-1 gap-2 rounded border bg-gray-50 p-2 md:grid-cols-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">의결 유형</label>
        <select
          value={form.vote_type}
          onChange={e => setForm(prev => ({ ...prev, vote_type: e.target.value }))}
          className="w-full rounded border px-2 py-1 text-sm"
        >
          {VOTE_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">의결일</label>
        <input
          type="date"
          value={form.date || ''}
          onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">의결 결과</label>
        <select
          value={form.decision || ''}
          onChange={e => setForm(prev => ({ ...prev, decision: e.target.value }))}
          className="w-full rounded border px-2 py-1 text-sm"
        >
          <option value="">의결 결과</option>
          {VOTE_DECISION_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">안건</label>
        <input
          value={form.agenda || ''}
          onChange={e => setForm(prev => ({ ...prev, agenda: e.target.value }))}
          placeholder="선택 입력"
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">비고</label>
        <input
          value={form.memo || ''}
          onChange={e => setForm(prev => ({ ...prev, memo: e.target.value }))}
          placeholder="선택 입력"
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </div>
      <div className="flex gap-2 md:col-span-5">
        <button
          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white"
          onClick={() => {
            if (!form.company_id || !form.vote_type || !form.date) return
            onSubmit({
              ...form,
              investment_id: form.investment_id || null,
              vote_type: form.vote_type.trim(),
              agenda: form.agenda?.trim() || null,
              decision: form.decision?.trim() || null,
              memo: form.memo?.trim() || null,
            })
          }}
        >
          저장
        </button>
        <button className="rounded border bg-white px-3 py-1 text-xs" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}

function ValuationForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: ValuationInput
  onSubmit: (data: ValuationInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ValuationInput>(initial)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border rounded p-2 bg-gray-50 mb-2">
      <div><label className="mb-1 block text-xs font-medium text-gray-600">기준일</label><input type="date" value={form.as_of_date || ''} onChange={e => setForm(prev => ({ ...prev, as_of_date: e.target.value }))} className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">평가금액</label><input type="number" value={form.value ?? ''} onChange={e => setForm(prev => ({ ...prev, value: Number(e.target.value || 0) }))} placeholder="숫자 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">전기 평가금액</label><input type="number" value={form.prev_value ?? ''} onChange={e => setForm(prev => ({ ...prev, prev_value: e.target.value ? Number(e.target.value) : null }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">평가 방법</label><input value={form.method || ''} onChange={e => setForm(prev => ({ ...prev, method: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">대상 증권</label><input value={form.instrument || ''} onChange={e => setForm(prev => ({ ...prev, instrument: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">평가기관</label><input value={form.evaluator || ''} onChange={e => setForm(prev => ({ ...prev, evaluator: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">증감액</label><input type="number" value={form.change_amount ?? ''} onChange={e => setForm(prev => ({ ...prev, change_amount: e.target.value ? Number(e.target.value) : null }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">증감률(%)</label><input type="number" step="0.01" value={form.change_pct ?? ''} onChange={e => setForm(prev => ({ ...prev, change_pct: e.target.value ? Number(e.target.value) : null }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div><label className="mb-1 block text-xs font-medium text-gray-600">산정 근거</label><input value={form.basis || ''} onChange={e => setForm(prev => ({ ...prev, basis: e.target.value }))} placeholder="선택 입력" className="w-full px-2 py-1 text-sm border rounded" /></div>
      <div className="md:col-span-3 flex gap-2">
        <button
          className="px-3 py-1 text-xs bg-indigo-600 text-white rounded"
          onClick={() => {
            if (!form.investment_id || !form.fund_id || !form.company_id || !form.as_of_date || form.value == null) return
            onSubmit({
              ...form,
              method: form.method?.trim() || null,
              instrument: form.instrument?.trim() || null,
              evaluator: form.evaluator?.trim() || null,
              basis: form.basis?.trim() || null,
              prev_value: form.prev_value ?? null,
              change_amount: form.change_amount ?? null,
              change_pct: form.change_pct ?? null,
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











