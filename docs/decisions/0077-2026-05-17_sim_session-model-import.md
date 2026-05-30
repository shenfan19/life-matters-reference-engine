# ADR 0077 — Session 模型导入：原子上传 + localStorage 持久化

**日期**：2026-05-17（2026-05-18 修订）
**状态**：已决定
**范围**：LM-Simulator 前端 + 仿真引擎 API

---

## 背景

用户需要将本地 YAML 文件导入仿真器，而无需提交到服务器的 `models/` 目录。典型场景：

- 学者上传自己调试中的模型快速验证
- SCS（云服务）场景：用户上传自定义模型，不影响共享模型库
- 模型可能通过 `imports:` 引用 `models/` 中的已有组件

---

## 约束

1. 上传的 YAML 必须能解析其 `imports`（引用服务器 `models/` 中的文件）
2. 不能允许上传修改共享模型库（安全隔离）
3. 页面刷新后 session 模型仍可访问
4. **多用户并发安全**：不同用户上传同名文件不能互相覆盖

---

## 决定

### 上传流程（原子操作）

```
前端 POST /api/model/upload-temp { text, filename }
    ↓
后端：写 models/temp/{uuid}_{safe_name}.yaml
后端：loader_engine.fetch() 解析 imports → 得到 resolved model
后端：删除临时文件（finally 块保证）
后端：返回 { success, raw, resolved, filename }
    ↓
前端：直接从响应构建 ModelFile，key = "session/{filename}"
前端：写入 localStorage lm_session_imports
```

**关键设计点**：

- UUID 前缀（`{uuid}_{safe_name}`）确保并发上传同名文件不冲突
- 临时文件在 `finally` 块中删除，响应返回前文件已不存在——服务器**零持久化**
- 前端不再需要第二次请求（原 `loadFileContent(key)` → `/api/models/`）
- `raw`：原始 YAML 解析结果（未合并 imports）；`resolved`：loader 合并后的完整模型

### Session 模型的 key 命名

Session 模型使用 `session/{filename}` 作为 key（不是原来的 `temp/{safe_name}`），明确语义：此 key 不对应服务器上的任何文件，所有后续操作均来自 localStorage。

### 前端刷新按钮

> **已更新**：见 [ADR 0089 D9](0089-2026-05-30_sim_session-refactor-warm-start-dirty-active-model.md)。以下原始规则已废弃。

~~当 `selectedKey.startsWith('session/')` 时，树顶栏的"重新读取"按钮不显示。~~ 

**当前行为**：刷新按钮对所有模型（包括 session 模型）均可见。点击后调用 `reloadFromYAML()`，session 模型通过重新设置 `confirmedModel` 触发 YAML 重解析，效果等同于普通文件模型的"清除 session + 重新加载"。

### localStorage 持久化

- 键名：`lm_session_imports`
- 存储：已成功上传并解析的 `ModelFile[]`
- 上限：最多 10 个，FIFO 淘汰最旧的
- 刷新页面后：从 localStorage 恢复，在 SimModelTree 顶部独立 Section 展示

---

## 放弃的方案

### 方案 B：仅客户端存储，不上传到服务器

YAML 内容完全保存在 localStorage，不解析 `imports`。

**放弃原因**：无法解析 imports，功能意义大打折扣。

### 方案 C：temp 文件放在用户 session 隔离目录

为每个用户创建 `models/temp/{session_id}/` 独立子目录。

**放弃原因**：文件仍然持久化，只是避免了冲突；不如直接原子化操作更简洁。

### 原方案（已废弃）：两步法

原实现将文件持久写入 `models/temp/{safe_name}.yaml`，再通过 `loadFileContent` 发起第二次请求加载。问题：多用户同名文件互相覆盖；temp 目录无限堆积；文件必须保留到第二次请求完成。

---

## 影响

- `sim_engine/src/api_server.py`：`POST /api/model/upload-temp` 改为原子操作，返回 `{raw, resolved}`
- `sim_gui/src/components/Simulator.tsx`：`handleImportFile` 直接从响应构建 `ModelFile`
- `sim_gui/src/components/SimModelTree.tsx`：session key 检查，刷新按钮隐藏
- `models/temp/`：仅在请求处理期间短暂存在，不再需要持久目录（可保留作孤儿文件清理用）

---

## 注意事项

- 服务器崩溃在 fetch 完成后、finally 执行前，会留下孤儿 UUID 文件。极罕见，可由定时清理处理
- Session 模型不参与 `/api/files` 树扫描，仅通过 localStorage 呈现
