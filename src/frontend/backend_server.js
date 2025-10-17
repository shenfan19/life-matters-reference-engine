// server.js - 放在项目根目录

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const app = express();
const PORT = 3001;

// 启用 CORS
app.use(cors());
app.use(express.json());

// MODS 目录路径
const MODS_DIR = path.join(__dirname, 'mods');

/**
 * 递归扫描目录，生成树形结构
 */
function scanDirectory(dirPath, basePath = '') {
  const items = [];
  
  try {
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      const relativePath = path.join(basePath, file).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // 文件夹
        items.push({
          title: file,
          key: relativePath,
          type: 'folder',
          children: scanDirectory(fullPath, relativePath),
        });
      } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        // YAML 文件
        items.push({
          title: file,
          key: relativePath,
          type: 'file',
          isLeaf: true,
        });
      }
    });
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
  }
  
  return items;
}

/**
 * API: 获取文件树
 * GET /api/files
 */
app.get('/api/files', (req, res) => {
  try {
    const tree = [
      {
        title: 'mods',
        key: 'mods',
        type: 'folder',
        children: scanDirectory(MODS_DIR),
      }
    ];
    
    res.json({
      success: true,
      data: tree,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * API: 读取 YAML 文件内容
 * GET /api/file/:path
 */
app.get('/api/file/*', (req, res) => {
  try {
    // 获取文件路径（去掉 /api/file/ 前缀）
    const filePath = req.params[0];
    const fullPath = path.join(MODS_DIR, filePath);
    
    // 安全检查：确保路径在 mods 目录内
    const resolvedPath = path.resolve(fullPath);
    const resolvedModsDir = path.resolve(MODS_DIR);
    if (!resolvedPath.startsWith(resolvedModsDir)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }
    
    // 读取并解析 YAML
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const parsedYaml = yaml.load(fileContent);
    
    res.json({
      success: true,
      data: {
        path: filePath,
        content: parsedYaml,
        raw: fileContent,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * API: 搜索文件
 * GET /api/search?q=keyword
 */
app.get('/api/search', (req, res) => {
  const keyword = req.query.q?.toLowerCase() || '';
  
  if (!keyword) {
    return res.json({
      success: true,
      data: [],
    });
  }
  
  const results = [];
  
  function searchInDirectory(dirPath, basePath = '') {
    try {
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const relativePath = path.join(basePath, file).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          searchInDirectory(fullPath, relativePath);
        } else if ((file.endsWith('.yaml') || file.endsWith('.yml')) && 
                   file.toLowerCase().includes(keyword)) {
          results.push({
            title: file,
            key: relativePath,
            path: relativePath,
            type: 'file',
          });
        }
      });
    } catch (error) {
      console.error(`Error searching in ${dirPath}:`, error);
    }
  }
  
  searchInDirectory(MODS_DIR);
  
  res.json({
    success: true,
    data: results,
  });
});

/**
 * API: 获取文件夹列表
 * GET /api/folders
 */
app.get('/api/folders', (req, res) => {
  const folders = [];
  
  function getFolders(dirPath, basePath = '') {
    try {
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const relativePath = path.join(basePath, file).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          folders.push(relativePath);
          getFolders(fullPath, relativePath);
        }
      });
    } catch (error) {
      console.error(`Error reading folders in ${dirPath}:`, error);
    }
  }
  
  getFolders(MODS_DIR);
  
  res.json({
    success: true,
    data: folders,
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 MODS directory: ${MODS_DIR}`);
  console.log(`\nAvailable APIs:`);
  console.log(`  GET  /api/files        - Get file tree`);
  console.log(`  GET  /api/file/:path   - Get file content`);
  console.log(`  GET  /api/search?q=... - Search files`);
  console.log(`  GET  /api/folders      - Get folder list`);
});

module.exports = app;