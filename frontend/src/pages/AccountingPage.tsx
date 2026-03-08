import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAccount,
  createJournalEntry,
  deleteAccount,
  deleteJournalEntry,
  fetchAccounts,
  fetchFunds,
  fetchJournalEntries,
  fetchTrialBalance,
  updateAccount,
  updateJournalEntry,
  type Account,
  type AccountInput,
  type Fund,
  type JournalEntry,
  type JournalEntryInput,
  type TrialBalanceItem,
} from '../lib/api'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import WorkbenchSplit from '../components/common/page/WorkbenchSplit'
import FinanceTabStrip from '../components/finance/FinanceTabStrip'
import { useToast } from '../contexts/ToastContext'

type TabKey = 'accounts' | 'journal' | 'ledger' | 'trial'

const CATEGORY_OPTIONS = ['자산', '부채', '자본', '수익', '비용']
const ENTRY_STATUS_OPTIONS = ['미결재', '결재완료']
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'accounts', label: '계정과목' },
  { key: 'journal', label: '전표' },
  { key: 'ledger', label: '원장' },
  { key: 'trial', label: '합계잔액' },
]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString()
}

function entryTotals(entry: JournalEntry) {
  const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
  const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
  const balanced = Math.round(debit * 100) === Math.round(credit * 100)
  return { debit, credit, balanced }
}

function statusTone(status: string): 'default' | 'warning' | 'success' {
  if (status === '결재완료') return 'success'
  if (status === '미결재') return 'warning'
  return 'default'
}

function JournalForm({
  title,
  funds,
  accounts,
  initial,
  loading,
  onSubmit,
  onCancel,
}: {
  title: string
  funds: Fund[]
  accounts: Account[]
  initial: JournalEntryInput
  loading: boolean
  onSubmit: (data: JournalEntryInput) => void
  onCancel?: () => void
}) {
  const [form, setForm] = useState<JournalEntryInput>(initial)

  const debitTotal = form.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
  const creditTotal = form.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
  const balanced = Math.round(debitTotal * 100) === Math.round(creditTotal * 100) && form.lines.length > 0

  return (
    <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
      <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">{title}</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
          <select
            value={form.fund_id || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, fund_id: Number(e.target.value) || 0 }))}
            className="form-input"
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
          <label className="mb-1 block text-xs font-medium text-[#64748b]">전표일</label>
          <input
            type="date"
            value={form.entry_date}
            onChange={(e) => setForm((prev) => ({ ...prev, entry_date: e.target.value }))}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
          <select
            value={form.status || '미결재'}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            className="form-input"
          >
            {ENTRY_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">적요</label>
          <input
            value={form.description || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="form-input"
            placeholder="예: 관리비 지급"
          />
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {form.lines.map((line, index) => (
          <div key={`${line.account_id}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[#64748b]">계정과목</label>
              <select
                value={line.account_id || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], account_id: Number(e.target.value) || 0 }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="form-input"
              >
                <option value="">계정과목</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[#64748b]">차변</label>
              <input
                type="number"
                value={line.debit || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], debit: e.target.value ? Number(e.target.value) : 0 }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="form-input"
                placeholder="숫자 입력"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[#64748b]">대변</label>
              <input
                type="number"
                value={line.credit || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], credit: e.target.value ? Number(e.target.value) : 0 }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="form-input"
                placeholder="숫자 입력"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] font-medium text-[#64748b]">라인 비고</label>
              <input
                value={line.memo || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], memo: e.target.value }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="form-input"
                placeholder="선택 입력"
              />
            </div>
            <button
              onClick={() => setForm((prev) => ({ ...prev, lines: prev.lines.filter((_, lineIndex) => lineIndex !== index) }))}
              className="danger-btn"
              disabled={form.lines.length <= 1}
            >
              삭제
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => setForm((prev) => ({ ...prev, lines: [...prev.lines, { account_id: 0, debit: 0, credit: 0, memo: '' }] }))}
          className="secondary-btn"
        >
          + 라인 추가
        </button>
        <p className={`text-xs ${balanced ? 'text-green-700' : 'text-red-700'}`}>
          차변 합계 {formatNumber(debitTotal)} / 대변 합계 {formatNumber(creditTotal)}
        </p>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            if (!form.fund_id || !form.entry_date || !balanced) return
            onSubmit({
              ...form,
              description: form.description?.trim() || null,
              lines: form.lines.map((line) => ({ ...line, memo: line.memo?.trim() || null })),
            })
          }}
          disabled={loading || !balanced}
          className="primary-btn"
        >
          저장
        </button>
        {onCancel && (
          <button onClick={onCancel} className="secondary-btn btn-sm">
            취소
          </button>
        )}
      </div>
    </div>
  )
}

export default function AccountingPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [tab, setTab] = useState<TabKey>('accounts')
  const [fundId, setFundId] = useState<number | null>(null)
  const [asOfDate, setAsOfDate] = useState(todayIso())
  const [ledgerAccountId, setLedgerAccountId] = useState<number | null>(null)
  const [expandedEntryId, setExpandedEntryId] = useState<number | null>(null)
  const [newEntryResetKey, setNewEntryResetKey] = useState(0)

  const [newAccount, setNewAccount] = useState<AccountInput>({
    fund_id: null,
    code: '',
    name: '',
    category: '자산',
    sub_category: '',
    normal_side: '차변',
    is_active: 'true',
    display_order: 0,
  })
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [editAccount, setEditAccount] = useState<AccountInput | null>(null)

  const [newEntry, setNewEntry] = useState<JournalEntryInput>({
    fund_id: 0,
    entry_date: todayIso(),
    entry_type: '일반분개',
    description: '',
    status: '미결재',
    source_type: null,
    source_id: null,
    lines: [{ account_id: 0, debit: 0, credit: 0, memo: '' }],
  })
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
  const [editEntry, setEditEntry] = useState<JournalEntryInput | null>(null)

  const { data: funds = [] } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const selectedFundId = useMemo(() => fundId || funds[0]?.id || null, [fundId, funds])
  const selectedFund = useMemo(
    () => funds.find((fund) => fund.id === selectedFundId) ?? null,
    [funds, selectedFundId],
  )

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', selectedFundId],
    queryFn: () => fetchAccounts({ fund_id: selectedFundId as number }),
    enabled: !!selectedFundId,
  })

  const { data: entries = [] } = useQuery<JournalEntry[]>({
    queryKey: ['journalEntries', selectedFundId],
    queryFn: () => fetchJournalEntries({ fund_id: selectedFundId as number }),
    enabled: !!selectedFundId,
  })

  const { data: trialBalance = [] } = useQuery<TrialBalanceItem[]>({
    queryKey: ['trialBalance', selectedFundId, asOfDate],
    queryFn: () => fetchTrialBalance(selectedFundId as number, asOfDate),
    enabled: !!selectedFundId,
  })

  const createAccountMut = useMutation({
    mutationFn: (data: AccountInput) => createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setNewAccount({
        fund_id: null,
        code: '',
        name: '',
        category: '자산',
        sub_category: '',
        normal_side: '차변',
        is_active: 'true',
        display_order: 0,
      })
      addToast('success', '계정과목을 등록했습니다.')
    },
  })

  const updateAccountMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AccountInput> }) => updateAccount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setEditingAccountId(null)
      setEditAccount(null)
      addToast('success', '계정과목을 수정했습니다.')
    },
  })

  const deleteAccountMut = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      addToast('success', '계정과목을 삭제했습니다.')
    },
  })

  const createEntryMut = useMutation({
    mutationFn: (data: JournalEntryInput) => createJournalEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] })
      setNewEntry({
        fund_id: selectedFundId || 0,
        entry_date: todayIso(),
        entry_type: '일반분개',
        description: '',
        status: '미결재',
        source_type: null,
        source_id: null,
        lines: [{ account_id: 0, debit: 0, credit: 0, memo: '' }],
      })
      setNewEntryResetKey((prev) => prev + 1)
      addToast('success', '전표를 등록했습니다.')
    },
  })

  const updateEntryMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<JournalEntryInput> }) => updateJournalEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] })
      setEditingEntryId(null)
      setEditEntry(null)
      addToast('success', '전표를 수정했습니다.')
    },
  })

  const deleteEntryMut = useMutation({
    mutationFn: (id: number) => deleteJournalEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] })
      addToast('success', '전표를 삭제했습니다.')
    },
  })

  const accountNameMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, `${account.code} ${account.name}`])),
    [accounts],
  )
  const selectedLedgerAccountId = useMemo(
    () => ledgerAccountId || accounts[0]?.id || null,
    [ledgerAccountId, accounts],
  )
  const ledgerRows = useMemo(() => {
    if (!selectedLedgerAccountId || !entries.length) return []
    const rows = entries
      .flatMap((entry) =>
        entry.lines
          .filter((line) => line.account_id === selectedLedgerAccountId)
          .map((line) => ({
            entry_id: entry.id,
            entry_date: entry.entry_date,
            description: entry.description || '-',
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
          })),
      )
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.entry_id - b.entry_id)

    let running = 0
    return rows.map((row) => {
      running += row.debit - row.credit
      return { ...row, running_balance: running }
    })
  }, [entries, selectedLedgerAccountId])
  const ledgerTotals = useMemo(
    () => ({
      debit: ledgerRows.reduce((sum, row) => sum + row.debit, 0),
      credit: ledgerRows.reduce((sum, row) => sum + row.credit, 0),
      balance: ledgerRows.length ? ledgerRows[ledgerRows.length - 1].running_balance : 0,
    }),
    [ledgerRows],
  )

  const pendingEntryCount = useMemo(
    () => entries.filter((entry) => entry.status === '미결재').length,
    [entries],
  )
  const unbalancedEntryCount = useMemo(
    () => entries.filter((entry) => !entryTotals(entry).balanced).length,
    [entries],
  )

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="회계"
        subtitle="계정과목, 전표, 원장, 합계잔액을 같은 재무 작업대에서 관리합니다."
      />

      <PageMetricStrip
        columns={5}
        items={[
          { label: '선택 조합', value: selectedFund?.name || '-', hint: '현재 작업 기준', tone: 'info' },
          { label: '계정과목 수', value: `${accounts.length}개`, hint: '선택 조합 기준', tone: 'default' },
          { label: '전표 수', value: `${entries.length}건`, hint: '등록 전표', tone: 'default' },
          {
            label: '미결재 전표',
            value: `${pendingEntryCount}건`,
            hint: '결재 대기',
            tone: pendingEntryCount ? 'warning' : 'success',
          },
          {
            label: '차대 불일치',
            value: `${unbalancedEntryCount}건`,
            hint: '합계 검토 필요',
            tone: unbalancedEntryCount ? 'danger' : 'success',
          },
        ]}
      />

      <PageControlStrip compact>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:items-end">
          <div>
            <label className="form-label">조합</label>
            <select
              value={selectedFundId || ''}
              onChange={(e) => setFundId(Number(e.target.value) || null)}
              className="form-input"
            >
              <option value="">조합 선택</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </div>
          <FinanceTabStrip
            tabs={TABS.map((item) => ({
              ...item,
              countLabel:
                item.key === 'accounts'
                  ? `${accounts.length}개`
                  : item.key === 'journal'
                    ? `${entries.length}건`
                    : item.key === 'ledger'
                      ? `${ledgerRows.length}행`
                      : `${trialBalance.length}행`,
            }))}
            activeTab={tab}
            onChange={setTab}
          />
        </div>
      </PageControlStrip>

      {tab === 'accounts' && (
        <WorkbenchSplit
          primary={
            <SectionScaffold title="계정과목 등록" description="선택 조합의 계정 체계를 입력 패널에서 관리합니다.">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <div>
                  <label className="form-label">코드</label>
                  <input value={newAccount.code} onChange={(e) => setNewAccount((prev) => ({ ...prev, code: e.target.value }))} className="form-input" placeholder="예: 1110" />
                </div>
                <div>
                  <label className="form-label">계정명</label>
                  <input value={newAccount.name} onChange={(e) => setNewAccount((prev) => ({ ...prev, name: e.target.value }))} className="form-input" placeholder="예: 현금" />
                </div>
                <div>
                  <label className="form-label">대분류</label>
                  <select value={newAccount.category} onChange={(e) => setNewAccount((prev) => ({ ...prev, category: e.target.value }))} className="form-input">
                    {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">중분류</label>
                  <input value={newAccount.sub_category || ''} onChange={(e) => setNewAccount((prev) => ({ ...prev, sub_category: e.target.value }))} className="form-input" placeholder="선택 입력" />
                </div>
                <div>
                  <label className="form-label">정상 차/대변</label>
                  <select value={newAccount.normal_side || '차변'} onChange={(e) => setNewAccount((prev) => ({ ...prev, normal_side: e.target.value }))} className="form-input">
                    <option value="차변">차변</option>
                    <option value="대변">대변</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">정렬순서</label>
                  <input type="number" value={newAccount.display_order || 0} onChange={(e) => setNewAccount((prev) => ({ ...prev, display_order: Number(e.target.value || 0) }))} className="form-input" placeholder="0" />
                </div>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => {
                    if (!newAccount.code.trim() || !newAccount.name.trim() || !newAccount.category) return
                    createAccountMut.mutate({
                      ...newAccount,
                      fund_id: selectedFundId || null,
                      code: newAccount.code.trim(),
                      name: newAccount.name.trim(),
                      sub_category: newAccount.sub_category?.trim() || null,
                    })
                  }}
                  disabled={createAccountMut.isPending}
                  className="primary-btn btn-sm"
                >
                  등록
                </button>
              </div>
            </SectionScaffold>
          }
          secondary={
            <SectionScaffold
              title="계정과목 목록"
              description="고정 높이 목록에서 카테고리, 코드, 정상잔액을 빠르게 훑고 필요한 계정만 수정합니다."
              actions={
                <div className="finance-inline-summary">
                  <span className="finance-summary-chip">총 {accounts.length}개</span>
                  <span className="finance-summary-chip">자산 {accounts.filter((account) => account.category === '자산').length}</span>
                  <span className="finance-summary-chip">비용 {accounts.filter((account) => account.category === '비용').length}</span>
                </div>
              }
            >
              <div className="compact-table-wrap max-h-[520px] rounded-xl border border-[#d8e5fb]">
                <table className="min-w-[760px] w-full text-xs">
                  <thead className="table-head-row sticky top-0 z-10">
                    <tr>
                      <th className="table-head-cell !py-2">카테고리</th>
                      <th className="table-head-cell !py-2">코드</th>
                      <th className="table-head-cell !py-2">계정명</th>
                      <th className="table-head-cell !py-2">중분류</th>
                      <th className="table-head-cell !py-2">정상잔액</th>
                      <th className="table-head-cell text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id} className="border-b">
                        <td className="table-body-cell !py-2">{account.category}</td>
                        <td className="table-body-cell !py-2 font-data">{account.code}</td>
                        <td className="table-body-cell !py-2 font-medium text-[#0f1f3d]">{account.name}</td>
                        <td className="table-body-cell !py-2">{account.sub_category || '-'}</td>
                        <td className="table-body-cell !py-2">{account.normal_side || '-'}</td>
                        <td className="table-body-cell !py-2 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => {
                                setEditingAccountId(account.id)
                                setEditAccount({
                                  fund_id: account.fund_id,
                                  code: account.code,
                                  name: account.name,
                                  category: account.category,
                                  sub_category: account.sub_category,
                                  normal_side: account.normal_side,
                                  is_active: account.is_active,
                                  display_order: account.display_order,
                                })
                              }}
                              className="secondary-btn btn-xs"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('이 계정과목을 삭제하시겠습니까?')) deleteAccountMut.mutate(account.id)
                              }}
                              className="danger-btn btn-xs"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editingAccountId && editAccount ? (
                <div className="mt-2 rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#0f1f3d]">선택 계정 수정</p>
                    <span className="finance-summary-chip">{editAccount.code || '-'} · {editAccount.name || '-'}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                    <input value={editAccount.code || ''} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, code: e.target.value } : prev))} className="form-input" placeholder="코드" />
                    <input value={editAccount.name || ''} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, name: e.target.value } : prev))} className="form-input" placeholder="계정명" />
                    <input value={editAccount.sub_category || ''} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, sub_category: e.target.value } : prev))} className="form-input" placeholder="중분류" />
                    <select value={editAccount.category || '자산'} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, category: e.target.value } : prev))} className="form-input">
                      {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <select value={editAccount.normal_side || '차변'} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, normal_side: e.target.value } : prev))} className="form-input">
                      <option value="차변">차변</option>
                      <option value="대변">대변</option>
                    </select>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        updateAccountMut.mutate({
                          id: editingAccountId,
                          data: {
                            ...editAccount,
                            code: editAccount.code?.trim(),
                            name: editAccount.name?.trim(),
                            sub_category: editAccount.sub_category?.trim() || null,
                          },
                        })
                      }
                      className="primary-btn btn-sm"
                    >
                      저장
                    </button>
                    <button onClick={() => { setEditingAccountId(null); setEditAccount(null) }} className="secondary-btn btn-sm">취소</button>
                  </div>
                </div>
              ) : null}
            </SectionScaffold>
          }
        />
      )}

      {tab === 'journal' && (
        <WorkbenchSplit
          primary={
            <SectionScaffold
              title={editingEntryId && editEntry ? '전표 수정' : '신규 전표 등록'}
              description="차변·대변 라인을 작성하고 균형 여부를 즉시 확인합니다."
            >
              {editingEntryId && editEntry ? (
                <JournalForm
                  key={`edit-${editingEntryId}`}
                  title="전표 수정"
                  funds={funds}
                  accounts={accounts}
                  initial={editEntry}
                  loading={updateEntryMut.isPending}
                  onSubmit={(data) => updateEntryMut.mutate({ id: editingEntryId, data })}
                  onCancel={() => { setEditingEntryId(null); setEditEntry(null) }}
                />
              ) : (
                <JournalForm
                  key={`new-${selectedFundId || 0}-${newEntryResetKey}`}
                  title="신규 전표 등록"
                  funds={funds}
                  accounts={accounts}
                  initial={{ ...newEntry, fund_id: newEntry.fund_id || (selectedFundId || 0) }}
                  loading={createEntryMut.isPending}
                  onSubmit={(data) => {
                    createEntryMut.mutate(data)
                    setNewEntry(data)
                  }}
                />
              )}
            </SectionScaffold>
          }
          secondary={
            <SectionScaffold title="전표 목록" description="전표 요약을 먼저 보고 필요할 때 라인 상세를 펼쳐 확인합니다.">
              {!entries.length ? (
                <div className="finance-empty">전표가 없습니다.</div>
              ) : (
                <div className="finance-list">
                  {entries.map((entry) => {
                    const totals = entryTotals(entry)
                    const expanded = expandedEntryId === entry.id
                    return (
                      <div key={entry.id} className="finance-list-row">
                        <div className="finance-list-row-main">
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpandedEntryId(expanded ? null : entry.id)}>
                            <p className="finance-list-row-title">{entry.entry_date} · {entry.description || '적요 없음'}</p>
                            <p className="finance-list-row-meta">라인 {entry.lines.length}개 · 차변 {formatNumber(totals.debit)} · 대변 {formatNumber(totals.credit)}</p>
                          </button>
                          <div className="finance-list-row-actions">
                            <span className={`finance-status-pill finance-status-${statusTone(entry.status)}`}>{entry.status}</span>
                            <button
                              onClick={() => {
                                setEditingEntryId(entry.id)
                                setEditEntry({
                                  fund_id: entry.fund_id,
                                  entry_date: entry.entry_date,
                                  entry_type: entry.entry_type,
                                  description: entry.description,
                                  status: entry.status,
                                  source_type: entry.source_type,
                                  source_id: entry.source_id,
                                  lines: entry.lines.map((line) => ({
                                    account_id: line.account_id,
                                    debit: line.debit,
                                    credit: line.credit,
                                    memo: line.memo,
                                  })),
                                })
                              }}
                              className="secondary-btn btn-xs"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('이 전표를 삭제하시겠습니까?')) deleteEntryMut.mutate(entry.id)
                              }}
                              className="danger-btn btn-xs"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        <div className="finance-inline-summary">
                          <span className="finance-summary-chip">전표 ID #{entry.id}</span>
                          <span className="finance-summary-chip">{totals.balanced ? '차대 일치' : '차대 불일치'}</span>
                        </div>
                        {expanded ? (
                          <div className="compact-table-wrap pt-2">
                            <table className="min-w-[620px] w-full text-xs">
                              <thead className="table-head-row">
                                <tr>
                                  <th className="table-head-cell">계정과목</th>
                                  <th className="table-head-cell text-right">차변</th>
                                  <th className="table-head-cell text-right">대변</th>
                                  <th className="table-head-cell">비고</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.lines.map((line) => (
                                  <tr key={line.id}>
                                    <td className="table-body-cell">{accountNameMap.get(line.account_id) || line.account_name || line.account_id}</td>
                                    <td className="table-body-cell text-right font-data">{formatNumber(line.debit)}</td>
                                    <td className="table-body-cell text-right font-data">{formatNumber(line.credit)}</td>
                                    <td className="table-body-cell">{line.memo || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionScaffold>
          }
        />
      )}

      {tab === 'ledger' && (
        <SectionScaffold
          title="계정별 원장"
          description="선택한 계정의 전표 흐름과 누적 잔액을 순서대로 조회합니다."
          actions={
            <div className="w-[240px]">
              <label className="form-label">계정과목</label>
              <select value={selectedLedgerAccountId || ''} onChange={(e) => setLedgerAccountId(Number(e.target.value) || null)} className="form-input">
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} {account.name}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {!ledgerRows.length ? (
            <div className="finance-empty">선택한 계정의 원장 데이터가 없습니다.</div>
          ) : (
            <div className="compact-table-wrap">
              <table className="min-w-[880px] w-full text-sm">
                <thead className="table-head-row">
                  <tr>
                    <th className="table-head-cell">전표일</th>
                    <th className="table-head-cell">전표 ID</th>
                    <th className="table-head-cell">적요</th>
                    <th className="table-head-cell text-right">차변</th>
                    <th className="table-head-cell text-right">대변</th>
                    <th className="table-head-cell text-right">잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={`${row.entry_id}-${row.entry_date}-${row.debit}-${row.credit}`}>
                      <td className="table-body-cell">{row.entry_date}</td>
                      <td className="table-body-cell font-data">#{row.entry_id}</td>
                      <td className="table-body-cell">{row.description}</td>
                      <td className="table-body-cell text-right font-data">{formatNumber(row.debit)}</td>
                      <td className="table-body-cell text-right font-data">{formatNumber(row.credit)}</td>
                      <td className="table-body-cell text-right font-data font-semibold text-[#0f1f3d]">{formatNumber(row.running_balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#f5f9ff] font-semibold text-[#0f1f3d]">
                    <td className="table-body-cell" colSpan={3}>합계</td>
                    <td className="table-body-cell text-right font-data">{formatNumber(ledgerTotals.debit)}</td>
                    <td className="table-body-cell text-right font-data">{formatNumber(ledgerTotals.credit)}</td>
                    <td className="table-body-cell text-right font-data">{formatNumber(ledgerTotals.balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionScaffold>
      )}

      {tab === 'trial' && (
        <SectionScaffold
          title="합계잔액표"
          description="기준일 현재 계정별 차변·대변 합계와 잔액을 같은 표에서 점검합니다."
          actions={
            <div className="w-[220px]">
              <label className="form-label">기준일</label>
              <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="form-input" />
            </div>
          }
        >
          {!trialBalance.length ? (
            <div className="finance-empty">표시할 합계잔액 데이터가 없습니다.</div>
          ) : (
            <div className="compact-table-wrap">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="table-head-row">
                  <tr>
                    <th className="table-head-cell">카테고리</th>
                    <th className="table-head-cell">코드</th>
                    <th className="table-head-cell">계정명</th>
                    <th className="table-head-cell text-right">차변합계</th>
                    <th className="table-head-cell text-right">대변합계</th>
                    <th className="table-head-cell text-right">잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance.map((item) => (
                    <tr key={item.account_id}>
                      <td className="table-body-cell">{item.category}</td>
                      <td className="table-body-cell font-data">{item.code}</td>
                      <td className="table-body-cell">{item.name}</td>
                      <td className="table-body-cell text-right font-data">{formatNumber(item.debit_total)}</td>
                      <td className="table-body-cell text-right font-data">{formatNumber(item.credit_total)}</td>
                      <td className="table-body-cell text-right font-data">{formatNumber(item.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionScaffold>
      )}
    </div>
  )
}












