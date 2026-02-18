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
import { useToast } from '../contexts/ToastContext'

type TabKey = 'accounts' | 'journal' | 'trial'

const CATEGORY_OPTIONS = ['자산', '부채', '자본', '수익', '비용']
const ENTRY_STATUS_OPTIONS = ['미결재', '결재완료']

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString()
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
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
          <label className="mb-1 block text-xs font-medium text-gray-600">전표일</label>
          <input
            type="date"
            value={form.entry_date}
            onChange={(e) => setForm((prev) => ({ ...prev, entry_date: e.target.value }))}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
          <select
            value={form.status || '미결재'}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            {ENTRY_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">적요</label>
          <input
            value={form.description || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full rounded border px-2 py-1 text-sm"
            placeholder="예: 관리비 지급"
          />
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {form.lines.map((line, index) => (
          <div key={`${line.account_id}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-gray-500">계정과목</label>
              <select
                value={line.account_id || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], account_id: Number(e.target.value) || 0 }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="w-full rounded border px-2 py-1 text-sm"
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
              <label className="mb-1 block text-[10px] font-medium text-gray-500">차변</label>
              <input
                type="number"
                value={line.debit || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], debit: e.target.value ? Number(e.target.value) : 0 }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder="숫자 입력"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-gray-500">대변</label>
              <input
                type="number"
                value={line.credit || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], credit: e.target.value ? Number(e.target.value) : 0 }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder="숫자 입력"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] font-medium text-gray-500">라인 비고</label>
              <input
                value={line.memo || ''}
                onChange={(e) => {
                  const next = [...form.lines]
                  next[index] = { ...next[index], memo: e.target.value }
                  setForm((prev) => ({ ...prev, lines: next }))
                }}
                className="w-full rounded border px-2 py-1 text-sm"
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
          <button onClick={onCancel} className="rounded border bg-white px-3 py-1 text-xs hover:bg-gray-100">
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

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const selectedFundId = useMemo(() => fundId || funds?.[0]?.id || null, [fundId, funds])

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', selectedFundId],
    queryFn: () => fetchAccounts({ fund_id: selectedFundId as number }),
    enabled: !!selectedFundId,
  })

  const { data: entries } = useQuery<JournalEntry[]>({
    queryKey: ['journalEntries', selectedFundId],
    queryFn: () => fetchJournalEntries({ fund_id: selectedFundId as number }),
    enabled: !!selectedFundId,
  })

  const { data: trialBalance } = useQuery<TrialBalanceItem[]>({
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
    () => new Map((accounts || []).map((account) => [account.id, `${account.code} ${account.name}`])),
    [accounts],
  )

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">회계 관리</h2>
          <p className="page-subtitle">계정과목, 전표, 합계잔액표를 관리합니다.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
          <select value={selectedFundId || ''} onChange={(e) => setFundId(Number(e.target.value) || null)} className="rounded border px-2 py-1 text-sm">
            {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab('accounts')} className={`rounded px-3 py-1.5 text-sm ${tab === 'accounts' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>계정과목</button>
        <button onClick={() => setTab('journal')} className={`rounded px-3 py-1.5 text-sm ${tab === 'journal' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>전표</button>
        <button onClick={() => setTab('trial')} className={`rounded px-3 py-1.5 text-sm ${tab === 'trial' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>합계잔액</button>
      </div>

      {tab === 'accounts' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">계정과목 등록</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
              <div><label className="mb-1 block text-xs font-medium text-gray-600">코드</label><input value={newAccount.code} onChange={(e) => setNewAccount((prev) => ({ ...prev, code: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="예: 1110" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-600">계정명</label><input value={newAccount.name} onChange={(e) => setNewAccount((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="예: 현금" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-600">대분류</label><select value={newAccount.category} onChange={(e) => setNewAccount((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">{CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-600">중분류</label><input value={newAccount.sub_category || ''} onChange={(e) => setNewAccount((prev) => ({ ...prev, sub_category: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="선택 입력" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-600">정상 차/대변</label><select value={newAccount.normal_side || '차변'} onChange={(e) => setNewAccount((prev) => ({ ...prev, normal_side: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm"><option value="차변">차변</option><option value="대변">대변</option></select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-600">정렬순서</label><input type="number" value={newAccount.display_order || 0} onChange={(e) => setNewAccount((prev) => ({ ...prev, display_order: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="숫자 입력" /></div>
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
                className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                등록
              </button>
            </div>
          </div>

          <div className="card-base">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="px-2 py-2">카테고리</th>
                    <th className="px-2 py-2">코드</th>
                    <th className="px-2 py-2">계정명</th>
                    <th className="px-2 py-2">중분류</th>
                    <th className="px-2 py-2">정상잔액</th>
                    <th className="px-2 py-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts?.map((account) => (
                    <tr key={account.id} className="border-b">
                      {editingAccountId === account.id && editAccount ? (
                        <>
                          <td className="px-2 py-2">
                            <label className="mb-1 block text-[10px] font-medium text-gray-500">카테고리</label>
                            <select value={editAccount.category || '자산'} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, category: e.target.value } : prev))} className="w-full rounded border px-2 py-1 text-xs">
                              {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-2"><label className="mb-1 block text-[10px] font-medium text-gray-500">코드</label><input value={editAccount.code || ''} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, code: e.target.value } : prev))} className="w-full rounded border px-2 py-1 text-xs" /></td>
                          <td className="px-2 py-2"><label className="mb-1 block text-[10px] font-medium text-gray-500">계정명</label><input value={editAccount.name || ''} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, name: e.target.value } : prev))} className="w-full rounded border px-2 py-1 text-xs" /></td>
                          <td className="px-2 py-2"><label className="mb-1 block text-[10px] font-medium text-gray-500">중분류</label><input value={editAccount.sub_category || ''} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, sub_category: e.target.value } : prev))} className="w-full rounded border px-2 py-1 text-xs" /></td>
                          <td className="px-2 py-2">
                            <label className="mb-1 block text-[10px] font-medium text-gray-500">정상잔액</label>
                            <select value={editAccount.normal_side || '차변'} onChange={(e) => setEditAccount((prev) => (prev ? { ...prev, normal_side: e.target.value } : prev))} className="w-full rounded border px-2 py-1 text-xs">
                              <option value="차변">차변</option>
                              <option value="대변">대변</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateAccountMut.mutate({
                                  id: account.id,
                                  data: {
                                    ...editAccount,
                                    code: editAccount.code?.trim(),
                                    name: editAccount.name?.trim(),
                                    sub_category: editAccount.sub_category?.trim() || null,
                                  },
                                })}
                                className="primary-btn"
                              >
                                저장
                              </button>
                              <button onClick={() => { setEditingAccountId(null); setEditAccount(null) }} className="secondary-btn">취소</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-2">{account.category}</td>
                          <td className="px-2 py-2">{account.code}</td>
                          <td className="px-2 py-2">{account.name}</td>
                          <td className="px-2 py-2">{account.sub_category || '-'}</td>
                          <td className="px-2 py-2">{account.normal_side || '-'}</td>
                          <td className="px-2 py-2">
                            <div className="flex gap-1">
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
                                className="secondary-btn"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('이 계정과목을 삭제하시겠습니까?')) deleteAccountMut.mutate(account.id)
                                }}
                                className="danger-btn"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div className="space-y-3">
          {editingEntryId && editEntry ? (
            <JournalForm
              title="전표 수정"
              funds={funds || []}
              accounts={accounts || []}
              initial={editEntry}
              loading={updateEntryMut.isPending}
              onSubmit={(data) => updateEntryMut.mutate({ id: editingEntryId, data })}
              onCancel={() => { setEditingEntryId(null); setEditEntry(null) }}
            />
          ) : (
            <JournalForm
              title="신규 전표 등록"
              funds={funds || []}
              accounts={accounts || []}
              initial={{ ...newEntry, fund_id: newEntry.fund_id || (selectedFundId || 0) }}
              loading={createEntryMut.isPending}
              onSubmit={(data) => {
                createEntryMut.mutate(data)
                setNewEntry(data)
              }}
            />
          )}

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">전표 목록</h3>
            <div className="space-y-2">
              {entries?.map((entry) => (
                <div key={entry.id} className="rounded border border-gray-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{entry.entry_date} | {entry.status} | {entry.description || '-'}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        라인 {entry.lines.length}개
                        {' / '}
                        차변 {formatNumber(entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0))}
                        {' / '}
                        대변 {formatNumber(entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0))}
                      </p>
                      <div className="mt-1 text-xs text-gray-500">
                        {entry.lines.map((line) => (
                          <div key={line.id}>
                            {accountNameMap.get(line.account_id) || line.account_name || line.account_id} | 차변 {formatNumber(line.debit)} | 대변 {formatNumber(line.credit)}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1">
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
                        className="secondary-btn"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('이 전표를 삭제하시겠습니까?')) deleteEntryMut.mutate(entry.id)
                        }}
                        className="danger-btn"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!entries?.length && <p className="text-sm text-gray-400">전표가 없습니다.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'trial' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">조회 조건</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">기준일</label>
                <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="rounded border px-2 py-1 text-sm" />
              </div>
            </div>
          </div>

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">합계잔액표</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="px-2 py-2">카테고리</th>
                    <th className="px-2 py-2">코드</th>
                    <th className="px-2 py-2">계정명</th>
                    <th className="px-2 py-2">차변합계</th>
                    <th className="px-2 py-2">대변합계</th>
                    <th className="px-2 py-2">잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance?.map((item) => (
                    <tr key={item.account_id} className="border-b">
                      <td className="px-2 py-2">{item.category}</td>
                      <td className="px-2 py-2">{item.code}</td>
                      <td className="px-2 py-2">{item.name}</td>
                      <td className="px-2 py-2">{formatNumber(item.debit_total)}</td>
                      <td className="px-2 py-2">{formatNumber(item.credit_total)}</td>
                      <td className="px-2 py-2">{formatNumber(item.balance)}</td>
                    </tr>
                  ))}
                  {!trialBalance?.length && (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-center text-sm text-gray-400">데이터가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}








