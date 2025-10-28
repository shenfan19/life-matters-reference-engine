# LifeMatters 前端配置指南（简化版）

## 📋 项目结构

你的项目结构应该是这样的：

```
life-matters/
├── mods/                          # YAML 模型文件目录
│   ├── physiology/
│   │   ├── physiology.yaml
│   │   ├── insulin_system.yaml
│   │   └── glucose_regulation.yaml
│   ├── diseases/
│   │   ├── diabetes.yaml
│   │   └── obesity.yaml
│   └── social/
│       └── policy_impact.yaml
├── src/
│   ├── frontend/                  # 前端代码目录
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── components/
│   │   │       ├── Generator.tsx
│   │   │       ├── Loader.tsx
│   │   │       ├── Simulator.tsx
│   │   │       └── Optimizer.tsx
│   │   ├── vite.config.ts        # ← 新建/更新
│   │   ├── package.json
│   │   └── index.html
│   └── core/                      # 你的其他 Python 代码
│       ├── loader_engine.py
│       ├── simulator_engine.py
│       └── ...
└── README.md
```

## 🚀 快速开始（无需额外后端！）

### 方案 A: 使用 Vite 插件（推荐）

这个方案不需要额外的 Node.js 后端服务，所有功能都在 Vite 开发服务器中实现。

#### 1. 安装依赖

在 `src/frontend/` 目录下运行：

```bash
cd src/frontend
npm install js-yaml
npm install -D @types/js-yaml
```

#### 2. 更新 vite.config.ts

将提供的 `vite.config.ts` 文件放到 `src/frontend/` 目录。

#### 3. 启动开发服务器

```bash
npm run dev
```

就这么简单！现在访问 `http://localhost:5173`，Loader 就能读取 `mods/` 目录下的文件了。

### 方案 B: 预生成文件列表（最简单）

如果你不想修改 Vite 配置，可以用一个脚本预先生成文件列表。

#### 1. 创建生成脚本

在 `src/frontend/` 下创建 `scripts/generate-mods-list.js`：

```javascript
// scripts/generate-mods-list.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const MODS_DIR = path.resolve(__dirname, '../../../mods');
const OUTPUT_FILE = path.resolve(__dirname, '../public/mods-list.json');

function scanDirectory(dirPath, basePath = '') {
  const items = [];
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const relativePath = path.join(basePath, file).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      items.push({
        title: file,
        key: relativePath,
        type: 'folder',
        children: scanDirectory(fullPath, relativePath),
      });
    } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
      // 读取并解析 YAML 内容
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = yaml.load(content);
        
        items.push({
          title: file,
          key: relativePath,
          type: 'file',
          isLeaf: true,
          content: parsed, // 直接包含解析后的内容
        });
      } catch (error) {
        console.error(`Error parsing ${file}:`, error.message);
      }
    }
  });
  
  return items;
}

// 生成文件列表
const fileTree = [{
  title: 'mods',
  key: 'mods',
  type: 'folder',
  children: scanDirectory(MODS_DIR),
}];

// 确保 public 目录存在
const publicDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 写入文件
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fileTree, null, 2));
console.log(`✅ 生成文件列表成功: ${OUTPUT_FILE}`);
console.log(`   找到 ${countFiles(fileTree)} 个 YAML 文件`);

function countFiles(nodes) {
  let count = 0;
  nodes.forEach(node => {
    if (node.type === 'file') count++;
    if (node.children) count += countFiles(node.children);
  });
  return count;
}
```

#### 2. 更新 package.json

在 `src/frontend/package.json` 中添加脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "npm run prebuild && vite build",
    "prebuild": "node scripts/generate-mods-list.js",
    "generate-mods": "node scripts/generate-mods-list.js"
  }
}
```

#### 3. 生成文件列表

```bash
npm run generate-mods
```

这会在 `public/mods-list.json` 中生成一个包含所有模型的 JSON 文件。

#### 4. 修改 Loader.tsx

```typescript
// 在 Loader.tsx 中，替换 loadFileTree 函数

const loadFileTree = async () => {
  setLoading(true);
  try {
    // 直接读取预生成的文件列表
    const response = await fetch('/mods-list.json');
    const fileTree = await response.json();
    
    // 转换数据格式
    const convertToTreeData = (items: any[]): DataNode[] => {
      return items.map(item => ({
        title: item.title,
        key: item.key,
        icon: item.type === 'folder' ? <FolderOutlined /> : <FileOutlined />,
        isLeaf: item.isLeaf || false,
        children: item.children ? convertToTreeData(item.children) : undefined,
        // 保存原始数据，方便选择时使用
        data: item.content,
      }));
    };
    
    const tree = convertToTreeData(fileTree);
    setTreeData(tree);
    message.success(`已加载 ${countFiles(tree)} 个文件`);
  } catch (error: any) {
    message.error(`加载失败: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

// 修改 loadFileContent 函数
const loadFileContent = async (filePath: string) => {
  setLoading(true);
  try {
    // 从树节点中直接读取数据
    const findNode = (nodes: DataNode[], key: string): any => {
      for (const node of nodes) {
        if (node.key === key && (node as any).data) {
          return (node as any).data;
        }
        if (node.children) {
          const found = findNode(node.children, key);
          if (found) return found;
        }
      }
      return null;
    };
    
    const content = findNode(treeData, filePath);
    
    if (content) {
      const model: ModelFile = {
        key: filePath,
        title: content.metadata?.name || filePath.split('/').pop()?.replace('.yaml', '') || 'unknown',
        path: filePath,
        metadata: content.metadata,
        variables: content.variables,
        formulas: content.formulas,
        simulator: content.simulator,
        optimizer: content.optimizer,
        imports: content.imports,
      };
      
      setSelectedModel(model);
      if (onModelSelect) {
        onModelSelect(model);
      }
      message.success(`已加载模型: ${model.title}`);
    } else {
      message.error('未找到模型数据');
    }
  } finally {
    setLoading(false);
  }
};
```

## 🔄 开发工作流

### 使用方案 A（Vite 插件）

```bash
cd src/frontend
npm run dev
```

**优点：**
- 文件变化自动同步
- 不需要预生成
- 开发体验更好

**缺点：**
- 需要修改 vite.config.ts
- 稍微复杂一点

### 使用方案 B（预生成）

```bash
cd src/frontend

# 每次修改 mods 目录后运行
npm run generate-mods

# 启动开发服务器
npm run dev
```

**优点：**
- 超级简单，不需要修改配置
- 构建后的文件可以直接部署

**缺点：**
- 每次修改 mods 需要重新生成
- 不是实时的

## 💡 我的推荐

对于你的项目结构，我推荐**方案 B（预生成）**，原因是：

1. ✅ **简单** - 不需要复杂的 Vite 配置
2. ✅ **可靠** - 生成的是静态 JSON，不会出错
3. ✅ **快速** - 前端直接读取 JSON，不需要 API 调用
4. ✅ **适合部署** - 打包后可以直接部署到静态服务器
5. ✅ **项目整洁** - 不需要在根目录添加额外的服务

## 📝 完整设置步骤（方案 B）

```bash
# 1. 进入前端目录
cd src/frontend

# 2. 安装依赖
npm install js-yaml

# 3. 创建脚本目录和文件
mkdir -p scripts
# 将 generate-mods-list.js 保存到 scripts/ 目录

# 4. 创建 public 目录（如果不存在）
mkdir -p public

# 5. 生成文件列表
npm run generate-mods

# 6. 启动开发
npm run dev
```

## ⚙️ package.json 完整示例

```json
{
  "name": "lifematters-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run prebuild && tsc && vite build",
    "preview": "vite preview",
    "prebuild": "node scripts/generate-mods-list.js",
    "generate-mods": "node scripts/generate-mods-list.js"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "antd": "^5.0.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@types/js-yaml": "^4.0.5",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.0.0"
  }
}
```

## 🎯 总结

**不需要额外的后端服务！** 使用方案 B，你只需要：

1. 在 `src/frontend` 目录工作
2. 运行 `npm run dev` 启动前端
3. 每次修改 mods 后运行 `npm run generate-mods`

这样项目结构更清晰，根目录保持干净，所有前端相关的东西都在 `src/frontend/` 里。

---

**更新时间**: 2024-10-17