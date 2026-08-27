import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/use-toast';
import { useAuth } from '../contexts/AuthContext';
import { EvaluationTemplate, CandidateEvaluation, Profile } from '../types';

interface EvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  onSuccess: () => void;
  existingEvaluation?: CandidateEvaluation | null;
  userProfile?: Profile | null;
  isAssignedToMe?: boolean;
}

// Scoped per candidate + the evaluation being edited (or "new" for a fresh
// one), so a draft never leaks across different candidates/evaluations.
const getDraftKey = (candidateId: string, evaluationId?: string) =>
  `evaluation_draft_${candidateId}_${evaluationId || 'new'}`;

export default function EvaluationModal({ isOpen, onClose, candidateId, onSuccess, existingEvaluation, userProfile, isAssignedToMe }: EvaluationModalProps) {
  const { toast } = useToast();
  const { setSessionProtected } = useAuth();
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [interviewerName, setInterviewerName] = useState('');
  const [evaluationData, setEvaluationData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tracks which draft key has already been reset/restored, so re-renders
  // that pass a new-but-equivalent `existingEvaluation`/`userProfile`
  // object (e.g. from a parent state refresh) don't re-run the reset or
  // re-show the "Draft Ditemukan" toast while the modal stays open.
  const initializedDraftKeyRef = useRef<string | null>(null);

  const evaluationId = existingEvaluation?.id;

  useEffect(() => {
    if (!isOpen) {
      initializedDraftKeyRef.current = null;
      return;
    }
    fetchTemplates();

    const draftKey = getDraftKey(candidateId, evaluationId);
    if (initializedDraftKeyRef.current === draftKey) return;
    initializedDraftKeyRef.current = draftKey;

    if (existingEvaluation) {
      setSelectedTemplateId(existingEvaluation.template_id);
      setInterviewerName(existingEvaluation.interviewer_name || '');
      setEvaluationData(existingEvaluation.evaluation_data || {});
    } else {
      setEvaluationData({});
      setInterviewerName(userProfile?.full_name || '');
      setSelectedTemplateId('');
    }

    // Restore any unsaved in-progress input for this exact evaluation, in
    // case entry was interrupted (e.g. a session hiccup mid-fill — see
    // AuthContext.tsx) before "Simpan Hasil" was clicked.
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.selectedTemplateId) setSelectedTemplateId(parsed.selectedTemplateId);
        if (parsed.interviewerName) setInterviewerName(parsed.interviewerName);
        if (parsed.evaluationData) setEvaluationData(parsed.evaluationData);
        toast({
          title: 'Draft Ditemukan',
          description: 'Input evaluasi yang belum tersimpan berhasil dipulihkan.',
        });
      } catch (e) {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, candidateId, evaluationId]);

  // Debounced autosave of in-progress input, so it survives an interrupted
  // session/reload before the user clicks "Simpan Hasil".
  useEffect(() => {
    if (!isOpen || !selectedTemplateId) return;
    const timeout = setTimeout(() => {
      localStorage.setItem(
        getDraftKey(candidateId, evaluationId),
        JSON.stringify({ selectedTemplateId, interviewerName, evaluationData })
      );
    }, 1000);
    return () => clearTimeout(timeout);
  }, [isOpen, candidateId, evaluationId, selectedTemplateId, interviewerName, evaluationData]);

  // While this modal is open, tell AuthProvider to hold off on reacting to
  // a session hiccup (e.g. from switching tabs/apps) instead of yanking
  // the user out mid-entry — see setSessionProtected in AuthContext.tsx.
  useEffect(() => {
    setSessionProtected(isOpen);
    return () => setSessionProtected(false);
  }, [isOpen, setSessionProtected]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('evaluation_templates')
        .select('*')
        .neq('type', 'REFERENCE_CHECK')
        .order('name');

      const { data, error } = await query;

      if (error) throw error;

      let filteredTemplates = data || [];

      // Filter based on role and department
      // Director / Finance Director can also act as the "User" interviewer
      // (not just approval), so they share the exact same template access as
      // USER_MANAGER — which, via target_role, naturally excludes HC/HR
      // templates (those are tagged target_role: 'HR_ADMIN').
      if (['USER_MANAGER', 'DIRECTOR', 'FINANCE_DIRECTOR'].includes(userProfile?.role || '')) {
        filteredTemplates = filteredTemplates.filter(t => {
          // If target_role is specified and not ALL, it must match USER_MANAGER
          if (t.target_role && t.target_role !== 'ALL' && t.target_role !== 'USER_MANAGER') {
            return false;
          }
          // If target_department is specified and not ALL, it must match user's department
          if (t.target_department && t.target_department !== 'ALL' && userProfile.department) {
            // Simple case-insensitive match
            const targetDepts = t.target_department.toLowerCase().split(',').map((d: string) => d.trim());
            const userDept = userProfile.department.toLowerCase();
            if (!targetDepts.includes(userDept)) {
              return false;
            }
          }
          return true;
        });
      } else if (userProfile?.role === 'HR_ADMIN') {
        filteredTemplates = filteredTemplates.filter(t => {
          if (t.target_role && t.target_role !== 'ALL' && t.target_role !== 'HR_ADMIN') {
            if (isAssignedToMe && t.target_role === 'USER_MANAGER') {
              return true;
            }
            return false;
          }
          return true;
        });
      }

      setTemplates(filteredTemplates);
      if (!existingEvaluation && filteredTemplates.length === 1) {
        setSelectedTemplateId(filteredTemplates[0].id);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: 'Gagal memuat template', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleScoreChange = (categoryIndex: number, criteriaIndex: number, score: number) => {
    setEvaluationData(prev => ({
      ...prev,
      [`cat_${categoryIndex}_crit_${criteriaIndex}`]: score
    }));
  };

  const handleSummaryChange = (fieldName: string, value: any) => {
    setEvaluationData(prev => ({
      ...prev,
      [`summary_${fieldName}`]: value
    }));
  };

  const handleCheckboxChange = (fieldName: string, option: string, checked: boolean) => {
    setEvaluationData(prev => {
      const currentValues = prev[`summary_${fieldName}`] || [];
      if (checked) {
        return { ...prev, [`summary_${fieldName}`]: [...currentValues, option] };
      } else {
        return { ...prev, [`summary_${fieldName}`]: currentValues.filter((v: string) => v !== option) };
      }
    });
  };

  const handleSummaryScoreChange = (fieldName: string, option: string, score: number | string) => {
    setEvaluationData(prev => {
      const prevVal = prev[`summary_${fieldName}`];
      const currentValues = Array.isArray(prevVal) ? {} : { ...(prevVal || {}) };
      
      if (score !== '') {
        const existingOption = Object.entries(currentValues).find(([opt, val]) => val === score && opt !== option);
        if (existingOption) {
          toast({
            title: 'Skor Duplikat',
            description: `Skor ${score} sudah digunakan pada opsi "${existingOption[0]}". Silakan pilih skor lain.`,
            variant: 'destructive',
          });
          return prev;
        }
      }

      return {
        ...prev,
        [`summary_${fieldName}`]: {
          ...currentValues,
          [option]: score
        }
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    // Basic validation
    if (selectedTemplate.type === 'USER' && !interviewerName.trim()) {
      toast({ title: 'Peringatan', description: 'Nama Interviewer wajib diisi', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Calculate total score (simple sum for now)
      let totalScore = 0;
      Object.keys(evaluationData).forEach(key => {
        if (key.startsWith('cat_') && typeof evaluationData[key] === 'number') {
          totalScore += evaluationData[key];
        }
      });

      if (existingEvaluation) {
        const { error } = await supabase
          .from('candidate_evaluations')
          .update({
            template_id: selectedTemplate.id,
            evaluation_type: selectedTemplate.type,
            interviewer_name: interviewerName || (userData.user?.email || 'HR'),
            evaluation_data: evaluationData,
            total_score: totalScore
          })
          .eq('id', existingEvaluation.id);

        if (error) throw error;
        localStorage.removeItem(getDraftKey(candidateId, existingEvaluation?.id));
        toast({ title: 'Berhasil', description: 'Hasil evaluasi berhasil diperbarui' });
      } else {
        const { error } = await supabase
          .from('candidate_evaluations')
          .insert({
            candidate_id: candidateId,
            template_id: selectedTemplate.id,
            evaluation_type: selectedTemplate.type,
            interviewer_name: interviewerName || (userData.user?.email || 'HR'),
            evaluator_id: userData.user?.id,
            evaluation_data: evaluationData,
            total_score: totalScore
          });

        if (error) throw error;
        localStorage.removeItem(getDraftKey(candidateId, existingEvaluation?.id));
        toast({ title: 'Berhasil', description: 'Hasil evaluasi berhasil disimpan' });
      }


      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Error', description: error.message || 'Gagal menyimpan evaluasi', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-[#5A305A]">Input Hasil Evaluasi</h2>
            <p className="text-sm text-slate-500">Pilih template dan masukkan nilai kandidat</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>
          ) : (
            <form id="evaluation-form" onSubmit={handleSubmit} className="space-y-8">
              
              {/* Template Selection */}
              {templates.length > 1 || !selectedTemplate ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700">Pilih Jenis Penilaian / Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">-- Pilih Template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-500">Template Penilaian</label>
                  <p className="font-semibold text-[#5A305A]">{selectedTemplate.name} ({selectedTemplate.type})</p>
                </div>
              )}

              {selectedTemplate && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  
                  {/* Interviewer Name */}
                  <div className="space-y-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <label className="block text-sm font-bold text-indigo-900">Nama Interviewer</label>
                    <input
                      type="text"
                      value={interviewerName}
                      onChange={(e) => setInterviewerName(e.target.value)}
                      placeholder="Contoh: Pak Budi - IT Manager"
                      className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <p className="text-xs text-indigo-700">Masukkan nama asli pihak yang melakukan interview.</p>
                  </div>

                  {/* Scoring Categories */}
                  {(selectedTemplate.form_schema as any).categories?.map((category: any, catIdx: number) => (
                    <div key={catIdx} className="space-y-4">
                      <h3 className="text-lg font-bold text-slate-800 border-b pb-2">{category.name}</h3>
                      <div className="space-y-6">
                        {category.criteria.map((crit: any, critIdx: number) => (
                          <div key={critIdx} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="mb-3">
                              <h4 className="font-bold text-[#5A305A]">{crit.name}</h4>
                              <p className="text-sm text-slate-500 mt-1">{crit.description}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                              {(selectedTemplate.form_schema as any).scale.map((s: any) => (
                                <label 
                                  key={s.score} 
                                  className={`w-full sm:flex-1 sm:min-w-[120px] flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all text-center ${
                                    evaluationData[`cat_${catIdx}_crit_${critIdx}`] === s.score 
                                      ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500 shadow-sm' 
                                      : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <input 
                                    type="radio" 
                                    name={`cat_${catIdx}_crit_${critIdx}`}
                                    value={s.score}
                                    checked={evaluationData[`cat_${catIdx}_crit_${critIdx}`] === s.score}
                                    onChange={() => handleScoreChange(catIdx, critIdx, s.score)}
                                    className="absolute opacity-0 -z-10 w-0 h-0"
                                    required
                                  />
                                  <span className="text-lg font-bold text-[#5A305A]">{s.score}</span>
                                  <span className="text-xs text-slate-500 mt-1 break-words w-full line-clamp-2" title={s.label}>{s.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Summary Fields */}
                  {(selectedTemplate.form_schema as any).summary_fields && (
                    <div className="space-y-6 pt-6 border-t border-slate-200">
                      <h3 className="text-lg font-bold text-slate-800">Summary & Conclusion</h3>
                      
                      {(selectedTemplate.form_schema as any).summary_fields.map((field: any, idx: number) => (
                        <div key={idx} className="space-y-2">
                          <label className="block text-sm font-bold text-slate-700">{field.name}</label>
                          
                          {field.type === 'textarea' && (
                            <textarea
                              value={evaluationData[`summary_${field.name}`] || ''}
                              onChange={(e) => handleSummaryChange(field.name, e.target.value)}
                              placeholder={field.placeholder}
                              rows={3}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}

                          {field.type === 'radio' && (
                            <div className="flex flex-wrap gap-4">
                              {field.options.map((opt: string) => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`summary_${field.name}`}
                                    value={opt}
                                    checked={evaluationData[`summary_${field.name}`] === opt}
                                    onChange={() => handleSummaryChange(field.name, opt)}
                                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="text-sm text-slate-700">{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {field.type === 'checkbox_group' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {field.options.map((opt: string) => {
                                const isChecked = (evaluationData[`summary_${field.name}`] || []).includes(opt);
                                return (
                                  <label key={opt} className="flex items-start gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => handleCheckboxChange(field.name, opt, e.target.checked)}
                                      className="mt-1 w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                                    />
                                    <span className="text-sm text-slate-700 leading-snug">{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {field.type === 'scoring' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {field.options?.map((opt: string) => {
                                const maxScore = field.options.length;
                                const currentScores = evaluationData[`summary_${field.name}`] || {};
                                return (
                                  <div key={opt} className="flex items-center gap-3 border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={1}
                                      value={currentScores[opt] || ''}
                                      onChange={(e) => {
                                        let val: any = parseInt(e.target.value);
                                        if (isNaN(val)) val = '';
                                        else if (val < 1) val = 1;
                                        else if (val > maxScore) val = maxScore;
                                        handleSummaryScoreChange(field.name, opt, val);
                                      }}
                                      className="w-12 px-2 py-1.5 text-center bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
                                    />
                                    <span className="text-sm text-slate-700">{opt}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
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
            form="evaluation-form"
            disabled={saving || !selectedTemplateId}
            className="px-6 py-2.5 bg-[#5A305A] text-white font-medium rounded-xl hover:bg-[#5A305A]/90 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Simpan Hasil
          </button>
        </div>
      </div>
    </div>
  );
}
