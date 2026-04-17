# Game 与 Converter 设计文档

**版本**: 2026-04-16  
**范围**: `game/` 卡牌游戏前端 + `sim_gui/src/components/Converter.tsx` + 转换工作流

---

## 一、整体架构概览

```
mods/scenarios/{category}/      ← 仿真模型 (源数据)
mods/stories/{category}/{id}/   ← 游戏故事包 (目标格式)
    game_story.yaml              ← 主配置文件
    cards/                       ← 卡牌 YAML 文件
        player_*.yaml
        env_*.yaml
    assets/                      ← 图片、音乐等资源
    _mapping.json                ← 转换溯源文档

game/                            ← 卡牌游戏前端 (port 5174)
    src/core/newFormatLoader.ts  ← YAML → GameStory 转换器
    src/components/CardGame.tsx  ← 游戏主组件

sim_gui/src/components/
    Converter.tsx                ← 转换器 UI (stub, 调用后端插件)
    StoryEditor.tsx              ← 故事编辑器 (集成了 Converter tab)
```

## 二、game_story.yaml 格式规范

### 2.1 完整字段结构

```yaml
meta:
  name: "故事标题"
  description: "故事描述"
  difficulty: easy | medium | hard
  period_start: "YYYY"
  period_end: "YYYY"
  country: "Country Name"
  author: ""
  tags: [Science, History, ...]
  card_back_fate: "assets/card_back_fate.jpg"    # 环境牌背面图，空字符串=用公共资产
  card_back_player: "assets/card_back_player.jpg" # 玩家牌背面图
  music:
    - "assets/track1.mid"
  science_note: "科学注解，多行文本，不在游戏内显示"
  version: "0.1"
  created_on: 2026-01-01
  source_scenario: ""   # 关联的 scenario YAML 路径（可选）

initial_state:          # 游戏变量初始值
  health: 100
  money: 40
  research_progress: 0
  # 支持任意自定义变量

variable_display:       # 变量显示覆盖（可选）
  health:
    label: "生命值"
    color: "#52c41a"
    max: 100
    higher_is_better: true   # false 用于压力/辐射等"越低越好"变量

health_mapping:         # 游戏中"生命值"来源（可选，用于映射到非 health 变量）
  source_variable: health
  scale: [0, 100, 0, 100]
  display: "生命值"

turns:
  total: 15             # 总回合数
  time_per_turn: "1 month"  # 叙事时间，仅显示用
  env_cards_per_turn: 2     # 每回合环境牌手牌数
  player_hand_size: 4       # 玩家手牌上限（超出触发弃牌要求）
  action_points: 2          # 每回合行动点数（plays_per_turn）
  draw_per_turn: 2          # 每回合末抽牌数（默认 2）

win_condition:          # 简单胜利条件（与 endings 共存，优先 endings）
  type: reach_target
  target_variable: research_progress
  target_value: 100
  description: "研究突破"

lose_condition:         # 简单失败条件
  type: health_zero
  description: "倒下了"

endings:                # 结局列表（grade D/F = 失败，其余 = 胜利）
  - grade: S
    condition: "health >= 60 and research_progress >= 100"
    title: "完美胜利"
    description: "..."
  - grade: A
    condition: "health > 0 and research_progress >= 100"
    title: "带伤的突破"
    description: "..."
  - grade: D
    condition: "health <= 0"
    title: "失败"
    description: "..."

env_deck:               # 环境牌列表（事件牌）
  - path: cards/env_radiation_damage.yaml
    weight: 300          # 抽牌权重（影响频率，不是触发概率）

player_deck:            # 玩家牌列表
  - path: cards/player_research.yaml
    copies: 3            # 牌组中的副本数

generic_cards:          # 通用牌注入（系统内置）
  inject: [rest, interrupt]
```

### 2.2 Card YAML 格式

**玩家牌 (player_*.yaml)**
```yaml
id: research
type: player
category: action
display:
  name: "实验室研究"
  description: "在实验室进行提炼..."
  flavor: "科学的代价..."
  icon: "🧪"
cost: 2                  # 行动点消耗
effects:
  - target: research_progress
    delta: 12
    condition: null      # 可选：触发条件表达式
  - target: health
    delta: -5
channel: medical         # 卡牌类型标签（决定颜色）
tags: [player]
duration:               # 可选：0=即时(默认), -1=永久, N=N回合留场
source:
  formula: "..."         # 转换溯源，维护用
  pattern_detected: P1
```

**环境牌 (env_*.yaml)**
```yaml
id: radiation_damage
type: env
category: state
display:
  name: "辐射伤害"
  description: "长期暴露导致..."
  flavor: "物理学的代价"
  icon: "☢️"
effects:
  - target: health
    delta: -8
    condition: null
channel: medical
tags: [env]
weight: 300
always_active: false       # true = 被动牌，每回合必触发
condition: "radiation > 30" # 可选：触发条件（nil/null = 无条件）
probability: 0.7           # 可选：触发概率（仅在 !always_active 时有效）
source:
  formula: "..."
  pattern_detected: P1
```

---

## 四、CardGame.tsx — 游戏运行引擎
文件：`game/src/components/CardGame.tsx`

### 4.1 牌区结构（上到下）

```
[ 顶部状态栏 — 标题 / 回合 / 行动点 / 控制按钮 ]
[ 目标变量仪表盘 (Gauge 圆弧) ]
[ 环境牌区：对手手牌(背面) | 环境牌已显示区 | 环境牌组 ]
[ 玩家牌区：玩家牌组 | 玩家场地(board) | 玩家弃牌区 ]
[ 玩家手牌区 — flex-wrap ]
[ 控制栏 — 结束回合 / 弃牌区 drop zone ]
[ 状态变量仪表盘 ]
[ 左侧日志栏（宽屏）/ 抽屉日志（窄屏）]
```

### 4.2 核心游戏状态

| 状态 | 说明 |
|------|------|
| `gs` | 当前所有变量数值 |
| `turn` | 当前回合 |
| `playsLeft` | 本回合剩余行动点 |
| `hand` | 玩家手牌 |
| `playerDeck` | 玩家牌组（未抽）|
| `playerDiscard` | 玩家弃牌区（已用）|
| `board` | 玩家场地（持续效果牌）|
| `playedCards` | 本回合已打出（待结算）|
| `stagedDiscards` | 本回合已暂存弃牌（待确认）|
| `envHand` | 环境手牌（背面，下回合翻开）|
| `envEventDeck` | 环境牌组 |
| `envEventDiscard` | 环境已用牌 |
| `envRevealed` | 本回合已翻开的环境牌 |
| `phase` | `'player'` | `'env'` |

### 4.3 回合流程

```
[玩家阶段]
  玩家打牌 → 立即应用效果到 gs，消耗 action point
  玩家可以：
    - 点击打出 → 移入 playedCards zone
    - 拖拽弃牌 → 移入 stagedDiscards zone
    - 拖拽召回 → 从 playedCards/stagedDiscards 召回到手牌
  玩家按"结束回合"

[endTurn 阶段（同步计算，800ms 延迟展示动画）]
  0. 提交暂存弃牌 → playerDiscard
  1. 结算 board 中持续牌（每张 remaining - 1，到0则移出）
  2. 提交本回合打出牌 → 有 duration 的进 board，无 duration 的进 discard
  3. 被动环境牌（always_active）触发
  4. 翻开上回合抽入的 envHand → 检查 condition + probability → 触发效果
  5. 从 envEventDeck 抽新 envHand（下回合用）；牌组耗尽时重洗
  6. 从 playerDeck 抽牌（draw_per_turn，默认 2）
  检查胜负条件，进入下一回合
```

### 4.4 卡牌类型

**PlayerCard**
- `cost`: 消耗行动点
- `duration`: `undefined`/`0`=即时，`-1`=永久留场，`N>0`=N回合留场
- `permanent`: true = 永久手牌（不进牌组，不消耗行动点，每次打出效果仍触发）

**EnvCard**
- `always_active`: true = 被动牌，每回合自动触发，不进事件牌组
- `condition`: 触发条件表达式（基于变量值的 JS 布尔表达式）
- `probability`: 触发概率（0-1 浮点，仅在非 always_active 时有效）

### 4.5 Gauge 仪表盘

- 圆弧样式，270° 可见弧，顺时针方向
- 颜色：绿 `> 55%` → 橙 `> 28%` → 红
- `higherIsBetter: false` 的变量反向计算（值越低圆弧越绿）
- 悬停手牌时显示虚线预览弧（预览效果）
- **总量模式**（Δ 按钮）：实线显示回合初始值，虚线累积本回合所有效果

### 4.6 拖放交互

三个 Drop Zone：
1. **Play Zone**（打出区）：手牌 → 打出；弃牌区 → 移回打出
2. **Discard Zone**（弃牌区）：手牌 → 暂存弃牌；打出区 → 改为弃牌
3. **Hand Zone**（手牌区）：打出 → 召回；弃牌 → 召回

手牌超出 `hand_size` 时 Discard Zone 高亮提示。

### 4.7 响应式布局

| 断点 | 布局调整 |
|------|---------|
| `>= 900px` | 完整布局：左侧日志栏 168px + 主区 + 右侧牌组列 ~150px |
| `< 900px` (isNarrow) | 去掉左右侧栏；牌组计数显示为内联徽章；顶部栏显示回合/行动点 |
| `< 600px` (isMobile) | 更紧凑顶部栏；隐藏部分控件；手牌 flex-wrap 多行 |

### 4.8 游戏持久化

使用 `localStorage` key `game_persist`，保存完整游戏状态。同一 `storyPath` 重新打开时自动恢复进度。"重新开始"按钮清除记录并刷新。

---

## 三、newFormatLoader.ts — YAML 到 GameStory 的转换
文件：`game/src/core/newFormatLoader.ts`

### 3.1 主函数签名

```typescript
async function loadNewFormatStory(cleanPath: string, rawStory: any): Promise<GameStory>
```

- `cleanPath`: 相对于 `mods/` 的路径，例如 `stories/social/ad1910_po_marie_curie/game_story.yaml`
- `rawStory`: 已解析的 `game_story.yaml` 内容

### 3.2 转换步骤

1. **加载玩家牌** — 遍历 `player_deck[]`，调用 `fetchYaml` 逐个加载，`copies: N` 复制为多个独立实例（id 加 `_1/_2...` 后缀）
2. **加载环境牌** — 遍历 `env_deck[]`，调用 `fetchYaml` 逐个加载，保留 `weight` 字段
3. **构建变量表** — 从 `initial_state` 生成变量，合并 `variable_display` 覆盖，以及 `health_mapping.display` 优先级最高
4. **构建胜负条件** — 优先解析 `endings[]` 列表（grade D/F = 失败），次选 `win_condition/lose_condition` 块；`and`/`or` 自动转换为 `&&`/`||`
5. **提取目标变量** — 从 `win_condition.target_variable` 推断 `goalVariables`
6. **资产路径解析** — `card_back_fate/card_back_player` 支持故事顶层或 `meta:` 下两种位置；空值 fallback 到 `/stories/assets_common/`
7. **音乐路径解析** — `music` 支持字符串或数组，支持顶层或 `meta:` 下；空值 fallback 到公共 `music.mid`

### 3.3 输出的 GameStory 类型

```typescript
interface GameStory {
  meta: { id, name, period, location, description, science_note, tags, author }
  variables: Record<string, VarDef>   // { label, value, max, color, higherIsBetter }
  goalVariables: string[]
  game: { plays_per_turn, max_turns, hand_size, env_per_turn, draw_per_turn? }
  lose_conditions: Array<{ condition, message }>
  win_conditions?: Array<{ condition, message }>
  player_cards: PlayerCard[]
  environment_cards: EnvCard[]
  cardBackFate: string   // URL
  cardBackPlayer: string // URL
  music: string[]        // URL[]
}
```

---

## 五、Converter.tsx — 当前实现（Stub）
文件：`sim_gui/src/components/Converter.tsx`

### 5.1 当前状态

这是一个**占位 UI**，功能尚不完整：

- 从 `/api/files` 加载故事文件列表
- 用户选择一个 Story 文件
- 点击"开始转换"调用 `/api/plugins/story_converter/run`（后端插件，目前可能未实现）
- 显示进度条（模拟）和结果 Alert

**当前问题**：
- 后端插件 `story_converter` 是否实际存在并可用，尚不确认
- 前端没有展示转换后的内容预览（如生成的 YAML）
- 没有编辑能力（仅触发转换）

### 5.2 转换工作流（手动流程，ADR 0031）

实际目前采用的是**半手动工作流**（ADR 0031 文档记录）：

```
1. 编写 scenario YAML（mods/scenarios/）
2. 计算 days_per_turn = 总时长 / 游戏回合数
3. 将 scenario variables(io_role=output) → game_story initial_state
4. 推导卡牌效果：card_delta = input_rate × days_per_turn × efficiency_factor
5. 编写 _mapping.json 记录推导过程
6. 编写各 card YAML，在 source.formula 字段记录溯源
```

### 5.3 Sim → Game 完整映射表
综合 `docs/design/model.md` 与 `docs/design/story.md` 整理。

#### A. 变量类型

| 类型                 | Sim (`model.yaml`)                                                                                  | Opt（优化器）                                                                         | Converter 映射方法                                                                                       | Game (`game_story` + cards)                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **状态变量** `state`   | `type: state`；由 `dynamics` Euler 更新：`var = var + expr * dt`；`bounds: [min, max]`, `unit`, `io_role` | 通常 `optimizable: false`；可作为优化**目标函数**的输出量（如最小化健康损失）                              | `io_role: output` → `initial_state` 初始值；`bounds[1]` → `variable_display.max`；`description` → `label` | `initial_state.<var>`；`variable_display: { label, max, color, higherIsBetter }`；渲染为 Gauge 圆弧状态条 |
| **输入变量** `input`   | `type: input`；用户可调控干预量（给药剂量、每日行为）；有 `bounds`                                                        | 通常不优化；`optimizable: true` 时可作为干预序列寻优                                             | 每个 `input` → 一张**玩家牌**；`card_delta = input_rate × days_per_turn × efficiency_factor`；多个相关输入可合并为一张牌   | `player_deck[].path → player_*.yaml`；`cost`=行动点消耗；`effects[].delta`=计算后的离散增量                    |
| **参数** `parameter` | `type: parameter`；模型固有系数（吸收率、半衰期、传播率）；`optimizable: true/false`；`bounds` 为搜索空间                      | **优化器主要搜索对象**；`optimizable: true` → fitting/search 找最优值；优化结果可回写为 Story `patches` | 参数值大小 → 环境牌**抽取权重** `weight` 或**触发概率** `probability`；高参数值 = 高威胁频率                                    | `env_deck[].weight`（抽牌频率加权）；`env_*.yaml: probability`（翻开后触发概率）；玩家不可见但可感知                        |

#### B. 公式类型

| 类型 | Sim (`model.yaml`) | Opt（优化器） | Converter 映射方法 | Game (`game_story` + cards) |
|------|-------------------|-------------|------------------|----------------------------|
| **动力学公式** `dynamics` | `formulas.<name>.dynamics`；Euler 离散：下一刻 = 当前 + 变化量；有 `condition`、`priority(-100~100)` | 优化器运行完整仿真循环评估目标函数；dynamics 构成核心计算图 | 模式识别 P1–P5：**P1** 线性增量→固定 `delta`；**P2** 衰减/恢复→恢复型玩家牌；**P3** 计数器累积→`always_active: true` 环境牌；**P4** 阈值触发→`condition: "var > threshold"`；**P5** 复杂非线性→近似分段或多牌组合 | 卡牌 `effects[].delta`；`source.formula` 记录溯源公式；`source.pattern_detected: P1~P5` |
| **静态公式** `formula` | `formulas.<name>.formula`（与 `dynamics` 二选一）；不依赖 dt，直接计算当前值 | 可作为优化中间指标供目标函数引用 | 映射为**即时计算指标**；不受回合驱动，随时刷新显示 | 实时显示的派生数值标签（如"综合风险等级"）；不是状态条，是瞬时标注 |
| **触发条件** `condition` | `formulas.<name>.condition: "expression"`；只有满足条件时公式生效 | — | 条件表达式直接保留变量名；布尔逻辑 `and/or` → `&&/\|\|` | 环境牌 `condition: "expression"`；玩家牌 `effects[].condition`；P4 阈值模式的核心机制 |

#### C. 时间与步长

| 类型 | Sim (`model.yaml`) | Opt（优化器） | Converter 映射方法 | Game (`game_story` + cards) |
|------|-------------------|-------------|------------------|----------------------------|
| **步长** `step_size` / `dt` | `simulator.step_size`；单位为 `time_unit`；引擎内部以秒存储 | 每步评估后积累目标函数值；步长影响收敛精度 | **1 step = 1 Turn**；`days_per_turn = total_time(天) / turns.total`；所有 `delta = rate × days_per_turn` | `turns.total`（总回合数）；`turns.time_per_turn: "1 month"`（纯叙事显示） |
| **时间单位** `time_unit` | `second / minute / hour / day / week / month / year`；影响公式中 dt 的物理含义 | 通常固定；影响优化收敛所需迭代次数 | 决定"一回合 = 多长现实时间"的文案 | 回合时间标注文案（纯显示，不影响计算） |
| **总时长** `total_time` | `simulator.total_time`；仿真总时长（单位同 time_unit） | 确定优化窗口长度 | → `turns.total = total_time / step_size` | 关卡总回合上限；进度条或回合计数器 |
| **每日输入** `daily_inputs` | 以天为单位的阶梯/线性输入时序；引擎自动转为秒级时间戳 | 可作为干预时间序列的优化变量 | → **预设事件序列**；在对应回合自动触发输入变化；玩家无法阻止 | 剧情事件牌（自动触发）；体现历史约束（如1910年无青霉素） |
| **累积器** `accumulators` | 按 `day/week/month` 窗口对 source 变量自动积分（sum/mean） | 积累量可作为优化目标（如最小化月均吸烟量） | → **周期统计面板**；在窗口边界回合显示汇总结果；可触发里程碑奖惩 | 周期报告弹窗（"本周吸烟总量：140支"）；成就/里程碑触发点 |

#### D. 动力学大类（Category）→ 游戏模式

| 类型 | Sim (`model.yaml`) | Opt（优化器） | Converter 映射方法 | Game (`game_story` + cards) |
|------|-------------------|-------------|------------------|----------------------------|
| **physiological**（生理） | 血糖调节、病毒载量、药代动力学等 | 优化健康指标（最大化生存时间、最小化并发症） | 生命指标映射；核心 state → HP 红条；辅助 state → 血糖/体温/辐射等状态条 | **生存模式**；`lose_condition: health_zero`；状态条触发危机环境牌 |
| **socio_economic**（社会经济） | 劳动力生产率、市场供需、财政积累 | 优化经济收益（最大化储蓄/生产率，最小化债务） | 循环流转映射；资金 state → Money 条；效率 state → Productivity 条 | **经营模式**；每回合有收支结算；资源流转与积累为核心 |
| **environmental**（环境） | 灾害强度、重建进度 | 优化救援策略（最大化存活人口，最小化重建时间） | 危机响应映射；危害 state → Danger 条；应对 state → Safety/Rescue 进度条 | **策略模式**；明确的危机倒计时；资源分配决策为核心 |
| **risk**（风险对抗） | 战争压力、冲突烈度、政治稳定性 | 优化稳定性（最大化稳定指数，最小化冲突烈度） | 冲突博弈映射；稳定 state → Stability 量表；对抗 state → War Intensity 条 | **对抗模式**；有对手/敌对环境；博弈感与压力感强 |
| **simple**（简易教学） | 香蕉生长、面条烹饪等线性演示 | 通常无优化；或演示参数敏感性 | 线性增长映射；进度 state → Mastery 条；质量 state → Quality/Freshness 条 | **教学模式**；目标明确、步骤线性；适合新手引导关卡 |

#### E. 故事层结构

| 类型 | Sim (`model.yaml`) | Opt（优化器） | Converter 映射方法 | Game (`game_story` + cards) |
|------|-------------------|-------------|------------------|----------------------------|
| **模型组合** `imports` | `imports:` 递归引入 core 模型；合并 variables + formulas | 组合后完整模型是优化器运行环境 | 组合所有模型的变量映射结果，生成完整手牌集 + 状态条集 | 关卡的完整 `player_deck` + `env_deck` + `initial_state` |
| **参数覆写** `patches` | 字段级覆写 core 变量值（历史/地域适配）；只修改指定字段 | 覆写后值作为优化器初始值或固定约束 | 覆写值影响卡牌效果数值（如1910年阿司匹林效力0.6 vs 默认0.8） | 历史真实性体现；卡牌数值注释中标注时代背景 |
| **故事元数据** `story:` | `story: location, year, season, population, initial_conditions` | 不参与优化；提供约束来源的语义说明 | → 关卡标题、背景氛围、`period_start/end`、`country` | `meta: { name, description, difficulty, period_start, period_end, country, tags }` |
| **数值归一化** | 变量原始量级（人口 10⁶、浓度 mg/L） | 优化结果量级不一 | **归一化**：大数 → 0–100；**离散化**：忽略微小波动；**感性化**：`RR=14` → 极高风险 + 高 weight | `variable_display.max`；`health_mapping.scale: [sim_min, sim_max, 0, 100]`；`weight: 300`（高威胁） |
| **胜负结局** | `simulator.output_variables` + 研究者目标阈值 | 优化目标函数值 → 可反映为 grade S 条件 | 输出变量+目标阈值 → `win_condition`；生存变量清零 → `lose_condition`；多阈值组合 → `endings[]` 分级 | `win_condition`；`lose_condition: health_zero`；`endings[]: { grade: S/A/B/C/D/F, condition, title }` |
| **优化结果回写** | — | 优化器输出最优 `parameter` 值 | 最优参数 → Story `patches` 中的覆写值；决定游戏基准难度平衡点 | `patches.<mod>.<var>: 最优值`（游戏平衡基准） |
| **通用牌注入** | — | — | 系统内置，不来自 sim | `generic_cards.inject: [rest, interrupt]`；⚠️ `newFormatLoader` 当前**未实现**此字段解析 |

---

## 六、已知设计问题与待讨论点

### 6.1 Converter 前后端对接
- 当前 `Converter.tsx` 调用的 `/api/plugins/story_converter/run` 后端插件状态不明
- 需要确认：后端是否真正实现了自动转换，还是依然需要人工操作后上传

### 6.2 generic_cards 未实现
- `game_story.yaml` 中有 `generic_cards.inject: [rest, interrupt]` 字段
- `newFormatLoader.ts` 目前**不处理**这个字段
- "休息"和"中断"等通用牌需要从某个公共库注入，但机制未实现

### 6.3 card_back 资产路径容错
- 当 `card_back_fate/player` 为空字符串时，fallback 到 `/stories/assets_common/`
- 目前 `env_fitness_dynamics` 等 medical 故事没有设置资产，依赖公共资产

### 6.4 duration 牌的 Recall 机制
- `duration > 0` 的牌进入 `board`，但目前没有 "提前撤回" 机制（只有即时牌可以 recall）
- 永久牌（`duration: -1`）也在 board 中，但不消耗手牌位

### 6.5 env_deck weight 与 probability 的区别
- `weight`：影响抽牌频率（加权随机，尚未在 `newFormatLoader` 中实际使用加权抽取）
- `probability`：牌被抽到后的触发概率（在 `endTurn` 中执行 `Math.random() < probability`）
- **当前 bug**：`loadNewFormatStory` 加载 envCards 时**丢弃了** `weight` 信息，未做加权抽取

### 6.6 endings 条件中 `and`/`or` 大小写转换
- `buildConditions` 中有 `.replace(/\band\b/gi, '&&')` 逻辑
- 但 `evalCond` 函数也有同样转换，可能双重转换（`&&` → `&&` 无害，但值得注意）

---

## 七、文件路径快速参考

| 文件 | 用途 |
|------|------|
| `game/src/core/newFormatLoader.ts` | YAML → GameStory 转换器 |
| `game/src/core/types.ts` | 类型定义（Story, Card, DeckConfig 等旧格式）|
| `game/src/components/CardGame.tsx` | 游戏主引擎 (~1600行) |
| `game/src/components/CardGame.css` | 游戏样式 |
| `game/src/core/fetchYaml.ts` | YAML 加载工具（走 `/api/file/{path}`）|
| `game/src/core/storyI18n.ts` | i18n overlay 加载 |
| `sim_gui/src/components/Converter.tsx` | 转换器 UI (stub) |
| `sim_gui/src/components/StoryEditor.tsx` | 故事编辑器（含 Converter tab）|
| `mods/stories/social/ad1910_po_marie_curie/` | 典型完整故事包参考 |
| `mods/stories/medical/banister_fitness_fatigue/` | 典型医学建模故事参考 |
| `docs/decisions/0031-*.md` | 转换工作流 ADR |
