// src/frontend/vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

// 扫描 mods 目录生成文件列表的插件
function modsPlugin() {
  return {
    name: 'mods-plugin',
    configureServer(server: any) {
      // 添加虚拟模块，提供文件列表
      server.middlewares.use('/api/files', (req: any, res: any) => {
        const modsDir = path.resolve(__dirname, '../../mods')
        const fileTree = scanDirectory(modsDir)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, data: fileTree }))
      })

      // 读取 YAML 文件内容
      server.middlewares.use('/api/file', (req: any, res: any) => {
        const filePath = req.url.replace('/api/file/', '')
        const fullPath = path.resolve(__dirname, '../../mods', filePath)
        
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
    }
  }
}

// 递归扫描目录
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), modsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 如果将来需要真正的后端 API，可以在这里配置代理
    },
  },
})