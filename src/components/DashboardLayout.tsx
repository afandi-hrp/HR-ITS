import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  ChevronLeft,
  ChevronRight,
  Archive,
  Upload,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Briefcase
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User;
}

export default function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract current path from location (e.g., "/dashboard" -> "dashboard")
  const currentPath = location.pathname.substring(1) || 'dashboard';

  // Auto-logout after 10 minutes of inactivity
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 10 * 60 * 1000); // 10 minutes
    };

    // Initialize timer
    resetTimer();

    // Add event listeners for user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [navigate]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'open-recruitment', label: 'Open Recruitment', icon: Briefcase },
    { id: 'screening', label: 'Screening Awal', icon: Users },
    { id: 'funnel', label: 'Recruitment Funnel', icon: BarChart3 },
    { id: 'psikotes', label: 'Jadwal Psikotes', icon: FileText },
    { id: 'interview', label: 'Jadwal Interview', icon: CalendarDays },
    { id: 'logs', label: 'Log Kandidat', icon: ClipboardList },
    { id: 'archive', label: 'Candidate Archive', icon: Archive },
    { id: 'upload-cv', label: 'Upload CV', icon: Upload },
    { id: 'templates', label: 'Template Email', icon: FileText },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#3D2C44] border-r border-white/10 transition-all duration-300 lg:static",
          isSidebarOpen ? "w-64" : "w-20",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-white/5">
          <div className={cn("flex items-center gap-3", !isSidebarOpen && "lg:hidden")}>
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-[#3D2C44] font-bold">H</span>
            </div>
            <span className="font-bold text-xl tracking-tight text-white">HRD Pro</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-md hover:bg-white/10 text-white/70"
          >
            {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden text-white/70"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.id}
              to={`/${item.id}`}
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(
                "flex items-center w-full px-3 py-2.5 rounded-lg transition-colors group",
                currentPath === item.id 
                  ? "bg-white/10 text-white" 
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 shrink-0",
                currentPath === item.id ? "text-white" : "text-white/40 group-hover:text-white/60"
              )} />
              {isSidebarOpen && <span className="ml-3 font-medium">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className={cn("flex items-center gap-3 mb-4", !isSidebarOpen && "lg:justify-center")}>
            <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0">
              {user.user_metadata.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/20 text-white font-bold">
                  {user.user_metadata.full_name?.[0] || user.email?.[0].toUpperCase()}
                </div>
              )}
            </div>
            {isSidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{user.user_metadata.full_name || 'User'}</p>
                <p className="text-xs text-white/60 truncate">{user.email}</p>
              </div>
            )}
          </div>
          <button 
            onClick={handleLogout}
            className={cn(
              "flex items-center w-full px-3 py-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors",
              !isSidebarOpen && "lg:justify-center"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="ml-3 font-medium">Keluar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
        {/* Header */}
        <header className="h-16 bg-[#3D2C44] border-b border-white/10 flex items-center justify-between px-6 shrink-0 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-[#3D2C44] font-bold">H</span>
            </div>
            <span className="font-bold text-xl tracking-tight text-white">HRD Pro</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-white/70 hover:bg-white/10 rounded-md"
          >
            <Menu size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
