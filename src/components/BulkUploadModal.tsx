import React, { useState } from 'react';
import { X, Upload, FileText, File, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/use-toast';
import { cn, fetchWithRetry } from '../lib/utils';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  position: string;
  file: File | null;
}

export default function BulkUploadModal({ isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
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
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPositions(false);
      }
    };

    fetchPositions();
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      setRows(
        Array.from({ length: 5 }).map(() => ({
          id: Math.random().toString(36).substring(7),
          name: '',
          email: '',
          position: '',
          file: null,
        }))
      );
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRowChange = (id: string, field: keyof CandidateRow, value: any) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleFileChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      
      if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
        toast({ 
          title: 'File Ditolak', 
          description: 'Hanya file PDF/Word di bawah 5MB yang diperbolehkan.',
          variant: 'destructive' 
        });
        return;
      }

      handleRowChange(id, 'file', file);
    }
  };

  const addRow = () => {
    setRows(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      name: '',
      email: '',
      position: '',
      file: null,
    }]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const handleUpload = async () => {
    // Filter out completely empty rows
    const validRows = rows.filter(row => row.name || row.email || row.position || row.file);

    if (validRows.length === 0) {
      toast({ title: 'Peringatan', description: 'Silakan isi setidaknya satu data kandidat.', variant: 'destructive' });
      return;
    }

    // Validate valid rows
    const incompleteRows = validRows.filter(row => !row.name || !row.email || !row.position || !row.file);
    if (incompleteRows.length > 0) {
      toast({ title: 'Peringatan', description: 'Pastikan semua kolom (Nama, Email, Posisi, File) terisi untuk baris yang Anda isi.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setUploadProgress({ current: 0, total: validRows.length });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
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

      for (const row of validRows) {
        if (!row.file) continue;

        const formData = new FormData();
        formData.append('webhookUrl', webhookUrl);
        formData.append('candidateName', row.name);
        formData.append('candidateEmail', row.email);
        formData.append('candidatePosition', row.position);
        formData.append('fileName', row.file.name);
        formData.append('mimeType', row.file.type);
        formData.append('uploadedAt', new Date().toISOString());
        formData.append('senderName', user?.user_metadata?.full_name || 'User');
        formData.append('senderEmail', user?.email || '');
        formData.append('file', row.file);

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
          title: 'Berhasil Diunggah', 
          description: `${successCount} CV berhasil dikirim ke antrean. Anda akan menerima notifikasi saat proses analisa selesai.` 
        });
        onSuccess();
        onClose();
      }
      if (errorCount > 0) {
        toast({ 
          title: 'Error', 
          description: `${errorCount} CV gagal dikirim.`, 
          variant: 'destructive' 
        });
      }
      
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Upload CV Massal</h2>
            <p className="text-sm text-slate-500 mt-1">Masukkan data kandidat dan unggah CV sekaligus.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          <div className="space-y-4">
            {rows.map((row, index) => (
              <div key={row.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-sm shrink-0">
                  {index + 1}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 w-full">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nama</label>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => handleRowChange(row.id, 'name', e.target.value)}
                      placeholder="Nama Lengkap"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</label>
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) => handleRowChange(row.id, 'email', e.target.value)}
                      placeholder="email@example.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Posisi</label>
                    {loadingPositions ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                        <Loader2 className="animate-spin" size={14} /> Memuat...
                      </div>
                    ) : availablePositions.length > 0 ? (
                      <select
                        value={row.position}
                        onChange={(e) => handleRowChange(row.id, 'position', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm appearance-none"
                      >
                        <option value="" disabled>Pilih Posisi</option>
                        {availablePositions.map((pos, idx) => (
                          <option key={idx} value={pos}>{pos}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={row.position}
                        onChange={(e) => handleRowChange(row.id, 'position', e.target.value)}
                        placeholder="Posisi Dilamar"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    )}
                  </div>
                </div>

                <div className="w-full md:w-auto shrink-0 flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="file"
                      onChange={(e) => handleFileChange(row.id, e)}
                      accept=".pdf,.doc,.docx"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all w-full md:w-auto justify-center",
                        row.file 
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                          : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                      )}
                    >
                      {row.file ? (
                        <>
                          {row.file.type === 'application/pdf' ? <FileText size={16} /> : <File size={16} />}
                          <span className="truncate max-w-[100px]">{row.file.name}</span>
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          <span>Pilih CV</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length <= 1}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Hapus Baris"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all"
          >
            <Plus size={16} />
            Tambah Baris
          </button>
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="w-full sm:w-1/2">
            {loading && uploadProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-500">
                  <span>Mengunggah...</span>
                  <span>{uploadProgress.current} / {uploadProgress.total}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
            >
              Batal
            </button>
            <button
              onClick={handleUpload}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed min-w-[160px]"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>{uploadProgress.current} / {uploadProgress.total}</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span>Upload Semua</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
