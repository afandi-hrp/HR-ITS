import * as fs from 'fs';

let content = fs.readFileSync('src/pages/CandidateProfile.tsx', 'utf-8');

const newFunc = `const formatAsNumberedList = (
  text?: string | null,
  emptyFallback?: React.ReactNode,
  isAssessmentReason: boolean = false
) => {
  if (!text) return emptyFallback;

  const normalizedText = text.replace(/\\\\n/g, '\\n');
  const lines = normalizedText.split('\\n').map((t) => t.trim()).filter(Boolean);

  const mainPoints: string[] = [];
  const conclusionPoints: string[] = [];
  let passedSoftSkills = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBullet = /^[-•*]\\s+/.test(line) || /^\\d+[\\.\\)]\\s+/.test(line);

    if (isBullet) {
      const cleanLine = line.replace(/^[-•*]\\s*/, '').replace(/^\\d+[\\.\\)]\\s*/, '').trim();
      if (isAssessmentReason && passedSoftSkills) {
        conclusionPoints.push(cleanLine);
      } else {
        mainPoints.push(cleanLine);
        if (isAssessmentReason && line.toLowerCase().includes('soft skills')) {
          passedSoftSkills = true;
        }
      }
    } else {
      if (isAssessmentReason && passedSoftSkills) {
        conclusionPoints.push(line);
      } else {
        if (mainPoints.length > 0) {
          mainPoints[mainPoints.length - 1] += ' ' + line;
        } else {
          mainPoints.push(line);
        }
      }
    }
  }

  if (mainPoints.length === 0 && conclusionPoints.length === 0) return emptyFallback;

  return (
    <div className="space-y-3">
      {mainPoints.length > 0 && (
        <ol className="list-decimal pl-4 space-y-1">
          {mainPoints.map((point, idx) => (
            <li key={idx} className="leading-relaxed pl-1">
              {point}
            </li>
          ))}
        </ol>
      )}
      {conclusionPoints.length > 0 && (
        <div className="mt-4 bg-indigo-100/50 border border-indigo-200 rounded-lg p-4 shadow-sm">
          <h5 className="font-semibold text-indigo-900 mb-2 text-sm flex items-center gap-2">
            Kesimpulan & Rekomendasi
          </h5>
          <ol
            className="list-decimal pl-4 space-y-1"
            start={mainPoints.length + 1}
          >
            {conclusionPoints.map((point, idx) => (
              <li key={idx} className="leading-relaxed pl-1 text-indigo-950 font-medium">
                {point}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};`;

const startIdx = content.indexOf('const formatAsNumberedList = (');
if (startIdx !== -1) {
    let openBraces = 0;
    let endIdx = -1;
    let inFunc = false;
    for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') {
            openBraces++;
            inFunc = true;
        } else if (content[i] === '}') {
            openBraces--;
        }
        
        if (inFunc && openBraces === 0) {
            if (content[i+1] === ';') {
                endIdx = i + 2;
            } else {
                endIdx = i + 1;
            }
            break;
        }
    }
    
    if (endIdx !== -1) {
        content = content.substring(0, startIdx) + newFunc + content.substring(endIdx);
    }
}

// Update the function call for assessment reason
// The code might have line breaks, so we will use a regex to replace it
content = content.replace(
  /formatAsNumberedList\(\s*candidate\.assessment_reason,\s*<span className="italic opacity-70">\s*Tidak ada alasan penilaian yang diberikan\.\s*<\/span>,\?\s*\)/g,
  `formatAsNumberedList(
                  candidate.assessment_reason,
                  <span className="italic opacity-70">
                    Tidak ada alasan penilaian yang diberikan.
                  </span>,
                  true
                )`
);

// Alternative replacement in case the above regex fails
content = content.replace(
  'formatAsNumberedList(candidate.assessment_reason, <span className="italic opacity-70">Tidak ada alasan penilaian yang diberikan.</span>)',
  'formatAsNumberedList(candidate.assessment_reason, <span className="italic opacity-70">Tidak ada alasan penilaian yang diberikan.</span>, true)'
);

fs.writeFileSync('src/pages/CandidateProfile.tsx', content);
