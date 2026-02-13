import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAssembly,
  createCapitalCall,
  createCapitalCallItem,
  createDistribution,
  createDistributionItem,
  deleteAssembly,
  deleteCapitalCall,
  deleteCapitalCallItem,
  deleteDistribution,
  deleteDistributionItem,
  fetchAssemblies,
  fetchCapitalCallItems,
  fetchCapitalCalls,
  fetchDistributionItems,
  fetchDistributions,
  fetchFund,
  fetchFundPerformance,
  fetchFunds,
  updateAssembly,
  updateCapitalCall,
  updateCapitalCallItem,
  updateDistribution,
  updateDistributionItem,
  type Assembly,
  type AssemblyInput,
  type CapitalCall,
  type CapitalCallInput,
  type CapitalCallItem,
  type CapitalCallItemInput,
  type Distribution,
  type DistributionInput,
  type DistributionItem,
  type DistributionItemInput,
  type Fund,
  type FundPerformance,
  type LP,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function toRatio(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${(value * 100).toFixed(2)}%`
}

const CALL_TYPE_LABEL: Record<string, string> = {
  regular: '정기출자',
  additional: '추가출자',
  manager_closure: '매니저클로징',
  other: '기타',
  정기출자: '정기출자',
  추가출자: '추가출자',
  매니저클로징: '매니저클로징',
  기타: '기타',
}

const DIST_TYPE_LABEL: Record<string, string> = {
  principal: '원금배분',
  profit: '수익배분',
  in_kind: '잔여자산배분',
  cash: '현금배분',
  원금배분: '원금배분',
  수익배분: '수익배분',
  잔여자산배분: '잔여자산배분',
  현금배분: '현금배분',
}

const ASSEMBLY_TYPE_LABEL: Record<string, string> = {
  founding: '결성총회',
  regular: '정기총회',
  special: '임시총회',
  결성총회: '결성총회',
  정기총회: '정기총회',
  임시총회: '임시총회',
}

const CALL_TYPE_OPTIONS = ['regular', 'additional', 'manager_closure', 'other']
const DIST_TYPE_OPTIONS = ['cash', 'principal', 'profit', 'in_kind']
const ASSEMBLY_TYPE_OPTIONS = ['founding', 'regular', 'special']
const ASSEMBLY_STATUS_OPTIONS = ['planned', 'scheduled', 'deliberating', 'approved', 'rejected', 'completed']

function labelCallType(value: string | null | undefined): string {
  if (!value) return '-'
  return CALL_TYPE_LABEL[value] ?? value
}

function labelDistributionType(value: string | null | undefined): string {
  if (!value) return '-'
  return DIST_TYPE_LABEL[value] ?? value
}

function labelAssemblyType(value: string | null | undefined): string {
  if (!value) return '-'
  return ASSEMBLY_TYPE_LABEL[value] ?? value
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

interface CallEditState {
  call_date: string
  call_type: string
  total_amount: number
  memo: string
}

interface CallItemEditState {
  amount: number
  paid: boolean
  paid_date: string | null
}

interface DistributionEditState {
  dist_date: string
  dist_type: string
  principal_total: number
  profit_total: number
  performance_fee: number
  memo: string
}

interface DistributionItemEditState {
  principal: number
  profit: number
}

interface AssemblyEditState {
  date: string
  type: string
  status: string
  agenda: string
  minutes_completed: boolean
  memo: string
}

export default function FundOperationsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [fundId, setFundId] = useState<number | null>(null)
  const [performanceDate, setPerformanceDate] = useState('')

  const [callExpandedId, setCallExpandedId] = useState<number | null>(null)
  const [distExpandedId, setDistExpandedId] = useState<number | null>(null)

  const [editingCallId, setEditingCallId] = useState<number | null>(null)
  const [editingDistId, setEditingDistId] = useState<number | null>(null)
  const [editingAssemblyId, setEditingAssemblyId] = useState<number | null>(null)
  const [editingCallItemId, setEditingCallItemId] = useState<number | null>(null)
  const [editingDistItemId, setEditingDistItemId] = useState<number | null>(null)
  const [editCall, setEditCall] = useState<CallEditState | null>(null)
  const [editCallItem, setEditCallItem] = useState<CallItemEditState | null>(null)
  const [editDistribution, setEditDistribution] = useState<DistributionEditState | null>(null)
  const [editDistributionItem, setEditDistributionItem] = useState<DistributionItemEditState | null>(null)
  const [editAssembly, setEditAssembly] = useState<AssemblyEditState | null>(null)

  const [newCall, setNewCall] = useState<CapitalCallInput>({ fund_id: 0, call_date: todayIso(), call_type: 'regular', total_amount: 0, memo: '' })
  const [newCallItem, setNewCallItem] = useState<CapitalCallItemInput>({ lp_id: 0, amount: 0, paid: false, paid_date: null })
  const [newDistribution, setNewDistribution] = useState<DistributionInput>({ fund_id: 0, dist_date: todayIso(), dist_type: 'cash', principal_total: 0, profit_total: 0, performance_fee: 0, memo: '' })
  const [newDistributionItem, setNewDistributionItem] = useState<DistributionItemInput>({ lp_id: 0, principal: 0, profit: 0 })
  const [newAssembly, setNewAssembly] = useState<AssemblyInput>({ fund_id: 0, type: 'regular', date: todayIso(), agenda: '', status: 'planned', minutes_completed: false, memo: '' })

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const selectedFundId = useMemo(() => fundId || funds?.[0]?.id || null, [fundId, funds])

  const { data: fundDetail } = useQuery<Fund>({
    queryKey: ['fund', selectedFundId],
    queryFn: () => fetchFund(selectedFundId as number),
    enabled: !!selectedFundId,
  })
  const lps: LP[] = fundDetail?.lps || []

  const { data: performance } = useQuery<FundPerformance>({
    queryKey: ['fundPerformance', selectedFundId, performanceDate],
    queryFn: () => fetchFundPerformance(selectedFundId as number, performanceDate ? { as_of_date: performanceDate } : undefined),
    enabled: !!selectedFundId,
  })

  const { data: calls } = useQuery<CapitalCall[]>({ queryKey: ['capitalCalls', selectedFundId], queryFn: () => fetchCapitalCalls({ fund_id: selectedFundId as number }), enabled: !!selectedFundId })
  const { data: callItems } = useQuery({ queryKey: ['capitalCallItems', callExpandedId], queryFn: () => fetchCapitalCallItems(callExpandedId as number), enabled: !!callExpandedId })
  const { data: distributions } = useQuery<Distribution[]>({ queryKey: ['distributions', selectedFundId], queryFn: () => fetchDistributions({ fund_id: selectedFundId as number }), enabled: !!selectedFundId })
  const { data: distributionItems } = useQuery({ queryKey: ['distributionItems', distExpandedId], queryFn: () => fetchDistributionItems(distExpandedId as number), enabled: !!distExpandedId })
  const { data: assemblies } = useQuery<Assembly[]>({ queryKey: ['assemblies', selectedFundId], queryFn: () => fetchAssemblies({ fund_id: selectedFundId as number }), enabled: !!selectedFundId })

  const createCallMut = useMutation({ mutationFn: (data: CapitalCallInput) => createCapitalCall(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCalls', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['fundPerformance'] }); addToast('success', '출자 요청을 등록했습니다.') } })
  const updateCallMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<CapitalCallInput> }) => updateCapitalCall(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCalls', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['fundPerformance'] }); setEditingCallId(null); setEditCall(null); addToast('success', '출자 요청을 수정했습니다.') } })
  const deleteCallMut = useMutation({ mutationFn: (id: number) => deleteCapitalCall(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCalls', selectedFundId] }); addToast('success', '출자 요청을 삭제했습니다.') } })
  const createCallItemMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: CapitalCallItemInput }) => createCapitalCallItem(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCallItems', callExpandedId] }); addToast('success', 'LP 항목을 추가했습니다.') } })
  const deleteCallItemMut = useMutation({ mutationFn: ({ callId, itemId }: { callId: number; itemId: number }) => deleteCapitalCallItem(callId, itemId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCallItems', callExpandedId] }); addToast('success', 'LP 항목을 삭제했습니다.') } })
  const updateCallItemMut = useMutation({ mutationFn: ({ callId, itemId, data }: { callId: number; itemId: number; data: Partial<CapitalCallItemInput> }) => updateCapitalCallItem(callId, itemId, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCallItems', callExpandedId] }); setEditingCallItemId(null); setEditCallItem(null); addToast('success', 'LP 항목을 수정했습니다.') } })

  const createDistMut = useMutation({ mutationFn: (data: DistributionInput) => createDistribution(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributions', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['fundPerformance'] }); addToast('success', '배분을 등록했습니다.') } })
  const updateDistMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<DistributionInput> }) => updateDistribution(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributions', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['fundPerformance'] }); setEditingDistId(null); setEditDistribution(null); addToast('success', '배분을 수정했습니다.') } })
  const deleteDistMut = useMutation({ mutationFn: (id: number) => deleteDistribution(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributions', selectedFundId] }); addToast('success', '배분을 삭제했습니다.') } })
  const createDistItemMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: DistributionItemInput }) => createDistributionItem(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributionItems', distExpandedId] }); addToast('success', 'LP 배분 항목을 추가했습니다.') } })
  const deleteDistItemMut = useMutation({ mutationFn: ({ distributionId, itemId }: { distributionId: number; itemId: number }) => deleteDistributionItem(distributionId, itemId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributionItems', distExpandedId] }); addToast('success', 'LP 배분 항목을 삭제했습니다.') } })
  const updateDistItemMut = useMutation({ mutationFn: ({ distributionId, itemId, data }: { distributionId: number; itemId: number; data: Partial<DistributionItemInput> }) => updateDistributionItem(distributionId, itemId, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributionItems', distExpandedId] }); setEditingDistItemId(null); setEditDistributionItem(null); addToast('success', 'LP 배분 항목을 수정했습니다.') } })

  const createAssemblyMut = useMutation({ mutationFn: (data: AssemblyInput) => createAssembly(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assemblies', selectedFundId] }); addToast('success', '총회를 등록했습니다.') } })
  const updateAssemblyMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<AssemblyInput> }) => updateAssembly(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assemblies', selectedFundId] }); setEditingAssemblyId(null); setEditAssembly(null); addToast('success', '총회를 수정했습니다.') } })
  const deleteAssemblyMut = useMutation({ mutationFn: (id: number) => deleteAssembly(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assemblies', selectedFundId] }); addToast('success', '총회를 삭제했습니다.') } })

  const toggleCallEdit = (row: CapitalCall) => {
    if (editingCallId === row.id) {
      setEditingCallId(null)
      setEditCall(null)
      return
    }
    setEditingCallId(row.id)
    setEditCall({
      call_date: row.call_date,
      call_type: row.call_type,
      total_amount: row.total_amount,
      memo: row.memo || '',
    })
  }

  const toggleCallItemEdit = (item: CapitalCallItem) => {
    if (editingCallItemId === item.id) {
      setEditingCallItemId(null)
      setEditCallItem(null)
      return
    }
    setEditingCallItemId(item.id)
    setEditCallItem({
      amount: item.amount,
      paid: item.paid,
      paid_date: item.paid_date,
    })
  }

  const toggleDistributionEdit = (row: Distribution) => {
    if (editingDistId === row.id) {
      setEditingDistId(null)
      setEditDistribution(null)
      return
    }
    setEditingDistId(row.id)
    setEditDistribution({
      dist_date: row.dist_date,
      dist_type: row.dist_type,
      principal_total: row.principal_total,
      profit_total: row.profit_total,
      performance_fee: row.performance_fee,
      memo: row.memo || '',
    })
  }

  const toggleDistributionItemEdit = (item: DistributionItem) => {
    if (editingDistItemId === item.id) {
      setEditingDistItemId(null)
      setEditDistributionItem(null)
      return
    }
    setEditingDistItemId(item.id)
    setEditDistributionItem({
      principal: item.principal,
      profit: item.profit,
    })
  }

  const toggleAssemblyEdit = (row: Assembly) => {
    if (editingAssemblyId === row.id) {
      setEditingAssemblyId(null)
      setEditAssembly(null)
      return
    }
    setEditingAssemblyId(row.id)
    setEditAssembly({
      date: row.date,
      type: row.type,
      status: row.status,
      agenda: row.agenda || '',
      minutes_completed: row.minutes_completed,
      memo: row.memo || '',
    })
  }

  return (
    <div className="max-w-7xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">조합 운영</h2>
        <select value={selectedFundId || ''} onChange={(e) => setFundId(Number(e.target.value) || null)} className="rounded border px-2 py-1 text-sm">
          {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
        </select>
      </div>

      <Section title="성과지표" right={<input type="date" value={performanceDate} onChange={(e) => setPerformanceDate(e.target.value)} className="rounded border px-2 py-1 text-xs" />}>
        {!performance ? <p className="text-sm text-gray-400">데이터가 없습니다.</p> : (
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded bg-gray-50 p-2">납입 총액: {formatKRW(performance.paid_in_total)}</div>
            <div className="rounded bg-gray-50 p-2">투자 총액: {formatKRW(performance.total_invested)}</div>
            <div className="rounded bg-gray-50 p-2">배분 총액: {formatKRW(performance.total_distributed)}</div>
            <div className="rounded bg-gray-50 p-2">잔여 가치: {formatKRW(performance.residual_value)}</div>
            <div className="rounded bg-gray-50 p-2">TVPI: {performance.tvpi?.toFixed(4) || '-'}</div>
            <div className="rounded bg-gray-50 p-2">DPI: {performance.dpi?.toFixed(4) || '-'}</div>
            <div className="rounded bg-gray-50 p-2">RVPI: {performance.rvpi?.toFixed(4) || '-'}</div>
            <div className="rounded bg-gray-50 p-2">IRR: {toRatio(performance.irr)}</div>
          </div>
        )}
      </Section>

      <Section title="출자">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4 mb-2">
          <input type="date" value={newCall.call_date} onChange={(e) => setNewCall((p) => ({ ...p, call_date: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
          <select value={newCall.call_type} onChange={(e) => setNewCall((p) => ({ ...p, call_type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            {CALL_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelCallType(type)}</option>)}
          </select>
          <input type="number" value={newCall.total_amount || 0} onChange={(e) => setNewCall((p) => ({ ...p, total_amount: Number(e.target.value || 0) }))} className="rounded border px-2 py-1 text-sm" placeholder="출자 총액" />
          <button onClick={() => selectedFundId && createCallMut.mutate({ ...newCall, fund_id: selectedFundId, memo: newCall.memo?.trim() || null })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">등록</button>
        </div>
        <div className="space-y-2">
          {calls?.map((row) => (
            <div key={row.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-800">{toDate(row.call_date)} | {labelCallType(row.call_type)} | {formatKRW(row.total_amount)}</p>
                <div className="flex gap-1">
                  <button onClick={() => setCallExpandedId(callExpandedId === row.id ? null : row.id)} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100">LP 내역</button>
                  <button onClick={() => toggleCallEdit(row)} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">수정</button>
                  <button onClick={() => deleteCallMut.mutate(row.id)} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">삭제</button>
                </div>
              </div>
              {editingCallId === row.id && editCall && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                  <input type="date" value={editCall.call_date} onChange={(e) => setEditCall((p) => (p ? { ...p, call_date: e.target.value } : p))} className="rounded border px-2 py-1 text-sm" />
                  <select value={editCall.call_type} onChange={(e) => setEditCall((p) => (p ? { ...p, call_type: e.target.value } : p))} className="rounded border px-2 py-1 text-sm">
                    {CALL_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelCallType(type)}</option>)}
                  </select>
                  <input type="number" value={editCall.total_amount} onChange={(e) => setEditCall((p) => (p ? { ...p, total_amount: Number(e.target.value || 0) } : p))} className="rounded border px-2 py-1 text-sm" />
                  <div className="flex gap-1">
                    <button onClick={() => updateCallMut.mutate({ id: row.id, data: { call_date: editCall.call_date, call_type: editCall.call_type, total_amount: editCall.total_amount, memo: editCall.memo.trim() || null } })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">저장</button>
                    <button onClick={() => { setEditingCallId(null); setEditCall(null) }} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">취소</button>
                  </div>
                </div>
              )}
              {callExpandedId === row.id && (
                <div className="mt-2 rounded bg-gray-50 p-2 space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    <select value={newCallItem.lp_id || ''} onChange={(e) => setNewCallItem((p) => ({ ...p, lp_id: Number(e.target.value) || 0 }))} className="rounded border px-2 py-1 text-sm">
                      <option value="">LP</option>
                      {lps.map((lp) => <option key={lp.id} value={lp.id}>{lp.name}</option>)}
                    </select>
                    <input type="number" value={newCallItem.amount || 0} onChange={(e) => setNewCallItem((p) => ({ ...p, amount: Number(e.target.value || 0) }))} className="rounded border px-2 py-1 text-sm" />
                    <select value={newCallItem.paid ? '1' : '0'} onChange={(e) => setNewCallItem((p) => ({ ...p, paid: e.target.value === '1' }))} className="rounded border px-2 py-1 text-sm"><option value="0">미납</option><option value="1">납입</option></select>
                    <input type="date" value={newCallItem.paid_date || ''} onChange={(e) => setNewCallItem((p) => ({ ...p, paid_date: e.target.value || null }))} className="rounded border px-2 py-1 text-sm" />
                    <button onClick={() => newCallItem.lp_id && createCallItemMut.mutate({ id: row.id, data: newCallItem })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">항목 추가</button>
                  </div>
                  <div className="space-y-1">
                    {callItems?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2">
                        {editingCallItemId === item.id && editCallItem ? (
                          <div className="w-full grid grid-cols-1 gap-2 md:grid-cols-5">
                            <input type="number" value={editCallItem.amount} onChange={(e) => setEditCallItem((p) => (p ? { ...p, amount: Number(e.target.value || 0) } : p))} className="rounded border px-2 py-1 text-sm" />
                            <select value={editCallItem.paid ? '1' : '0'} onChange={(e) => setEditCallItem((p) => (p ? { ...p, paid: e.target.value === '1' } : p))} className="rounded border px-2 py-1 text-sm"><option value="0">미납</option><option value="1">납입</option></select>
                            <input type="date" value={editCallItem.paid_date || ''} onChange={(e) => setEditCallItem((p) => (p ? { ...p, paid_date: e.target.value || null } : p))} className="rounded border px-2 py-1 text-sm" />
                            <button onClick={() => updateCallItemMut.mutate({ callId: row.id, itemId: item.id, data: { amount: editCallItem.amount, paid: editCallItem.paid, paid_date: editCallItem.paid_date } })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">저장</button>
                            <button onClick={() => { setEditingCallItemId(null); setEditCallItem(null) }} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">취소</button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-gray-600">LP {item.lp_name || item.lp_id} | {formatKRW(item.amount)} | {item.paid ? '납입' : '미납'} | {toDate(item.paid_date)}</p>
                            <div className="flex gap-1">
                              <button onClick={() => toggleCallItemEdit(item)} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">수정</button>
                              <button onClick={() => deleteCallItemMut.mutate({ callId: row.id, itemId: item.id })} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">삭제</button>
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
        </div>
      </Section>

      <Section title="배분">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5 mb-2">
          <input type="date" value={newDistribution.dist_date} onChange={(e) => setNewDistribution((p) => ({ ...p, dist_date: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
          <select value={newDistribution.dist_type} onChange={(e) => setNewDistribution((p) => ({ ...p, dist_type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            {DIST_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelDistributionType(type)}</option>)}
          </select>
          <input type="number" value={newDistribution.principal_total || 0} onChange={(e) => setNewDistribution((p) => ({ ...p, principal_total: Number(e.target.value || 0) }))} className="rounded border px-2 py-1 text-sm" />
          <input type="number" value={newDistribution.profit_total || 0} onChange={(e) => setNewDistribution((p) => ({ ...p, profit_total: Number(e.target.value || 0) }))} className="rounded border px-2 py-1 text-sm" />
          <button onClick={() => selectedFundId && createDistMut.mutate({ ...newDistribution, fund_id: selectedFundId, memo: newDistribution.memo?.trim() || null })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">등록</button>
        </div>
        <div className="space-y-2">
          {distributions?.map((row) => (
            <div key={row.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-800">{toDate(row.dist_date)} | {labelDistributionType(row.dist_type)} | 원금 총액 {formatKRW(row.principal_total)} | 수익 총액 {formatKRW(row.profit_total)}</p>
                <div className="flex gap-1">
                  <button onClick={() => setDistExpandedId(distExpandedId === row.id ? null : row.id)} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100">LP 내역</button>
                  <button onClick={() => toggleDistributionEdit(row)} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">수정</button>
                  <button onClick={() => deleteDistMut.mutate(row.id)} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">삭제</button>
                </div>
              </div>
              {editingDistId === row.id && editDistribution && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <input type="date" value={editDistribution.dist_date} onChange={(e) => setEditDistribution((p) => (p ? { ...p, dist_date: e.target.value } : p))} className="rounded border px-2 py-1 text-sm" />
                  <select value={editDistribution.dist_type} onChange={(e) => setEditDistribution((p) => (p ? { ...p, dist_type: e.target.value } : p))} className="rounded border px-2 py-1 text-sm">
                    {DIST_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelDistributionType(type)}</option>)}
                  </select>
                  <input type="number" value={editDistribution.principal_total} onChange={(e) => setEditDistribution((p) => (p ? { ...p, principal_total: Number(e.target.value || 0) } : p))} className="rounded border px-2 py-1 text-sm" />
                  <input type="number" value={editDistribution.profit_total} onChange={(e) => setEditDistribution((p) => (p ? { ...p, profit_total: Number(e.target.value || 0) } : p))} className="rounded border px-2 py-1 text-sm" />
                  <div className="flex gap-1">
                    <button onClick={() => updateDistMut.mutate({ id: row.id, data: { dist_date: editDistribution.dist_date, dist_type: editDistribution.dist_type, principal_total: editDistribution.principal_total, profit_total: editDistribution.profit_total, performance_fee: editDistribution.performance_fee, memo: editDistribution.memo.trim() || null } })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">저장</button>
                    <button onClick={() => { setEditingDistId(null); setEditDistribution(null) }} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">취소</button>
                  </div>
                </div>
              )}
              {distExpandedId === row.id && (
                <div className="mt-2 rounded bg-gray-50 p-2 space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <select value={newDistributionItem.lp_id || ''} onChange={(e) => setNewDistributionItem((p) => ({ ...p, lp_id: Number(e.target.value) || 0 }))} className="rounded border px-2 py-1 text-sm">
                      <option value="">LP</option>
                      {lps.map((lp) => <option key={lp.id} value={lp.id}>{lp.name}</option>)}
                    </select>
                    <input type="number" value={newDistributionItem.principal || 0} onChange={(e) => setNewDistributionItem((p) => ({ ...p, principal: Number(e.target.value || 0) }))} className="rounded border px-2 py-1 text-sm" />
                    <input type="number" value={newDistributionItem.profit || 0} onChange={(e) => setNewDistributionItem((p) => ({ ...p, profit: Number(e.target.value || 0) }))} className="rounded border px-2 py-1 text-sm" />
                    <button onClick={() => newDistributionItem.lp_id && createDistItemMut.mutate({ id: row.id, data: newDistributionItem })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">항목 추가</button>
                  </div>
                  <div className="space-y-1">
                    {distributionItems?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2">
                        {editingDistItemId === item.id && editDistributionItem ? (
                          <div className="w-full grid grid-cols-1 gap-2 md:grid-cols-4">
                            <input type="number" value={editDistributionItem.principal} onChange={(e) => setEditDistributionItem((p) => (p ? { ...p, principal: Number(e.target.value || 0) } : p))} className="rounded border px-2 py-1 text-sm" />
                            <input type="number" value={editDistributionItem.profit} onChange={(e) => setEditDistributionItem((p) => (p ? { ...p, profit: Number(e.target.value || 0) } : p))} className="rounded border px-2 py-1 text-sm" />
                            <button onClick={() => updateDistItemMut.mutate({ distributionId: row.id, itemId: item.id, data: { principal: editDistributionItem.principal, profit: editDistributionItem.profit } })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">저장</button>
                            <button onClick={() => { setEditingDistItemId(null); setEditDistributionItem(null) }} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">취소</button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-gray-600">LP {item.lp_name || item.lp_id} | 원금 {formatKRW(item.principal)} | 수익 {formatKRW(item.profit)}</p>
                            <div className="flex gap-1">
                              <button onClick={() => toggleDistributionItemEdit(item)} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">수정</button>
                              <button onClick={() => deleteDistItemMut.mutate({ distributionId: row.id, itemId: item.id })} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">삭제</button>
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
        </div>
      </Section>

      <Section title="총회">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5 mb-2">
          <input type="date" value={newAssembly.date} onChange={(e) => setNewAssembly((p) => ({ ...p, date: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
          <select value={newAssembly.type} onChange={(e) => setNewAssembly((p) => ({ ...p, type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            {ASSEMBLY_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelAssemblyType(type)}</option>)}
          </select>
          <select value={newAssembly.status || ''} onChange={(e) => setNewAssembly((p) => ({ ...p, status: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            {ASSEMBLY_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
          </select>
          <input value={newAssembly.agenda || ''} onChange={(e) => setNewAssembly((p) => ({ ...p, agenda: e.target.value }))} className="rounded border px-2 py-1 text-sm" placeholder="안건" />
          <button onClick={() => selectedFundId && createAssemblyMut.mutate({ ...newAssembly, fund_id: selectedFundId, agenda: newAssembly.agenda?.trim() || null })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">등록</button>
        </div>
        <div className="space-y-1">
          {assemblies?.map((row) => (
            <div key={row.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">{toDate(row.date)} | {labelAssemblyType(row.type)} | {labelStatus(row.status)} | 의사록 {row.minutes_completed ? '작성 완료' : '미작성'}</p>
                <div className="flex gap-1">
                  <button onClick={() => toggleAssemblyEdit(row)} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">수정</button>
                  <button onClick={() => deleteAssemblyMut.mutate(row.id)} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">삭제</button>
                </div>
              </div>
              {editingAssemblyId === row.id && editAssembly && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <input type="date" value={editAssembly.date} onChange={(e) => setEditAssembly((p) => (p ? { ...p, date: e.target.value } : p))} className="rounded border px-2 py-1 text-sm" />
                  <select value={editAssembly.type} onChange={(e) => setEditAssembly((p) => (p ? { ...p, type: e.target.value } : p))} className="rounded border px-2 py-1 text-sm">
                    {ASSEMBLY_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelAssemblyType(type)}</option>)}
                  </select>
                  <select value={editAssembly.status} onChange={(e) => setEditAssembly((p) => (p ? { ...p, status: e.target.value } : p))} className="rounded border px-2 py-1 text-sm">
                    {ASSEMBLY_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
                  </select>
                  <input value={editAssembly.agenda} onChange={(e) => setEditAssembly((p) => (p ? { ...p, agenda: e.target.value } : p))} className="rounded border px-2 py-1 text-sm" />
                  <div className="flex gap-1">
                    <button onClick={() => updateAssemblyMut.mutate({ id: row.id, data: { date: editAssembly.date, type: editAssembly.type, status: editAssembly.status, agenda: editAssembly.agenda.trim() || null, minutes_completed: editAssembly.minutes_completed, memo: editAssembly.memo.trim() || null } })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">저장</button>
                    <button onClick={() => { setEditingAssemblyId(null); setEditAssembly(null) }} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">취소</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}


