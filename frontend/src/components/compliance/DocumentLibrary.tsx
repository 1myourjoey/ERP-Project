import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import { useToast } from '../../contexts/ToastContext'
import {
  deleteLegalDocument,
  fetchFunds,
  fetchInvestments,
  fetchLegalDocuments,
  fetchLegalDocumentStats,
  searchLegalDocuments,
  uploadLegalDocument,
  type Fund,
  type Investment,
  type LegalDocument,
  type LegalDocumentScope,
  type LegalDocumentSourceTier,
  type LegalDocumentSearchResponse,
  type LegalDocumentType,
} from '../../lib/api'

type DocumentLibraryProps = {
  funds?: Fund[]
}

const SOURCE_TIER_OPTIONS: Array<{ value: LegalDocumentSourceTier; label: string }> = [
  { value: 'law', label: '1순위 법령' },
  { value: 'fund_bylaw', label: '2순위 조합 규약' },
  { value: 'special_guideline', label: '3순위 특별조합원 가이드라인' },
  { value: 'investment_contract', label: '4순위 투자계약서' },
]

const DOC_TYPES: Array<{ value: LegalDocumentType; label: string }> = [
  { value: 'laws', label: '법률' },
  { value: 'regulations', label: '시행령/시행규칙' },
  { value: 'guidelines', label: '가이드라인' },
  { value: 'agreements', label: '규약/계약' },
  { value: 'internal', label: '내부지침' },
]

const SCOPE_META: Record<LegalDocumentScope, { icon: string; label: string }> = {
  global: { icon: '🌐', label: '공통' },
  fund_type: { icon: '📋', label: '유형별' },
  fund: { icon: '🏢', label: '조합별' },
  investment: { icon: '📄', label: '투자건별' },
}

function typeLabel(type: string): string {
  return DOC_TYPES.find((item) => item.value === type)?.label ?? type
}

function availableDocTypes(sourceTier: LegalDocumentSourceTier): LegalDocumentType[] {
  if (sourceTier === 'law') return ['laws', 'regulations']
  if (sourceTier === 'fund_bylaw') return ['guidelines', 'agreements', 'internal']
  if (sourceTier === 'special_guideline') return ['guidelines', 'agreements']
  return ['agreements', 'internal']
}

function sourceTierHelp(sourceTier: LegalDocumentSourceTier): string {
  if (sourceTier === 'law') return '전체 조합에 공통으로 적용되는 상위 기준입니다.'
  if (sourceTier === 'fund_bylaw') return '선택한 조합 전체에 적용되는 규약/내부 기준입니다.'
  if (sourceTier === 'special_guideline') return '특별조합원이 요구하는 권고성 가이드라인입니다.'
  return '선택한 투자건에 직접 연결되는 계약 기준입니다.'
}

function similarityLabel(distance: number | null | undefined): string {
  if (distance == null || Number.isNaN(distance)) return '-'
  const similarity = Math.max(0, Math.min(1, 1 - distance))
  return similarity.toFixed(2)
}

function normalizeScope(raw: unknown): LegalDocumentScope {
  if (raw === 'fund_type') return 'fund_type'
  if (raw === 'fund') return 'fund'
  if (raw === 'investment') return 'investment'
  return 'global'
}

function scopeBadge(scope: LegalDocumentScope) {
  const meta = SCOPE_META[scope]
  return (
    <span className="tag tag-blue">
      {meta.icon} {meta.label}
    </span>
  )
}

export default function DocumentLibrary({ funds: fundsProp }: DocumentLibraryProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [title, setTitle] = useState('')
  const [sourceTier, setSourceTier] = useState<LegalDocumentSourceTier>('law')
  const [documentType, setDocumentType] = useState<LegalDocumentType>('laws')
  const [version, setVersion] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null)
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<number | null>(null)
  const [fundTypeFilter, setFundTypeFilter] = useState('')
  const [documentRole, setDocumentRole] = useState('')

  const [searchText, setSearchText] = useState('')
  const [searchCollection, setSearchCollection] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  const hasFundsProp = Array.isArray(fundsProp) && fundsProp.length > 0
  const { data: fetchedFunds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
    enabled: !hasFundsProp,
  })
  const funds = hasFundsProp ? (fundsProp as Fund[]) : fetchedFunds
  const { data: investments = [] } = useQuery<Investment[]>({
    queryKey: ['investments', { fund_id: selectedFundId }],
    queryFn: () => fetchInvestments({ fund_id: selectedFundId ?? undefined }),
    enabled: selectedFundId != null && sourceTier === 'investment_contract',
  })

  const fundTypeOptions = useMemo(() => {
    const unique = new Set<string>()
    for (const fund of funds) {
      const normalized = (fund.type || '').trim()
      if (normalized) unique.add(normalized)
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [funds])

  const { data: documents = [], isLoading: isDocumentsLoading } = useQuery<LegalDocument[]>({
    queryKey: ['legal-documents'],
    queryFn: () => fetchLegalDocuments(),
  })

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['legal-document-stats'],
    queryFn: fetchLegalDocumentStats,
  })

  const searchParams = useMemo(
    () => ({
      query: submittedQuery,
      collection: searchCollection || undefined,
      fund_id: selectedFundId ?? undefined,
      investment_id: selectedInvestmentId ?? undefined,
      n_results: 10,
    }),
    [submittedQuery, searchCollection, selectedFundId, selectedInvestmentId],
  )

  const { data: searchResult, isFetching: isSearchLoading } = useQuery<LegalDocumentSearchResponse>({
    queryKey: ['legal-document-search', searchParams],
    queryFn: () => searchLegalDocuments(searchParams),
    enabled: submittedQuery.trim().length > 0,
  })

  const uploadMut = useMutation({
    mutationFn: uploadLegalDocument,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['legal-documents'] })
      queryClient.invalidateQueries({ queryKey: ['legal-document-stats'] })
      if (submittedQuery.trim()) {
        queryClient.invalidateQueries({ queryKey: ['legal-document-search'] })
      }
      setTitle('')
      setVersion('')
      setSelectedFile(null)
      setSelectedFundId(null)
      setFundTypeFilter('')
      setSelectedInvestmentId(null)
      setDocumentRole('')
      if (result.auto_review?.review) {
        addToast('success', `${result.document.title} 업로드 및 인덱싱 완료 (${result.chunk_count} 청크) · 자동 검토 ${result.auto_review.review.result}`)
      } else {
        addToast('success', `${result.document.title} 업로드 및 인덱싱 완료 (${result.chunk_count} 청크)`)
      }
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteLegalDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-documents'] })
      queryClient.invalidateQueries({ queryKey: ['legal-document-stats'] })
      queryClient.invalidateQueries({ queryKey: ['legal-document-search'] })
      addToast('success', '문서를 삭제했습니다.')
    },
  })

  const statRows = DOC_TYPES.map((item) => ({
    ...item,
    count: stats?.collections?.[item.value]?.count ?? 0,
  }))

  const totalChunks = stats?.total_chunks ?? 0
  const isFundScoped = sourceTier === 'fund_bylaw' || sourceTier === 'special_guideline'
  const isInvestmentScoped = sourceTier === 'investment_contract'

  function onUpload() {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      addToast('warning', '문서 제목을 입력해주세요.')
      return
    }
    if (!selectedFile) {
      addToast('warning', '업로드할 파일을 선택해주세요.')
      return
    }
    if (isFundScoped && selectedFundId === null) {
      addToast('warning', `${sourceTier === 'special_guideline' ? '특별조합원 가이드라인' : '규약'} 문서는 귀속 조합을 선택해야 합니다.`)
      return
    }
    if (isInvestmentScoped && selectedFundId === null) {
      addToast('warning', '투자계약서는 조합을 먼저 선택해야 합니다.')
      return
    }
    if (isInvestmentScoped && selectedInvestmentId === null) {
      addToast('warning', '투자계약서는 귀속 투자건을 선택해야 합니다.')
      return
    }
    if (sourceTier === 'special_guideline' && !documentRole.trim()) {
      addToast('warning', '특별조합원 가이드라인은 발행 주체를 적어주세요. 예: 모태, 성장금융')
      return
    }
    uploadMut.mutate({
      file: selectedFile,
      title: normalizedTitle,
      document_type: documentType,
      source_tier: sourceTier,
      version: version.trim() || null,
      fund_id: isFundScoped || isInvestmentScoped ? selectedFundId : null,
      investment_id: isInvestmentScoped ? selectedInvestmentId : null,
      fund_type_filter: sourceTier === 'law' ? null : (fundTypeFilter.trim() || null),
      document_role: documentRole.trim() || null,
    })
  }

  function onSearch() {
    const normalized = searchText.trim()
    if (!normalized) {
      setSubmittedQuery('')
      return
    }
    setSubmittedQuery(normalized)
  }

  function onDelete(documentId: number) {
    const confirmed = confirm('정말 삭제하시겠습니까? 벡터DB 청크도 함께 삭제됩니다.')
    if (!confirmed) return
    deleteMut.mutate(documentId)
  }

  const selectedFund = funds.find((fund) => fund.id === selectedFundId) ?? null
  const selectedInvestment = investments.find((investment) => investment.id === selectedInvestmentId) ?? null
  const ownershipPreview =
    sourceTier === 'law'
      ? '전체 공통 기준'
      : sourceTier === 'fund_bylaw'
        ? `${selectedFund?.name || '조합 선택 필요'} 기준`
        : sourceTier === 'special_guideline'
          ? `${selectedFund?.name || '조합 선택 필요'} / ${documentRole.trim() || '발행 주체 입력 필요'}`
          : `${selectedFund?.name || '조합 선택 필요'} / ${selectedInvestment?.company_name || (selectedInvestmentId ? `투자건 #${selectedInvestmentId}` : '투자건 선택 필요')}`

  return (
    <div className="space-y-4">
      <div className="card-base">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0f1f3d]">준법 문서 기준</h3>
          <span className="tag tag-indigo">총 {totalChunks} 청크</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <select
            className="form-input"
            value={sourceTier}
            onChange={(event) => {
              const nextTier = event.target.value as LegalDocumentSourceTier
              setSourceTier(nextTier)
              setSelectedInvestmentId(null)
              setDocumentRole('')
              if (nextTier === 'law') setDocumentType('laws')
              if (nextTier === 'fund_bylaw') setDocumentType('agreements')
              if (nextTier === 'special_guideline') setDocumentType('guidelines')
              if (nextTier === 'investment_contract') setDocumentType('agreements')
            }}
          >
            {SOURCE_TIER_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            className="form-input md:col-span-1"
            placeholder="문서 제목"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <select
            className="form-input"
            value={documentType}
            onChange={(event) => {
              const nextType = event.target.value as LegalDocumentType
              setDocumentType(nextType)
              if (nextType !== 'guidelines') setFundTypeFilter('')
              if (nextType !== 'agreements' && nextType !== 'internal') setSelectedFundId(null)
            }}
          >
            {DOC_TYPES.filter((item) => availableDocTypes(sourceTier).includes(item.value)).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            placeholder="버전 (예: 2026 개정)"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
          <input
            className="form-input"
            type="file"
            accept=".pdf,.docx"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
        </div>

        {(isFundScoped || isInvestmentScoped) && (
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="md:col-span-1">
              <span className="mb-1 block text-xs font-medium text-[#64748b]">귀속 조합</span>
              <select
                className="form-input"
                value={selectedFundId ?? ''}
                onChange={(event) => {
                  setSelectedFundId(event.target.value ? Number(event.target.value) : null)
                  setSelectedInvestmentId(null)
                }}
              >
                <option value="">선택</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-xs font-medium text-[#64748b]">조합 유형</span>
              {fundTypeOptions.length > 0 ? (
                <select
                  className="form-input"
                  value={fundTypeFilter}
                  onChange={(event) => setFundTypeFilter(event.target.value)}
                >
                  <option value="">선택</option>
                  {fundTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  placeholder="예: 벤처투자조합"
                  value={fundTypeFilter}
                  onChange={(event) => setFundTypeFilter(event.target.value)}
                />
              )}
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-xs font-medium text-[#64748b]">문서 역할</span>
              <input
                className="form-input"
                placeholder={
                  isInvestmentScoped
                    ? '예: 주주간계약, 신주인수계약'
                    : sourceTier === 'special_guideline'
                      ? '예: 모태, 농모태, 성장금융'
                      : '예: 조합규약, 총회결의'
                }
                value={documentRole}
                onChange={(event) => setDocumentRole(event.target.value)}
              />
            </label>
          </div>
        )}

        {isInvestmentScoped && (
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="md:col-span-1">
              <span className="mb-1 block text-xs font-medium text-[#64748b]">귀속 투자건</span>
              <select
                className="form-input"
                value={selectedInvestmentId ?? ''}
                onChange={(event) => setSelectedInvestmentId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">선택</option>
                {investments.map((investment) => (
                  <option key={investment.id} value={investment.id}>
                    {investment.company_name || `투자건 #${investment.id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-[#d8e5fb] bg-[#f8fbff] p-3 text-xs text-[#0f1f3d]">
          <p className="font-semibold text-[#1a3660]">귀속 미리보기</p>
          <p className="mt-1">{ownershipPreview}</p>
          <p className="mt-1 text-[#64748b]">{sourceTierHelp(sourceTier)}</p>
        </div>

        <div className="mt-3 flex justify-end">
          <button className="primary-btn" onClick={onUpload} disabled={uploadMut.isPending}>
            {uploadMut.isPending ? '업로드/인덱싱 중...' : '문서 업로드'}
          </button>
        </div>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            className="form-input md:col-span-3"
            placeholder="자연어 검색어를 입력하세요 (예: 투자한도, 이해상충)"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSearch()
            }}
          />
          <select
            className="form-input"
            value={searchCollection}
            onChange={(event) => setSearchCollection(event.target.value)}
          >
            <option value="">전체 컬렉션</option>
            {DOC_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button className="secondary-btn" onClick={onSearch}>
            검색
          </button>
        </div>
        <p className="mt-2 text-xs text-[#64748b]">
          조합이나 투자건을 선택한 상태에서 검색하면 해당 범위를 우선해서 보여줍니다.
        </p>
      </div>

      <div className="card-base">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#0f1f3d]">인덱싱 현황</h4>
          {isStatsLoading && <span className="text-xs text-[#64748b]">집계 중...</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {statRows.map((row) => (
            <span key={row.value} className="tag tag-blue">
              {row.label} {row.count}건
            </span>
          ))}
        </div>
      </div>

      <div className="card-base overflow-auto">
        <h4 className="mb-2 text-sm font-semibold text-[#0f1f3d]">등록 문서</h4>
        {isDocumentsLoading ? (
          <PageLoading />
        ) : documents.length === 0 ? (
          <EmptyState emoji="d" message="등록된 문서가 없습니다." className="py-8" />
        ) : (
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="table-head-row">
              <tr>
                <th className="table-head-cell">우선순위</th>
                <th className="table-head-cell">유형</th>
                <th className="table-head-cell">귀속 방식</th>
                <th className="table-head-cell">스코프</th>
                <th className="table-head-cell">제목</th>
                <th className="table-head-cell">귀속</th>
                <th className="table-head-cell">버전</th>
                <th className="table-head-cell">청크 수</th>
                <th className="table-head-cell">등록일</th>
                <th className="table-head-cell">작업</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((row) => {
                const scope = normalizeScope(row.scope)
                const ownership =
                  scope === 'investment'
                    ? `투자건 #${row.investment_id ?? '-'} / 회사 #${row.company_id ?? '-'}`
                    : scope === 'fund'
                    ? row.fund_name || '-'
                    : scope === 'fund_type'
                      ? row.fund_type_filter || '-'
                      : '-'
                return (
                  <tr key={row.id}>
                    <td className="table-body-cell">
                      {row.source_tier_label || SOURCE_TIER_OPTIONS.find((item) => item.value === row.source_tier)?.label || row.source_tier}
                    </td>
                    <td className="table-body-cell">{typeLabel(row.document_type)}</td>
                    <td className="table-body-cell">{row.attribution_mode || '-'}</td>
                    <td className="table-body-cell">{scopeBadge(scope)}</td>
                    <td className="table-body-cell">{row.title}</td>
                    <td className="table-body-cell">{row.ownership_label || ownership}</td>
                    <td className="table-body-cell">{row.version || '-'}</td>
                    <td className="table-body-cell">{row.chunk_count ?? '-'}</td>
                    <td className="table-body-cell">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="table-body-cell">
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        onClick={() => onDelete(row.id)}
                        disabled={deleteMut.isPending}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {submittedQuery && (
        <div className="card-base">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#0f1f3d]">
              검색 결과: <span className="text-[#1a3660]">{submittedQuery}</span>
            </h4>
            {isSearchLoading && <span className="text-xs text-[#64748b]">검색 중...</span>}
          </div>
          {!isSearchLoading && (searchResult?.results.length ?? 0) === 0 ? (
            <EmptyState emoji="s" message="검색 결과가 없습니다." className="py-8" />
          ) : (
            <div className="space-y-2">
              {(searchResult?.results ?? []).map((result) => {
                const metadata = result.metadata as Record<string, unknown>
                const scope = normalizeScope(metadata?.scope)
                const sourceTier = String(metadata?.source_tier || '')
                return (
                  <div key={result.id} className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="tag tag-indigo">
                        {SOURCE_TIER_OPTIONS.find((item) => item.value === sourceTier)?.label || sourceTier || '미분류'}
                      </span>
                      <span className="tag tag-purple">{typeLabel(result.collection)}</span>
                      {scopeBadge(scope)}
                      <span className="text-xs text-[#64748b]">유사도 {similarityLabel(result.distance)}</span>
                    </div>
                    <p className="max-h-20 overflow-hidden text-sm text-[#0f1f3d]">{result.text}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


