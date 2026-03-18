import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Users, 
  Briefcase, 
  UserCheck, 
  UserX,
  TrendingUp,
  Clock,
  Calendar,
  Filter,
  CheckCircle2,
  XCircle,
  Search,
  FileText,
  Star
} from 'lucide-react';
import { cn, formatDate } from '../lib/utils';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalApplications: 0,
    inPipeline: 0,
    hired: 0,
    rejected: 0,
    openPositions: 0,
    upcomingPsikotes: 0,
    upcomingInterview: 0
  });
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [topCandidatesByPosition, setTopCandidatesByPosition] = useState<Record<string, any[]>>({});
  const [topCandidatesByDetailed, setTopCandidatesByDetailed] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [positions, setPositions] = useState<string[]>([]);
  const [selectedPosition, setSelectedPosition] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch unique positions once on mount
  useEffect(() => {
    const fetchPositions = async () => {
      // Note: Supabase JS doesn't have a native SELECT DISTINCT. 
      // For 100k+ rows, this should ideally be an RPC call or a separate 'positions' table.
      // We limit to 1000 here to prevent crashing on huge datasets, assuming positions are repetitive.
      const { data } = await supabase.from('candidates').select('position').limit(1000);
      if (data) {
        const unique = Array.from(new Set(data.map(d => d.position))).filter(Boolean).sort();
        setPositions(unique);
      }
    };
    fetchPositions();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        let startDate: Date | null = null;
        if (dateFilter !== 'all') {
          const now = new Date();
          startDate = new Date();
          if (dateFilter === '7days') startDate.setDate(now.getDate() - 7);
          else if (dateFilter === '30days') startDate.setDate(now.getDate() - 30);
          else if (dateFilter === 'this_month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // Helper to build base query for counting
        const buildCountQuery = (table: string, select = '*') => {
          let q = supabase.from(table).select(select, { count: 'exact', head: true });
          if (selectedPosition !== 'all') q = q.eq('position', selectedPosition);
          if (startDate) q = q.gte('created_at', startDate.toISOString());
          if (searchQuery) q = q.ilike('full_name', `%${searchQuery}%`);
          return q;
        };

        // Helper to build base query for fetching data
        const buildDataQuery = (table: string, select = '*') => {
          let q = supabase.from(table).select(select);
          if (selectedPosition !== 'all') q = q.eq('position', selectedPosition);
          if (startDate) q = q.gte('created_at', startDate.toISOString());
          if (searchQuery) q = q.ilike('full_name', `%${searchQuery}%`);
          return q;
        };

        // Execute count queries in parallel (Server-Side Aggregation)
        const nowForQuery = new Date();
        const next7Days = new Date();
        next7Days.setDate(nowForQuery.getDate() + 7);

        const [
          { count: cTotal }, { count: lTotal },
          { count: cHired }, { count: lHired },
          { count: cRej }, { count: lRej },
          { count: cAcc }, { count: lAcc },
          { count: cPsi }, { count: lPsi },
          { count: cInt }, { count: lInt },
          { count: upcomingPsiCount },
          { count: upcomingIntCount }
        ] = await Promise.all([
          buildCountQuery('candidates'), buildCountQuery('candidate_logs'),
          buildCountQuery('candidates').eq('status_screening', 'hired'), buildCountQuery('candidate_logs').eq('status_screening', 'hired'),
          buildCountQuery('candidates').eq('status_screening', 'rejected'), buildCountQuery('candidate_logs').eq('status_screening', 'rejected'),
          buildCountQuery('candidates').in('status_screening', ['accepted', 'hired']), buildCountQuery('candidate_logs').in('status_screening', ['accepted', 'hired']),
          buildCountQuery('candidates', 'id, psikotes_schedules!inner(id)'), buildCountQuery('candidate_logs').eq('psikotes_status', 'Sudah Psikotes'),
          buildCountQuery('candidates', 'id, interview_schedules!inner(id)'), buildCountQuery('candidate_logs').eq('interview_status', 'Sudah Interview'),
          supabase.from('psikotes_schedules').select('*', { count: 'exact', head: true }).gte('schedule_date', nowForQuery.toISOString()).lte('schedule_date', next7Days.toISOString()),
          supabase.from('interview_schedules').select('*', { count: 'exact', head: true }).gte('schedule_date', nowForQuery.toISOString()).lte('schedule_date', next7Days.toISOString())
        ]);

        const totalApplied = (cTotal || 0) + (lTotal || 0);
        const hired = (cHired || 0) + (lHired || 0);
        const rejected = (cRej || 0) + (lRej || 0);
        const inPipeline = cTotal || 0; // Kandidat aktif = jumlah kandidat di tabel candidates
        const lolosScreening = (cAcc || 0) + (lAcc || 0);
        const totalPsikotes = (cPsi || 0) + (lPsi || 0);
        const totalInterview = (cInt || 0) + (lInt || 0);

        setStats({
          totalApplications: totalApplied,
          inPipeline,
          hired,
          rejected,
          openPositions: positions.length,
          upcomingPsikotes: upcomingPsiCount || 0,
          upcomingInterview: upcomingIntCount || 0
        });

        setFunnelData([
          { stage: 'Total Pelamar', count: totalApplied, color: 'bg-indigo-500', icon: Users },
          { stage: 'Lolos Screening', count: lolosScreening, color: 'bg-blue-500', icon: Filter },
          { stage: 'Tahap Psikotes', count: totalPsikotes, color: 'bg-amber-500', icon: TrendingUp },
          { stage: 'Tahap Interview', count: totalInterview, color: 'bg-purple-500', icon: Users },
          { stage: 'Direkrut', count: hired, color: 'bg-emerald-500', icon: CheckCircle2 },
        ]);

        // Fetch Recent Activities (Server-Side Limit)
        // We fetch top 10 from each relevant table/query, then merge and sort in JS.
        // This ensures we download max 40 rows instead of 100,000.
        const [
          { data: recentCands },
          { data: recentLogs },
          { data: recentPsi },
          { data: recentInt },
          { data: allActiveCandidates }
        ] = await Promise.all([
          buildDataQuery('candidates', 'id, full_name, position, created_at').order('created_at', { ascending: false }).limit(10),
          buildDataQuery('candidate_logs', 'id, full_name, position, created_at, status_screening').order('created_at', { ascending: false }).limit(10),
          supabase.from('psikotes_schedules').select('id, created_at, candidates!inner(id, full_name, position)').order('created_at', { ascending: false }).limit(10),
          supabase.from('interview_schedules').select('id, created_at, candidates!inner(id, full_name, position)').order('created_at', { ascending: false }).limit(10),
          supabase.from('candidates').select('id, full_name, email, position, assessment_score, status_screening, technical_score, communication_score, problem_solving_score, teamwork_score, leadership_score, adaptability_score').not('status_screening', 'in', '("rejected","hired")')
        ]);

        // Process Top Candidates
        if (allActiveCandidates) {
          const grouped: Record<string, any[]> = {};
          allActiveCandidates.forEach(c => {
            if (!grouped[c.position]) grouped[c.position] = [];
            
            const tech = c.technical_score || 0;
            const comm = c.communication_score || 0;
            const prob = c.problem_solving_score || 0;
            const team = c.teamwork_score || 0;
            const lead = c.leadership_score || 0;
            const adapt = c.adaptability_score || 0;
            const detailed_average = Math.round((tech + comm + prob + team + lead + adapt) / 6);

            grouped[c.position].push({
              ...c,
              detailed_average
            });
          });

          const top5: Record<string, any[]> = {};
          const top5Detailed: Record<string, any[]> = {};
          
          Object.keys(grouped).forEach(pos => {
            const sortedByScore = [...grouped[pos]].sort((a, b) => (b.assessment_score || 0) - (a.assessment_score || 0));
            if (sortedByScore.length > 0) {
              top5[pos] = sortedByScore.slice(0, 5);
            }
            
            const sortedByDetailed = [...grouped[pos]].sort((a, b) => (b.detailed_average || 0) - (a.detailed_average || 0));
            if (sortedByDetailed.length > 0) {
              top5Detailed[pos] = sortedByDetailed.slice(0, 5);
            }
          });
          setTopCandidatesByPosition(top5);
          setTopCandidatesByDetailed(top5Detailed);
        }

        let activities: any[] = [];

        (recentCands || []).forEach((c: any) => {
          activities.push({
            id: `app-${c.id}`, type: 'application', title: 'Kandidat baru mendaftar',
            name: c.full_name, position: c.position, date: new Date(c.created_at),
            icon: Users, color: 'text-blue-500', bgColor: 'bg-blue-50', path: 'screening'
          });
        });

        (recentLogs || []).forEach((l: any) => {
          if (l.status_screening === 'hired') {
            activities.push({
              id: `log-${l.id}`, type: 'hired', title: 'Kandidat Direkrut',
              name: l.full_name, position: l.position, date: new Date(l.created_at),
              icon: CheckCircle2, color: 'text-emerald-500', bgColor: 'bg-emerald-50', path: 'logs'
            });
          } else if (l.status_screening === 'rejected') {
            activities.push({
              id: `log-${l.id}`, type: 'rejected', title: 'Kandidat Ditolak',
              name: l.full_name, position: l.position, date: new Date(l.created_at),
              icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50', path: 'logs'
            });
          }
        });

        (recentPsi || []).forEach((p: any) => {
          if (p.candidates) {
            activities.push({
              id: `psi-${p.id}`, type: 'psikotes', title: 'Jadwal Psikotes dibuat',
              name: p.candidates.full_name, position: p.candidates.position, date: new Date(p.created_at),
              icon: FileText, color: 'text-amber-500', bgColor: 'bg-amber-50', path: 'psikotes'
            });
          }
        });

        (recentInt || []).forEach((i: any) => {
          if (i.candidates) {
            activities.push({
              id: `int-${i.id}`, type: 'interview', title: 'Jadwal Interview dibuat',
              name: i.candidates.full_name, position: i.candidates.position, date: new Date(i.created_at),
              icon: Calendar, color: 'text-purple-500', bgColor: 'bg-purple-50', path: 'interview'
            });
          }
        });

        activities.sort((a, b) => b.date.getTime() - a.date.getTime());
        setRecentActivities(activities.slice(0, 10));

      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedPosition, dateFilter, searchQuery, positions.length]);

  const statCards = [
    {
      title: 'Total Pelamar',
      value: stats.totalApplications,
      icon: Users,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600'
    },
    {
      title: 'Posisi Terbuka',
      value: stats.openPositions,
      icon: Briefcase,
      color: 'bg-indigo-500',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-600'
    },
    {
      title: 'Kandidat Aktif',
      value: stats.inPipeline,
      icon: Clock,
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600'
    },
    {
      title: 'Interview (7 Hari)',
      value: stats.upcomingInterview,
      icon: Calendar,
      color: 'bg-emerald-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600'
    },
    {
      title: 'Psikotes (7 Hari)',
      value: stats.upcomingPsikotes,
      icon: Calendar,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600'
    }
  ];

  if (loading && stats.totalApplications === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Dashboard
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Ringkasan aktivitas rekrutmen dan status kandidat.
          </p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Cari kandidat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white/70 backdrop-blur-md border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm w-full md:w-48"
            />
          </div>
          <select 
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            className="px-4 py-2 bg-white/70 backdrop-blur-md border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          >
            <option value="all">Semua Posisi</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
          <select 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 bg-white/70 backdrop-blur-md border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          >
            <option value="all">Semua Waktu</option>
            <option value="7days">7 Hari Terakhir</option>
            <option value="30days">30 Hari Terakhir</option>
            <option value="this_month">Bulan Ini</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {statCards.map((stat, index) => (
          <div 
            key={index}
            className="bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md"
          >
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", stat.bgColor)}>
              <stat.icon className={stat.textColor} size={28} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{stat.title}</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Top 5 Candidates Section */}
      {Object.keys(topCandidatesByPosition).length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Star className="text-amber-500 fill-amber-500" size={24} />
            Top 5 Kandidat Terkuat
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(topCandidatesByPosition).map(([pos, topCands]: [string, any]) => (
              <div key={pos} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="bg-gradient-to-r from-indigo-50 to-white border-b border-slate-100 p-5">
                  <h3 className="font-bold text-slate-800 text-lg">{pos}</h3>
                  <p className="text-xs text-slate-500 mt-1">Berdasarkan skor assessment tertinggi</p>
                </div>
                <div className="divide-y divide-slate-100 flex-1">
                  {topCands.map((c, idx) => (
                    <div 
                      key={c.id} 
                      onClick={() => navigate(`/candidates/${c.id}`)}
                      className={cn(
                        "p-4 flex items-center justify-between cursor-pointer transition-all group border-l-4 relative overflow-x-auto custom-scrollbar",
                        idx === 0 ? "bg-amber-50/50 hover:bg-amber-50 border-amber-400" : 
                        idx === 1 ? "bg-slate-50/80 hover:bg-slate-100 border-slate-300" : 
                        idx === 2 ? "bg-orange-50/30 hover:bg-orange-50 border-orange-300" : 
                        "bg-white hover:bg-slate-50 border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-4 min-w-max">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                          idx === 0 ? "bg-amber-100 text-amber-700" : 
                          idx === 1 ? "bg-slate-200 text-slate-700" : 
                          idx === 2 ? "bg-orange-100 text-orange-800" : 
                          "bg-indigo-50 text-indigo-600"
                        )}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-slate-900 whitespace-nowrap group-hover:text-indigo-600 transition-colors">{c.full_name}</p>
                            {idx < 3 && (
                              <div className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm border",
                                idx === 0 ? "bg-amber-100 text-amber-700 border-amber-200" :
                                idx === 1 ? "bg-slate-100 text-slate-700 border-slate-200" :
                                "bg-orange-100 text-orange-700 border-orange-200"
                              )}>
                                Top {idx + 1}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 whitespace-nowrap">{c.email}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-4 min-w-max">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Skor</span>
                        <span className="font-bold text-indigo-600 text-lg">{c.assessment_score || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 5 Detailed Average Section */}
      {Object.keys(topCandidatesByDetailed).length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Star className="text-indigo-500 fill-indigo-500" size={24} />
            Top 5 Rata-rata Asesmen Detail
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(topCandidatesByDetailed).map(([pos, topCands]: [string, any]) => (
              <div key={pos} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="bg-gradient-to-r from-indigo-50 to-white border-b border-slate-100 p-5">
                  <h3 className="font-bold text-slate-800 text-lg">{pos}</h3>
                  <p className="text-xs text-slate-500 mt-1">Berdasarkan rata-rata 6 kriteria asesmen</p>
                </div>
                <div className="divide-y divide-slate-100 flex-1">
                  {topCands.map((c, idx) => (
                    <div 
                      key={c.id} 
                      onClick={() => navigate(`/candidates/${c.id}`)}
                      className={cn(
                        "p-4 flex items-center justify-between cursor-pointer transition-all group border-l-4 relative overflow-x-auto custom-scrollbar",
                        idx === 0 ? "bg-indigo-50/50 hover:bg-indigo-50 border-indigo-400" : 
                        idx === 1 ? "bg-slate-50/80 hover:bg-slate-100 border-slate-300" : 
                        idx === 2 ? "bg-blue-50/30 hover:bg-blue-50 border-blue-300" : 
                        "bg-white hover:bg-slate-50 border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-4 min-w-max">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                          idx === 0 ? "bg-indigo-100 text-indigo-700" : 
                          idx === 1 ? "bg-slate-200 text-slate-700" : 
                          idx === 2 ? "bg-blue-100 text-blue-800" : 
                          "bg-slate-50 text-slate-600"
                        )}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-slate-900 whitespace-nowrap group-hover:text-indigo-600 transition-colors">{c.full_name}</p>
                            {idx < 3 && (
                              <div className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm border",
                                idx === 0 ? "bg-indigo-100 text-indigo-700 border-indigo-200" :
                                idx === 1 ? "bg-slate-100 text-slate-700 border-slate-200" :
                                "bg-blue-100 text-blue-700 border-blue-200"
                              )}>
                                Top {idx + 1}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 whitespace-nowrap">{c.email}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-4 min-w-max">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Rata-rata</span>
                        <span className="font-bold text-indigo-600 text-lg">{c.detailed_average || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Recruitment Funnel</h3>
            </div>
            <div className="space-y-4">
              {funnelData.map((stage, index) => {
                const maxCount = Math.max(...funnelData.map(d => d.count), 1);
                const width = `${(stage.count / maxCount) * 100}%`;
                
                return (
                  <div key={index} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <stage.icon size={16} className="text-slate-500" />
                        <span className="text-sm font-bold text-slate-700">{stage.stage}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{stage.count}</span>
                    </div>
                    <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-1000", stage.color)}
                        style={{ width }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-lg font-bold text-slate-900">10 Aktivitas Terbaru</h3>
          </div>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1 custom-scrollbar">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity, i) => {
                const isHighlight = i < 3;
                return (
                  <div 
                    key={activity.id} 
                    onClick={() => navigate(`/${activity.path}`)}
                    className={cn(
                      "flex items-start gap-4 p-3 rounded-xl transition-all cursor-pointer border",
                      isHighlight 
                        ? "bg-white border-indigo-100 shadow-sm hover:border-indigo-300 hover:shadow-md" 
                        : "bg-slate-50/50 border-transparent hover:bg-slate-50 hover:border-slate-200"
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", activity.bgColor)}>
                      <activity.icon size={18} className={activity.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-bold truncate", isHighlight ? "text-slate-900" : "text-slate-700")}>
                        {activity.title}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        <span className="font-medium text-slate-700">{activity.name}</span> • {activity.position}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap pt-1">
                      {formatDate(activity.date.toISOString())}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                <Clock size={32} className="text-slate-300 mb-2" />
                <p>Belum ada aktivitas</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
