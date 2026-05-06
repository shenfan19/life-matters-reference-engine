# ADR 0060 — Game 独立 Repo 与 UI 架构

**日期：** 2026-05-05  
**状态：** 已接受  
**范围：** 项目整体结构，sim_gui，game

---

## 背景

Paper 1（软件工具论文）提交前需将 sim repo 转为 public。game 层与论文无关，且代码风格、目标受众均不同，混在同一 repo 中会让论文读者困惑，必须先行分离。

---

## 决定

### 1. 分离边界

| 内容 | 去向 |
|------|------|
| `game/` | game repo |
| `models/stories/` | game repo（游戏故事内容） |
| `sim_gui/src/components/StoryEditor.tsx` | game repo（随 game 迁移） |
| `sim_gui/src/components/StoryEngine.tsx` | game repo（随 game 迁移） |
| game 专属 ADR（0006、0010、0011 等） | game repo `docs/decisions/` |
| `sim_gui/` | sim repo（保留） |
| `sim_engine/` | sim repo（保留） |
| `models/published/` `models/source/` | sim repo（保留） |
| `plugins/` `docs/` | sim repo（保留） |

sim App.tsx 移除 Game Builder 标签和 StoryEngine 相关代码，保留 "Game Player ↗" 按钮（跨 repo 打开 localhost:5174）。

### 2. Game 内部 UI 架构

**顶部导航两个标签，Play 为默认入口：**

```
[♠ Life Matters Game]  [Play]  [Build]
```

- **Play**：现有 StorySelect → CardGame 流程，不动
- **Build**：GameBuilder（由 StoryEditor 演化而来）

不设独立首页——两个功能不构成需要分流的体量。待第三个功能出现时再加。

### 3. 未来 models/ 独立 repo（决议但暂缓）

将 `models/` 独立为第三个 repo（`lm-models`），供 sim 和 game 作为 git submodule 引用，并对外部模型贡献者开放。

**暂缓原因：** 当前为 solo 开发者，5月31提交论文，submodule 工作流增加调试摩擦。等论文提交、有外部贡献者意向时再执行。届时执行步骤：
1. `models/` 独立为 `lm-models` repo
2. sim repo 引入 submodule
3. game repo 引入 submodule，StoryEditor 改为 js-yaml 直接读本地 YAML

### 4. Game 读取 sim 数据的方案

Game StoryEditor/Builder 读取 model 变量结构时：
- **短期**：直接解析 `models/stories/` 内的 YAML（js-yaml，无 API 依赖）
- **中期（models 独立后）**：读 submodule 中的 YAML
- **不做**：调用 sim API（两个独立 repo 不能假设对方在线）

---

## 影响

- `sim_gui/src/App.tsx`：移除 story 页面、StoryEditor、StoryEngine import
- `game/src/App.tsx`：加入 Play/Build 顶部导航
- `game/src/components/GameBuilder.tsx`：新建
- `models/stories/` → game repo 随行
- game 专属 ADR 随 game repo 迁移（sim repo docs/ 保留 sim 专属 ADR）
