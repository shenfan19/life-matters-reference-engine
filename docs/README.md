# LifeMatters: 医学与社会学仿真建模框架

## 项目简介

LifeMatters 是一个模块化仿真建模框架，面向医学与社会学研究，同时提供交互式卡牌游戏体验。框架采用类游戏的 Modding 机制，通过 YAML 配置文件定义动力学模型；研究者可直接仿真和优化，普通用户则通过卡牌游戏理解历史与科学背景。

---

## 快速开始

### 依赖要求

- Python 3.8+
- Node.js 18+

### 安装与启动

```bash
# 安装 Python 后端依赖
pip install -r sim_engine/requirements.txt

# 安装仿真前端依赖
cd sim_gui && npm install && cd ..

# 安装游戏前端依赖
cd game && npm install && cd ..
```

**启动后端（所有前端共用）：**
```bash
cd sim_engine && python src/api_server.py
# 默认监听 http://localhost:18080
```

**启动仿真前端：**
```bash
cd sim_gui && npm run dev
# http://localhost:5173
```

**启动游戏前端：**
```bash
cd game && npm run dev
# http://localhost:5174
```

两个前端均通过 Vite proxy 将 `/api` 请求转发至后端 `:18080`。

---

## 核心模块

### 1. Loader（模型加载器）
浏览、解析和合并 YAML 模型。支持 `imports` 递归依赖加载，根模型可用 `patches` 覆盖子模型参数，支持 AST 预编译表达式加速求值。

### 2. Simulator（仿真引擎）
驱动动力学模型迭代，支持实时交互。线程隔离设计，仿真运行不阻塞 UI；支持暂停、继续和实时调参。

### 3. Optimizer（参数优化器）
自动寻找最优参数组合（如最大化寿命、最小化成本）。支持网格搜索、NSGA-II（遗传算法）、PSO 等多目标算法。

### 4. Game（交互式卡牌游戏）
独立前端（`game/`），基于 YAML story 文件运行回合制卡牌游戏。支持多场景浏览（卡片/列表视图、时代/类型/医学分类筛选），语言切换（EN / 中文 / 繁中），明暗主题。详见 [game 文档](../docs_game/)。

---

## 项目结构

```
life-matters/
├── sim_engine/          # 后端核心 (Python, FastAPI，端口 18080)
├── sim_gui/             # 仿真前端 (React + TypeScript，端口 5173)
├── game/                # 游戏前端 (React + TypeScript，端口 5174)
│   ├── src/
│   │   ├── App.tsx              # 路由：场景选择 ↔ 卡牌游戏
│   │   ├── components/
│   │   │   ├── StorySelect.tsx  # 场景浏览与筛选
│   │   │   └── CardGame.tsx     # 回合制卡牌游戏引擎
│   │   └── core/
│   │       ├── i18n.tsx         # UI 语言系统（JSON locale 文件）
│   │       └── storyI18n.ts     # 故事内容语言叠加层
│   └── public/locales/game/     # UI 翻译文件 (en / zh-CN / zh-TW)
├── mods/                # 模型与故事库
│   ├── core/            # 核心科学/医学模型（纯 YAML）
│   └── stories/         # 游戏故事（每个子目录一个 game_story.yaml）
├── docs/                # 框架文档（本目录）
├── docs_game/           # 游戏设计与 Schema 文档
└── users/               # 用户存档与工作区模板
```

---

## 常见问题

**Q: 后端端口占用？**
默认端口 18080。修改 `sim_engine/src/api_server.py` 中的端口，并同步更新 `sim_gui/vite.config.ts` 和 `game/vite.config.ts` 中的 proxy 目标地址。

**Q: 前端显示空白？**
确认后端已启动，访问 `http://localhost:18080/api/health` 验证。再检查对应前端目录下已运行 `npm install`。

**Q: 如何添加新游戏场景？**
在 `mods/stories/` 下新建子目录，放入 `game_story.yaml`。文件格式参见 [game_story Schema](design/game_and_converter.md)。如需添加中文翻译，在同目录下放 `game_story.zh-CN.yaml`（只含文字字段，无需游戏逻辑）。

**Q: 如何自定义科学模型？**
参考 [建模设计手册](design/model.md) 的 YAML 规范，将 `.yaml` 文件放入 `mods/core/`，在 Loader 界面点击刷新。

---

## 延伸阅读

- [建模设计手册](design/model.md)
- [Story 层剧本设计](design/story.md)
- [Game Story Schema & Converter](design/game_and_converter.md)
- [设计决策记录](decisions/README.md)

---
*最后更新：2026-04-18*
