import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import TaskBoardPage from './pages/TaskBoardPage'
import WorkflowsPage from './pages/WorkflowsPage'
import WorkLogsPage from './pages/WorkLogsPage'
import FundsPage from './pages/FundsPage'
import FundDetailPage from './pages/FundDetailPage'
import InvestmentsPage from './pages/InvestmentsPage'
import InvestmentDetailPage from './pages/InvestmentDetailPage'
import ChecklistsPage from './pages/ChecklistsPage'
import DocumentsPage from './pages/DocumentsPage'
import CalendarPage from './pages/CalendarPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TaskBoardPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/worklogs" element={<WorkLogsPage />} />
        <Route path="/funds" element={<FundsPage />} />
        <Route path="/funds/:id" element={<FundDetailPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/investments/:id" element={<InvestmentDetailPage />} />
        <Route path="/checklists" element={<ChecklistsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Route>
    </Routes>
  )
}
