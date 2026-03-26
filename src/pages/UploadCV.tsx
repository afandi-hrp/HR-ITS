import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, Loader2, X, AlertCircle, Search, RefreshCcw, Mail, Calendar, User, Trash2, File, Plus, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/use-toast';
import { cn, fetchWithRetry } from '../lib/utils';
import BulkUploadModal from '../components/BulkUploadModal';

interface CVUpload {
  id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  file_name: string;
  mime_type: string;
  uploaded_at: string;
  sender_name: string;
  sender_email: string;
}

export default function UploadCV() {
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [position, setPosition] = useState('');
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploads, setUploads] = useState<CVUpload[]>([]);
  const [fetchingUploads, setFetchingUploads] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUploads, setSelectedUploads] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUploads = async () => {
    setFetchingUploads(true);
    try {
      const response = await fetchWithRetry(`/api/cv-uploads?search=${encodeURIComponent(debouncedSearch)}&page=${currentPage}&limit=${itemsPerPage}`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const result = await response.json();
        setUploads(result.data || []);
        setTotalItems(result.count || 0);
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching uploads:', error);
    } finally {
      setFetchingUploads(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetchWithRetry('/api/cv-uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) throw new Error('Gagal menghapus riwayat');
      
      toast({ title: 'Berhasil', description: 'Riwayat berhasil dihapus.' });
      setSelectedUploads(prev => prev.filter(selectedId => selectedId !== id));
      fetchUploads();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUploads.length === 0) return;
    
    try {
      const response = await fetchWithRetry('/api/cv-uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedUploads }),
      });
      if (!response.ok) throw new Error('Gagal menghapus riwayat');
      
      toast({ title: 'Berhasil', description: `${selectedUploads.length} riwayat berhasil dihapus.` });
      setSelectedUploads([]);
      fetchUploads();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedUploads(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUploads.length === uploads.length) {
      setSelectedUploads([]);
    } else {
      setSelectedUploads(uploads.map(u => u.id));
    }
  };

  useEffect(() => {
    fetchUploads();
  }, [currentPage, itemsPerPage, debouncedSearch]);

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const { data, error } = await supabase
          .from('open_recruitment')
          .select('position')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching positions:', error);
        } else if (data) {
          const positions = Array.from(new Set(data.map(item => item.position)));
          setAvailablePositions(positions);
          if (positions.length > 0 && !position) {
            setPosition(positions[0]);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPositions(false);
      }
    };

    fetchPositions();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files) as File[];
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      
      const validFiles = selectedFiles.filter(f => allowedTypes.includes(f.type) && f.size <= 5 * 1024 * 1024);
      const invalidFiles = selectedFiles.filter(f => !allowedTypes.includes(f.type) || f.size > 5 * 1024 * 1024);

      if (invalidFiles.length > 0) {
        toast({ 
          title: 'Beberapa File Ditolak', 
          description: 'Hanya file PDF/Word di bawah 5MB yang diperbolehkan.',
          variant: 'destructive' 
        });
      }

      if (validFiles.length > 0) {
        setFiles(prev => [...prev, ...validFiles]);
      }
      
      // Reset input value so the same file can be selected again
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast({ title: 'Peringatan', description: 'Silakan pilih minimal 1 file.', variant: 'destructive' });
      return;
    }
    if (!candidateName || !candidateEmail || !position) {
      toast({ title: 'Peringatan', description: 'Silakan isi semua data kandidat.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setUploadProgress({ current: 0, total: files.length });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const webhookUrl = user?.user_metadata?.cv_webhook_url;

      if (!webhookUrl) {
        toast({ 
          title: 'Konfigurasi Diperlukan', 
          description: 'Silakan atur n8n CV Upload Webhook URL di menu Pengaturan terlebih dahulu.',
          variant: 'destructive' 
        });
        setLoading(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      const { data: { session } } = await supabase.auth.getSession();

      for (const file of files) {
        const formData = new FormData();
        formData.append('candidateName', candidateName);
        formData.append('candidateEmail', candidateEmail);
        formData.append('candidatePosition', position);
        formData.append('fileName', file.name);
        formData.append('mimeType', file.type);
        formData.append('uploadedAt', new Date().toISOString());
        formData.append('senderName', user?.user_metadata?.full_name || 'User');
        formData.append('senderEmail', user?.email || '');
        formData.append('file', file);

        try {
          const response = await fetchWithRetry('/api/n8n/upload-cv', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Gagal mengirim ke n8n: ${response.statusText}`);
          }
          
          successCount++;
        } catch (err) {
          console.error('Error uploading CV:', err);
          errorCount++;
        }
        
        setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }

      if (successCount > 0) {
        toast({ 
          title: 'Berhasil', 
          description: 'CV Berhasil di Upload' 
        });
      }
      if (errorCount > 0) {
        toast({ 
          title: 'Error', 
          description: `${errorCount} CV gagal dikirim.`, 
          variant: 'destructive' 
        });
      }
      
      // Reset files and fields
      setFiles([]);
      setCandidateName('');
      setCandidateEmail('');
      setPosition('');
      
      // Refresh list
      fetchUploads();
      
    } catch (error: any) {
      console.error('Error uploading CV:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Gagal mengunggah CV. Periksa koneksi n8n Anda.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Upload CV Kandidat
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Unggah file CV dan teruskan ke workflow n8n Anda.
          </p>
        </div>
        <button
          onClick={() => setIsBulkModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold rounded-xl transition-all shadow-sm"
        >
          <Plus size={18} />
          Upload Massal
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Form */}
        <div className="space-y-6">
          <form onSubmit={handleUpload} className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 shadow-2xl overflow-hidden">
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nama Kandidat</label>
                  <input
                    type="text"
                    required
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Masukkan nama lengkap..."
                    className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email Kandidat</label>
                  <input
                    type="email"
                    required
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="kandidat@email.com"
                    className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Posisi Dilamar</label>
                  {loadingPositions ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                      <Loader2 className="animate-spin" size={16} /> Memuat posisi...
                    </div>
                  ) : availablePositions.length > 0 ? (
                    <select
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="block w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium appearance-none"
                    >
                      <option value="" disabled>Pilih Posisi</option>
                      {availablePositions.map((pos, idx) => (
                        <option key={idx} value={pos}>{pos}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="Contoh: Frontend Developer"
                      className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">File CV (PDF/DOC)</label>
                <div 
                  className={cn(
                    "relative border-2 border-dashed rounded-2xl p-10 transition-all flex flex-col items-center justify-center gap-4",
                    files.length > 0 ? "border-emerald-300 bg-emerald-50/50" : "border-white/60 bg-white/40 hover:border-indigo-300 hover:bg-white/60"
                  )}
                >
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  
                  {files.length > 0 ? (
                    <div className="w-full space-y-3 z-20">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-white/60 shadow-sm relative z-20">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              file.type === 'application/pdf' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {file.type === 'application/pdf' ? <FileText size={20} /> : <File size={20} />}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm truncate max-w-[200px]">{file.name}</p>
                              <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <div className="text-center mt-4 pt-4 border-t border-white/40">
                        <p className="text-sm font-medium text-indigo-600">Klik atau seret untuk menambah file lain</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-white/60 text-slate-500 rounded-2xl flex items-center justify-center shadow-sm border border-white/80">
                        <Upload size={32} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-slate-900">Klik atau seret file ke sini</p>
                        <p className="text-xs text-slate-500">Bisa pilih banyak file sekaligus (PDF, DOC, DOCX)</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 bg-white/30 border-t border-white/40 space-y-4">
              {loading && uploadProgress.total > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs font-medium text-slate-500">
                    <span>Mengunggah file...</span>
                    <span>{uploadProgress.current} / {uploadProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={loading || files.length === 0 || !candidateName || !candidateEmail || !position}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={24} />
                )}
                {loading ? `Mengirim ${uploadProgress.current}/${uploadProgress.total} CV...` : `Kirim ${files.length > 0 ? files.length : ''} CV`}
              </button>
            </div>
          </form>
        </div>

        {/* History / Search */}
        <div className="space-y-6">
          <div className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 shadow-2xl overflow-hidden flex flex-col h-full max-h-[800px]">
            <div className="p-6 border-b border-white/40 bg-white/30 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Riwayat Upload</h2>
                <div className="flex items-center gap-2">
                  {selectedUploads.length > 0 && (
                    <button 
                      onClick={handleBulkDelete}
                      className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Hapus ({selectedUploads.length})
                    </button>
                  )}
                  <button 
                    onClick={fetchUploads}
                    className="p-2.5 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
                  >
                    <RefreshCcw size={20} className={fetchingUploads ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Cari nama, email, atau posisi..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchUploads()}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm"
                />
              </div>
              {uploads.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                  <input 
                    type="checkbox" 
                    checked={selectedUploads.length === uploads.length && uploads.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-white/60 bg-white/50 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-medium text-slate-500">Pilih Semua</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {fetchingUploads ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <Loader2 size={32} className="animate-spin" />
                  <p className="text-sm font-medium">Memuat data...</p>
                </div>
              ) : uploads.length > 0 ? (
                <>
                  {uploads.map((upload) => (
                    <div key={upload.id} className={cn(
                      "p-4 border rounded-2xl transition-all group relative",
                      selectedUploads.includes(upload.id) ? "bg-indigo-50/80 border-indigo-200" : "bg-white/40 border-white/60 hover:border-indigo-300 hover:bg-white/60 hover:shadow-xl"
                    )}>
                      <div className="flex items-start gap-4">
                        <div className="pt-1">
                          <input 
                            type="checkbox" 
                            checked={selectedUploads.includes(upload.id)}
                            onChange={() => toggleSelect(upload.id)}
                            className="w-4 h-4 rounded border-white/60 bg-white/50 text-indigo-600 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{upload.candidate_name}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Mail size={12} />
                            <span>{upload.candidate_email}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <FileText size={12} />
                            <span className="font-medium text-indigo-600">{upload.position}</span>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                            <Calendar size={10} />
                            <span>{new Date(upload.uploaded_at).toLocaleDateString('id-ID')}</span>
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                            <User size={10} />
                            <span>{upload.sender_name}</span>
                          </div>
                          <button 
                            onClick={() => handleDelete(upload.id)}
                            className="mt-2 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all inline-flex"
                            title="Hapus riwayat"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Pagination Controls */}
                  {totalItems > itemsPerPage && (
                    <div className="flex items-center justify-between pt-4 border-t border-white/40 mt-6">
                      <div className="text-sm text-slate-500">
                        Menampilkan <span className="font-medium text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> hingga <span className="font-medium text-slate-900">{Math.min(currentPage * itemsPerPage, totalItems)}</span> dari <span className="font-medium text-slate-900">{totalItems}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(prev => prev - 1)}
                          className="px-3 py-1.5 rounded-lg border border-white/60 text-sm font-medium text-slate-600 hover:bg-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                                    : "text-slate-600 hover:bg-white/50"
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
                          className="px-3 py-1.5 rounded-lg border border-white/60 text-sm font-medium text-slate-600 hover:bg-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          Selanjutnya
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <div className="p-4 bg-white/50 rounded-full border border-white/60 shadow-sm">
                    <Search size={32} />
                  </div>
                  <p className="text-sm font-medium">Tidak ada data ditemukan</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <BulkUploadModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          fetchUploads();
          setIsBulkModalOpen(false);
        }}
      />
    </div>
  );
}
