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
  ChevronDown,
  Archive,
  Upload,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Briefcase,
  Database,
  KeyRound
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { SiteSettings } from '../types';
import { motion } from 'motion/react';
import NotificationPanel from './NotificationPanel';

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User;
}

export default function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract current path from location (e.g., "/dashboard" -> "dashboard")
  const currentPath = location.pathname.substring(1) || 'dashboard';

  useEffect(() => {
    supabase.from('site_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) setSettings(data);
    });
  }, []);

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
    { id: 'funnel', label: 'Recruitment Funnel', icon: BarChart3 },
    {
      title: 'Tahapan Seleksi',
      icon: Users,
      items: [
        { id: 'screening', label: 'Screening Awal', icon: Users },
        { id: 'psikotes', label: 'Jadwal Psikotes', icon: FileText },
        { id: 'interview', label: 'Jadwal Interview', icon: CalendarDays },
      ]
    },
    {
      title: 'Talent Acquisition',
      icon: Briefcase,
      items: [
        { id: 'open-recruitment', label: 'Open Recruitment', icon: Briefcase },
        { id: 'upload-cv', label: 'Upload CV', icon: Upload },
        { id: 'tokens', label: 'Token Pelamar', icon: KeyRound },
      ]
    },
    {
      title: 'Database Kandidat',
      icon: Database,
      items: [
        { id: 'external-data', label: 'Data Eksternal', icon: Database },
        { id: 'archive', label: 'Candidate Archive', icon: Archive },
        { id: 'logs', label: 'Log Kandidat', icon: ClipboardList },
      ]
    },
    {
      title: 'Template',
      icon: FileText,
      items: [
        { id: 'templates', label: 'Template Email', icon: FileText },
        { id: 'evaluation-templates', label: 'Template Evaluasi', icon: FileText },
      ]
    },
    { id: 'settings', label: 'Pengaturan', icon: Settings }
  ];

  // Initialize expanded groups based on current path
  useEffect(() => {
    navItems.forEach(group => {
      if ('items' in group && group.items.some(item => item.id === currentPath)) {
        setExpandedGroups(prev => ({ ...prev, [group.title]: true }));
      }
    });
  }, [currentPath]);

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
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#3D2C44] transition-all duration-300 lg:static",
          "lg:m-4 lg:rounded-3xl lg:shadow-2xl lg:h-[calc(100vh-2rem)]",
          isSidebarOpen ? "w-64" : "w-20",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-white/5">
          <div className={cn("flex items-center gap-3", !isSidebarOpen && "lg:hidden")}>
            {settings?.sidebar_logo_url && (
              <img src={settings.sidebar_logo_url} alt="Logo" className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
            )}
            <span className="font-bold text-xl tracking-tight text-white">{settings?.sidebar_text || 'Waruna'}</span>
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

        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {navItems.map((item, index) => {
            if ('items' in item) {
              const isExpanded = expandedGroups[item.title];
              const isActiveGroup = item.items.some(sub => sub.id === currentPath);
              
              return (
                <div key={item.title} className="space-y-1">
                  <button
                    onClick={() => {
                      if (!isSidebarOpen) setIsSidebarOpen(true);
                      setExpandedGroups(prev => ({ ...prev, [item.title]: !isExpanded }));
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-all duration-300 group",
                      isActiveGroup && !isExpanded ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <div className="flex items-center">
                      <item.icon className={cn(
                        "w-5 h-5 shrink-0 transition-transform duration-300",
                        isActiveGroup && !isExpanded ? "text-white scale-110" : "text-white/40 group-hover:text-white/60 group-hover:scale-110"
                      )} />
                      {isSidebarOpen && <span className="ml-3 font-medium text-[15px]">{item.title}</span>}
                    </div>
                    {isSidebarOpen && (
                      <ChevronDown size={16} className={cn("transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
                    )}
                  </button>
                  
                  {isExpanded && isSidebarOpen && (
                    <div className="pl-4 pr-1 space-y-1 mt-1">
                      {item.items.map(subItem => (
                        <Link
                          key={subItem.id}
                          to={`/${subItem.id}`}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center w-full px-3 py-2.5 rounded-xl transition-all duration-300 group relative",
                            currentPath === subItem.id 
                              ? "text-slate-900 shadow-lg shadow-black/10 translate-x-1" 
                              : "text-white/60 hover:bg-white/5 hover:text-white hover:translate-x-1"
                          )}
                        >
                          {currentPath === subItem.id && (
                            <motion.div
                              layoutId="activeNav"
                              className="absolute inset-0 bg-white rounded-xl"
                              transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                          )}
                          <div className="relative z-10 flex items-center w-full">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full mr-3 transition-colors",
                              currentPath === subItem.id ? "bg-slate-900" : "bg-white/20 group-hover:bg-white/60"
                            )} />
                            <span className="font-medium text-[15px]">{subItem.label}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.id}
                to={`/${item.id}`}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center w-full px-3 py-3 rounded-2xl transition-all duration-300 group relative",
                  currentPath === item.id 
                    ? "text-slate-900 shadow-lg shadow-black/10 translate-x-1" 
                    : "text-white/60 hover:bg-white/5 hover:text-white hover:translate-x-1"
                )}
              >
                {currentPath === item.id && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 bg-white rounded-2xl"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div className="relative z-10 flex items-center w-full">
                  <item.icon className={cn(
                    "w-5 h-5 shrink-0 transition-transform duration-300",
                    currentPath === item.id ? "text-slate-900 scale-110" : "text-white/40 group-hover:text-white/60 group-hover:scale-110"
                  )} />
                  {isSidebarOpen && <span className="ml-3 font-medium text-[15px]">{item.label}</span>}
                </div>
              </Link>
            );
          })}
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
            {isSidebarOpen && <span className="ml-3 font-medium text-[15px]">Keluar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
        {/* Header */}
        <header className="h-16 bg-[#3D2C44] border-b border-white/10 flex items-center justify-between px-6 shrink-0 lg:hidden">
          <div className="flex items-center gap-3">
            {settings?.sidebar_logo_url && (
              <img src={settings.sidebar_logo_url} alt="Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
            )}
            <span className="font-bold text-xl tracking-tight text-white">{settings?.sidebar_text || 'Waruna'}</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationPanel isMobile={true} />
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-white/70 hover:bg-white/10 rounded-md"
            >
              <Menu size={24} />
            </button>
          </div>
        </header>

        {/* Floating Notification Panel for Desktop */}
        <div className="hidden lg:block fixed top-6 right-8 z-50">
          <NotificationPanel />
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
