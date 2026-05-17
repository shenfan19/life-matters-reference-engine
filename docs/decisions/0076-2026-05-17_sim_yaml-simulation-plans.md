# ADR 0076 — simulation.plans：YAML 级别预定义多方案

**日期**：2026-05-17  
**状态**：已决定  
**撤销/修订**：部分撤销 ADR 0073（"Plan 不进 YAML"）

---

## 背景

ADR 0073 设计 Plan 为纯 GUI session 对象，不持久化到 YAML。该决定在 GUI 内部逻辑上合理，但忽略了论文模型（papers/）的需求：

- 论文作者需要在 YAML 中预置多组比较方案（如 Pareto 前沿的代表点），使读者打开模型即可复现论文图表
- Pareto 前沿在 `optimizer.results.pareto_front` 中已存 x/f 向量，但缺少对应的 schedules 展开形式，GUI 无法直接加载为可运行 Plan
- "Plan 不进 YAML"导致发布模型缺失关键信息：别人下载 YAML 后无法知道论文用的是哪几组方案

## 决定

在 `simulation` 块中新增可选字段 `plans`，允许建模者预置多个命名方案。

### 格式

```yaml
simulation:
  plans:
    - id: "kidney_protect"        # 唯一标识（小写加下划线）
      label: "肾保护优先"          # GUI 显示标签
      schedules:                  # 与 simulation.schedules 格式相同
        - variable: dietary_protein
          time: "08:00"
          value: 0.22
          label: "早餐蛋白质"
        ...
    - id: "balanced"
      label: "临床平衡方案"
      schedules: [...]
```

### 与 simulation.schedules 的关系

| 情况 | GUI 行为 |
|------|---------|
| 仅有 `schedules` | 单方案模式（向后兼容） |
| 仅有 `plans` | 加载所有预置方案 |
| 两者共存 | `schedules` 作为默认单方案，`plans` 追加 |

## 同步修订：optimizer.results.best → reference

`optimizer.results.best` 的命名暗示存在唯一最优解，与多目标 Pareto 优化的语义冲突——Pareto 前沿上所有点均为非支配解，无客观最优。

将 `best` 改名为 `reference`，含义为"建模者从 Pareto 前沿选定的参考点"，明确该点由建模者主观标注，用户应结合完整 `pareto_front` 自行权衡。

## 设计原则

- **YAML 存初始状态**：`plans` 是建模者预置的初始方案集，GUI 加载后用户可自由增删改，不回写 YAML
- **论文可复现性**：papers/ 下的模型应将 Pareto 前沿的端点和平衡点写成具名 Plan，确保论文图表可直接复现
- **向后兼容**：仅有 `schedules` 的现有模型行为不变

## 影响

- `docs/model_design.md`：新增 `simulation.plans` schema 和 `simulation.plans` 一节；`optimizer.results.best` → `reference`
- `sim_gui/src/components/Simulator.tsx`：读取 YAML 中 `optimizer.results.reference` 的 5 处代码
- `models/papers/**/*.yaml`：4 个论文模型新增 `simulation.plans`，`best` → `reference`
