# Game Story 文件架构 & Converter 设计

**日期**: 2026-03-23（更新）
**状态**: 核心 Schema 已实现，Converter UI 待开发
**关联文档**: c_game_v0.4_merged.md, game_arch_v1.md

---

## 一、文件目录结构

每个故事对应一个文件夹，`game_story.yaml` 是唯一入口（所有卡牌内联其中）。

```
mods/
  stories/
    cholera_london_1854/
      game_story.yaml            ← 故事入口（元信息 + 变量 + 卡牌 + 胜负条件）
      game_story.zh-CN.yaml      ← 中文翻译叠加层（可选，只含文字字段）
      game_story.fr.yaml         ← 法文翻译叠加层（可选）
      assets/                    ← 可选（图片/音效）
        background.jpg
```

**关联规则（未来 Converter）**：`scenarios/{name}/` ↔ `stories/{name}/`
文件夹名一一对应，Converter 左侧选中 scenario 后右侧自动锁定对应 stories 文件夹。

---

## 二、game_story.yaml Schema（当前实现）

> 以下结构反映 `CardGame.tsx` 实际解析的字段。

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

### 条件表达式语法

条件字符串使用变量名 + 比较运算符，支持 `AND` / `OR`（不区分大小写）：

```
"health <= 0"
"health < 40 AND morale < 20"
"turn >= 10 OR health < 10"
```

变量名必须与 `variables` 中的键名一致。`turn` 是内置变量，表示当前回合数。

---

## 三、多语言翻译叠加层

系统默认语言为英语，翻译文件平行存放，不影响原始游戏逻辑。

### 约定

| 文件 | 作者 | 说明 |
|------|------|------|
| `game_story.yaml` | 原始作者 | 所有游戏逻辑 + 英文文字 |
| `game_story.zh-CN.yaml` | 中文译者 | **只含文字字段**，无逻辑 |
| `game_story.fr.yaml` | 法文译者 | 独立维护，完全不影响原文件 |

### 翻译文件结构示例

```yaml
# game_story.zh-CN.yaml — 只翻译文字，不复制逻辑字段
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

### 加载逻辑

前端（`game/src/core/storyI18n.ts`）在加载 `game_story.yaml` 后，若当前语言非英语，会尝试加载 `game_story.{lang}.yaml`，并将**字符串字段**深度合并覆盖到基础 story 对象上。数字、布尔值、effects 数组等游戏逻辑字段不受影响。404 时静默跳过，回退英文。

---

## 四、Converter 设计（待实现）

### 布局

```
┌─────────────┬────────────────────────────────────┬─────────────┐
│  Scenario   │           转换工作区                │  Story      │
│  文件树     │  ┌──────────────┐ ┌──────────────┐ │  文件树     │
│             │  │ Scenario     │ │ Game Story   │ │             │
│  单选       │  │ 摘要（只读） │ │ 入口（可编辑）│ │  跟随左侧   │
│             │  └──────────────┘ └──────────────┘ │  高亮对应   │
│             │  [字段映射表] [→ 自动生成] [保存]   │  文件夹     │
└─────────────┴────────────────────────────────────┴─────────────┘
```

### 字段映射表

| Scenario 字段 | 方向 | game_story 字段 | 类型 |
|--------------|------|----------------|------|
| `metadata.name` | → | `meta.name` | 自动 |
| `metadata.description` | → | `meta.description` | 自动 |
| `metadata.tags` | → | `meta.themes` | 自动 |
| `simulator.total_time` | → | `game.max_turns`（换算） | 自动 |
| 每个 `variables[state]` | → | 生成 environment_card 骨架 | 自动生成 |
| 每个 `formula` | → | `effects[].delta`（P1-P6 降维） | 自动生成 |
| `metadata.difficulty` | → | `meta.difficulty` | 用户填写 |

### 映射持久化

保存后写入 `stories/{name}/_mapping.json`，下次打开自动加载复查历史映射。

---

## 五、待解决事项

- [ ] Converter UI 实现（左右联动，自动骨架生成）
- [ ] 卡牌单独文件结构（目前所有卡牌内联在 game_story.yaml 中）
- [ ] assets/ 目录支持（背景图、音效）
- [ ] 多结局评分系统（S/A/B/C/D 等级）
