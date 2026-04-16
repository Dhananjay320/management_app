import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import OTPLogin from './pages/OTPLogin';
import SetPassword from './pages/SetPassword';
import AppLayout from './components/layout/AppLayout';
import CalendarHome from './pages/CalendarHome';
import UserList from './pages/admin/UserList';
import CreateUser from './pages/admin/CreateUser';
import AttendancePage from './pages/Attendance';
import MessagesPage from './pages/Messages';
import TasksPage from './pages/Tasks';
import WorkspacePage from './pages/WorkspacePage';
import MeetingsPage from './pages/Meetings';
import { SocketProvider } from './context/SocketContext';
import Placeholder from './pages/Placeholder';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /><p>Loading Avadeti Team...</p></div>;
  if (!user) return <Navigate to="/login" />;
  if (user.isFirstLogin) return <Navigate to="/set-password" />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
        <Routes>
          {/* Auth (no layout) */}
          <Route path="/login" element={<Login />} />
          <Route path="/otp-login" element={<OTPLogin />} />
          <Route path="/forgot-password" element={<OTPLogin />} />
          <Route path="/set-password" element={<SetPassword />} />

          {/* App (with layout) */}
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<CalendarHome />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="workspace" element={<WorkspacePage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="email" element={<Placeholder />} />
            <Route path="sticky-notes" element={<Placeholder />} />
            <Route path="activity" element={<Placeholder />} />
            <Route path="feed" element={<Placeholder />} />
            <Route path="salary" element={<Placeholder />} />
            <Route path="notifications" element={<Placeholder />} />
            <Route path="settings" element={<Placeholder />} />
            <Route path="profile" element={<Placeholder />} />
            <Route path="onboarding" element={<Placeholder />} />

            {/* Admin */}
            <Route path="admin/users" element={<UserList />} />
            <Route path="admin/users/new" element={<CreateUser />} />
            <Route path="admin/users/:id" element={<Placeholder />} />
            <Route path="admin/analysis" element={<Placeholder />} />
            <Route path="admin/security" element={<Placeholder />} />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
