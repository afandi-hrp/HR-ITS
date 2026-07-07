import re

with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

old_header = """
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#3D2C44]">
            {userName ? (
              <span>
                {(() => {
                  const hour = new Date().getHours();
                  let greeting = 'Halo';
                  if (hour >= 5 && hour < 11) greeting = 'Selamat pagi';
                  else if (hour >= 11 && hour < 15) greeting = 'Selamat siang';
                  else if (hour >= 15 && hour < 18) greeting = 'Selamat sore';
                  else greeting = 'Selamat malam';
                  const firstName = userName.split(' ')[0];
                  return `${greeting}, `;
                })()}
                <span className="text-indigo-600">{userName.split(' ')[0]}</span>!
              </span>
            ) : 'Dashboard'}
          </h1>
          <p className="text-sm font-medium text-slate-500 max-w-xl">
            Ringkasan aktivitas rekrutmen dan status kandidat untuk hari ini, {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
          </p>
        </div>
"""

new_header = """
        <div className="space-y-1">
          {userName && (
            <div className="text-lg font-semibold text-[#3D2C44]/80 mb-1">
              {(() => {
                const hour = new Date().getHours();
                let greeting = 'Halo';
                if (hour >= 5 && hour < 11) greeting = 'Selamat pagi';
                else if (hour >= 11 && hour < 15) greeting = 'Selamat siang';
                else if (hour >= 15 && hour < 18) greeting = 'Selamat sore';
                else greeting = 'Selamat malam';
                return `${greeting}, `;
              })()}
              <span className="text-indigo-600 font-bold">{userName.split(' ')[0]}</span>!
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
