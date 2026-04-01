import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWithRetry } from '../lib/utils';
import { Database, CloudDownload, FileText, Trash2, X, Download, Loader2, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ExternalData() {
  const [data, setData] = useState<any[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [webhookDeleteUrl, setWebhookDeleteUrl] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState<any | null>(null);
  const [siteSettings, setSiteSettings] = useState<any>(null);
  
  // Pagination & Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
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
  }, [currentPage, itemsPerPage, debouncedSearchTerm]);

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
      const parsedData = (result || []).map(item => ({
        uid_sheet: item.uid_sheet,
        ...item.raw_data
      }));
      
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
          description: 'Permintaan hapus data telah dikirim. Periksa notifikasi untuk status selanjutnya.',
          duration: 10000
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

  const generatePDF = async (row: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    const sidebarColorRgb = siteSettings?.sidebar_color ? hexToRgb(siteSettings.sidebar_color) : [79, 70, 229];

    // Professional Color Palette (Plum Theme)
    const colors = {
      primary: [142, 69, 133] as [number, number, number], // Plum (#8E4585)
      secondary: [142, 69, 133] as [number, number, number], // Plum
      accent: [253, 244, 255] as [number, number, number], // fuchsia-50
      text: [51, 65, 85] as [number, number, number], // slate-700
      muted: [134, 25, 143] as [number, number, number], // fuchsia-800
      border: [232, 121, 249] as [number, number, number], // fuchsia-300
      bg: [253, 244, 255] as [number, number, number], // fuchsia-50
    };

    // --- HEADER ---
    // Top accent bar
    doc.setFillColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
    doc.rect(0, 0, pageWidth, 8, 'F');
    
    // Header Background
    doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
    doc.rect(0, 8, pageWidth, 35, 'F');

    let textStartX = 14;

    if (siteSettings?.sidebar_logo_url) {
      try {
        const response = await fetch(siteSettings.sidebar_logo_url);
        const blob = await response.blob();
        const base64data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        doc.addImage(base64data, 'PNG', 14, 12, 24, 24);
        textStartX = 44; // Shift text to the right
      } catch (e) {
        console.error("Failed to load logo for PDF", e);
      }
    }

    // Title
    doc.setFontSize(22);
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('DETAIL DATA KANDIDAT', textStartX, 26);
    
    // Subtitle
    doc.setFontSize(10);
    doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2]);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistem Informasi Rekrutmen - Waruna Group', textStartX, 34);

    // --- INFO SECTION ---
    const infoY = 55;
    doc.setFontSize(10);
    doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('DICETAK PADA:', 14, infoY);
    
    doc.setFontSize(11);
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text(new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB', 14, infoY + 6);

    // Line Separator
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.setLineWidth(0.5);
    doc.line(14, infoY + 12, pageWidth - 14, infoY + 12);

    // --- CONTENT TABLE ---
    const tableData = Object.entries(row)
      .filter(([key]) => !isExcludedKey(key))
      .map(([key, value]) => [key.toUpperCase(), String(value || '-')]);

    autoTable(doc, {
      startY: infoY + 20,
      head: [['INFORMASI', 'KETERANGAN']],
      body: tableData,
      theme: 'grid',
      styles: {
        font: 'helvetica',
      },
      headStyles: {
        fillColor: colors.secondary,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left',
        cellPadding: 4,
        lineColor: colors.secondary,
        lineWidth: 0.1
      },
      bodyStyles: {
        textColor: colors.text,
        fontSize: 9,
        cellPadding: 4,
        lineColor: colors.border,
        lineWidth: 0.1
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60, textColor: colors.primary, fillColor: colors.bg },
        1: { cellWidth: 'auto' }
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      },
      margin: { top: 20, right: 14, bottom: 30, left: 14 }
    });

    // --- FOOTER ---
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Footer background
      doc.setFillColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');

      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'Dokumen ini dihasilkan secara otomatis oleh sistem.',
        14,
        pageHeight - 8
      );
      doc.text(
        `Halaman ${i} dari ${pageCount}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' }
      );
    }

    doc.save(`Data_Eksternal_${new Date().getTime()}.pdf`);
  };

  const handlePreview = (row: any) => {
    setPreviewData(row);
  };

  const handleDownloadPdf = async () => {
    if (previewData) {
      await generatePDF(previewData);
      setPreviewData(null);
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
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-white/50 backdrop-blur-md border border-white/60 text-indigo-700 rounded-xl hover:bg-white/80 hover:shadow-md transition-all shadow-sm disabled:opacity-50 font-medium text-sm"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          Refresh Data
        </button>
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
                <div key={rowId} className="bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden group relative">
                  {/* Top Accent Line */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-80"></div>
                  
                  <div className="p-6 border-b border-white/50 bg-white/40">
                    <h3 className="font-bold text-xl text-slate-900 truncate group-hover:text-indigo-600 transition-colors" title={String(titleEntry[1])}>
                      {String(titleEntry[1]) || 'Tanpa Judul'}
                    </h3>
                    <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      {titleEntry[0]}
                    </p>
                  </div>
                  
                  <div className="p-6 flex-1 space-y-4 bg-transparent">
                    {previewEntries.map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium text-slate-500 block text-xs uppercase tracking-wider mb-1">{key}</span>
                        <span className="text-slate-800 font-medium line-clamp-2">{String(value || '-')}</span>
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
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50/50 rounded-xl transition-all border border-transparent hover:border-red-200/50"
                      title="Hapus Data"
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
            
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100/80 flex justify-center custom-scrollbar">
              {/* High-Fidelity Visual Preview (HTML) */}
              <div className="w-full max-w-[800px] bg-white shadow-2xl min-h-[1100px] flex flex-col font-sans text-slate-900 shrink-0">
                {/* PDF Header Mockup */}
                <div className="w-full h-[24px]" style={{ backgroundColor: '#8E4585' }}></div>
                <div className="w-full bg-fuchsia-50 px-12 py-8 flex items-center gap-6">
                  {siteSettings?.sidebar_logo_url && (
                    <img src={siteSettings.sidebar_logo_url} alt="Logo" className="h-16 w-auto object-contain" />
                  )}
                  <div>
                    <h1 className="text-[28px] leading-none font-bold text-[#8E4585] tracking-tight">DETAIL DATA KANDIDAT</h1>
                    <p className="text-[13px] text-fuchsia-800 mt-2">Sistem Informasi Rekrutmen - Waruna Group</p>
                  </div>
                </div>

                <div className="px-12 py-8 flex-1 space-y-6">
                  {/* Info Section */}
                  <div className="space-y-1">
                    <p className="text-[12px] font-bold text-slate-500">DICETAK PADA:</p>
                    <p className="text-[14px] font-medium text-slate-900">
                      {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB
                    </p>
                  </div>
                  
                  <div className="w-full h-px bg-slate-200"></div>

                  {/* Table Mockup */}
                  <div className="border border-fuchsia-200 rounded-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-white text-[11px] font-bold uppercase tracking-wider" style={{ backgroundColor: '#8E4585' }}>
                          <th className="p-2.5 border w-[35%]" style={{ borderColor: '#8E4585' }}>Informasi</th>
                          <th className="p-2.5 border w-[65%]" style={{ borderColor: '#8E4585' }}>Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px]">
                        {Object.entries(previewData)
                          .filter(([key]) => !isExcludedKey(key))
                          .map(([key, value], i) => (
                            <tr key={key} className="bg-white">
                              <td className="p-2.5 font-bold text-[#8E4585] bg-fuchsia-50 border border-fuchsia-200 uppercase w-[35%] break-words">
                                {key}
                              </td>
                              <td className="p-2.5 text-slate-700 border border-fuchsia-200 w-[65%] break-words whitespace-pre-wrap">
                                {String(value || '-')}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* PDF Footer Mockup */}
                <div className="w-full bg-[#8E4585] px-12 py-6 mt-auto flex justify-between items-center text-[10px] text-white">
                  <p>Dokumen ini dihasilkan secara otomatis oleh sistem.</p>
                  <p>Halaman 1 dari 1</p>
                </div>
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-200 bg-white flex items-center justify-end gap-3 shrink-0">
              <button 
                onClick={() => setPreviewData(null)}
                className="px-6 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleDownloadPdf}
                className="px-8 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
              >
                <Download size={18} />
                Konfirmasi & Download PDF
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
