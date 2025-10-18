// scripts/generate-mods-list.js
// 放在 src/frontend/scripts/ 目录下
// 运行: node scripts/generate-mods-list.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 路径配置
const MODS_DIR = path.resolve(__dirname, '../../../mods');
const OUTPUT_FILE = path.resolve(__dirname, '../public/mods-list.json');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 递归扫描目录
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
        // 递归扫描子目录
        const children = scanDirectory(fullPath, relativePath);
        if (children.length > 0) { // 只添加非空文件夹
          items.push({
            title: file,
            key: relativePath,
            type: 'folder',
            children: children,
          });
        }
      } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        // 读取并解析 YAML 文件
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = yaml.load(content);
          
          items.push({
            title: file,
            key: relativePath,
            type: 'file',
            isLeaf: true,
            content: parsed, // 包含解析后的内容
          });
          
          log('green', `  ✓ ${relativePath}`);
        } catch (error) {
          log('red', `  ✗ ${relativePath}: ${error.message}`);
        }
      }
    });
  } catch (error) {
    log('red', `Error scanning directory ${dirPath}: ${error.message}`);
  }
  
  return items;
}

/**
 * 统计文件数量
 */
function countFiles(nodes) {
  let count = 0;
  nodes.forEach(node => {
    if (node.type === 'file') {
      count++;
    }
    if (node.children) {
      count += countFiles(node.children);
    }
  });
  return count;
}

/**
 * 统计文件夹数量
 */
function countFolders(nodes) {
  let count = 0;
  nodes.forEach(node => {
    if (node.type === 'folder') {
      count++;
      count += countFolders(node.children);
    }
  });
  return count;
}

/**
 * 主函数
 */
function main() {
  log('blue', '\n========================================');
  log('blue', '  生成 MODS 文件列表');
  log('blue', '========================================\n');

  // 检查 mods 目录是否存在
  if (!fs.existsSync(MODS_DIR)) {
    log('red', `错误: mods 目录不存在`);
    log('yellow', `路径: ${MODS_DIR}`);
    log('yellow', '\n请确保目录结构正确：');
    log('yellow', '  life-matters/');
    log('yellow', '    ├── mods/           ← 应该在这里');
    log('yellow', '    └── src/');
    log('yellow', '        └── frontend/');
    process.exit(1);
  }

  log('blue', `扫描目录: ${MODS_DIR}`);
  log('blue', '');

  // 扫描 mods 目录
  const children = scanDirectory(MODS_DIR);
  
  const fileTree = [{
    title: 'mods',
    key: 'mods',
    type: 'folder',
    children: children,
  }];

  // 统计信息
  const fileCount = countFiles(fileTree);
  const folderCount = countFolders(fileTree);

  log('blue', '\n========================================');
  log('green', `✓ 扫描完成`);
  log('blue', `  文件夹: ${folderCount}`);
  log('blue', `  YAML 文件: ${fileCount}`);
  log('blue', '========================================\n');

  if (fileCount === 0) {
    log('yellow', '⚠️  警告: 没有找到 YAML 文件');
    log('yellow', '   请检查 mods 目录是否包含 .yaml 或 .yml 文件\n');
  }

  // 确保 public 目录存在
  const publicDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    log('blue', `创建目录: ${publicDir}`);
  }

  // 写入文件
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fileTree, null, 2), 'utf-8');
    log('green', `\n✅ 文件列表已生成: ${OUTPUT_FILE}`);
    
    // 显示文件大小
    const stats = fs.statSync(OUTPUT_FILE);
    const fileSizeInKB = (stats.size / 1024).toFixed(2);
    log('blue', `   文件大小: ${fileSizeInKB} KB\n`);
  } catch (error) {
    log('red', `\n❌ 写入文件失败: ${error.message}\n`);
    process.exit(1);
  }
}

// 运行
try {
  main();
} catch (error) {
  log('red', `\n致命错误: ${error.message}\n`);
  process.exit(1);
}