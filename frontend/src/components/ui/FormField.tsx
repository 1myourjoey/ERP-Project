import { type ReactNode } from 'react'
import { type FieldError } from 'react-hook-form'

interface FormFieldProps {
  label: string
  error?: FieldError
  required?: boolean
  children: ReactNode
  className?: string
}

export function FormField({ label, error, required, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="form-label">
        {label}
        {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>
          {error.message}
        </p>
      )}
    </div>
  )
}

export default FormField
