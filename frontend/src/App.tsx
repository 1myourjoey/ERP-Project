import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import RequireAuth from './components/RequireAuth'
import RouteGuard from './components/RouteGuard'
import Layout from './components/Layout'
import { AuthProvider } from './contexts/AuthContext'
import { PageSkeleton } from './components/ui/PageSkeleton'
import AccessDeniedPage from './pages/AccessDeniedPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

const AccountingPage = lazy(() => import('./pages/AccountingPage'))
const BizReportsPage = lazy(() => import('./pages/BizReportsPage'))
const CompliancePage = lazy(() => import('./pages/CompliancePage'))
const CashFlowPage = lazy(() => import('./pages/CashFlowPage'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))
const DataStudioPage = lazy(() => import('./pages/DataStudioPage'))
const ExitsPage = lazy(() => import('./pages/ExitsPage'))
const FeeManagementPage = lazy(() => import('./pages/FeeManagementPage'))
const FundDetailPage = lazy(() => import('./pages/FundDetailPage'))
const FundOperationsPage = lazy(() => import('./pages/FundOperationsPage'))
const FundOverviewPage = lazy(() => import('./pages/FundOverviewPage'))
const FundsPage = lazy(() => import('./pages/FundsPage'))
const InternalReviewPage = lazy(() => import('./pages/InternalReviewPage'))
const InvestmentDetailPage = lazy(() => import('./pages/InvestmentDetailPage'))
const InvestmentReviewPage = lazy(() => import('./pages/InvestmentReviewPage'))
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage'))
const LPManagementPage = lazy(() => import('./pages/LPManagementPage'))
const MyProfilePage = lazy(() => import('./pages/MyProfilePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const ProvisionalFSPage = lazy(() => import('./pages/ProvisionalFSPage'))
const ProposalDataPage = lazy(() => import('./pages/ProposalDataPage'))
const TaskBoardPage = lazy(() => import('./pages/TaskBoardPage'))
const TemplateManagementPage = lazy(() => import('./pages/TemplateManagementPage'))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const ValuationsPage = lazy(() => import('./pages/ValuationsPage'))
const VicsReportPage = lazy(() => import('./pages/VicsReportPage'))
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'))
const WorkLogsPage = lazy(() => import('./pages/WorkLogsPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))

function LazyElement({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton type="table" />}>{children}</Suspense>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/access-denied" element={<AccessDeniedPage />} />
            <Route path="/profile" element={<LazyElement><MyProfilePage /></LazyElement>} />

            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/tasks" element={<RouteGuard routeKey="/tasks"><LazyElement><TaskBoardPage /></LazyElement></RouteGuard>} />
            <Route path="/worklogs" element={<RouteGuard routeKey="/worklogs"><LazyElement><WorkLogsPage /></LazyElement></RouteGuard>} />
            <Route path="/calendar" element={<RouteGuard routeKey="/calendar"><LazyElement><CalendarPage /></LazyElement></RouteGuard>} />

            <Route path="/workflows" element={<RouteGuard routeKey="/workflows"><LazyElement><WorkflowsPage /></LazyElement></RouteGuard>} />
            <Route path="/fund-overview" element={<RouteGuard routeKey="/fund-overview"><LazyElement><FundOverviewPage /></LazyElement></RouteGuard>} />
            <Route path="/funds" element={<RouteGuard routeKey="/funds"><LazyElement><FundsPage /></LazyElement></RouteGuard>} />
            <Route path="/funds/:id" element={<RouteGuard routeKey="/funds"><LazyElement><FundDetailPage /></LazyElement></RouteGuard>} />
            <Route path="/investments" element={<RouteGuard routeKey="/investments"><LazyElement><InvestmentsPage /></LazyElement></RouteGuard>} />
            <Route path="/investments/:id" element={<RouteGuard routeKey="/investments"><LazyElement><InvestmentDetailPage /></LazyElement></RouteGuard>} />
            <Route path="/investment-reviews" element={<RouteGuard routeKey="/investment-reviews"><LazyElement><InvestmentReviewPage /></LazyElement></RouteGuard>} />
            <Route path="/exits" element={<RouteGuard routeKey="/exits"><LazyElement><ExitsPage /></LazyElement></RouteGuard>} />

            <Route path="/transactions" element={<RouteGuard routeKey="/transactions"><LazyElement><TransactionsPage /></LazyElement></RouteGuard>} />
            <Route path="/valuations" element={<RouteGuard routeKey="/valuations"><LazyElement><ValuationsPage /></LazyElement></RouteGuard>} />
            <Route path="/accounting" element={<RouteGuard routeKey="/accounting"><LazyElement><AccountingPage /></LazyElement></RouteGuard>} />
            <Route path="/provisional-fs" element={<RouteGuard routeKey="/provisional-fs"><LazyElement><ProvisionalFSPage /></LazyElement></RouteGuard>} />
            <Route path="/fee-management" element={<RouteGuard routeKey="/fee-management"><LazyElement><FeeManagementPage /></LazyElement></RouteGuard>} />
            <Route path="/cashflow" element={<RouteGuard routeKey="/cashflow"><LazyElement><CashFlowPage /></LazyElement></RouteGuard>} />

            <Route path="/lp-management" element={<RouteGuard routeKey="/lp-management"><LazyElement><LPManagementPage /></LazyElement></RouteGuard>} />
            <Route path="/lp-address-book" element={<Navigate to="/lp-management" replace />} />
            <Route path="/proposal-data" element={<RouteGuard routeKey="/proposal-data"><LazyElement><ProposalDataPage /></LazyElement></RouteGuard>} />
            <Route path="/users" element={<RouteGuard routeKey="/users"><LazyElement><UsersPage /></LazyElement></RouteGuard>} />
            <Route path="/compliance" element={<RouteGuard routeKey="/compliance"><LazyElement><CompliancePage /></LazyElement></RouteGuard>} />
            <Route path="/biz-reports" element={<RouteGuard routeKey="/biz-reports"><LazyElement><BizReportsPage /></LazyElement></RouteGuard>} />
            <Route path="/vics" element={<RouteGuard routeKey="/vics"><LazyElement><VicsReportPage /></LazyElement></RouteGuard>} />
            <Route path="/internal-reviews" element={<RouteGuard routeKey="/internal-reviews"><LazyElement><InternalReviewPage /></LazyElement></RouteGuard>} />
            <Route path="/internal-reviews/:id" element={<RouteGuard routeKey="/internal-reviews"><LazyElement><InternalReviewPage /></LazyElement></RouteGuard>} />
            <Route path="/reports" element={<RouteGuard routeKey="/reports"><LazyElement><ReportsPage /></LazyElement></RouteGuard>} />
            <Route path="/fund-operations" element={<RouteGuard routeKey="/fund-operations"><LazyElement><FundOperationsPage /></LazyElement></RouteGuard>} />
            <Route path="/documents" element={<RouteGuard routeKey="/documents"><LazyElement><DocumentsPage /></LazyElement></RouteGuard>} />
            <Route path="/documents/generate" element={<RouteGuard routeKey="/documents"><LazyElement><DocumentsPage /></LazyElement></RouteGuard>} />
            <Route path="/data-studio" element={<RouteGuard routeKey="/data-studio"><LazyElement><DataStudioPage /></LazyElement></RouteGuard>} />
            <Route path="/templates" element={<RouteGuard routeKey="/templates"><LazyElement><TemplateManagementPage /></LazyElement></RouteGuard>} />
            <Route path="/checklists" element={<Navigate to="/workflows?tab=checklists" replace />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}

