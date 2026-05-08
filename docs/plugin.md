# 插件系统 — 需求、设计与实现计划

> 插件 API 契约详见 `plugins/INTERFACE.md`。

---

## 1. 需求

### 1.1 插件分类与边界

插件系统仅覆盖**仿真后处理**场景，即模型已加载、仿真已运行之后的分析与输出。

| 类型 | 说明 | 例子 |
|------|------|------|
| `analysis` | 对仿真时间序列做统计或因果分析 | 因果推断、敏感性分析 |
| `exporter` | 将仿真结果导出为不同文件格式 | Excel、PDF 报告 |
| `chart` | 自定义可视化图表 | D3 瀑布图、Plotly 热力图 |

**不在此插件系统范围内：**

| 类别 | 原因 |
|------|------|
| 模型格式导入（SBML、CellML → LM YAML） | 属于模型创作流程，归 Model Builder 扩展点，未来单独设计 |
| 优化算法 | 与 pymoo/scipy 接口耦合过深，现有三种算法已覆盖主要场景 |
| YAML loader/parser | 已在核心中，与 ModelStructure 双向耦合，抽出无益 |
| Model Builder UI | 双向耦合核心数据结构，不适合插件模式 |
| 游戏卡牌扩展 | 属于 game/ 层，独立于 sim 插件系统设计 |

### 1.2 功能需求

| ID  | 需求 |
|-----|------|
| R1  | 纯后端插件（无 UI）必须可被自动发现、加载，并通过 REST 调用 |
| R2  | 带自定义 HTML UI 的插件必须能以独立 iframe 方式提供服务 |
| R3  | 前端需列出可用插件，并允许用户触发运行 |
| R4  | 插件输入：`model`、`sim_results`、`sim_config`（自动注入）+ 插件自定义 `params` |
| R5  | 插件输出按 result_type 渲染：`html` / `json` / `text` / `table` |
| R6  | 插件上下文提供：`log()`、`get_cached()`、`set_cached()`、`run_simulation()` |
| R7  | 可选依赖缺失时（如 `statsmodels`）返回用户可见错误，而非 500 |
| R8  | 插件运行时错误被捕获并展示给用户，不允许崩溃 API 服务器 |

---

## 2. 设计

### 2.1 后端（已完成）

```
plugins/
└── post_causal_inference/
    ├── manifest.yaml     ← 插件身份与配置
    └── causal.py         ← CausalInference.run(inputs) → dict

sim_engine/src/
├── plugin_manager.py     ← 扫描 / 加载 / 运行
├── plugin_context.py     ← PluginContext，调用时注入
└── api_server.py         ← /api/plugins GET, /{id}/run POST, /{id}/ui-page GET
```

`api_server.py` 已注册的路由：
- `GET  /api/plugins`                 → 列出所有插件
- `GET  /api/plugins/{id}/ui-page`    → 提供 iframe HTML（仅 ui.type=component）
- `POST /api/plugins/{id}/{endpoint}` → 调用后端（通常为 `run`）

### 2.2 manifest.yaml 插件类型声明

```yaml
id: my_plugin
type: analysis          # analysis | exporter | chart
slots:
  - report              # 结果锚定到 Report 标签
  - plot                # 结果锚定到 Plot 标签（chart 类型）
```

`slots` 字段声明插件结果出现在哪个 UI 区域。中央插件标签始终显示所有插件（管理与配置入口）；声明了 slot 的插件还会在对应标签的固定区域额外出现运行按钮和结果展示。

### 2.3 前端架构（两层）

**第一层：中央"插件"标签**（管理与配置）
- 列出所有可用插件（名称、描述、类型）
- 每个插件的参数配置表单（由 manifest 声明的 `params` 驱动）
- 运行按钮 + 结果展示区

**第二层：输出槽位**（使用场景锚点）
- Report 标签底部：显示声明了 `slots: [report]` 的插件
- Plot 标签底部：显示声明了 `slots: [plot]` 的 chart 类插件
- 槽位只显示运行按钮和结果，完整配置仍在中央标签

> 上下文嵌入（如在 Input 面板内嵌因果推断工具）复杂度远超当前需求，暂不实现。

### 2.4 chart 类插件说明

chart 插件返回 `result_type: html`，在 HTML 中内嵌 Chart.js / D3 / Plotly 等库。当前架构已完全支持，无需额外后端工作，只需前端正确渲染 `dangerouslySetInnerHTML`。

### 2.5 已知 Bug

`api_server.py` 将 `context=None` 传入 `plugin_manager.run_plugin()`，导致插件内 `self.ctx.log()` 抛出 `AttributeError`。

修复：调用时构造并传入 `PluginContext(simulator_engine)`。

---

## 3. 实现任务

### 阶段一 — 修复并打通后端（其他任务的前提）

- [x] **T1** 修复 `api_server.py` 中的 `context=None`：
  ```python
  from src.plugin_context import PluginContext
  ctx = PluginContext(simulator_engine=simulator_engine)
  result = plugin_manager.run_plugin(plugin_id, inputs=payload.get('inputs', {}), context=ctx)
  ```
  验证：调用时服务器日志出现 `[Plugin]` 前缀输出。

- [ ] **T2** `post_causal_inference` 端到端冒烟测试：
  ```
  POST /api/plugins/post_causal_inference/run
  { "inputs": { "sim_results": [...至少10行...] } }
  ```
  预期返回：`{"result_type": "json", "data": {"edges": [...], ...}}`

### 阶段二 — 前端 PluginPanel（中央标签）

- [ ] **T3** 添加 locale key：
  - `sim.tab.plugins` = "Plugins" / "插件"
  - `plugins.noPlugins` = "No plugins available" / "暂无插件"
  - `plugins.run` = "Run" / "运行"
  - `plugins.running` = "Running…" / "运行中…"

- [ ] **T4** 实现 `sim_gui/src/components/PluginPanel.tsx`：
  - 挂载时拉取插件列表（`GET /api/plugins`）
  - 每个插件用 antd Card 展示（名称、描述、类型、版本）
  - 运行按钮 → POST `{inputs: {model, sim_results, sim_config}}`
  - 结果渲染器按 result_type 分支：`text` / `json`（代码块）/ `html`（dangerouslySetInnerHTML）/ `table`（antd Table）
  - 运行期间显示 spinner；失败时显示错误信息

- [ ] **T5** 接入 `Simulator.tsx`：中央标签列表添加 `plugins`，传入 `{model, simResults, simConfig}`

- [ ] **T6** 视觉检查：暗色/亮色模式、空状态、错误状态

### 阶段三 — 输出槽位（Report / Plot 锚点）

- [ ] **T7** manifest 支持 `slots` 字段解析，`GET /api/plugins` 响应中携带 slots 信息

- [ ] **T8** Report 标签底部添加"插件分析"区，渲染声明了 `slots: [report]` 的插件

- [ ] **T9** Plot 标签底部添加"插件图表"区，渲染声明了 `slots: [plot]` 的 chart 插件

### 阶段四 — sensitivity_analysis 插件

用途：逐一参数扰动 + 龙卷风图，用于 Paper 2 第二层验证（MC 参数敏感性）。

- [ ] **T10** 创建 `plugins/sensitivity_analysis/manifest.yaml`（type: analysis, slots: [report]）

- [ ] **T11** 实现 `plugins/sensitivity_analysis/sensitivity.py`：
  - 输入：`model`、`sim_results`、`sim_config`、`params.target_var`、`params.perturbation_pct`（默认 10%）
  - 对每个数值参数：以 ±扰动重新运行仿真，记录 `target_var` 终值变化量
  - 按绝对变化量排序，返回 `result_type: html` 龙卷风图（Chart.js）
  - 依赖 `ctx.run_simulation()`，须在 T1 完成后进行

### 阶段五 — 未来规划

- [ ] `exporter_excel` — 仿真结果导出为 Excel（type: exporter）
- [ ] `exporter_pdf` — 仿真报告导出为 PDF（type: exporter）
- [ ] 带自定义 HTML UI 的插件（iframe 路径后端已打通）
- [ ] Model Builder 格式导入扩展点（SBML 等，独立设计，不在此系统内）

---

## 4. 插件清单

| 插件 ID | 类型 | 状态 | slots | 备注 |
|---------|------|------|-------|------|
| `post_causal_inference` | analysis | 后端完成，manifest 已更新 | report | Granger 因果，需 statsmodels |
| `sensitivity_analysis` | analysis | 后端完成 | report | Pearson 相关性，纯 numpy |
| `exporter_excel` | exporter | 未来 | — | |
| `exporter_pdf` | exporter | 未来 | — | |
