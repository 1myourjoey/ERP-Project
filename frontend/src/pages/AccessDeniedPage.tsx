import { Link } from 'react-router-dom'

export default function AccessDeniedPage() {
  return (
    <div className="page-container flex min-h-[70vh] items-center justify-center">
      <div className="card-base max-w-md text-center">
        <h2 className="text-xl font-semibold text-slate-800">접근 권한이 없습니다</h2>
        <p className="mt-3 text-sm text-slate-600">
          이 페이지에 접근할 권한이 없습니다. 필요하면 관리자에게 문의해 주세요.
        </p>
        <div className="mt-5">
          <Link to="/dashboard" className="primary-btn">
            대시보드로 이동
          </Link>
        </div>
      </div>
    </div>
  )
}

