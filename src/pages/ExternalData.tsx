import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWithRetry, cn } from '../lib/utils';
import { Database, CloudDownload, FileText, Trash2, X, Download, Loader2, Search, ChevronLeft, ChevronRight, RefreshCw, CheckSquare, Printer } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import { printElement } from '../lib/print';
import ApplicationForm from './ApplicationForm';

export default function ExternalData() {
  const [data, setData] = useState<any[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [webhookDeleteUrl, setWebhookDeleteUrl] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState<any | null>(null);
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const componentRef = useRef<HTMLDivElement>(null);
  
  // Pagination & Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'hide_archived' | 'available' | 'active' | 'archived'>('hide_archived');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const { toast } = useToast();

  // Debounce search term to prevent spamming Supabase
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      if (searchTerm !== debouncedSearchTerm) {
        setCurrentPage(1); // Reset to page 1 only if search term actually changed
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadWebhooks();
    loadSiteSettings();
  }, []);

  useEffect(() => {
    fetchData();
  }, [currentPage, itemsPerPage, debouncedSearchTerm, statusFilter]);

  const loadSiteSettings = async () => {
    try {
      const { data } = await supabase.from('site_settings').select('*').eq('id', 1).single();
      if (data) setSiteSettings(data);
    } catch (err) {
      console.error('Error loading site settings:', err);
    }
  };

  const isExcludedKey = (key: string) => {
    const lowerKey = key.toLowerCase();
    return ['row_number', 'id', 'uid_sheet', 'created_at', 'uid', 'timestamp', 'change_type'].includes(lowerKey);
  };

  const hexToRgb = (hex: string): [number, number, number] => {
    const defaultColor: [number, number, number] = [79, 70, 229]; // indigo-600
    if (!hex) return defaultColor;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : defaultColor;
  };

  const loadWebhooks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const deleteUrl = user.user_metadata.external_data_delete_webhook_url || '';
        setWebhookDeleteUrl(deleteUrl);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('external_data')
        .select('*', { count: 'exact' });

      if (statusFilter !== 'all') {
        const [activeRes, logsRes] = await Promise.all([
          supabase.from('candidates').select('linked_external_id').not('linked_external_id', 'is', null),
          supabase.from('candidate_logs').select('linked_external_id').not('linked_external_id', 'is', null)
        ]);
        
        const activeUids = (activeRes.data || []).map(d => d.linked_external_id).filter(Boolean);
        const archivedUids = (logsRes.data || []).map(d => d.linked_external_id).filter(Boolean);

        if (statusFilter === 'hide_archived' && archivedUids.length > 0) {
          query = query.not('uid_sheet', 'in', `(${archivedUids.join(',')})`);
        } else if (statusFilter === 'available') {
          const allUsed = [...activeUids, ...archivedUids];
          if (allUsed.length > 0) {
            query = query.not('uid_sheet', 'in', `(${allUsed.join(',')})`);
          }
        } else if (statusFilter === 'active') {
          if (activeUids.length > 0) {
            query = query.in('uid_sheet', activeUids);
          } else {
            query = query.in('uid_sheet', ['__EMPTY__']);
          }
        } else if (statusFilter === 'archived') {
          if (archivedUids.length > 0) {
            query = query.in('uid_sheet', archivedUids);
          } else {
            query = query.in('uid_sheet', ['__EMPTY__']);
          }
        }
      }

      if (debouncedSearchTerm) {
        // Menggunakan textSearch bawaan Supabase untuk mencari di dalam JSONB.
        // Catatan: Jika ini error, Anda mungkin perlu membuat kolom text search khusus di Supabase
        // atau menggunakan fungsi RPC.
        query = query.textSearch('raw_data', `'${debouncedSearchTerm}'`);
      }

      // Pagination (Server-Side)
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: result, error, count } = await query;

      if (error) {
        throw error;
      }

      if (count !== null) {
        setTotalItems(count);
      }

      // Flatten data agar sesuai dengan struktur UI yang sudah ada
      let parsedData = (result || []).map(item => ({
        uid_sheet: item.uid_sheet,
        ...item.raw_data
      }));

      // Check linked status
      if (parsedData.length > 0) {
        const uids = parsedData.map(d => d.uid_sheet);
        const [activeRes, logsRes] = await Promise.all([
          supabase.from('candidates').select('linked_external_id, full_name').in('linked_external_id', uids),
          supabase.from('candidate_logs').select('linked_external_id, full_name, status_screening').in('linked_external_id', uids)
        ]);

        const activeMap = new Map((activeRes.data || []).map(d => [d.linked_external_id, d]));
        const logsMap = new Map((logsRes.data || []).map(d => [d.linked_external_id, d]));

        parsedData = parsedData.map(item => {
          const active = activeMap.get(item.uid_sheet);
          const log = logsMap.get(item.uid_sheet);
          return {
            ...item,
            _link_status: active ? 'active' : log ? 'archived' : 'available',
            _linked_to: active?.full_name || log?.full_name || null,
            _log_status: log?.status_screening || null
          };
        });
      }
      
      setData(parsedData);
    } catch (err: any) {
      console.error("Fetch error:", err);
      toast({ title: 'Gagal', description: 'Gagal menarik data dari Supabase. Pastikan tabel external_data sudah dibuat.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData();
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = data; // Data sudah di-paginate dari server

  const handleDelete = async (row: any) => {
    if (!webhookDeleteUrl) {
      toast({ title: 'Peringatan', description: 'URL Webhook DELETE belum diatur di Pengaturan.', variant: 'destructive' });
      return;
    }

    const rowIdentifier = row.uid_sheet;
    
    if (!rowIdentifier) {
      toast({ title: 'Error', description: 'Tidak dapat menemukan identitas baris (uid_sheet) pada data ini.', variant: 'destructive' });
      setShowConfirmDelete(null);
      return;
    }

    setIsDeleting(rowIdentifier);
    
    // Setup AbortController for 30-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Kirim Webhook ke n8n (Workflow B) via proxy
      const response = await fetchWithRetry('/api/n8n/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          type: 'external_data_delete',
          payload: { uid_sheet: rowIdentifier, data: row }
        }),
        signal: controller.signal
      }, 1); // Set maxRetries to 1 to avoid long retries on timeout

      clearTimeout(timeoutId);

      if (response.ok) {
        toast({ 
          title: 'Berhasil', 
          description: 'Permintaan hapus data telah dikirim. Periksa notifikasi untuk status selanjutnya.'
        });
        // We don't refresh data immediately since it's async now.
        // The user will get a notification when it's done.
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Gagal menghapus data di n8n');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        toast({ title: 'Waktu Habis', description: 'Server n8n terlalu lama merespons (lebih dari 30 detik).', variant: 'destructive' });
      } else {
        toast({ title: 'Gagal', description: err.message, variant: 'destructive' });
      }
    } finally {
      setIsDeleting(null);
      setShowConfirmDelete(null);
    }
  };

  const handlePreview = (row: any) => {
    setPreviewData(row);
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        if (val.length === 0) return '-';
        // Filter out empty objects
        const nonEmptyItems = val.filter(item => {
          if (typeof item === 'object' && item !== null) {
            return Object.values(item).some(v => v !== '');
          }
          return true;
        });
        if (nonEmptyItems.length === 0) return '-';
        
        return nonEmptyItems.map((item, idx) => {
          if (typeof item === 'object' && item !== null) {
            return `[${idx + 1}] ` + Object.entries(item)
              .filter(([_, v]) => v !== '')
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ');
          }
          return String(item);
        }).join('\n');
      }
      // Plain object
      const entries = Object.entries(val).filter(([_, v]) => v !== '');
      if (entries.length === 0) return '-';
      return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    return String(val);
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await printElement(componentRef.current, `Data_Pelamar_${previewData?.full_name || 'Kandidat'}`);
      toast({
        title: "Berhasil",
        description: "Dokumen berhasil disiapkan untuk dicetak.",
      });
    } catch (error: any) {
      console.error("Print Error:", error);
      if (error.message === 'POPUP_BLOCKED') {
        toast({
          title: "Popup Diblokir",
          description: "Browser Anda memblokir popup. Silakan izinkan popup (pop-up blocker) untuk situs ini agar dapat mencetak PDF.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Gagal",
          description: "Terjadi kesalahan saat menyiapkan dokumen.",
          variant: "destructive"
        });
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Database className="text-indigo-600" size={32} />
            Data Eksternal
          </h1>
          <p className="text-slate-500 mt-1">
            Menampilkan data dari Form yang disubmit oleh user.
          </p>
        </div>
      </div>

      {/* Panel Pencarian & Refresh */}
      <div className="bg-white/60 backdrop-blur-md p-4 rounded-2xl border border-white/60 shadow-xl flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Cari data..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              // setCurrentPage(1) dipindah ke useEffect debounce
            }}
            className="pl-10 pr-4 py-2.5 border border-white/60 bg-white/50 backdrop-blur-md rounded-xl w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
          />
        </div>

        <div className="w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="w-full sm:w-auto px-4 py-2.5 border border-white/60 bg-white/50 backdrop-blur-md rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-700 font-medium"
          >
            <option value="all">Semua Data</option>
            <option value="hide_archived">Sembunyikan Arsip</option>
            <option value="available">Belum Ditautkan</option>
            <option value="active">Ditautkan (Aktif)</option>
            <option value="archived">Diarsipkan</option>
          </select>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white/50 backdrop-blur-md border border-white/60 text-indigo-700 rounded-xl hover:bg-white/80 hover:shadow-md transition-all shadow-sm disabled:opacity-50 font-medium text-sm"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Loader2 size={48} className="animate-spin mb-4 text-indigo-600" />
          <p>Menarik data dari sumber...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center bg-white rounded-2xl border border-slate-200 shadow-sm border-dashed">
          <div className="bg-slate-50 p-6 rounded-full mb-6">
            <Database size={64} className="text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">Belum Ada Data</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Data dari Supabase masih kosong. Pastikan Workflow n8n Anda sudah berjalan dan menyinkronkan data dari Google Sheet ke Supabase.
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            {/* Decorative background blobs for glassmorphism */}
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-40 -right-20 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
              {paginatedData.map((row, index) => {
              const rowId = row.uid_sheet || index;
              // Get entries for preview card
              const entries = Object.entries(row).filter(([key]) => !isExcludedKey(key));
              
              // Find a good title field (name, nama, title, judul)
              let titleEntry = entries.find(([key]) => {
                const lowerKey = key.toLowerCase();
                return lowerKey.includes('nama') || 
                       lowerKey.includes('name') || 
                       lowerKey.includes('judul') || 
                       lowerKey.includes('title') ||
                       lowerKey === 'noreg' ||
                       lowerKey === 'no_reg';
              });
              
              // If no specific title field found, fallback to the first entry
              if (!titleEntry) {
                titleEntry = entries.length > 0 ? entries[0] : ['Data', `Baris ${index + 1}`];
              }

              // Remove the title entry from the preview list so it's not duplicated
              const remainingEntries = entries.filter(([key]) => key !== titleEntry![0]);
              const previewEntries = remainingEntries.slice(0, 4);

              return (
                <div key={rowId} className={cn(
                  "bg-white/60 backdrop-blur-md rounded-2xl border shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden group relative border-white/60"
                )}>
                  {/* Top Accent Line */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-80"></div>
                  
                  <div className="p-6 border-b border-white/50 bg-white/40 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-xl text-slate-900 truncate group-hover:text-indigo-600 transition-colors" title={String(titleEntry[1])}>
                          {String(titleEntry[1]) || 'Tanpa Judul'}
                        </h3>
                        {row._link_status === 'active' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 whitespace-nowrap shrink-0" title={`Ditautkan ke: ${row._linked_to}`}>
                            Ditautkan
                          </span>
                        )}
                        {row._link_status === 'archived' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 whitespace-nowrap shrink-0" title={`Diarsipkan: ${row._linked_to} (${row._log_status})`}>
                            Diarsipkan
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        {titleEntry[0]}
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-6 flex-1 space-y-4 bg-transparent">
                    {previewEntries.map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium text-slate-500 block text-xs uppercase tracking-wider mb-1">{key}</span>
                        <span className="text-slate-800 font-medium line-clamp-2">{formatValue(value)}</span>
                      </div>
                    ))}
                    {entries.length > 4 && (
                      <div className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-white/60 border border-white/60 text-xs text-indigo-600 font-medium mt-2 shadow-sm">
                        + {entries.length - 4} kolom lainnya
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-white/50 bg-white/40 flex items-center justify-between gap-3">
                    <button
                      onClick={() => handlePreview(row)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/50 border border-white/60 text-slate-700 text-sm font-semibold rounded-xl hover:bg-white/80 hover:text-indigo-600 hover:border-white transition-all shadow-sm backdrop-blur-sm"
                    >
                      <FileText size={16} />
                      Preview & PDF
                    </button>
                    <button
                      onClick={() => setShowConfirmDelete(row)}
                      disabled={row._link_status === 'active' || row._link_status === 'archived'}
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50/50 rounded-xl transition-all border border-transparent hover:border-red-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={row._link_status === 'active' ? "Tidak dapat menghapus data yang sedang ditautkan ke kandidat aktif" : row._link_status === 'archived' ? "Tidak dapat menghapus data yang sudah diarsipkan" : "Hapus Data"}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white/60 backdrop-blur-md px-4 py-3 border border-white/60 rounded-2xl shadow-xl gap-4 mt-8 relative z-10">
              <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Tampilkan</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border border-white/60 rounded-xl text-sm py-1.5 px-3 bg-white/50 backdrop-blur-md focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-slate-600">baris</span>
                </div>
                <p className="text-sm text-slate-700 hidden sm:block">
                  Menampilkan <span className="font-medium">{startIndex + 1}</span> hingga <span className="font-medium">{Math.min(startIndex + itemsPerPage, totalItems)}</span> dari <span className="font-medium">{totalItems}</span> hasil
                </p>
              </div>
              
              <div>
                <nav className="relative z-0 inline-flex rounded-xl shadow-sm -space-x-px overflow-hidden" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 border border-white/60 bg-white/50 backdrop-blur-md text-sm font-medium text-slate-500 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft size={20} />
                  </button>
                  {/* Simplified pagination numbers if there are many pages */}
                  {totalPages <= 7 ? (
                    [...Array(Math.max(1, totalPages))].map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === i + 1
                            ? 'z-10 bg-indigo-50/80 backdrop-blur-md border-indigo-200 text-indigo-600'
                            : 'bg-white/50 backdrop-blur-md border-white/60 text-slate-500 hover:bg-white/80'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))
                  ) : (
                      <>
                        <button
                          onClick={() => setCurrentPage(1)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === 1 ? 'z-10 bg-indigo-50/80 backdrop-blur-md border-indigo-200 text-indigo-600' : 'bg-white/50 backdrop-blur-md border-white/60 text-slate-500 hover:bg-white/80'
                          }`}
                        >
                          1
                        </button>
                        {currentPage > 3 && <span className="relative inline-flex items-center px-4 py-2 border border-white/60 bg-white/50 backdrop-blur-md text-sm font-medium text-slate-700">...</span>}
                        
                        {currentPage > 2 && currentPage < totalPages - 1 && (
                          <button
                            onClick={() => setCurrentPage(currentPage - 1)}
                            className="relative inline-flex items-center px-4 py-2 border border-white/60 bg-white/50 backdrop-blur-md text-sm font-medium text-slate-500 hover:bg-white/80"
                          >
                            {currentPage - 1}
                          </button>
                        )}
                        
                        {currentPage !== 1 && currentPage !== totalPages && (
                          <button
                            className="relative inline-flex items-center px-4 py-2 border text-sm font-medium z-10 bg-indigo-50/80 backdrop-blur-md border-indigo-200 text-indigo-600"
                          >
                            {currentPage}
                          </button>
                        )}
                        
                        {currentPage > 1 && currentPage < totalPages - 1 && (
                          <button
                            onClick={() => setCurrentPage(currentPage + 1)}
                            className="relative inline-flex items-center px-4 py-2 border border-white/60 bg-white/50 backdrop-blur-md text-sm font-medium text-slate-500 hover:bg-white/80"
                          >
                            {currentPage + 1}
                          </button>
                        )}

                        {currentPage < totalPages - 2 && <span className="relative inline-flex items-center px-4 py-2 border border-white/60 bg-white/50 backdrop-blur-md text-sm font-medium text-slate-700">...</span>}
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === totalPages ? 'z-10 bg-indigo-50/80 backdrop-blur-md border-indigo-200 text-indigo-600' : 'bg-white/50 backdrop-blur-md border-white/60 text-slate-500 hover:bg-white/80'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                  )}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="relative inline-flex items-center px-2 py-2 border border-white/60 bg-white/50 backdrop-blur-md text-sm font-medium text-slate-500 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight size={20} />
                  </button>
                </nav>
              </div>
            </div>
          )}
          </div>
        </>
      )}

      {/* Preview Modal (HTML Mockup) */}
      {previewData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <FileText size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Preview Dokumen PDF</h2>
                  <p className="text-xs text-slate-500">Pratinjau laporan sebelum diunduh</p>
                </div>
              </div>
              <button 
                onClick={() => setPreviewData(null)} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/80 flex justify-center items-start custom-scrollbar">
              <div ref={componentRef} className="w-full max-w-4xl bg-white shadow-2xl shrink-0 rounded-2xl overflow-hidden print:shadow-none print:rounded-none">
                <ApplicationForm readOnly initialData={previewData} />
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-200 bg-white flex items-center justify-end gap-3 shrink-0">
              <button 
                onClick={() => setPreviewData(null)}
                disabled={isGeneratingPdf}
                className="px-6 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50"
              >
                Batal
              </button>
              <button 
                onClick={() => handleDownloadPdf()}
                disabled={isGeneratingPdf}
                className="px-8 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Menyiapkan Cetak...
                  </>
                ) : (
                  <>
                    <Printer size={18} />
                    Cetak / Simpan PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-4 text-red-600 mb-4">
              <div className="p-3 bg-red-50 rounded-full">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Hapus Data?</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Apakah Anda yakin ingin menghapus data ini dari Google Sheet? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmDelete(null)}
                disabled={isDeleting !== null}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(showConfirmDelete)}
                disabled={isDeleting !== null}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting !== null ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
