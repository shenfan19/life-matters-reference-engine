# ADR 0074 — 单层标签组导航与动态 Builder Tab

**日期**：2026-05-16  
**状态**：已采纳  
**范围**：LM-Simulator 前端导航结构 + 模型库编辑入口

---

## 背景

原有导航结构分为两层：

1. **顶层导航**（标题栏）：Tools | Simulator
2. **中央面板 Tab**：Overview / Simulation / Optimization / Report

用户在"工具"与"仿真"之间切换时需要感知两层结构，且 ModelBuilder（模型库编辑器）作为独立页面存在，与仿真工作流完全割裂——建模者需要离开仿真上下文才能编辑模型。

---

## 决策

### 1. 移除顶层导航，保留唯一标签组

顶层 Tools / Simulator 导航标签从标题栏完全移除。应用启动后始终处于仿真界面，标题栏仅保留品牌标识与设置按钮。

导航唯一入口为中央面板的四个固定 Tab：

```
Overview | Simulation | Optimization | Report
```

### 2. Builder Tab：动态出现，编辑完成后消失

ModelBuilder 不再是独立页面，而是以**动态 Tab** 的形式挂载在中央面板 Tab 栏右侧。

**生命周期**：

| 动作 | 触发方 | 结果 |
|------|--------|------|
| 点击左侧目录树 Edit 按钮（✎） | 用户 | Builder Tab 出现，成为当前 Tab |
| 其他四个 Tab 被锁定（置灰，hover 显示提示） | 系统 | 编辑模式独占中央区域 |
| 点击 Builder Tab 上的 × | 用户 | Tab 消失，返回进入前的 Tab，自动刷新目录树 |

这是"情境化编辑（contextual editing）"模式，类似 Word 选中表格时出现"表格工具"上下文选项卡。

**编辑模式关键约束**：同一时刻只能有一个 Builder Tab（不支持多个并发编辑会话）。

### 3. 左侧目录树统一：单选 / 多选双模式

左侧 `SimModelTree` 组件支持两种行为模式，由 `builderMode` prop 控制：

| 模式 | 触发条件 | 行为 |
|------|---------|------|
| **单选模式**（默认） | Builder Tab 关闭 | 点击文件 → 加载到仿真上下文；锁定/解锁按钮可见 |
| **多选模式**（Builder） | Builder Tab 打开 | 文件节点显示 checkbox；表头显示 New / Merge 操作按钮 |

两种模式共享同一组件、同一颗目录树数据（`storyTree`），样式风格统一。Merge 和 New 操作通过 Simulator 层的 Modal 对话框完成，调用现有 `/api/merge` 和 `/api/file-new` 端点。

### 4. 目录树直接呈现磁盘结构，不做包装

`loadFileTree` 直接调用 `convert(modelsNode.children)`，将 `models/` 下的所有子目录按原始层级渲染，不再生成人工的 GROUP HEADER 包装节点。

**改动前**：每个一级子目录被包装为大写 GROUP header（如 `MODELS/PUBLISHED`），且空目录被过滤掉。  
**改动后**：目录名称保持原始大小写，所有目录（包括空的 `temp/`）均可见，字体大小与文件节点一致。

---

## 权衡

| 方案 | 优点 | 缺点 |
|------|------|------|
| **动态 Tab（本方案）** | 可在编辑中切换到其他 Tab 查看；模式边界清晰；关闭即完成 | 编辑期间其他 Tab 锁定，无法同时浏览仿真结果 |
| Builder 作为永久固定 Tab | 随时可访问 | 增加认知负担，暗示仿真与编辑可以并行（实际不应该）|
| Overview 页内联编辑 | 无额外 Tab | YAML 合并等复杂操作难以内联表达 |

**锁定其他 Tab 的理由**：模型库级操作（合并、新建、重组）与运行仿真在语义上互斥——用户不应该一边 merge 模型文件一边跑仿真。锁定使模式边界在 UI 层可见。

---

## 不在范围

- 多个并发 Builder Tab（不需要）
- Builder Tab 的持久化（不保存"正在编辑"状态到 localStorage）
- 模型文件内容的版本对比（由 git 承担）
