import * as fs from 'fs';

let content = fs.readFileSync('src/pages/ApplicationForm.tsx', 'utf-8');

// Add to props
content = content.replace(
  'interface ApplicationFormProps {\n  readOnly?: boolean;\n  initialData?: any;\n  hideSalary?: boolean;\n}',
  'interface ApplicationFormProps {\n  readOnly?: boolean;\n  initialData?: any;\n  hideSalary?: boolean;\n  onlyRemuneration?: boolean;\n}'
);

content = content.replace(
  'export default function ApplicationForm({ readOnly = false, initialData = null, hideSalary = false }: ApplicationFormProps) {',
  'export default function ApplicationForm({ readOnly = false, initialData = null, hideSalary = false, onlyRemuneration = false }: ApplicationFormProps) {'
);

const targetDiv = '<div className={cn("mx-auto bg-white overflow-hidden print:overflow-visible print:shadow-none print:border-none", readOnly ? "w-full rounded-2xl shadow-sm border border-slate-200" : "w-full max-w-4xl rounded-2xl shadow-xl")}>';

content = content.replace(targetDiv, '{!onlyRemuneration && (\n        ' + targetDiv);

content = content.replace('        )}\n      \n        {/* Remuneration Section */}', '        )}\n      </div>\n      )}\n      \n        {/* Remuneration Section */}');

fs.writeFileSync('src/pages/ApplicationForm.tsx', content);
