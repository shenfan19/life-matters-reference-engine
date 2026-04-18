
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
