# ADR 0066 — Simulator 拆分与 Sim/Opt 结果工作区

## 状态

✅ 已实施；OPT/SIM 分离重构待进一步设计

## 日期

2026-05-08

## 背景

`sim_gui/src/components/Simulator.tsx` 曾长期承担模型树、工具栏、setup 表单、仿真结果、优化结果、报告、状态持久化和运行控制等职责。随着 imports、输出选择、Monte Carlo、异步优化、Pareto 过程图和结果占位状态加入，单文件继续膨胀会降低可维护性，也会让后续 OPT/SIM 分离变得更困难。

同时，Sim 与 Opt 的结果标签过去更像“运行后才出现内容”的终端区域。空状态下页面过于空白，不利于用户理解将要得到什么结果；Opt 过程数据也需要从文本日志扩展为可观察的过程图和表格。

## 决策

### 1. Simulator 作为状态编排容器

`Simulator.tsx` 保留为主容器，负责：

- 全局状态和运行状态编排。
- 与后端 API 交互。
- session attach、localStorage 持久化、模型选择和 tab 切换。
- 把数据、回调和主题 token 传给子组件。

具体 UI 拆入子组件维护：

- `SimTopBar.tsx`：顶部操作与模式入口。
- `SimModelTree.tsx`：左侧模型树、筛选和展开状态。
- `SimIntroTab.tsx`：Overview / Model 信息展示。
- `SimSetupTab.tsx`：仿真和优化输入配置。
- `SimPlotTab.tsx`：Sim Result。
- `SimOptTab.tsx`：Opt Result。
- `SimReportTab.tsx`：Report。
- `OptProgressChart.tsx`、`ParetoChart.tsx`、`SimChart.tsx`：图表组件。

该拆分不是为了制造抽象层，而是为了把“状态编排”和“标签页呈现”分离，便于后续单独改动某个工作区。

### 2. Sim Result 和 Opt Result 使用结果工作区形态

结果标签不是空白提示页，而是稳定的工作区：

- 未运行时也显示状态栏、折叠区和图表占位符。
- 有数据后，占位符自然替换为真实曲线、表格和日志。
- Sim Result 预留输出变量图表位置；如果模型没有显式 output 变量，则用模型中的非 parameter 变量生成预览位。
- Opt Result 预留 Front、Live、Process、Best、Solutions、Log 区域。
- Process 区包含 hypervolume、Pareto count、feasible ratio、evaluations、mean constraint violation 等过程图位置。

这样用户点击标签时能看到结果结构，而不是只能看到一句“暂无数据”。

### 3. 优化结果显示从日志扩展为过程可视化

Opt 不只显示文本日志，还显示：

- Pareto front 预览。
- 当前 generation、evaluation、front size、feasible ratio、constraint violation、elapsed time。
- 过程曲线，包括 normalized hypervolume。
- 推荐解和候选解表。
- 仍保留 Log 区用于查看优化过程消息。

NSGA-II 目前仍是主要算法。过程可视化为未来“继续运行 N 代”“基于当前 front 热启动”“设置 reference point 后继续”等操作预留空间。

### 4. 运行后 tab 跳转按模式区分

- Sim 模式运行后跳转到 `Sim Result`。
- Opt 模式运行后跳转到 `Opt Result`。
- 标签文案使用 `Sim Result` / `Opt Result`，而不是泛称 `Plot` / `Optimize`，避免把“运行配置”和“结果呈现”混在一起。

## 影响

- `Simulator.tsx` 仍然较大，但职责更集中：主控状态和 API 编排。
- 各标签页可以独立演进，尤其是 Opt Result 可以继续添加热启动和 Pareto 操作按钮。
- 空状态视觉更稳定，用户能预期运行后会出现哪些结果。
- Sim 与 Opt 目前仍共享 setup 配置；这解决了显示与维护问题，但还没有解决 Sim/Opt 实验状态互相污染的深层问题。

## 后续

保留任务名：**OPT/SIM 分离重构的任务**。

后续详细讨论时，以大型仿真/有限元软件的工作区思想为基础，评估是否把当前 `Setup + Sim Result + Opt Result` 重构为：

- `Sim` 标签：包含仿真输入、运行按钮、轨迹结果和仿真导出。
- `Opt` 标签：包含优化变量范围、目标、约束、算法参数、热启动控制、Pareto 结果和候选解操作。
- `Opt -> Sim` 使用显式传输动作，把选中的候选解写入 Sim 配置，而不是切换模式时隐式改写共享 setup。

该重构的目标是让 `simConfig` 与 `optConfig` 成为两个独立实验状态，模型上下文共享，但运行配置和结果互不污染。
