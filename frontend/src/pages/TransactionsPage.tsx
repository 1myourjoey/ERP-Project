import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createTransaction,
  deleteTransaction,
  downloadGeneratedDocument,
  fetchCompanies,
  fetchFunds,
  fetchInvestments,
  fetchTransactionLedger,
  fetchTransactionSummary,
  fetchTransactions,
  generateDocumentByBuilder,
  updateTransaction,
  type Company,
  type Fund,
  type Transaction,
  type TransactionInput,
  type TransactionLedgerItem,
  type TransactionSummary,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { invalidateFundRelated } from '../lib/queryInvalidation'
import { formatKRW } from '../lib/labels'

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
  transaction_subtype: string
  date_from: string
  date_to: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const EMPTY_FILTERS: FilterState = {
  fund_id: null,
  company_id: null,
  investment_id: null,
  type: '',
  transaction_subtype: '',
  date_from: '',
  date_to: '',
}

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'investment', label: '투자' },
  { value: 'conversion', label: '전환' },
  { value: 'exit', label: '회수' },
  { value: 'dividend', label: '배당' },
  { value: 'follow_on', label: '후속 투자' },
  { value: 'other', label: '기타' },
]

const SUBTYPE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  investment: [
    { value: 'new_investment', label: '신규 투자' },
    { value: 'follow_on', label: '후속 투자' },
  ],
  conversion: [
    { value: 'cb_conversion', label: 'CB 전환' },
    { value: 'cps_conversion', label: 'CPS 전환' },
  ],
  exit: [
    { value: 'mna_sale', label: 'M&A 매각' },
    { value: 'ipo_sale', label: 'IPO 매각' },
    { value: 'buyback', label: '자사주 매입' },
  ],
  dividend: [
    { value: 'cash_dividend', label: '현금배당' },
    { value: 'stock_dividend', label: '주식배당' },
  ],
  follow_on: [
    { value: 'bridge_round', label: '브릿지 라운드' },
    { value: 'pro_rata', label: '프로라타' },
  ],
  other: [{ value: 'other', label: '기타' }],
}

const EMPTY_INPUT: TransactionInput = {
  investment_id: 0,
  fund_id: 0,
  company_id: 0,
  transaction_date: todayIso(),
  settlement_date: null,
  type: 'investment',
  transaction_subtype: 'new_investment',
  counterparty: '',
  conversion_detail: '',
  amount: 0,
  shares_change: null,
  balance_before: null,
  balance_after: null,
  realized_gain: null,
  cumulative_gain: null,
  memo: '',
}

function labelType(value: string | null | undefined): string {
  if (!value) return '-'
  return TRANSACTION_TYPE_OPTIONS.find((row) => row.value === value)?.label ?? value
}

function labelSubtype(type: string | null | undefined, subtype: string | null | undefined): string {
  if (!subtype) return '-'
  const options = SUBTYPE_OPTIONS[type || 'other'] || SUBTYPE_OPTIONS.other
  return options.find((row) => row.value === subtype)?.label ?? subtype
}

function TransactionForm({
  funds,
  companies,
  investments,
  initial,
  submitLabel,
  loading,
  onSubmit,
  onCancel,
}: {
  funds: Fund[]
  companies: Company[]
  investments: InvestmentOption[]
  initial: TransactionInput
  submitLabel: string
  loading: boolean
  onSubmit: (data: TransactionInput) => void
  onCancel: () => void
}) {
  const { addToast } = useToast()
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

  const subtypeOptions = useMemo(
    () => SUBTYPE_OPTIONS[form.type] || SUBTYPE_OPTIONS.other,
    [form.type],
  )

  const requiresShares = form.type === 'investment' || form.type === 'exit'
  const requiresConversion = form.type === 'conversion'
  const requiresGain = form.type === 'exit'

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
          <select
            value={form.fund_id || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, fund_id: Number(e.target.value) || 0 }))}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            <option value="">조합 선택</option>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">투자사</label>
          <select
            value={form.company_id || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, company_id: Number(e.target.value) || 0 }))}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            <option value="">투자사 선택</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">투자건</label>
          <select
            value={form.investment_id || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, investment_id: Number(e.target.value) || 0 }))}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            <option value="">투자건 선택</option>
            {filteredInvestments.map((investment) => (
              <option key={investment.id} value={investment.id}>
                #{investment.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">거래일</label>
          <input
            type="date"
            value={form.transaction_date}
            onChange={(e) => setForm((prev) => ({ ...prev, transaction_date: e.target.value }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">결제일</label>
          <input
            type="date"
            value={form.settlement_date || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, settlement_date: e.target.value || null }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">유형</label>
          <select
            value={form.type}
            onChange={(e) => {
              const nextType = e.target.value
              const nextSubtype = (SUBTYPE_OPTIONS[nextType] || SUBTYPE_OPTIONS.other)[0]?.value || 'other'
              setForm((prev) => ({ ...prev, type: nextType, transaction_subtype: nextSubtype }))
            }}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            {TRANSACTION_TYPE_OPTIONS.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">세부유형</label>
          <select
            value={form.transaction_subtype || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, transaction_subtype: e.target.value }))}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            {subtypeOptions.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">금액</label>
          <input
            type="number"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: Number(e.target.value || 0) }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">거래상대방</label>
          <input
            value={form.counterparty || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, counterparty: e.target.value }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            주식수 변동 {requiresShares ? '(필수)' : '(선택)'}
          </label>
          <input
            type="number"
            value={form.shares_change ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, shares_change: e.target.value ? Number(e.target.value) : null }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            실현손익 {requiresGain ? '(필수)' : '(선택)'}
          </label>
          <input
            type="number"
            value={form.realized_gain ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, realized_gain: e.target.value ? Number(e.target.value) : null }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            전환 상세 {requiresConversion ? '(필수)' : '(선택)'}
          </label>
          <input
            value={form.conversion_detail || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, conversion_detail: e.target.value }))}
            placeholder="예: 전환가 10,000원 / 5,000주"
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div className="md:col-span-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">비고</label>
          <input
            value={form.memo || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          className="primary-btn"
          disabled={loading}
          onClick={() => {
            if (!form.fund_id || !form.company_id || !form.investment_id || !form.transaction_date || !form.type) {
              addToast('error', '필수 입력값을 확인하세요.')
              return
            }
            if (requiresShares && form.shares_change == null) {
              addToast('error', '해당 유형은 주식수 변동 입력이 필요합니다.')
              return
            }
            if (requiresGain && form.realized_gain == null) {
              addToast('error', '해당 유형은 실현손익 입력이 필요합니다.')
              return
            }
            if (requiresConversion && !form.conversion_detail?.trim()) {
              addToast('error', '전환 상세를 입력하세요.')
              return
            }
            onSubmit({
              ...form,
              transaction_subtype: form.transaction_subtype?.trim() || null,
              counterparty: form.counterparty?.trim() || null,
              conversion_detail: form.conversion_detail?.trim() || null,
              memo: form.memo?.trim() || null,
            })
          }}
        >
          {loading ? '저장 중...' : submitLabel}
        </button>
        <button className="secondary-btn btn-sm" onClick={onCancel}>
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
      type: filters.type || undefined,
      transaction_subtype: filters.transaction_subtype || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
    }),
    [filters],
  )

  const { data: funds = [] } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies = [] } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })
  const { data: investments = [] } = useQuery<InvestmentOption[]>({
    queryKey: ['investments', 'tx-options'],
    queryFn: () => fetchInvestments(),
  })
  const { data: rows = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', params],
    queryFn: () => fetchTransactions(params),
  })
  const { data: ledgerRows = [] } = useQuery<TransactionLedgerItem[]>({
    queryKey: ['transactionLedger', params],
    queryFn: () => fetchTransactionLedger(params),
  })
  const { data: summary } = useQuery<TransactionSummary>({
    queryKey: ['transactionSummary', params],
    queryFn: () => fetchTransactionSummary(params),
  })

  const createMut = useMutation({
    mutationFn: (data: TransactionInput) => createTransaction(data),
    onSuccess: () => {
      invalidateFundRelated(queryClient, filters.fund_id)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactionLedger'] })
      queryClient.invalidateQueries({ queryKey: ['transactionSummary'] })
      setShowCreate(false)
      addToast('success', '거래를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TransactionInput> }) => updateTransaction(id, data),
    onSuccess: () => {
      invalidateFundRelated(queryClient, filters.fund_id)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactionLedger'] })
      queryClient.invalidateQueries({ queryKey: ['transactionSummary'] })
      setEditingId(null)
      addToast('success', '거래를 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTransaction(id),
    onSuccess: () => {
      invalidateFundRelated(queryClient, filters.fund_id)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactionLedger'] })
      queryClient.invalidateQueries({ queryKey: ['transactionSummary'] })
      addToast('success', '거래를 삭제했습니다.')
    },
  })
  const generateInstructionMut = useMutation({
    mutationFn: async ({ transactionId }: { transactionId: number }) => {
      const generated = await generateDocumentByBuilder({
        builder: 'operation_instruction',
        params: { transaction_id: transactionId },
      })
      const blob = await downloadGeneratedDocument(generated.document_id)
      return { generated, blob }
    },
    onSuccess: ({ generated, blob }) => {
      downloadBlob(blob, generated.filename)
      queryClient.invalidateQueries({ queryKey: ['generatedDocuments'] })
      addToast('success', '운용지시서를 생성했습니다.')
    },
  })

  const fundNameMap = useMemo(() => new Map(funds.map((fund) => [fund.id, fund.name])), [funds])
  const companyNameMap = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies])

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">거래원장</h2>
          <p className="page-subtitle">유형별 거래와 누적 잔액 흐름을 함께 관리합니다.</p>
        </div>
        <button className="primary-btn" onClick={() => setShowCreate((prev) => !prev)}>
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
              <option value="">전체</option>
              {funds.map((fund) => (
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
              <option value="">전체</option>
              {companies.map((company) => (
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
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">유형</label>
            <select
              value={filters.type}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  type: e.target.value,
                  transaction_subtype: '',
                }))
              }
              className="w-full rounded border px-2 py-1 text-sm"
            >
              <option value="">전체</option>
              {TRANSACTION_TYPE_OPTIONS.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">세부유형</label>
            <input
              value={filters.transaction_subtype}
              onChange={(e) => setFilters((prev) => ({ ...prev, transaction_subtype: e.target.value }))}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">시작일</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">종료일</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button className="secondary-btn" onClick={() => setFilters(EMPTY_FILTERS)}>
              필터 초기화
            </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <TransactionForm
          funds={funds}
          companies={companies}
          investments={investments}
          initial={EMPTY_INPUT}
          submitLabel="등록"
          loading={createMut.isPending}
          onSubmit={(data) => createMut.mutate(data)}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card-base p-3">
          <p className="text-xs text-gray-500">총 거래 건수</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{summary?.total_count ?? 0}</p>
        </div>
        <div className="card-base p-3">
          <p className="text-xs text-gray-500">총 거래 금액</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{formatKRW(summary?.total_amount ?? 0)}</p>
        </div>
        <div className="card-base p-3">
          <p className="text-xs text-gray-500">원장 건수</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{ledgerRows.length}</p>
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">유형별 요약</h3>
        {!summary?.items?.length ? (
          <p className="text-sm text-gray-500">요약 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {summary.items.map((item) => (
              <div key={`${item.type}-${item.transaction_subtype || 'none'}`} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <span>
                  {labelType(item.type)} / {labelSubtype(item.type, item.transaction_subtype)}
                </span>
                <span className="text-gray-600">
                  {item.count}건 · {formatKRW(item.total_amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">거래 원장 (누적 잔액)</h3>
        {!ledgerRows.length ? (
          <p className="text-sm text-gray-500">원장 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-2 py-2 text-left">일자</th>
                  <th className="px-2 py-2 text-left">유형</th>
                  <th className="px-2 py-2 text-left">세부유형</th>
                  <th className="px-2 py-2 text-right">금액</th>
                  <th className="px-2 py-2 text-right">누적 잔액</th>
                  <th className="px-2 py-2 text-left">상대방</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-2">{toDate(row.transaction_date)}</td>
                    <td className="px-2 py-2">{labelType(row.type)}</td>
                    <td className="px-2 py-2">{labelSubtype(row.type, row.transaction_subtype)}</td>
                    <td className="px-2 py-2 text-right">{formatKRW(row.amount)}</td>
                    <td className="px-2 py-2 text-right">{formatKRW(row.running_balance)}</td>
                    <td className="px-2 py-2">{row.counterparty || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">거래 내역</h3>
        {isLoading ? (
          <PageLoading />
        ) : !rows.length ? (
          <EmptyState emoji="💳" message="거래 내역이 없습니다." className="py-8" />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded border border-gray-200 p-3">
                {editingId === row.id ? (
                  <TransactionForm
                    funds={funds}
                    companies={companies}
                    investments={investments}
                    initial={{
                      investment_id: row.investment_id,
                      fund_id: row.fund_id,
                      company_id: row.company_id,
                      transaction_date: row.transaction_date,
                      settlement_date: row.settlement_date,
                      type: row.type,
                      transaction_subtype: row.transaction_subtype,
                      counterparty: row.counterparty,
                      conversion_detail: row.conversion_detail,
                      amount: row.amount,
                      shares_change: row.shares_change,
                      balance_before: row.balance_before,
                      balance_after: row.balance_after,
                      realized_gain: row.realized_gain,
                      cumulative_gain: row.cumulative_gain,
                      memo: row.memo,
                    }}
                    submitLabel="수정 저장"
                    loading={updateMut.isPending}
                    onSubmit={(data) => updateMut.mutate({ id: row.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm">
                      <p className="font-medium text-gray-800">
                        {toDate(row.transaction_date)} · {labelType(row.type)} · {labelSubtype(row.type, row.transaction_subtype)}
                      </p>
                      <p className="text-xs text-gray-500">
                        조합: {row.fund_name || fundNameMap.get(row.fund_id) || row.fund_id} · 투자사:{' '}
                        {row.company_name || companyNameMap.get(row.company_id) || row.company_id} · 투자건 #{row.investment_id}
                      </p>
                      <p className="text-xs text-gray-500">
                        금액 {formatKRW(row.amount)} · 주식수 {row.shares_change ?? '-'} · 실현손익 {formatKRW(row.realized_gain)}
                      </p>
                      <p className="text-xs text-gray-500">
                        결제일 {toDate(row.settlement_date)} · 상대방 {row.counterparty || '-'} · 비고 {row.memo || '-'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="secondary-btn"
                        disabled={generateInstructionMut.isPending && generateInstructionMut.variables?.transactionId === row.id}
                        onClick={() => generateInstructionMut.mutate({ transactionId: row.id })}
                      >
                        운용지시서 생성
                      </button>
                      <button className="secondary-btn" onClick={() => setEditingId(row.id)}>
                        수정
                      </button>
                      <button
                        className="danger-btn"
                        onClick={() => {
                          if (confirm('이 거래를 삭제하시겠습니까?')) {
                            deleteMut.mutate(row.id)
                          }
                        }}
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
