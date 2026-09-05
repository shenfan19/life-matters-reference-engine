// scripts/generate-models-list.js
// Place under the src/frontend/scripts/ directory
// Run: node scripts/generate-models-list.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Path configuration
const MODELS_DIR = path.resolve(__dirname, '../../models');
const OUTPUT_FILE = path.resolve(__dirname, '../public/models-list.json');

// Colored output
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
 * Recursively scans a directory
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
        // Recursively scan the subdirectory
        const children = scanDirectory(fullPath, relativePath);
        if (children.length > 0) { // only add non-empty folders
          items.push({
            title: file,
            key: relativePath,
            type: 'folder',
            children: children,
          });
        }
      } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        // Read and parse the YAML file
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = yaml.load(content);

          items.push({
            title: file,
            key: relativePath,
            type: 'file',
            isLeaf: true,
            content: parsed, // includes the parsed content
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
 * Counts the number of files
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
 * Counts the number of folders
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
 * The main function
 */
function main() {
  log('blue', '\n========================================');
  log('blue', '  Generating the MODELS file list');
  log('blue', '========================================\n');

  // Check whether the models directory exists
  if (!fs.existsSync(MODELS_DIR)) {
    log('red', `Error: the models directory does not exist`);
    log('yellow', `Path: ${MODELS_DIR}`);
    log('yellow', '\nMake sure the directory structure is correct:');
    log('yellow', '  life-matters/');
    log('yellow', '    ├── models/         ← should be here');
    log('yellow', '    └── src/');
    log('yellow', '        └── frontend/');
    process.exit(1);
  }

  log('blue', `Scanning directory: ${MODELS_DIR}`);
  log('blue', '');

  // Scan the models directory
  const children = scanDirectory(MODELS_DIR);

  const fileTree = [{
    title: 'models',
    key: 'models',
    type: 'folder',
    children: children,
  }];

  // Stats
  const fileCount = countFiles(fileTree);
  const folderCount = countFolders(fileTree);

  log('blue', '\n========================================');
  log('green', `✓ Scan complete`);
  log('blue', `  Folders: ${folderCount}`);
  log('blue', `  YAML files: ${fileCount}`);
  log('blue', '========================================\n');

  if (fileCount === 0) {
    log('yellow', '⚠️  Warning: no YAML files found');
    log('yellow', '   Check whether the models directory contains .yaml or .yml files\n');
  }

  // Ensure the public directory exists
  const publicDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    log('blue', `Created directory: ${publicDir}`);
  }

  // Write the file
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fileTree, null, 2), 'utf-8');
    log('green', `\n✅ File list generated: ${OUTPUT_FILE}`);

    // Show the file size
    const stats = fs.statSync(OUTPUT_FILE);
    const fileSizeInKB = (stats.size / 1024).toFixed(2);
    log('blue', `   File size: ${fileSizeInKB} KB\n`);
  } catch (error) {
    log('red', `\n❌ Failed to write file: ${error.message}\n`);
    process.exit(1);
  }
}

// Run
try {
  main();
} catch (error) {
  log('red', `\nFatal error: ${error.message}\n`);
  process.exit(1);
}
