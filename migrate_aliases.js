const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getFiles('src');
let updatedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace imports for useApiFetch
  const regex1 = /import\s+\{([^}]+)\}\s+from\s+['"](?:\.\.\/)+hooks\/useApiFetch['"]/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, "import {$1} from '@/src/hooks/useApiFetch'");
    changed = true;
  }

  // Replace imports for supabaseClient
  const regex2 = /import\s+\{([^}]+)\}\s+from\s+['"](?:\.\.\/)+lib\/supabaseClient['"]/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, "import {$1} from '@/src/lib/supabaseClient'");
    changed = true;
  }

  // Same for other shared modules like lib/auth ? 
  // User specifically said: "imports using relative paths to hooks/useApiFetch or lib/supabaseClient"
  
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    updatedCount++;
    console.log('Updated:', file);
  }
}
console.log('Total files updated:', updatedCount);
