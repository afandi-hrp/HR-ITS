import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { EmailTemplate } from '../types';
import { Search, Plus, Mail, Trash2, Edit2, RefreshCcw, X, Save, Loader2 } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';

export default function Templates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body_html: ''
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchTemplates = async () => {
    setLoading(true);
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    let query = supabase
      .from('email_templates')
      .select('*', { count: 'exact' });

    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,subject.ilike.%${debouncedSearch}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setTemplates(data || []);
      setTotalItems(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, [currentPage, itemsPerPage, debouncedSearch]);

  const handleOpenModal = (template?: EmailTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        subject: template.subject,
        body_html: template.body_html
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        subject: '',
        body_html: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.subject || !formData.body_html) {
      toast({ title: 'Peringatan', description: 'Semua field harus diisi.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = editingTemplate 
      ? await supabase.from('email_templates').update(formData).eq('id', editingTemplate.id)
      : await supabase.from('email_templates').insert([formData]);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: `Template berhasil ${editingTemplate ? 'diperbarui' : 'disimpan'}.` });
      setIsModalOpen(false);
      fetchTemplates();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus template ini?')) return;
    
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: 'Template berhasil dihapus.' });
      fetchTemplates();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Template Email
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Kelola template pesan untuk korespondensi kandidat.
          </p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
        >
          <Plus size={20} />
          Tambah Template
        </button>
      </div>

      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          />
        </div>
        <button 
          onClick={fetchTemplates}
          className="p-2.5 text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
        >
          <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <div 
            key={template.id} 
            onClick={() => handleOpenModal(template)}
            className="bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-500 hover:ring-2 hover:ring-indigo-200 hover:shadow-md transition-all group cursor-pointer flex flex-col"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Mail size={20} />
              </div>
              <h3 className="font-bold text-slate-900 truncate">{template.name}</h3>
            </div>
            <div className="space-y-2 mb-6 flex-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subjek</p>
              <p className="text-sm text-slate-600 line-clamp-2">{template.subject}</p>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
              <span className="text-xs text-slate-400">Dibuat: {new Date(template.created_at).toLocaleDateString()}</span>
              <div className="flex gap-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(template.id);
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Hapus Template"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {templates.length === 0 && !loading && (
          <div className="col-span-full text-center py-20 bg-white/70 backdrop-blur-md rounded-2xl border border-dashed border-slate-300">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <Mail className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Belum ada template</h3>
            <p className="text-slate-500">Buat template email pertama Anda untuk mempercepat screening.</p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalItems > itemsPerPage && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-6">
          <div className="text-sm text-slate-500">
            Menampilkan <span className="font-medium text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> hingga <span className="font-medium text-slate-900">{Math.min(currentPage * itemsPerPage, totalItems)}</span> dari <span className="font-medium text-slate-900">{totalItems}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Sebelumnya
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, Math.ceil(totalItems / itemsPerPage)) }, (_, i) => {
                let pageNum = currentPage;
                const totalPages = Math.ceil(totalItems / itemsPerPage);
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
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              disabled={currentPage === Math.ceil(totalItems / itemsPerPage)}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                  <Mail size={20} />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">{editingTemplate ? 'Edit Template' : 'Tambah Template Baru'}</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all shrink-0">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nama Template</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Undangan Interview Tahap 1"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Subject Email</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Contoh: Undangan Interview - {{posisi}}"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Isi Pesan Email</label>
                <textarea
                  value={formData.body_html}
                  onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                  placeholder="Ketik isi email di sini..."
                  rows={8}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm resize-none leading-relaxed"
                />
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 mt-2">
                  <p className="text-[10px] sm:text-xs text-amber-700 font-medium leading-relaxed">
                    Gunakan variabel berikut untuk isi otomatis: <br/>
                    <code className="bg-white px-1 rounded">{"{{nama}}"}</code> - Nama Kandidat <br/>
                    <code className="bg-white px-1 rounded">{"{{email_kandidat}}"}</code> - Email Kandidat <br/>
                    <code className="bg-white px-1 rounded">{"{{posisi}}"}</code> - Posisi Dilamar <br/>
                    <code className="bg-white px-1 rounded">{"{{pendidikan_terakhir}}"}</code> - Pendidikan <br/>
                    <code className="bg-white px-1 rounded">{"{{pengalaman_kerja}}"}</code> - Pengalaman <br/>
                    <code className="bg-white px-1 rounded">{"{{jadwal}}"}</code> - Waktu & Lokasi (Umum) <br/>
                    <code className="bg-white px-1 rounded">{"{{jadwal_interview}}"}</code> - Detail Interview <br/>
                    <code className="bg-white px-1 rounded">{"{{jadwal_psikotes}}"}</code> - Detail Psikotes
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                {saving ? 'Menyimpan...' : 'Simpan Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
