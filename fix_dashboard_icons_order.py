import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

old_header = """
        <div className="space-y-1">
          {userName && (
            <div className="text-xl font-semibold text-[#3D2C44]/80 mb-1 flex items-center flex-wrap gap-2">
              <span className="flex items-center gap-2">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour >= 5 && hour < 11) return <Sunrise className="text-amber-500" size={24} />;
                  if (hour >= 11 && hour < 15) return <Sun className="text-amber-500" size={24} />;
                  if (hour >= 15 && hour < 18) return <Sunset className="text-amber-500" size={24} />;
                  return <Moon className="text-indigo-400" size={24} />;
                })()}
                <span className="tracking-tight">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour >= 5 && hour < 11) return 'Selamat pagi,';
                  if (hour >= 11 && hour < 15) return 'Selamat siang,';
                  if (hour >= 15 && hour < 18) return 'Selamat sore,';
                  return 'Selamat malam,';
                })()}
                </span>
              </span>
              <span className="text-[#3D2C44] font-bold">
                {userName.split(' ')[0]}
              </span>
            </div>
          )}
          <h1 className="text-4xl font-extrabold tracking-tight text-[#3D2C44]">
            Dashboard
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Ringkasan aktivitas rekrutmen dan status kandidat untuk hari ini, {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
          </p>
        </div>
"""

new_header = """
        <div className="space-y-1">
          {userName && (
            <div className="text-xl font-semibold text-[#3D2C44]/80 mb-1 flex items-center flex-wrap gap-2">
              <span className="tracking-tight">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour >= 5 && hour < 11) return 'Selamat pagi,';
                  if (hour >= 11 && hour < 15) return 'Selamat siang,';
                  if (hour >= 15 && hour < 18) return 'Selamat sore,';
                  return 'Selamat malam,';
                })()}
              </span>
              <span className="text-[#3D2C44] font-bold">
                {userName.split(' ')[0]}
              </span>
              <span className="ml-1 inline-flex items-center">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour >= 5 && hour < 11) return <Sunrise className="text-amber-500 drop-shadow-sm" size={22} />;
                  if (hour >= 11 && hour < 15) return <Sun className="text-amber-500 drop-shadow-sm" size={22} />;
                  if (hour >= 15 && hour < 18) return <Sunset className="text-amber-500 drop-shadow-sm" size={22} />;
                  return <Moon className="text-indigo-500 drop-shadow-sm" size={22} />;
                })()}
              </span>
            </div>
          )}
          <h1 className="text-4xl font-extrabold tracking-tight text-[#3D2C44]">
            Dashboard
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Ringkasan aktivitas rekrutmen dan status kandidat untuk hari ini, {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
          </p>
        </div>
"""

content = content.replace(old_header.strip(), new_header.strip())

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(content)
print("done")
