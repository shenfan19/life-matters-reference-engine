# ADR 0078 — SCS 模式：云端多用户部署的写操作保护

**日期**：2026-05-18（2026-05-18 持续更新）
**状态**：已决定
**范围**：仿真引擎 API + 前端全部写操作入口

---

## 背景

LM-Simulator 原设计为作者本地单用户工具，所有 API 写操作均无鉴权保护。计划以 SCS（Software-as-a-Cloud-Service）形式向学者开放演示时，任意访客均可覆盖或删除 `models/` 目录中的共享模型文件，存在严重安全风险。

---

## 约束

1. 本地开发体验不能受影响（作者仍需完整写操作权限）
2. 不引入用户账号体系（当前阶段过重）
3. SCS 用户应能：上传自己的 YAML、编辑（内存）、下载结果、运行仿真
4. SCS 用户不能：修改服务器上的 `models/` 任意文件

---

## 决定

### SCS_MODE 环境变量

后端启动时读取 `SCS_MODE` 环境变量（大小写不敏感）：

```bash
# 云端部署
SCS_MODE=true uvicorn ...

# 本地开发（默认 false，不设置即可）
```

VSCode tasks.json 通过 `options.env` 注入，而非 shell 语法（跨平台兼容）：

```json
"options": { "cwd": "...", "env": { "SCS_MODE": "true" } }
```

`SCS_MODE` 保持 boolean，不扩展为多值枚举（见放弃方案）。

### 后端：写操作 403 guard

所有修改服务器文件系统的端点，在函数体首行调用 `_check_write()`：

| 端点 | 操作 |
|------|------|
| `POST /api/save-file` | 保存结构化模型 |
| `POST /api/file-raw/{path}` | 保存原始文本 |
| `POST /api/file-structured/{path}` | 保存 JSON→YAML |
| `POST /api/file-move` | 移动/重命名文件 |
| `POST /api/file-new` | 从模板新建文件（SCS 下由前端改为创建 session model） |
| `DELETE /api/file/{path}` | 删除文件 |
| `POST /api/split` | 拆分模型（写盘） |

`POST /api/merge` 和 `POST /api/model/upload-temp` 不直接 403，有各自的 SCS 分支逻辑（见下）。

### GET /api/config

新增只读端点，供前端获取运行模式：

```
GET /api/config → { "scs_mode": true/false }
```

前端在 Simulator 挂载时请求一次，存入 `scsMode` state，向下传递给 FileEditor 和 SimModelTree。

### 前端：文件编辑器（FileEditor.tsx）行为适配

`ModelBuilder.tsx`（旧的 1530 行全功能组件）已被 `FileEditor.tsx`（~600 行，仅包含 embedded 模式所需的卡片编辑功能）替换。旧组件左侧文件树在 embedded 模式下永远隐藏，是死代码。

| 功能 | 本地模式 | SCS 模式 |
|------|---------|---------|
| 编辑模型字段 | ✅ | ✅ |
| 保存到服务器 | ✅ | ❌ 按钮灰色，Tooltip"仅本地模式下可用" |
| 保存 session model | ✅ | ✅（写 localStorage，不走服务器） |
| 下载当前 draft | ✅ | ✅（始终可用） |
| 删除文件 | ✅ | ❌ 按钮隐藏 |
| 自动修复（写盘） | ✅ | ❌ 按钮隐藏 |
| 拖拽移动文件 | ✅ | ❌ 已移至 SimModelTree，不在 FileEditor |

### 前端：新建文件（SCS 模式）

SCS 模式下点击"新建"不调用 `POST /api/file-new`，而是：

1. 弹窗只询问模型名称（非路径）
2. 在前端创建空模板 `ModelFile`（key = `session/{name}.yaml`）
3. 直接在 FileEditor 中打开为编辑卡片，自动进入编辑模式
4. 注册到 `sessionModels`（localStorage）

### 前端：合并（Merge）SCS 行为

SCS 模式下弹窗只询问文件名（非服务器路径）。后端 `POST /api/merge` 在 SCS 模式下不写盘，返回内存合并结果：

```json
{ "success": true, "scs_mode": true, "raw": {...}, "yaml_text": "...", "filename": "merged.yaml" }
```

前端将结果构建为 session model，打开 Builder，自动进入编辑模式。

### 前端：上传（Upload）到 Builder

Builder 工具栏新增上传按钮（`UploadOutlined`），上传后通过 `POST /api/model/upload-temp`（原子操作，见 ADR 0077）创建 session model，自动在 FileEditor 中打开编辑卡片。

### 前端：Session model 在树中的行为

- **普通模式**：点击 session model → 加载为当前 sim 模型（和 server model 一致）
- **Builder 模式**：session model 显示复选框（和树中 server model 一致），勾选 → 在 FileEditor 中显示编辑卡片；选中时不显示锁图标

### 前端：运行按钮限制（SCS 模式）

SCS 模式下，当另一个模型正在运行时，当前模型的 Sim/Opt 运行按钮 disabled，悬停显示 Tooltip：

> "请先前往「X」停止运行后再启动"

锁图标已由 [ADR 0085](0085-2026-05-25_sim_remove-lock-free-switch-running-indicator.md) 移除；运行拦截改为仅在用户尝试启动新运行时弹出确认框，不再阻止模型切换。

---

## 放弃的方案

### 多 MODE 枚举（LOCAL / SCS / DEMO / ...）

资源限制（并发数）、Demo 白名单等维度与写保护无关，各自用独立变量控制。枚举会将不相关关注点耦合，随需求增长变成难以维护的 big switch。

**决定**：保持 boolean `SCS_MODE`，其他维度独立控制。

### 前端隐藏所有写入口（新建、合并、上传）

后端已有 403 兜底，保留这些按钮让 SCS 用户通过 session model 工作流完成编辑任务。

---

## 影响

- `sim_engine/src/api_server.py`：`SCS_MODE`、`_check_write()`、`GET /api/config`、merge 端点 SCS 分支
- `sim_gui/src/components/FileEditor.tsx`：**新文件**，替换 ModelBuilder.tsx；`scsMode` prop、session key 保存走 localStorage、`checkedFiles` 计算修复（含 session key）、`preloadedMetas` 绕过服务器 fetch
- `sim_gui/src/components/Simulator.tsx`：`scsMode` fetch、handleMerge SCS 分支、handleCreateFile SCS 分支、handleBuilderSessionUpdate、builderSessionMetas、builderAutoEditKey、builderUploadRef
- `sim_gui/src/components/SimModelTree.tsx`：`scsMode` prop、Builder 模式下 session model 显示复选框、session key 刷新按钮隐藏、Builder 工具栏上传按钮
- `sim_gui/src/components/ModelBuilder.tsx`：**已删除**
- `.vscode/tasks.json`：通过 `options.env.SCS_MODE` 控制

---

## 注意事项

- **SCS_MODE 仅保护文件系统**。计算资源（并发仿真/优化数量）的限制尚未实现，见 task_sim.md → SCS 计算资源限制条目
- **Session model 架构**：session key 前缀检测分散在多处，有改进空间。已记录为 task_sim.md → AA 条目
- **SaaS 路径**：未来引入用户账号体系时，鉴权层将替代 SCS_MODE；届时改动范围是整个 API 层
