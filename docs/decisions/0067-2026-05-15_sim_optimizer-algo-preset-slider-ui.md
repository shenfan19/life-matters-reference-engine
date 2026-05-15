# ADR 0067 — 优化算法参数预设与滑动条 UI

## 状态

✅ 已实施

## 日期

2026-05-15

## 背景

优化器运行时间极长（半小时以上），根因是 GUI 默认值 `pop=100, gen=200`，产生 20,000 次仿真评估。用户对 `population_size` / `n_generations` 这两个参数缺乏直觉，不知道如何权衡速度与精度，且原有控件仅为两个裸 `InputNumber`，无任何引导。

同时，`L-BFGS-B` 和 `Nelder-Mead` 单目标算法不使用种群/代数概念，原来的控件显示在这两个算法下是无意义的噪音。

## 决策

### 1. 默认值收紧

`Simulator.tsx` 的初始状态从 `pop=100, gen=200`（20,000 次评估）改为 `pop=50, gen=80`（4,000 次评估），对应"标准"档位。

### 2. 三档预设按钮

在算法选择器下方加入快速 / 标准 / 精细三个预设按钮，点击同步更新滑动条和输入框：

| 档位 | pop | gen | 总评估次数 | 适用场景 |
|------|-----|-----|-----------|---------|
| 快速 | 20  | 40  | 800       | 调试、快速验证 |
| 标准 | 50  | 80  | 4,000     | 日常使用（默认） |
| 精细 | 100 | 200 | 20,000    | 发表级精度 |

超出预设范围可直接在输入框手动填入，滑动条显示到 200 封顶。

### 3. 滑动条 + 输入框联动

原来的两个 `InputNumber` 替换为 `Slider + InputNumber` 组合：

- 拖动结束（`onChangeComplete`）才更新父组件状态，避免每像素触发重渲染导致卡顿
- 输入框失焦或回车才提交，避免输入中途值跳动
- 本地 state（`localPop` / `localGen`）持有草稿值，提交时同步到父组件

### 4. 按算法类型显示/隐藏

种群/代数控件仅在 NSGA-II 和 MOEA/D 下显示；L-BFGS-B 和 Nelder-Mead 选中时隐藏，避免无意义的参数暴露。

## 影响文件

- `sim_gui/src/components/SimSetupTab.tsx`
- `sim_gui/src/components/Simulator.tsx`（默认值）
- `sim_gui/public/locales/sim/zh-CN.json`、`en.json`、`zh-TW.json`（新增 preset 键）
