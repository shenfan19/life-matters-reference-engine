# 0087 · 2026-05-27 · Sim · `simulation.schedules` 与 `plans` 共存语义

## 背景

`simulation.plans` 功能引入后，YAML 中出现两种描述仿真输入方案的字段：

| 字段 | 语义 |
|------|------|
| `simulation.schedules` | 旧格式：单方案默认调度，向后兼容 |
| `simulation.plans` | 新格式：多命名方案列表，GUI 直接呈现为并行仿真方案 |

papers/ 下 14 个模型在加入 `plans` 后均同时保留了 `schedules`，导致：
- GUI 实际不读 `schedules`（见下方行为分析），冗余存在
- 建模者误以为 `schedules` 是 `plans` 的 fallback 默认值

## 观察到的 GUI 行为（Simulator.tsx）

GUI 在无 session 的首次模型加载时：

1. **始终先解析 `simulation.schedules`**，将其转换为 `newInputEvents`
2. **若 `simulation.plans.length > 0`**：
   - 每个 plan 从自身的 `plan.schedules` 独立构建 `planEvents`
   - `newInputEvents` 被丢弃（不赋值给任何 state）
   - 第一个 plan 的 events 成为 `inputEvents`，plans 列表初始化完毕
3. **若无 `plans`**：
   - `newInputEvents` 成为默认单方案，初始化单 plan

**结论：`simulation.schedules` 在 `plans` 存在时对 GUI 仿真标签完全无效。**

## 决策

### D1：`plans` 存在时 `schedules` 供 optimizer 使用，不供 GUI sim 使用

明确两字段的语义边界：

| 字段 | `plans` 存在时 | `plans` 不存在时 |
|------|--------------|----------------|
| `simulation.schedules` | **仅**作为 `optimizer.schedules` 缺省的 fallback 背景 | GUI sim 默认单方案 + optimizer fallback |
| `simulation.plans` | GUI sim 多方案来源（plans 列表） | — |

### D2：papers/ 模型强制使用 plans-only，删除冗余 schedules

论文模型有 Pareto 前沿结果，加载时天然呈现多方案。继续保留 `schedules` 会带来：
- GUI 不读却占 YAML 篇幅（噪声）
- optimizer 背景来源模糊（隐式 fallback 难以追踪）

决定：**papers/ 下所有模型删除 `simulation.schedules`，仅保留 `simulation.plans`。**

这些模型的 optimizer 决策变量覆盖全部 input 变量，无需 optimizer 背景，
删除 `schedules` 后 fallback 链返回空背景，行为正确。

### D3：其他模型（references/ 等）保持向后兼容

非 papers 模型不做强制要求，`schedules` 单方案模式仍完全合法。
新建具有 optimizer 的单方案模型可继续使用 `schedules`。

### D4：不更改当前 GUI 行为

"plans 优先、schedules 丢弃"的行为已稳定，只补充文档。

## optimizer.schedules fallback 链（完整规则）

```
optimizer.schedules 是否定义？
  ├─ 是 → 使用 optimizer.schedules（完全独立）
  └─ 否 → 使用 simulation.schedules（向后兼容 fallback）
              └─ simulation.schedules 也无 → 无固定背景（optimizer 仅用决策变量）
```

`simulation.plans` 的存在不影响上述 fallback 链。

## 影响的文件

- `docs/model.md` — 补充"两者共存时的行为"说明，并明确 papers 模型规范
- `models/papers/**/*.yaml`（14 个）— 删除 `simulation.schedules` 块
- 无代码变更（行为已符合预期，只缺文档）
