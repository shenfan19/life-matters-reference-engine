# 实现游戏
## 文件架构设计决策
### 当前实现状态速览
- ✅ `game_story.yaml` 单文件 Schema（所有卡牌内联）
- ✅ 回合制卡牌游戏引擎（AP / 手牌 / 环境牌 / 胜负条件 / 撤回）
- ✅ 多语言叠加层（`game_story.zh-CN.yaml` 等）
- ✅ 场景选择界面（分类筛选 / 卡片+列表视图 / 语言切换）
- ✅ 主动弃牌暂存区（同行出牌/弃牌双区，均可撤回）
- ⏳ 卡牌独立文件（`cards/*.yaml`）— 目前所有卡牌内联在 game_story.yaml
- ⏳ Converter UI（左右联动、自动生成骨架）
- ⏳ Status 阶层机制、双通道、通用牌体系

### 布局规范（2026-04-15 更新）

主区行（从上到下）：目标仪表 → 事件行 → [应对|出牌区|放弃|弃牌区] → 手牌 → 控制条 → 状态仪表  
右列对齐：事件弃牌堆 → 我方弃牌堆 → 我方牌组  
已去除：命运手牌行（面朝下）；命运卡背迁移为事件弃牌堆标识  
详见：`2026-04-14_game_弃牌机制设计决策.md`

| 问题 | 决策 | 理由 |
|------|------|------|
| 单文件 vs 文件夹 | 文件夹 | 支持图片/音效、卡牌独立管理、版本控制清晰 |
| 左右关联方式 | 文件夹名精确匹配 | 自动锁定，无需用户手动选择 |
| health 映射 | 必须映射，每关可不同变量 | 每个 game 都需要 health 概念，但来源变量因场景而异 |
| 卡牌效果表达 | 整数降维（炉石风格） | `delta: -10`，而非公式字符串；converter 负责降维 |
| 卡牌权重 | 显式 `weight` 整数字段 | 基准 100，概率牌 = `p × 1000`；不用重复引用 |
| 公式识别 | P1-P6 六种模式 | 沿用 v0.4 定义，对应六种游戏效果类型 |

### 已确认的决策（v0.4 附录）

| 编号 | 问题 | 选择 | 理由 |
|------|------|------|------|
| D-01 | 卡牌设计路线 | Sim→Game自动转换 | 保持科学性，支持双轨发展 |
| D-02 | 胜负机制 | 多结局评分(S/A/B/C/D/F) | 避免二元输赢，增加重玩性 |
| D-03 | 手牌数量 | 可变（角色差异化） | 体现资源不平等的历史真实 |
| D-04 | Tags数量 | 4个最小集合(work/goal/health/risk) | 越少越好原则 |
| D-05 | Tags必需性 | 非必需，Converter提供下拉菜单辅助 | 降低研究者标注负担 |
| D-06 | 公式标注 | 可选，支持自动识别也支持手动标注 | 灵活性 |
| D-07 | 通用牌注入 | 全部注入，后续细化配置 | 保证策略深度基线 |
| D-08 | Params作用 | 控制卡牌张数和游戏数值计算 | 仿真参数与游戏参数统一 |
| D-09 | 游戏哲学 | 双模式：基础=无力感历史教育，Rogue=改变历史爽感 | 兼顾教育意义与游戏粘滞力 |
| D-10 | 卡牌命名体系 | 采用v0.3的goal/work/health命名 | 更工程化，与YAML tags对应 |

### 待定的决策

| 问题 | 现状 | 后续方向 |
|------|------|---------|
| 手牌刷新机制 | 待定 | 倾向固定（更稳定可规划）vs 随机抽5张 |
| 行动点细节 | 待定 | 每张牌的点数分配，是否允许超支 |
| 环境牌抽取数量 | 待定 | 每回合2张 vs 3张，是否动态调整 |
| 多变量耦合处理 | 待定 | 倾向定义全局链式触发规则 |
| P6百分比伤害 | 待定 | 倾向保留（可用P3替代但语义不同） |
| 通用牌选择性注入 | 目前全注入 | 后续可按关卡特征筛选 |
| 特色牌获取时机 | 待定 | 局前固定 vs 局内解锁 |

### 避坑清单决策
- ❌ 不要像游戏王那样复杂连锁
- ❌ 不要给玩家"优化压迫"的空间
- ❌ 不要让Money不能累计（违背现实）
- ❌ 不要设置过多纵列（3列已是极限）
- ❌ 不要解释"为什么穷人存不了钱"（让系统说话）
- ❌ 不要过度特化，严格减法设计

## 文件目录结构
每个故事对应一个文件夹，`game_story.yaml` 是唯一入口（所有卡牌内联其中）。

```
mods/
  stories/
    cholera_london_1854/
      game_story.yaml            ← 故事入口（元信息 + 变量 + 卡牌 + 胜负条件）
      game_story.zh-CN.yaml      ← 中文翻译叠加层（可选，只含文字字段）
      game_story.fr.yaml         ← 法文翻译叠加层（可选）
      cards/
        env_plague_spread.yaml     ← 环境牌
        env_famine.yaml
        player_quarantine.yaml     ← 玩家牌
        player_trade_ban.yaml
      assets/
        background.jpg
        theme.ogg
      _mapping.json                ← Converter 自动维护的映射记录
      assets/                    ← 可选（图片/音效）
        background.jpg
```

关联规则（未来 Converter）：`scenarios/{name}/` ↔ `stories/{name}/`
文件夹名一一对应，Converter 左侧选中 scenario 后右侧自动锁定对应 stories 文件夹。

## game_story.yaml Schema
以下结构反映 `CardGame.tsx` 实际解析的字段。

```yaml
# ── 元信息 ─────────────────────────────────────────────────────────────────
meta:
  name: "Cholera — London, 1854"
  description: "Broad Street, London. You are John Snow..."
  period: "1854"               # 展示用，自由文本
  location: "London, UK"
  difficulty: medium            # easy | medium | hard
  science_note: "..."           # 可选，展示在日志面板底部
  tags: []                      # 已废弃，建议改用下方结构化字段
  # 结构化分类字段（推荐，用于场景筛选）
  era: "19th century"           # 时代标签，见 TAG_GROUPS 枚举
  themes:                       # 类型标签（多选）
    - Science
    - Medicine
  medical:                      # 医学标签（多选，非医学故事可省略）
    - Epidemic
    - Public Health
# ── 变量定义 ────────────────────────────────────────────────────────────────
# 每个变量对应左侧竖向柱状图中的一条
variables:
  health:
    label: "Health"             # 展示标签（最多4字符效果最佳）
    value: 100                  # 初始值
    max: 100
    color: "#52c41a"
  morale:
    label: "Morale"
    value: 60
    max: 100
    color: "#1677ff"
# ── 游戏参数 ────────────────────────────────────────────────────────────────
game:
  ap_per_turn: 3                # 每回合行动点
  max_turns: 15                 # 总回合数
  hand_size: 5                  # 每回合手牌数
# ── 失败条件（AND 逻辑，任一满足即失败）──────────────────────────────────────
lose_conditions:
  - condition: "health <= 0"
    message: "The epidemic claimed you."
  - condition: "morale <= 0 AND health < 30"
    message: "Despair consumed you."
# ── 胜利条件（可选；未设置则存活到最后一回合视为胜利）────────────────────────
win_conditions:
  - condition: "health >= 60 AND turn >= 12"
    message: "You identified the source and saved hundreds of lives."
# ── 玩家牌组 ────────────────────────────────────────────────────────────────
player_cards:
  - id: close_pump
    name: "Close the Pump"
    type: medical               # medical | social | tech | tactical | logistics | economic | political
    cost: 2                     # 消耗行动点
    emoji: "🚰"
    flavor: "Remove the source of contamination."   # 可选，斜体小字
    effects:
      - variable: health
        delta: 15
      - variable: morale
        delta: 5
# ── 环境牌组 ────────────────────────────────────────────────────────────────
environment_cards:
  - id: outbreak
    name: "Outbreak"
    emoji: "☠️"
    description: "The disease spreads through contaminated water."
    always_active: true         # 每回合必触发（与 condition/probability 互斥）
    effects:
      - variable: health
        delta: -8
  - id: panic
    name: "Public Panic"
    emoji: "😱"
    description: "Fear spreads through the city."
    condition: "health < 40"    # 条件满足才可能触发
    probability: 0.6            # 0.0–1.0，省略则条件满足即必触发
    effects:
      - variable: morale
        delta: -10
```

条件表达式语法

条件字符串使用变量名 + 比较运算符，支持 `AND` / `OR`（不区分大小写）：
```
"health <= 0"
"health < 40 AND morale < 20"
"turn >= 10 OR health < 10"
```
变量名必须与 `variables` 中的键名一致。`turn` 是内置变量，表示当前回合数。


## Card Schema
### 环境牌（系统出牌）
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

### 玩家牌（手牌）
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

### 通用牌（自动注入，无需单独文件）
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
## 多语言支持
系统默认语言为英语，翻译文件平行存放，不影响原始游戏逻辑。
约定

| 文件 | 作者 | 说明 |
|---|---|---|
| `game_story.yaml` | 原始作者 | 所有游戏逻辑 + 英文文字 |
| `game_story.zh-CN.yaml` | 中文译者 | 只含文字字段，无逻辑 |
| `game_story.fr.yaml` | 法文译者 | 独立维护，完全不影响原文件 |

翻译文件结构示例
game_story.zh-CN.yaml — 只翻译文字，不复制逻辑字段
```yaml
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
```

加载逻辑

前端（`game/src/core/storyI18n.ts`）在加载 `game_story.yaml` 后，若当前语言非英语，会尝试加载 `game_story.{lang}.yaml`，并将字符串字段深度合并覆盖到基础 story 对象上。数字、布尔值、effects 数组等游戏逻辑字段不受影响。404 时静默跳过，回退英文。

> 转换框架（Sim → Game 映射、Converter UI、P1-P6 公式识别、自动转换逻辑）详见 [`converter_design.md`](converter_design.md)。

---

## 游戏引擎运行时

游戏引擎 (`StoryEngine.tsx`) 是卡牌游戏的前端运行时，与仿真引擎共享底层动力学但独立于 sim 的批量仿真模式。

### 运行模式

| 模式 | 入口 | 特点 |
|------|------|------|
| 科研仿真模式 | `simulator_cli.py` / `POST /api/story/{id}/step` | 自动批量迭代，输出 CSV/JSON |
| 游戏剧情模式 | `StoryEngine.tsx` | 回合制，玩家出牌后执行 `applyEffects`，推进一个仿真步骤 |

### 出牌结算

玩家出牌后 `applyEffects` 按如下顺序执行：
1. 消耗行动点（AP）
2. 应用玩家牌 `effects`（delta 累加到变量）
3. 若本回合有系统牌（`system_effect`），按类型执行（`extra_ap` / `extra_draw` / `amplify` / `shield` / `freeze_turn`）
4. 触发环境牌（按 `condition` + `probability` 过滤，`always_active` 必触发）
5. 检查胜负条件

> `system_effect` 字段当前引擎未完整实现，详见 `pending_improvements.md` 问题 3。
