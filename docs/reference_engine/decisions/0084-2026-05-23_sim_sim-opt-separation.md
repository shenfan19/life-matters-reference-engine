# 0084 · 2026-05-23 · Sim · Sim / Opt 完全分离

## 背景

原来的设计中，`InputEvent` 同时承载两种语义：
- 仿真语义：`value`、`time`、`days`、`validRange`
- 优化语义：`optimizeValue`（标记该事件是否参与优化）、`valueBounds`、`timeWindow`、`optimizeTime`、`daysOptions`、`optimizeDays`、`dateStartWindow`、`optimizeDateStart`、`dateEndWindow`、`optimizeDateEnd`

这个"兼容开关"设计（`optimizeValue`）导致：
- `InputEvent` 类型膨胀，含 15+ 字段，其中近半与仿真无关
- 切换 sim/opt 模式时，`SimSetupTab` 需要根据 `mode` 渲染完全不同的 UI
- 优化的"背景输入"（非决策变量的固定 input）与决策变量混在 `optimizer.inputs` 里，语义不清晰
- YAML 的 `optimizer` block 缺少独立的 `schedules`（固定背景）字段

## 决策

### D1：分离 InputEvent 和 OptInput

**`InputEvent`**（sim tab 专用）保留纯仿真字段：
```typescript
{ id, variable, time, timeEnabled, value, label,
  daysEnabled, days, validRangeEnabled, validStart, validEnd }
```

**`OptInput`**（opt tab 专用）是独立类型，有 valueBounds 代替 value，包含 T1–T4 所有优化字段：
```typescript
{ id, variable, label, valueBounds: [lo, hi],
  time, timeEnabled, timeWindow, optStep, optimizeTime,
  daysEnabled, days, daysOptions, optimizeDays,
  validRangeEnabled, validStart, validEnd,
  dateStartWindow, optimizeDateStart, dateEndWindow, optimizeDateEnd }
```

`optInputs: OptInput[]` 和 `optBackgrounds: InputEvent[]` 加入 `ModelSession`，独立持久化。

### D2：新建 OptSetupTab 组件

`OptSetupTab.tsx` 包含三个可折叠 section：
- **决策变量**（`optInputs`）：T1–T4 全功能编辑，有"← 从 Sim 导入"按钮
- **背景输入**（`optBackgrounds`）：固定背景，不参与搜索
- **优化器配置**：objectives / constraints / algorithm（从 SimSetupTab 移出）

`SimSetupTab` 只保留纯 sim 功能（inputs + plans），删除 `mode` prop 和所有 OPT 渲染。

### D3：YAML 新增 optimizer.schedules

`optimizer.schedules` 与 `simulation.schedules` 格式相同，专为 opt 评估提供固定背景输入。
- 引擎优先级：`optimizer.schedules` > `simulation.schedules`（通过 `manual_overrides` 机制实现）
- 缺省继承：`optimizer.schedules` 不存在 → `simulation.schedules` 自动作为背景（向后兼容）

### D4：迁移

- 无 session 的旧模型首次加载：从 YAML `optimizer.inputs` 构建 `optInputs`（有 `optimize:` 块的条目），从固定条目（无 `optimize:` 块）和 `optimizer.schedules` 构建 `optBackgrounds`
- 有 session 的模型：直接从 localStorage 恢复 `optInputs` 和 `optBackgrounds`
- `xToInputEvents`：删除 `ev.optimizeValue` 条件，改为按 variable+time 匹配；找不到时自动创建新事件

### D5：startOptimization() 变化

```typescript
// 之前
const inputs = inputEvents.filter(ev => ev.optimizeValue).map(ev => buildInpFromEv(ev));

// 之后
const inputs   = optInputs.map(oi => buildInpFromOi(oi));     // 决策变量
const schedules = optBackgrounds.map(bg => buildSchedFromBg(bg)); // 背景
```

### D6：Fallback 策略（明确规则）

| 资源 | fallback 源 | 何时触发 |
|------|------------|---------|
| `optimizer.start_date` | `simulation.start_date` | opt block 无此字段 |
| `optimizer.end_date` | `simulation.end_date` | 同上 |
| `optimizer.step_size` | `metadata.step_size` | 同上 |
| `optimizer.schedules` | `simulation.schedules` | `optimizer.schedules` 不存在或为空 |
| `optInputs` session | YAML `optimizer.inputs` | 无 session 时首次初始化 |

## 影响的文件

- `sim_gui/src/types.ts` — `InputEvent` 简化，新增 `OptInput`，`ModelSession` 新字段
- `sim_gui/src/components/SimSetupTab.tsx` — 删除 `mode` prop，只保留 sim 渲染
- `sim_gui/src/components/OptSetupTab.tsx` — 新文件，opt tab 左侧面板
- `sim_gui/src/components/Simulator.tsx` — 新 state、新 CRUD、新 startOptimization、新渲染
- `sim_gui/public/locales/sim/*.json` — 新 i18n keys
- `sim_engine/src/optimizer_engine.py` — 新增 `optimizer.schedules` 支持
- `docs/model.md` — `optimizer.schedules` 字段文档
- `c:/fan/b_lm_home/LM_FORMAT_1.0.md` — 同步 optimizer schema

## 被否决的方案

**保留 `optimizeValue` 标记**：每次需要新的 opt 场景都要在 `InputEvent` 里添加字段，扩展性差，且混淆了仿真和优化两种语义。

**在 GUI 层面强制 opt block**：要求 YAML 必须有 `optimizer:` 才能使用 opt tab，这对纯组件模型（无 `optimizer:` block）过于严格。应由 GUI session 承载临时 opt 配置。
