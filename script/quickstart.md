# 🚀 LifeMatters 快速开始

## 📋 前置要求

- Python 3.8+
- Node.js 16+
- Git

## ⚡ 三步启动

### 1. 克隆/进入项目目录

```bash
cd life-matters
```

### 2. 安装依赖

**Python 依赖：**
```bash
pip install Flask Flask-CORS PyYAML asteval
```

**前端依赖：**
```bash
cd src/frontend
npm install
cd ../..
```

### 3. 启动服务

#### 🐧 Linux / macOS

```bash
# 给脚本执行权限
chmod +x start.sh stop.sh

# 启动
./start.sh
```

#### 🪟 Windows

```cmd
start.bat
```

#### 🔧 手动启动（推荐开发时使用）

**终端 1 - 后端：**
```bash
python src/api_server.py
```

**终端 2 - 前端：**
```bash
cd src/frontend
npm run dev
```

### 4. 访问系统

打开浏览器访问：**http://localhost:5173**

## 📸 效果预览

启动成功后你会看到：

```
终端 1 (后端):
🚀 LifeMatters API Server
📁 MODS 目录: /path/to/mods
✅ 目录存在: True
🌐 启动服务器: http://localhost:5000

终端 2 (前端):
VITE v4.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

## 🎯 使用指南

### 1. Generator - 构造器

创建新的 YAML 模型：

1. 点击左侧菜单 "Generator"
2. 填写模型元数据（名称、版本、作者）
3. 添加变量（input/parameter/state）
4. 添加公式（动力学方程）
5. 点击"生成并下载 YAML"

### 2. Loader - 加载器

浏览和管理模型：

1. 点击左侧菜单 "Loader"
2. 左侧显示文件树
3. 点击任意 `.yaml` 文件查看详情
4. 右侧显示：
   - 元数据
   - 变量（按类型分组）
   - 公式（动力学方程）
   - 仿真配置
   - 优化配置

**搜索文件：**
- 在搜索框输入关键词即可过滤

**合并模型：**
1. 切换到"合并模型"子页面
2. 勾选要合并的模型
3. 点击"合并模型"
4. 自动保存到 `mods/merged/`

### 3. Simulator - 仿真器

运行动态仿真：

1. 在 Loader 中先选择一个模型
2. 切换到 Simulator
3. 配置输入参数
4. 点击"开始仿真"
5. 实时查看：
   - 状态变量变化
   - 实时曲线图
   - 数据表格

**控制：**
- 开始/暂停/继续
- 终止/重置
- 导出 CSV 结果

### 4. Optimizer - 优化器

参数优化：

1. 在 Loader 中先选择一个模型
2. 切换到 Optimizer
3. 配置：
   - 优化目标（最小化/最大化）
   - 目标函数（选择 state 变量）
   - 优化算法（遗传算法、粒子群等）
   - 要优化的变量（parameter 类型）
4. 点击"开始优化"
5. 查看最优解和优化历史

## 🛑 停止服务

### Linux / macOS

```bash
./stop.sh
```

### Windows

```cmd
stop.bat
```

或者直接关闭终端窗口。

## 📁 项目文件说明

```
life-matters/
├── mods/                    # YAML 模型文件
│   ├── physiology/         # 生理学模型
│   ├── diseases/           # 疾病模型
│   ├── merged/             # 合并后的模型（自动创建）
│   └── splited/            # 拆分后的模型（自动创建）
├── src/
│   ├── api_server.py       # Flask API 后端
│   ├── loader_engine.py    # 加载引擎
│   ├── mod_structure.py    # 模型结构（core.py）
│   ├── models/             # 模型基础模块
│   └── frontend/           # React 前端
│       ├── src/
│       │   ├── App.tsx
│       │   └── components/
│       │       ├── Generator.tsx
│       │       ├── Loader.tsx
│       │       ├── Simulator.tsx
│       │       └── Optimizer.tsx
│       └── package.json
├── logs/                    # 运行日志（自动创建）
├── start.sh / start.bat    # 启动脚本
├── stop.sh / stop.bat      # 停止脚本
└── requirements.txt         # Python 依赖
```

## 🐛 常见问题

### Q1: 后端启动失败

**错误：** `Address already in use`

**解决：** 端口 5000 被占用
```bash
# Linux/macOS
lsof -ti:5000 | xargs kill

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Q2: 前端显示空白

**检查：**
1. 后端是否运行？访问 http://localhost:5000/api/health
2. 浏览器控制台（F12）是否有错误？
3. 网络请求是否成功？

### Q3: 文件读取失败

**可能原因：**
- YAML 语法错误
- 文件编码不是 UTF-8
- 文件权限问题

**验证 YAML：**
```bash
python -c "import yaml; yaml.safe_load(open('mods/your_file.yaml'))"
```

### Q4: 合并功能不可用

**检查：**
1. 是否至少选择了 2 个文件？
2. `mods/merged/` 目录是否有写权限？
3. 后端日志是否有错误？

### Q5: 模块导入错误

**错误：** `ModuleNotFoundError`

**解决：**
```bash
# 确保在项目根目录
pwd  # 或 cd (Windows)

# 重新安装依赖
pip install -r requirements.txt
```

## 📊 系统要求

### 最低配置
- CPU: 2 核心
- RAM: 4 GB
- 存储: 1 GB

### 推荐配置
- CPU: 4 核心+
- RAM: 8 GB+
- 存储: 5 GB+
- SSD 存储

## 🔗 相关链接

- **完整文档**: 见项目 README.md
- **API 文档**: 访问 http://localhost:5000 后查看
- **问题反馈**: GitHub Issues

## 💡 下一步

1. ✅ 浏览示例模型
2. ✅ 创建自己的模型
3. ✅ 运行仿真测试
4. ✅ 尝试参数优化
5. ✅ 合并多个模型

## 🎉 完成！

现在你可以：
- 📝 创建和编辑模型
- 📂 管理模型文件
- ⚙️ 运行动态仿真
- 📊 优化参数
- 🔗 合并多个模型

**祝使用愉快！** 🚀

---

**需要帮助？** 

查看完整文档或提交 Issue。