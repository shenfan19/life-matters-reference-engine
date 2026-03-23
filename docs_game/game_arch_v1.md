# Game Story 架构 & Converter 设计 v1.0

**日期**: 2026-03-23（更新）
**状态**: 基础游戏引擎已实现；Converter、双通道、Status 机制待开发
**上游文档**: c_game_v0.4_merged.md
**覆盖范围**: 文件结构 / Schema / Converter UI / 自动转换逻辑

> **当前实现状态速览**
> - ✅ `game_story.yaml` 单文件 Schema（所有卡牌内联）
> - ✅ 回合制卡牌游戏引擎（AP / 手牌 / 环境牌 / 胜负条件 / 撤回）
> - ✅ 多语言叠加层（`game_story.zh-CN.yaml` 等）
> - ✅ 场景选择界面（分类筛选 / 卡片+列表视图 / 语言切换）
> - ⏳ 卡牌独立文件（`cards/*.yaml`）— 目前所有卡牌内联在 game_story.yaml
> - ⏳ Converter UI（左右联动、自动生成骨架）
> - ⏳ Status 阶层机制、双通道、通用牌体系

---

## 一、设计决策汇总

| 问题 | 决策 | 理由 |
|------|------|------|
| 单文件 vs 文件夹 | **文件夹** | 支持图片/音效、卡牌独立管理、版本控制清晰 |
| 左右关联方式 | **文件夹名精确匹配** | 自动锁定，无需用户手动选择 |
| health 映射 | **必须映射，每关可不同变量** | 每个 game 都需要 health 概念，但来源变量因场景而异 |
| 卡牌效果表达 | **整数降维（炉石风格）** | `delta: -10`，而非公式字符串；converter 负责降维 |
| 卡牌权重 | **显式 `weight` 整数字段** | 基准 100，概率牌 = `p × 1000`；不用重复引用 |
| 公式识别 | **P1-P6 六种模式** | 沿用 v0.4 定义，对应六种游戏效果类型 |

---

## 二、文件目录结构

```
mods/
  scenarios/
    ad1346_europe_black_death/        ← Sim 侧（scenario 文件夹）
      scenario.yaml

  to_game/
    ad1346_europe_black_death/        ← Game 侧，文件夹名严格对应
      game_story.yaml                 ← 关卡入口
      _mapping.json                   ← Converter 映射记录（自动维护）
      cards/
        env_plague_spread.yaml        ← 环境牌（系统出）
        env_famine.yaml
        player_quarantine.yaml        ← 玩家牌（手牌）
        player_trade_ban.yaml
        generic_rest.yaml             ← 通用牌（自动注入）
      assets/                         ← 可选
        background.jpg
        theme.ogg
```

**关联规则**：`scenarios/{name}/` ↔ `to_game/{name}/`
- 左侧选中 → 右侧自动锁定对应文件夹
- 文件夹不存在 → 右侧显示"待生成"空状态

---

## 三、game_story.yaml Schema（关卡入口）

```yaml
# ── 元信息 ──────────────────────────────────────────────
meta:
  name: "黑死病：欧洲, 1346"
  description: "在中世纪欧洲，鼠疫横扫大陆。作为普通市民，你能撑过这个冬天吗？"
  difficulty: hard              # easy / medium / hard
  tags: [历史, 疾病, 欧洲, 中世纪]
  author: ""
  version: "0.1"
  source_scenario: "ad1346_europe_black_death"   # 对应 scenario 文件夹名

# ── 玩家初始状态 ────────────────────────────────────────
initial_state:
  health: 100                   # 必须字段；来自 scenario 变量映射（见 _mapping.json）
  money: 10
  status: 1                     # 阶层 1-3（赤贫/平民/中产）
  # 第三资源（可选，场景特有）：
  # radiation: 0               # debuff 型
  # research_progress: 0       # 目标型

# ── health 映射声明 ──────────────────────────────────────
health_mapping:
  source_variable: "survival_rate"   # 对应 scenario 中哪个 output 变量
  scale: [0, 1, 0, 100]             # [sim_min, sim_max, game_min, game_max]
  display: "生命值"

# ── 回合配置 ────────────────────────────────────────────
turns:
  total: 12                     # 总回合数（null = 无限直到胜负）
  time_per_turn: "1 month"      # 对应 sim 时间粒度（标注用，非计算用）
  env_cards_per_turn: 2         # 每回合环境牌数
  player_hand_size: 5           # 玩家手牌数
  action_points: 3              # 每回合行动点

# ── Status 配置 ─────────────────────────────────────────
status_config:
  - level: 1
    label: "赤贫"
    income_per_turn: 2
    money_cap: 10
    deck_filter: basic          # 只能用 basic 牌
  - level: 2
    label: "平民"
    income_per_turn: 4
    money_cap: 20
    deck_filter: standard
  - level: 3
    label: "中产"
    income_per_turn: 5
    money_cap: 30
    deck_filter: advanced

# ── 胜负条件 ────────────────────────────────────────────
win_condition:
  type: survive                 # survive | reach_target
  description: "撑过 12 个回合"

lose_condition:
  type: health_zero
  description: "生命值归零"

# ── 多结局评分 ──────────────────────────────────────────
endings:
  - grade: S
    condition: "health >= 50 and turns_used < total_turns"
    title: "死里逃生"
  - grade: A
    condition: "health > 0"
    title: "幸存者"
  - grade: D
    condition: "health <= 0"
    title: "黑死病的牺牲者"

# ── 卡组引用 ────────────────────────────────────────────
env_deck:
  - path: cards/env_plague_spread.yaml
    weight: 300                 # 基准 100；概率牌 = p×1000
  - path: cards/env_famine.yaml
    weight: 150

player_deck:
  - path: cards/player_quarantine.yaml
  - path: cards/player_trade_ban.yaml

generic_cards:                  # 自动注入的通用牌（v0.4 通用牌体系）
  inject: [rest, labor, interrupt, insurance, reset]

# ── 资源引用 ────────────────────────────────────────────
assets:
  background: assets/background.jpg   # 可选
  music: assets/theme.ogg             # 可选
```

---

## 四、Card Schema（单张卡牌）

### 4.1 环境牌（系统出牌）

```yaml
# cards/env_plague_spread.yaml
id: env_plague_spread
type: env
category: disease               # disease / social / natural / economy

display:
  name: "鼠疫蔓延"
  description: "感染者走遍了市集，无人幸免。"
  flavor: "1346年，热那亚商船带来了它。"
  icon: ""

# 卡牌类型（对应 v0.4 六种公式模式）
pattern: P1                     # P1固定伤害 / P2累积debuff / P3累积伤害
                                # P4阈值触发 / P5概率触发 / P6百分比伤害

# 效果（整数降维，炉石风格）
effects:
  - target: health
    delta: -10                  # 正数回复，负数伤害
    condition: null             # null = 无条件

  # P4 示例（阈值触发）：
  # - target: health
  #   delta: -20
  #   condition:
  #     type: threshold
  #     variable: status
  #     op: "<="
  #     value: 1               # status≤1（赤贫）时触发

  # P5 示例（概率触发）：
  # - target: health
  #   delta: -50
  #   condition:
  #     type: probability
  #     value: 0.05            # 5% 概率

# debuff 累积（P2）
debuff: null
# debuff:
#   id: plague_stack
#   add: 1                     # 每次出现+1层
#   damage_per_stack: 2        # 每层每回合 -2 health

# 槽位信息（双通道对齐）
channel: medical                # medical | social
tags: [disease, contagious, acute]

# 权重（在 game_story.yaml 中覆盖，此处为默认值）
weight: 100

# 溯源（Converter 自动填入）
source:
  variable: "infection_rate"
  formula: "health -= infection_rate * 10"
  pattern_detected: P1
```

### 4.2 玩家牌（手牌）

```yaml
# cards/player_quarantine.yaml
id: player_quarantine
type: player
category: health                # work | goal | health | risk

display:
  name: "隔离封锁"
  description: "关闭市集，阻止鼠疫蔓延。"
  flavor: "代价是饥饿，收益是生存。"
  icon: ""

cost: 2                         # 行动点消耗

# 解锁条件
unlock:
  min_status: 1                 # 最低阶层
  requires_card: null           # 需要某张牌在场

# 效果
effects:
  - target: health
    delta: +5
  - target: money
    delta: -3

# 对应槽位（Tag 对齐）
channel: medical
tags: [disease]                 # 可与 disease 类环境牌对齐

# 溯源
source:
  variable: "quarantine_policy"
  formula: "health_risk -= 0.3"
  pattern_detected: P1
```

### 4.3 通用牌（自动注入，无需单独文件）

v0.4 定义的通用牌直接内置在引擎中，通过 `game_story.yaml` 的 `generic_cards.inject` 列表控制注入哪些：

| id | 名称 | 效果 | 费用 |
|----|------|------|------|
| `rest` | 休息 | +8 health，本回合停工 | 1 |
| `labor` | 苦力 | +2 money，-3 health | 1 |
| `interrupt` | 打断 | 阻止1张环境牌 | 2 |
| `insurance` | 保险 | 本回合 health 不低于 10 | 2 |
| `reset` | 重置 | 回退本回合，-10 health，每局1次 | 0 |
| `double` | 双倍效果 | 下张牌效果×2 | 1 |
| `combo_prep` | 连击准备 | 本回合停工，下回合+1行动点 | 0 |

---

## 五、_mapping.json（Converter 自动维护）

```json
{
  "version": "1.0",
  "source_scenario": "ad1346_europe_black_death",
  "generated_at": "2026-03-22",
  "updated_at": "2026-03-22",

  "health_mapping": {
    "source_variable": "survival_rate",
    "scale": [0, 1, 0, 100]
  },

  "auto_mappings": {
    "metadata.name":        "meta.name",
    "metadata.description": "meta.description",
    "metadata.tags":        "meta.tags",
    "simulator.total_time": "turns.total"
  },

  "variable_to_card": {
    "infection_rate":   "cards/env_plague_spread.yaml",
    "famine_index":     "cards/env_famine.yaml",
    "quarantine_policy":"cards/player_quarantine.yaml"
  },

  "formula_patterns": {
    "health -= infection_rate * 10": "P1",
    "famine_index += 0.1":           "P2"
  },

  "manual_overrides": {}
}
```

---

## 六、Converter UI 设计

### 布局

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

### 操作流程

1. **左侧**点击 scenario 文件夹
2. **右侧**自动锁定同名 `to_game/` 文件夹
3. **中间**展示：
   - 左卡：scenario 摘要（变量列表、公式列表，只读）
   - 右卡：game_story 入口 + 卡牌列表（可编辑）
4. **映射表**：每行 `[scenario字段] → [game字段]`，支持下拉修改
5. **health 映射**：必填下拉，选择哪个 scenario output 变量映射为 health
6. 点击 **→ 自动生成**：执行转换逻辑，生成文件夹
7. 点击 **保存**：写入文件，更新 `_mapping.json`

### 映射表固定行（自动，不可删除）

| Scenario 字段 | Game 字段 | 类型 |
|--------------|-----------|------|
| `metadata.name` | `meta.name` | 自动 |
| `metadata.description` | `meta.description` | 自动 |
| `metadata.tags` | `meta.tags` | 自动 |
| `simulator.total_time` | `turns.total`（换算） | 自动 |
| **`[下拉选择]`** | `initial_state.health` | **必填** |

### 映射表可变行（每个 scenario 变量一行）

| Scenario 变量 | 模式识别 | → Game 卡牌/字段 | 操作 |
|--------------|---------|----------------|------|
| `infection_rate` (state) | P1 | 生成 `env_plague_spread.yaml` | 编辑/忽略 |
| `quarantine_policy` (input) | P1 | 生成 `player_quarantine.yaml` | 编辑/忽略 |
| `survival_rate` (output) | — | → `health`（已选） | 锁定 |

---

## 七、自动转换逻辑（后端）

### 步骤

```
输入: scenario.yaml + health_mapping（用户选定）

步骤1  解析 metadata → meta.*（直接映射）
步骤2  解析 simulator.total_time → turns.total（换算回合数）
步骤3  识别 health 变量 → 写入 health_mapping + initial_state.health
步骤4  遍历 variables:
         type=input  → 生成玩家牌骨架（cost 由公式 P 值决定）
         type=state  → 检查是否为 health，否则作为第三资源或内部变量
         type=parameter → 写入卡牌权重系数
步骤5  遍历 formulas → 公式模式识别（P1-P6）→ 生成环境牌骨架
         P1(常数)   delta = 常数值（取整）
         P2(自增)   debuff.add = 常数值
         P3(变量×k) delta = 当前变量均值 × k（取整）
         P4(条件)   condition.type = threshold
         P5(概率)   condition.type = probability，weight = p×1000
         P6(百分比) delta_percent = r（百分比伤害）
步骤6  补全通用牌引用（inject 默认全部）
步骤7  写入文件夹：game_story.yaml + cards/*.yaml + _mapping.json
步骤8  返回生成摘要（x张环境牌，y张玩家牌，z个字段自动映射）
```

### 降维规则（Sim 精确值 → Game 整数）

| Sim 值 | 降维方式 | 示例 |
|--------|---------|------|
| 连续微分方程 | 取 `dt=1 turn` 时的 delta，四舍五入 | `d_health/dt = -0.3/day × 30days = -9 ≈ -9` |
| RR 值 | 转为权重乘数 | `RR=2.7 → weight × 2.7` |
| 概率 p | `weight = round(p × 1000)` | `p=0.05 → weight=50` |
| 百分比 r | 保留为 `delta_percent: -r` | `r=0.1 → -10% health/turn` |
| 阈值 T | 直接映射 | `glucose > 180 → condition.value: 180` |

---

## 八、多语言支持（已实现）

### 设计原则

- **系统默认英语**。`game_story.yaml` 用英文撰写，这是唯一必须存在的文件。
- **翻译独立文件**。译者只需维护 `game_story.{lang}.yaml`，不修改原文件，两者永远不产生 git 冲突。
- **只翻译文字，不复制逻辑**。翻译文件中不需要（也不应该）包含 variables、effects、conditions 等游戏逻辑字段。

### 协作模型

| 角色 | 文件 | 独立维护 |
|------|------|---------|
| 原作者 | `game_story.yaml` | 修改逻辑、修改英文 |
| 中文译者 | `game_story.zh-CN.yaml` | 只改文字 |
| 繁中译者 | `game_story.zh-TW.yaml` | 完全独立 |
| 法文译者 | `game_story.fr.yaml` | 完全独立 |

### 文件约定

```
mods/stories/cholera_1854/
  game_story.yaml          ← 必须
  game_story.zh-CN.yaml    ← 可选，只含文字字段
  game_story.zh-TW.yaml    ← 可选
  game_story.fr.yaml       ← 可选
```

### 翻译文件最小示例

```yaml
# game_story.zh-CN.yaml
meta:
  name: "霍乱 — 伦敦，1854"
  description: "伦敦宽街。你是约翰·斯诺……"

player_cards:
  - id: close_pump
    name: "关闭水泵"
    flavor: "移除污染源。"

environment_cards:
  - id: outbreak
    name: "疫情爆发"
    description: "病菌通过受污染的水源扩散。"

lose_conditions:
  - condition: "health <= 0"    # condition 字段不翻译，逻辑保留
    message: "疫情夺走了你的生命。"

win_conditions:
  - condition: "health >= 60 AND turn >= 12"
    message: "你找到了污染源，拯救了数百条生命。"
```

### 支持的 UI 语言

UI 文字（按钮、标签、提示）通过 `game/public/locales/game/{lang}.json` 管理，独立于故事内容。目前支持：
- `en`（默认）
- `zh-CN`（简体中文）
- `zh-TW`（繁体中文）

---

## 九、待实现模块清单

### Converter（优先）
- [ ] 左右文件树（scenario / to_game），文件夹名匹配联动
- [ ] 中间双卡工作区（只读摘要 + 可编辑 game_story）
- [ ] 映射表 UI（固定行 + 可变行，health 下拉必填）
- [ ] 自动生成后端接口 `POST /api/convert`
- [ ] `_mapping.json` 读写
- [ ] 生成摘要反馈

### Game Story 系统（后续）
- [ ] `game_story.yaml` + `cards/*.yaml` 解析器
- [ ] 卡组构建（env_deck 权重抽样 + player_deck 手牌管理）
- [ ] 通用牌内置引擎
- [ ] 双通道（medical/social）槽位系统
- [ ] Status 机制（income/cap/deck_filter）
- [ ] P1-P6 效果执行器
- [ ] debuff 堆叠系统
- [ ] 多结局评分
