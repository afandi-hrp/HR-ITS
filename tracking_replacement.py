import re

with open('src/pages/CandidateTracking.tsx', 'r') as f:
    content = f.read()

# Replace the beginning to add useRef, Edit, Save, Check, X
content = content.replace(
    'import { Download, Search, Loader2 } from "lucide-react";',
    'import { Download, Search, Loader2, Edit2, Check, X } from "lucide-react";\nimport { useRef } from "react";'
)

# Insert new state for editing
state_str = """
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);

  const handleTopScroll = () => {
    if (bottomScrollRef.current && topScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  const handleEdit = (c: any) => {
    setEditingId(c.id);
    setEditForm({
      trial_1_date: c.trial_1_date || "",
      trial_2_date: c.trial_2_date || "",
      trial_3_date: c.trial_3_date || "",
      trial_result: c.trial_result || "",
      background_check_date: c.background_check_date || "",
      background_check_result: c.background_check_result || "",
      join_date: c.join_date || "",
      finance_reject_reason: c.finance_reject_reason || "",
      notes: c.notes || ""
    });
  };

  const handleSave = async (id: string, isLog: boolean) => {
    try {
      const table = isLog ? "candidate_logs" : "candidates";
      
      const payload: any = {};
      Object.keys(editForm).forEach(k => {
        payload[k] = editForm[k] === "" ? null : editForm[k];
      });

      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", id);
        
      if (error) throw error;
      
      setCandidates(candidates.map(c => c.id === id ? { ...c, ...payload } : c));
      setEditingId(null);
    } catch (err) {
      console.error("Error updating candidate:", err);
      alert("Gagal mengupdate data");
    }
  };
"""

content = content.replace('  const [isExporting, setIsExporting] = useState(false);\n', '  const [isExporting, setIsExporting] = useState(false);\n' + state_str)

# Modify table container and add top scrollbar
table_container = """
        <div className="overflow-x-auto" ref={bottomScrollRef} onScroll={handleBottomScroll}>
"""

content = content.replace('<div className="overflow-x-auto">', 
"""
        <div 
          className="overflow-x-auto border-b border-slate-200" 
          ref={topScrollRef} 
          onScroll={handleTopScroll}
        >
          <div style={{ height: '1px', width: '3800px' }}></div>
        </div>
        <div className="overflow-x-auto" ref={bottomScrollRef} onScroll={handleBottomScroll}>
""")

# Modify the table header to include Aksi
header = """
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">No</th>
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">Aksi</th>
"""
content = content.replace('<th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">No</th>', header)

# Modify the table row to include Edit button and inputs
row_replacement = """
                        <td className="px-4 py-3 border-x border-slate-200">{index + 1}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => handleSave(c.id, !c.status_screening)} className="p-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"><Check size={16}/></button>
                              <button onClick={() => setEditingId(null)} className="p-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"><X size={16}/></button>
                            </div>
                          ) : (
                            <button onClick={() => handleEdit(c)} className="p-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"><Edit2 size={16}/></button>
                          )}
                        </td>
"""
content = content.replace('<td className="px-4 py-3 border-x border-slate-200">{index + 1}</td>', row_replacement)

# Helper to render inputs
input_helper = """
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.trial_1_date} onChange={e => setEditForm({...editForm, trial_1_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.trial_1_date)}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.trial_2_date} onChange={e => setEditForm({...editForm, trial_2_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.trial_2_date)}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.trial_3_date} onChange={e => setEditForm({...editForm, trial_3_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.trial_3_date)}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.trial_result} onChange={e => setEditForm({...editForm, trial_result: e.target.value})} className="border rounded px-2 py-1 text-sm w-32"/>
                          ) : (c.trial_result || "")}
                        </td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.background_check_date} onChange={e => setEditForm({...editForm, background_check_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.background_check_date)}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.background_check_result} onChange={e => setEditForm({...editForm, background_check_result: e.target.value})} className="border rounded px-2 py-1 text-sm w-32"/>
                          ) : (c.background_check_result || "")}
                        </td>
"""

old_trial_bg = """
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{formatDate(c.trial_1_date)}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{formatDate(c.trial_2_date)}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{formatDate(c.trial_3_date)}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.trial_result || ""}</td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{formatDate(c.background_check_date)}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.background_check_result || ""}</td>
"""
content = content.replace(old_trial_bg, input_helper)


# Helper for the rest
input_helper2 = """
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.join_date} onChange={e => setEditForm({...editForm, join_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.join_date)}
                        </td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.finance_reject_reason} onChange={e => setEditForm({...editForm, finance_reject_reason: e.target.value})} className="border rounded px-2 py-1 text-sm w-32"/>
                          ) : (c.finance_reject_reason || "")}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="border rounded px-2 py-1 text-sm w-32"/>
                          ) : (c.notes || "")}
                        </td>
"""

old_rest = """
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{formatDate(c.join_date)}</td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.finance_reject_reason || ""}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.notes || ""}</td>
"""
content = content.replace(old_rest, input_helper2)

# Fix colSpan in No Data
content = content.replace('colSpan={27}', 'colSpan={28}')

with open('src/pages/CandidateTracking.tsx', 'w') as f:
    f.write(content)
print("done")
