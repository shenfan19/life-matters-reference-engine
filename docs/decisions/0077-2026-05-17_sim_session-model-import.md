# ADR 0077 — Session 模型导入：本地 YAML 上传与 localStorage 持久化

**日期**：2026-05-17  
**状态**：已决定  
**范围**：LM-Simulator 前端 + 仿真引擎 API

---

## 背景

用户需要能够将本地 YAML 模型文件导入到仿真器中，而无需将文件提交到服务器的 `models/` 目录。典型场景：

- 学者上传自己正在调试的模型做快速验证
- 仿真器 Demo 场景：用户上传自定义模型，不影响共享模型库
- 该模型可能依赖 `models/` 目录中已有的组件（`imports: [references/foo, papers/bar]`）

---

## 约束

1. 上传的 YAML 必须能解析其 `imports`（引用服务器 `models/` 中的文件），否则功能没有意义
2. 不能允许上传直接修改共享模型库（安全隔离）
3. 用户刷新页面后 session 模型仍应可访问（不要求跨会话持久）

---

## 决定

### 上传流程

1. 前端读取本地文件内容（`FileReader`）
2. `POST /api/model/upload-temp` — 服务端将 YAML 保存到 `models/temp/{safe_name}.yaml`，清除 loader 缓存，返回 `{success, key, filename}`，其中 `key = "temp/{safe_name}.yaml"`
3. 前端用 `loadFileContent(key)` 加载，内部调用 `/api/models/{name}?folder=temp`
4. 该端点调用 `loader_engine.fetch(name, folder='temp')`，通过现有 `ModelStructure` 解析 `imports` —— temp 文件的 imports 可引用 `models/references/`、`models/papers/` 等所有已有路径

### localStorage 持久化

- 键名：`lm_session_imports`
- 存储内容：已成功加载的 `ModelFile[]`（含解析后的 content）
- 时机：每次成功上传且加载后写入
- 页面刷新后：从 localStorage 恢复 session 模型列表，并在 SimModelTree 中独立展示（Section 区域，与 models/ 树分开）
- 上限：最多保留 10 个 session 模型（FIFO 淘汰最旧的）

### UI 呈现

- Session 模型显示在 SimModelTree 左侧面板顶部，独立 Section（标题 "Session"）
- 每个 session 模型可单独删除（从 localStorage 中移除）
- 选中 session 模型时，lock/unlock 图标与 models/ 树中的行为完全一致

---

## 放弃的方案

### 方案 A：上传后直接由后端返回 resolved content

后端在 `upload-temp` 中调用 `loader_engine.fetch()` 并返回完整解析结果。

**放弃原因**：将解析结果嵌入上传响应使接口职责过重；且现有 `loadFileContent` 已通过 `/api/models/` 解析，复用即可，无需重复实现。

### 方案 B：仅客户端存储，不上传到服务器

YAML 内容完全保存在 localStorage，不上传服务器，不解析 imports。

**放弃原因**：无法解析 `imports`，导入功能意义大打折扣；且客户端无法访问 `models/` 目录。

### 方案 C：temp 文件放在用户 session 隔离目录

为每个用户/会话创建独立 temp 子目录（如 `models/temp/{session_id}/`）。

**放弃原因**：当前为单用户演示场景，过度设计；多用户支持留待后续。

---

## 影响

- `sim_engine/src/api_server.py`：新增 `POST /api/model/upload-temp` 端点
- `sim_gui/src/components/Simulator.tsx`：`handleImportFile`、`sessionModels` state、`lm_session_imports` localStorage
- `sim_gui/src/components/SimModelTree.tsx`：Session section 渲染、`onImportFile`/`onSelectSessionModel`/`onClearSessionModel` props
- `models/temp/`：服务器端临时模型目录（不提交到 git，`.gitignore` 中排除）

---

## 注意事项

- `models/temp/` 目录中的文件不参与 `scan_models` 扫描（不出现在主树），仅通过 `get_model?folder=temp` 按需加载
- 多用户并发时，temp 目录无隔离；当前设计仅适用于单用户演示场景
- Session 模型 localStorage 内容在服务器重启后仍存在（key 有效），但若 temp 文件被清理则 resolve 失败；前端对此应有 fallback 提示
