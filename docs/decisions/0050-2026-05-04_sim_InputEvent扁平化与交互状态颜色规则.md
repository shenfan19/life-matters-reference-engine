# ADR 0050 — InputEvent 扁平化设计、Run 按钮修复、树标签、交互状态颜色规则

**日期**：2026-05-04  
**状态**：已实施

---

## 背景

本 ADR 覆盖 2026-05-04 一批集中改动，涉及四个独立问题：

1. **InputEvent 扁平化**：原 `Regimen / RegimenOpt` 嵌套结构导致多事件共享 `valueBounds`，且 UI 行数过多、不直观。
2. **Run 按钮无反应**：opt 模式下 `!isLocked` 和 `status === 'completed'` 均会使按钮禁用，导致首次点击即无响应。
3. **树面板标签错误**：左侧列表 header 显示"Scenarios"、组名"MODELS"指向 `components/` 文件夹，顺序也颠倒。
4. **交互状态颜色不统一**：Segmented 控件和树节点选中态使用灰色（`#2a2a2a`），与其他激活态（绿色）不一致，视觉上不明显。

---

## 决策

### 1. InputEvent 扁平化（Simulator.tsx）

**废弃** `Regimen / RegimenEvent / RegimenOpt` 三层嵌套结构，引入单一 `InputEvent` 接口：

```ts
interface InputEvent {
  id: string;
  variable: string;    // type: input 的变量名
  time: string;        // "HH:mm"
  timeEnabled: boolean; // 是否显示时间字段（UI 开关）
  value: number;
  label: string;
  daysEnabled: boolean;
  days: boolean[];     // [Mon..Sun]
  validRangeEnabled: boolean;
  validStart: string; validEnd: string;
  optimizeValue: boolean;  // 是否作为优化决策变量
  valueBounds: [number, number]; // [lo, hi]
}
```

**新 UI 布局（`renderInputsContent`）**：
- 行1：`[变量下拉] [値▣灰色] [時⊙] [日⊙] [范⊙]` 4个 pill 开关 + `[× 删除]`（右对齐，`flex:1` 隔开）
- 行2：`[值 InputNumber] [单位] [☑ opt] [lo ~ hi]`（opt 模式下可见）
- 行3（组合）：`[时间 HH:mm]?  [七日按钮]?  [起止日期]?`（任意开关打开时合并显示）

`timeEnabled` 仅控制 UI 可见性，`time` 字段始终随 regimen payload 传给后端。

**从 optimizer.inputs 预填 optimizeValue**（新模型加载时）：
模型加载 `useEffect` 在 fresh init 后，如 YAML `optimizer.inputs` 中某条目含 `optimize.value`，自动将对应 `inputEvents` 条目的 `optimizeValue = true`、`valueBounds = optimize.value`。

### 2. Run 按钮修复

**原问题**：
```js
disabled={!isLocked || (mode==='opt' && (optRunning || status==='completed'))}
```
opt 模式需要 `isLocked`（与 sim 一样），且第一次优化完成后 `status='completed'` 永久禁用按钮。

**修复**：
```js
// 新
disabled={mode === 'opt' ? optRunning : (!isLocked || status === 'completed')}
```
- opt 模式：只有 `optRunning` 时禁用；不要求锁定；完成后可再次运行。
- sim 模式：保持原行为（需锁定，completed 禁用）。

优化完成回调从 `set('status', 'completed')` 改为 `set('status', 'idle')`，避免模式切换 Segmented 被锁死。

### 3. 树面板标签修复

| 位置 | 原值 | 新值 |
|------|------|------|
| 面板 header（locale key `sim.scene.header`） | Scenarios / 场景 | Models / 模型库 |
| `components/` 文件夹分组标签 | MODELS | COMPONENTS |
| 组顺序 | SCENARIOS 在上 | COMPONENTS 在上，SCENARIOS 在下 |

### 4. 交互状态颜色规则

**原则**：绿色 = 激活/选中，灰色 = 未选中，红色 = 危险。

| 状态 | 颜色方案 |
|------|----------|
| 激活/选中 | 前景 `c.primary`，背景 `c.activeBg`，边框 `c.primary` |
| 悬停 | 背景 `c.navHover`（主色8%透明度） |
| 未选中 | 前景 `c.textSec`，背景 transparent |

**具体修改**（`App.tsx` → `academicTheme.components`）：
```js
Segmented: {
  itemSelectedBg:    isDark ? '#1a3a22' : '#e8f5e9',
  itemSelectedColor: isDark ? '#52c41a' : '#007A33',
  trackBg:           isDark ? '#1a1a1a' : '#f0f0f0',
},
Tree: {
  nodeSelectedBg: isDark ? '#1a3a22' : '#e8f5e9',  // 原 #2a2a2a（不可见）
  nodeHoverBg:    isDark ? 'rgba(82,196,26,0.08)' : 'rgba(0,122,51,0.06)',
},
```

规则同步写入 `docs/global_prompt.md § 2.1 交互状态颜色规则`。

---

## 文件变更

```
sim_gui/src/components/Simulator.tsx
  InputEvent 接口新增 timeEnabled
  renderInputsContent: 全新 pill toggle 布局，删除按钮右对齐
  startOptimization: 完成后 status='idle'，按钮无需 isLocked
  loadFileTree: COMPONENTS 前置，标签修正
  init useEffect: 从 optimizer.inputs 预填 optimizeValue

sim_gui/src/App.tsx
  academicTheme.components: 新增 Segmented token，修正 Tree token
  StatusBar: 三态指示（running=amber, online=green, offline=red）
  health check: simState.status==='running' 时跳过轮询

sim_gui/public/locales/sim/{en,zh-CN,zh-TW}.json
  sim.scene.header: "Scenarios" → "Models" / "模型库"

docs/global_prompt.md
  §2.1 交互状态颜色规则（新增）

models/components/medical/test/
  l1_drug_single_obj.yaml: 加 type:model，描述增加 [TEST L1] 标注
  l2_drug_pareto.yaml:     加 type:model，描述增加 [TEST L2] 标注
  l3_two_drug_mc.yaml:     新建，双变量双目标+MC，pop=20 gen=25
```

---

## 结果与验证

- opt 模式下点击 Run：不再需要先锁定，优化完成后可再次点击 ✓
- Segmented sim/opt 切换：选中项显示绿色背景（与其他激活元素一致）✓
- 树节点选中：绿色背景（`#1a3a22` 暗色 / `#e8f5e9` 浅色），不再是灰色 ✓
- 左侧 header 显示"Models / 模型库" ✓
- COMPONENTS 组在 SCENARIOS 上方 ✓
- test 模型显示 `mod_type: "model"` 紫色标签 ✓
- InputEvent 行1+行2 = 最小2行，开关展开最多3行（时间/日/范合并一行）✓
- 删除按钮与 toggle 之间有 `flex:1` 间距，不易误触 ✓
