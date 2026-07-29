import React from 'react';
import { BookOpen, Lightbulb, TrendingUp, Sparkles, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { findCategoryDefinition } from '../lib/psikotesCategoryReference';
import { cn } from '../lib/utils';

interface JSONRendererProps {
  data: any;
}

// Known AI-summary field names (ai_biodata_summary / ai_psikotes_summary),
// normalized lowercase -> natural Indonesian label, so headings read like a
// real report instead of a mechanical snake_case-to-Title-Case conversion.
// Unknown keys still fall back to that conversion via getLabel() below.
const FIELD_LABELS: Record<string, string> = {
  data_hasil_psikotes: 'Data Hasil Psikotes',
  general_learning_ability: 'General Learning Ability',
  disc_style: 'DISC Style',
  leadership_style_msdt: 'Leadership Style (MSDT)',
  kesesuaian_dengan_kriteria_database: 'Kesesuaian dengan Kriteria',
  persentase_kecocokan: 'Persentase Kecocokan',
  strengths: 'Kekuatan',
  weaknesses: 'Kelemahan',
  analisa_kognitif_kepribadian: 'Analisa Kognitif & Kepribadian',
  sintesa: 'Sintesa',
  dampak_pada_pekerjaan: 'Dampak pada Pekerjaan',
  analisa_etos_kerja_dan_kepemimpinan: 'Etos Kerja & Kepemimpinan',
  tingkat_kegigihan: 'Tingkat Kegigihan',
  gaya_aktual_msdt_papi: 'Gaya Aktual (MSDT & PAPI)',
  risiko_manajerial: 'Risiko Manajerial',
  rekomendasi_final: 'Rekomendasi Final',
  alasan_utama: 'Alasan Utama',
  saran_pengelolaan: 'Saran Pengelolaan',
  skor: 'Skor',
  kategori: 'Kategori',
  posisi: 'Posisi Dilamar',
  nama: 'Nama',
  pendidikan: 'Pendidikan',
  pengalaman_kerja: 'Pengalaman Kerja',
  keahlian: 'Keahlian',
  kekuatan_kandidat: 'Kekuatan Kandidat',
  kelemahan_kandidat: 'Kelemahan Kandidat',
  faktor_resiko: 'Faktor Risiko',
  faktor_potensi: 'Faktor Potensi',
  rincian_skor_kriteria: 'Rincian Skor Kriteria',
  penilaian_keseluruhan: 'Penilaian Keseluruhan',
  analisa_prestasi: 'Analisa Prestasi',
  analisa_tekanan: 'Analisa Ketahanan Tekanan',
  analisa_pemahaman_peran: 'Analisa Pemahaman Peran',
  jenis_motivasi: 'Jenis Motivasi',
  risiko_turnover: 'Risiko Turnover',
  katalis_utama: 'Katalis Utama',
  kesimpulan_rekomendasi: 'Kesimpulan & Rekomendasi',
  analisa_orisinalitas: 'Analisa Orisinalitas',
  alasan_penilaian: 'Alasan Penilaian',
  explanation: 'Penjelasan',
  penjelasan: 'Penjelasan',
  validitas: 'Validitas',
  catatan: 'Catatan',
  catatan_deteksi: 'Catatan Deteksi',
  realisme: 'Realisme',
  kesesuaian: 'Kesesuaian',
  kesimpulan: 'Kesimpulan',
  status: 'Status',
};

function getLabel(key: string): string {
  const normalized = key.toLowerCase().trim();
  if (FIELD_LABELS[normalized]) return FIELD_LABELS[normalized];
  return key
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// The reference text stores multi-point fields as "• point one\n• point two".
// Split them into a clean array so they can be rendered as a real list
// instead of leaving the literal "•" characters in the text.
function splitBulletPoints(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[•\-]\s*/, '').trim())
    .filter(Boolean);
}

function BulletList({ text, dotClassName }: { text: string; dotClassName: string }) {
  return (
    <ul className="space-y-1.5">
      {splitBulletPoints(text).map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-snug">
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotClassName}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CategoryInfoButton({ definition }: { definition: NonNullable<ReturnType<typeof findCategoryDefinition>> }) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex items-center gap-1 ml-2 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold transition-colors align-middle"
        title="Lihat penjelasan kategori"
      >
        <BookOpen size={12} />
        Baca Selengkapnya
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3.5">
        {definition.subtitle && (
          <p className="text-xs font-semibold text-indigo-600 pb-2 border-b border-slate-100">
            {definition.subtitle}
          </p>
        )}
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
            <Sparkles size={13} className="text-indigo-500" />
            Interpretasi
          </p>
          <p className="text-sm text-slate-600 leading-snug">{definition.interpretasi}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
            <Lightbulb size={13} className="text-emerald-500" />
            Potensi
          </p>
          <BulletList text={definition.potensi} dotClassName="bg-emerald-400" />
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
            <TrendingUp size={13} className="text-amber-500" />
            Area Pengembangan
          </p>
          <BulletList text={definition.areaPengembangan} dotClassName="bg-amber-400" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Renders a single key/value pair generically. `keyHint` lets callers (and
// recursive calls) special-case styling based on the field name — currently
// used to color Strengths/Weaknesses-style arrays green/red.
function renderValue(value: any, keyHint?: string): React.ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400 italic">Kosong</span>;
    const normalizedKey = (keyHint || '').toLowerCase();
    const isStrengths = /kekuatan|strength/.test(normalizedKey);
    const isWeaknesses = /kelemahan|weakness/.test(normalizedKey);
    if (isStrengths || isWeaknesses) {
      return (
        <div
          className={cn(
            'rounded-lg p-3 border mt-1',
            isStrengths ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100',
          )}
        >
          <ul className="space-y-1.5">
            {value.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm leading-snug">
                <span
                  className={cn(
                    'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
                    isStrengths ? 'bg-emerald-400' : 'bg-rose-400',
                  )}
                />
                <span className={isStrengths ? 'text-emerald-800' : 'text-rose-800'}>{renderValue(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return (
      <ul className="list-disc pl-5 space-y-1 mt-1">
        {value.map((item, index) => (
          <li key={index}>{renderValue(item)}</li>
        ))}
      </ul>
    );
  } else if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    // A "leaf" object whose values are all short scalars (e.g. { skor, kategori }
    // or { graph_I, graph_II, graph_III }) reads much better as a small grid of
    // chips than as another indented, bordered sub-list.
    const isCompactLeaf = entries.every(
      ([, v]) => (typeof v === 'string' && v.length <= 40) || typeof v === 'number' || typeof v === 'boolean',
    );
    if (isCompactLeaf && entries.length > 0) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {entries.map(([k, v]) => {
            const categoryDefinition = findCategoryDefinition(k, v);
            return (
              <div key={k} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{getLabel(k)}</p>
                <p className="text-sm font-semibold text-slate-700 flex items-center flex-wrap">
                  {renderValue(v)}
                  {categoryDefinition && <CategoryInfoButton definition={categoryDefinition} />}
                </p>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="pl-4 border-l-2 border-slate-100 mt-1 space-y-2">
        {entries.map(([k, v]) => {
          const categoryDefinition = findCategoryDefinition(k, v);
          return (
            <div key={k}>
              <span className="font-semibold text-slate-700">{getLabel(k)}:</span>{' '}
              {renderValue(v, k)}
              {categoryDefinition && <CategoryInfoButton definition={categoryDefinition} />}
            </div>
          );
        })}
      </div>
    );
  } else if (typeof value === 'boolean') {
    return value ? 'Ya' : 'Tidak';
  } else {
    // Handle string with newlines
    if (typeof value === 'string' && value.includes('\n')) {
      return <div className="whitespace-pre-wrap">{value}</div>;
    }
    return <span className="text-slate-600">{String(value)}</span>;
  }
}

type VerdictTone = {
  label: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
  Icon: typeof CheckCircle2;
};

// Reads the free-text verdict and maps it to a traffic-light tone. The n8n
// workflow has used a few different sets of wording over time — the current
// one is the short "Tolak" / "Pertimbangkan" / "Rekomendasi Lanjut" (biodata)
// and "Disarankan" / "Disarankan dengan Catatan" / "Tidak Disarankan"
// (psikotes) — so both are matched. Order matters: rejection and conditional
// phrasing are checked before the plain "disarankan/lanjut" match, since
// "tidak disarankan" also contains "disarankan".
function getVerdictTone(text: string): VerdictTone {
  const t = text.toLowerCase();
  if (/tidak disarankan|tidak direkomendasikan|not recommended|\btolak\b/.test(t)) {
    return { label: 'Tidak Disarankan', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-600', Icon: XCircle };
  }
  if (/catatan|reservation|pertimbang/.test(t)) {
    return { label: 'Dengan Catatan', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-500', Icon: AlertTriangle };
  }
  if (/disarankan|direkomendasikan|recommended|rekomendasi lanjut|\blanjut\b/.test(t)) {
    return { label: 'Disarankan', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-600', Icon: CheckCircle2 };
  }
  return { label: 'Rekomendasi', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', badge: 'bg-slate-500', Icon: Sparkles };
}

function VerdictBanner({
  statusLabel,
  scoreLabel,
  bodyText,
  bodyEntries,
  toneSourceText,
}: {
  statusLabel?: string;
  scoreLabel?: string;
  bodyText?: string;
  bodyEntries?: [string, any][];
  toneSourceText: string;
}) {
  const tone = getVerdictTone(toneSourceText);
  const { Icon } = tone;
  return (
    <div className={cn('rounded-xl border p-4 space-y-2.5', tone.bg, tone.border)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Icon size={18} className={tone.text} />
        <span className={cn('text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white', tone.badge)}>
          {statusLabel || tone.label}
        </span>
        {scoreLabel && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/70 text-slate-700 border border-slate-200">
            {scoreLabel}
          </span>
        )}
      </div>
      {bodyText && <p className="text-sm text-slate-700 leading-snug">{bodyText}</p>}
      {bodyEntries?.map(([k, v]) => (
        <div key={k}>
          <p className={cn('text-xs font-bold uppercase tracking-wide mb-0.5', tone.text)}>{getLabel(k)}</p>
          <div className="text-sm text-slate-700 leading-snug">{renderValue(v, k)}</div>
        </div>
      ))}
    </div>
  );
}

export default function JSONRenderer({ data }: JSONRendererProps) {
  if (!data) return null;

  let parsedData = data;
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      // If it's a string but not JSON, just return the string
      return <div className="whitespace-pre-wrap">{data}</div>;
    }
  }

  if (typeof parsedData !== 'object' || parsedData === null) {
    return <div className="whitespace-pre-wrap">{String(parsedData)}</div>;
  }

  const entries = Object.entries(parsedData);

  // Surface the final verdict first, as a prominent colored banner, instead
  // of leaving it buried among the other fields in whatever order the AI
  // returned them. Known verdict keys: ai_psikotes_summary.rekomendasi_final
  // and ai_biodata_summary.kesimpulan_rekomendasi — the n8n workflow has
  // changed the shape of these over time (plain free-text paragraph vs an
  // object with a short `status` + `alasan`/`alasan_utama`), so both are
  // handled here regardless of which key name carries which shape.
  const scoreField = (parsedData as Record<string, any>).total_skor ?? (parsedData as Record<string, any>).penilaian_keseluruhan;
  const scoreFieldKey = 'total_skor' in (parsedData as object) ? 'total_skor' : 'penilaian_keseluruhan';

  let verdictKey: string | null = null;
  let verdictNode: React.ReactNode = null;
  for (const [key, value] of entries) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey !== 'rekomendasi_final' && normalizedKey !== 'kesimpulan_rekomendasi') continue;

    if (value && typeof value === 'object' && 'status' in (value as any)) {
      const data = value as Record<string, any>;
      verdictKey = key;
      verdictNode = (
        <VerdictBanner
          statusLabel={String(data.status)}
          scoreLabel={scoreField !== undefined ? `Skor: ${scoreField}/10` : undefined}
          bodyEntries={Object.entries(data).filter(([k]) => k !== 'status')}
          toneSourceText={String(data.status)}
        />
      );
      break;
    }
    if (typeof value === 'string') {
      verdictKey = key;
      verdictNode = (
        <VerdictBanner
          scoreLabel={scoreField !== undefined ? `Skor: ${scoreField}/10` : undefined}
          bodyText={value}
          toneSourceText={value}
        />
      );
      break;
    }
  }

  return (
    <div className="space-y-3">
      {verdictNode}
      {entries.map(([key, value]) => {
        if (key === verdictKey) return null;
        // The score used inside the verdict banner above is already shown
        // there, so skip rendering it again as its own generic box.
        if (verdictKey && key === scoreFieldKey) return null;
        return (
          <div key={key} className="bg-white/50 rounded-lg p-3 border border-indigo-50">
            <h5 className="font-bold text-indigo-900 mb-1">{getLabel(key)}</h5>
            <div className="text-sm">{renderValue(value, key)}</div>
          </div>
        );
      })}
    </div>
  );
}
