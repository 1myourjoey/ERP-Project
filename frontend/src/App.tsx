import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import TaskBoardPage from './pages/TaskBoardPage'
import WorkflowsPage from './pages/WorkflowsPage'
import WorkLogsPage from './pages/WorkLogsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TaskBoardPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/worklogs" element={<WorkLogsPage />} />
      </Route>
    </Routes>
  )
}
