import re

with open('src/pages/CandidateTracking.tsx', 'r') as f:
    content = f.read()

# Let's add a state for table width
state_str = """
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(3800);

  useEffect(() => {
    if (tableRef.current) {
      setTableWidth(tableRef.current.scrollWidth);
    }
  }, [paginatedCandidates]);
"""

content = content.replace(
    '  const topScrollRef = useRef<HTMLDivElement>(null);\n  const bottomScrollRef = useRef<HTMLDivElement>(null);',
    state_str.strip()
)

content = content.replace('<div style={{ height: \'1px\', width: \'3800px\' }}></div>', '<div style={{ height: \'1px\', width: `${tableWidth}px` }}></div>')
content = content.replace('<table className="w-full text-sm text-left">', '<table ref={tableRef} className="w-full text-sm text-left min-w-[3800px]">')


# Make sure we import useEffect
if 'import { useEffect, useRef' not in content:
    content = content.replace('import { useRef } from "react";', 'import { useEffect, useRef, useState } from "react";')

with open('src/pages/CandidateTracking.tsx', 'w') as f:
    f.write(content)
print("done")
