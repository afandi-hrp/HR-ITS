import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Schedule, Candidate } from '../types';
import { 
  Search, 
  Calendar as CalendarIcon, 
  RefreshCcw, 
  Filter, 
  MapPin, 
  Globe, 
  Clock, 
  User, 
  Briefcase,
  X,
  Edit2,
  Trash2,
  ChevronDown,
  CheckCircle2,
  Send,
  List,
  MessageCircle
} from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { useToast } from '../components/ui/use-toast';
import SchedulingModal from '../components/SchedulingModal';
import SendEmailModal from '../components/SendEmailModal';
import SendWAModal from '../components/SendWAModal';
import ScheduleCalendar from '../components/ScheduleCalendar';
import ConfirmModal from '../components/ConfirmModal';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

export default function InterviewSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed'>('pending');
  const [previewSchedule, setPreviewSchedule] = useState<Schedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [emailModalData, setEmailModalData] = useState<{ candidate: Candidate, schedule: Schedule } | null>(null);
  const [waModalData, setWaModalData] = useState<{ candidate: Candidate, schedule: Schedule } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const { toast } = useToast();

  const [isScheduling, setIsScheduling] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    id: string;
    currentStatus?: boolean;
    type: 'confirm' | 'delete';
  }>({ isOpen: false, id: '', type: 'confirm' });

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarSchedules, setCalendarSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const startIndex = (currentPage - 1) * itemsPerPage;

  const fetchCalendarSchedules = async () => {
    setLoading(true);
    const monthStart = startOfMonth(calendarDate);
    const monthEnd = endOfMonth(monthStart);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });

    let query = supabase
      .from('interview_schedules')
      .select('*, candidate:candidates!inner(*)')
      .gte('schedule_date', start.toISOString())
      .lte('schedule_date', end.toISOString());

    if (debouncedSearch) {
      query = query.or(`full_name.ilike.%${debouncedSearch}%,position.ilike.%${debouncedSearch}%`, { foreignTable: 'candidates' });
    }

    const { data, error } = await query.order('schedule_date', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setCalendarSchedules(data || []);
    }
    setLoading(false);
  };

  const fetchSchedules = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    
    const endIndex = startIndex + itemsPerPage - 1;

    let query = supabase
      .from('interview_schedules')
      .select('*, candidate:candidates!inner(*)', { count: 'exact' });

    if (startDate) query = query.gte('schedule_date', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('schedule_date', `${endDate}T23:59:59`);
    
    if (debouncedSearch) {
      query = query.or(`full_name.ilike.%${debouncedSearch}%,position.ilike.%${debouncedSearch}%`, { foreignTable: 'candidates' });
    }

    query = query.eq('is_confirmed', activeTab === 'confirmed');

    const { data, error, count } = await query
      .order('schedule_date', { ascending: activeTab === 'pending' })
      .range(startIndex, endIndex);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setSchedules(data || []);
      setTotalItems(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (viewMode === 'list') {
      fetchSchedules();
    } else {
      fetchCalendarSchedules();
    }
  }, [startDate, endDate, debouncedSearch, currentPage, itemsPerPage, activeTab, viewMode, calendarDate]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const resetFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({ isOpen: true, id, type: 'delete' });
  };

  const executeDelete = async (id: string) => {
    const { error } = await supabase.from('interview_schedules').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Berhasil', description: 'Jadwal dihapus.' });
      if (viewMode === 'list') fetchSchedules(false);
      else fetchCalendarSchedules();
    }
  };

  const handleConfirm = async (id: string, currentStatus: boolean) => {
    setConfirmModal({ isOpen: true, id, currentStatus, type: 'confirm' });
  };

  const executeConfirm = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('interview_schedules')
      .update({ is_confirmed: !currentStatus })
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ 
        title: 'Berhasil', 
        description: !currentStatus ? 'Kandidat dikonfirmasi sudah interview.' : 'Konfirmasi dibatalkan.' 
      });
      setPreviewSchedule(null);
      if (viewMode === 'list') fetchSchedules(false);
      else fetchCalendarSchedules();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Jadwal Interview
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Kelola agenda wawancara dengan kandidat terpilih.
          </p>
        </div>
        <button
          onClick={() => setIsScheduling(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
        >
          <CalendarIcon size={18} />
          Jadwalkan Interview Baru
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari nama kandidat atau posisi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {viewMode === 'list' && (
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
          )}
          {viewMode === 'list' && (
            <button 
              onClick={resetFilters}
              className="px-4 py-2 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:border-rose-200 rounded-xl transition-all shadow-sm"
            >
              Reset
            </button>
          )}

          <div className="flex items-center bg-slate-100 p-1 rounded-xl ml-2">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                viewMode === 'list' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <List size={16} />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                "p-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                viewMode === 'calendar' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <CalendarIcon size={16} />
              <span className="hidden sm:inline">Calendar</span>
            </button>
          </div>

          <button 
            onClick={() => viewMode === 'list' ? fetchSchedules() : fetchCalendarSchedules()}
            className="p-2.5 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
            title="Refresh Data"
          >
            <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <ScheduleCalendar 
          schedules={calendarSchedules}
          currentDate={calendarDate}
          onDateChange={setCalendarDate}
          onScheduleClick={setPreviewSchedule}
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-4 border-b border-slate-200">
        <button
          onClick={() => {
            setActiveTab('pending');
            setCurrentPage(1);
          }}
          className={cn(
            "pb-4 text-sm font-bold transition-all relative",
            activeTab === 'pending' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Menunggu
          {activeTab === 'pending' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('confirmed');
            setCurrentPage(1);
          }}
          className={cn(
            "pb-4 text-sm font-bold transition-all relative",
            activeTab === 'confirmed' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Selesai
          {activeTab === 'confirmed' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
          )}
        </button>
      </div>

      {/* Schedule List (Pending) */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <h2 className="text-xl font-bold text-slate-800">Agenda Interview</h2>
            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
              {totalItems} Menunggu
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {schedules.map((schedule) => (
                <div 
                  key={schedule.id} 
                  onClick={() => setPreviewSchedule(schedule)}
                  className="group p-6 rounded-2xl border bg-[#4B3658] border-white/10 hover:border-white/20 text-white shadow-lg shadow-slate-900/20 hover:shadow-xl transition-all cursor-pointer relative"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      schedule.location_type === 'online' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {schedule.location_type}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (schedule.candidate) {
                              setEmailModalData({ candidate: schedule.candidate, schedule });
                            }
                          }} 
                          className="p-1.5 rounded-lg transition-colors text-white bg-indigo-600 hover:bg-indigo-700"
                          title="Kirim Undangan Email"
                        >
                          <Send size={14} />
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (schedule.candidate) {
                              setWaModalData({ candidate: schedule.candidate, schedule });
                            }
                          }} 
                          className="p-1.5 rounded-lg transition-colors text-white bg-emerald-600 hover:bg-emerald-700"
                          title="Kirim Undangan WA"
                        >
                          <MessageCircle size={14} />
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleConfirm(schedule.id, schedule.is_confirmed); 
                          }} 
                          className={cn(
                            "p-1.5 rounded-lg transition-colors text-white",
                            schedule.is_confirmed ? "bg-slate-500 hover:bg-slate-600" : "bg-cyan-600 hover:bg-cyan-700"
                          )}
                          title={schedule.is_confirmed ? "Batalkan Konfirmasi" : "Konfirmasi Sudah Interview"}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setEditingSchedule(schedule);
                          }} 
                          className="p-1.5 rounded-lg transition-colors text-white bg-amber-500 hover:bg-amber-600"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(schedule.id); }} className="p-1.5 rounded-lg transition-colors text-white bg-rose-600 hover:bg-rose-700">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold line-clamp-1 text-white">
                        <Link to={`/candidates/${schedule.candidate_id}`} className="hover:underline">
                          {schedule.candidate?.full_name}
                        </Link>
                      </h3>
                      <p className="text-xs font-medium text-white/60">
                        {schedule.candidate?.position}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-white/80">
                        <CalendarIcon size={14} className="text-white/40" />
                        {new Date(schedule.schedule_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-white/80">
                        <Clock size={14} className="text-white/40" />
                        {new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-white/80">
                        {schedule.location_type === 'online' ? (
                          <Globe size={14} className="text-white/40" />
                        ) : (
                          <MapPin size={14} className="text-white/40" />
                        )}
                        <span className="truncate">{schedule.location_detail || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            {schedules.length === 0 && !loading && (
              <div className="col-span-full text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                  <CalendarIcon className="text-slate-400" size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Tidak ada agenda</h3>
                <p className="text-slate-500">Semua jadwal telah dikonfirmasi atau belum dibuat.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmed List Table */}
      {activeTab === 'confirmed' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <h2 className="text-xl font-bold text-slate-800">Daftar Interview Selesai</h2>
            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
              {totalItems} Selesai
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kandidat</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Posisi</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Waktu Pelaksanaan</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lokasi</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedules.map((schedule) => (
                      <tr key={schedule.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Link to={`/candidates/${schedule.candidate_id}`} className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs hover:bg-emerald-200 transition-colors">
                              {schedule.candidate?.full_name[0]}
                            </Link>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">
                                <Link to={`/candidates/${schedule.candidate_id}`} className="hover:text-emerald-600 transition-colors">
                                  {schedule.candidate?.full_name}
                                </Link>
                              </p>
                              <p className="text-xs text-slate-500">{schedule.candidate?.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600 font-medium">{schedule.candidate?.position}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-0.5">
                            <p className="text-sm text-slate-900 font-bold">
                              {new Date(schedule.schedule_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {schedule.location_type === 'online' ? <Globe size={14} className="text-slate-400" /> : <MapPin size={14} className="text-slate-400" />}
                            <span className="text-sm text-slate-600 truncate max-w-[150px]">{schedule.location_detail}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => {
                                if (schedule.candidate) {
                                  setEmailModalData({ candidate: schedule.candidate, schedule });
                                }
                              }}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Kirim Undangan Email"
                            >
                              <Send size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                if (schedule.candidate) {
                                  setWaModalData({ candidate: schedule.candidate, schedule });
                                }
                              }}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Kirim Undangan WA"
                            >
                              <MessageCircle size={16} />
                            </button>
                            <button 
                              onClick={() => handleConfirm(schedule.id, true)}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                              title="Batalkan Konfirmasi"
                            >
                              <RefreshCcw size={16} />
                            </button>
                            <button 
                              onClick={() => handleDelete(schedule.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Hapus"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  
                  {schedules.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        Tidak ada jadwal yang telah selesai.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {viewMode === 'list' && schedules.length > 0 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-500">
              Menampilkan <span className="font-bold text-slate-900">{startIndex + 1}</span> - <span className="font-bold text-slate-900">{Math.min(startIndex + itemsPerPage, totalItems)}</span> dari <span className="font-bold text-slate-900">{totalItems}</span> jadwal
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
      </>
      )}

      {/* Edit Modal */}
      {editingSchedule && editingSchedule.candidate && (
        <SchedulingModal
          candidate={editingSchedule.candidate}
          type="interview"
          initialData={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSuccess={() => {
            setEditingSchedule(null);
            if (viewMode === 'list') fetchSchedules();
            else fetchCalendarSchedules();
          }}
        />
      )}

      {/* Send Email Modal */}
      {emailModalData && (
        <SendEmailModal
          candidate={emailModalData.candidate}
          schedule={emailModalData.schedule}
          type="interview"
          onClose={() => setEmailModalData(null)}
        />
      )}

      {/* Preview Modal */}
      {previewSchedule && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setPreviewSchedule(null)}
        >
          <div 
            className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Detail Jadwal Interview</h2>
              <button onClick={() => setPreviewSchedule(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto">
              <div className="flex flex-col md:flex-row gap-6 sm:gap-8">
                <div className="flex-1 space-y-6">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kandidat</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                        {previewSchedule.candidate?.full_name[0]}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 truncate">{previewSchedule.candidate?.full_name}</h3>
                        <p className="text-sm text-slate-500 truncate">{previewSchedule.candidate?.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Posisi</p>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Briefcase size={16} className="text-slate-400 shrink-0" />
                      <span className="font-medium truncate">{previewSchedule.candidate?.position}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-6 bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-100">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <CalendarIcon className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Waktu</p>
                        <p className="text-sm font-bold text-slate-900">
                          {formatDate(previewSchedule.schedule_date)}, {new Date(previewSchedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      {previewSchedule.location_type === 'online' ? <Globe className="text-emerald-500 mt-0.5 shrink-0" size={18} /> : <MapPin className="text-emerald-500 mt-0.5 shrink-0" size={18} />}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-400 uppercase">Lokasi ({previewSchedule.location_type})</p>
                        <p className="text-sm font-bold text-slate-900 break-words">{previewSchedule.location_detail || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Catatan Tambahan</p>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-700 leading-relaxed italic">
                  "{previewSchedule.additional_notes || 'Tidak ada catatan.'}"
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0">
              <button 
                onClick={() => {
                  if (previewSchedule.candidate) {
                    setEmailModalData({ candidate: previewSchedule.candidate, schedule: previewSchedule });
                  }
                }}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
              >
                <Send size={18} />
                Kirim Email
              </button>
              <button 
                onClick={() => {
                  if (previewSchedule.candidate) {
                    setWaModalData({ candidate: previewSchedule.candidate, schedule: previewSchedule });
                  }
                }}
                className="flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} />
                Kirim WA
              </button>
              <button 
                onClick={() => handleConfirm(previewSchedule.id, previewSchedule.is_confirmed)}
                className={cn(
                  "flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2",
                  previewSchedule.is_confirmed
                    ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    : "bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg shadow-cyan-200"
                )}
              >
                <CheckCircle2 size={18} />
                <span className="truncate">{previewSchedule.is_confirmed ? 'Batalkan Konfirmasi' : 'Konfirmasi Sudah Interview'}</span>
              </button>
              <button 
                onClick={() => setPreviewSchedule(null)}
                className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {isScheduling && (
        <SchedulingModal
          type="interview"
          onClose={() => setIsScheduling(false)}
          onSuccess={() => {
            setIsScheduling(false);
            if (viewMode === 'list') fetchSchedules();
            else fetchCalendarSchedules();
          }}
        />
      )}

      {emailModalData && (
        <SendEmailModal
          candidate={emailModalData.candidate}
          schedule={emailModalData.schedule}
          type="interview"
          onClose={() => setEmailModalData(null)}
        />
      )}

      {waModalData && (
        <SendWAModal
          candidate={waModalData.candidate}
          schedule={waModalData.schedule}
          type="interview"
          onClose={() => setWaModalData(null)}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          if (confirmModal.type === 'delete') {
            executeDelete(confirmModal.id);
          } else if (confirmModal.type === 'confirm') {
            executeConfirm(confirmModal.id, confirmModal.currentStatus || false);
          }
        }}
        title={confirmModal.type === 'delete' ? 'Hapus Jadwal' : 'Konfirmasi Kehadiran'}
        message={
          confirmModal.type === 'delete'
            ? 'Apakah Anda yakin ingin menghapus jadwal interview ini? Tindakan ini tidak dapat dibatalkan.'
            : `Apakah Anda yakin ingin ${!confirmModal.currentStatus ? 'mengonfirmasi bahwa kandidat ini sudah melakukan interview' : 'membatalkan konfirmasi interview'}?`
        }
        confirmText={confirmModal.type === 'delete' ? 'Hapus' : 'Ya, Konfirmasi'}
        variant={confirmModal.type === 'delete' ? 'danger' : 'primary'}
      />
    </div>
  );
}
