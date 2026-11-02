/**
 * Production Build Script for CHAOS ARENA
 * Copies `public/index.html` into `dist/index.html` and verifies `netlify/functions/game.ts`.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcHtml = path.join(rootDir, 'public', 'index.html');
const distDir = path.join(rootDir, 'dist');
const distHtml = path.join(distDir, 'index.html');
const fnFile = path.join(rootDir, 'netlify', 'functions', 'game.ts');

if (!fs.existsSync(srcHtml)) {
  throw new Error('Missing public/index.html');
}
if (!fs.existsSync(fnFile)) {
  throw new Error('Missing netlify/functions/game.ts');
}

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(srcHtml, distHtml);
console.log('Production build complete: dist/index.html (' + fs.statSync(distHtml).size + ' bytes) & netlify/functions/game.ts verified.');
