# ADR 0042 — mod → model 全面重命名
**日期**：2026-04-23  
**状态**：已实施

---

## 背景

项目中 `mod` 一词存在双重含义：

- **game mod**：社区用户制作的自定义历史场景（game modification 的惯用缩写）。
- **model 缩写**：仿真框架中的动力学模型（YAML 文件，位于 `mods/` 目录下）。

这导致多处混乱：
- `mod_design.md` / `mod_requirements.md` / `mod_impl.md` 被设计为描述动力学模型的文档，但读者（和 AI 辅助工具）会误解为"游戏 MOD 系统"。
- 目录 `mods/models/` 语义重复（"模组的模型"），且 `mods/` 给人"欢迎 MOD"的暗示，与非游戏的科研建模定位不符。
- Python 模块 `mod_structure`、`mod_generator`、`mod_merger` 等同样受到歧义污染。

同期讨论了 `sim_xxx` 是否也应改为 `simulation_xxx`，结论是**不改**（见下方）。

---

## 决策

### 决策一：docs 文件重命名

| 原文件 | 新文件 | 说明 |
|--------|--------|------|
| `mod_requirements.md` | `model_requirements.md` | 模型数据规范（`description`/`reference`/`comments` 强制要求） |
| `mod_design.md` | `model_design.md` | YAML 建模规范，从 `sim_design.md` 分离 |
| `mod_impl.md` | `model_impl.md` | 模型相关实现说明 |

`mod_xxx.md` 中原有的 Game MOD 社区内容迁移至 `game_design.md` 和 `game_requirements.md`，`mod_xxx.md` 随后删除。

`sim_design.md` 中的 YAML 格式规范章节提取至新建的 `model_design.md`，`sim_design.md` 保留原有仿真引擎设计内容。

### 决策二：目录结构重命名

| 旧路径 | 新路径 |
|--------|--------|
| `mods/` | `models/` |
| `mods/models/` | `models/source/` |
| `mods/stories/` | `models/stories/` |
| `mods/scenarios/` | `models/scenarios/` |

`mods/models/` → `models/source/` 的原因：内层 `models` 与外层 `mods` 语义重叠；`components` 更准确描述"可复用的动力学组件库"。

### 决策三：代码目录与模块重命名

| 旧名称 | 新名称 |
|--------|--------|
| `plugins/preprocessors/mod_generator/` | `model_generator/` |
| `plugins/preprocessors/mod_merger/` | `model_merger/` |
| `sim_engine/src/mod_structure/` | `model_structure/` |

所有 Python 文件中的 `mods_directory` 参数默认值由 `"mods"` 改为 `"models"`；import 路径 `from .mod_structure import` 改为 `from .model_structure import`。

### 决策四：前后端路径字符串同步更新

- `api_server.py`：`PROJECT_ROOT / "mods"` → `/ "models"`；API 路由 `/api/mods/` → `/api/models/`；`/api/files` 返回的根节点 key 由 `'mods'` 改为 `'models'`。
- `game/vite.config.ts`：`modsDir` 指向 `'models'`，`/mods/` URL handler → `/models/`。
- `game/src/App.tsx`、`StorySelect.tsx`：storyPath 前缀 `` `mods/${p}` `` → `` `models/${p}` ``。
- `sim_gui` 各组件：`n.key === 'mods'` → `'models'`；`n.key === 'models'`（原内层组件目录）→ `'components'`；`ModsManager` 可见性过滤器从 `models/` + `scenarios/` 改为 `components/` + `scenarios/`。

---

## 决策五：保留 sim_xxx 不改

讨论了将 `sim_xxx`（文件名、变量名、参数名）改为 `simulation_xxx` 的可能性。

**结论：保留 `sim` 前缀，不改。**

理由：
- `sim` 是仿真工程领域的公认缩写（MATLAB Simulink、SimPy、OpenSim 等均使用），无歧义风险。
- `mod` 的歧义来自与 game mod 含义冲突，`sim` 不存在对应的歧义来源。
- 改动量远大于 `mod` 重命名（涉及 URL 路径、Python 类名、参数名、前端组件名），出错面更宽，收益为零。

---

## 结果

```
models/                     ← 原 mods/
  components/               ← 原 mods/models/（可复用动力学组件）
  scenarios/                ← 仿真场景配置
  stories/                  ← 游戏故事包

plugins/preprocessors/
  model_generator/          ← 原 mod_generator/
  model_merger/             ← 原 mod_merger/

sim_engine/src/
  model_structure/          ← 原 mod_structure/
```

docs 中 `mod_xxx.md` 已删除，Game MOD 内容归入 `game_xxx.md`，YAML 建模规范独立为 `model_design.md`。

所有代码与文档中不再出现 `mods/` 路径或 `mod_` 模块前缀。`sim_xxx` 命名保持不变。
