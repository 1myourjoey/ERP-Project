import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import { useToast } from '../../contexts/ToastContext'
import {
  deleteLegalDocument,
  fetchFunds,
  fetchLegalDocuments,
  fetchLegalDocumentStats,
  searchLegalDocuments,
  uploadLegalDocument,
  type Fund,
  type LegalDocument,
  type LegalDocumentScope,
  type LegalDocumentSearchResponse,
  type LegalDocumentType,
} from '../../lib/api'

type DocumentLibraryProps = {
  funds?: Fund[]
}

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
}

function typeLabel(type: string): string {
  return DOC_TYPES.find((item) => item.value === type)?.label ?? type
}

function similarityLabel(distance: number | null | undefined): string {
  if (distance == null || Number.isNaN(distance)) return '-'
  const similarity = Math.max(0, Math.min(1, 1 - distance))
  return similarity.toFixed(2)
}

function normalizeScope(raw: unknown): LegalDocumentScope {
  if (raw === 'fund_type') return 'fund_type'
  if (raw === 'fund') return 'fund'
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
  const [documentType, setDocumentType] = useState<LegalDocumentType>('laws')
  const [version, setVersion] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null)
  const [fundTypeFilter, setFundTypeFilter] = useState('')

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
    queryFn: fetchLegalDocuments,
  })

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['legal-document-stats'],
    queryFn: fetchLegalDocumentStats,
  })

  const searchParams = useMemo(
    () => ({
      query: submittedQuery,
      collection: searchCollection || undefined,
      n_results: 10,
    }),
    [submittedQuery, searchCollection],
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
      addToast('success', `${result.document.title} 업로드 및 인덱싱 완료 (${result.chunk_count} 청크)`)
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
  const isGuidelines = documentType === 'guidelines'
  const isFundScoped = documentType === 'agreements' || documentType === 'internal'

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
    if (isGuidelines && !fundTypeFilter.trim()) {
      addToast('warning', '가이드라인 문서는 조합 유형을 선택해야 합니다.')
      return
    }
    if (isFundScoped && selectedFundId === null) {
      addToast('warning', '규약/내부지침 문서는 귀속 조합을 선택해야 합니다.')
      return
    }
    uploadMut.mutate({
      file: selectedFile,
      title: normalizedTitle,
      document_type: documentType,
      version: version.trim() || null,
      fund_id: isFundScoped ? selectedFundId : null,
      fund_type_filter: isGuidelines ? fundTypeFilter.trim() : null,
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

  return (
    <div className="space-y-4">
      <div className="card-base">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0f1f3d]">법률 문서 라이브러리</h3>
          <span className="tag tag-indigo">총 {totalChunks} 청크</span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            className="form-input md:col-span-2"
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
            {DOC_TYPES.map((item) => (
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

        {isGuidelines && (
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
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
          </div>
        )}

        {isFundScoped && (
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="md:col-span-1">
              <span className="mb-1 block text-xs font-medium text-[#64748b]">귀속 조합</span>
              <select
                className="form-input"
                value={selectedFundId ?? ''}
                onChange={(event) => setSelectedFundId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">선택</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

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
                <th className="table-head-cell">유형</th>
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
                  scope === 'fund'
                    ? row.fund_name || '-'
                    : scope === 'fund_type'
                      ? row.fund_type_filter || '-'
                      : '-'
                return (
                  <tr key={row.id}>
                    <td className="table-body-cell">{typeLabel(row.document_type)}</td>
                    <td className="table-body-cell">{scopeBadge(scope)}</td>
                    <td className="table-body-cell">{row.title}</td>
                    <td className="table-body-cell">{ownership}</td>
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
                return (
                  <div key={result.id} className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
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


