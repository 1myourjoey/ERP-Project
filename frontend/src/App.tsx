import { Navigate, Route, Routes } from 'react-router-dom'

import RequireAuth from './components/RequireAuth'
import RouteGuard from './components/RouteGuard'
import Layout from './components/Layout'
import { AuthProvider } from './contexts/AuthContext'
import AccessDeniedPage from './pages/AccessDeniedPage'
import AccountingPage from './pages/AccountingPage'
import BizReportsPage from './pages/BizReportsPage'
import CompliancePage from './pages/CompliancePage'
import DashboardPage from './pages/DashboardPage'
import DocumentsPage from './pages/DocumentsPage'
import ExitsPage from './pages/ExitsPage'
import FeeManagementPage from './pages/FeeManagementPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import FundDetailPage from './pages/FundDetailPage'
import FundOperationsPage from './pages/FundOperationsPage'
import FundOverviewPage from './pages/FundOverviewPage'
import FundsPage from './pages/FundsPage'
import InternalReviewPage from './pages/InternalReviewPage'
import InvestmentDetailPage from './pages/InvestmentDetailPage'
import InvestmentReviewPage from './pages/InvestmentReviewPage'
import InvestmentsPage from './pages/InvestmentsPage'
import LoginPage from './pages/LoginPage'
import LPManagementPage from './pages/LPManagementPage'
import MyProfilePage from './pages/MyProfilePage'
import RegisterPage from './pages/RegisterPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ReportsPage from './pages/ReportsPage'
import TaskBoardPage from './pages/TaskBoardPage'
import TemplateManagementPage from './pages/TemplateManagementPage'
import TransactionsPage from './pages/TransactionsPage'
import UsersPage from './pages/UsersPage'
import ValuationsPage from './pages/ValuationsPage'
import VicsReportPage from './pages/VicsReportPage'
import WorkflowsPage from './pages/WorkflowsPage'
import WorkLogsPage from './pages/WorkLogsPage'

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
            <Route path="/profile" element={<MyProfilePage />} />

            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/tasks" element={<RouteGuard routeKey="/tasks"><TaskBoardPage /></RouteGuard>} />
            <Route path="/worklogs" element={<RouteGuard routeKey="/worklogs"><WorkLogsPage /></RouteGuard>} />

            <Route path="/workflows" element={<RouteGuard routeKey="/workflows"><WorkflowsPage /></RouteGuard>} />
            <Route path="/fund-overview" element={<RouteGuard routeKey="/fund-overview"><FundOverviewPage /></RouteGuard>} />
            <Route path="/funds" element={<RouteGuard routeKey="/funds"><FundsPage /></RouteGuard>} />
            <Route path="/funds/:id" element={<RouteGuard routeKey="/funds"><FundDetailPage /></RouteGuard>} />
            <Route path="/investments" element={<RouteGuard routeKey="/investments"><InvestmentsPage /></RouteGuard>} />
            <Route path="/investments/:id" element={<RouteGuard routeKey="/investments"><InvestmentDetailPage /></RouteGuard>} />
            <Route path="/investment-reviews" element={<RouteGuard routeKey="/investment-reviews"><InvestmentReviewPage /></RouteGuard>} />
            <Route path="/exits" element={<RouteGuard routeKey="/exits"><ExitsPage /></RouteGuard>} />

            <Route path="/transactions" element={<RouteGuard routeKey="/transactions"><TransactionsPage /></RouteGuard>} />
            <Route path="/valuations" element={<RouteGuard routeKey="/valuations"><ValuationsPage /></RouteGuard>} />
            <Route path="/accounting" element={<RouteGuard routeKey="/accounting"><AccountingPage /></RouteGuard>} />
            <Route path="/fee-management" element={<RouteGuard routeKey="/fee-management"><FeeManagementPage /></RouteGuard>} />

            <Route path="/lp-management" element={<RouteGuard routeKey="/lp-management"><LPManagementPage /></RouteGuard>} />
            <Route path="/lp-address-book" element={<Navigate to="/lp-management" replace />} />
            <Route path="/users" element={<RouteGuard routeKey="/users"><UsersPage /></RouteGuard>} />
            <Route path="/compliance" element={<RouteGuard routeKey="/compliance"><CompliancePage /></RouteGuard>} />
            <Route path="/biz-reports" element={<RouteGuard routeKey="/biz-reports"><BizReportsPage /></RouteGuard>} />
            <Route path="/vics" element={<RouteGuard routeKey="/vics"><VicsReportPage /></RouteGuard>} />
            <Route path="/internal-reviews" element={<RouteGuard routeKey="/internal-reviews"><InternalReviewPage /></RouteGuard>} />
            <Route path="/internal-reviews/:id" element={<RouteGuard routeKey="/internal-reviews"><InternalReviewPage /></RouteGuard>} />
            <Route path="/reports" element={<RouteGuard routeKey="/reports"><ReportsPage /></RouteGuard>} />
            <Route path="/fund-operations" element={<RouteGuard routeKey="/fund-operations"><FundOperationsPage /></RouteGuard>} />
            <Route path="/documents" element={<RouteGuard routeKey="/documents"><DocumentsPage /></RouteGuard>} />
            <Route path="/documents/generate" element={<RouteGuard routeKey="/documents"><DocumentsPage /></RouteGuard>} />
            <Route path="/templates" element={<RouteGuard routeKey="/templates"><TemplateManagementPage /></RouteGuard>} />
            <Route path="/checklists" element={<Navigate to="/workflows?tab=checklists" replace />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
