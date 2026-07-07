import re

with open('src/pages/CandidateTracking.tsx', 'r') as f:
    content = f.read()

# Add pagination states
state_str = """
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
"""
content = re.sub(r'const \[editingId, setEditingId\] = useState<string \| null>\(null\);\n  const \[editForm, setEditForm\] = useState<any>\({}\);', state_str.strip(), content)

# Modify pagination logic inside return
search_str = """
  const filteredCandidates = candidates.filter(
    (c) =>
      c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );
"""

new_search_str = search_str + """
  const totalPages = pageSize === Infinity ? 1 : Math.ceil(filteredCandidates.length / pageSize);
  const paginatedCandidates = pageSize === Infinity ? filteredCandidates : filteredCandidates.slice((currentPage - 1) * pageSize, currentPage * pageSize);
"""

content = content.replace(search_str, new_search_str.strip() + '\n')

# Use paginatedCandidates in render instead of filteredCandidates (except for export and the check of empty)
content = content.replace('filteredCandidates.map((c, index) => {', 'paginatedCandidates.map((c, idx) => {\n                    const index = (currentPage - 1) * (pageSize === Infinity ? 0 : pageSize) + idx;')
content = content.replace('filteredCandidates.length === 0 ?', 'paginatedCandidates.length === 0 ?')


# Add pagination controls below the table
pagination_controls = """
          )}
        </div>
        
        {!isLoading && filteredCandidates.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Tampilkan</span>
              <select 
                className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                value={pageSize === Infinity ? "all" : pageSize}
                onChange={(e) => {
                  if (e.target.value === "all") {
                    setPageSize(Infinity);
                  } else {
                    setPageSize(Number(e.target.value));
                  }
                  setCurrentPage(1);
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={1000}>1000</option>
                <option value="all">Semua</option>
              </select>
              <span className="text-sm text-slate-500">
                dari {filteredCandidates.length} data
              </span>
            </div>
            
            {pageSize !== Infinity && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50 text-sm"
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-slate-600 px-2">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50 text-sm"
                >
                  Selanjutnya
                </button>
              </div>
            )}
          </div>
        )}
      </div>
"""

content = content.replace('          )}\n        </div>\n      </div>', pagination_controls)

with open('src/pages/CandidateTracking.tsx', 'w') as f:
    f.write(content)
print("done")
