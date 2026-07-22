const fs = require('fs');
const path = require('path');

const cssFile = path.resolve('src/app/admin/events/[eventId]/live-draw/live-draw.css');
let cssContent = fs.readFileSync(cssFile, 'utf8');

// Update live-draw.css
cssContent = cssContent.replace(/background: #0e0e0e !important;/g, 'background: #f5ecd7 !important;');
cssContent = cssContent.replace(/background-image:\s+linear-gradient\(45deg, #131313 25%, transparent 25%, transparent 75%, #131313 75%, #131313\),\s+linear-gradient\(45deg, #131313 25%, transparent 25%, transparent 75%, #131313 75%, #131313\) !important;/g, '');
cssContent = cssContent.replace(/radial-gradient\(circle at 16% 10%, rgba\(255, 0, 0, 0.18\), transparent 28%\),\s+radial-gradient\(circle at 82% 0%, rgba\(233, 196, 0, 0.12\), transparent 24%\),\s+linear-gradient\(115deg, transparent 0%, transparent 54%, rgba\(255, 0, 0, 0.08\) 54%, transparent 62%\)/g, 'linear-gradient(110deg, rgba(38, 8, 3, 0.5) 0%, rgba(38, 8, 3, 0.18) 48%, rgba(38, 8, 3, 0.42) 100%), rgba(38, 8, 3, 0.16)');
cssContent = cssContent.replace(/background-image:\s+linear-gradient\(45deg, #fff 25%, transparent 25%\),\s+linear-gradient\(-45deg, #fff 25%, transparent 25%\),\s+linear-gradient\(45deg, transparent 75%, #fff 75%\),\s+linear-gradient\(-45deg, transparent 75%, #fff 75%\);/g, 'background-image: url("/homepage-hero-texture-v2.webp"); background-size: cover; opacity: 1;');

// Change the main background to orange hero
cssContent = cssContent.replace(/\.ld-shell {([\s\S]*?)}/g, (match, body) => {
  return `.ld-shell {${body.replace('background: #f5ecd7 !important;', 'background: #e64816 !important;')}}`;
});

// Remove global color reset since we want white text on orange
cssContent = cssContent.replace(/color: #e5e2e1 !important;/g, 'color: #fffaf0 !important;');
cssContent = cssContent.replace(/color: #ffffff/g, 'color: #fffaf0');

// Replace dark grays with dark brown/warm darks
cssContent = cssContent.replace(/#151515/g, 'rgba(29, 13, 7, 0.46)');
cssContent = cssContent.replace(/#1c1b1b/g, 'rgba(29, 13, 7, 0.62)');
cssContent = cssContent.replace(/#2a2a2a/g, 'rgba(255, 250, 240, 0.15)');
cssContent = cssContent.replace(/#101010/g, 'rgba(29, 13, 7, 0.3)');
cssContent = cssContent.replace(/#353534/g, 'rgba(255, 250, 240, 0.2)');
cssContent = cssContent.replace(/#222/g, 'rgba(29, 13, 7, 0.8)');

// Replace accents
cssContent = cssContent.replace(/#ff0000/g, '#f8ce3d'); // Red to yellow
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.08\)/g, 'rgba(248, 206, 61, 0.1)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.28\)/g, 'rgba(248, 206, 61, 0.28)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.4\)/g, 'rgba(248, 206, 61, 0.4)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.85\)/g, 'rgba(29, 13, 7, 0.85)');

// Replace table hover
cssContent = cssContent.replace(/#1f1f1f/g, 'rgba(29, 13, 7, 0.7)');
cssContent = cssContent.replace(/#1a1500/g, 'rgba(255, 250, 240, 0.05)');

fs.writeFileSync(cssFile, cssContent);

// Update LiveDrawClient.tsx
const clientFile = path.resolve('src/app/admin/events/[eventId]/live-draw/LiveDrawClient.tsx');
let clientContent = fs.readFileSync(clientFile, 'utf8');

clientContent = clientContent.replace(/#1c1b1b/g, 'rgba(29, 13, 7, 0.62)');
clientContent = clientContent.replace(/#1a1500/g, 'rgba(255, 250, 240, 0.05)');
clientContent = clientContent.replace(/#353534/g, 'rgba(255, 250, 240, 0.2)');
clientContent = clientContent.replace(/#151515/g, 'rgba(29, 13, 7, 0.46)');
clientContent = clientContent.replace(/#111111/g, 'rgba(29, 13, 7, 0.8)');
clientContent = clientContent.replace(/#0a1628/g, 'rgba(248, 206, 61, 0.1)');
clientContent = clientContent.replace(/#1d4ed8/g, '#f8ce3d');
clientContent = clientContent.replace(/#16a34a/g, '#fffaf0');
clientContent = clientContent.replace(/#001a00/g, 'rgba(29, 13, 7, 0.7)');
clientContent = clientContent.replace(/#166534/g, '#fffaf0');
clientContent = clientContent.replace(/rgba\(28,27,27,0.85\)/g, 'rgba(29,13,7,0.85)');
clientContent = clientContent.replace(/rgba\(28,27,27,1\)/g, 'rgba(29,13,7,1)');
clientContent = clientContent.replace(/#1a0000/g, 'rgba(255, 250, 240, 0.08)');

// Buttons
clientContent = clientContent.replace(/#2ecc71/g, '#f8ce3d');
clientContent = clientContent.replace(/background: drawing \|\| hasDrawn \|\| \(batchMode === 'CUSTOM_BATCH_SIZES' && Boolean\(customBatchError\)\) \? '#ddd' : '#f8ce3d',/g, "background: drawing || hasDrawn || (batchMode === 'CUSTOM_BATCH_SIZES' && Boolean(customBatchError)) ? 'rgba(255, 250, 240, 0.3)' : '#f8ce3d',");
clientContent = clientContent.replace(/color: '#9a9693'/g, "color: '#fffaf0'");

fs.writeFileSync(clientFile, clientContent);
console.log('Done replacing colors.');
