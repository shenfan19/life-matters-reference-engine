import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Dev plugin: serve /stories/* directly from ../../mods/stories/*
function modsPlugin() {
  return {
    name: 'serve-mods',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url: string = req.url || '/';
        const modsDir = path.resolve(process.cwd(), '..', 'mods');

        // /stories/index.json — generate dynamically by scanning mods/stories/
        if (url === '/stories/index.json') {
          const results: string[] = [];
          const scan = (dir: string, rel: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const relPath = rel ? `${rel}/${entry.name}` : entry.name;
              if (entry.isDirectory()) {
                scan(path.join(dir, entry.name), relPath);
              } else if (entry.name === 'game_story.yaml' || entry.name === 'game_story.yml') {
                results.push(`stories/${relPath}`);
              }
            }
          };
          scan(path.join(modsDir, 'stories'), '');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(results));
          return;
        }

        // /mods/<anything> — serve files from the mods root (e.g. /mods/title.mid)
        if (url.startsWith('/mods/')) {
          const filePath = path.join(modsDir, decodeURIComponent(url.slice('/mods/'.length).split('?')[0]));
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.mid': 'audio/midi', '.midi': 'audio/midi',
              '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
              '.webp': 'image/webp',
            };
            res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }

        // /stories/<anything> — serve from mods/stories/<anything>
        if (url.startsWith('/stories/')) {
          // url = '/stories/marie_curie/game_story.yaml'
          // → filePath = modsDir/stories/marie_curie/game_story.yaml
          const filePath = path.join(modsDir, decodeURIComponent(url.slice(1).split('?')[0]));
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.yaml': 'text/plain; charset=utf-8',
              '.yml':  'text/plain; charset=utf-8',
              '.json': 'application/json; charset=utf-8',
              '.png':  'image/png',
              '.jpg':  'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.webp': 'image/webp',
              '.gif':  'image/gif',
              '.svg':  'image/svg+xml',
              '.mp3':  'audio/mpeg',
              '.ogg':  'audio/ogg',
              '.wav':  'audio/wav',
              '.mid':  'audio/midi',
              '.midi': 'audio/midi',
            };
            res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), modsPlugin()],
  server: {
    port: 5174,
  },
});
