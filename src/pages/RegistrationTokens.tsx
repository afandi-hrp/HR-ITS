import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/ui/use-toast";
import { cn, formatDateDMMMY } from "../lib/utils";
import ConfirmModal from "../components/ConfirmModal";
import {
  Loader2,
  Plus,
  KeyRound,
  CheckCircle2,
  XCircle,
  Copy,
  Trash2,
  Link2,
  Search,
  Send,
  X,
  Filter,
} from "lucide-react";

interface Token {
  id: string;
  token: string;
  is_used: boolean;
  // Two meanings: set to the *send* time by SendEmailModal/SendWAModal, then
  // overwritten with the *use* time (NOW()) by submit_application_with_token
  // when is_used becomes true. So: is_used ? use time : send time.
  used_at: string | null;
  created_at: string;
}

// The application form submitted with a token. submit_application_with_token
// sets used_at = NOW() and inserts the external_data row in the same
// transaction, so external_data.created_at equals the token's used_at.
interface Submission {
  uid_sheet: string;
  full_name: string | null;
  position: string | null;
  candidateId: string | null;
}

interface Recipient {
  id: string;
  full_name: string | null;
  position: string | null;
}

type TokenStatus = "tersedia" | "terkirim" | "terpakai";
type StatusFilter = "all" | TokenStatus;

const getTokenStatus = (t: Token): TokenStatus =>
  t.is_used ? "terpakai" : t.used_at ? "terkirim" : "tersedia";

const STATUS_META: Record<TokenStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  tersedia: { label: "Tersedia", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  terkirim: { label: "Terkirim", cls: "bg-amber-100 text-amber-700", icon: Send },
  terpakai: { label: "Sudah Terpakai", cls: "bg-rose-100 text-rose-700", icon: XCircle },
};

// Unambiguous characters only (no 0/O, 1/I/L) — tokens are often typed by hand.
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomPart = (length: number) => {
  // Cryptographically secure (Math.random() output is predictable).
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${formatDateDMMMY(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export default function RegistrationTokens() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [recipients, setRecipients] = useState<Record<string, Recipient>>({});
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    { type: "used" } | { type: "single"; token: Token } | null
  >(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
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

      // Who each token was sent to: Send Email/WA stores the token's id in
      // the candidate's confirmation_token (kept when archived).
      const sentIds = (data || []).filter((t) => t.used_at || t.is_used).map((t) => t.id);
      const map: Record<string, Recipient> = {};
      for (const ids of chunk(sentIds, 150)) {
        const [activeRes, logsRes] = await Promise.all([
          supabase.from("candidates").select("id, full_name, position, confirmation_token").in("confirmation_token", ids),
          supabase.from("candidate_logs").select("id, full_name, position, confirmation_token").in("confirmation_token", ids),
        ]);
        [...(logsRes.data || []), ...(activeRes.data || [])].forEach((c: any) => {
          map[c.confirmation_token] = { id: c.id, full_name: c.full_name, position: c.position };
        });
      }
      setRecipients(map);

      // Who actually used each token: match external_data.created_at to the
      // token's used_at (same transaction — see Submission above).
      const usedTokens = (data || []).filter((t) => t.is_used && t.used_at);
      const byTime: Record<number, Submission> = {};
      for (const group of chunk(usedTokens, 100)) {
        const { data: forms } = await supabase
          .from("external_data")
          .select("uid_sheet, created_at, full_name:raw_data->>full_name, position:raw_data->>position")
          .in("created_at", group.map((t) => t.used_at as string));
        const uids = (forms || []).map((f: any) => f.uid_sheet);
        const linked: Record<string, string> = {};
        if (uids.length > 0) {
          const [activeRes, logsRes] = await Promise.all([
            supabase.from("candidates").select("id, linked_external_id").in("linked_external_id", uids),
            supabase.from("candidate_logs").select("id, linked_external_id").in("linked_external_id", uids),
          ]);
          [...(logsRes.data || []), ...(activeRes.data || [])].forEach((c: any) => {
            linked[c.linked_external_id] = c.id;
          });
        }
        (forms || []).forEach((f: any) => {
          byTime[new Date(f.created_at).getTime()] = {
            uid_sheet: f.uid_sheet,
            full_name: f.full_name,
            position: f.position,
            candidateId: linked[f.uid_sheet] || null,
          };
        });
      }
      const subs: Record<string, Submission> = {};
      usedTokens.forEach((t) => {
        const match = byTime[new Date(t.used_at as string).getTime()];
        if (match) subs[t.id] = match;
      });
      setSubmissions(subs);
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

      const newTokens = Array.from({ length: count }).map(() => ({
        token: `WRN-${randomPart(8)}-${randomPart(4)}`,
        created_by: user?.id,
      }));

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

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const query = supabase.from("registration_tokens").delete();
      const { error } =
        confirmDelete.type === "used"
          ? await query.eq("is_used", true)
          : await query.eq("id", confirmDelete.token.id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description:
          confirmDelete.type === "used"
            ? "Semua token yang sudah terpakai berhasil dihapus."
            : `Token ${confirmDelete.token.token} berhasil dihapus.`,
      });
      setConfirmDelete(null);
      fetchTokens();
    } catch (error: any) {
      console.error("Error deleting tokens:", error);
      toast({
        title: "Error",
        description: "Gagal menghapus token.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Tersalin",
      description: `${what} berhasil disalin ke clipboard.`,
    });
  };

  const counts = tokens.reduce(
    (acc, t) => ({ ...acc, [getTokenStatus(t)]: acc[getTokenStatus(t)] + 1 }),
    { tersedia: 0, terkirim: 0, terpakai: 0 } as Record<TokenStatus, number>,
  );

  const filteredTokens = tokens.filter((t) => {
    if (statusFilter !== "all" && getTokenStatus(t) !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const r = recipients[t.id];
    return (
      t.token.toLowerCase().includes(q) ||
      (r?.full_name || "").toLowerCase().includes(q) ||
      (r?.position || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / itemsPerPage));
  const paginatedTokens = filteredTokens.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  return (
    <div className="pb-8 space-y-4">
      <div className="mb-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#5A305A]">Token Pelamar</h1>
        <p className="text-[#5A305A]/70 mt-1">
          Kelola token akses satu kali pakai untuk form pelamar publik.
        </p>
      </div>

      {/* Filter Bar — one row from lg up */}
      <div className="bg-white/70 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap lg:flex-nowrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#73507B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Cari token / penerima..."
            className="w-full pl-9 pr-8 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#5A305A] h-10"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#73507B] hover:text-[#5A305A]"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 h-10 w-[190px] shrink-0">
          <Filter size={16} className="text-[#73507B] shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setCurrentPage(1);
            }}
            className="bg-transparent text-sm focus:outline-none text-[#5A305A] w-full truncate"
            title="Filter status token"
          >
            <option value="all">Semua Status ({tokens.length})</option>
            <option value="tersedia">Tersedia ({counts.tersedia})</option>
            <option value="terkirim">Terkirim ({counts.terkirim})</option>
            <option value="terpakai">Terpakai ({counts.terpakai})</option>
          </select>
        </div>
        <button
          onClick={() => setConfirmDelete({ type: "used" })}
          disabled={deleting || counts.terpakai === 0}
          className="h-10 w-10 shrink-0 flex items-center justify-center bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-colors shadow-sm disabled:opacity-50"
          title={`Hapus semua token terpakai (${counts.terpakai})`}
        >
          <Trash2 size={18} />
        </button>
        <button
          onClick={() => generateToken(10)}
          disabled={generating}
          className="h-10 px-3.5 shrink-0 bg-[#5A305A]/10 text-[#5A305A] text-sm rounded-xl hover:bg-[#5A305A]/20 transition-colors flex items-center gap-1.5 disabled:opacity-70 font-medium whitespace-nowrap"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Buat 10
        </button>
        <button
          onClick={() => generateToken(1)}
          disabled={generating}
          className="h-10 px-3.5 shrink-0 bg-[#5A305A] text-white text-sm rounded-xl hover:bg-[#3F223F] transition-colors flex items-center gap-1.5 disabled:opacity-70 font-medium whitespace-nowrap"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Buat 1 Token
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#5A305A]/5 border-b border-[#5A305A]/20">
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">Token</th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">Status</th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">Dikirim ke</th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">Dibuat Pada</th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">Penggunaan</th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A] text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <Loader2 className="animate-spin mx-auto text-[#5A305A] mb-2" size={24} />
                    <p className="text-[#73507B]">Memuat data token...</p>
                  </td>
                </tr>
              ) : filteredTokens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#73507B]">
                    {tokens.length === 0 ? "Belum ada token yang dibuat." : "Tidak ada token yang cocok dengan filter."}
                  </td>
                </tr>
              ) : (
                paginatedTokens.map((token) => {
                  const status = getTokenStatus(token);
                  const meta = STATUS_META[status];
                  const StatusIcon = meta.icon;
                  const recipient = recipients[token.id];
                  return (
                    <tr key={token.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <KeyRound size={14} className="text-[#73507B] shrink-0" />
                          <span className="font-mono text-sm font-medium text-[#5A305A]">{token.token}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap", meta.cls)}>
                          <StatusIcon size={14} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm min-w-[140px]">
                        {recipient ? (
                          <Link to={`/candidates/${recipient.id}`} className="text-[#5A305A] hover:underline">
                            <span className="font-semibold">{recipient.full_name || "-"}</span>
                            <span className="block text-xs text-[#73507B]">{recipient.position || "-"}</span>
                          </Link>
                        ) : (
                          <span className="text-[#73507B]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-[#73507B] min-w-[110px]">
                        {formatDateTime(token.created_at)}
                      </td>
                      <td className="px-3 py-3 text-sm min-w-[200px]">
                        {status === "terpakai" ? (
                          <span className="block">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                              <CheckCircle2 size={15} /> Digunakan {formatDateTime(token.used_at)}
                            </span>
                            {submissions[token.id] && (
                              <span className="block text-xs text-[#73507B] mt-0.5">
                                oleh{" "}
                                <Link
                                  to={
                                    submissions[token.id].candidateId
                                      ? `/candidates/${submissions[token.id].candidateId}`
                                      : "/external-data"
                                  }
                                  className="font-semibold text-[#5A305A] hover:underline"
                                  title={
                                    submissions[token.id].candidateId
                                      ? "Buka profil kandidat"
                                      : "Form belum ditautkan ke kandidat — lihat di Data Eksternal"
                                  }
                                >
                                  {submissions[token.id].full_name || "-"}
                                </Link>
                                {submissions[token.id].position ? ` – ${submissions[token.id].position}` : ""}
                              </span>
                            )}
                          </span>
                        ) : status === "terkirim" ? (
                          <span className="text-amber-700">
                            <span className="font-semibold">Belum digunakan</span>
                            <span className="block text-xs text-[#73507B]">Dikirim {formatDateTime(token.used_at)}</span>
                          </span>
                        ) : (
                          <span className="text-[#73507B]">Belum digunakan</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => copyToClipboard(token.token, "Token")}
                          className="p-2 text-[#73507B] hover:text-[#5A305A] hover:bg-[#5A305A]/10 rounded-lg transition-colors"
                          title="Salin Token"
                        >
                          <Copy size={18} />
                        </button>
                        {status !== "terpakai" && (
                          <button
                            onClick={() =>
                              copyToClipboard(
                                `${window.location.origin}/form-pelamar?token=${encodeURIComponent(token.token)}`,
                                "Link form pelamar",
                              )
                            }
                            className="p-2 text-[#73507B] hover:text-[#5A305A] hover:bg-[#5A305A]/10 rounded-lg transition-colors"
                            title="Salin Link Form (token otomatis terisi)"
                          >
                            <Link2 size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete({ type: "single", token })}
                          className="p-2 text-[#73507B] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus Token"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && filteredTokens.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100">
            <p className="text-sm text-[#73507B]">
              Halaman {currentPage} dari {totalPages} ({filteredTokens.length} token)
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-[#5A305A] font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title={confirmDelete?.type === "used" ? "Hapus Token Terpakai" : "Hapus Token"}
        message={
          confirmDelete?.type === "used"
            ? `Hapus ${counts.terpakai} token yang sudah terpakai?`
            : confirmDelete?.type === "single"
              ? getTokenStatus(confirmDelete.token) === "terkirim"
                ? `Token ${confirmDelete.token.token} sudah dikirim ke ${recipients[confirmDelete.token.id]?.full_name || "kandidat"} tapi belum digunakan. Jika dihapus, kandidat tidak bisa lagi mengisi form dengan token ini. Lanjutkan?`
                : `Hapus token ${confirmDelete.token.token}?`
              : ""
        }
        confirmText="Ya, Hapus"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
