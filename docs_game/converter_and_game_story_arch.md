# Converter 设计 & Game Story 文件架构

**日期**: 2026-03-22
**状态**: 初稿，待执行
**关联文档**: c_game_v0.4_merged.md

---

## 一、文件结构决策

### 结论：文件夹结构，保留入口文件

每个关卡对应一个文件夹，文件夹名与 scenario 文件夹同名（实现自动锁定关联）。

```
mods/
  scenarios/
    ad1346_europe_black_death/      ← Sim 侧 scenario
      scenario.yaml

  to_game/
    ad1346_europe_black_death/      ← Game 侧，文件夹名一一对应
      game_story.yaml               ← 关卡入口（元信息 + 流程 + 卡组引用）
      cards/
        env_plague_spread.yaml      ← 环境牌
        env_famine.yaml
        player_quarantine.yaml      ← 玩家牌
        player_trade_ban.yaml
      assets/                       ← 可选，图片/音效
        background.jpg
        theme.ogg
```

### 为什么是文件夹而非单文件

| 维度 | 单文件 | 文件夹 |
|------|--------|--------|
| 图片/音乐 | 只能外链或 base64（丑陋） | 直接放入 assets/ |
| 卡牌管理 | 50张卡在一个 YAML 难以导航 | 每张卡独立，diff 清晰 |
| 版本控制 | 一次改动影响全文件 | 精确到单张卡 |
| 扩展性 | 结构固化 | 可随时添加子目录 |
| 加载方式 | 一次读取 | 读入口 → 按引用加载，懒加载友好 |

### 关联锁定规则

```
scenarios/{name}/       ←→   to_game/{name}/
```

Converter 左右两侧通过**文件夹名精确匹配**绑定，不需要用户手动选择右侧。左侧点击后，右侧自动定位到对应文件夹（存在则加载，不存在则显示"待生成"）。

---

## 二、game_story.yaml Schema

关卡入口文件，不包含卡牌内容，只负责元信息和流程组织。

```yaml
meta:
  name: "黑死病：欧洲, 1346"
  description: "在中世纪的欧洲，鼠疫横扫大陆。作为一个普通市民，你能撑过这个冬天吗？"
  difficulty: hard           # easy / medium / hard
  tags: [历史, 疾病, 欧洲]
  author: ""
  version: "0.1"
  source_scenario: "ad1346_europe_black_death"   # 关联的 scenario 文件夹名

health:
  initial: 100
  min: 0
  max: 100
  display: "生命值"

# 关卡流程（回合序列）
turns:
  total: 12                  # 总回合数（可为 null 表示无限直到胜负条件）
  per_turn:
    env_cards_drawn: 2       # 每回合环境牌数
    player_hand_size: 5      # 玩家手牌数

# 胜负条件
win_condition:
  type: survive              # survive（撑满回合） | reach_target（达到目标值）
  description: "撑过 12 个回合"

lose_condition:
  type: health_zero
  description: "生命值归零"

# 卡组引用（相对路径，对应 cards/ 下文件）
env_deck:
  - cards/env_plague_spread.yaml
  - cards/env_plague_spread.yaml   # 多份表示权重
  - cards/env_famine.yaml

player_deck:
  - cards/player_quarantine.yaml
  - cards/player_trade_ban.yaml

# 资源引用（可选）
assets:
  background: assets/background.jpg
  music: assets/theme.ogg
```

---

## 三、Card Schema（单张卡牌文件）

```yaml
# cards/env_plague_spread.yaml
id: env_plague_spread
type: env               # env（环境牌，系统出） | player（玩家牌，手牌）
category: disease       # 分类标签，用于 UI 筛选

display:
  name: "鼠疫蔓延"
  description: "这个冬天，感染者走遍了市集。"
  flavor: "1346年，热那亚商船带来了它。"
  icon: ""              # 可选，assets/ 相对路径

cost: 0                 # 玩家牌费用；env 牌为 0

# 效果（与 Sim 侧动力学对应）
effects:
  - target: health
    formula: "-10"           # 直接常量
    condition: null          # null = 无条件触发

  - target: health
    formula: "-health * 0.05"   # 引用当前状态变量
    condition: "turn > 6"       # 条件触发

# 元信息
meta:
  rarity: common        # common / rare / legendary
  source_variable: ""   # 对应 scenario 中的哪个变量（Converter 填入）
  source_formula: ""    # 对应 scenario 中的哪个公式
```

---

## 四、Converter 设计

### 布局

```
┌─────────────┬────────────────────────────────────┬─────────────┐
│  Scenario   │           转换工作区                │  Game       │
│  文件树     │  ┌──────────────┐ ┌──────────────┐ │  文件树     │
│             │  │ Scenario     │ │ Game Story   │ │             │
│  单选       │  │ 摘要（只读） │ │ 入口（可编辑）│ │  跟随左侧   │
│             │  └──────────────┘ └──────────────┘ │  高亮对应   │
│             │       ↓ 映射表 ↓                   │  文件夹     │
│             │  [字段行映射] [→ 自动生成] [保存]   │             │
└─────────────┴────────────────────────────────────┴─────────────┘
```

### 关联规则

- 左侧选中 `scenarios/{name}/` → 右侧自动锁定 `to_game/{name}/`
- 右侧存在 → 加载现有内容；不存在 → 显示"待生成"空状态
- 右侧文件树仍可独立浏览，但选中状态跟随左侧

### 字段映射表（固定 + 可配置）

| Scenario 字段 | 方向 | Game Story 字段 | 类型 |
|--------------|------|----------------|------|
| `metadata.name` | → | `meta.name` | 自动 |
| `metadata.description` | → | `meta.description` | 自动 |
| `metadata.tags` | → | `meta.tags` | 自动 |
| `simulator.total_time` | → | `turns.total`（换算） | 自动 |
| 每个 `variables[state]` | → | 生成环境牌骨架 | 自动生成卡文件 |
| 每个 `formulas` | → | `card.effects.formula` | 自动生成 |
| `metadata.difficulty` | → | `meta.difficulty` | 用户填写 |
| `simulator.output_variables` | → | 关注变量（如 health） | 用户映射 |

### 自动生成逻辑

点击"自动生成"后：

1. 读取左侧 `scenario.yaml`
2. 创建 `to_game/{name}/` 文件夹（若不存在）
3. 生成 `game_story.yaml`（填入自动映射字段，其余留空占位）
4. 为每个 `state` 类型变量生成一张环境牌骨架到 `cards/`
5. 为每个 `formula` 生成效果条目，formula 字段直接复制表达式
6. 右侧卡片刷新显示生成结果，用户继续手动完善

### 映射持久化

每次保存后，将映射配置写入 `to_game/{name}/_mapping.json`：

```json
{
  "source_scenario": "ad1346_europe_black_death",
  "generated_at": "2026-03-22",
  "field_map": {
    "metadata.name": "meta.name",
    "metadata.description": "meta.description"
  },
  "variable_to_card": {
    "infection_rate": "cards/env_plague_spread.yaml"
  }
}
```

下次打开时自动加载，Converter 可复查历史映射。

---

## 五、待决策事项

- [ ] `health` 是否直接来自某个 scenario 变量，还是固定为独立的游戏层概念？
- [ ] 卡牌 `effects.formula` 用字符串表达式还是结构化 DSL（`{op: minus, value: 10}`）？
- [ ] 环境牌权重（同一张牌多次引用）vs 显式 `weight` 字段，哪种更清晰？
- [ ] `assets/` 目录是否纳入 Converter UI 管理，还是用户手动放文件？
