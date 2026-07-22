const fs = require('fs');
const path = require('path');

const cssFile = path.resolve('src/app/admin/events/[eventId]/live-draw/live-draw.css');
let cssContent = fs.readFileSync(cssFile, 'utf8');

// Replace red colors with yellow/gold
cssContent = cssContent.replace(/#ff0000/g, '#f8ce3d'); // bright red -> yellow
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.08\)/g, 'rgba(248, 206, 61, 0.08)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.28\)/g, 'rgba(248, 206, 61, 0.28)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.18\)/g, 'rgba(248, 206, 61, 0.18)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.4\)/g, 'rgba(248, 206, 61, 0.4)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.2\)/g, 'rgba(248, 206, 61, 0.2)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.35\)/g, 'rgba(248, 206, 61, 0.35)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.5\)/g, 'rgba(248, 206, 61, 0.5)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.55\)/g, 'rgba(248, 206, 61, 0.55)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.72\)/g, 'rgba(248, 206, 61, 0.72)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.32\)/g, 'rgba(248, 206, 61, 0.32)');
cssContent = cssContent.replace(/rgba\(255, 0, 0, 0\.3\)/g, 'rgba(248, 206, 61, 0.3)');

// Replace green colors (from primary action mapping)
cssContent = cssContent.replace(/#2ecc71/g, '#f8ce3d');
cssContent = cssContent.replace(/#1d4ed8/g, '#f8ce3d'); // blue shadow

fs.writeFileSync(cssFile, cssContent);

const tsxFile = path.resolve('src/app/admin/events/[eventId]/live-draw/LiveDrawClient.tsx');
let tsxContent = fs.readFileSync(tsxFile, 'utf8');

tsxContent = tsxContent.replace(/#2ecc71/g, '#f8ce3d'); // Spin button green
tsxContent = tsxContent.replace(/#1d4ed8/g, '#f8ce3d'); 
tsxContent = tsxContent.replace(/#e60000/g, '#e9c400'); // red to yellow
tsxContent = tsxContent.replace(/background: drawing \|\| hasDrawn \|\| \(batchMode === 'CUSTOM_BATCH_SIZES' && Boolean\(customBatchError\)\) \? '#ddd' : '#2ecc71',/g, "background: drawing || hasDrawn || (batchMode === 'CUSTOM_BATCH_SIZES' && Boolean(customBatchError)) ? '#ddd' : '#f8ce3d',");
tsxContent = tsxContent.replace(/background: drawing \|\| hasDrawn \? '#ddd' : '#2ecc71',/g, "background: drawing || hasDrawn ? '#ddd' : '#f8ce3d',");


fs.writeFileSync(tsxFile, tsxContent);
console.log('Done accent replacement');
