import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Candidate } from '../types';
import { 
  Search, 
  Filter, 
  RefreshCcw, 
  Send, 
  FolderInput, 
  ChevronDown, 
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  GraduationCap,
  Briefcase,
  Star,
  AlertTriangle,
  Lightbulb,
  FileText,
  Users,
  CheckCircle,
  Calendar as CalendarIcon,
  ThumbsUp,
  ThumbsDown,
  X,
  LayoutList,
  LayoutGrid,
  Loader2
} from 'lucide-react';
import { cn, formatDate, fetchWithRetry } from '../lib/utils';
import { useToast } from '../components/ui/use-toast';

import SchedulingModal from '../components/SchedulingModal';

export default function Screening() {
  const location = useLocation();
  const highlightId = location.state?.highlightId;
  const [blinkingId, setBlinkingId] = useState<string | null>(null);
  const [expandedCandidates, setExpandedCandidates] = useState<string[]>([]);

  useEffect(() => {
    if (highlightId) {
      setBlinkingId(highlightId);
      setExpandedCandidates(prev => prev.includes(highlightId) ? prev : [...prev, highlightId]);
      
      const timer = setTimeout(() => {
        setBlinkingId(null);
      }, 5000);
      
      setTimeout(() => {
        document.getElementById(`candidate-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [schedulingData, setSchedulingData] = useState<{ candidate: Candidate, type: 'psikotes' | 'interview' } | null>(null);
  const [logModalData, setLogModalData] = useState<Candidate | null>(null);
  const [logNotes, setLogNotes] = useState('');
  const [movingToLog, setMovingToLog] = useState(false);
  const [rejectModalData, setRejectModalData] = useState<Candidate | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acceptModalData, setAcceptModalData] = useState<Candidate | null>(null);
  const [hireModalData, setHireModalData] = useState<Candidate | null>(null);
  const [hireNotes, setHireNotes] = useState('');
  const [hiring, setHiring] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [assessmentModalData, setAssessmentModalData] = useState<Candidate | null>(null);
  const [assessmentScores, setAssessmentScores] = useState({
    technical_score: 0,
    communication_score: 0,
    problem_solving_score: 0,
    teamwork_score: 0,
    leadership_score: 0,
    adaptability_score: 0,
  });
  const [savingAssessment, setSavingAssessment] = useState(false);
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const [totalItems, setTotalItems] = useState(0);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
          if (data) setProfile(data);
        });
      }
    });
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchCandidates = async () => {
    if (!profile) return; // Wait for profile to load

    setLoading(true);
    let query = supabase
      .from('candidates')
      .select('*, psikotes_schedules(id, is_confirmed, schedule_date), interview_schedules(id, is_confirmed, schedule_date)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (profile.role === 'USER_MANAGER') {
      query = query.eq('assigned_to', profile.id);
    }

    if (debouncedSearch) {
      query = query.or(`full_name.ilike.%${debouncedSearch}%,position.ilike.%${debouncedSearch}%`);
    }
    if (startDate) {
      query = query.gte('date', `${startDate}T00:00:00`);
    }
    if (endDate) {
      query = query.lte('date', `${endDate}T23:59:59`);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status_screening', statusFilter);
    }

    // Apply pagination
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setCandidates(data || []);
      setTotalItems(count || 0);
      // Expand all groups by default
      const positions = Array.from(new Set((data || []).map(c => c.position)));
      setExpandedGroups(positions);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCandidates();
  }, [startDate, endDate, debouncedSearch, currentPage, itemsPerPage, statusFilter, profile]);

  const confirmReject = async () => {
    if (!rejectModalData) return;
    
    setRejecting(true);
    try {
      // Set status to rejected first so it's recorded as rejected in the log
      const { error: updateError } = await supabase
        .from('candidates')
        .update({ status_screening: 'rejected' })
        .eq('id', rejectModalData.id);

      if (updateError) throw updateError;

      // Then move to log
      const response = await fetchWithRetry('/api/candidates/move-to-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          candidateId: rejectModalData.id,
          notes: rejectReason.trim() || 'Ditolak pada tahap Screening Awal'
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast({ 
          title: 'Berhasil', 
          description: `Kandidat ${rejectModalData.full_name} telah ditolak dan dipindahkan ke Candidate Archive.` 
        });
        setCandidates(candidates.filter(c => c.id !== rejectModalData.id));
        setRejectModalData(null);
        setRejectReason('');
      } else {
        throw new Error(result.error || 'Gagal memindahkan kandidat');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setRejecting(false);
    }
  };

  const handleUpdateStatus = async (candidateId: string, status: 'accepted' | 'rejected' | 'hired') => {
    if (status === 'rejected') {
      const candidate = candidates.find(c => c.id === candidateId);
      if (candidate) {
        setRejectModalData(candidate);
      }
      return;
    }
    
    if (status === 'hired') {
      const candidate = candidates.find(c => c.id === candidateId);
      if (candidate) {
        setHireModalData(candidate);
      }
      return;
    }

    if (status === 'accepted') {
      const candidate = candidates.find(c => c.id === candidateId);
      if (candidate) {
        setAcceptModalData(candidate);
      }
      return;
    }
  };

  const confirmAccept = async () => {
    if (!acceptModalData) return;

    setAccepting(true);
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ status_screening: 'accepted' })
        .eq('id', acceptModalData.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ 
          title: 'Berhasil', 
          description: `Status kandidat ${acceptModalData.full_name} diperbarui menjadi Diterima (Lolos Screening).` 
        });
        fetchCandidates();
        setAcceptModalData(null);
      }
    } finally {
      setAccepting(false);
    }
  };

  const confirmHire = async () => {
    if (!hireModalData) return;
    
    setHiring(true);
    try {
      // Set status to hired first
      const { error: updateError } = await supabase
        .from('candidates')
        .update({ status_screening: 'hired' })
        .eq('id', hireModalData.id);

      if (updateError) throw updateError;

      // Then move to log
      const response = await fetchWithRetry('/api/candidates/move-to-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          candidateId: hireModalData.id,
          notes: hireNotes || 'Kandidat telah direkrut (Hired)'
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast({ 
          title: 'Berhasil', 
          description: `Kandidat ${hireModalData.full_name} telah direkrut dan dipindahkan ke Candidate Archive.` 
        });
        setCandidates(candidates.filter(c => c.id !== hireModalData.id));
        setHireModalData(null);
        setHireNotes('');
      } else {
        throw new Error(result.error || 'Gagal memindahkan kandidat');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setHiring(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const handleMoveToLog = async () => {
    if (!logModalData) return;
    
    setMovingToLog(true);
    try {
      const response = await fetchWithRetry('/api/candidates/move-to-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          candidateId: logModalData.id,
          notes: logNotes
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast({ title: 'Berhasil', description: 'Kandidat dipindahkan ke log.' });
        setLogModalData(null);
        setLogNotes('');
        fetchCandidates();
      } else {
        throw new Error(result.error || 'Gagal memindahkan kandidat');
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setMovingToLog(false);
    }
  };

  const handleSaveAssessment = async () => {
    if (!assessmentModalData) return;
    setSavingAssessment(true);
    try {
      const { error } = await supabase
        .from('candidates')
        .update({
          technical_score: assessmentScores.technical_score,
          communication_score: assessmentScores.communication_score,
          problem_solving_score: assessmentScores.problem_solving_score,
          teamwork_score: assessmentScores.teamwork_score,
          leadership_score: assessmentScores.leadership_score,
          adaptability_score: assessmentScores.adaptability_score,
        })
        .eq('id', assessmentModalData.id);

      if (error) throw error;

      toast({ title: 'Berhasil', description: 'Rincian skor asesmen berhasil disimpan.' });
      setAssessmentModalData(null);
      fetchCandidates();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingAssessment(false);
    }
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  // We already paginated on the server, so paginatedCandidates is just candidates
  const paginatedCandidates = candidates;

  const getManualAssessmentScore = (candidate: Candidate) => {
    const scores = [
      candidate.technical_score || 0,
      candidate.communication_score || 0,
      candidate.problem_solving_score || 0,
      candidate.teamwork_score || 0,
      candidate.leadership_score || 0,
      candidate.adaptability_score || 0
    ];
    const total = scores.reduce((a, b) => a + b, 0);
    return Math.round(total / 6);
  };

  const groupedCandidates = paginatedCandidates.reduce((acc: Record<string, Candidate[]>, c) => {
    if (!acc[c.position]) acc[c.position] = [];
    acc[c.position].push(c);
    return acc;
  }, {} as Record<string, Candidate[]>);

  const topCandidatesByPosition = React.useMemo(() => {
    const grouped: Record<string, Candidate[]> = {};
    candidates.forEach(c => {
      // Exclude rejected and hired candidates from the top list
      if (c.status_screening === 'rejected' || c.status_screening === 'hired') return;
      
      if (!grouped[c.position]) grouped[c.position] = [];
      grouped[c.position].push(c);
    });

    const top5: Record<string, Candidate[]> = {};
    Object.keys(grouped).forEach(pos => {
      // Sort by assessment_score descending
      const sorted = grouped[pos].sort((a, b) => (b.assessment_score || 0) - (a.assessment_score || 0));
      if (sorted.length > 0) {
        top5[pos] = sorted.slice(0, 5);
      }
    });
    return top5;
  }, [candidates]);

  const toggleGroup = (position: string) => {
    setExpandedGroups(prev => 
      prev.includes(position) ? prev.filter(p => p !== position) : [...prev, position]
    );
  };

  const toggleCandidate = (id: string) => {
    setExpandedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleTopCandidateClick = (candidate: Candidate) => {
    // Ensure the group is expanded
    if (!expandedGroups.includes(candidate.position)) {
      setExpandedGroups(prev => [...prev, candidate.position]);
    }
    // Ensure the candidate is expanded
    if (!expandedCandidates.includes(candidate.id)) {
      setExpandedCandidates(prev => [...prev, candidate.id]);
    }
    
    // With server-side pagination, we can't easily jump to the exact page without an extra query.
    // For now, we just clear filters and go to page 1, hoping they are near the top,
    // or we can just scroll if they are already on the current page.
    
    const isOnCurrentPage = candidates.some(c => c.id === candidate.id);
    
    if (!isOnCurrentPage) {
      setSearch('');
      setStartDate('');
      setEndDate('');
      setCurrentPage(1);
    }

    // Scroll to the candidate list area
    setTimeout(() => {
      const el = document.getElementById(`candidate-${candidate.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 500); // Give it a bit more time if we had to refetch
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Screening Awal
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Kelola dan tinjau kandidat baru yang masuk.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari nama atau posisi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
            <Filter size={16} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-slate-700"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Pending</option>
              <option value="invited">Invited</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="hired">Hired</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
            <CalendarIcon size={16} className="text-slate-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-sm focus:outline-none"
            />
            <span className="text-slate-400">-</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-sm focus:outline-none"
            />
          </div>
          <button 
            onClick={() => setStatusFilter('all')}
            className="px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm whitespace-nowrap"
            title="Tampilkan semua kandidat terlepas dari filter status"
          >
            Semua Kandidat
          </button>
          <button 
            onClick={() => {
              setSearch('');
              setStartDate('');
              setEndDate('');
              setStatusFilter('all');
            }}
            className="px-4 py-2 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:border-rose-200 rounded-xl transition-all shadow-sm"
          >
            Reset
          </button>
          <button 
            onClick={fetchCandidates}
            className="p-2.5 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
            title="Refresh Data"
          >
            <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                viewMode === 'list' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
              title="Tampilan Daftar"
            >
              <LayoutList size={18} />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                viewMode === 'card' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
              title="Tampilan Kartu"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Candidate List */}
      <div className="space-y-8">
        {Object.entries(groupedCandidates).map(([position, candidatesInGroup]: [string, any]) => (
          <div key={position} className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-3">
              {position}
              <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {candidatesInGroup.length} Pelamar Aktif
              </span>
            </h2>
            <div className={cn(
              "grid gap-6",
              viewMode === 'list' ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            )}>
              {candidatesInGroup.map((candidate) => {
                const isExpanded = expandedCandidates.includes(candidate.id);
            
            if (viewMode === 'card') {
              return (
                <div 
                  key={candidate.id} 
                  id={`candidate-${candidate.id}`}
                  className={cn(
                    "bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all duration-300 flex flex-col",
                    blinkingId === candidate.id ? "animate-pulse ring-2 ring-indigo-500 ring-inset" : ""
                  )}
                >
                  <div className="p-5 border-b border-slate-100 flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <Link to={`/candidates/${candidate.id}`} className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-700 font-bold hover:bg-indigo-200 transition-colors">
                        {candidate.full_name[0]}
                      </Link>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900 truncate">
                          <Link to={`/candidates/${candidate.id}`} className="hover:text-indigo-600 transition-colors">
                            {candidate.full_name}
                          </Link>
                        </h3>
                        <p className="text-xs text-slate-500 truncate">{candidate.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100" title="Skor CV (AI)">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase">CV</span>
                        <span className="text-xs font-bold text-indigo-700">{candidate.assessment_score || 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100" title="Skor Asesmen (Manual)">
                        <span className="text-[10px] font-bold text-emerald-500 uppercase">Asesmen</span>
                        <span className="text-xs font-bold text-emerald-700">{getManualAssessmentScore(candidate)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <CalendarIcon size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">Melamar: {formatDate(candidate.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Briefcase size={14} className="text-slate-400 shrink-0" />
                      <span className="font-medium text-indigo-600 truncate">{candidate.position}</span>
                    </div>
                    {candidate.source_info && (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                        </div>
                        <span className="truncate">Sumber: {candidate.source_info}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Phone size={14} className="text-slate-400 shrink-0" />
                            <span className="truncate">{candidate.phone || '-'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <GraduationCap size={14} className="text-slate-400 shrink-0" />
                            <span className="truncate">{candidate.education || '-'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Briefcase size={14} className="text-slate-400 shrink-0" />
                            <span className="truncate">{candidate.work_experience || '-'}</span>
                          </div>
                          
                          <div className="pt-2 flex flex-wrap gap-1">
                            {candidate.status_screening === 'accepted' && (
                              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-bold uppercase tracking-wider border border-emerald-100">
                                Lolos
                              </span>
                            )}
                            {candidate.status_screening === 'hired' && (
                              <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-[9px] font-bold uppercase tracking-wider border border-indigo-100">
                                Direkrut
                              </span>
                            )}
                            {candidate.status_screening === 'rejected' && (
                              <span className="px-2 py-1 bg-red-50 text-red-700 rounded-md text-[9px] font-bold uppercase tracking-wider border border-red-100">
                                Ditolak
                              </span>
                            )}
                            {candidate.interview_schedules?.filter(s => s.is_confirmed).length > 0 && (
                              <span className="px-2 py-1 bg-sky-50 text-sky-700 rounded-md text-[9px] font-bold uppercase tracking-wider border border-sky-100">
                                Selesai Interview {candidate.interview_schedules.filter(s => s.is_confirmed).length > 1 ? candidate.interview_schedules.filter(s => s.is_confirmed).length : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 flex-wrap">
                          {profile?.role !== 'USER_MANAGER' && (
                            <>
                              <button 
                                onClick={() => handleUpdateStatus(candidate.id, 'accepted')}
                                title="Terima Kandidat (Lolos Screening)"
                                className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all"
                              >
                                <ThumbsUp size={16} />
                              </button>
                              <button 
                                onClick={() => handleUpdateStatus(candidate.id, 'hired')}
                                title="Rekrut Kandidat (Hired)"
                                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all"
                              >
                                <Briefcase size={16} />
                              </button>
                              <button 
                                onClick={() => handleUpdateStatus(candidate.id, 'rejected')}
                                title="Tolak Kandidat"
                                className="p-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all"
                              >
                                <ThumbsDown size={16} />
                              </button>
                              {candidate.status_screening === 'accepted' && (!candidate.psikotes_schedules || candidate.psikotes_schedules.length === 0) && (
                                <button 
                                  onClick={() => setSchedulingData({ candidate, type: 'psikotes' })}
                                  title="Jadwalkan Psikotes"
                                  className="p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-all"
                                >
                                  <FileText size={16} />
                                </button>
                              )}
                              {candidate.status_screening === 'accepted' && (!candidate.interview_schedules || candidate.interview_schedules.length === 0 || candidate.interview_schedules.every(s => s.is_confirmed)) && (
                                <button 
                                  onClick={() => setSchedulingData({ candidate, type: 'interview' })}
                                  title="Jadwalkan Interview"
                                  className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all"
                                >
                                  <Users size={16} />
                                </button>
                              )}
                            </>
                          )}
                          {candidate.status_screening === 'accepted' && (
                            <button 
                              onClick={() => {
                                setAssessmentScores({
                                  technical_score: candidate.technical_score || 0,
                                  communication_score: candidate.communication_score || 0,
                                  problem_solving_score: candidate.problem_solving_score || 0,
                                  teamwork_score: candidate.teamwork_score || 0,
                                  leadership_score: candidate.leadership_score || 0,
                                  adaptability_score: candidate.adaptability_score || 0,
                                });
                                setAssessmentModalData(candidate);
                              }}
                              title="Rincian Skor Asesmen"
                              className="p-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-all"
                            >
                              <Star size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div 
                      id={`candidate-${candidate.id}`} 
                      key={candidate.id} 
                      className={cn(
                        "group relative bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all duration-300",
                        blinkingId === candidate.id ? "animate-pulse ring-2 ring-indigo-500 ring-inset" : ""
                      )}
                    >
                      {/* Accordion Header */}
                      <button 
                        onClick={() => toggleCandidate(candidate.id)}
                        className={cn(
                          "w-full flex items-center justify-between p-6 text-left transition-colors",
                          isExpanded ? "bg-slate-50/50 border-b border-slate-100" : "hover:bg-slate-50/30"
                        )}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <Link to={`/candidates/${candidate.id}`} className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-700 font-bold hover:bg-indigo-200 transition-colors">
                            {candidate.full_name[0]}
                          </Link>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-slate-900 truncate flex items-center gap-2">
                              <Link to={`/candidates/${candidate.id}`} className="hover:text-indigo-600 transition-colors">
                                {candidate.full_name}
                              </Link>
                              <span className="text-slate-400 font-normal">:</span> <span className="text-slate-500 font-medium text-sm">{candidate.email}</span>
                            </h3>
                             {!isExpanded && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {formatDate(candidate.date)}
                                </p>
                                {candidate.psikotes_schedules && candidate.psikotes_schedules.length > 0 && (
                                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    Telah dibuat jadwal psikotes
                                  </span>
                                )}
                                {candidate.interview_schedules && candidate.interview_schedules.length > 0 && (
                                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Telah dibuat jadwal interview
                                  </span>
                                )}
                                {candidate.psikotes_schedules?.some(s => s.is_confirmed) && (
                                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                    Telah Dilakukan Psikotes ({formatDate(candidate.psikotes_schedules.find(s => s.is_confirmed)!.schedule_date)})
                                  </span>
                                )}
                                {candidate.interview_schedules?.some(s => s.is_confirmed) && (
                                  <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                    Selesai Interview {candidate.interview_schedules.filter(s => s.is_confirmed).length > 1 ? candidate.interview_schedules.filter(s => s.is_confirmed).length : ''}
                                  </span>
                                )}
                                {candidate.status_screening === 'accepted' && (
                                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Lolos Screening
                                  </span>
                                )}
                                {candidate.status_screening === 'hired' && (
                                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                    Telah Direkrut
                                  </span>
                                )}
                                {candidate.status_screening === 'rejected' && (
                                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                    Ditolak
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100" title="Skor CV (AI)">
                              <span className="text-[10px] font-bold text-indigo-400 uppercase">CV</span>
                              <span className="text-sm font-bold text-indigo-700">{candidate.assessment_score || 0}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100" title="Skor Asesmen (Manual)">
                              <span className="text-[10px] font-bold text-emerald-500 uppercase">Asesmen</span>
                              <span className="text-sm font-bold text-emerald-700">{getManualAssessmentScore(candidate)}</span>
                            </div>
                          </div>
                          <div className={cn("p-2 rounded-lg bg-slate-100 text-slate-400 transition-transform duration-300", isExpanded && "rotate-180")}>
                            <ChevronDown size={18} />
                          </div>
                        </div>
                      </button>

                      {/* Accordion Body */}
                      {isExpanded && (
                        <div className="p-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="flex flex-col lg:flex-row gap-8">
                            {/* Left: Basic Info */}
                            <div className="lg:w-1/3 space-y-5">
                              <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                    <Mail size={16} className="text-slate-400" />
                                  </div>
                                  <span className="truncate">{candidate.email}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                    <Phone size={16} className="text-slate-400" />
                                  </div>
                                  {candidate.phone || '-'}
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                    <GraduationCap size={16} className="text-slate-400" />
                                  </div>
                                  {candidate.education || '-'}
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                    <Briefcase size={16} className="text-slate-400" />
                                  </div>
                                  {candidate.work_experience || '-'}
                                </div>
                                {candidate.source_info && (
                                  <div className="flex items-center gap-3 text-sm text-slate-600">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                                    </div>
                                    Sumber: {candidate.source_info}
                                  </div>
                                )}
                                {candidate.resume_url && (
                                  <div className="pt-2">
                                    <a 
                                      href={candidate.resume_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                                    >
                                      <FileText size={16} />
                                      Lihat Resume CV
                                    </a>
                                  </div>
                                )}
                                {(candidate.psikotes_schedules?.length || 0) > 0 || (candidate.interview_schedules?.length || 0) > 0 || candidate.psikotes_schedules?.some(s => s.is_confirmed) || candidate.interview_schedules?.some(s => s.is_confirmed) ? (
                                  <div className="pt-2 space-y-2">
                                    {candidate.psikotes_schedules && candidate.psikotes_schedules.length > 0 && (
                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                                        <FileText size={12} />
                                        Telah dibuat jadwal Psikotes
                                      </div>
                                    )}
                                    {candidate.interview_schedules && candidate.interview_schedules.length > 0 && (
                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                                        <Users size={12} />
                                        Telah dibuat jadwal Interview
                                      </div>
                                    )}
                                    {candidate.psikotes_schedules?.some(s => s.is_confirmed) && (
                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                                        <CheckCircle size={12} />
                                        Telah Dilakukan Psikotes ({formatDate(candidate.psikotes_schedules.find(s => s.is_confirmed)!.schedule_date)})
                                      </div>
                                    )}
                                    {candidate.interview_schedules?.some(s => s.is_confirmed) && (
                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 text-sky-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-sky-100">
                                        <CheckCircle size={12} />
                                        Telah Dilakukan interview ({formatDate(candidate.interview_schedules.find(s => s.is_confirmed)!.schedule_date)})
                                      </div>
                                    )}
                                    {candidate.status_screening === 'accepted' && (
                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                                        <ThumbsUp size={12} />
                                        Lolos Screening
                                      </div>
                                    )}
                                    {candidate.status_screening === 'hired' && (
                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                                        <Briefcase size={12} />
                                        Telah Direkrut (Hired)
                                      </div>
                                    )}
                                    {candidate.status_screening === 'rejected' && (
                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-red-100">
                                        <ThumbsDown size={12} />
                                        Ditolak
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {/* Right: Assessment Details */}
                            <div className="flex-1 space-y-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                              <div className="grid grid-cols-1 gap-6">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                                    <Star className="text-indigo-600" size={20} />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kekuatan</p>
                                    <p className="text-sm text-slate-700 mt-1 leading-relaxed font-medium">{candidate.strengths || '-'}</p>
                                  </div>
                                </div>
                                
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="text-amber-600" size={20} />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Faktor Risiko</p>
                                    <p className="text-sm text-slate-700 mt-1 leading-relaxed font-medium">{candidate.risk_factors || '-'}</p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                    <Lightbulb className="text-emerald-600" size={20} />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Potensi</p>
                                    <p className="text-sm text-slate-700 mt-1 leading-relaxed font-medium">{candidate.potential_factors || '-'}</p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-4 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                                    <FileText className="text-indigo-600" size={20} />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Skor CV (AI) & Alasan Penilaian</p>
                                    <div className="flex items-center gap-4 mt-2">
                                      <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-indigo-200" title="Skor CV (AI)">
                                        {candidate.assessment_score || 0}
                                      </div>
                                      <p className="text-sm text-indigo-900 leading-relaxed italic flex-1">"{candidate.assessment_reason || '-'}"</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex lg:flex-col gap-3 justify-end lg:justify-start">
                              {profile?.role !== 'USER_MANAGER' && (
                                <>
                                  <button 
                                    onClick={() => handleUpdateStatus(candidate.id, 'accepted')}
                                    title="Terima Kandidat (Lolos Screening)"
                                    className="p-3.5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all hover:-translate-y-0.5"
                                  >
                                    <ThumbsUp size={22} />
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateStatus(candidate.id, 'hired')}
                                    title="Rekrut Kandidat (Hired)"
                                    className="p-3.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all hover:-translate-y-0.5"
                                  >
                                    <Briefcase size={22} />
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateStatus(candidate.id, 'rejected')}
                                    title="Tolak Kandidat"
                                    className="p-3.5 bg-red-600 text-white rounded-2xl hover:bg-red-700 shadow-lg shadow-red-100 transition-all hover:-translate-y-0.5"
                                  >
                                    <ThumbsDown size={22} />
                                  </button>
                                  <div className="h-px bg-slate-200 my-2 hidden lg:block" />
                                  {candidate.status_screening === 'accepted' && (!candidate.psikotes_schedules || candidate.psikotes_schedules.length === 0) && (
                                    <button 
                                      onClick={() => setSchedulingData({ candidate, type: 'psikotes' })}
                                      title="Jadwalkan Psikotes"
                                      className="p-3.5 bg-amber-500 text-white rounded-2xl hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all hover:-translate-y-0.5"
                                    >
                                      <FileText size={22} />
                                    </button>
                                  )}
                                  {candidate.status_screening === 'accepted' && (!candidate.interview_schedules || candidate.interview_schedules.length === 0 || candidate.interview_schedules.every(s => s.is_confirmed)) && (
                                    <button 
                                      onClick={() => setSchedulingData({ candidate, type: 'interview' })}
                                      title="Jadwalkan Interview"
                                      className="p-3.5 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-100 transition-all hover:-translate-y-0.5"
                                    >
                                      <Users size={22} />
                                    </button>
                                  )}
                                </>
                              )}
                              {candidate.status_screening === 'accepted' && (
                                <button 
                                  onClick={() => {
                                    setAssessmentScores({
                                      technical_score: candidate.technical_score || 0,
                                      communication_score: candidate.communication_score || 0,
                                      problem_solving_score: candidate.problem_solving_score || 0,
                                      teamwork_score: candidate.teamwork_score || 0,
                                      leadership_score: candidate.leadership_score || 0,
                                      adaptability_score: candidate.adaptability_score || 0,
                                    });
                                    setAssessmentModalData(candidate);
                                  }}
                                  title="Rincian Skor Asesmen"
                                  className="p-3.5 bg-sky-500 text-white rounded-2xl hover:bg-sky-600 shadow-lg shadow-sky-100 transition-all hover:-translate-y-0.5"
                                >
                                  <Star size={22} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {schedulingData && (
        <SchedulingModal 
          candidate={schedulingData.candidate}
          type={schedulingData.type}
          onClose={() => setSchedulingData(null)}
          onSuccess={fetchCandidates}
        />
      )}

      {/* Move to Log Modal */}
      {logModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <FolderInput size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Pindahkan ke Log</h3>
                  <p className="text-xs text-slate-500">Konfirmasi pemindahan kandidat</p>
                </div>
              </div>
              <button 
                onClick={() => setLogModalData(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <ChevronDown className="rotate-90" size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-900">{logModalData.full_name}</h4>
                <p className="text-sm text-slate-500">{logModalData.email}</p>
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Posisi</p>
                  <p className="text-sm font-medium text-slate-700">{logModalData.position}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Catatan / Keterangan
                </label>
                <textarea
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Masukkan alasan pemindahan atau catatan tambahan..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[120px] text-sm resize-none transition-all"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setLogModalData(null)}
                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleMoveToLog}
                disabled={movingToLog}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {movingToLog ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <>
                    <FolderInput size={18} />
                    Konfirmasi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

        {candidates.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <Users className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Tidak ada kandidat</h3>
            <p className="text-slate-500">Kandidat baru akan muncul di sini setelah mereka mendaftar.</p>
          </div>
        )}

      {/* Pagination Controls */}
      {candidates.length > 0 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-500">
              Menampilkan <span className="font-bold text-slate-900">{startIndex + 1}</span> - <span className="font-bold text-slate-900">{Math.min(startIndex + itemsPerPage, totalItems)}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> kandidat
            </p>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">Tampilkan:</label>
              <select 
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[5, 10, 20, 50, 100].map(val => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronDown className="rotate-90" size={18} />
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-sm font-medium transition-all",
                      currentPage === pageNum 
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
                        : "text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronDown className="-rotate-90" size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Accept Confirmation Modal */}
      {acceptModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ThumbsUp size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Konfirmasi Terima</h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menerima kandidat <span className="font-bold text-slate-800">{acceptModalData.full_name}</span>? 
                Status kandidat akan diubah menjadi Lolos Screening.
              </p>
              
              <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4 text-left">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Skor Screening</p>
                  <p className="text-sm font-bold text-indigo-600">{acceptModalData.assessment_score || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Skor Assessment</p>
                  <p className="text-sm font-bold text-emerald-600">{getManualAssessmentScore(acceptModalData)}</p>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setAcceptModalData(null)}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmAccept}
                disabled={accepting}
                className="flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {accepting ? <Loader2 className="animate-spin" size={18} /> : 'Ya, Terima Kandidat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Konfirmasi Penolakan</h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menolak kandidat <span className="font-bold text-slate-800">{rejectModalData.full_name}</span>? 
                Kandidat ini akan dipindahkan ke Candidate Archive.
              </p>
              <div className="text-left mt-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Alasan Penolakan (Opsional)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all resize-none"
                  placeholder="Ditolak pada tahap Screening Awal"
                  rows={3}
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => {
                  setRejectModalData(null);
                  setRejectReason('');
                }}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmReject}
                disabled={rejecting}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-sm shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {rejecting ? <Loader2 className="animate-spin" size={18} /> : 'Ya, Tolak Kandidat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hire Modal */}
      {hireModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Konfirmasi Rekrut Kandidat</h3>
                  <p className="text-sm text-slate-500">Review singkat sebelum merekrut</p>
                </div>
              </div>
              <button 
                onClick={() => setHireModalData(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-900">{hireModalData.full_name}</h4>
                <p className="text-sm text-slate-500">{hireModalData.email}</p>
                <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Posisi</p>
                    <p className="text-sm font-medium text-slate-700">{hireModalData.position}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Skor Screening</p>
                    <p className="text-sm font-bold text-indigo-600">{hireModalData.assessment_score || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Skor Assessment</p>
                    <p className="text-sm font-bold text-emerald-600">{getManualAssessmentScore(hireModalData)}</p>
                  </div>
                </div>
                {(hireModalData.strengths || hireModalData.risk_factors) && (
                  <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                    {hireModalData.strengths && (
                      <div>
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Kekuatan</p>
                        <p className="text-xs font-medium text-slate-600 line-clamp-2">{hireModalData.strengths}</p>
                      </div>
                    )}
                    {hireModalData.risk_factors && (
                      <div>
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">Faktor Risiko</p>
                        <p className="text-xs font-medium text-slate-600 line-clamp-2">{hireModalData.risk_factors}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Keterangan / Catatan Rekrutmen
                </label>
                <textarea
                  value={hireNotes}
                  onChange={(e) => setHireNotes(e.target.value)}
                  placeholder="Masukkan catatan rekrutmen, penempatan, atau informasi tambahan lainnya..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[100px] text-sm resize-none transition-all"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setHireModalData(null)}
                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmHire}
                disabled={hiring}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {hiring ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <>
                    <Briefcase size={18} />
                    Konfirmasi Rekrut
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Scores Modal */}
      {assessmentModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-sky-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
                  <Star size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Rincian Skor Asesmen</h3>
                  <p className="text-sm text-slate-500">{assessmentModalData.full_name}</p>
                </div>
              </div>
              <button 
                onClick={() => setAssessmentModalData(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Technical</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.technical_score}
                    onChange={(e) => setAssessmentScores({ ...assessmentScores, technical_score: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Communication</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.communication_score}
                    onChange={(e) => setAssessmentScores({ ...assessmentScores, communication_score: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Problem Solving</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.problem_solving_score}
                    onChange={(e) => setAssessmentScores({ ...assessmentScores, problem_solving_score: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Teamwork</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.teamwork_score}
                    onChange={(e) => setAssessmentScores({ ...assessmentScores, teamwork_score: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Leadership</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.leadership_score}
                    onChange={(e) => setAssessmentScores({ ...assessmentScores, leadership_score: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Adaptability</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.adaptability_score}
                    onChange={(e) => setAssessmentScores({ ...assessmentScores, adaptability_score: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setAssessmentModalData(null)}
                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveAssessment}
                disabled={savingAssessment}
                className="flex-1 px-6 py-3 bg-sky-600 text-white font-bold rounded-2xl hover:bg-sky-700 shadow-lg shadow-sky-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingAssessment ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <>
                    <Star size={18} />
                    Simpan Skor
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
