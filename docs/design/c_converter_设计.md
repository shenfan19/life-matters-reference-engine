# Converter 设计

## 架构概览

```
mods/scenarios/{category}/      ← 仿真模型 (源数据)
mods/stories/{category}/{id}/   ← 游戏故事包 (目标格式)
    game_story.yaml
    cards/
        player_*.yaml
        env_*.yaml
    assets/
    _mapping.json               ← 转换溯源文档

sim_gui/src/components/
    Converter.tsx               ← 转换器 UI
    StoryEditor.tsx             ← 故事编辑器（含 Converter tab）
```

## Converter UI 设计

```
┌──────────────┬──────────────────────────────────────────┬──────────────┐
│  Scenario    │              转换工作区                    │  Game        │
│  文件树      │  ┌──────────────┐    ┌──────────────┐    │  文件树      │
│              │  │ Scenario     │    │ Game Story   │    │              │
│  单选        │  │ 摘要（只读） │    │ 入口（可编辑）│    │  跟随左侧    │
│              │  │              │    │              │    │  高亮匹配    │
│              │  │ 变量列表     │    │ 卡牌列表     │    │  文件夹      │
│              │  └──────────────┘    └──────────────┘    │              │
│              │       ↓ 映射表（可编辑行）↓               │              │
│              │  [health映射下拉] [→ 自动生成] [保存]      │              │
└──────────────┴──────────────────────────────────────────┴──────────────┘
```

**操作流程**：
1. 左侧点击 scenario 文件夹
2. 右侧自动锁定同名 `to_game/` 文件夹
3. 中间展示 scenario 摘要（只读）+ game_story 入口（可编辑）
4. health 映射：必填下拉，选择哪个 scenario output 变量映射为 health
5. 点击"自动生成"执行转换，点击"保存"写入文件并更新 `_mapping.json`

## Sim → Game 完整映射表

### A. 变量类型

| 类型 | Sim (`model.yaml`) | Opt | Converter 映射 | Game |
|------|-------------------|-----|---------------|------|
| **状态变量** `state` | `type: state`；Euler 更新；`bounds`, `io_role` | 可作优化目标函数输出 | `io_role: output` → `initial_state`；`bounds[1]` → `variable_display.max` | Gauge 圆弧状态条 |
| **输入变量** `input` | `type: input`；用户可调控干预量 | `optimizable: true` 时可作干预序列寻优 | 每个 `input` → 一张玩家牌；`card_delta = input_rate × days_per_turn × efficiency_factor` | `player_deck[].path → player_*.yaml` |
| **参数** `parameter` | `type: parameter`；模型固有系数；`bounds` 为搜索空间 | **优化器主要搜索对象** | 参数值 → 环境牌 `weight` 或 `probability` | `env_deck[].weight`；`env_*.yaml: probability` |

### B. 公式类型

| 类型 | Sim | Converter 映射 | Game |
|------|-----|---------------|------|
| **动力学公式** `dynamics` | Euler 离散；有 `condition`、`priority` | P1–P6 模式识别 → 卡牌 `effects[].delta` | `source.pattern_detected: P1~P6` |
| **静态公式** `formula` | 不依赖 dt，直接计算当前值 | → 即时计算指标（随时刷新显示） | 实时派生数值标签 |
| **触发条件** `condition` | `condition: "expression"` | 布尔逻辑 `and/or` → `&&/\|\|` | 环境牌 `condition`；P4 阈值模式 |

### C. 时间与步长

| 类型 | Converter 映射 | Game |
|------|---------------|------|
| **步长** `step_size` / `dt` | **1 step = 1 Turn**；`days_per_turn = total_time(天) / turns.total` | `turns.total` |
| **时间单位** `time_unit` | 决定"一回合 = 多长现实时间"文案 | 回合时间标注（纯显示） |
| **总时长** `total_time` | → `turns.total = total_time / step_size` | 关卡总回合上限 |
| **每日输入** `daily_inputs` | → 预设事件序列，对应回合自动触发 | 剧情事件牌（自动触发） |
| **累积器** `accumulators` | → 周期统计面板，窗口边界回合显示汇总 | 周期报告弹窗 |

### D. 动力学大类 → 游戏模式

| 大类 | Converter 映射 | Game 模式 |
|------|---------------|----------|
| `physiological` | 核心 state → HP 红条；辅助 state → 状态条 | **生存模式** |
| `socio_economic` | 资金 state → Money 条；效率 state → Productivity 条 | **经营模式** |
| `environmental` | 危害 state → Danger 条；应对 state → Safety 进度条 | **策略模式** |
| `risk` | 稳定 state → Stability 量表；对抗 state → War Intensity 条 | **对抗模式** |
| `simple` | 进度 state → Mastery 条；质量 state → Quality 条 | **教学模式** |

### E. 故事层结构

| 类型 | Converter 映射 | Game |
|------|---------------|------|
| **模型组合** `imports` | 组合所有模型映射结果，生成完整手牌集 + 状态条集 | 关卡完整 `player_deck` + `env_deck` |
| **参数覆写** `patches` | 覆写值影响卡牌效果数值（如1910年药效 0.6 vs 默认 0.8）| 历史真实性体现 |
| **故事元数据** `story:` | → 关卡标题、背景、`period_start/end`、`country` | `meta: { name, description, difficulty, ... }` |
| **数值归一化** | 大数 → 0–100；`RR=14` → 极高风险 + 高 weight | `variable_display.max`；`weight: 300` |
| **胜负结局** | 输出变量+目标阈值 → `win_condition`；多阈值 → `endings[]` | `endings[]: { grade: S/A/B/C/D/F }` |
| **通用牌注入** | 系统内置，不来自 sim | `generic_cards.inject` ⚠️ newFormatLoader 当前未实现 |

## 公式识别 → 环境牌类型（P1-P6）

| 模式 | 数学表达 | 识别特征 | 环境牌类型 | 状态 |
|------|---------|---------|----------|------|
| P1 | `hp -= C` | 常数减法 | 固定伤害 | ✅ 必需 |
| P2 | `x = x + C` | 变量自增 | 累积 debuff | ✅ 必需 |
| P3 | `hp -= x * k` | 变量×系数 | 累积伤害 | ✅ 必需 |
| P4 | `if x > T: damage` | 条件判断 | 阈值触发 | ✅ 核心 |
| P5 | `if random() < p: damage` | 概率函数 | 概率触发（weight = p×1000）| ✅ 核心 |
| P6 | `hp -= hp * r` | 百分比自伤 | 百分比伤害 | ❓ 待定（可用 P3 替代）|

## 降维规则（Sim 精确值 → Game 整数）

| Sim 值 | 降维方式 | 示例 |
|--------|---------|------|
| 连续微分方程 | `dt=1 turn` 时的 delta，四舍五入 | `d_health/dt = -0.3/day × 30days = -9` |
| RR 值 | 转为权重乘数 | `RR=2.7 → weight × 2.7` |
| 概率 p | `weight = round(p × 1000)` | `p=0.05 → weight=50` |
| 百分比 r | 保留为 `delta_percent: -r` | `r=0.1 → -10% health/turn` |
| 阈值 T | 直接映射 | `glucose > 180 → condition.value: 180` |
