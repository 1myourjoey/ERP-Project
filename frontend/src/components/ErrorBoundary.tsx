import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="page-container">
            <div className="card-base py-16 text-center">
              <p className="text-lg font-semibold" style={{ color: 'var(--color-danger)' }}>
                페이지 로딩 중 오류가 발생했습니다
              </p>
              <p className="mt-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                {this.state.error?.message}
              </p>
              <button
                className="primary-btn mt-4"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
              >
                새로고침
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
