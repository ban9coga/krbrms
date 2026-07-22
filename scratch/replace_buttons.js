const fs = require('fs');
const path = require('path');

const clientFile = path.resolve('src/app/admin/events/[eventId]/live-draw/LiveDrawClient.tsx');
let clientContent = fs.readFileSync(clientFile, 'utf8');

// Replace "Lihat Hasil Draw" with "Ulangi Draw" and change onClick
clientContent = clientContent.replace(/onClick=\{\(\) => setResultModal\('draft'\)\}([\s\S]*?)Lihat Hasil Draw/g, "onClick={resetDraw}$1Ulangi Draw");

// Remove "Lihat Moto Tersimpan" button entirely
clientContent = clientContent.replace(/<button[\s\S]*?onClick=\{\(\) => setResultModal\('saved'\)\}[\s\S]*?Lihat Moto Tersimpan\s*<\/button>/g, "");

fs.writeFileSync(clientFile, clientContent);
console.log('Replaced Ulangi Draw properly');
