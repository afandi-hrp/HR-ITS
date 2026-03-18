import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { AuthSession } from '@supabase/supabase-js';
import Login from './pages/Login';
import DashboardLayout from './components/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Screening from './pages/Screening';
import RecruitmentFunnel from './pages/RecruitmentFunnel';
import Logs from './pages/Logs';
import Templates from './pages/Templates';
import Settings from './pages/Settings';
import PsikotesSchedules from './pages/PsikotesSchedules';
import InterviewSchedules from './pages/InterviewSchedules';
import CandidateArchive from './pages/CandidateArchive';
import CandidateProfile from './pages/CandidateProfile';
import UploadCV from './pages/UploadCV';
import OpenRecruitment from './pages/OpenRecruitment';
import PublicCareer from './pages/PublicCareer';
import { Toaster } from './components/ui/Toaster';
import RealtimeNotifications from './components/RealtimeNotifications';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen font-sans text-slate-900 bg-transparent">
        <Routes>
          {/* Public Routes */}
          <Route path="/career" element={<PublicCareer />} />

          {/* Protected Routes */}
          <Route path="/*" element={
            !session ? (
              <Login />
            ) : (
              <DashboardLayout user={session.user}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/open-recruitment" element={<OpenRecruitment />} />
                  <Route path="/screening" element={<Screening />} />
                  <Route path="/candidates/:id" element={<CandidateProfile />} />
                  <Route path="/funnel" element={<RecruitmentFunnel />} />
                  <Route path="/psikotes" element={<PsikotesSchedules />} />
                  <Route path="/interview" element={<InterviewSchedules />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/archive" element={<CandidateArchive />} />
                  <Route path="/upload-cv" element={<UploadCV />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </DashboardLayout>
            )
          } />
        </Routes>
        {session && <RealtimeNotifications />}
        <Toaster />
      </div>
    </BrowserRouter>
  );
}
