import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Globe, 
  FileText,
  Loader2,
  User
} from 'lucide-react';
import { Candidate, Schedule } from '../types';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/use-toast';
import { cn } from '../lib/utils';

interface SchedulingModalProps {
  candidate?: Candidate;
  type: 'psikotes' | 'interview';
  initialData?: Schedule;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SchedulingModal({ candidate, type, initialData, onClose, onSuccess }: SchedulingModalProps) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(candidate?.id || '');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [date, setDate] = useState(initialData ? new Date(initialData.schedule_date).toISOString().split('T')[0] : '');
  const [time, setTime] = useState(initialData ? new Date(initialData.schedule_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  const [locationType, setLocationType] = useState<'online' | 'offline'>(initialData?.location_type || 'online');
  const [locationDetail, setLocationDetail] = useState(initialData?.location_detail || '');
  const [notes, setNotes] = useState(initialData?.additional_notes || '');
  const [loading, setLoading] = useState(false);
  const [fetchingCandidates, setFetchingCandidates] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!candidate && !initialData) {
      const fetchCandidates = async () => {
        setFetchingCandidates(true);
        const tableName = type === 'psikotes' ? 'psikotes_schedules' : 'interview_schedules';
        
        // Fetch candidates and their schedules for this type to filter out those already scheduled
        const { data, error } = await supabase
          .from('candidates')
          .select(`
            *,
            schedules: ${tableName}(id)
          `)
          .in('status_screening', ['pending', 'invited', 'accepted'])
          .order('full_name', { ascending: true });
          
        if (!error && data) {
          // Only show candidates who don't have a schedule of this type yet
          const filtered = data.filter((c: any) => !c.schedules || c.schedules.length === 0);
          setCandidates(filtered);
        }
        setFetchingCandidates(false);
      };
      fetchCandidates();
    }
  }, [candidate, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId) {
      toast({ title: 'Error', description: 'Silakan pilih kandidat.', variant: 'destructive' });
      return;
    }
    if (!date || !time) {
      toast({ title: 'Error', description: 'Tanggal dan waktu wajib diisi.', variant: 'destructive' });
      return;
    }

    const scheduleDateObj = new Date(`${date}T${time}`);
    const now = new Date();

    // Only validate if it's a new schedule or if the date/time was changed
    const isDateChanged = initialData 
      ? new Date(initialData.schedule_date).getTime() !== scheduleDateObj.getTime()
      : true;

    if (isDateChanged && scheduleDateObj < now) {
      toast({ title: 'Error', description: 'Tanggal dan waktu tidak boleh di masa lalu.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const scheduleDate = scheduleDateObj.toISOString();
    const tableName = type === 'psikotes' ? 'psikotes_schedules' : 'interview_schedules';

    let result;
    if (initialData) {
      result = await supabase
        .from(tableName)
        .update({
          schedule_date: scheduleDate,
          location_type: locationType,
          location_detail: locationDetail,
          additional_notes: notes
        })
        .eq('id', initialData.id);
    } else {
      result = await supabase
        .from(tableName)
        .insert([{
          candidate_id: selectedCandidateId,
          schedule_date: scheduleDate,
          location_type: locationType,
          location_detail: locationDetail,
          additional_notes: notes
        }]);
    }

    if (result.error) {
      toast({ title: 'Error', description: result.error.message, variant: 'destructive' });
    } else {
      toast({ 
        title: 'Berhasil', 
        description: `Jadwal ${type === 'psikotes' ? 'Psikotes' : 'Interview'} telah ${initialData ? 'diperbarui' : 'disimpan'}.` 
      });
      onSuccess();
      onClose();
    }
    setLoading(false);
  };

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">{initialData ? 'Edit' : 'Buat'} Jadwal {type === 'psikotes' ? 'Psikotes' : 'Interview'}</h2>
            {candidate && (
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Kandidat: <span className="font-semibold text-indigo-600 truncate inline-block max-w-[200px] align-bottom">{candidate.full_name}</span></p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all shrink-0">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
            {!candidate && !initialData && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <User size={14} className="text-indigo-500" />
                  Pilih Kandidat
                </label>
                {fetchingCandidates ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="animate-spin" size={16} /> Memuat kandidat...
                  </div>
                ) : (
                  <select
                    required
                    value={selectedCandidateId}
                    onChange={(e) => setSelectedCandidateId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    <option value="">-- Pilih Kandidat --</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} - {c.position}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <CalendarIcon size={14} className="text-indigo-500" />
                Tanggal
              </label>
              <input 
                type="date" 
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Clock size={14} className="text-indigo-500" />
                Waktu
              </label>
              <input 
                type="time" 
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Tipe Lokasi</label>
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setLocationType('online')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all",
                  locationType === 'online' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Globe size={16} />
                Online
              </button>
              <button
                type="button"
                onClick={() => setLocationType('offline')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all",
                  locationType === 'offline' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <MapPin size={16} />
                Offline
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <MapPin size={14} className="text-indigo-500" />
              Detail Lokasi / Link Meeting
            </label>
            <input 
              type="text" 
              placeholder={locationType === 'online' ? "Link Zoom/GMeet" : "Alamat Kantor / Ruangan"}
              value={locationDetail}
              onChange={(e) => setLocationDetail(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <FileText size={14} className="text-indigo-500" />
              Catatan Tambahan
            </label>
            <textarea 
              rows={3}
              placeholder="Instruksi khusus untuk kandidat..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
            />
          </div>
          </div>

          <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl bg-white hover:bg-slate-50 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : initialData ? 'Perbarui Jadwal' : 'Simpan Jadwal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
