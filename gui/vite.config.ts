// frontend/vite.config.ts
// Change log:
// 1. Added a proxy config: proxies /api/* requests to Flask (localhost:5000)
// 2. Kept modelsPlugin (optional, in case Vite is used to read files directly)
// 3. Updated the port to 5173 (matching the architecture docs)

import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

// [Optional] A plugin that scans the models directory to generate a file list
// Note: all /api requests are now proxied to Flask, so this plugin may go unused
// Kept in case the architecture is switched back in the future
function modelsPlugin() {
  return {
    name: 'models-plugin',
    configureServer(_server: any) {
      // [Comment] These routes are now proxied to Flask, no longer handled by Vite
      // If Vite should read files directly again in the future, uncomment the block below

      /*
      // Add a virtual module providing the file list
      server.middlewares.use('/api/files', (req: any, res: any) => {
        const modelsDir = path.resolve(__dirname, '../../models')
        const fileTree = scanDirectory(modelsDir)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, data: fileTree }))
      })

      // Read a YAML file's content
      server.middlewares.use('/api/file', (req: any, res: any) => {
        const filePath = req.url.replace('/api/file/', '')
        const fullPath = path.resolve(__dirname, '../../models', filePath)

        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const parsed = yaml.load(content)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            success: true,
            data: {
              path: filePath,
              content: parsed,
              raw: content
            }
          }))
        } catch (error: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ success: false, error: error.message }))
        }
      })
      */
    }
  }
}

// Recursively scans a directory (a helper function)
function scanDirectory(dirPath: string, basePath = ''): any[] {
  const items: any[] = []

  try {
    const files = fs.readdirSync(dirPath)

    files.forEach(file => {
      const fullPath = path.join(dirPath, file)
      const relativePath = path.join(basePath, file).replace(/\\/g, '/')
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        items.push({
          title: file,
          key: relativePath,
          type: 'folder',
          children: scanDirectory(fullPath, relativePath),
        })
      } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        items.push({
          title: file,
          key: relativePath,
          type: 'file',
          isLeaf: true,
        })
      }
    })
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error)
  }

  return items
}

// modelsPlugin/scanDirectory/yaml: not wired into `plugins` below — kept per the
// "kept in case the architecture is switched back in the future" note above; `void` only
// silences the unused-symbol check, it doesn't imply these are dead code to delete.
void yaml; void modelsPlugin; void scanDirectory;

// The Vite config
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:18080',  // the FastAPI port (changed to 18080)
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Proxy] Error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Proxy]', req.method, req.url, '→', proxyReq.path);
          });
        }
      }
    }
  },
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
