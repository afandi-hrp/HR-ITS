import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Candidate } from '../types';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Briefcase, 
  GraduationCap, 
  Star, 
  AlertTriangle, 
  Lightbulb, 
  FileText, 
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  User,
  ThumbsUp,
  ThumbsDown,
  Download,
  Users
} from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { useToast } from '../components/ui/use-toast';
import {
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip
} from 'recharts';

export default function CandidateProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchCandidate(id);
    }
  }, [id]);

  const fetchCandidate = async (candidateId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('candidates')
      .select('*, psikotes_schedules(id, is_confirmed, schedule_date), interview_schedules(id, is_confirmed, schedule_date)')
      .eq('id', candidateId)
      .single();

    if (error || !data) {
      // Try fetching from candidate_logs if not found in active candidates
      const { data: logData, error: logError } = await supabase
        .from('candidate_logs')
        .select('*')
        .eq('id', candidateId)
        .single();

      if (logError || !logData) {
        toast({ title: 'Error', description: 'Gagal memuat profil kandidat', variant: 'destructive' });
        navigate('/screening');
      } else {
        setCandidate(logData);
      }
    } else {
      setCandidate(data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <User className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Kandidat Tidak Ditemukan</h2>
        <p className="text-slate-500 mb-6">Profil kandidat yang Anda cari tidak ada atau telah dihapus.</p>
        <button 
          onClick={() => navigate('/screening')}
          className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Kembali ke Screening
        </button>
      </div>
    );
  }

  // Calculate average score from detailed assessment scores
  const techScore = candidate.technical_score || 0;
  const commScore = candidate.communication_score || 0;
  const probScore = candidate.problem_solving_score || 0;
  const teamScore = candidate.teamwork_score || 0;
  const leadScore = candidate.leadership_score || 0;
  const adaptScore = candidate.adaptability_score || 0;

  const totalScore = techScore + commScore + probScore + teamScore + leadScore + adaptScore;
  const averageScore = Math.round(totalScore / 6);

  const radarData = [
    { subject: 'Technical', A: techScore },
    { subject: 'Communication', A: commScore },
    { subject: 'Problem Solving', A: probScore },
    { subject: 'Teamwork', A: teamScore },
    { subject: 'Leadership', A: leadScore },
    { subject: 'Adaptability', A: adaptScore },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'hired': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'accepted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'rejected': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'invited': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'hired': return 'Hired';
      case 'accepted': return 'Lolos';
      case 'rejected': return 'Ditolak';
      case 'invited': return 'Diundang';
      default: return 'Menunggu';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Profil Kandidat</h1>
            <p className="text-slate-500 text-sm mt-1">Detail informasi dan hasil asesmen kandidat</p>
          </div>
        </div>
        <div className={cn("px-4 py-1.5 rounded-full border text-sm font-bold uppercase tracking-wider", getStatusColor(candidate.status_screening))}>
          {getStatusText(candidate.status_screening)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Basic Info */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-indigo-500 to-violet-500"></div>
            <div className="px-6 pb-6 relative">
              <div className="w-20 h-20 bg-white rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-3xl font-bold text-indigo-600 absolute -top-10 bg-gradient-to-br from-indigo-50 to-white">
                {candidate.full_name.charAt(0)}
              </div>
              <div className="pt-14">
                <h2 className="text-2xl font-bold text-slate-900">{candidate.full_name}</h2>
                <div className="flex items-center gap-2 text-indigo-600 font-medium mt-1">
                  <Briefcase size={16} />
                  <span>{candidate.position}</span>
                </div>
                
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Mail size={16} className="text-slate-400" />
                    <a href={`mailto:${candidate.email}`} className="hover:text-indigo-600 transition-colors">{candidate.email}</a>
                  </div>
                  {candidate.phone && (
                    <div className="flex items-center gap-3 text-slate-600">
                      <Phone size={16} className="text-slate-400" />
                      <a href={`tel:${candidate.phone}`} className="hover:text-indigo-600 transition-colors">{candidate.phone}</a>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-slate-600">
                    <CalendarIcon size={16} className="text-slate-400" />
                    <span>Melamar pada {formatDate(candidate.date)}</span>
                  </div>
                </div>

                {candidate.resume_url && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <a 
                      href={candidate.resume_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-medium transition-colors"
                    >
                      <Download size={18} />
                      Unduh CV / Resume
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Assessment Score Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Star className="text-amber-500" size={20} />
              Skor Asesmen
            </h3>
            
            <div className="flex items-end gap-2 mb-6">
              <span className="text-5xl font-black text-slate-900">{averageScore}</span>
              <span className="text-lg text-slate-500 font-medium mb-1">/ 100</span>
            </div>

            {/* Radar Chart */}
            <div className="h-64 w-full -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Skor" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#4f46e5', fontWeight: 'bold' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Experience & Education */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Briefcase className="text-indigo-500" size={20} />
                  Pengalaman Kerja
                </h3>
                {candidate.work_experience ? (
                  <div className="prose prose-sm text-slate-600 whitespace-pre-wrap">
                    {candidate.work_experience}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-sm">Tidak ada data pengalaman kerja.</p>
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <GraduationCap className="text-indigo-500" size={20} />
                  Pendidikan
                </h3>
                {candidate.education ? (
                  <div className="prose prose-sm text-slate-600 whitespace-pre-wrap">
                    {candidate.education}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-sm">Tidak ada data pendidikan.</p>
                )}
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Lightbulb className="text-indigo-500" size={20} />
                Keahlian (Skills)
              </h3>
              {candidate.skills ? (
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.split(',').map((skill, index) => (
                    <span key={index} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-sm">Tidak ada data keahlian.</p>
              )}
            </div>
          </div>

          {/* Assessment Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <FileText className="text-indigo-500" size={20} />
              Hasil Evaluasi & Analisis
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                <h4 className="font-bold text-emerald-800 flex items-center gap-2 mb-2">
                  <ThumbsUp size={16} />
                  Kekuatan (Strengths)
                </h4>
                <p className="text-sm text-emerald-700 whitespace-pre-wrap">
                  {candidate.strengths || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
              
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                <h4 className="font-bold text-rose-800 flex items-center gap-2 mb-2">
                  <ThumbsDown size={16} />
                  Kelemahan (Weaknesses)
                </h4>
                <p className="text-sm text-rose-700 whitespace-pre-wrap">
                  {candidate.weaknesses || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
              
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} />
                  Faktor Risiko
                </h4>
                <p className="text-sm text-amber-700 whitespace-pre-wrap">
                  {candidate.risk_factors || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
              
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-2">
                  <Star size={16} />
                  Potensi
                </h4>
                <p className="text-sm text-blue-700 whitespace-pre-wrap">
                  {candidate.potential_factors || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2">Alasan Penilaian</h4>
              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {candidate.assessment_reason || <span className="italic text-slate-400">Tidak ada alasan penilaian yang diberikan.</span>}
              </p>
            </div>
          </div>

          {/* Schedules */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <CalendarIcon className="text-indigo-500" size={20} />
              Jadwal & Status
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 text-sm">Psikotes</h4>
                  {candidate.psikotes_schedules && candidate.psikotes_schedules.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {candidate.psikotes_schedules.map((schedule, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Clock size={14} />
                            <span>{formatDate(schedule.schedule_date)}</span>
                          </div>
                          {schedule.is_confirmed ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-md">
                              <CheckCircle size={12} /> Selesai
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium text-xs bg-amber-50 px-2 py-1 rounded-md">
                              Menunggu
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : candidate.psikotes_status ? (
                    <p className="text-sm text-slate-500 mt-1">Status: <span className="font-medium text-slate-700">{candidate.psikotes_status}</span></p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">Belum ada jadwal psikotes.</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                  <Users size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 text-sm">Interview</h4>
                  {candidate.interview_schedules && candidate.interview_schedules.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {candidate.interview_schedules.map((schedule, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Clock size={14} />
                            <span>{formatDate(schedule.schedule_date)}</span>
                          </div>
                          {schedule.is_confirmed ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-md">
                              <CheckCircle size={12} /> Selesai
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium text-xs bg-amber-50 px-2 py-1 rounded-md">
                              Menunggu
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : candidate.interview_status ? (
                    <p className="text-sm text-slate-500 mt-1">Status: <span className="font-medium text-slate-700">{candidate.interview_status}</span></p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">Belum ada jadwal interview.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
