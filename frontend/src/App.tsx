import { Link, Route, Routes } from "react-router-dom";
import { TaskBoardPage } from "./pages/TaskBoardPage";

function DashboardPlaceholder() {
  return (
    <section className="panel">
      <h2>대시보드</h2>
      <p>다음 커밋에서 연결합니다.</p>
    </section>
  );
}

function WorkflowsPlaceholder() {
  return (
    <section className="panel">
      <h2>워크플로우</h2>
      <p>다음 커밋에서 연결합니다.</p>
    </section>
  );
}

function WorkLogsPlaceholder() {
  return (
    <section className="panel">
      <h2>Work-Log</h2>
      <p>다음 커밋에서 연결합니다.</p>
    </section>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>VC ERP</h1>
        <nav>
          <Link to="/">대시보드</Link>
          <Link to="/board">작업보드</Link>
          <Link to="/workflows">워크플로우</Link>
          <Link to="/worklogs">Work-Log</Link>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPlaceholder />} />
          <Route path="/board" element={<TaskBoardPage />} />
          <Route path="/workflows" element={<WorkflowsPlaceholder />} />
          <Route path="/worklogs" element={<WorkLogsPlaceholder />} />
        </Routes>
      </main>
    </div>
  );
}

