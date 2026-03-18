import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, TrendingUp, Users, CheckCircle2, XCircle, Clock, Filter, ChevronDown, X, Mail, Calendar, MapPin } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { Candidate } from '../types';

interface FunnelData {
  stage: string;
  count: number;
  percentage: number;
  color: string;
  icon: any;
  candidates: any[];
}

export default function RecruitmentFunnel() {
  const [loading, setLoading] = useState(true);
  const [funnelData, setFunnelData] = useState<FunnelData[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<FunnelData | null>(null);
  const [monthlyMetrics, setMonthlyMetrics] = useState<{label: string, count: number, avgDaysToHire: number}[]>([]);
  const [pipelineEfficiency, setPipelineEfficiency] = useState<{stage: string, days: number}[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    accepted: 0,
    rejected: 0,
    pending: 0
  });

  // Fetch unique positions once on mount
  useEffect(() => {
    const fetchPositions = async () => {
      const [ { data: cData }, { data: lData } ] = await Promise.all([
        supabase.from('candidates').select('position').limit(1000),
        supabase.from('candidate_logs').select('position').limit(1000)
      ]);
      
      const allPositions = [...(cData || []), ...(lData || [])];
      const unique = Array.from(new Set(allPositions.map(d => d.position))).filter(Boolean).sort();
      setPositions(unique);
    };
    fetchPositions();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      if (dateFilter !== 'all') {
        if (dateFilter === 'custom') {
          if (customStartDate) {
            startDate = new Date(customStartDate);
            startDate.setHours(0, 0, 0, 0);
          }
          if (customEndDate) {
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);
          }
        } else {
          const now = new Date();
          startDate = new Date();
          if (dateFilter === '7days') startDate.setDate(now.getDate() - 7);
          else if (dateFilter === '30days') startDate.setDate(now.getDate() - 30);
          else if (dateFilter === 'this_month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          else if (dateFilter === 'this_year') startDate = new Date(now.getFullYear(), 0, 1);
        }
      }

      // Helper to build base query for counting
      const buildCountQuery = (table: string, select = '*') => {
        let q = supabase.from(table).select(select, { count: 'exact', head: true });
        if (selectedPosition !== 'all') q = q.eq('position', selectedPosition);
        if (startDate) q = q.gte('created_at', startDate.toISOString());
        if (endDate) q = q.lte('created_at', endDate.toISOString());
        return q;
      };

      // Helper to build base query for fetching data (limited to 50 for the detail view)
      const buildDataQuery = (table: string, select = '*') => {
        let q = supabase.from(table).select(select);
        if (selectedPosition !== 'all') q = q.eq('position', selectedPosition);
        if (startDate) q = q.gte('created_at', startDate.toISOString());
        if (endDate) q = q.lte('created_at', endDate.toISOString());
        return q;
      };

      // 1. Execute count queries in parallel (Server-Side Aggregation)
      const [
        { count: cTotal }, { count: lTotal },
        { count: cRej }, { count: lRej },
        { count: cAcc }, { count: lAcc },
        { count: cPsi }, { count: lPsi },
        { count: cInt }, { count: lInt },
        { count: cHired }, { count: lHired }
      ] = await Promise.all([
        buildCountQuery('candidates'), buildCountQuery('candidate_logs'),
        buildCountQuery('candidates').eq('status_screening', 'rejected'), buildCountQuery('candidate_logs').eq('status_screening', 'rejected'),
        buildCountQuery('candidates').in('status_screening', ['accepted', 'hired']), buildCountQuery('candidate_logs').in('status_screening', ['accepted', 'hired']),
        buildCountQuery('candidates', 'id, psikotes_schedules!inner(id)'), buildCountQuery('candidate_logs').eq('psikotes_status', 'Sudah Psikotes'),
        buildCountQuery('candidates', 'id, interview_schedules!inner(id)'), buildCountQuery('candidate_logs').eq('interview_status', 'Sudah Interview'),
        buildCountQuery('candidates').eq('status_screening', 'hired'), buildCountQuery('candidate_logs').eq('status_screening', 'hired')
      ]);

      const totalApplied = (cTotal || 0) + (lTotal || 0);
      const totalTidakLolos = (cRej || 0) + (lRej || 0);
      const totalLolosScreening = (cAcc || 0) + (lAcc || 0);
      const totalPsikotes = (cPsi || 0) + (lPsi || 0);
      const totalInterview = (cInt || 0) + (lInt || 0);
      const totalHired = (cHired || 0) + (lHired || 0);
      const totalPending = totalApplied - totalHired - totalTidakLolos;

      // 2. Fetch limited data for the detail view (Server-Side Pagination/Limit)
      // We limit to 50 to avoid crashing the browser if there are 100k records.
      const [
        { data: cData }, { data: lData },
        { data: cRejData }, { data: lRejData },
        { data: cAccData }, { data: lAccData },
        { data: cPsiData }, { data: lPsiData },
        { data: cIntData }, { data: lIntData },
        { data: cHiredData }, { data: lHiredData }
      ] = await Promise.all([
        buildDataQuery('candidates').limit(50), buildDataQuery('candidate_logs').limit(50),
        buildDataQuery('candidates').eq('status_screening', 'rejected').limit(50), buildDataQuery('candidate_logs').eq('status_screening', 'rejected').limit(50),
        buildDataQuery('candidates').in('status_screening', ['accepted', 'hired']).limit(50), buildDataQuery('candidate_logs').in('status_screening', ['accepted', 'hired']).limit(50),
        buildDataQuery('candidates', '*, psikotes_schedules!inner(id)').limit(50), buildDataQuery('candidate_logs').eq('psikotes_status', 'Sudah Psikotes').limit(50),
        buildDataQuery('candidates', '*, interview_schedules!inner(id)').limit(50), buildDataQuery('candidate_logs').eq('interview_status', 'Sudah Interview').limit(50),
        buildDataQuery('candidates').eq('status_screening', 'hired').limit(50), buildDataQuery('candidate_logs').eq('status_screening', 'hired').limit(50)
      ]);

      const data: FunnelData[] = [
        { 
          stage: 'Total Kandidat', 
          count: totalApplied, 
          percentage: 100, 
          color: 'bg-indigo-500', 
          icon: Users,
          candidates: [...(cData || []), ...(lData || [])]
        },
        { 
          stage: 'Tidak Lolos Screening', 
          count: totalTidakLolos, 
          percentage: totalApplied > 0 ? (totalTidakLolos / totalApplied) * 100 : 0, 
          color: 'bg-red-500', 
          icon: XCircle,
          candidates: [...(cRejData || []), ...(lRejData || [])]
        },
        { 
          stage: 'Lolos Screening', 
          count: totalLolosScreening, 
          percentage: totalApplied > 0 ? (totalLolosScreening / totalApplied) * 100 : 0, 
          color: 'bg-blue-500', 
          icon: Filter,
          candidates: [...(cAccData || []), ...(lAccData || [])]
        },
        { 
          stage: 'Tahap Psikotes', 
          count: totalPsikotes, 
          percentage: totalApplied > 0 ? (totalPsikotes / totalApplied) * 100 : 0, 
          color: 'bg-amber-500', 
          icon: TrendingUp,
          candidates: [...(cPsiData || []), ...(lPsiData || [])]
        },
        { 
          stage: 'Tahap Interview', 
          count: totalInterview, 
          percentage: totalApplied > 0 ? (totalInterview / totalApplied) * 100 : 0, 
          color: 'bg-purple-500', 
          icon: Users,
          candidates: [...(cIntData || []), ...(lIntData || [])]
        },
        { 
          stage: 'Diterima (Hired)', 
          count: totalHired, 
          percentage: totalApplied > 0 ? (totalHired / totalApplied) * 100 : 0, 
          color: 'bg-emerald-500', 
          icon: CheckCircle2,
          candidates: [...(cHiredData || []), ...(lHiredData || [])]
        },
      ];

      setFunnelData(data);
      setStats({
        total: totalApplied,
        accepted: totalHired,
        rejected: totalTidakLolos,
        pending: totalPending
      });

      // Calculate Monthly Metrics (Past 12 MTHS)
      // Note: True server-side aggregation for this requires an RPC.
      // We will fetch up to 1000 hired logs to estimate this to avoid crashing on 100k rows.
      const { data: recentHired } = await supabase
        .from('candidate_logs')
        .select('id, created_at, archived_at, updated_at, status_screening')
        .eq('status_screening', 'hired')
        .order('created_at', { ascending: false })
        .limit(1000);

      // Fetch schedules for efficiency calculation
      const [psikotesSchedules, interviewSchedules, activeCandidates] = await Promise.all([
        supabase.from('psikotes_schedules').select('candidate_id, created_at, schedule_date'),
        supabase.from('interview_schedules').select('candidate_id, created_at, schedule_date'),
        supabase.from('candidates').select('id, created_at')
      ]);

      const months: {label: string, month: number, year: number, count: number, totalDays: number}[] = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          label: d.toLocaleString('id-ID', { month: 'short' }) + ' ' + d.getFullYear().toString().slice(2),
          month: d.getMonth(),
          year: d.getFullYear(),
          count: 0,
          totalDays: 0
        });
      }
      
      (recentHired || []).forEach(c => {
        const date = new Date(c.archived_at || c.updated_at || c.created_at);
        const m = months.find(m => m.month === date.getMonth() && m.year === date.getFullYear());
        if (m) {
          m.count++;
          const appliedDate = new Date(c.created_at);
          const diffTime = Math.abs(date.getTime() - appliedDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          m.totalDays += diffDays;
        }
      });
      setMonthlyMetrics(months.map(m => ({ 
        label: m.label, 
        count: m.count,
        avgDaysToHire: m.count > 0 ? Math.round(m.totalDays / m.count) : 0
      })));

      // Pipeline Efficiency (Real-time Calculation)
      const candidateCreationMap = new Map();
      (activeCandidates.data || []).forEach(c => candidateCreationMap.set(c.id, c.created_at));
      (recentHired || []).forEach(c => candidateCreationMap.set(c.id, c.created_at));

      let totalScreeningDays = 0;
      let totalPsikotesDays = 0;
      let totalInterviewDays = 0;
      let totalHiredDays = 0;

      let screeningCount = 0;
      let psikotesCount = 0;
      let interviewCount = 0;
      let hiredCount = 0;

      // 1. Screening: Time from application to Psikotes/Interview schedule creation
      (psikotesSchedules.data || []).forEach(s => {
        const created = candidateCreationMap.get(s.candidate_id);
        if (created) {
          const diff = Math.ceil(Math.abs(new Date(s.created_at).getTime() - new Date(created).getTime()) / (1000 * 60 * 60 * 24));
          totalScreeningDays += diff;
          screeningCount++;
        }
      });

      // 2. Tahap Psikotes: Time from Schedule Creation to Schedule Date
      (psikotesSchedules.data || []).forEach(s => {
        const diff = Math.ceil(Math.abs(new Date(s.schedule_date).getTime() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24));
        totalPsikotesDays += diff;
        psikotesCount++;
      });

      // 3. Tahap Interview: Time from Schedule Creation to Schedule Date
      (interviewSchedules.data || []).forEach(s => {
        const diff = Math.ceil(Math.abs(new Date(s.schedule_date).getTime() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24));
        totalInterviewDays += diff;
        interviewCount++;
      });

      // 4. Total Waktu (Hired): Time from Application to Hired
      (recentHired || []).forEach(l => {
        const diff = Math.ceil(Math.abs(new Date(l.archived_at || l.updated_at).getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24));
        totalHiredDays += diff;
        hiredCount++;
      });

      setPipelineEfficiency([
        { stage: 'Screening Awal', days: screeningCount > 0 ? Math.round(totalScreeningDays / screeningCount) : 2 },
        { stage: 'Tahap Psikotes', days: psikotesCount > 0 ? Math.round(totalPsikotesDays / psikotesCount) : 5 },
        { stage: 'Tahap Interview', days: interviewCount > 0 ? Math.round(totalInterviewDays / interviewCount) : 7 },
        { stage: 'Total Waktu (Hired)', days: hiredCount > 0 ? Math.round(totalHiredDays / hiredCount) : 14 },
      ]);

    } catch (error) {
      console.error('Error fetching funnel data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedPosition, dateFilter, customStartDate, customEndDate]);

  const handleResetFilter = () => {
    setSelectedPosition('all');
    setDateFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  if (loading && funnelData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
        <p className="text-slate-500 font-medium">Menganalisa data rekrutmen...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Recruitment Funnel
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Analisa konversi kandidat dari pendaftaran hingga diterima.
          </p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {(selectedPosition !== 'all' || dateFilter !== 'all') && (
            <button
              onClick={handleResetFilter}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-2"
            >
              <X size={16} />
              Reset Filter
            </button>
          )}
          <div className="relative">
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none text-sm font-medium text-slate-700 shadow-sm min-w-[160px]"
            >
              <option value="all">Semua Posisi</option>
              {positions.map(pos => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          </div>
          
          <div className="flex gap-2">
            <div className="relative">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none text-sm font-medium text-slate-700 shadow-sm min-w-[160px]"
              >
                <option value="all">Semua Waktu</option>
                <option value="7days">7 Hari Terakhir</option>
                <option value="30days">30 Hari Terakhir</option>
                <option value="this_month">Bulan Ini</option>
                <option value="this_year">Tahun Ini</option>
                <option value="custom">Rentang Waktu</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>
            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                <input 
                  type="date" 
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-sm focus:outline-none text-slate-700"
                />
                <span className="text-slate-400">-</span>
                <input 
                  type="date" 
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-sm focus:outline-none text-slate-700"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Users size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Applied</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Diterima (Hired)</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.accepted}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <XCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Rejected</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Visual Funnel */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <h2 className="text-xl font-bold text-slate-900 mb-4 sm:mb-8 flex items-center gap-2">
            <TrendingUp className="text-indigo-600" />
            Visualisasi Corong Rekrutmen
          </h2>
          
          <div className="relative py-6 overflow-x-auto">
            <div className="min-w-[600px] space-y-6 max-w-2xl mx-auto px-4">
              {funnelData.map((item, index) => {
                const width = Math.max(item.percentage, 5); // Minimum 5% width for visibility
                
                return (
                  <div key={item.stage} className="relative group">
                    <div className="flex items-center gap-6">
                      {/* Stage Name & Count */}
                      <div className="w-48 text-right shrink-0">
                        <p className="text-sm font-bold text-slate-900">{item.stage}</p>
                        <p className="text-xs text-slate-500">{item.count} Kandidat</p>
                      </div>
                      
                      {/* Colored Bar Graph */}
                      <div className="flex-1 relative h-12 flex items-center justify-center bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={cn("absolute left-1/2 -translate-x-1/2 h-full transition-all duration-1000 rounded-full flex items-center justify-center", item.color)}
                          style={{ width: `${width}%` }}
                        >
                          {/* Only show percentage inside bar if it's wide enough, else show outside or just rely on tooltip/table */}
                          {width > 15 && (
                            <span className="text-white font-bold text-sm drop-shadow-md">
                              {item.percentage.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {width <= 15 && (
                          <span className="absolute z-10 text-slate-700 font-bold text-sm drop-shadow-sm">
                            {item.percentage.toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Drop-off Info */}
                      <div className="w-24 shrink-0">
                        {index > 0 && item.stage !== 'Tidak Lolos Screening' && (
                          <div className="flex flex-col items-start">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Drop-off</span>
                            <span className="text-xs font-bold text-red-500">
                              -{((funnelData[0].count - item.count) / (funnelData[0].count || 1) * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table Data */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-900">Detail Konversi</h2>
            <p className="text-xs text-slate-500 mt-1">Klik pada tahap untuk melihat detail kandidat.</p>
          </div>
          <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
            {funnelData.map((item) => (
              <button 
                key={item.stage} 
                onClick={() => setSelectedStage(item)}
                className="w-full text-left p-6 hover:bg-slate-50 transition-colors group focus:outline-none focus:bg-indigo-50/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg text-white transition-transform group-hover:scale-110", item.color)}>
                      <item.icon size={16} />
                    </div>
                    <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{item.stage}</span>
                  </div>
                  <span className="text-lg font-bold text-slate-900">{item.count}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all duration-1000", item.color)}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conversion Rate</span>
                  <span className="text-xs font-bold text-indigo-600">{item.percentage.toFixed(1)}%</span>
                </div>
              </button>
            ))}
          </div>
          <div className="p-6 bg-indigo-50 border-t border-indigo-100 shrink-0">
            <div className="flex items-start gap-3">
              <TrendingUp className="text-indigo-600 shrink-0" size={20} />
              <p className="text-xs text-indigo-700 leading-relaxed">
                <strong>Insight:</strong> Tingkat konversi akhir dari pendaftaran hingga diterima adalah 
                <span className="font-bold"> {funnelData[funnelData.length - 1]?.percentage.toFixed(1)}%</span>. 
                {funnelData[funnelData.length - 1]?.percentage < 5 ? ' Perlu evaluasi pada tahap screening awal untuk meningkatkan kualitas kandidat.' : ' Alur rekrutmen berjalan cukup efisien.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* New Metrics Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Monthly Metrics */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="text-indigo-600" />
              Monthly Metrics (Past 12 MTHS)
            </h2>
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-indigo-500"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Hired</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Days to Hire</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col justify-center gap-4 overflow-y-auto pr-2 max-h-[300px]">
            {monthlyMetrics.map((item, index) => {
              const maxCount = Math.max(...monthlyMetrics.map(m => m.count), 1);
              const maxDays = Math.max(...monthlyMetrics.map(m => m.avgDaysToHire), 1);
              const countWidth = Math.max((item.count / maxCount) * 100, 0);
              const daysWidth = Math.max((item.avgDaysToHire / maxDays) * 100, 0);
              
              return (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-16 text-xs font-bold text-slate-600 text-right shrink-0 leading-tight">
                    {item.label}
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    {/* Hired Bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                          style={{ width: `${countWidth}%` }} 
                        />
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 w-6">{item.count}</span>
                    </div>
                    {/* Days Bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                          style={{ width: `${daysWidth}%` }} 
                        />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 w-6">{item.avgDaysToHire}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pipeline Efficiency */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="text-indigo-600" />
              Pipeline Efficiency of Hiring
            </h2>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">
              Avg Days per Stage
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center space-y-6">
            {pipelineEfficiency.map((item, index) => {
              const maxDays = Math.max(...pipelineEfficiency.map(p => p.days), 1);
              const width = Math.max((item.days / maxDays) * 100, 5);
              
              return (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-slate-700">{item.stage}</span>
                    <span className="text-sm font-bold text-indigo-600">{item.days} Hari</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 transition-all duration-1000 rounded-full"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Detail Kandidat */}
      {selectedStage && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className={cn("p-3 rounded-xl text-white", selectedStage.color)}>
                  <selectedStage.icon size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Detail Kandidat: {selectedStage.stage}</h2>
                  <p className="text-sm text-slate-500">Total {selectedStage.count} kandidat pada tahap ini.</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStage(null)} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {selectedStage.candidates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedStage.candidates.map((candidate: any) => (
                    <div key={candidate.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">{candidate.full_name}</h3>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          candidate.status_screening === 'hired' ? "bg-indigo-100 text-indigo-700" :
                          candidate.status_screening === 'accepted' ? "bg-emerald-100 text-emerald-700" :
                          candidate.status_screening === 'rejected' ? "bg-red-100 text-red-700" :
                          candidate.status_screening === 'pending' ? "bg-amber-100 text-amber-700" :
                          "bg-slate-200 text-slate-700"
                        )}>
                          {candidate.status_screening}
                        </span>
                      </div>
                      
                      <div className="space-y-2 mt-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Mail size={14} className="text-slate-400" />
                          <span className="truncate">{candidate.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <MapPin size={14} className="text-slate-400" />
                          <span className="font-medium">{candidate.position}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Calendar size={14} className="text-slate-400" />
                          <span>Applied: {formatDate(candidate.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Users size={48} className="mb-4 opacity-20" />
                  <p className="text-lg font-medium">Tidak ada kandidat pada tahap ini.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 rounded-b-3xl">
              <button 
                onClick={() => setSelectedStage(null)}
                className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
