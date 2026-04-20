import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import OTPLogin from './pages/OTPLogin';
import SetPassword from './pages/SetPassword';
import AppLayout from './components/layout/AppLayout';
import CalendarHome from './pages/CalendarHome';
import UserList from './pages/admin/UserList';
import CreateUser from './pages/admin/CreateUser';
import EditUser from './pages/admin/EditUser';
import SecurityPanel from './pages/admin/SecurityPanel';
import AnalysisPage from './pages/admin/AnalysisPage';
import AnnouncementManager from './pages/admin/AnnouncementManager';
import PowersEditor from './pages/admin/PowersEditor';
import AttendancePage from './pages/Attendance';
import MessagesPage from './pages/Messages';
import TasksPage from './pages/TasksPage';
import WorkspacePage from './pages/WorkspacePage';
import MeetingsPage from './pages/Meetings';
import EmailPage from './pages/EmailPage';
import StickyNotesPage from './pages/StickyNotesPage';
import ActivityPage from './pages/ActivityPage';
import TeamFeedPage from './pages/TeamFeedPage';
import SalaryPage from './pages/SalaryPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';
import ProfilePage from './pages/ProfilePage';
import CorePanel from './pages/CorePanel';
import { SocketProvider } from './context/SocketContext';
import { AmbientBackground } from './design-system';
import ConnectionBanner from './components/ConnectionBanner';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import './design-system/index.css';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /><p>Loading Avadeti Team...</p></div>;
  if (!user) return <Navigate to="/login" />;
  if (user.isFirstLogin) return <Navigate to="/set-password" />;
  if (!user.onboardingComplete && window.location.pathname !== '/onboarding') return <Navigate to="/onboarding" />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
        <AmbientBackground />
        <ConnectionBanner />
        <CommandPalette />
        <ErrorBoundary scope="root">
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
            <Route path="email" element={<EmailPage />} />
            <Route path="sticky-notes" element={<StickyNotesPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="feed" element={<TeamFeedPage />} />
            <Route path="salary" element={<SalaryPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="sys" element={<CorePanel />} />

            {/* Admin */}
            <Route path="admin/users" element={<UserList />} />
            <Route path="admin/users/new" element={<CreateUser />} />
            <Route path="admin/users/:id" element={<EditUser />} />
            <Route path="admin/users/:id/powers" element={<PowersEditor />} />
            <Route path="admin/analysis" element={<AnalysisPage />} />
            <Route path="admin/security" element={<SecurityPanel />} />
            <Route path="admin/announcements" element={<AnnouncementManager />} />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </ErrorBoundary>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
