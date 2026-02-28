import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from '../contexts/AuthContext'
import PageLoading from './PageLoading'

interface RouteGuardProps {
  routeKey: string
  children: ReactNode
}

export default function RouteGuard({ routeKey, children }: RouteGuardProps) {
  const { hasAccess, isLoading } = useAuth()

  if (isLoading) return <PageLoading />
  if (!hasAccess(routeKey)) return <Navigate to="/access-denied" replace />
  return <>{children}</>
}
