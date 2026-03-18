import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  RefreshCcw,
  Briefcase,
  FileText,
  GraduationCap,
  Send
} from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import { cn } from '../lib/utils';

interface OpenRecruitment {
  id: string;
  position: string;
  jobdesk: string;
  kualifikasi: string;
  created_at: string;
}

export default function OpenRecruitment() {
  const [items, setItems] = useState<OpenRecruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    position: '',
    jobdesk: '',
    kualifikasi: ''
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('open_recruitment')
        .select('*')
        .order('created_at', { ascending: false });

      if (search) {
        query = query.ilike('position', `%${search}%`);
      }

      const { data, error } = await query;

      if (error) {
        // If table doesn't exist, it will throw an error. We handle it gracefully.
        if (error.code === '42P01') {
          toast({ 
            title: 'Tabel Belum Dibuat', 
            description: 'Tabel open_recruitment belum ada di database Supabase Anda. Silakan jalankan SQL query yang diperlukan.',
            variant: 'destructive'
          });
        } else {
          throw error;
        }
      } else {
        setItems(data || []);
      }
    } catch (error: any) {
      console.error('Error fetching open recruitment:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchItems();
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validasi input tidak boleh kosong atau hanya spasi
    if (!formData.position.trim() || !formData.jobdesk.trim() || !formData.kualifikasi.trim()) {
      toast({ 
        title: 'Validasi Gagal', 
        description: 'Pastikan Posisi, Jobdesk, dan Kualifikasi telah diisi dengan benar.', 
        variant: 'destructive' 
      });
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from('open_recruitment')
          .update({
            position: formData.position,
            jobdesk: formData.jobdesk,
            kualifikasi: formData.kualifikasi
          })
          .eq('id', editingId);

        if (error) throw error;
        toast({ title: 'Berhasil', description: 'Data lowongan berhasil diperbarui.' });
      } else {
        const { error } = await supabase
          .from('open_recruitment')
          .insert([{
            position: formData.position,
            jobdesk: formData.jobdesk,
            kualifikasi: formData.kualifikasi
          }]);

        if (error) throw error;
        toast({ title: 'Berhasil', description: 'Data lowongan berhasil ditambahkan.' });
      }

      setIsModalOpen(false);
      setFormData({ position: '', jobdesk: '', kualifikasi: '' });
      setEditingId(null);
      fetchItems();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('open_recruitment')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Berhasil', description: 'Data lowongan berhasil dihapus.' });
      setDeleteConfirmId(null);
      
      // Ambil data terbaru setelah dihapus
      const { data: newData } = await supabase
        .from('open_recruitment')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (newData) {
        setItems(newData);
        
        // Auto-sync ke n8n setelah hapus
        const { data: { user } } = await supabase.auth.getUser();
        const webhookUrl = user?.user_metadata?.sheet_webhook_url;
        
        if (webhookUrl) {
          fetch('/api/n8n/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webhookUrl,
              payload: {
                event: 'sync_open_recruitment',
                action: 'auto_sync_after_delete',
                deletedId: id,
                data: newData, // Mengirim full data terbaru
                timestamp: new Date().toISOString()
              }
            }),
          }).catch(console.error);
        }
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEdit = (item: OpenRecruitment) => {
    setFormData({
      position: item.position,
      jobdesk: item.jobdesk,
      kualifikasi: item.kualifikasi
    });
    setEditingId(item.id);
    setIsModalOpen(true);
  };

  const handleSyncGoogleSheets = async () => {
    setSyncing(true);
    try {
      // Fetch n8n webhook URL from user settings
      const { data: { user } } = await supabase.auth.getUser();
      const webhookUrl = user?.user_metadata?.sheet_webhook_url;

      if (!webhookUrl) {
        toast({ 
          title: 'Webhook Belum Diatur', 
          description: 'Silakan atur URL Webhook Google Sheets di menu Pengaturan terlebih dahulu.',
          variant: 'destructive'
        });
        setSyncing(false);
        return;
      }

      // Send data to n8n
      const response = await fetch('/api/n8n/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl,
          payload: {
            event: 'sync_open_recruitment',
            data: items,
            timestamp: new Date().toISOString()
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Gagal mengirim data ke n8n');
      }

      toast({ 
        title: 'Berhasil', 
        description: 'Data berhasil dikirim ke n8n untuk sinkronisasi Google Sheets.' 
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Open Recruitment
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Kelola daftar lowongan pekerjaan yang sedang dibuka.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => {
              toast({
                title: "Panduan Integrasi Google Sheets",
                description: "Agar data yang dihapus di aplikasi juga terhapus di Google Sheets:\n\n1. Node 1: Webhook (Trigger)\n2. Node 2: Google Sheets (Operation: Clear) -> Hapus semua data lama di sheet.\n3. Node 3: Item Lists (Split Out Items) -> Pecah array 'data'.\n4. Node 4: Google Sheets (Operation: Append Row) -> Masukkan data terbaru.",
                duration: 15000,
              });
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold rounded-xl transition-all shadow-sm"
          >
            <FileText size={18} />
            Panduan Sync
          </button>
          <button 
            onClick={handleSyncGoogleSheets}
            disabled={syncing || items.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold rounded-xl transition-all shadow-sm border border-emerald-200 disabled:opacity-50"
          >
            {syncing ? <RefreshCcw size={18} className="animate-spin" /> : <Send size={18} />}
            Sync ke Google Sheets
          </button>
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({ position: '', jobdesk: '', kualifikasi: '' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 font-bold rounded-xl transition-all shadow-md shadow-indigo-200 hover:-translate-y-0.5"
          >
            <Plus size={18} />
            Tambah Lowongan
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari posisi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          />
        </div>
        <button 
          onClick={fetchItems}
          className="p-2.5 text-slate-500 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 rounded-xl transition-all"
          title="Refresh Data"
        >
          <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Data Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <RefreshCcw className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Belum ada lowongan</h3>
          <p className="text-slate-500 mb-6">Tambahkan lowongan pekerjaan baru untuk mulai merekrut.</p>
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({ position: '', jobdesk: '', kualifikasi: '' });
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition-all"
          >
            <Plus size={18} />
            Tambah Lowongan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div key={item.id} className="bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all duration-300 flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <Briefcase size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{item.position}</h3>
                    <p className="text-xs text-slate-500">Dibuat: {new Date(item.created_at).toLocaleDateString('id-ID')}</p>
                  </div>
                </div>
              </div>
              <div className="p-5 flex-1 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-slate-400" />
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jobdesk</h4>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.jobdesk}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GraduationCap size={14} className="text-slate-400" />
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kualifikasi</h4>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.kualifikasi}</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                <button 
                  onClick={() => handleEdit(item)}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => setDeleteConfirmId(item.id)}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Hapus"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingId ? 'Edit Lowongan' : 'Tambah Lowongan Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">Isi detail posisi yang dibuka</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <Plus className="rotate-45" size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="recruitment-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Posisi (Position)
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="Contoh: Frontend Developer"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Deskripsi Pekerjaan (Jobdesk)
                  </label>
                  <textarea
                    required
                    value={formData.jobdesk}
                    onChange={(e) => setFormData({ ...formData, jobdesk: e.target.value })}
                    placeholder="Jelaskan tugas dan tanggung jawab..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[120px] text-sm resize-y transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Kualifikasi
                  </label>
                  <textarea
                    required
                    value={formData.kualifikasi}
                    onChange={(e) => setFormData({ ...formData, kualifikasi: e.target.value })}
                    placeholder="Jelaskan syarat dan kualifikasi yang dibutuhkan..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[120px] text-sm resize-y transition-all"
                  />
                </div>
              </form>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                form="recruitment-form"
                disabled={saving}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><RefreshCcw size={18} className="animate-spin" /> Menyimpan...</>
                ) : (
                  'Simpan Lowongan'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 mb-2">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Hapus Lowongan?</h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menghapus lowongan ini? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
