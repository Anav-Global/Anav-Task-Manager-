import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardLayout } from './components/DashboardLayout';
import { ClientsPage } from './pages/ClientsPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { GroupsPage } from './pages/GroupsPage';
import { UsersPage } from './pages/UsersPage';
import { TasksPage } from './pages/TasksPage';
import { ReportsPage } from './pages/ReportsPage';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public login route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected dashboard shell */}
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard/clients" replace />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:clientId" element={<ClientDetailPage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="users" element={<UsersPage />} />
            </Route>

            {/* Root fallback */}
            <Route path="/" element={<Navigate to="/dashboard/clients" replace />} />
            <Route path="*" element={<Navigate to="/dashboard/clients" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
