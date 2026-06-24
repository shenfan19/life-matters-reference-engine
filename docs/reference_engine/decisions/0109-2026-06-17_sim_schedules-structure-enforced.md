# ADR 0109 — schedules 位置强制规范：sim→plans，opt→startpoint

**日期**: 2026-06-17  
**状态**: 已接受  
**范围**: sim_engine · sim_gui · models/（全库）

---

## 背景

LM format 经过若干版本演进后，`schedules` 字段在 YAML 中存在三个不同位置：

| 位置 | 历史语义 |
|------|---------|
| `simulation.schedules` | 旧版单方案默认输入（ADR 0076 前） |
| `simulation.plans[*].schedules` | 新版多方案输入（ADR 0076 引入） |
| `optimizer.schedules` | 优化器决策变量 + 固定背景（ADR 0088 统一） |

这三种格式并存带来两个问题：

1. **`simulation.schedules`**（顶层）：ADR 0087 已说明 `plans` 存在时该字段对 GUI 无效，但结构上仍允许单独存在，导致建模者混淆「单方案模型应该写哪里」。
2. **`optimizer.schedules`**：`startpoint` 概念缺失——优化器需要一个明确的「起点描述」块，而非将决策变量定义散放在 `optimizer:` 的直属子层。`schedules` 直接挂在 `optimizer:` 下，既不符合「从某个初始方案出发搜索」的语义，也难以扩展（未来可能在 `startpoint` 下加 `variable_values`、`seed` 等字段）。

---

## 决策

**强制唯一位置规范（不可撤销）：**

| 上下文 | 唯一合法位置 |
|--------|------------|
| 仿真输入方案 | `simulation.plans[*].schedules` |
| 优化器决策起点 | `optimizer.startpoint.schedules` |

### 废弃位置

| 废弃字段 | 废弃版本 | 替换 |
|---------|---------|------|
| `simulation.schedules`（顶层） | 2026-06-17 | `simulation.plans[*].schedules` |
| `optimizer.schedules`（顶层） | 2026-06-17 | `optimizer.startpoint.schedules` |

### `optimizer.startpoint` 语义

`startpoint` 块描述优化器的「起点状态」：优化从这里定义的方案结构出发，搜索各 `optimize:` 参数的最优值。将 `schedules` 置于 `startpoint` 下，明确表达「这是初始协议描述，其中标记了哪些维度待搜索」，为未来扩展（如 `startpoint.variable_values` 覆盖初始变量值）预留结构。

```yaml
optimizer:
  startpoint:
    schedules:
      - variable: training_load
        time_start: "09:00"
        optimize:
          value: [40.0, 120.0]   # T1 搜索范围
```

### `simulation.plans` 单方案模型

不存在多方案需求的模型，使用单 plan（`id: default`）：

```yaml
simulation:
  plans:
    - id: default
      label: "Baseline plan"
      schedules:
        - variable: protein_intake
          time_start: "08:00"
          value: 1.5
```

---

## 迁移范围

| 类型 | 文件数 | 改动 |
|------|-------|------|
| `optimizer.schedules` 迁移 | 115 | → `optimizer.startpoint.schedules` |
| `simulation.schedules` 迁移 | 49 | → `simulation.plans[0].schedules` |

迁移由自动脚本完成，保留所有注释、数据、缩进风格。

---

## 代码改动摘要

| 文件 | 改动 |
|------|------|
| `sim_engine/src/optimizer_engine.py` | `opt_block.get('schedules')` → `opt_block.get('startpoint', {}).get('schedules')` |
| `sim_gui/src/components/opt_tab/useOptimizer.ts` | `optimizerOverride.schedules` → `optimizerOverride.startpoint.schedules` |
| `sim_gui/src/components/sim_tab/simUtils.ts` | `optimizerConfig?.schedules` → `optimizerConfig?.startpoint?.schedules` |
| `sim_gui/src/components/Simulator.tsx` | 两处 `optBlock.schedules` → `optBlock.startpoint?.schedules` |

---

## 不向后兼容

- 旧格式 `optimizer.schedules`：后端报错 `No optimizer.startpoint.schedules defined`
- 旧格式 `simulation.schedules`（无 `plans`）：后端 loader 忽略（已不解析），GUI 显示空 events

所有模型已同步迁移，无历史遗留。
