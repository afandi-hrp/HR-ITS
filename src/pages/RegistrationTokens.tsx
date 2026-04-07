import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/use-toast';
import { Loader2, Plus, KeyRound, CheckCircle2, XCircle, Copy, Trash2 } from 'lucide-react';

interface Token {
  id: string;
  token: string;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
}

export default function RegistrationTokens() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('registration_tokens')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTokens(data || []);
    } catch (error: any) {
      console.error('Error fetching tokens:', error);
      toast({
        title: 'Error',
        description: 'Gagal mengambil data token.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const generateToken = async (count: number = 1) => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const newTokens = Array.from({ length: count }).map(() => {
        const randomString1 = Math.random().toString(36).substring(2, 10).toUpperCase().padEnd(8, '0');
        const randomString2 = Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, '0');
        return {
          token: `WRN-${randomString1}-${randomString2}`,
          created_by: user?.id
        };
      });

      const { error } = await supabase
        .from('registration_tokens')
        .insert(newTokens);

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: `${count} Token berhasil dibuat.`,
      });

      fetchTokens();
    } catch (error: any) {
      console.error('Error generating token:', error);
      toast({
        title: 'Error',
        description: 'Gagal membuat token baru.',
        variant: 'destructive'
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteUsedTokens = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus semua token yang sudah terpakai?')) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('registration_tokens')
        .delete()
        .eq('is_used', true);

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Semua token yang sudah terpakai berhasil dihapus.',
      });

      fetchTokens();
    } catch (error: any) {
      console.error('Error deleting used tokens:', error);
      toast({
        title: 'Error',
        description: 'Gagal menghapus token terpakai.',
        variant: 'destructive'
      });
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Tersalin',
      description: 'Token berhasil disalin ke clipboard.',
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Token Pelamar</h1>
          <p className="text-slate-500 mt-1">Kelola token akses satu kali pakai untuk form pelamar publik.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDeleteUsedTokens}
            disabled={deleting || tokens.filter(t => t.is_used).length === 0}
            className="bg-white border border-rose-200 text-rose-600 px-4 py-2 rounded-xl hover:bg-rose-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
            Hapus Token Terpakai
          </button>
          <button
            onClick={() => generateToken(10)}
            disabled={generating}
            className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl hover:bg-indigo-200 transition-colors flex items-center gap-2 disabled:opacity-70 font-medium"
          >
            {generating ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
            Buat 10 Token
          </button>
          <button
            onClick={() => generateToken(1)}
            disabled={generating}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-70 font-medium"
          >
            {generating ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
            Buat 1 Token
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-semibold text-slate-600">Token</th>
                <th className="p-4 font-semibold text-slate-600">Status</th>
                <th className="p-4 font-semibold text-slate-600">Dibuat Pada</th>
                <th className="p-4 font-semibold text-slate-600">Digunakan Pada</th>
                <th className="p-4 font-semibold text-slate-600 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <Loader2 className="animate-spin mx-auto text-indigo-600 mb-2" size={24} />
                    <p className="text-slate-500">Memuat data token...</p>
                  </td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Belum ada token yang dibuat.
                  </td>
                </tr>
              ) : (
                tokens.map((token) => (
                  <tr key={token.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <KeyRound size={16} className="text-slate-400" />
                        <span className="font-mono font-medium text-slate-900">{token.token}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {token.is_used ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <XCircle size={14} />
                          Sudah Terpakai
                        </span>
                      ) : token.used_at ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <CheckCircle2 size={14} />
                          Terkirim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 size={14} />
                          Tersedia
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {formatDate(token.created_at)}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {formatDate(token.used_at)}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => copyToClipboard(token.token)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Salin Token"
                      >
                        <Copy size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
