import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/ui/use-toast";
import {
  Loader2,
  Plus,
  KeyRound,
  CheckCircle2,
  XCircle,
  Copy,
  Trash2,
} from "lucide-react";

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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from("registration_tokens")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTokens(data || []);
    } catch (error: any) {
      console.error("Error fetching tokens:", error);
      toast({
        title: "Error",
        description: "Gagal mengambil data token.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateToken = async (count: number = 1) => {
    setGenerating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const newTokens = Array.from({ length: count }).map(() => {
        const randomString1 = Math.random()
          .toString(36)
          .substring(2, 10)
          .toUpperCase()
          .padEnd(8, "0");
        const randomString2 = Math.random()
          .toString(36)
          .substring(2, 6)
          .toUpperCase()
          .padEnd(4, "0");
        return {
          token: `WRN-${randomString1}-${randomString2}`,
          created_by: user?.id,
        };
      });

      const { error } = await supabase
        .from("registration_tokens")
        .insert(newTokens);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: `${count} Token berhasil dibuat.`,
      });

      fetchTokens();
    } catch (error: any) {
      console.error("Error generating token:", error);
      toast({
        title: "Error",
        description: "Gagal membuat token baru.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteUsedTokens = async () => {
    if (
      !window.confirm(
        "Apakah Anda yakin ingin menghapus semua token yang sudah terpakai?",
      )
    )
      return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("registration_tokens")
        .delete()
        .eq("is_used", true);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Semua token yang sudah terpakai berhasil dihapus.",
      });

      fetchTokens();
    } catch (error: any) {
      console.error("Error deleting used tokens:", error);
      toast({
        title: "Error",
        description: "Gagal menghapus token terpakai.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Tersalin",
      description: "Token berhasil disalin ke clipboard.",
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = Math.max(1, Math.ceil(tokens.length / itemsPerPage));
  const paginatedTokens = tokens.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  return (
    <div className="pb-8 space-y-4">
      <div className="mb-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-[#5A305A]">Token Pelamar</h1>
        <p className="text-[#5A305A]/70 mt-1">
          Kelola token akses satu kali pakai untuk form pelamar publik.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-end gap-3">
        <button
          onClick={handleDeleteUsedTokens}
          disabled={deleting || tokens.filter((t) => t.is_used).length === 0}
          className="bg-white border border-rose-200 text-rose-600 px-3.5 py-1.5 text-sm rounded-xl hover:bg-rose-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {deleting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Trash2 size={16} />
          )}
          Hapus Token Terpakai
        </button>
        <button
          onClick={() => generateToken(10)}
          disabled={generating}
          className="bg-indigo-100 text-indigo-700 px-3.5 py-1.5 text-sm rounded-xl hover:bg-indigo-200 transition-colors flex items-center gap-1.5 disabled:opacity-70 font-medium"
        >
          {generating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          Buat 10 Token
        </button>
        <button
          onClick={() => generateToken(1)}
          disabled={generating}
          className="bg-[#5A305A] text-white px-3.5 py-1.5 text-sm rounded-xl hover:bg-[#3F223F] transition-colors flex items-center gap-1.5 disabled:opacity-70 font-medium"
        >
          {generating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          Buat 1 Token
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#5A305A]/5 border-b border-[#5A305A]/20">
                <th className="p-4 font-semibold text-[#5A305A]">Token</th>
                <th className="p-4 font-semibold text-[#5A305A]">Status</th>
                <th className="p-4 font-semibold text-[#5A305A]">
                  Dibuat Pada
                </th>
                <th className="p-4 font-semibold text-[#5A305A]">
                  Digunakan Pada
                </th>
                <th className="p-4 font-semibold text-[#5A305A] text-right">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <Loader2
                      className="animate-spin mx-auto text-indigo-600 mb-2"
                      size={24}
                    />
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
                paginatedTokens.map((token) => (
                  <tr
                    key={token.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <KeyRound size={16} className="text-slate-400" />
                        <span className="font-mono font-medium text-[#5A305A]">
                          {token.token}
                        </span>
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
        {!loading && tokens.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Halaman {currentPage} dari {totalPages} ({tokens.length} token)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-[#5A305A] font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Sebelumnya
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-[#5A305A] font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
