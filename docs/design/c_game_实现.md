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

# 实现转换
## Sim → Game 映射框架

### 核心组件映射

| Opt（优化匹配） | Sim组件 | Convert（转换规则） | Game组件 |
|---------------|---------|-------------------|---------|
| 外环优化：搜索最优input组合 | variables(type=input) | input变量 → 手牌Cost消耗 | 玩家手牌 (Player Cards) |
| 内环校准：调整parameter使state符合数据 | variables(type=state, io_role=intermediate) | 如 blood_glucose → 不直接显示，影响事件概率 | 内部隐藏变量 (Hidden States) |
| — | variables(type=state, io_role=output) | health_score → 红条HP；research_progress → 蓝条SP | 红条/蓝条 (Health/Purpose Bars) |
| 内环优化：校准RR/OR值 | variables(type=parameter) | RR值 → 环境牌权重系数 | 角色属性/算子配置 |
| — | formulas(dynamics) | dx/dt公式 → 每回合概率抽卡 | 环境牌堆生成规则 |
| — | simulation.duration | 50 years → 50 turns；300 days → 300 turns | 最大回合数 |
| — | simulation.time_step(dt) | 居里夫人=1year/turn，童工=1month/turn | 回合粒度 |
| — | imports(models) | 导入的model → 叠加的算子（如女权/资本） | 算子库 |

### 输入映射

| Opt | Sim: Input Variables | Convert | Game: Player Cards |
|-----|---------------------|---------|-------------------|
| 外环：找最优饮食组合 | meal_carbs (type=input) | meal_carbs=50g → [-2金, +10HP, +5血糖风险] | [进食卡] |
| 外环：优化运动时长 | exercise_duration | 30min → [-1金, -5HP短期, +10HP长期, -糖尿病风险] | [运动卡] |
| 外环：找最优剂量 | daily_dose(metformin) | 1000mg → [-8金, +降糖效果, +副作用概率] | [服药卡] |
| 外环：选择是否手术 | surgery_type | 袖状胃 → [-50金一次性, -30HP, +大幅降低糖尿病风险] | [手术卡] |
| 外环：优化工作时长 | work_hours | 10h/day → [+5金, -3HP, +压力, -Status提升概率] | [劳作卡] |
| 外环：优化教育投入 | education_investment | 1000 → [-10金, +Status等级, 解锁高级手牌池] | [教育卡] |

### 输出映射

| Opt | Sim: Output Variables | Convert | Game: Events/Indicators |
|-----|----------------------|---------|------------------------|
| — | diabetes_risk | 0.3 → 环境牌堆中30%概率抽到[糖尿病] | [糖尿病发作]环境牌 |
| 外环目标：最大化health_score | health_score | 60 → 红条显示60/100 | 红条 |
| 外环目标：达到100 | research_progress | 40 → 蓝条40/100 | 蓝条 |
| — | side_effect_risk | 0.15 → 15%概率触发[恶心呕吐-5HP] | [副作用]环境牌 |
| — | lung_cancer_incidence | 0.05/year → 每回合5%抽到[肺癌诊断-50HP] | [肺癌]死亡牌 |
| 外环目标：最小化cost | cost_benefit_ratio | 结算页显示"你花费了XX金，获得了YY寿命" | 金钱效率显示 |

### 参数映射

| Opt | Sim: Parameters | Convert | Game: Card Weights |
|-----|----------------|---------|-------------------|
| 内环：校准RR | RR（相对危险度） | RR_smoking_lung_cancer=14 → [肺癌]牌权重×14 | 环境牌权重系数 |
| 内环：校准吸收率 | absorption_rate | 0.6 → 服药卡效果延迟1回合生效 | 药效延迟回合数 |
| 内环：校准基础死亡率 | base_mortality | 0.01/year → 环境牌堆中1%是[意外死亡] | 环境牌堆基础负面密度 |
| 内环：校准成本 | cost_per_unit | cost_per_meal=2 → 每餐消耗2金 | 卡牌Cost系数 |
| — | status_threshold | [0,10,30,60] → Status<10=贫民牌池 | Status分层边界 |

### 状态变量映射

| Opt | Sim: State Variables | Convert | Game |
|-----|---------------------|---------|------|
| 内环：调整glucose动力学 | blood_glucose | glucose>180 → [并发症]权重×3；glucose<70 → [低血糖昏迷]即刻触发 | 不直接显示，影响环境牌 |
| 内环：校准胰岛素模型 | insulin_level | insulin>20 → [降糖药]效果减半 | 影响药物卡效果 |
| — | body_weight | weight>100kg → Status-1 | 影响Status分层 |
| — | stress_level | stress>70 → 每回合额外-2HP | 影响HP损耗速率 |
| — | education_level | high_school → 解锁[投稿论文]卡；PhD → 解锁[申请基金]卡 | 决定可用卡牌种类 |
| — | social_status | 直接映射为Status等级，决定抽牌池质量 | Status等级(0-5) |
| 内环：校准辐射累积模型 | accumulated_radiation | 每+10辐射 → Max_HP永久-5（不可逆） | 红条上限动态削减 |

### Optimizer集成策略

| 优化类型 | Sim侧（内/外环） | Game侧应用 | 转换方式 |
|---------|----------------|-----------|---------|
| 外环优化(Input) | 搜索最优input组合使health最大化 | Roguelike解锁："最优出牌策略提示" | 优化结果→推荐手牌序列 |
| 内环校准(Param) | 调整RR/parameter使仿真匹配文献 | 平衡性调整：校准环境牌权重 | 校准结果→更新牌堆配置 |
| 多目标优化 | 同时最大化health和research_progress | 成就系统：双目标达成解锁奖励 | Pareto前沿→多种通关路线 |

### R-G Converter对接优先级

高优先级（仿真直接输出）：
- `card_ratio` ← P值直接映射
- `attack` ← RR/Effect Size映射
- `health` ← 病程长度映射
- `probability` ← 发病率映射
- `total_rounds` ← 时间跨度映射

中优先级（需人工校准）：
- `cost` ← 需要经济数据+专家判断
- `duration` ← 可从时间窗口推导
- `status_cap` ← 场景历史研究确定
- `tag_pool` ← 需要疾病分类知识

低优先级（无法自动化，创意层）：
- 穿透/溅射/瞬杀机制
- 变形/分阶段方法
- 场景锁定逻辑
- 特殊政策牌效果

## Converter UI 设计
布局

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

操作流程

1. 左侧点击 scenario 文件夹
2. 右侧自动锁定同名 `to_game/` 文件夹
3. 中间展示：
   - 左卡：scenario 摘要（变量列表、公式列表，只读）
   - 右卡：game_story 入口 + 卡牌列表（可编辑）
1. 映射表：每行 `[scenario字段] → [game字段]`，支持下拉修改
2. health 映射：必填下拉，选择哪个 scenario output 变量映射为 health
3. 点击 → 自动生成：执行转换逻辑，生成文件夹
4. 点击 保存：写入文件，更新 `_mapping.json`

映射表固定行（自动，不可删除）

| Scenario 字段            | Game 字段                     | 类型   |
| ---------------------- | --------------------------- | ---- |
| `metadata.name`        | `meta.name`                 | 自动   |
| `metadata.description` | `meta.description`          | 自动   |
| `metadata.tags`        | `meta.tags`                 | 自动   |
| `simulator.total_time` | `turns.total`（换算）           | 自动   |
| `[下拉选择]`               | `initial_state.health`      | 必填   |
| 每个 `variables[state]`  | 生成 environment_card 骨架      | 自动生成 |
| 每个 `formula`           | `effects[].delta`（P1-P6 降维） | 自动生成 |
| `metadata.difficulty`  | `meta.difficulty`           | 用户填写 |

映射表可变行（每个 scenario 变量一行）

| Scenario 变量                 | 模式识别 | → Game 卡牌/字段                | 操作    |
| --------------------------- | ---- | --------------------------- | ----- |
| `infection_rate` (state)    | P1   | 生成 `env_plague_spread.yaml` | 编辑/忽略 |
| `quarantine_policy` (input) | P1   | 生成 `player_quarantine.yaml` | 编辑/忽略 |
| `survival_rate` (output)    | —    | → `health`（已选）              | 锁定    |

## 核心变量原则
每个 Story 只保留 3-5 个有叙事意义的状态变量，其余折叠为参数或忽略。
> 示例（居里夫人）：辐射累积值、健康、科研进度、社会认可度——4个变量已足够承载叙事张力。复杂的放射性衰变方程、实验室化学动力学均折叠进这4个变量的交互关系中。
折叠原则：
- 快变量（时间尺度远小于一个 turn）→ 折叠为参数常数
- 空间分布变量 → 折叠为单一代表值
- 高维耦合变量 → 识别主导项，忽略次要耦合
## 自动转换逻辑
### 自动转换步骤（来自 play_arch_v1 §七）
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
【步骤6】计算权重 → 环境牌抽取概率配置
步骤7  写入文件夹：game_story.yaml + cards/*.yaml + _mapping.json
步骤8  返回生成摘要（x张环境牌，y张玩家牌，z个字段自动映射）
```

YAML元素 → 卡牌元素映射

| YAML路径 | 提取内容 | 卡牌属性 | 处理方式 |
|---------|---------|---------|---------|
| `story_meta.name` | 场景名 | 关卡标题 | 直接映射 |
| `story_meta.goal_value` | 目标值 | 胜利条件 | 直接映射 |
| `initial_state.health/money` | 初始资源 | 起始状态 | 直接映射 |
| `initial_state.*`（其他） | 特殊资源 | 第三维度 | 自动识别为debuff/buff |
| `params.*` | 数值常量 | 卡牌张数+数值 | 参数替换 |
| `inputs[i].tags` | 分类标签 | 卡牌类型 | 查表映射（可下拉选择） |
| `inputs[i].effects` | 资源变化 | 卡牌效果 | 解析+/-符号 |
| `inputs[i].reference` | 文献引用 | 卡牌描述 | 直接映射 |
| `outputs[i].formula` | 公式表达式 | 环境牌效果 | 模式识别（见9.2） |

降维规则（Sim 精确值 → Game 整数）

| Sim 值 | 降维方式 | 示例 |
|--------|---------|------|
| 连续微分方程 | 取 `dt=1 turn` 时的 delta，四舍五入 | `d_health/dt = -0.3/day × 30days = -9 ≈ -9` |
| RR 值 | 转为权重乘数 | `RR=2.7 → weight × 2.7` |
| 概率 p | `weight = round(p × 1000)` | `p=0.05 → weight=50` |
| 百分比 r | 保留为 `delta_percent: -r` | `r=0.1 → -10% health/turn` |
| 阈值 T | 直接映射 | `glucose > 180 → condition.value: 180` |

公式识别 → 环境牌类型（6种保留模式）

> ⚠️ **[重复标注]** P1-P6 与下方 §3 Type 1-6 是同一套表达式分类的两套命名。对应关系：P1=Type 1, P2+P3=Type 3, P4=Type 4, P5=Type 5, P6=Type 2。§3 为含示例的详细版，此表为自动转换器 YAML 实现侧的快速索引，可考虑统一命名。

| 模式 | 数学表达 | 识别特征 | 环境牌类型 | 权重 | 状态 | 对应Type |
|------|---------|---------|----------|-----|------|---------|
| P1 | `hp -= C` | 常数减法 | 固定伤害 | 100 | ✅ 必需 | Type 1 |
| P2 | `x = x + C` | 变量自增 | 累积debuff | 100 | ✅ 必需 | Type 3（计数步） |
| P3 | `hp -= x * k` | 变量×系数 | 累积伤害 | 100 | ✅ 必需 | Type 3（伤害步） |
| P4 | `if x > T: damage` | 条件判断 | 阈值触发 | 动态 | ✅ 核心机制 | Type 4 |
| P5 | `if random() < p: damage` | 概率函数 | 概率触发 | p×1000 | ✅ 核心机制 | Type 5 |
| P6 | `hp -= hp * r` | 百分比自伤 | 百分比伤害 | 100 | ❓ 待定（可用P3表达） | Type 2 |

### 全自动可行性评估 + 技术挑战

| 转换步骤 | 自动化难度 | 人工干预 | 结论 |
|---------|----------|---------|-----|
| 资源识别 | ⭐ 简单 | 无 | ✅ 全自动 |
| Input分类 | ⭐⭐ 中等 | 下拉菜单辅助选择 | ⚠️ 半自动 |
| 效果提取 | ⭐ 简单 | 无 | ✅ 全自动 |
| 公式识别 | ⭐⭐⭐ 困难 | 可选手动标注pattern | ⚠️ 半自动 |
| 权重计算 | ⭐⭐ 中等 | 默认规则 | ✅ 全自动 |
| 缺失补全 | ⭐ 简单 | 无 | ✅ 全自动 |
结论：约80%可全自动，20%需标准化辅助（tags标注 + 公式规范）

| 挑战 | 问题描述 | 当前方案 |
|------|---------|---------|
| 复杂公式识别 | 研究者可能写任意Python表达式 | 阶段1只支持P1-P5标准模式；阶段2提供公式简化工具 |
| 多变量耦合拆分 | radiation影响probability_sick等链式依赖 | 定义全局链式触发规则（跨story兼容），避免单一对象高复杂化 |
| 数值平衡 | 不同story数值量级差异大（辛德勒SP=1200 vs 小女孩SP=365） | 游戏内归一化算法（待设计） |


> ⚠️ **[结构标注]** §1 设计哲学在本章开头（`# 转换实现 Converter` 之后），§2-7 在此处，被映射框架/UI/自动转换逻辑章节分隔。建议将 §2-7 整体上移至 §1 之后，再接映射表和 UI，使 Converter 的设计原则部分连贯。

## 表达式兼容性分类 详细 公式识别 → 环境牌类型（6种保留模式）
### 可直接映射（4种）
#### Type 1：常数流（Constant Flux）→ ✅ 固定数值环境牌
数学形式：
```
resource += C  （每回合固定变化）
```
医学/社会例子：
- 饥荒热量赤字：`calories -= 200 kcal/day`
- 固定辐射暴露：`dose += 0.1 mSv/day`
- 固定工资：`money += salary`
卡牌映射：环境牌，每回合自动触发，固定数值修改。
数值标定：文献实际数量级 → 线性压缩到游戏范围 [0, 100]，保留相对比例。
#### Type 3：累积状态（Accumulated State Damage）→✅ 计数器机制牌（需设 cap）
数学形式：
```
x = x + c          # 中间状态变量自增（计数器）
hp -= x * k        # 伤害由计数器驱动
```
> 注意：这不是"二阶"系统，而是带中间状态的一阶差分方程组。"二阶"指 x'' = f(x, x') 形式（如弹簧-阻尼），与此不同。
医学/社会例子：
- 辐射剂量累积 → 急性辐射综合征
- 炎症因子积累（cytokine storm）
- 心理创伤累积 → PTSD
- 重金属体内蓄积（铅、汞）
卡牌映射：
- 方案A：两张环境牌协作——累积牌（计数器+1） + 伤害牌（hp -= 计数器 × k）
- 方案B：单张牌带计数器机制（类似炉石"激怒"）
数值稳定性警告：计数器上限需设定 cap，防止后期数值失控。
游戏感：早期看似无害，突然崩溃——适合表达慢性积累类伤害的历史感。
#### Type 4：阈值触发（Threshold / Conditional）→✅ 条件环境牌
数学形式：
```
if state_variable > threshold:
    trigger_effect_A
else:
    passive_effect_B
```
医学/社会例子：
- 体温 > 41°C → 脑损伤加速
- BMI < 17.5 → 器官功能下降
- 血糖 > 180 mg/dL → 胰岛素抵抗恶化
- 收入 < 贫困线 → 食品不安全级联效应
卡牌映射：环境牌带触发条件 `condition: state.variable > threshold`，未触发时休眠，触发后激活强效果。
游戏感：悬崖效应，玩家需维持在安全区——适合表达临界点类医学事件。
#### Type 5：概率随机（Stochastic）→ ✅ 概率骰子牌
数学形式：
```
if random() < p(state):
    damage_event
```
其中 p 可为常数，或依赖状态变量。
医学/社会例子：
- 吸烟→肺癌年发病率（重度吸烟者约0.3%/年）
- 传染病接触感染概率
- 手术并发症概率
- Poisson 过程（随机事件频率可估）
卡牌映射：环境牌带概率值，每回合掷骰决定是否触发。状态依赖版：`p = base_p × (1 + stress_factor)`。
游戏感：持续焦虑感，无法完全避免只能降低概率——适合表达慢性风险类场景。
### 需要降维才能映射（2种）
#### Type 2：状态乘数 → 分段线性近似
原始数学形式：
```
resource -= resource * r   （比例损失，如感染传播、肌肉萎缩、复利债务）
```
卡牌游戏问题：直接实现会导致滚雪球失控（正反馈）或暴崩（负反馈过快），数值不可预期。
降维策略：分段线性近似
```
状态 > 60：effect = -5
状态 30-60：effect = -10
状态 < 30：effect = -20
```
保留了"越弱越危险"的核心感受，数值完全可控。
备选策略：转化为 Type 3 计数器机制，用累积驱动伤害，同样能还原滚雪球感受。
#### Type 6：微分方程系统 → 离散化降维
原始数学形式（典型如 SIR 传染病模型）：
```
dS/dt = -β·S·I/N
dI/dt =  β·S·I/N - γ·I
dR/dt =  γ·I
```
降维步骤：
1. 确定 1 turn = 现实多长时间（天/周/月）
2. 用欧拉离散化：`dX/dt → ΔX/turn`
3. 识别慢变量（保留）vs 快变量（折叠为参数）
4. 根据剩余变量形态，归类为 Type 1-5 之一
常见归宿：多数 ODE 系统离散后退化为 Type 1（线性项）+ Type 2/3（非线性项）的组合。
### 强制简化类（原本不兼容）
#### D1：空间偏微分方程（PDE）→ 强制退化为 Type 4
处理策略：不引入空间维度，将空间分布效应映射为临界阈值触发。
> 示例：辐射在组织中的空间扩散 PDE → 简化为"累积辐射值超过阈值时触发器官损伤"（Type 4）。
#### D2：高维耦合系统（>4个状态变量同时交互）→ 强制退化为 Type 4
处理策略：应用核心变量原则，强制选取 3-5 个叙事核心变量，其余折叠。复杂耦合关系用阈值条件近似表达主要行为。
> 这是设计约束，不是妥协。游戏的教育目标不需要变量完备，需要的是关键因果关系可感知。
#### D3：连续时间随机过程（SDE）→ 强制退化为 Type 5
处理策略：提取 SDE 的稳态概率分布或事件发生率，直接转化为离散概率触发（Type 5）。
> 示例：连续 Wiener 过程驱动的血糖波动 → 简化为"每回合有 p% 概率触发低血糖事件"。
## 数值标定通用原则
| 来源类型         | 标定策略                       |
| ------------ | -------------------------- |
| 文献有具体数值      | 线性压缩到游戏范围，保留相对比例           |
| 只有相对变化率      | 设基准100，用比率确定每回合变化量         |
| 概率类          | 直接映射文献概率（或适当放大增加戏剧性）       |
| 无量纲指数        | 直接用原始值区间                   |
| 计数器类（Type 3） | 需设定 cap，推荐 cap = 回合数上限的1/2 |
核心原则：保留"感受"，不追求"精确量"。
## Converter 行为规范
- 对 Type 1/3/4/5：自动生成卡牌 YAML 草稿
- 对 Type 2/6：自动降维 + 输出简化说明，标注"已简化"
- 对 D1/D2/D3：输出警告 + 建议人工确认简化策略，标注"需人工审核"
- 所有输出均附带科学诚实声明：说明哪些动力学被简化或忽略
