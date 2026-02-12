import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchFunds,
  fetchFund,
  createFund,
  updateFund,
  deleteFund,
  createFundLP,
  updateFundLP,
  deleteFundLP,
  type FundInput,
  type LPInput,
} from '../lib/api'
import { Building2, Plus, Pencil, Trash2, X } from 'lucide-react'

const EMPTY_FUND: FundInput = {
  name: '',
  type: 'Venture Fund',
  formation_date: '',
  status: 'active',
  gp: '',
  co_gp: '',
  trustee: '',
  commitment_total: null,
  aum: null,
}

const EMPTY_LP: LPInput = {
  name: '',
  type: 'Institution',
  commitment: null,
  paid_in: null,
  contact: '',
}

function FundForm({ title, initial, loading, onSubmit, onCancel }: { title: string; initial: FundInput; loading: boolean; onSubmit: (data: FundInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState<FundInput>(initial)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Fund name" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} placeholder="Fund type" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="date" value={form.formation_date || ''} onChange={e => setForm(prev => ({ ...prev, formation_date: e.target.value }))} className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="Status" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.gp || ''} onChange={e => setForm(prev => ({ ...prev, gp: e.target.value }))} placeholder="GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.co_gp || ''} onChange={e => setForm(prev => ({ ...prev, co_gp: e.target.value }))} placeholder="Co-GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.trustee || ''} onChange={e => setForm(prev => ({ ...prev, trustee: e.target.value }))} placeholder="Trustee" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.commitment_total ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment_total: e.target.value ? Number(e.target.value) : null }))} placeholder="Total commitment" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.aum ?? ''} onChange={e => setForm(prev => ({ ...prev, aum: e.target.value ? Number(e.target.value) : null }))} placeholder="AUM" className="px-3 py-2 text-sm border rounded-lg" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            name: form.name.trim(),
            type: form.type.trim(),
            formation_date: form.formation_date || null,
            gp: form.gp?.trim() || null,
            co_gp: form.co_gp?.trim() || null,
            trustee: form.trustee?.trim() || null,
          })}
          disabled={loading || !form.name.trim()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
      </div>
    </div>
  )
}

function LPForm({ initial, loading, onSubmit, onCancel }: { initial: LPInput; loading: boolean; onSubmit: (data: LPInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState<LPInput>(initial)

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="LP name" className="px-2 py-1 text-sm border rounded" />
        <input value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} placeholder="LP type" className="px-2 py-1 text-sm border rounded" />
        <input type="number" value={form.commitment ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment: e.target.value ? Number(e.target.value) : null }))} placeholder="Commitment" className="px-2 py-1 text-sm border rounded" />
        <input type="number" value={form.paid_in ?? ''} onChange={e => setForm(prev => ({ ...prev, paid_in: e.target.value ? Number(e.target.value) : null }))} placeholder="Paid in" className="px-2 py-1 text-sm border rounded" />
        <input value={form.contact || ''} onChange={e => setForm(prev => ({ ...prev, contact: e.target.value }))} placeholder="Contact" className="px-2 py-1 text-sm border rounded" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ ...form, name: form.name.trim(), type: form.type.trim(), contact: form.contact?.trim() || null })}
          disabled={loading || !form.name.trim() || !form.type.trim()}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-3 py-1 text-xs bg-white border rounded hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  )
}

export default function FundsPage() {
  const queryClient = useQueryClient()
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null)
  const [showCreateFund, setShowCreateFund] = useState(false)
  const [editingFund, setEditingFund] = useState(false)
  const [showCreateLP, setShowCreateLP] = useState(false)
  const [editingLPId, setEditingLPId] = useState<number | null>(null)

  const { data: funds, isLoading } = useQuery({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: fundDetail } = useQuery({ queryKey: ['fund', selectedFundId], queryFn: () => fetchFund(selectedFundId as number), enabled: !!selectedFundId })

  const createFundMut = useMutation({ mutationFn: createFund, onSuccess: (created: any) => { queryClient.invalidateQueries({ queryKey: ['funds'] }); setSelectedFundId(created.id); setShowCreateFund(false) } })
  const updateFundMut = useMutation({ mutationFn: ({ id, data }: { id: number; data: Partial<FundInput> }) => updateFund(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['funds'] }); queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] }); setEditingFund(false) } })
  const deleteFundMut = useMutation({ mutationFn: deleteFund, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['funds'] }); setSelectedFundId(null); setEditingFund(false) } })
  const createLPMut = useMutation({ mutationFn: ({ fundId, data }: { fundId: number; data: LPInput }) => createFundLP(fundId, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['funds'] }); setShowCreateLP(false) } })
  const updateLPMut = useMutation({ mutationFn: ({ fundId, lpId, data }: { fundId: number; lpId: number; data: Partial<LPInput> }) => updateFundLP(fundId, lpId, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] }); setEditingLPId(null) } })
  const deleteLPMut = useMutation({ mutationFn: ({ fundId, lpId }: { fundId: number; lpId: number }) => deleteFundLP(fundId, lpId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fund', selectedFundId] }); queryClient.invalidateQueries({ queryKey: ['funds'] }) } })

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-2xl font-bold text-slate-900 mb-5">Funds</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Fund List</h3>
            <button onClick={() => setShowCreateFund(true)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Plus size={14} /> Add Fund</button>
          </div>

          {showCreateFund && <div className="mb-3"><FundForm title="Create Fund" initial={EMPTY_FUND} loading={createFundMut.isPending} onSubmit={data => createFundMut.mutate(data)} onCancel={() => setShowCreateFund(false)} /></div>}

          {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
            <div className="space-y-2">
              {funds?.map((f: any) => (
                <button key={f.id} onClick={() => { setSelectedFundId(f.id); setEditingFund(false) }} className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedFundId === f.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-slate-800 flex items-center gap-2"><Building2 size={15} />{f.name}</h4>
                    <span className="text-xs text-slate-500">LP {f.lp_count}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{f.type} | {f.status}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Fund Detail</h3>
          {!selectedFundId || !fundDetail ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-500">Select a fund.</div>
          ) : editingFund ? (
            <FundForm title="Edit Fund" initial={{ ...fundDetail, formation_date: fundDetail.formation_date || '' }} loading={updateFundMut.isPending} onSubmit={data => updateFundMut.mutate({ id: selectedFundId, data })} onCancel={() => setEditingFund(false)} />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-slate-800">{fundDetail.name}</h4>
                  <p className="text-sm text-slate-500">{fundDetail.type} | {fundDetail.status}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingFund(true)} className="px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200 flex items-center gap-1"><Pencil size={12} />Edit</button>
                  <button onClick={() => { if (confirm('Delete this fund?')) deleteFundMut.mutate(selectedFundId) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center gap-1"><Trash2 size={12} />Delete</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-slate-50 rounded">Formation date: {fundDetail.formation_date || '-'}</div>
                <div className="p-2 bg-slate-50 rounded">GP: {fundDetail.gp || '-'}</div>
                <div className="p-2 bg-slate-50 rounded">Co-GP: {fundDetail.co_gp || '-'}</div>
                <div className="p-2 bg-slate-50 rounded">Trustee: {fundDetail.trustee || '-'}</div>
                <div className="p-2 bg-slate-50 rounded">Commitment: {fundDetail.commitment_total?.toLocaleString?.() ?? '-'}</div>
                <div className="p-2 bg-slate-50 rounded">AUM: {fundDetail.aum?.toLocaleString?.() ?? '-'}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-slate-700">LPs</h5>
                  <button onClick={() => setShowCreateLP(true)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">+ Add LP</button>
                </div>

                {showCreateLP && <div className="mb-2"><LPForm initial={EMPTY_LP} loading={createLPMut.isPending} onSubmit={data => createLPMut.mutate({ fundId: selectedFundId, data })} onCancel={() => setShowCreateLP(false)} /></div>}

                <div className="space-y-2">
                  {fundDetail.lps?.length ? fundDetail.lps.map((lp: any) => (
                    <div key={lp.id} className="border border-slate-200 rounded-lg p-3">
                      {editingLPId === lp.id ? (
                        <LPForm initial={lp} loading={updateLPMut.isPending} onSubmit={data => updateLPMut.mutate({ fundId: selectedFundId, lpId: lp.id, data })} onCancel={() => setEditingLPId(null)} />
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{lp.name}</p>
                              <p className="text-xs text-slate-500">{lp.type} | Contact: {lp.contact || '-'}</p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingLPId(lp.id)} className="px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200">Edit</button>
                              <button onClick={() => { if (confirm('Delete this LP?')) deleteLPMut.mutate({ fundId: selectedFundId, lpId: lp.id }) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">Delete</button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">Commitment: {lp.commitment?.toLocaleString?.() ?? '-'} | Paid in: {lp.paid_in?.toLocaleString?.() ?? '-'}</p>
                        </>
                      )}
                    </div>
                  )) : <p className="text-sm text-slate-400">No LPs yet.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
