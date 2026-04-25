# ADR 0043 — 战场张力框架：battle_progress / danger_accumulation 的架构归属与命运牌模式
**日期**：2026-04-25  
**状态**：已实施

---

## 背景

添加战场类游戏场景（索姆河、南丁格尔、居里夫人国家线等）时，出现一个核心设计张力：

> 角色在战场上多待一天，个人危险就多一天；但每一天的贡献都在推进集体战局。玩家可以选择提前牺牲换取战局跃进，也可以选择活下去持续贡献。

要实现这一张力，需要两个新变量：`battle_progress`（战局进度）和 `danger_accumulation`（危险累积）。问题是：**这两个变量应该放在 Sim 层、Game 层，还是需要 Converter 新增"手动补充变量"功能？**

---

## 讨论

### 方案 A：放进 Sim

Sim 层的纯粹性约束是：**所有变量均有文献溯源**（OR/HR/Cohen's d 等）。

`battle_progress` 没有对应的文献效应量——不存在一篇 meta-analysis 告诉你"个人牺牲行为的战局进度 hazard ratio 是多少"。这是叙事构造，不是动力学事实。放进 Sim 会破坏其科学纯粹性，且对 Sim 的科研用途毫无价值。

**否决。**

### 方案 B：Converter 新增"手动补充变量"功能

担心：如果 Game 层有 Sim 不存在的变量，Converter 的"自动生成"流程会有缺口，需要一个手动补充入口。

但检查现有架构后发现，**这个缺口已经存在且被接受**：`game_story.yaml` 中的 `money`、`status`、手牌数量等都是 Game-native 抽象，从未出现在 Sim 模型里。Converter 本就只负责"有 Sim 对应物的部分"，其余由 Story 层直接管理。不需要新功能，只需要把这个既有惯例**明确化**。

**无需新功能，但需要正式定义。**

### 方案 C：Game-native（采纳）

`battle_progress` 和 `danger_accumulation` 作为 `origin: native` 变量直接定义在 `game_story.yaml` 的 `variable_display` 中。Converter 对 `origin: native` 变量保持透明（跳过映射、不报警）。

战场相关的**医疗动力学**（南丁格尔的护理死亡率曲线、居里夫人的辐射积累）仍走 Sim → Converter 流程，有文献溯源。战局叙事层留在 story-native。

**采纳。**

---

## 决策

### 决策一：`origin` 字段定义

在 `variable_display` 中新增可选字段 `origin`：

| 值 | 含义 | Converter 行为 |
|---|---|---|
| `sim`（默认，省略等同于 sim） | 派生自 Sim 动力学，有文献溯源 | 正常映射处理 |
| `native` | Story 层直接定义，无 Sim 对应物 | 跳过，不报警，不写入 `_mapping.json` |

文档更新：`game_impl.md § 变量溯源标注`，`converter_design.md § Game-native 变量的 Converter 透明性`。

### 决策二：战场张力框架（设计原则 #6）

凡含"战场"场景（战役、前线医疗、战时科学）的故事，必须同时包含：

- `battle_progress`（0–100，`origin: native`）：集体目标推进度，独立于角色存活
- `danger_accumulation`（0–100，`origin: native`）：P2 累积模式，每回合自动增加，P4 阈值触发真实伤害

**核心张力**：多待一回合 → danger 上升 + 有更多机会推进 battle；提前牺牲 → battle 跃进。两种策略均合法，游戏不作道德裁判。

**贡献路径分层**（同一框架，语义不同）：
- 战斗角色（士兵）：进攻行动直接推进 battle_progress
- 医疗角色（南丁格尔、希波克拉底）：降低伤亡率/病死率间接推进
- 后勤/科学角色（居里夫人国家线）：资源与知识贡献推进

文档更新：`game_requirements.md § 6`。

### 决策三：宏观战况命运牌模式

战场场景须包含一组**宏观战况命运牌**（env 卡），同时拉动 `battle_progress` 和 `danger_accumulation`，形成命运拉扯：

| 卡牌类型 | battle_progress | danger_accumulation | 个人(health/morale) |
|--------|----------------|--------------------|--------------------|
| 全线突进 | ↑ | ↑ | morale ↑ |
| 战术撤退 | ↓ | ↓ | morale ↓↓ |
| 战线突破（局部胜利） | ↑↑ | ↓ | morale ↑↑ |
| 阵线崩溃（局部败退） | ↓↓ | ↑↑ | health ↓, morale ↓↓ |

医疗角色的同类卡牌语义转换为"伤员潮"：进攻波 = ward_mortality ↑ + fatigue ↑；胜利捷报 = ward_mortality ↓ + 患者士气 ↑。个人安全系数远高于战斗士兵，故 danger_accumulation 主要来自疲劳累积（fatigue_accumulation），而非炮火。

### 决策四：三个战场场景的首次实现

| 故事 | 路径 | 战场变量归属 | 医疗/动力学变量归属 |
|------|------|-------------|------------------|
| 索姆河 1916（升级） | `social/ad1916_uk_somme_britain` | battle_progress, danger_accumulation: native | health, morale, rations: sim |
| 南丁格尔 1854（新建） | `social/ad1854_uk_florence_nightingale` | battle_progress, fatigue_accumulation: native | health, ward_mortality: sim |
| 希波克拉底 430 BC（新建） | `social/ad430_gr_hippocrates_plague` | battle_progress, danger_accumulation: native | health, patient_survival, city_resistance: sim |

**南丁格尔和希波克拉底均从 Sim 出发**：两者的医疗干预效果均有历史文献支撑（南丁格尔死亡率从 42.7% 降至 2.2%；希波克拉底方法的观察性记录来自修昔底德和希波克拉底文集）。

---

## 术语说明

**"战略转进"≠ 前进**。"转进"在中文军事语境中是撤退的委婉说法（国民党军队惯用），不是进攻。卡牌命名采用无歧义术语：进攻 = "全线突进"，撤退 = "战术撤退"。

---

## 结果

```
game_requirements.md     § 6 战场张力框架（新增）
game_impl.md             § 变量溯源标注（新增 origin 字段定义）
converter_design.md      § Game-native 变量的 Converter 透明性（新增）

models/stories/social/
  ad1916_uk_somme_britain/     ← 升级：+battle_progress/danger，+6张战况牌，结局重写为6级
  ad1854_uk_florence_nightingale/  ← 新建（18个文件：game_story + 6玩家牌 + 11环境牌）
  ad430_gr_hippocrates_plague/     ← 新建（17个文件：game_story + 6玩家牌 + 10环境牌）
```

暂不实现：奥本海默场景（待后续决策）；居里夫人国家线（待独立 story 文件）。
