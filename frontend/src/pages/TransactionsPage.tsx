import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTransaction,
  deleteTransaction,
  fetchCompanies,
  fetchFunds,
  fetchInvestments,
  fetchTransactions,
  updateTransaction,
  type Company,
  type Fund,
  type Transaction,
  type TransactionInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import PageLoading from '../components/PageLoading'

interface InvestmentOption {
  id: number
  fund_id: number
  company_id: number
}

interface FilterState {
  fund_id: number | null
  company_id: number | null
  investment_id: number | null
  type: string
}

function toDate(value: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function toAmount(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString()
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY_FILTERS: FilterState = {
  fund_id: null,
  company_id: null,
  investment_id: null,
  type: '',
}

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  investment: '투자',
  follow_on: '추가 투자',
  redemption: '환매',
  decrease_capital: '감자',
  maturity: '만기',
  conversion: '전환',
  dividend: '배당',
  exercise: '행사',
  exit: '회수',
  other: '기타',
  투자: '투자',
  '추가 투자': '추가 투자',
  환매: '환매',
  감자: '감자',
  만기: '만기',
  전환: '전환',
  배당: '배당',
  행사: '행사',
  회수: '회수',
  기타: '기타',
}

const TRANSACTION_TYPE_OPTIONS = [
  'investment',
  'follow_on',
  'redemption',
  'decrease_capital',
  'maturity',
  'conversion',
  'dividend',
  'exercise',
  'exit',
  'other',
]

function labelTransactionType(value: string | null | undefined): string {
  if (!value) return '-'
  return TRANSACTION_TYPE_LABEL[value] ?? value
}

const EMPTY_INPUT: TransactionInput = {
  investment_id: 0,
  fund_id: 0,
  company_id: 0,
  transaction_date: todayIso(),
  type: 'investment',
  amount: 0,
  shares_change: null,
  balance_before: null,
  balance_after: null,
  realized_gain: null,
  cumulative_gain: null,
  memo: '',
}

function TransactionForm({
  funds,
  companies,
  investments,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  loading,
}: {
  funds: Fund[]
  companies: Company[]
  investments: InvestmentOption[]
  initial: TransactionInput
  submitLabel: string
  onSubmit: (data: TransactionInput) => void
  onCancel: () => void
  loading: boolean
}) {
  const [form, setForm] = useState<TransactionInput>(initial)

  const filteredInvestments = useMemo(
    () =>
      investments.filter((inv) => {
        if (form.fund_id && inv.fund_id !== form.fund_id) return false
        if (form.company_id && inv.company_id !== form.company_id) return false
        return true
      }),
    [investments, form.fund_id, form.company_id],
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div><label className="mb-1 block text-xs font-medium text-gray-600">조합</label><select value={form.fund_id || ''} onChange={(e) => setForm((prev) => ({ ...prev, fund_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm"><option value="">조합 선택</option>{funds.map((fund) => (<option key={fund.id} value={fund.id}>{fund.name}</option>))}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">투자사</label><select value={form.company_id || ''} onChange={(e) => setForm((prev) => ({ ...prev, company_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm"><option value="">투자사 선택</option>{companies.map((company) => (<option key={company.id} value={company.id}>{company.name}</option>))}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">투자건</label><select value={form.investment_id || ''} onChange={(e) => setForm((prev) => ({ ...prev, investment_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm"><option value="">투자건 선택</option>{filteredInvestments.map((investment) => (<option key={investment.id} value={investment.id}>#{investment.id}</option>))}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">거래일</label><input type="date" value={form.transaction_date} onChange={(e) => setForm((prev) => ({ ...prev, transaction_date: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">유형</label><select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">{TRANSACTION_TYPE_OPTIONS.map((type) => (<option key={type} value={type}>{labelTransactionType(type)}</option>))}</select></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">금액</label><input type="number" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: Number(e.target.value || 0) }))} placeholder="숫자 입력" className="w-full rounded border px-2 py-1 text-sm" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">주식수 변동</label><input type="number" value={form.shares_change ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, shares_change: e.target.value ? Number(e.target.value) : null }))} placeholder="선택 입력" className="w-full rounded border px-2 py-1 text-sm" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">실현손익</label><input type="number" value={form.realized_gain ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, realized_gain: e.target.value ? Number(e.target.value) : null }))} placeholder="선택 입력" className="w-full rounded border px-2 py-1 text-sm" /></div>
        <div className="md:col-span-4"><label className="mb-1 block text-xs font-medium text-gray-600">비고</label><input value={form.memo || ''} onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))} placeholder="선택 입력" className="w-full rounded border px-2 py-1 text-sm" /></div>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            if (!form.fund_id || !form.company_id || !form.investment_id || !form.transaction_date || !form.type) return
            onSubmit({
              ...form,
              memo: form.memo?.trim() || null,
            })
          }}
          disabled={loading}
          className="primary-btn"
        >
          {submitLabel}
        </button>
        <button onClick={onCancel} className="rounded border bg-white px-3 py-1 text-xs hover:bg-gray-100">
          취소
        </button>
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const params = useMemo(
    () => ({
      fund_id: filters.fund_id || undefined,
      company_id: filters.company_id || undefined,
      investment_id: filters.investment_id || undefined,
      type: filters.type.trim() || undefined,
    }),
    [filters],
  )

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })
  const { data: investments } = useQuery<InvestmentOption[]>({
    queryKey: ['investments', 'options'],
    queryFn: () => fetchInvestments(),
  })
  const { data: rows, isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', params],
    queryFn: () => fetchTransactions(params),
  })

  const createMut = useMutation({
    mutationFn: (data: TransactionInput) => createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['investment'] })
      setShowCreate(false)
      addToast('success', '거래를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TransactionInput> }) => updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['investment'] })
      setEditingId(null)
      addToast('success', '거래를 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['investment'] })
      addToast('success', '거래를 삭제했습니다.')
    },
  })

  const fundNameMap = useMemo(
    () => new Map((funds || []).map((fund) => [fund.id, fund.name])),
    [funds],
  )
  const companyNameMap = useMemo(
    () => new Map((companies || []).map((company) => [company.id, company.name])),
    [companies],
  )

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">거래원장</h2>
          <p className="page-subtitle">투자 거래 이력을 검색하고 관리합니다.</p>
        </div>
        <button
          onClick={() => setShowCreate((prev) => !prev)}
          className="primary-btn"
        >
          + 신규 거래 등록
        </button>
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">필터</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
            <select
              value={filters.fund_id || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))}
              className="w-full rounded border px-2 py-1 text-sm"
            >
              <option value="">전체 조합</option>
              {funds?.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">투자사</label>
            <select
              value={filters.company_id || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, company_id: Number(e.target.value) || null }))}
              className="w-full rounded border px-2 py-1 text-sm"
            >
              <option value="">전체 투자사</option>
              {companies?.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">투자건 ID</label>
            <input
              type="number"
              value={filters.investment_id || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, investment_id: e.target.value ? Number(e.target.value) : null }))}
              placeholder="선택 입력"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">유형</label>
            <input
              value={filters.type}
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              placeholder="예: buy/sell"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div className="mt-2">
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="secondary-btn"
          >
            필터 초기화
          </button>
        </div>
      </div>

      {showCreate && (
        <TransactionForm
          funds={funds || []}
          companies={companies || []}
          investments={investments || []}
          initial={EMPTY_INPUT}
          submitLabel="저장"
          loading={createMut.isPending}
          onSubmit={(data) => createMut.mutate(data)}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">거래 내역</h3>
        {isLoading ? (
          <PageLoading />
        ) : !rows?.length ? (
          <p className="p-2 text-sm text-gray-400">거래 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-gray-200 p-3">
                {editingId === row.id ? (
                  <TransactionForm
                    funds={funds || []}
                    companies={companies || []}
                    investments={investments || []}
                    initial={{
                      investment_id: row.investment_id,
                      fund_id: row.fund_id,
                      company_id: row.company_id,
                      transaction_date: row.transaction_date,
                      type: row.type,
                      amount: row.amount,
                      shares_change: row.shares_change,
                      balance_before: row.balance_before,
                      balance_after: row.balance_after,
                      realized_gain: row.realized_gain,
                      cumulative_gain: row.cumulative_gain,
                      memo: row.memo,
                    }}
                    submitLabel="저장"
                    loading={updateMut.isPending}
                    onSubmit={(data) => updateMut.mutate({ id: row.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {toDate(row.transaction_date)} | {labelTransactionType(row.type)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        조합: {row.fund_name || fundNameMap.get(row.fund_id) || row.fund_id} | 투자사:{' '}
                        {row.company_name || companyNameMap.get(row.company_id) || row.company_id} | 투자건 #{row.investment_id}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        금액 {toAmount(row.amount)} | 주식수 변동 {toAmount(row.shares_change)} | 실현손익 {toAmount(row.realized_gain)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        거래 전 잔액 {toAmount(row.balance_before)} {'->'} 거래 후 잔액 {toAmount(row.balance_after)} | 누적손익 {toAmount(row.cumulative_gain)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        상태: {labelStatus('completed')} | 비고: {row.memo || '-'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingId(row.id)}
                        className="secondary-btn"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('이 거래를 삭제하시겠습니까?')) deleteMut.mutate(row.id)
                        }}
                        className="danger-btn"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}











