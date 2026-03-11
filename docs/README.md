# LifeMatters: 医学与社会学仿真建模框架

## 📝 项目简介
LifeMatters 是一个模块化的仿真建模框架，面向医学与社会学研究，旨在从科研论文生成动力学模型，通过仿真验证和优化得出新结论，同时为普通用户提供交互式人生模拟体验。框架采用类游戏的 Modding 机制，支持通过 YAML 配置文件定义、优化和运行复杂模型，无需编程技能。

---

## 🚀 快速开始 (5分钟运行第一个仿真)

### 1️⃣ 安装依赖
确保已安装 Python 3.8+ 和 Node.js 16+。

```bash
# 克隆项目
git clone https://github.com/shenfan19/life-matters.git
cd life-matters

# 安装 Python 后端依赖
pip install -r sim_engine/requirements.txt

# 安装前端依赖
cd sim_gui
npm install
cd ..
```

### 2️⃣ 启动服务
你可以选择自动脚本或手动启动。

**方式A：自动脚本（推荐）**
- Windows: `start.bat`
- Linux/macOS: `./start.sh`

**方式B：手动启动 (开发推荐)**
- **后端**: `cd sim_engine && python src/api_server.py`
- **前端**: `cd sim_gui && npm run dev`

### 3️⃣ 访问系统
打开浏览器访问：[http://localhost:5173](http://localhost:5173)

### 🎯 示例：吸烟对肺健康的影响
1. **Loader**: 在左侧菜单点击 "Loader"，找到 `mods/core/smoking.yaml` 并查看详情。
2. **Simulator**: 点击 "Simulator"，将 `cigarettes_per_day` 设为 20。
3. **运行**: 点击 "开始仿真"，观察肺功能随时间衰减的动态曲线。

---

## 🛠️ 核心模块详解

### 1. Generator (模型构造器)
- **功能**: 无需编程，通过图形化界面或模板将医学论文数据（如发病率增减、药效）转化为 YAML 模型。
- **特色**: 支持从论文摘要自动提取参数。

### 2. Loader (模型加载器)
- **功能**: 浏览、解析和合并模型。
- **机制**: 支持 `imports` 递归依赖加载，根模型可使用 `patches` 覆盖子模型参数。

### 3. Simulator (仿真引擎)
- **功能**: 驱动动力学模型迭代，支持实时交互和数据导出。
- **特点**: 线程隔离设计，仿真运行不阻塞 UI；支持暂停、继续和实时调参。

### 4. Optimizer (参数优化器)
- **功能**: 自动寻找最佳参数组合（如最大化寿命、最小化成本）。
- **算法**: 支持网格搜索、NSGA-II (遗传算法)、PSO 等。

---

## 🎮 故事模式 (Story Mode)
Story 层是基于 Core 层模型构建的交互式剧本。
- **Marie Curie**: 体验居里夫人的科研之旅，包含卡牌交互系统。
- **London 1910 Flu**: 模拟 1910 年伦敦流感爆发，包含历史真实背景下的药物可用性限制。

---

## 📂 项目结构
```
life-matters/
├── sim_engine/          # 后端核心 (Python, FastAPI)
├── sim_gui/             # 前端界面 (React, TypeScript)
├── mods/                # 模型库
│   ├── core/            # 纯科学/医学模型
│   └── stories/         # 剧情与交互剧本
├── docs/                # 详细文档
└── users/               # 用户存档与存档模板
```

---

## ❓ 常见问题 (FAQ)

**Q: 启动后端时提示端口占用？**
- 默认端口为 5000。你可以修改 `sim_engine/src/api_server.py` 中的端口，或运行 `python kill_ports.py` 清理。

**Q: 前端显示空白？**
- 请检查后端是否已启动 (`/api/health`)。
- 确保 `sim_gui` 目录下已成功运行 `npm install`。

**Q: 如何自定义我的模型？**
- 参考 [建模设计手册](design/model.md) 的 YAML 规范。
- 将你的 `.yaml` 文件放入 `mods/core/` 目录，点击 Loader 的刷新按钮。

---

## 📚 延伸阅读
- [建模设计手册 (Model Design Guide)](design/model.md)
- [Story层剧本设计指南](design/story.md)
- [系统架构深度解析](Architecture.md)

---
*最后更新：2025年3月*
