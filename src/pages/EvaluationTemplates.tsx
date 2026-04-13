import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { EvaluationTemplate } from '../types';
import { FileText, Plus, Search, RefreshCcw, Trash2, X, Save, Loader2, List, CheckSquare, AlignLeft, Settings2 } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import ConfirmModal from '../components/ConfirmModal';
import { cn } from '../lib/utils';

interface ScaleItem {
  score: number;
  label: string;
}

interface Criterion {
  name: string;
  description: string;
}

interface Category {
  name: string;
  criteria: Criterion[];
}

interface SummaryField {
  name: string;
  type: 'textarea' | 'radio' | 'checkbox_group';
  placeholder?: string;
  options?: string[];
}

export default function EvaluationTemplates() {
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EvaluationTemplate | null>(null);
  
  // Basic Info State
  const [name, setName] = useState('');
  const [type, setType] = useState<'HR' | 'USER'>('HR');
  const [targetRole, setTargetRole] = useState<'ALL' | 'HR_ADMIN' | 'USER_MANAGER' | string>('ALL');
  const [targetDepartment, setTargetDepartment] = useState('ALL');
  const [departments, setDepartments] = useState<string[]>([]);
  
  // Builder State
  const [scales, setScales] = useState<ScaleItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summaryFields, setSummaryFields] = useState<SummaryField[]>([]);

  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; id: string; loading?: boolean }>({ isOpen: false, id: '', loading: false });
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('department')
        .not('department', 'is', null);
      
      if (!error && data) {
        const uniqueDepts = Array.from(new Set(data.map(d => d.department).filter(Boolean)));
        setDepartments(uniqueDepts as string[]);
      }
    } catch (err) {
      console.error("Error fetching departments:", err);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    let query = supabase
      .from('evaluation_templates')
      .select('*');

    if (debouncedSearch) {
      query = query.ilike('name', `%${debouncedSearch}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
    fetchDepartments();
  }, [debouncedSearch]);

  const handleOpenModal = (template?: EvaluationTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setName(template.name);
      setType(template.type);
      setTargetRole(template.target_role || 'ALL');
      setTargetDepartment(template.target_department || 'ALL');
      
      const schema = template.form_schema as any;
      setScales(schema.scale || []);
      setCategories(schema.categories || []);
      setSummaryFields(schema.summary_fields || []);
    } else {
      setEditingTemplate(null);
      setName('');
      setType('HR');
      setTargetRole('ALL');
      setTargetDepartment('ALL');
      setScales([{ score: 1, label: 'Kurang' }, { score: 2, label: 'Cukup' }, { score: 3, label: 'Baik' }]);
      setCategories([{ name: 'Kriteria Penilaian', criteria: [{ name: '', description: '' }] }]);
      setSummaryFields([{ name: 'Catatan', type: 'textarea', placeholder: 'Masukkan catatan...' }]);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name) {
      toast({ title: 'Peringatan', description: 'Nama template harus diisi.', variant: 'destructive' });
      return;
    }

    // Validation
    if (scales.length === 0) {
      toast({ title: 'Peringatan', description: 'Minimal harus ada 1 skala penilaian.', variant: 'destructive' });
      return;
    }
    if (categories.length === 0 || categories.some(c => c.criteria.length === 0)) {
      toast({ title: 'Peringatan', description: 'Kategori dan kriteria tidak boleh kosong.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const payload = {
      name,
      type,
      target_role: targetRole,
      target_department: targetDepartment,
      form_schema: {
        scale: scales,
        categories: categories,
        summary_fields: summaryFields
      }
    };

    const { error } = editingTemplate 
      ? await supabase.from('evaluation_templates').update(payload).eq('id', editingTemplate.id)
      : await supabase.from('evaluation_templates').insert([payload]);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: `Template evaluasi berhasil ${editingTemplate ? 'diperbarui' : 'disimpan'}.` });
      setIsModalOpen(false);
      fetchTemplates();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({ isOpen: true, id, loading: false });
  };

  const executeDelete = async (id: string) => {
    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      const { error } = await supabase.from('evaluation_templates').delete().eq('id', id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Berhasil', description: 'Template evaluasi berhasil dihapus.' });
        fetchTemplates();
      }
    } finally {
      setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
    }
  };

  // --- Builder Handlers ---

  // Scale
  const addScale = () => setScales([...scales, { score: scales.length + 1, label: '' }]);
  const updateScale = (index: number, field: keyof ScaleItem, value: any) => {
    const newScales = [...scales];
    newScales[index] = { ...newScales[index], [field]: field === 'score' ? Number(value) : value };
    setScales(newScales);
  };
  const removeScale = (index: number) => setScales(scales.filter((_, i) => i !== index));

  // Category
  const addCategory = () => setCategories([...categories, { name: '', criteria: [{ name: '', description: '' }] }]);
  const updateCategoryName = (index: number, name: string) => {
    const newCats = [...categories];
    newCats[index].name = name;
    setCategories(newCats);
  };
  const removeCategory = (index: number) => setCategories(categories.filter((_, i) => i !== index));

  // Criteria
  const addCriterion = (catIndex: number) => {
    const newCats = [...categories];
    newCats[catIndex].criteria.push({ name: '', description: '' });
    setCategories(newCats);
  };
  const updateCriterion = (catIndex: number, critIndex: number, field: keyof Criterion, value: string) => {
    const newCats = [...categories];
    newCats[catIndex].criteria[critIndex] = { ...newCats[catIndex].criteria[critIndex], [field]: value };
    setCategories(newCats);
  };
  const removeCriterion = (catIndex: number, critIndex: number) => {
    const newCats = [...categories];
    newCats[catIndex].criteria = newCats[catIndex].criteria.filter((_, i) => i !== critIndex);
    setCategories(newCats);
  };

  // Summary Fields
  const addSummaryField = () => setSummaryFields([...summaryFields, { name: '', type: 'textarea', placeholder: '' }]);
  const updateSummaryField = (index: number, field: keyof SummaryField, value: any) => {
    const newFields = [...summaryFields];
    if (field === 'options') {
      // Convert comma separated string to array
      newFields[index].options = value.split(',').map((s: string) => s.trim()).filter(Boolean);
    } else {
      newFields[index] = { ...newFields[index], [field]: value };
    }
    setSummaryFields(newFields);
  };
  const removeSummaryField = (index: number) => setSummaryFields(summaryFields.filter((_, i) => i !== index));

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Template Evaluasi
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Kelola form penilaian untuk interview HR dan User dengan mudah.
          </p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
        >
          <Plus size={20} />
          Tambah Template
        </button>
      </div>

      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cari template evaluasi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          />
        </div>
        <button 
          onClick={fetchTemplates}
          className="p-2.5 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
        >
          <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <div 
            key={template.id} 
            onClick={() => handleOpenModal(template)}
            className="bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-500 hover:ring-2 hover:ring-indigo-200 hover:shadow-md transition-all group cursor-pointer flex flex-col"
          >
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  template.type === 'HR' ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
                )}>
                  <FileText size={20} />
                </div>
                <h3 className="font-bold text-slate-900 break-words mt-0.5">{template.name}</h3>
              </div>
              <span className={cn(
                "px-2.5 py-1 rounded-md text-xs font-bold tracking-wider shrink-0",
                template.type === 'HR' ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
              )}>
                {template.type}
              </span>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
              <span className="text-xs text-slate-400">Dibuat: {new Date(template.created_at).toLocaleDateString()}</span>
              <div className="flex gap-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(template.id);
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Hapus Template"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {templates.length === 0 && !loading && (
          <div className="col-span-full text-center py-20 bg-white/70 backdrop-blur-md rounded-2xl border border-dashed border-slate-300">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <FileText className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Belum ada template evaluasi</h3>
            <p className="text-slate-500">Buat template evaluasi pertama Anda.</p>
          </div>
        )}
      </div>

      {/* Visual Builder Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-5xl max-h-[95vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                  <Settings2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">{editingTemplate ? 'Edit Template Evaluasi' : 'Buat Template Evaluasi'}</h2>
                  <p className="text-sm text-slate-500">Rancang form penilaian tanpa perlu coding.</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all shrink-0">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto bg-slate-50/50 flex-1">
              <div className="max-w-4xl mx-auto space-y-8">
                
                {/* Basic Info */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">Informasi Dasar</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Nama Template</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Contoh: Template Interview HR"
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Jenis Template</label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as 'HR' | 'USER')}
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        <option value="HR">HR (Human Resources)</option>
                        <option value="USER">USER (User / Manager)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Akses Role</label>
                      <select
                        value={targetRole}
                        onChange={(e) => setTargetRole(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        <option value="ALL">Semua Role</option>
                        <option value="HR_ADMIN">Hanya HR Admin</option>
                        <option value="USER_MANAGER">Hanya User Manager</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Akses Departemen</label>
                      <select
                        value={targetDepartment}
                        onChange={(e) => setTargetDepartment(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        <option value="ALL">Semua Departemen</option>
                        {departments.map((dept, idx) => (
                          <option key={idx} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Scale Builder */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Skala Penilaian</h3>
                      <p className="text-sm text-slate-500">Tentukan rentang nilai (misal: 1-4 atau 1-5).</p>
                    </div>
                    <button onClick={addScale} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors">
                      <Plus size={16} /> Tambah Skala
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {scales.map((scale, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <input
                          type="number"
                          value={scale.score}
                          onChange={(e) => updateScale(idx, 'score', e.target.value)}
                          className="w-12 sm:w-16 shrink-0 px-2 py-1.5 text-center font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Nilai"
                        />
                        <input
                          type="text"
                          value={scale.label}
                          onChange={(e) => updateScale(idx, 'label', e.target.value)}
                          className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Label (Cth: Baik)"
                        />
                        <button onClick={() => removeScale(idx)} className="p-1.5 shrink-0 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Categories & Criteria Builder */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Kategori & Kriteria</h3>
                      <p className="text-sm text-slate-500">Pertanyaan atau poin yang akan dinilai.</p>
                    </div>
                    <button onClick={addCategory} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors">
                      <Plus size={16} /> Tambah Kategori
                    </button>
                  </div>

                  <div className="space-y-6">
                    {categories.map((cat, catIdx) => (
                      <div key={catIdx} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                        {/* Category Header */}
                        <div className="bg-slate-100/50 p-4 border-b border-slate-200 flex items-center gap-3">
                          <input
                            type="text"
                            value={cat.name}
                            onChange={(e) => updateCategoryName(catIdx, e.target.value)}
                            placeholder="Nama Kategori (Cth: Core Values)"
                            className="flex-1 px-3 py-2 font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button onClick={() => removeCategory(catIdx)} className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Hapus Kategori">
                            <Trash2 size={18} />
                          </button>
                        </div>
                        
                        {/* Criteria List */}
                        <div className="p-4 space-y-3">
                          {cat.criteria.map((crit, critIdx) => (
                            <div key={critIdx} className="flex gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                              <div className="flex-1 space-y-2">
                                <input
                                  type="text"
                                  value={crit.name}
                                  onChange={(e) => updateCriterion(catIdx, critIdx, 'name', e.target.value)}
                                  placeholder="Nama Kriteria (Cth: Integrity)"
                                  className="w-full px-3 py-1.5 text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                                />
                                <textarea
                                  value={crit.description}
                                  onChange={(e) => updateCriterion(catIdx, critIdx, 'description', e.target.value)}
                                  placeholder="Deskripsi kriteria..."
                                  rows={2}
                                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none"
                                />
                              </div>
                              <button onClick={() => removeCriterion(catIdx, critIdx)} className="p-2 h-fit text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors mt-1">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => addCriterion(catIdx)} className="w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                            <Plus size={16} /> Tambah Kriteria
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary Fields Builder */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Kolom Kesimpulan (Summary)</h3>
                      <p className="text-sm text-slate-500">Input tambahan di akhir form (Catatan, Rekomendasi, dll).</p>
                    </div>
                    <button onClick={addSummaryField} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors">
                      <Plus size={16} /> Tambah Kolom
                    </button>
                  </div>

                  <div className="space-y-4">
                    {summaryFields.map((field, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex gap-3">
                            <input
                              type="text"
                              value={field.name}
                              onChange={(e) => updateSummaryField(idx, 'name', e.target.value)}
                              placeholder="Nama Kolom (Cth: Kelebihan)"
                              className="flex-1 px-3 py-2 text-sm font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <select
                              value={field.type}
                              onChange={(e) => updateSummaryField(idx, 'type', e.target.value)}
                              className="w-40 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="textarea">Teks Panjang</option>
                              <option value="radio">Pilihan Tunggal (Radio)</option>
                              <option value="checkbox_group">Pilihan Ganda (Checkbox)</option>
                            </select>
                          </div>

                          {field.type === 'textarea' ? (
                            <input
                              type="text"
                              value={field.placeholder || ''}
                              onChange={(e) => updateSummaryField(idx, 'placeholder', e.target.value)}
                              placeholder="Teks Placeholder (Opsional)"
                              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          ) : (
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={field.options?.join(', ') || ''}
                                onChange={(e) => updateSummaryField(idx, 'options', e.target.value)}
                                placeholder="Masukkan opsi, pisahkan dengan koma (Cth: Ya, Tidak, Mungkin)"
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <p className="text-xs text-slate-500">Pisahkan setiap opsi dengan tanda koma (,)</p>
                            </div>
                          )}
                        </div>
                        <button onClick={() => removeSummaryField(idx)} className="p-2 h-fit text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors mt-1">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                    {summaryFields.length === 0 && (
                      <p className="text-center text-sm text-slate-500 py-4 italic">Tidak ada kolom kesimpulan tambahan.</p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 bg-white border-t border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0 z-10">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
              >
                Batal
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                {saving ? 'Menyimpan...' : 'Simpan Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => executeDelete(confirmModal.id)}
        title="Hapus Template"
        message="Apakah Anda yakin ingin menghapus template ini? Tindakan ini tidak dapat dibatalkan."
        confirmText="Hapus"
        variant="danger"
        loading={confirmModal.loading}
      />
    </div>
  );
}
