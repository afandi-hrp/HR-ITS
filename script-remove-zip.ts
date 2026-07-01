import * as fs from 'fs';

let content = fs.readFileSync('src/pages/CandidateProfile.tsx', 'utf-8');

content = content.replace('import JSZip from "jszip";', '');
content = content.replace('const [isZipping, setIsZipping] = useState(false);', '');

// Find handleDownloadZip function and remove it
const zipStart = content.indexOf('const handleDownloadZip = async () => {');
if (zipStart !== -1) {
    let openBraces = 0;
    let zipEnd = -1;
    let inFunction = false;
    for (let i = zipStart; i < content.length; i++) {
        if (content[i] === '{') {
            openBraces++;
            inFunction = true;
        } else if (content[i] === '}') {
            openBraces--;
        }
        
        if (inFunction && openBraces === 0) {
            zipEnd = i + 1; // Include the closing brace
            break;
        }
    }
    if (zipEnd !== -1) {
        content = content.substring(0, zipStart) + content.substring(zipEnd);
    }
}

fs.writeFileSync('src/pages/CandidateProfile.tsx', content);
