import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createExitCommittee,
  createExitCommitteeFund,
  createExitTrade,
  deleteExitCommittee,
  deleteExitCommitteeFund,
  deleteExitTrade,
  fetchCompanies,
  fetchExitCommitteeFunds,
  fetchExitCommittees,
  fetchExitTrades,
  fetchFunds,
  fetchInvestments,
  updateExitCommittee,
  updateExitCommitteeFund,
  updateExitTrade,
  type Company,
  type ExitCommittee,
  type ExitCommitteeFund,
  type ExitCommitteeFundInput,
  type ExitCommitteeInput,
  type ExitTrade,
  type ExitTradeInput,
  type Fund,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'

interface InvestmentOption {
  id: number
  fund_id: number
  company_id: number
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

const EXIT_TYPE_LABEL: Record<string, string> = {
  ipo_sell: 'IPO 매도',
  mna: 'M&A',
  buyback: '인수합병',
  conversion: '전환',
  liquidation: '청산배분',
  dividend: '배당',
  'IPO 매도': 'IPO 매도',
  'M&A': 'M&A',
  인수합병: '인수합병',
  전환: '전환',
  청산배분: '청산배분',
  배당: '배당',
}

const COMMITTEE_STATUS_OPTIONS = ['scheduled', 'deliberating', 'approved', 'rejected']
const EXIT_TYPE_OPTIONS = ['ipo_sell', 'mna', 'buyback', 'conversion', 'liquidation', 'dividend']

function labelExitType(value: string | null | undefined): string {
  if (!value) return '-'
  return EXIT_TYPE_LABEL[value] ?? value
}

interface CommitteeEditState {
  meeting_date: string
  status: string
  exit_strategy: string
  memo: string
}

interface CommitteeFundEditState {
  fund_id: number
  investment_id: number
}

interface TradeEditState {
  exit_committee_id: number | null
  fund_id: number
  company_id: number
  investment_id: number
  trade_date: string
  exit_type: string
  amount: number
  shares_sold: number | null
  fees: number
  realized_gain: number | null
  memo: string
}

export default function ExitsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [expandedCommitteeId, setExpandedCommitteeId] = useState<number | null>(null)
  const [editingCommitteeId, setEditingCommitteeId] = useState<number | null>(null)
  const [editingCommitteeFundId, setEditingCommitteeFundId] = useState<number | null>(null)
  const [editingTradeId, setEditingTradeId] = useState<number | null>(null)
  const [editCommittee, setEditCommittee] = useState<CommitteeEditState | null>(null)
  const [editCommitteeFund, setEditCommitteeFund] = useState<CommitteeFundEditState | null>(null)
  const [editTrade, setEditTrade] = useState<TradeEditState | null>(null)

  const [newCommittee, setNewCommittee] = useState<ExitCommitteeInput>({
    company_id: 0,
    status: 'scheduled',
    meeting_date: todayIso(),
    location: '',
    agenda: '',
    exit_strategy: '',
    analyst_opinion: '',
    vote_result: '',
    memo: '',
  })
  const [newCommitteeFund, setNewCommitteeFund] = useState<ExitCommitteeFundInput>({ fund_id: 0, investment_id: 0 })
  const [newTrade, setNewTrade] = useState<ExitTradeInput>({
    exit_committee_id: null,
    investment_id: 0,
    fund_id: 0,
    company_id: 0,
    exit_type: 'ipo_sell',
    trade_date: todayIso(),
    amount: 0,
    shares_sold: null,
    price_per_share: null,
    fees: 0,
    net_amount: null,
    realized_gain: null,
    memo: '',
  })

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })
  const { data: investments } = useQuery<InvestmentOption[]>({ queryKey: ['investments', 'exit-options'], queryFn: () => fetchInvestments() })
  const { data: committees } = useQuery<ExitCommittee[]>({ queryKey: ['exitCommittees'], queryFn: () => fetchExitCommittees() })
  const { data: committeeFunds } = useQuery({ queryKey: ['exitCommitteeFunds', expandedCommitteeId], queryFn: () => fetchExitCommitteeFunds(expandedCommitteeId as number), enabled: !!expandedCommitteeId })
  const { data: trades } = useQuery<ExitTrade[]>({ queryKey: ['exitTrades'], queryFn: () => fetchExitTrades() })

  const filteredInvestmentOptions = useMemo(
    () => (investments || []).filter((inv) => (!newTrade.fund_id || inv.fund_id === newTrade.fund_id) && (!newTrade.company_id || inv.company_id === newTrade.company_id)),
    [investments, newTrade.fund_id, newTrade.company_id],
  )

  const createCommitteeMut = useMutation({ mutationFn: (data: ExitCommitteeInput) => createExitCommittee(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitCommittees'] }); addToast('success', '회수위원회를 등록했습니다.') } })
  const updateCommitteeMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<ExitCommitteeInput> }) => updateExitCommittee(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitCommittees'] }); setEditingCommitteeId(null); setEditCommittee(null); addToast('success', '회수위원회를 수정했습니다.') } })
  const deleteCommitteeMut = useMutation({ mutationFn: (id: number) => deleteExitCommittee(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitCommittees'] }); addToast('success', '회수위원회를 삭제했습니다.') } })
  const createCommitteeFundMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: ExitCommitteeFundInput }) => createExitCommitteeFund(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitCommitteeFunds', expandedCommitteeId] }); addToast('success', '재원 연결을 등록했습니다.') } })
  const deleteCommitteeFundMut = useMutation({ mutationFn: ({ committeeId, itemId }: { committeeId: number; itemId: number }) => deleteExitCommitteeFund(committeeId, itemId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitCommitteeFunds', expandedCommitteeId] }); addToast('success', '재원 연결을 삭제했습니다.') } })
  const updateCommitteeFundMut = useMutation({ mutationFn: ({ committeeId, itemId, data }: { committeeId: number; itemId: number; data: Partial<ExitCommitteeFundInput> }) => updateExitCommitteeFund(committeeId, itemId, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitCommitteeFunds', expandedCommitteeId] }); setEditingCommitteeFundId(null); setEditCommitteeFund(null); addToast('success', '재원 연결을 수정했습니다.') } })

  const createTradeMut = useMutation({ mutationFn: (data: ExitTradeInput) => createExitTrade(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitTrades'] }); queryClient.invalidateQueries({ queryKey: ['transactions'] }); addToast('success', '회수 거래를 등록했습니다.') } })
  const updateTradeMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<ExitTradeInput> }) => updateExitTrade(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitTrades'] }); queryClient.invalidateQueries({ queryKey: ['transactions'] }); setEditingTradeId(null); setEditTrade(null); addToast('success', '회수 거래를 수정했습니다.') } })
  const deleteTradeMut = useMutation({ mutationFn: (id: number) => deleteExitTrade(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['exitTrades'] }); queryClient.invalidateQueries({ queryKey: ['transactions'] }); addToast('success', '회수 거래를 삭제했습니다.') } })

  const toggleCommitteeEdit = (committee: ExitCommittee) => {
    if (editingCommitteeId === committee.id) {
      setEditingCommitteeId(null)
      setEditCommittee(null)
      return
    }
    setEditingCommitteeId(committee.id)
    setEditCommittee({
      meeting_date: committee.meeting_date,
      status: committee.status,
      exit_strategy: committee.exit_strategy || '',
      memo: committee.memo || '',
    })
  }

  const toggleCommitteeFundEdit = (item: ExitCommitteeFund) => {
    if (editingCommitteeFundId === item.id) {
      setEditingCommitteeFundId(null)
      setEditCommitteeFund(null)
      return
    }
    setEditingCommitteeFundId(item.id)
    setEditCommitteeFund({
      fund_id: item.fund_id,
      investment_id: item.investment_id,
    })
  }

  const toggleTradeEdit = (trade: ExitTrade) => {
    if (editingTradeId === trade.id) {
      setEditingTradeId(null)
      setEditTrade(null)
      return
    }
    setEditingTradeId(trade.id)
    setEditTrade({
      exit_committee_id: trade.exit_committee_id,
      fund_id: trade.fund_id,
      company_id: trade.company_id,
      investment_id: trade.investment_id,
      trade_date: trade.trade_date,
      exit_type: trade.exit_type,
      amount: trade.amount,
      shares_sold: trade.shares_sold,
      fees: trade.fees,
      realized_gain: trade.realized_gain,
      memo: trade.memo || '',
    })
  }

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
      <h2 className="page-title">🚪 회수 관리</h2>
          <p className="page-subtitle">위원회 심의와 회수 거래를 통합 관리합니다.</p>
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">신규 위원회 등록</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">투자사</label>
            <select value={newCommittee.company_id || ''} onChange={(e) => setNewCommittee((p) => ({ ...p, company_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm">
              <option value="">투자사</option>
              {companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">회의일</label>
            <input type="date" value={newCommittee.meeting_date} onChange={(e) => setNewCommittee((p) => ({ ...p, meeting_date: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
            <select value={newCommittee.status || 'scheduled'} onChange={(e) => setNewCommittee((p) => ({ ...p, status: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
              {COMMITTEE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {labelStatus(status)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">회수 전략</label>
            <input value={newCommittee.exit_strategy || ''} onChange={(e) => setNewCommittee((p) => ({ ...p, exit_strategy: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="회수 전략" />
          </div>
          <div className="flex items-end">
            <button onClick={() => newCommittee.company_id && createCommitteeMut.mutate({ ...newCommittee, agenda: newCommittee.agenda?.trim() || null, memo: newCommittee.memo?.trim() || null })} className="primary-btn">등록</button>
          </div>
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">위원회</h3>
        <div className="space-y-2">
          {committees?.map((committee) => (
            <div key={committee.id} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-700">{committee.company_name || committee.company_id} | {toDate(committee.meeting_date)} | {labelStatus(committee.status)} | {committee.exit_strategy || '-'}</p>
                <div className="flex gap-1">
                  <button onClick={() => setExpandedCommitteeId(expandedCommitteeId === committee.id ? null : committee.id)} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100">재원 연결</button>
                  <button onClick={() => toggleCommitteeEdit(committee)} className="secondary-btn">수정</button>
                  <button onClick={() => deleteCommitteeMut.mutate(committee.id)} className="danger-btn">삭제</button>
                </div>
              </div>

              {editingCommitteeId === committee.id && editCommittee && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">회의일</label>
                    <input type="date" value={editCommittee.meeting_date} onChange={(e) => setEditCommittee((p) => (p ? { ...p, meeting_date: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
                    <select value={editCommittee.status} onChange={(e) => setEditCommittee((p) => (p ? { ...p, status: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm">
                      {COMMITTEE_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {labelStatus(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">회수 전략</label>
                    <input value={editCommittee.exit_strategy} onChange={(e) => setEditCommittee((p) => (p ? { ...p, exit_strategy: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">메모</label>
                    <input value={editCommittee.memo} onChange={(e) => setEditCommittee((p) => (p ? { ...p, memo: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => updateCommitteeMut.mutate({ id: committee.id, data: { meeting_date: editCommittee.meeting_date, status: editCommittee.status, exit_strategy: editCommittee.exit_strategy.trim() || null, memo: editCommittee.memo.trim() || null } })} className="primary-btn">저장</button>
                    <button onClick={() => { setEditingCommitteeId(null); setEditCommittee(null) }} className="secondary-btn">취소</button>
                  </div>
                </div>
              )}

              {expandedCommitteeId === committee.id && (
                <div className="mt-2 rounded bg-gray-50 p-2 space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
                      <select value={newCommitteeFund.fund_id || ''} onChange={(e) => setNewCommitteeFund((p) => ({ ...p, fund_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm">
                        <option value="">조합</option>
                        {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">투자건 ID</label>
                      <input type="number" value={newCommitteeFund.investment_id || ''} onChange={(e) => setNewCommitteeFund((p) => ({ ...p, investment_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="투자건 ID" />
                    </div>
                    <div className="flex items-end">
                      <button onClick={() => newCommitteeFund.fund_id && newCommitteeFund.investment_id && createCommitteeFundMut.mutate({ id: committee.id, data: newCommitteeFund })} className="primary-btn">연결</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {committeeFunds?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2">
                        {editingCommitteeFundId === item.id && editCommitteeFund ? (
                          <div className="w-full grid grid-cols-1 gap-2 md:grid-cols-4">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">조합 ID</label>
                              <input type="number" value={editCommitteeFund.fund_id} onChange={(e) => setEditCommitteeFund((p) => (p ? { ...p, fund_id: Number(e.target.value) || 0 } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">투자건 ID</label>
                              <input type="number" value={editCommitteeFund.investment_id} onChange={(e) => setEditCommitteeFund((p) => (p ? { ...p, investment_id: Number(e.target.value) || 0 } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                            </div>
                            <button onClick={() => updateCommitteeFundMut.mutate({ committeeId: committee.id, itemId: item.id, data: { fund_id: editCommitteeFund.fund_id, investment_id: editCommitteeFund.investment_id } })} className="primary-btn">저장</button>
                            <button onClick={() => { setEditingCommitteeFundId(null); setEditCommitteeFund(null) }} className="secondary-btn">취소</button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-gray-600">조합 {item.fund_name || item.fund_id} | 투자건 #{item.investment_id}</p>
                            <div className="flex gap-1">
                              <button onClick={() => toggleCommitteeFundEdit(item)} className="secondary-btn">수정</button>
                              <button onClick={() => deleteCommitteeFundMut.mutate({ committeeId: committee.id, itemId: item.id })} className="danger-btn">삭제</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {!committees?.length && <EmptyState emoji="🚪" message="위원회가 없어요" className="py-8" />}
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">신규 회수 거래 등록</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">위원회 ID</label>
            <input type="number" value={newTrade.exit_committee_id || ''} onChange={(e) => setNewTrade((p) => ({ ...p, exit_committee_id: e.target.value ? Number(e.target.value) : null }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="위원회 ID (선택)" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
            <select value={newTrade.fund_id || ''} onChange={(e) => setNewTrade((p) => ({ ...p, fund_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm"><option value="">조합</option>{funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">투자사</label>
            <select value={newTrade.company_id || ''} onChange={(e) => setNewTrade((p) => ({ ...p, company_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm"><option value="">투자사</option>{companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">투자건</label>
            <select value={newTrade.investment_id || ''} onChange={(e) => setNewTrade((p) => ({ ...p, investment_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm"><option value="">투자건</option>{filteredInvestmentOptions.map((investment) => <option key={investment.id} value={investment.id}>#{investment.id}</option>)}</select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">거래일</label>
            <input type="date" value={newTrade.trade_date} onChange={(e) => setNewTrade((p) => ({ ...p, trade_date: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">회수 유형</label>
            <select value={newTrade.exit_type} onChange={(e) => setNewTrade((p) => ({ ...p, exit_type: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
              {EXIT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {labelExitType(type)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">거래 금액</label>
            <input type="number" value={newTrade.amount} onChange={(e) => setNewTrade((p) => ({ ...p, amount: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="거래 금액" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">매도 주식수</label>
            <input type="number" value={newTrade.shares_sold || ''} onChange={(e) => setNewTrade((p) => ({ ...p, shares_sold: e.target.value ? Number(e.target.value) : null }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="매도 주식수" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">수수료</label>
            <input type="number" value={newTrade.fees || 0} onChange={(e) => setNewTrade((p) => ({ ...p, fees: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="수수료" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">실현손익</label>
            <input type="number" value={newTrade.realized_gain || ''} onChange={(e) => setNewTrade((p) => ({ ...p, realized_gain: e.target.value ? Number(e.target.value) : null }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="실현손익" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">비고</label>
            <input value={newTrade.memo || ''} onChange={(e) => setNewTrade((p) => ({ ...p, memo: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="비고" />
          </div>
          <div className="flex items-end">
            <button onClick={() => newTrade.fund_id && newTrade.company_id && newTrade.investment_id && createTradeMut.mutate({ ...newTrade, memo: newTrade.memo?.trim() || null })} className="primary-btn">등록</button>
          </div>
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">회수 거래</h3>
        <div className="space-y-1">
          {trades?.map((trade) => (
            <div key={trade.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">{trade.fund_name || trade.fund_id} | {trade.company_name || trade.company_id} | {toDate(trade.trade_date)} | {labelExitType(trade.exit_type)} | 거래 금액 {formatKRW(trade.amount)} | 회수액 {formatKRW(trade.net_amount || 0)}</p>
                <div className="flex gap-1">
                  <button onClick={() => toggleTradeEdit(trade)} className="secondary-btn">수정</button>
                  <button onClick={() => deleteTradeMut.mutate(trade.id)} className="danger-btn">삭제</button>
                </div>
              </div>
              {editingTradeId === trade.id && editTrade && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">위원회 ID</label><input type="number" value={editTrade.exit_committee_id ?? ''} onChange={(e) => setEditTrade((p) => (p ? { ...p, exit_committee_id: e.target.value ? Number(e.target.value) : null } : p))} className="w-full rounded border px-2 py-1 text-sm" placeholder="위원회 ID" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">조합 ID</label><input type="number" value={editTrade.fund_id} onChange={(e) => setEditTrade((p) => (p ? { ...p, fund_id: Number(e.target.value) || 0 } : p))} className="w-full rounded border px-2 py-1 text-sm" placeholder="조합 ID" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">투자사 ID</label><input type="number" value={editTrade.company_id} onChange={(e) => setEditTrade((p) => (p ? { ...p, company_id: Number(e.target.value) || 0 } : p))} className="w-full rounded border px-2 py-1 text-sm" placeholder="투자사 ID" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">투자건 ID</label><input type="number" value={editTrade.investment_id} onChange={(e) => setEditTrade((p) => (p ? { ...p, investment_id: Number(e.target.value) || 0 } : p))} className="w-full rounded border px-2 py-1 text-sm" placeholder="투자건 ID" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">거래일</label><input type="date" value={editTrade.trade_date} onChange={(e) => setEditTrade((p) => (p ? { ...p, trade_date: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">회수 유형</label><select value={editTrade.exit_type} onChange={(e) => setEditTrade((p) => (p ? { ...p, exit_type: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm">{EXIT_TYPE_OPTIONS.map((type) => (<option key={type} value={type}>{labelExitType(type)}</option>))}</select></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">거래 금액</label><input type="number" value={editTrade.amount} onChange={(e) => setEditTrade((p) => (p ? { ...p, amount: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">매도 주식수</label><input type="number" value={editTrade.shares_sold ?? ''} onChange={(e) => setEditTrade((p) => (p ? { ...p, shares_sold: e.target.value ? Number(e.target.value) : null } : p))} className="w-full rounded border px-2 py-1 text-sm" placeholder="매도 주식수" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">수수료</label><input type="number" value={editTrade.fees} onChange={(e) => setEditTrade((p) => (p ? { ...p, fees: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-600">실현손익</label><input type="number" value={editTrade.realized_gain ?? ''} onChange={(e) => setEditTrade((p) => (p ? { ...p, realized_gain: e.target.value ? Number(e.target.value) : null } : p))} className="w-full rounded border px-2 py-1 text-sm" placeholder="실현손익" /></div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600">비고</label>
                    <input value={editTrade.memo || ''} onChange={(e) => setEditTrade((p) => (p ? { ...p, memo: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => updateTradeMut.mutate({ id: trade.id, data: { exit_committee_id: editTrade.exit_committee_id, fund_id: editTrade.fund_id, company_id: editTrade.company_id, investment_id: editTrade.investment_id, trade_date: editTrade.trade_date, exit_type: editTrade.exit_type, amount: editTrade.amount, fees: editTrade.fees, shares_sold: editTrade.shares_sold, realized_gain: editTrade.realized_gain, memo: editTrade.memo.trim() || null } })} className="primary-btn">저장</button>
                    <button onClick={() => { setEditingTradeId(null); setEditTrade(null) }} className="secondary-btn">취소</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!trades?.length && <EmptyState emoji="🚪" message="회수 거래가 없어요" className="py-8" />}
        </div>
      </div>
    </div>
  )
}







