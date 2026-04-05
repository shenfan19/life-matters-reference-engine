#!/usr/bin/env node
// Copies mods/stories/ → public/stories/ and generates public/stories/index.json
// Run before production build: npm run prebuild (called automatically by npm run build)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modsStories = path.resolve(__dirname, '..', '..', 'mods', 'stories');
const outDir      = path.resolve(__dirname, '..', 'public', 'stories');

// ── Recursive copy ────────────────────────────────────────────────────────────
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Scan for game_story.yaml files ───────────────────────────────────────────
function findStories(dir, rel = '') {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...findStories(path.join(dir, entry.name), relPath));
    } else if (entry.name === 'game_story.yaml' || entry.name === 'game_story.yml') {
      results.push(`stories/${relPath}`);
    }
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('Copying mods/stories → public/stories ...');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
copyDir(modsStories, outDir);

const stories = findStories(modsStories);
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(stories, null, 2));

console.log(`Done. ${stories.length} stories indexed:`);
stories.forEach(s => console.log(`  ${s}`));
