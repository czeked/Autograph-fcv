import fs from 'fs';
let content = fs.readFileSync('src/AiAnalyzer.jsx', 'utf8');
content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('src/AiAnalyzer.jsx', content);
console.log('Fixed backticks for React compilation.');
