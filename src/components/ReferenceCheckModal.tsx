import React, { useState, useEffect } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/use-toast';
import {
  CandidateEvaluation,
  Profile,
  EvaluationTemplate,
  ReferenceCheckFormSchema,
  ReferenceCheckData,
} from '../types';

interface ReferenceCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateFullName: string;
  onSuccess: () => void;
  existingEvaluation?: CandidateEvaluation | null;
  userProfile?: Profile | null;
}

const emptyData = (schema: ReferenceCheckFormSchema | null): ReferenceCheckData => ({
  applicant: Object.fromEntries((schema?.two_column.rows || []).map(r => [r.key, ''])),
  reference: Object.fromEntries((schema?.two_column.rows || []).map(r => [r.key, ''])),
  referee_comments: Object.fromEntries((schema?.single_column.rows || []).map(r => [r.key, ''])),
  additional_comments: '',
  checked_date: new Date().toISOString().slice(0, 10),
});

export default function ReferenceCheckModal({
  isOpen,
  onClose,
  candidateId,
  candidateFullName,
  onSuccess,
  existingEvaluation,
  userProfile,
}: ReferenceCheckModalProps) {
  const { toast } = useToast();
  const [template, setTemplate] = useState<EvaluationTemplate | null>(null);
  const [interviewerName, setInterviewerName] = useState('');
  const [data, setData] = useState<ReferenceCheckData>(emptyData(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTemplate();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && template) {
      if (existingEvaluation) {
        setInterviewerName(existingEvaluation.interviewer_name || '');
        setData({ ...emptyData(schema), ...(existingEvaluation.evaluation_data as ReferenceCheckData) });
      } else {
        setInterviewerName(userProfile?.full_name || '');
        setData(emptyData(schema));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, template, existingEvaluation, userProfile]);

  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('evaluation_templates')
        .select('*')
        .eq('type', 'REFERENCE_CHECK')
        .limit(1);

      if (error) throw error;
      setTemplate(rows?.[0] || null);
    } catch (error: any) {
      toast({ title: 'Error', description: 'Gagal memuat template Reference Check', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const schema = (template?.form_schema as ReferenceCheckFormSchema) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template || !schema) return;

    if (!interviewerName.trim()) {
      toast({ title: 'Peringatan', description: '"Checked by" wajib diisi', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (existingEvaluation) {
        const { error } = await supabase
          .from('candidate_evaluations')
          .update({
            template_id: template.id,
            evaluation_type: 'REFERENCE_CHECK',
            interviewer_name: interviewerName,
            evaluation_data: data,
            total_score: 0,
          })
          .eq('id', existingEvaluation.id);

        if (error) throw error;
        toast({ title: 'Berhasil', description: 'Reference check berhasil diperbarui' });
      } else {
        const { error } = await supabase
          .from('candidate_evaluations')
          .insert({
            candidate_id: candidateId,
            template_id: template.id,
            evaluation_type: 'REFERENCE_CHECK',
            interviewer_name: interviewerName,
            evaluator_id: userData.user?.id,
            evaluation_data: data,
            total_score: 0,
          });

        if (error) throw error;
        toast({ title: 'Berhasil', description: 'Reference check berhasil disimpan' });
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Error', description: error.message || 'Gagal menyimpan reference check', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const title = schema?.title_template.replace('{{full_name}}', candidateFullName) || 'Reference Check';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-[#5A305A]">{title}</h2>
            {schema && <p className="text-sm text-slate-500">{schema.intro}</p>}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading || !schema ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>
          ) : (
            <form id="reference-check-form" onSubmit={handleSubmit} className="space-y-8">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      {schema.two_column.headers.map((h, i) => (
                        <th key={i} className="p-3 font-bold text-slate-700 border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schema.two_column.rows.map((row) => (
                      <tr key={row.key} className="border-b border-slate-100 last:border-0">
                        <td className="p-3 font-medium text-slate-700 align-top w-1/4">{row.label}</td>
                        <td className="p-2 align-top">
                          <input
                            type="text"
                            value={data.applicant[row.key] || ''}
                            onChange={(e) => setData(prev => ({ ...prev, applicant: { ...prev.applicant, [row.key]: e.target.value } }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="text"
                            value={data.reference[row.key] || ''}
                            onChange={(e) => setData(prev => ({ ...prev, reference: { ...prev.reference, [row.key]: e.target.value } }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800">{schema.single_column.section_title}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-slate-100 text-left">
                        <th className="p-3 font-bold text-slate-700 border-b border-slate-200 w-1/3">Item</th>
                        <th className="p-3 font-bold text-slate-700 border-b border-slate-200">{schema.single_column.header}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schema.single_column.rows.map((row) => (
                        <tr key={row.key} className="border-b border-slate-100 last:border-0">
                          <td className="p-3 font-medium text-slate-700 align-top">{row.label}</td>
                          <td className="p-2 align-top">
                            <input
                              type="text"
                              value={data.referee_comments[row.key] || ''}
                              onChange={(e) => setData(prev => ({ ...prev, referee_comments: { ...prev.referee_comments, [row.key]: e.target.value } }))}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">{schema.additional_comments_label}</label>
                <textarea
                  value={data.additional_comments}
                  onChange={(e) => setData(prev => ({ ...prev, additional_comments: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-indigo-900">Checked by</label>
                  <input
                    type="text"
                    value={interviewerName}
                    onChange={(e) => setInterviewerName(e.target.value)}
                    placeholder="Nama yang melakukan reference check"
                    className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-indigo-900">{schema.footer.checked_date_label}</label>
                  <input
                    type="date"
                    value={data.checked_date}
                    onChange={(e) => setData(prev => ({ ...prev, checked_date: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 font-medium hover:bg-rose-100 rounded-xl transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            form="reference-check-form"
            disabled={saving || !schema}
            className="px-6 py-2.5 bg-[#5A305A] text-white font-medium rounded-xl hover:bg-[#5A305A]/90 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Simpan Reference Check
          </button>
        </div>
      </div>
    </div>
  );
}
