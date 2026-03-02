import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  confirmExcelImport,
  previewExcelImport,
  type ImportConfirmResponse,
  type ImportDomain,
  type ImportPreviewResponse,
} from '../lib/api/excel'

type WizardStep = 1 | 2 | 3

interface ExcelImportWizardProps {
  open: boolean
  onClose: () => void
  onCompleted?: (result: ImportConfirmResponse) => void
}

const IMPORT_TYPES: Array<{ value: ImportDomain; label: string }> = [
  { value: 'investments', label: '투자' },
  { value: 'lps', label: 'LP' },
  { value: 'transactions', label: '거래' },
  { value: 'valuations', label: '밸류에이션' },
]

export default function ExcelImportWizard({ open, onClose, onCompleted }: ExcelImportWizardProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [file, setFile] = useState<File | null>(null)
  const [importType, setImportType] = useState<ImportDomain>('investments')
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [result, setResult] = useState<ImportConfirmResponse | null>(null)

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('파일을 선택해주세요.')
      return previewExcelImport(file, importType)
    },
    onSuccess: (data) => {
      setPreview(data)
      setStep(2)
    },
  })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('파일을 선택해주세요.')
      return confirmExcelImport(file, importType)
    },
    onSuccess: (data) => {
      setResult(data)
      setStep(3)
      onCompleted?.(data)
    },
  })

  const canPreview = useMemo(() => !!file && !previewMutation.isPending, [file, previewMutation.isPending])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="modal-overlay fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="modal-content w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">엑셀 가져오기</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
              X
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2 text-xs">
            {[1, 2, 3].map((value) => (
              <div
                key={value}
                className={`rounded-full px-2 py-1 ${step === value ? 'bg-[var(--theme-hover)] font-semibold' : 'bg-[var(--theme-bg-elevated)]'}`}
              >
                Step {value}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--theme-text-secondary)]">가져오기 유형</span>
                <select className="form-input" value={importType} onChange={(event) => setImportType(event.target.value as ImportDomain)}>
                  {IMPORT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block rounded border border-dashed border-[var(--theme-border)] p-4 text-center">
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xlsm,.xltx"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <span className="text-sm text-[var(--theme-text-secondary)]">
                  {file ? file.name : '엑셀 파일을 선택하세요'}
                </span>
              </label>
              {previewMutation.error && (
                <p className="text-sm text-[var(--color-danger)]">{(previewMutation.error as Error).message}</p>
              )}
            </div>
          )}

          {step === 2 && preview && (
            <div className="space-y-3">
              <div className="rounded border border-[var(--theme-border)] bg-[var(--theme-bg-elevated)] p-3 text-sm">
                총 {preview.total_rows}행 | 유효 {preview.valid_rows}행 | 오류 {preview.error_rows.length}행
              </div>

              {preview.error_rows.length > 0 && (
                <div className="rounded border border-[var(--color-warning)] bg-[var(--color-warning)]/10 p-3">
                  <p className="mb-1 text-xs font-semibold">오류 행</p>
                  <ul className="space-y-1 text-xs">
                    {preview.error_rows.slice(0, 5).map((row) => (
                      <li key={row.row}>행 {row.row}: {row.errors.join(', ')}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto rounded border border-[var(--theme-border)]">
                <table className="min-w-full">
                  <thead>
                    <tr className="table-head-row">
                      {preview.headers.map((header) => (
                        <th key={header} className="table-head-cell">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, index) => (
                      <tr key={index}>
                        {preview.headers.map((header) => (
                          <td key={`${index}-${header}`} className="table-body-cell">
                            {String(row[header] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-2 text-sm">
              <div className="rounded border border-[var(--theme-border)] bg-[var(--theme-bg-elevated)] p-3">
                가져오기를 완료했습니다.
              </div>
              <p>성공: {result.imported_count}건</p>
              <p>스킵: {result.skipped_count}건</p>
              {result.errors.length > 0 && (
                <div className="rounded border border-[var(--color-warning)] bg-[var(--color-warning)]/10 p-3 text-xs">
                  {result.errors.slice(0, 10).map((error, index) => (
                    <p key={index}>{error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                if (step === 1) {
                  onClose()
                  return
                }
                if (step === 2) {
                  setStep(1)
                  return
                }
                onClose()
              }}
            >
              {step === 1 ? '닫기' : '이전'}
            </button>

            {step === 1 && (
              <button type="button" className="primary-btn" onClick={() => previewMutation.mutate()} disabled={!canPreview}>
                {previewMutation.isPending ? '검증 중...' : '미리보기'}
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                className="primary-btn"
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending ? '가져오는 중...' : '가져오기 실행'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

