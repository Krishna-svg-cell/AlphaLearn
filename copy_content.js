/**
 * Run this script to copy class content data to the public/content directory.
 * Usage: node copy_content.js
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'data');
const dstDir = path.join(__dirname, 'public', 'content');

// Ensure destination exists
if (!fs.existsSync(dstDir)) {
  fs.mkdirSync(dstDir, { recursive: true });
  console.log('Created:', dstDir);
}

// Copy all JSON files
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json'));
files.forEach(f => {
  fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
  console.log('Copied:', f);
});

console.log(`\n✅ Done! ${files.length} files copied to public/content/`);
