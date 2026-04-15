import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Candidate } from '../types';
import { 
  Search, 
  RefreshCcw, 
  Mail, 
  Phone, 
  GraduationCap, 
  Briefcase, 
  Star, 
  AlertTriangle, 
  Lightbulb, 
  FileText, 
  CheckCircle, 
  Calendar as CalendarIcon,
  ChevronDown,
  X,
  Sparkles,
  Database,
  LayoutList,
  LayoutGrid
} from 'lucide-react';
import { cn, formatDate, extractPhotoUrl } from '../lib/utils';
import { useToast } from '../components/ui/use-toast';
import JSONRenderer from '../components/JSONRenderer';

export default function CandidateArchive() {
  const [logs, setLogs] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [expandedCards, setExpandedCards] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const { toast } = useToast();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to first page on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchLogs = async () => {
    setLoading(true);
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    let query = supabase
      .from('candidate_logs')
      .select('*, external_data(raw_data)', { count: 'exact' });

    if (debouncedSearch) {
      query = query.or(`full_name.ilike.%${debouncedSearch}%,position.ilike.%${debouncedSearch}%`);
    }

    if (dateFilter) {
      query = query.gte('date', `${dateFilter}T00:00:00`).lte('date', `${dateFilter}T23:59:59`);
    }

    let { data, error, count } = await query
      .order('archived_at', { ascending: false })
      .range(from, to);

    // Handle array case if relationship returns an array
    if (data && !error) {
      data = data.map(d => {
        if (Array.isArray(d.external_data) && d.external_data.length > 0) {
          return { ...d, external_data: d.external_data[0] };
        }
        return d;
      });
    }

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setLogs(data || []);
      setTotalItems(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [currentPage, itemsPerPage, dateFilter, debouncedSearch]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;

  const toggleCard = (id: string) => {
    setExpandedCards(prev => 
      prev.includes(id) ? prev.filter(cardId => cardId !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Candidate Archive
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Daftar kandidat yang telah diarsipkan.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nama atau posisi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 w-full sm:w-auto">
            <CalendarIcon size={16} className="text-slate-400 shrink-0" />
            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-sm focus:outline-none w-full sm:w-auto"
            />
          </div>
          <button 
            onClick={() => {
              setSearch('');
              setDateFilter('');
              setCurrentPage(1);
            }}
            className="px-4 py-2.5 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:border-rose-200 rounded-xl transition-all shadow-sm"
          >
            Reset
          </button>
          <button 
            onClick={fetchLogs}
            className="p-2.5 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
            title="Refresh Data"
          >
            <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 h-[42px]">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-1.5 rounded-lg transition-all h-full flex items-center justify-center",
                viewMode === 'list' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
              title="Tampilan Daftar"
            >
              <LayoutList size={18} />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={cn(
                "p-1.5 rounded-lg transition-all h-full flex items-center justify-center",
                viewMode === 'card' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
              title="Tampilan Kartu"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Archive Cards */}
      <div className={cn(
        "grid gap-6",
        viewMode === 'list' ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      )}>
        {logs.map((log) => {
          const isExpanded = expandedCards.includes(log.id);
          
          if (viewMode === 'card') {
            return (
              <div 
                key={log.id} 
                className="bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all duration-300 flex flex-col"
              >
                <div className="p-5 border-b border-slate-100 flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link to={`/candidates/${log.id}`} className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-700 font-bold hover:bg-indigo-200 transition-colors overflow-hidden">
                      {extractPhotoUrl(log.external_data?.raw_data || log.source_info) ? (
                        <img src={extractPhotoUrl(log.external_data?.raw_data || log.source_info)!} alt={log.full_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        log.full_name[0]
                      )}
                    </Link>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 truncate">
                        <Link to={`/candidates/${log.id}`} className="hover:text-indigo-600 transition-colors">
                          {log.full_name}
                        </Link>
                      </h3>
                      <p className="text-xs text-slate-500 truncate">{log.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100" title="Skor CV (AI)">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase">CV</span>
                      <span className="text-xs font-bold text-indigo-700">{log.assessment_score || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <CalendarIcon size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">Diarsipkan: {log.archived_at ? formatDate(log.archived_at) : formatDate(log.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Briefcase size={14} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-indigo-600 truncate">{log.position}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Phone size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{log.phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <GraduationCap size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{log.education || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Briefcase size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{log.work_experience || '-'}</span>
                  </div>
                  
                  <div className="pt-2 flex flex-wrap gap-1">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border",
                      log.psikotes_status === 'Sudah Psikotes' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-600 border-slate-100"
                    )}>
                      {log.psikotes_status || 'Belum Psikotes'}
                    </span>
                    <span className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border",
                      log.interview_status === 'Sudah Interview' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-600 border-slate-100"
                    )}>
                      {log.interview_status || 'Belum Interview'}
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div 
              key={log.id} 
              onClick={() => toggleCard(log.id)}
              className={cn(
                "group relative bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all duration-300 cursor-pointer p-6",
                isExpanded && "border-indigo-400 shadow-lg"
              )}
            >
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: Basic Info */}
                <div className="lg:w-1/3 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Link to={`/candidates/${log.id}`} className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-700 font-bold text-xl hover:bg-indigo-200 transition-colors overflow-hidden">
                        {extractPhotoUrl(log.external_data?.raw_data || log.source_info) ? (
                          <img src={extractPhotoUrl(log.external_data?.raw_data || log.source_info)!} alt={log.full_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          log.full_name[0]
                        )}
                      </Link>
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-slate-900 truncate">
                          <Link to={`/candidates/${log.id}`} className="hover:text-indigo-600 transition-colors">
                            {log.full_name}
                          </Link>
                        </h3>
                        <p className="text-sm text-slate-500 font-medium">{log.position}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Diarsipkan pada</p>
                        <p className="text-xs font-medium text-slate-600">{log.archived_at ? formatDate(log.archived_at) : formatDate(log.created_at)}</p>
                      </div>
                      <div className={cn(
                        "p-2 rounded-lg bg-slate-100 text-slate-400 transition-transform duration-300 lg:hidden",
                        isExpanded && "rotate-180"
                      )}>
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </div>

                  <div className={cn("space-y-3", !isExpanded && "hidden lg:block")}>
                    <div className="flex items-center gap-3 text-sm text-slate-600 sm:hidden">
                      <CalendarIcon size={16} className="text-slate-400" />
                      <span className="truncate">Diarsipkan: {log.archived_at ? formatDate(log.archived_at) : formatDate(log.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Mail size={16} className="text-slate-400" />
                      <span className="truncate">{log.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Phone size={16} className="text-slate-400" />
                      {log.phone || '-'}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <GraduationCap size={16} className="text-slate-400" />
                      {log.education || '-'}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Briefcase size={16} className="text-slate-400" />
                      {log.work_experience || '-'}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border",
                      log.psikotes_status === 'Sudah Psikotes' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-600 border-slate-100"
                    )}>
                      {log.psikotes_status || 'Belum Psikotes'}
                    </span>
                    <span className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border",
                      log.interview_status === 'Sudah Interview' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-600 border-slate-100"
                    )}>
                      {log.interview_status || 'Belum Interview'}
                    </span>
                  </div>
                  
                  <div className="hidden lg:flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors">
                    {isExpanded ? 'Sembunyikan Detail' : 'Lihat Selengkapnya'}
                    <ChevronDown size={14} className={cn("transition-transform duration-300", isExpanded && "rotate-180")} />
                  </div>
                </div>

                {/* Right: Assessment Details */}
                <div className={cn(
                  "flex-1 space-y-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100 transition-all duration-300",
                  !isExpanded && "hidden lg:block"
                )}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                          <Star className="text-indigo-600" size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kekuatan</p>
                          <p className={cn("text-sm text-slate-700 mt-1 leading-relaxed font-medium", !isExpanded && "line-clamp-2")}>
                            {log.strengths || '-'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                          <AlertTriangle className="text-amber-600" size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Faktor Risiko</p>
                          <p className={cn("text-sm text-slate-700 mt-1 leading-relaxed font-medium", !isExpanded && "line-clamp-2")}>
                            {log.risk_factors || '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                          <Lightbulb className="text-emerald-600" size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Potensi</p>
                          <p className={cn("text-sm text-slate-700 mt-1 leading-relaxed font-medium", !isExpanded && "line-clamp-2")}>
                            {log.potential_factors || '-'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-indigo-200">
                          {log.assessment_score || 0}
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Skor Akhir</p>
                          <p className={cn("text-xs text-slate-500 italic mt-1", !isExpanded && "truncate")}>
                            "{log.assessment_reason || '-'}"
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && log.notes && (
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Catatan Tambahan</p>
                      <p className="text-sm text-slate-600 leading-relaxed bg-white p-4 rounded-xl border border-slate-100">
                        {log.notes}
                      </p>
                    </div>
                  )}

                  {isExpanded && log.source_info && (
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Database size={14} />
                        Sumber Info / Data Eksternal
                      </p>
                      <div className="text-sm text-slate-600 leading-relaxed bg-white p-4 rounded-xl border border-slate-100">
                        <JSONRenderer data={log.source_info} />
                      </div>
                    </div>
                  )}

                  {isExpanded && log.ai_biodata_summary && (
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Sparkles size={14} className="text-indigo-500" />
                        Ringkasan AI (Berdasarkan Biodata)
                      </p>
                      <div className="text-sm text-indigo-900/80 bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100">
                        <JSONRenderer data={log.ai_biodata_summary} />
                      </div>
                    </div>
                  )}

                  {isExpanded && log.ai_psikotes_summary && (
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Sparkles size={14} className="text-indigo-500" />
                        Ringkasan AI (Berdasarkan Psikotes)
                      </p>
                      <div className="text-sm text-indigo-900/80 bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100">
                        <JSONRenderer data={log.ai_psikotes_summary} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {logs.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <RefreshCcw className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Arsip kosong</h3>
            <p className="text-slate-500">Kandidat yang diarsipkan akan muncul di sini.</p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalItems > 0 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-500">
              Menampilkan <span className="font-bold text-slate-900">{startIndex + 1}</span> - <span className="font-bold text-slate-900">{Math.min(startIndex + itemsPerPage, totalItems)}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> arsip
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
                {[10, 20, 50, 100].map(val => (
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
    </div>
  );
}
