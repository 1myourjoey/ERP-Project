import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'
import PageLoading from './PageLoading'

export default function RequireAuth() {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <PageLoading />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
