// frontend/vite.config.ts
// 修改记录:
// 1. 添加 proxy 配置: 将 /api/* 请求代理到 Flask (localhost:5000)
// 2. 保留 modsPlugin (可选，如果想用 Vite 直接读取文件)
// 3. 更新端口为 5173 (与架构文档一致)

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

// 【可选】扫描 mods 目录生成文件列表的插件
// 注意: 现在所有 /api 请求都会被代理到 Flask，所以这个插件可能不会被使用
// 保留此代码以备将来切换架构时使用
function modsPlugin() {
  return {
    name: 'mods-plugin',
    configureServer(server: any) {
      // 【注释】这些路由现在被代理到 Flask，不再由 Vite 处理
      // 如果将来想让 Vite 直接读取文件，取消下面的注释
      
      /*
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
      */
    }
  }
}

// 递归扫描目录 (辅助函数)
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

// Vite 配置
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:18080',  // FastAPI 端口 (已更改为 18080)
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
  }
})
