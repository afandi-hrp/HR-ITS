import * as fs from 'fs';

let content = fs.readFileSync('src/pages/CandidateProfile.tsx', 'utf-8');

// 1. Add states
const stateInjection = `  const [expandedEvaluations, setExpandedEvaluations] = useState<string[]>([]);
  const [forceHideSalary, setForceHideSalary] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);`;

content = content.replace('  const [expandedEvaluations, setExpandedEvaluations] = useState<string[]>([]);', stateInjection);

// 2. Add click outside effect
const effectInjection = `  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDownloadMenu && !(event.target as Element).closest('.download-menu-container')) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDownloadMenu]);`;

// Find where to inject effect, maybe after isZipping state
const isZippingState = `  const [isZipping, setIsZipping] = useState(false);`;
content = content.replace(isZippingState, isZippingState + '\n' + effectInjection);

// 3. Update handlePrint
const oldHandlePrint = `  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printElement(printRef.current, \`Form_Lamaran_\${linkedData?.full_name?.replace(/\\s+/g, '_') || 'Kandidat'}\`);
      toast({
        title: "Berhasil",
        description: "Dokumen berhasil disiapkan untuk dicetak.",
      });
    } catch (error: any) {
      if (error.message === 'POPUP_BLOCKED') {
        toast({
          title: "Popup Diblokir",
          description: "Browser Anda memblokir popup. Silakan izinkan popup (pop-up blocker) untuk situs ini agar dapat mencetak PDF.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Gagal",
          description: "Gagal menyiapkan dokumen untuk dicetak.",
          variant: "destructive"
        });
      }
    } finally {
      setIsPrinting(false);
    }
  };`;

const newHandlePrint = `  const handlePrint = async (hideSalaryOverride = false) => {
    setShowDownloadMenu(false);
    if (hideSalaryOverride) {
      setForceHideSalary(true);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    setIsPrinting(true);
    try {
      await printElement(printRef.current, \`Form_Lamaran_\${linkedData?.full_name?.replace(/\\s+/g, '_') || 'Kandidat'}\`);
      toast({
        title: "Berhasil",
        description: "Dokumen berhasil disiapkan untuk dicetak.",
      });
    } catch (error: any) {
      if (error.message === 'POPUP_BLOCKED') {
        toast({
          title: "Popup Diblokir",
          description: "Browser Anda memblokir popup. Silakan izinkan popup (pop-up blocker) untuk situs ini agar dapat mencetak PDF.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Gagal",
          description: "Gagal menyiapkan dokumen untuk dicetak.",
          variant: "destructive"
        });
      }
    } finally {
      setIsPrinting(false);
      setForceHideSalary(false);
    }
  };`;

content = content.replace(oldHandlePrint, newHandlePrint);

// 4. Update the button
const oldButton = `<button
                    onClick={() => handlePrint()}
                    disabled={isPrinting}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors text-sm font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isPrinting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Mengunduh...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Unduh PDF
                      </>
                    )}
                  </button>`;

const newButton = `
                  <div className="relative download-menu-container">
                    <button
                      onClick={() => profile?.role !== 'USER_MANAGER' ? setShowDownloadMenu(!showDownloadMenu) : handlePrint(true)}
                      disabled={isPrinting}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors text-sm font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isPrinting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Mengunduh...
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          Unduh PDF
                          {profile?.role !== 'USER_MANAGER' && (
                            <svg className={\`w-4 h-4 ml-1 transition-transform \${showDownloadMenu ? 'rotate-180' : ''}\`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                          )}
                        </>
                      )}
                    </button>
                    {showDownloadMenu && profile?.role !== 'USER_MANAGER' && !isPrinting && (
                      <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                        <button
                          onClick={() => handlePrint(true)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 border-b border-slate-100 transition-colors"
                        >
                          Unduh Form Pelamar Saja
                        </button>
                        <button
                          onClick={() => handlePrint(false)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors"
                        >
                          Unduh Form Pelamar + Remunerasi
                        </button>
                      </div>
                    )}
                  </div>
`;

content = content.replace(oldButton, newButton);

// 5. Update ApplicationForm props
const oldAppForm = `<ApplicationForm readOnly initialData={linkedData} hideSalary={profile?.role === 'USER_MANAGER'} />`;
const newAppForm = `<ApplicationForm readOnly initialData={linkedData} hideSalary={forceHideSalary || profile?.role === 'USER_MANAGER'} />`;
content = content.replace(oldAppForm, newAppForm);

fs.writeFileSync('src/pages/CandidateProfile.tsx', content);
