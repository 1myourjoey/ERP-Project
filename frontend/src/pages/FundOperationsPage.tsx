import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Landmark } from 'lucide-react'
import {
  createAssembly,
  createCapitalCall,
  createCapitalCallItem,
  createDistribution,
  createDistributionItem,
  createFundLP,
  createLPTransfer,
  deleteAssembly,
  deleteCapitalCall,
  deleteCapitalCallItem,
  deleteDistribution,
  deleteDistributionItem,
  deleteFundLP,
  fetchAssemblies,
  fetchCapitalCallItems,
  fetchCapitalCalls,
  fetchDistributionItems,
  fetchDistributions,
  fetchFund,
  fetchFundPerformance,
  fetchFunds,
  fetchLPTransfers,
  completeLPTransfer,
  updateAssembly,
  updateCapitalCall,
  updateCapitalCallItem,
  updateDistribution,
  updateDistributionItem,
  updateFundLP,
  updateLPTransfer,
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
  type LPInput,
  type LPTransfer,
  type LPTransferInput,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import CapitalCallDetail from '../components/CapitalCallDetail'

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
const LP_TRANSFER_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소',
}

const EMPTY_LP_FORM: LPInput = {
  name: '',
  type: '기관투자자',
  commitment: null,
  paid_in: null,
  business_number: '',
  address: '',
  contact: '',
}

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
    <div className="card-base">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function LPTransferModal({
  fromLp,
  lps,
  loading,
  onSubmit,
  onCancel,
}: {
  fromLp: LP
  lps: LP[]
  loading: boolean
  onSubmit: (data: LPTransferInput) => void
  onCancel: () => void
}) {
  const [useExistingLp, setUseExistingLp] = useState(true)
  const [toLpId, setToLpId] = useState<number | ''>('')
  const [toLpName, setToLpName] = useState('')
  const [toLpType, setToLpType] = useState('기관투자자')
  const [toLpBusinessNumber, setToLpBusinessNumber] = useState('')
  const [toLpAddress, setToLpAddress] = useState('')
  const [toLpContact, setToLpContact] = useState('')
  const [transferAmount, setTransferAmount] = useState<number>(0)
  const [transferDate, setTransferDate] = useState(todayIso())
  const [notes, setNotes] = useState('')

  const submit = () => {
    if (transferAmount <= 0) return
    if (useExistingLp) {
      if (!toLpId || toLpId === fromLp.id) return
      onSubmit({
        from_lp_id: fromLp.id,
        to_lp_id: toLpId,
        transfer_amount: transferAmount,
        transfer_date: transferDate || null,
        notes: notes.trim() || null,
      })
      return
    }
    if (!toLpName.trim() || !toLpType.trim()) return
    onSubmit({
      from_lp_id: fromLp.id,
      to_lp_name: toLpName.trim(),
      to_lp_type: toLpType.trim(),
      to_lp_business_number: toLpBusinessNumber.trim() || null,
      to_lp_address: toLpAddress.trim() || null,
      to_lp_contact: toLpContact.trim() || null,
      transfer_amount: transferAmount,
      transfer_date: transferDate || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">LP 양수양도</h3>
          <button onClick={onCancel} className="secondary-btn">닫기</button>
        </div>

        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm">
            양도인: <span className="font-medium text-gray-800">{fromLp.name}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">양도 금액</label>
              <input type="number" value={transferAmount || ''} onChange={(e) => setTransferAmount(Number(e.target.value || 0))} placeholder="숫자 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">양도일</label>
              <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div className="rounded border border-gray-200 p-2">
            <div className="mb-2 flex items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={useExistingLp} onChange={() => setUseExistingLp(true)} />
                기존 LP
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={!useExistingLp} onChange={() => setUseExistingLp(false)} />
                신규 LP
              </label>
            </div>
            {useExistingLp ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">양수 LP</label>
                <select value={toLpId} onChange={(e) => setToLpId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded border px-2 py-1.5 text-sm">
                  <option value="">양수 LP 선택</option>
                  {lps.filter((lp) => lp.id !== fromLp.id).map((lp) => (
                    <option key={lp.id} value={lp.id}>{lp.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">양수 LP명</label>
                  <input value={toLpName} onChange={(e) => setToLpName(e.target.value)} placeholder="예: OO기관" className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">양수 LP 유형</label>
                  <input value={toLpType} onChange={(e) => setToLpType(e.target.value)} placeholder="예: 기관투자자" className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">사업자등록번호/생년월일</label>
                  <input value={toLpBusinessNumber} onChange={(e) => setToLpBusinessNumber(e.target.value)} placeholder="선택 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">주소</label>
                  <input value={toLpAddress} onChange={(e) => setToLpAddress(e.target.value)} placeholder="선택 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">연락처</label>
                  <input value={toLpContact} onChange={(e) => setToLpContact(e.target.value)} placeholder="선택 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">비고</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="선택 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="secondary-btn">취소</button>
          <button onClick={submit} disabled={loading} className="primary-btn">{loading ? '처리 중...' : '양수양도 시작'}</button>
        </div>
      </div>
    </div>
  )
}

interface CallEditState {
  call_date: string
  call_type: string
  total_amount: number
  request_percent: number | null
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
  const location = useLocation()
  const navigate = useNavigate()
  const initialFundId = (location.state as { fundId?: number } | null)?.fundId ?? null

  const [fundId, setFundId] = useState<number | null>(initialFundId)
  const [performanceDate, setPerformanceDate] = useState('')
  const [lpCallTab, setLpCallTab] = useState<'lp' | 'calls'>('lp')

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
  const [showCreateLP, setShowCreateLP] = useState(false)
  const [editingLPId, setEditingLPId] = useState<number | null>(null)
  const [lpForm, setLpForm] = useState<LPInput>(EMPTY_LP_FORM)
  const [transferSourceLp, setTransferSourceLp] = useState<LP | null>(null)

  const [newCall, setNewCall] = useState<CapitalCallInput>({
    fund_id: 0,
    call_date: todayIso(),
    call_type: 'regular',
    total_amount: 0,
    request_percent: null,
    memo: '',
  })
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
  const callIdsKey = useMemo(() => (calls?.map((call) => call.id).join(',') ?? ''), [calls])
  const { data: callItemsByCallId = {} } = useQuery<Record<number, CapitalCallItem[]>>({
    queryKey: ['capitalCallItemsByCallId', selectedFundId, callIdsKey],
    queryFn: async () => {
      const entries = await Promise.all(
        (calls ?? []).map(async (call) => {
          const items = await fetchCapitalCallItems(call.id)
          return [call.id, items] as const
        }),
      )
      return Object.fromEntries(entries)
    },
    enabled: !!selectedFundId && !!calls?.length,
  })
  const { data: distributions } = useQuery<Distribution[]>({ queryKey: ['distributions', selectedFundId], queryFn: () => fetchDistributions({ fund_id: selectedFundId as number }), enabled: !!selectedFundId })
  const { data: distributionItems } = useQuery({ queryKey: ['distributionItems', distExpandedId], queryFn: () => fetchDistributionItems(distExpandedId as number), enabled: !!distExpandedId })
  const { data: assemblies } = useQuery<Assembly[]>({ queryKey: ['assemblies', selectedFundId], queryFn: () => fetchAssemblies({ fund_id: selectedFundId as number }), enabled: !!selectedFundId })
  const { data: lpTransfers = [] } = useQuery<LPTransfer[]>({
    queryKey: ['lpTransfers', selectedFundId],
    queryFn: () => fetchLPTransfers(selectedFundId as number),
    enabled: !!selectedFundId,
  })

  const lpCommitmentSum = useMemo(() => lps.reduce((sum, lp) => sum + Number(lp.commitment ?? 0), 0), [lps])
  const lpPaidInSum = useMemo(() => lps.reduce((sum, lp) => sum + Number(lp.paid_in ?? 0), 0), [lps])
  const commitmentTotal = Number(fundDetail?.commitment_total ?? 0)
  const commitmentDiff = commitmentTotal - lpCommitmentSum
  const isCommitmentMatched = Math.abs(commitmentDiff) < 1
  const lpLastCallDateByLpId = useMemo(() => {
    const map = new Map<number, string>()
    for (const call of calls ?? []) {
      const items = callItemsByCallId[call.id] ?? []
      for (const item of items) {
        if (!item.lp_id) continue
        const candidate = item.paid_date || call.call_date
        if (!candidate) continue
        const previous = map.get(item.lp_id)
        if (!previous || candidate > previous) {
          map.set(item.lp_id, candidate)
        }
      }
    }
    return map
  }, [callItemsByCallId, calls])

  const createCallMut = useMutation({
    mutationFn: (data: CapitalCallInput) => createCapitalCall(data.fund_id, {
      call_date: data.call_date,
      total_amount: data.total_amount ?? null,
      call_type: data.call_type,
      request_percent: data.request_percent ?? null,
      memo: data.memo,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCalls', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      addToast('success', '출자 요청을 등록했습니다.')
    },
  })
  const updateCallMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<CapitalCallInput> }) => updateCapitalCall(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCalls', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['fundPerformance'] }); setEditingCallId(null); setEditCall(null); addToast('success', '출자 요청을 수정했습니다.') } })
  const deleteCallMut = useMutation({ mutationFn: (id: number) => deleteCapitalCall(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capitalCalls', selectedFundId] }); addToast('success', '출자 요청을 삭제했습니다.') } })
  const createCallItemMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CapitalCallItemInput }) => createCapitalCallItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems', callExpandedId] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallItemsByCallId', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      addToast('success', 'LP 항목을 추가했습니다.')
    },
  })
  const deleteCallItemMut = useMutation({
    mutationFn: ({ callId, itemId }: { callId: number; itemId: number }) => deleteCapitalCallItem(callId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems', callExpandedId] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallItemsByCallId', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      addToast('success', 'LP 항목을 삭제했습니다.')
    },
  })
  const updateCallItemMut = useMutation({
    mutationFn: ({ callId, itemId, data }: { callId: number; itemId: number; data: Partial<CapitalCallItemInput> }) =>
      updateCapitalCallItem(callId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems', callExpandedId] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallItemsByCallId', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      setEditingCallItemId(null)
      setEditCallItem(null)
      addToast('success', 'LP 항목을 수정했습니다.')
    },
  })

  const createDistMut = useMutation({ mutationFn: (data: DistributionInput) => createDistribution(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributions', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['fundPerformance'] }); addToast('success', '배분을 등록했습니다.') } })
  const updateDistMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<DistributionInput> }) => updateDistribution(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributions', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['fundPerformance'] }); setEditingDistId(null); setEditDistribution(null); addToast('success', '배분을 수정했습니다.') } })
  const deleteDistMut = useMutation({ mutationFn: (id: number) => deleteDistribution(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributions', selectedFundId] }); addToast('success', '배분을 삭제했습니다.') } })
  const createDistItemMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: DistributionItemInput }) => createDistributionItem(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributionItems', distExpandedId] }); addToast('success', 'LP 배분 항목을 추가했습니다.') } })
  const deleteDistItemMut = useMutation({ mutationFn: ({ distributionId, itemId }: { distributionId: number; itemId: number }) => deleteDistributionItem(distributionId, itemId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributionItems', distExpandedId] }); addToast('success', 'LP 배분 항목을 삭제했습니다.') } })
  const updateDistItemMut = useMutation({ mutationFn: ({ distributionId, itemId, data }: { distributionId: number; itemId: number; data: Partial<DistributionItemInput> }) => updateDistributionItem(distributionId, itemId, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['distributionItems', distExpandedId] }); setEditingDistItemId(null); setEditDistributionItem(null); addToast('success', 'LP 배분 항목을 수정했습니다.') } })

  const createAssemblyMut = useMutation({ mutationFn: (data: AssemblyInput) => createAssembly(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assemblies', selectedFundId] }); addToast('success', '총회를 등록했습니다.') } })
  const updateAssemblyMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<AssemblyInput> }) => updateAssembly(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assemblies', selectedFundId] }); setEditingAssemblyId(null); setEditAssembly(null); addToast('success', '총회를 수정했습니다.') } })
  const deleteAssemblyMut = useMutation({ mutationFn: (id: number) => deleteAssembly(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assemblies', selectedFundId] }); addToast('success', '총회를 삭제했습니다.') } })
  const createLPMut = useMutation({
    mutationFn: (data: LPInput) => createFundLP(selectedFundId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      setShowCreateLP(false)
      setLpForm(EMPTY_LP_FORM)
      addToast('success', 'LP를 추가했습니다.')
    },
  })
  const updateLPMut = useMutation({
    mutationFn: ({ lpId, data }: { lpId: number; data: Partial<LPInput> }) => updateFundLP(selectedFundId as number, lpId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      setEditingLPId(null)
      addToast('success', 'LP를 수정했습니다.')
    },
  })
  const deleteLPMut = useMutation({
    mutationFn: (lpId: number) => deleteFundLP(selectedFundId as number, lpId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      addToast('success', 'LP를 삭제했습니다.')
    },
  })
  const createLPTransferMut = useMutation({
    mutationFn: (data: LPTransferInput) => createLPTransfer(selectedFundId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpTransfers', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setTransferSourceLp(null)
      addToast('success', 'LP 양수양도 워크플로우를 시작했습니다.')
    },
  })
  const completeLPTransferMut = useMutation({
    mutationFn: (transferId: number) => completeLPTransfer(selectedFundId as number, transferId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpTransfers', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      addToast('success', 'LP 양수양도를 완료 처리했습니다.')
    },
  })
  const cancelLPTransferMut = useMutation({
    mutationFn: (transferId: number) => updateLPTransfer(selectedFundId as number, transferId, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpTransfers', selectedFundId] })
      addToast('success', 'LP 양수양도를 취소 처리했습니다.')
    },
  })

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
      request_percent: row.request_percent ?? null,
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

  const startCreateLP = () => {
    setShowCreateLP(true)
    setEditingLPId(null)
    setLpForm(EMPTY_LP_FORM)
  }

  const startEditLP = (lp: LP) => {
    setShowCreateLP(false)
    setEditingLPId(lp.id)
    setLpForm({
      name: lp.name,
      type: lp.type,
      commitment: lp.commitment,
      paid_in: lp.paid_in,
      business_number: lp.business_number,
      address: lp.address,
      contact: lp.contact,
    })
  }

  const resetLPForm = () => {
    setEditingLPId(null)
    setShowCreateLP(false)
    setLpForm(EMPTY_LP_FORM)
  }

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">조합 운영</h2>
          <p className="page-subtitle">출자, 배분, 총회 운영과 성과지표를 확인합니다.</p>
        </div>
      </div>

      <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
            <Landmark size={20} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-blue-600">조합 선택</label>
            <select
              value={selectedFundId || ''}
              onChange={(e) => setFundId(Number(e.target.value) || null)}
              className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            >
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
          </div>
          {selectedFundId && (
            <button
              onClick={() => navigate(`/funds/${selectedFundId}`)}
              className="secondary-btn whitespace-nowrap text-sm"
            >
              조합 상세 보기
            </button>
          )}
        </div>
      </div>

      <Section
        title="LP 및 출자"
        right={(
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
              <button
                onClick={() => setLpCallTab('lp')}
                className={`rounded-md px-3 py-1 text-xs transition ${lpCallTab === 'lp' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}
              >
                LP 현황
              </button>
              <button
                onClick={() => setLpCallTab('calls')}
                className={`rounded-md px-3 py-1 text-xs transition ${lpCallTab === 'calls' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}
              >
                출자 회차
              </button>
            </div>
            {lpCallTab === 'lp' && <button onClick={startCreateLP} className="primary-btn">LP 추가</button>}
          </div>
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 p-3 text-xs">
          <div>
            <span className="text-gray-500">약정 총액</span>
            <p className="font-semibold text-gray-800">{formatKRW(lpCommitmentSum)}</p>
          </div>
          <div>
            <span className="text-gray-500">납입 총액</span>
            <p className="font-semibold text-gray-800">{formatKRW(lpPaidInSum)}</p>
          </div>
          <div>
            <span className="text-gray-500">납입률</span>
            <p className="font-semibold text-blue-700">
              {lpCommitmentSum ? `${((lpPaidInSum / lpCommitmentSum) * 100).toFixed(1)}%` : '-'}
            </p>
          </div>
          <div>
            <span className="text-gray-500">정합성</span>
            <p className={`font-semibold ${isCommitmentMatched ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isCommitmentMatched ? '✅ 정합' : '⚠️ 차이 있음'}
            </p>
          </div>
        </div>

        {lpCallTab === 'lp' && (
          <>
        {(showCreateLP || editingLPId !== null) && (
          <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">LP명</label>
                <input value={lpForm.name || ''} onChange={(e) => setLpForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="예: OO기관" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">유형</label>
                <input value={lpForm.type || ''} onChange={(e) => setLpForm((prev) => ({ ...prev, type: e.target.value }))} placeholder="예: 기관투자자" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">출자약정액</label>
                <input type="number" value={lpForm.commitment ?? ''} onChange={(e) => setLpForm((prev) => ({ ...prev, commitment: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">납입출자금</label>
                <input type="number" value={lpForm.paid_in ?? ''} onChange={(e) => setLpForm((prev) => ({ ...prev, paid_in: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">사업자등록번호/생년월일</label>
                <input value={lpForm.business_number || ''} onChange={(e) => setLpForm((prev) => ({ ...prev, business_number: e.target.value }))} placeholder="선택 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">주소</label>
                <input value={lpForm.address || ''} onChange={(e) => setLpForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="선택 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">연락처</label>
                <input value={lpForm.contact || ''} onChange={(e) => setLpForm((prev) => ({ ...prev, contact: e.target.value }))} placeholder="선택 입력" className="w-full rounded border px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const payload: LPInput = {
                    name: lpForm.name?.trim() || '',
                    type: lpForm.type?.trim() || '',
                    commitment: lpForm.commitment ?? null,
                    paid_in: lpForm.paid_in ?? null,
                    business_number: lpForm.business_number?.trim() || null,
                    address: lpForm.address?.trim() || null,
                    contact: lpForm.contact?.trim() || null,
                  }
                  if (!payload.name || !payload.type || !selectedFundId) return
                  if (editingLPId != null) {
                    updateLPMut.mutate({ lpId: editingLPId, data: payload })
                  } else {
                    createLPMut.mutate(payload)
                  }
                }}
                className="primary-btn"
                disabled={createLPMut.isPending || updateLPMut.isPending || !selectedFundId}
              >
                저장
              </button>
              <button onClick={resetLPForm} className="secondary-btn">취소</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left">LP명</th>
                <th className="px-2 py-2 text-left">유형</th>
                <th className="px-2 py-2 text-right">출자약정액</th>
                <th className="px-2 py-2 text-right">납입출자금</th>
                <th className="px-2 py-2 text-right">납입률</th>
                <th className="px-2 py-2 text-right">잔여</th>
                <th className="px-2 py-2 text-left">최근 출자일</th>
                <th className="px-2 py-2 text-left">사업자등록번호</th>
                <th className="px-2 py-2 text-left">주소</th>
                <th className="px-2 py-2 text-left">연락처</th>
                <th className="px-2 py-2 text-left">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lps.map((lp) => {
                const commitment = Number(lp.commitment ?? 0)
                const paidIn = Number(lp.paid_in ?? 0)
                const paidRate = commitment > 0 ? (paidIn / commitment) * 100 : null
                const remaining = commitment - paidIn
                const lastCallDate = lpLastCallDateByLpId.get(lp.id)

                return (
                  <tr key={lp.id}>
                    <td className="px-2 py-2">{lp.name}</td>
                    <td className="px-2 py-2">{lp.type}</td>
                    <td className="px-2 py-2 text-right">{formatKRW(lp.commitment ?? null)}</td>
                    <td className="px-2 py-2 text-right">{formatKRW(lp.paid_in ?? null)}</td>
                    <td className="px-2 py-2 text-right">{paidRate == null ? '-' : `${paidRate.toFixed(1)}%`}</td>
                    <td className="px-2 py-2 text-right">{formatKRW(remaining)}</td>
                    <td className="px-2 py-2">{toDate(lastCallDate)}</td>
                    <td className="px-2 py-2">{lp.business_number || '-'}</td>
                    <td className="px-2 py-2">{lp.address || '-'}</td>
                    <td className="px-2 py-2">{lp.contact || '-'}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => startEditLP(lp)} className="secondary-btn">수정</button>
                        <button onClick={() => setTransferSourceLp(lp)} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100">양수양도</button>
                        <button onClick={() => deleteLPMut.mutate(lp.id)} className="danger-btn">삭제</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!lps.length && (
                <tr>
                  <td colSpan={11} className="px-2 py-4 text-center text-gray-400">등록된 LP가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded border border-gray-200 p-2">
          <p className="mb-2 text-xs font-semibold text-gray-600">LP 양수양도 이력</p>
          {!lpTransfers.length ? (
            <p className="text-xs text-gray-400">등록된 양수양도 이력이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {lpTransfers.map((transfer) => (
                <div key={transfer.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate text-gray-700">{transfer.from_lp_name || transfer.from_lp_id} → {transfer.to_lp_name || transfer.to_lp_id || '신규 LP'} | {formatKRW(transfer.transfer_amount)}</p>
                    <p className="text-gray-500">{transfer.transfer_date || '-'} | {transfer.workflow_instance_id ? `WF #${transfer.workflow_instance_id}` : '워크플로 미연결'}</p>
                  </div>
                  <div className="ml-2 flex items-center gap-1">
                    <span className={`rounded px-1.5 py-0.5 ${
                      transfer.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : transfer.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {LP_TRANSFER_STATUS_LABEL[transfer.status] || transfer.status}
                    </span>
                    {transfer.status !== 'completed' && (
                      <button onClick={() => completeLPTransferMut.mutate(transfer.id)} className="rounded px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                        완료
                      </button>
                    )}
                    {transfer.status !== 'cancelled' && transfer.status !== 'completed' && (
                      <button onClick={() => cancelLPTransferMut.mutate(transfer.id)} className="rounded px-2 py-0.5 text-[11px] bg-red-50 text-red-700 hover:bg-red-100">
                        취소
                      </button>
                    )}
                    {transfer.workflow_instance_id && (
                      <button onClick={() => navigate('/workflows', { state: { expandInstanceId: transfer.workflow_instance_id } })} className="rounded px-2 py-0.5 text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100">
                        이동
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        {lpCallTab === 'calls' && (
          <>
        <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">출자일</label>
            <input type="date" value={newCall.call_date} onChange={(e) => setNewCall((p) => ({ ...p, call_date: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">출자 유형</label>
            <select value={newCall.call_type} onChange={(e) => setNewCall((p) => ({ ...p, call_type: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
              {CALL_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelCallType(type)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">출자 총액</label>
            <input type="number" value={newCall.total_amount || 0} onChange={(e) => setNewCall((p) => ({ ...p, total_amount: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="숫자 입력" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">요청 비율(%)</label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={newCall.request_percent ?? ''}
              onChange={(e) => setNewCall((p) => ({ ...p, request_percent: e.target.value === '' ? null : Number(e.target.value) }))}
              className="w-full rounded border px-2 py-1 text-sm"
              placeholder="선택 입력"
            />
          </div>
          <div className="flex items-end">
            <button onClick={() => selectedFundId && createCallMut.mutate({ ...newCall, fund_id: selectedFundId, memo: newCall.memo?.trim() || null })} className="primary-btn">등록</button>
          </div>
        </div>
        <div className="space-y-2">
          {calls?.map((row) => (
            <div key={row.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-800">
                  {toDate(row.call_date)} | {labelCallType(row.call_type)} | {formatKRW(row.total_amount)}
                  {row.request_percent != null ? ` | ${row.request_percent}%` : ''}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setCallExpandedId(callExpandedId === row.id ? null : row.id)} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100">LP 내역</button>
                  <button onClick={() => toggleCallEdit(row)} className="secondary-btn">수정</button>
                  <button onClick={() => deleteCallMut.mutate(row.id)} className="danger-btn">삭제</button>
                </div>
              </div>
              {editingCallId === row.id && editCall && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">출자일</label>
                    <input type="date" value={editCall.call_date} onChange={(e) => setEditCall((p) => (p ? { ...p, call_date: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">출자 유형</label>
                    <select value={editCall.call_type} onChange={(e) => setEditCall((p) => (p ? { ...p, call_type: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm">
                      {CALL_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelCallType(type)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">출자 총액</label>
                    <input type="number" value={editCall.total_amount} onChange={(e) => setEditCall((p) => (p ? { ...p, total_amount: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">요청 비율(%)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={editCall.request_percent ?? ''}
                      onChange={(e) => setEditCall((p) => (p ? { ...p, request_percent: e.target.value === '' ? null : Number(e.target.value) } : p))}
                      className="w-full rounded border px-2 py-1 text-sm"
                      placeholder="요청 비율(%)"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        updateCallMut.mutate({
                          id: row.id,
                          data: {
                            call_date: editCall.call_date,
                            call_type: editCall.call_type,
                            total_amount: editCall.total_amount,
                            request_percent: editCall.request_percent,
                            memo: editCall.memo.trim() || null,
                          },
                        })
                      }
                      className="primary-btn"
                    >
                      저장
                    </button>
                    <button onClick={() => { setEditingCallId(null); setEditCall(null) }} className="secondary-btn">취소</button>
                  </div>
                </div>
              )}
              {callExpandedId === row.id && (
                <div className="mt-2 rounded bg-gray-50 p-2 space-y-2">
                  <CapitalCallDetail
                    capitalCallId={row.id}
                    commitmentTotal={Number(fundDetail?.commitment_total ?? 0)}
                    editable={true}
                  />
                  <div className="border-t border-gray-200 pt-2">
                    <p className="mb-1 text-xs font-semibold text-gray-500">LP 항목 관리</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">LP</label>
                      <select value={newCallItem.lp_id || ''} onChange={(e) => setNewCallItem((p) => ({ ...p, lp_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm">
                        <option value="">LP</option>
                        {lps.map((lp) => <option key={lp.id} value={lp.id}>{lp.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">출자금액</label>
                      <input type="number" value={newCallItem.amount || 0} onChange={(e) => setNewCallItem((p) => ({ ...p, amount: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">납입 상태</label>
                      <select value={newCallItem.paid ? '1' : '0'} onChange={(e) => setNewCallItem((p) => ({ ...p, paid: e.target.value === '1' }))} className="w-full rounded border px-2 py-1 text-sm"><option value="0">미납</option><option value="1">납입</option></select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">납입일</label>
                      <input type="date" value={newCallItem.paid_date || ''} onChange={(e) => setNewCallItem((p) => ({ ...p, paid_date: e.target.value || null }))} className="w-full rounded border px-2 py-1 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <button onClick={() => newCallItem.lp_id && createCallItemMut.mutate({ id: row.id, data: newCallItem })} className="primary-btn">항목 추가</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {callItems?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2">
                        {editingCallItemId === item.id && editCallItem ? (
                          <div className="w-full grid grid-cols-1 gap-2 md:grid-cols-5">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">출자금액</label>
                              <input type="number" value={editCallItem.amount} onChange={(e) => setEditCallItem((p) => (p ? { ...p, amount: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">납입 상태</label>
                              <select value={editCallItem.paid ? '1' : '0'} onChange={(e) => setEditCallItem((p) => (p ? { ...p, paid: e.target.value === '1' } : p))} className="w-full rounded border px-2 py-1 text-sm"><option value="0">미납</option><option value="1">납입</option></select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">납입일</label>
                              <input type="date" value={editCallItem.paid_date || ''} onChange={(e) => setEditCallItem((p) => (p ? { ...p, paid_date: e.target.value || null } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                            </div>
                            <button onClick={() => updateCallItemMut.mutate({ callId: row.id, itemId: item.id, data: { amount: editCallItem.amount, paid: editCallItem.paid, paid_date: editCallItem.paid_date } })} className="primary-btn">저장</button>
                            <button onClick={() => { setEditingCallItemId(null); setEditCallItem(null) }} className="secondary-btn">취소</button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-gray-600">LP {item.lp_name || item.lp_id} | {formatKRW(item.amount)} | {item.paid ? '납입' : '미납'} | {toDate(item.paid_date)}</p>
                            <div className="flex gap-1">
                              <button onClick={() => toggleCallItemEdit(item)} className="secondary-btn">수정</button>
                              <button onClick={() => deleteCallItemMut.mutate({ callId: row.id, itemId: item.id })} className="danger-btn">삭제</button>
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
          </>
        )}
      </Section>

      <Section
        title="성과지표"
        right={(
          <div>
            <label className="mb-1 block text-[10px] font-medium text-gray-500">기준일</label>
            <input type="date" value={performanceDate} onChange={(e) => setPerformanceDate(e.target.value)} className="rounded border px-2 py-1 text-xs" />
          </div>
        )}
      >
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

      <Section title="배분">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5 mb-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">배분일</label>
            <input type="date" value={newDistribution.dist_date} onChange={(e) => setNewDistribution((p) => ({ ...p, dist_date: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">배분 유형</label>
            <select value={newDistribution.dist_type} onChange={(e) => setNewDistribution((p) => ({ ...p, dist_type: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
              {DIST_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelDistributionType(type)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">원금 총액</label>
            <input type="number" value={newDistribution.principal_total || 0} onChange={(e) => setNewDistribution((p) => ({ ...p, principal_total: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">수익 총액</label>
            <input type="number" value={newDistribution.profit_total || 0} onChange={(e) => setNewDistribution((p) => ({ ...p, profit_total: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" />
          </div>
          <div className="flex items-end">
            <button onClick={() => selectedFundId && createDistMut.mutate({ ...newDistribution, fund_id: selectedFundId, memo: newDistribution.memo?.trim() || null })} className="primary-btn">등록</button>
          </div>
        </div>
        <div className="space-y-2">
          {distributions?.map((row) => (
            <div key={row.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-800">{toDate(row.dist_date)} | {labelDistributionType(row.dist_type)} | 원금 총액 {formatKRW(row.principal_total)} | 수익 총액 {formatKRW(row.profit_total)}</p>
                <div className="flex gap-1">
                  <button onClick={() => setDistExpandedId(distExpandedId === row.id ? null : row.id)} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100">LP 내역</button>
                  <button onClick={() => toggleDistributionEdit(row)} className="secondary-btn">수정</button>
                  <button onClick={() => deleteDistMut.mutate(row.id)} className="danger-btn">삭제</button>
                </div>
              </div>
              {editingDistId === row.id && editDistribution && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">배분일</label>
                    <input type="date" value={editDistribution.dist_date} onChange={(e) => setEditDistribution((p) => (p ? { ...p, dist_date: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">배분 유형</label>
                    <select value={editDistribution.dist_type} onChange={(e) => setEditDistribution((p) => (p ? { ...p, dist_type: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm">
                      {DIST_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelDistributionType(type)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">원금 총액</label>
                    <input type="number" value={editDistribution.principal_total} onChange={(e) => setEditDistribution((p) => (p ? { ...p, principal_total: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">수익 총액</label>
                    <input type="number" value={editDistribution.profit_total} onChange={(e) => setEditDistribution((p) => (p ? { ...p, profit_total: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => updateDistMut.mutate({ id: row.id, data: { dist_date: editDistribution.dist_date, dist_type: editDistribution.dist_type, principal_total: editDistribution.principal_total, profit_total: editDistribution.profit_total, performance_fee: editDistribution.performance_fee, memo: editDistribution.memo.trim() || null } })} className="primary-btn">저장</button>
                    <button onClick={() => { setEditingDistId(null); setEditDistribution(null) }} className="secondary-btn">취소</button>
                  </div>
                </div>
              )}
              {distExpandedId === row.id && (
                <div className="mt-2 rounded bg-gray-50 p-2 space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">LP</label>
                      <select value={newDistributionItem.lp_id || ''} onChange={(e) => setNewDistributionItem((p) => ({ ...p, lp_id: Number(e.target.value) || 0 }))} className="w-full rounded border px-2 py-1 text-sm">
                        <option value="">LP</option>
                        {lps.map((lp) => <option key={lp.id} value={lp.id}>{lp.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">원금</label>
                      <input type="number" value={newDistributionItem.principal || 0} onChange={(e) => setNewDistributionItem((p) => ({ ...p, principal: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">수익</label>
                      <input type="number" value={newDistributionItem.profit || 0} onChange={(e) => setNewDistributionItem((p) => ({ ...p, profit: Number(e.target.value || 0) }))} className="w-full rounded border px-2 py-1 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <button onClick={() => newDistributionItem.lp_id && createDistItemMut.mutate({ id: row.id, data: newDistributionItem })} className="primary-btn">항목 추가</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {distributionItems?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2">
                        {editingDistItemId === item.id && editDistributionItem ? (
                          <div className="w-full grid grid-cols-1 gap-2 md:grid-cols-4">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">원금</label>
                              <input type="number" value={editDistributionItem.principal} onChange={(e) => setEditDistributionItem((p) => (p ? { ...p, principal: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">수익</label>
                              <input type="number" value={editDistributionItem.profit} onChange={(e) => setEditDistributionItem((p) => (p ? { ...p, profit: Number(e.target.value || 0) } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                            </div>
                            <button onClick={() => updateDistItemMut.mutate({ distributionId: row.id, itemId: item.id, data: { principal: editDistributionItem.principal, profit: editDistributionItem.profit } })} className="primary-btn">저장</button>
                            <button onClick={() => { setEditingDistItemId(null); setEditDistributionItem(null) }} className="secondary-btn">취소</button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-gray-600">LP {item.lp_name || item.lp_id} | 원금 {formatKRW(item.principal)} | 수익 {formatKRW(item.profit)}</p>
                            <div className="flex gap-1">
                              <button onClick={() => toggleDistributionItemEdit(item)} className="secondary-btn">수정</button>
                              <button onClick={() => deleteDistItemMut.mutate({ distributionId: row.id, itemId: item.id })} className="danger-btn">삭제</button>
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
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">총회일</label>
            <input type="date" value={newAssembly.date} onChange={(e) => setNewAssembly((p) => ({ ...p, date: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">총회 유형</label>
            <select value={newAssembly.type} onChange={(e) => setNewAssembly((p) => ({ ...p, type: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
              {ASSEMBLY_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelAssemblyType(type)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
            <select value={newAssembly.status || ''} onChange={(e) => setNewAssembly((p) => ({ ...p, status: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
              {ASSEMBLY_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">안건</label>
            <input value={newAssembly.agenda || ''} onChange={(e) => setNewAssembly((p) => ({ ...p, agenda: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="선택 입력" />
          </div>
          <div className="flex items-end">
            <button onClick={() => selectedFundId && createAssemblyMut.mutate({ ...newAssembly, fund_id: selectedFundId, agenda: newAssembly.agenda?.trim() || null })} className="primary-btn">등록</button>
          </div>
        </div>
        <div className="space-y-1">
          {assemblies?.map((row) => (
            <div key={row.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">{toDate(row.date)} | {labelAssemblyType(row.type)} | {labelStatus(row.status)} | 의사록 {row.minutes_completed ? '작성 완료' : '미작성'}</p>
                <div className="flex gap-1">
                  <button onClick={() => toggleAssemblyEdit(row)} className="secondary-btn">수정</button>
                  <button onClick={() => deleteAssemblyMut.mutate(row.id)} className="danger-btn">삭제</button>
                </div>
              </div>
              {editingAssemblyId === row.id && editAssembly && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">총회일</label>
                    <input type="date" value={editAssembly.date} onChange={(e) => setEditAssembly((p) => (p ? { ...p, date: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">총회 유형</label>
                    <select value={editAssembly.type} onChange={(e) => setEditAssembly((p) => (p ? { ...p, type: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm">
                      {ASSEMBLY_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{labelAssemblyType(type)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
                    <select value={editAssembly.status} onChange={(e) => setEditAssembly((p) => (p ? { ...p, status: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm">
                      {ASSEMBLY_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">안건</label>
                    <input value={editAssembly.agenda} onChange={(e) => setEditAssembly((p) => (p ? { ...p, agenda: e.target.value } : p))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => updateAssemblyMut.mutate({ id: row.id, data: { date: editAssembly.date, type: editAssembly.type, status: editAssembly.status, agenda: editAssembly.agenda.trim() || null, minutes_completed: editAssembly.minutes_completed, memo: editAssembly.memo.trim() || null } })} className="primary-btn">저장</button>
                    <button onClick={() => { setEditingAssemblyId(null); setEditAssembly(null) }} className="secondary-btn">취소</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
      {transferSourceLp && selectedFundId && (
        <LPTransferModal
          fromLp={transferSourceLp}
          lps={lps}
          loading={createLPTransferMut.isPending}
          onSubmit={(data) => createLPTransferMut.mutate(data)}
          onCancel={() => setTransferSourceLp(null)}
        />
      )}
    </div>
  )
}







