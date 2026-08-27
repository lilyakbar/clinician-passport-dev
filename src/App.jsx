import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import ProtectedRoute from '@/components/ProtectedRoute';
import { ProfessionProvider } from '@/professions/ProfessionContext';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import Credentials from '@/pages/Credentials';
import ContinuingEducation from '@/pages/ContinuingEducation';
import Reminders from '@/pages/Reminders';
import Goals from '@/pages/Goals';
import Opportunities from '@/pages/Opportunities';
import Applications from '@/pages/Applications';
import AskMyCareer from '@/pages/AskMyCareer';
import ImportCV from '@/pages/ImportCV';
import ResumeBuilder from '@/pages/ResumeBuilder';
import ComplianceIntelligence from '@/pages/ComplianceIntelligence';
import ProfileSettings from '@/pages/ProfileSettings';
import RecordsPage from '@/pages/RecordsPage';
import Passport from '@/pages/Passport';
import CredentialsCE from '@/pages/CredentialsCE';
import GoalsApplications from '@/pages/GoalsApplications';
import CVResume from '@/pages/CVResume';
import {
  careerHistoryConfig, educationConfig, researchConfig, publicationsConfig,
  presentationsConfig, volunteeringConfig, leadershipConfig, membershipConfig,
  documentConfig, conferenceConfig,
} from '@/coreConfigs';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<ProfessionProvider><Layout /></ProfessionProvider>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/continuing-education" element={<ContinuingEducation />} />
          <Route path="/compliance" element={<ComplianceIntelligence />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/career-history" element={<RecordsPage config={careerHistoryConfig} />} />
          <Route path="/education" element={<RecordsPage config={educationConfig} />} />
          <Route path="/research" element={<RecordsPage config={researchConfig} />} />
          <Route path="/publications" element={<RecordsPage config={publicationsConfig} />} />
          <Route path="/presentations" element={<RecordsPage config={presentationsConfig} />} />
          <Route path="/conferences" element={<RecordsPage config={conferenceConfig} />} />
          <Route path="/volunteering" element={<RecordsPage config={volunteeringConfig} />} />
          <Route path="/leadership" element={<RecordsPage config={leadershipConfig} />} />
          <Route path="/memberships" element={<RecordsPage config={membershipConfig} />} />
          <Route path="/documents" element={<RecordsPage config={documentConfig} />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/ask-my-career" element={<AskMyCareer />} />
          <Route path="/import-cv" element={<ImportCV />} />
          <Route path="/resume-builder" element={<ResumeBuilder />} />
          <Route path="/settings" element={<ProfileSettings />} />
          <Route path="/passport" element={<Passport />} />
          <Route path="/credentials-ce" element={<CredentialsCE />} />
          <Route path="/career" element={<GoalsApplications />} />
          <Route path="/cv-resume" element={<CVResume />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App