
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
