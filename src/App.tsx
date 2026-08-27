import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { usePermissions } from './hooks/usePermissions';
import DashboardLayout from './components/DashboardLayout';
import PageLoader from './components/PageLoader';
import { Toaster } from './components/ui/Toaster';
import RealtimeNotifications from './components/RealtimeNotifications';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Screening = lazy(() => import('./pages/Screening'));
const RecruitmentFunnel = lazy(() => import('./pages/RecruitmentFunnel'));
const Logs = lazy(() => import('./pages/Logs'));
const Templates = lazy(() => import('./pages/Templates'));
const EvaluationTemplates = lazy(() => import('./pages/EvaluationTemplates'));
const Settings = lazy(() => import('./pages/Settings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const RegistrationTokens = lazy(() => import('./pages/RegistrationTokens'));
const PsikotesSchedules = lazy(() => import('./pages/PsikotesSchedules'));
const InterviewSchedules = lazy(() => import('./pages/InterviewSchedules'));
const CandidateArchive = lazy(() => import('./pages/CandidateArchive'));
const CandidateTracking = lazy(() => import('./pages/CandidateTracking'));
const CandidateProfile = lazy(() => import('./pages/CandidateProfile'));
const UploadCV = lazy(() => import('./pages/UploadCV'));
const OpenRecruitment = lazy(() => import('./pages/OpenRecruitment'));
const PublicCareer = lazy(() => import('./pages/PublicCareer'));
const ApplicationForm = lazy(() => import('./pages/ApplicationForm'));
const ExternalData = lazy(() => import('./pages/ExternalData'));

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
  const { session, loading } = useAuth();
  const { isRestrictedScreeningRole } = usePermissions();

  useEffect(() => {
    // Fetch site settings for favicon
    const fetchSettings = async () => {
      try {
        const { data } = await supabase.from('site_settings').select('favicon_url').eq('id', 1).single();
        if (data?.favicon_url) {
          const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (link) {
            link.href = data.favicon_url;
          } else {
            const newLink = document.createElement('link');
            newLink.rel = 'icon';
            newLink.href = data.favicon_url;
            document.head.appendChild(newLink);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch favicon settings:', err);
      }
    };
    fetchSettings();
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen font-sans text-[#5A305A] bg-transparent">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/career" element={<PublicCareer />} />
            <Route path="/form-pelamar" element={<ApplicationForm />} />

            {/* Protected Routes */}
            <Route path="/*" element={
              !session ? (
                <Login />
              ) : (
                <DashboardLayout user={session.user}>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      {isRestrictedScreeningRole ? (
                        <>
                          <Route path="/" element={<Navigate to="/screening" replace />} />
                          <Route path="/screening" element={<Screening />} />
                          <Route path="/candidates/:id" element={<CandidateProfile />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="*" element={<Navigate to="/screening" replace />} />
                        </>
                      ) : (
                        <>
                          <Route path="/" element={<Navigate to="/dashboard" replace />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/open-recruitment" element={<OpenRecruitment />} />
                          <Route path="/screening" element={<Screening />} />
                          <Route path="/candidates/:id" element={<CandidateProfile />} />
                          <Route path="/funnel" element={<RecruitmentFunnel />} />
                          <Route path="/psikotes" element={<PsikotesSchedules />} />
                          <Route path="/interview" element={<InterviewSchedules />} />
                          <Route path="/tracking" element={<CandidateTracking />} />
                          <Route path="/logs" element={<Logs />} />
                          <Route path="/archive" element={<CandidateArchive />} />
                          <Route path="/upload-cv" element={<UploadCV />} />
                          <Route path="/templates" element={<Templates />} />
                          <Route path="/evaluation-templates" element={<EvaluationTemplates />} />
                          <Route path="/tokens" element={<RegistrationTokens />} />
                          <Route path="/users" element={<UserManagement />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/external-data" element={<ExternalData />} />
                          <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </>
                      )}
                    </Routes>
                  </Suspense>
                </DashboardLayout>
              )
            } />
          </Routes>
        </Suspense>
        {session && <RealtimeNotifications />}
        <Toaster />
      </div>
    </BrowserRouter>
  );
}
