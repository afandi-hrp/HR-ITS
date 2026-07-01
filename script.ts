import * as fs from 'fs';

const content = fs.readFileSync('src/pages/ApplicationForm.tsx', 'utf-8');
const lines = content.split('\n');

const remunStartIndex = 2212; 
const remunEndIndex = 2351; 

const remunBlock = lines.slice(remunStartIndex, remunEndIndex);
let newLines = [...lines.slice(0, remunStartIndex), ...lines.slice(remunEndIndex)];

// Remove the payslip block from LAMPIRAN DOKUMEN (which is around index 2417 to 2435 in the original file, but let's find it dynamically)
const payslipStart = newLines.findIndex(l => l.includes('{!hideSalary && initialData?.payslip_url && ('));
if (payslipStart !== -1) {
    let openBraces = 0;
    let payslipEnd = -1;
    for (let i = payslipStart; i < newLines.length; i++) {
        const line = newLines[i];
        if (line.includes('{') || line.includes('(')) {
            openBraces += (line.match(/\{|\(/g) || []).length;
        }
        if (line.includes('}') || line.includes(')')) {
            openBraces -= (line.match(/\}|\)/g) || []).length;
        }
        if (openBraces <= 0) {
            payslipEnd = i;
            break;
        }
    }
    // Also remove any surrounding empty lines if we want, but simple slice is fine
    // Since our counting might be slightly off with complex regex, we can just replace lines 2417-2435 manually, wait.
    // It's safer to just find index by exact string
}

// Safer approach: string replacement!
let fileContent = newLines.join('\n');

const payslipBlockToRemove = `              {!hideSalary && initialData?.payslip_url && (
                <div className="pdf-avoid-break">
                  <h3 className="font-bold text-slate-700 mb-4">Slip Gaji Terakhir</h3>
                  <div className="space-y-8">
                    {initialData.payslip_url.split(',').map((url: string, index: number) => {
                      const trimmedUrl = url.trim();
                      return (
                        <div key={index}>
                          {trimmedUrl.split('?')[0].toLowerCase().endsWith('.pdf') ? (
                            <PdfToImages url={trimmedUrl} title={\`Slip Gaji \${index + 1}\`} />
                          ) : (
                            <img src={trimmedUrl} alt={\`Slip Gaji \${index + 1}\`} className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}`;

fileContent = fileContent.replace(payslipBlockToRemove, '');

const formEndIndex = fileContent.lastIndexOf('</form>');

let remunBlockStr = remunBlock.join('\n');
remunBlockStr = remunBlockStr.replace(
    'print:mt-8", readOnly ? "w-full rounded-2xl shadow-sm border border-slate-200" : "w-full max-w-4xl rounded-2xl shadow-xl")}>',
    'print:mt-8 mt-8", readOnly ? "w-full rounded-2xl shadow-sm border border-slate-200" : "w-full max-w-4xl rounded-2xl shadow-xl")} style={readOnly ? { pageBreakBefore: \'always\' } : {}}>'
);

// Add the payslip full image printer AT THE END of Remuneration Section if readOnly
const payslipAppend = `
            {readOnly && initialData?.payslip_url && (
              <div className="w-full block max-w-4xl mx-auto bg-white p-4 sm:p-8 mt-8 border-t-4 border-slate-100 print:border-none" style={{ pageBreakBefore: 'always' }}>
                <h2 className="text-xl font-bold text-slate-900 mb-6 border-b pb-2">LAMPIRAN SLIP GAJI</h2>
                <div className="pdf-avoid-break">
                  <div className="space-y-8">
                    {initialData.payslip_url.split(',').map((url: string, index: number) => {
                      const trimmedUrl = url.trim();
                      return (
                        <div key={index}>
                          {trimmedUrl.split('?')[0].toLowerCase().endsWith('.pdf') ? (
                            <PdfToImages url={trimmedUrl} title={\`Slip Gaji \${index + 1}\`} />
                          ) : (
                            <img src={trimmedUrl} alt={\`Slip Gaji \${index + 1}\`} className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
`;

remunBlockStr = remunBlockStr.replace('        )}', '        )}\n' + payslipAppend);

fileContent = fileContent.substring(0, formEndIndex) + '\n' + remunBlockStr + '\n' + fileContent.substring(formEndIndex);

fs.writeFileSync('src/pages/ApplicationForm.tsx', fileContent);
