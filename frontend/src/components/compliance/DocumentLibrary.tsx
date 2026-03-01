import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../EmptyState'
import PageLoading from '../PageLoading'
import { useToast } from '../../contexts/ToastContext'
import {
  fetchLegalDocuments,
  fetchLegalDocumentStats,
  searchLegalDocuments,
  uploadLegalDocument,
  type LegalDocument,
  type LegalDocumentSearchResponse,
  type LegalDocumentType,
} from '../../lib/api'

const DOC_TYPES: Array<{ value: LegalDocumentType; label: string }> = [
  { value: 'laws', label: '법률' },
  { value: 'regulations', label: '시행령/시행규칙' },
  { value: 'guidelines', label: '가이드라인' },
  { value: 'agreements', label: '규약/계약' },
  { value: 'internal', label: '내부지침' },
]

function typeLabel(type: string): string {
  return DOC_TYPES.find((item) => item.value === type)?.label ?? type
}

function similarityLabel(distance: number | null | undefined): string {
  if (distance == null || Number.isNaN(distance)) return '-'
  const similarity = Math.max(0, Math.min(1, 1 - distance))
  return similarity.toFixed(2)
}

export default function DocumentLibrary() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] = useState<LegalDocumentType>('laws')
  const [version, setVersion] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [searchText, setSearchText] = useState('')
  const [searchCollection, setSearchCollection] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

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
      n_results: 6,
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
      addToast('success', `${result.document.title} 업로드 및 인덱싱 완료 (${result.chunk_count} 청크)`)
    },
  })

  const statRows = DOC_TYPES.map((item) => ({
    ...item,
    count: stats?.collections?.[item.value]?.count ?? 0,
  }))

  const totalChunks = stats?.total_chunks ?? 0

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
    uploadMut.mutate({
      file: selectedFile,
      title: normalizedTitle,
      document_type: documentType,
      version: version.trim() || null,
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

  return (
    <div className="space-y-4">
      <div className="card-base">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">법률 문서 라이브러리</h3>
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
            onChange={(event) => setDocumentType(event.target.value as LegalDocumentType)}
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
          <h4 className="text-sm font-semibold text-gray-800">인덱싱 현황</h4>
          {isStatsLoading && <span className="text-xs text-gray-500">집계 중...</span>}
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
        <h4 className="mb-2 text-sm font-semibold text-gray-800">등록 문서</h4>
        {isDocumentsLoading ? (
          <PageLoading />
        ) : documents.length === 0 ? (
          <EmptyState emoji="d" message="등록된 문서가 없습니다." className="py-8" />
        ) : (
          <table className="min-w-[900px] w-full text-sm">
            <thead className="table-head-row">
              <tr>
                <th className="table-head-cell">유형</th>
                <th className="table-head-cell">제목</th>
                <th className="table-head-cell">버전</th>
                <th className="table-head-cell">청크 수</th>
                <th className="table-head-cell">등록일</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((row) => (
                <tr key={row.id}>
                  <td className="table-body-cell">{typeLabel(row.document_type)}</td>
                  <td className="table-body-cell">{row.title}</td>
                  <td className="table-body-cell">{row.version || '-'}</td>
                  <td className="table-body-cell">{row.chunk_count ?? '-'}</td>
                  <td className="table-body-cell">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {submittedQuery && (
        <div className="card-base">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-800">
              검색 결과: <span className="text-blue-700">{submittedQuery}</span>
            </h4>
            {isSearchLoading && <span className="text-xs text-gray-500">검색 중...</span>}
          </div>
          {!isSearchLoading && (searchResult?.results.length ?? 0) === 0 ? (
            <EmptyState emoji="s" message="검색 결과가 없습니다." className="py-8" />
          ) : (
            <div className="space-y-2">
              {(searchResult?.results ?? []).map((result) => (
                <div key={result.id} className="rounded-xl border border-gray-200 bg-white/70 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="tag tag-purple">{typeLabel(result.collection)}</span>
                    <span className="text-xs text-gray-500">유사도 {similarityLabel(result.distance)}</span>
                  </div>
                  <p className="max-h-20 overflow-hidden text-sm text-gray-700">{result.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
