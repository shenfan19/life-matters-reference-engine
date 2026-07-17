# 软件设计

> **决议导航**：本文件中的关键决议已汇总至 [DECISIONS.md](DECISIONS.md)（⭐⭐ 为核心约束）。  
> 关键 ADR：K×4 → [0038](decisions/0038-2026-04-20_sim_regimen-k4-input-scheduling.md)；MC 仿真 → [0045](decisions/0045-2026-04-30_sim_MC概率仿真与随机参数架构.md)（实现细节见 [mc.md](mc.md)）；Simulator 拆分 → [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md)；
> 子日时间区间统一 → [0100](decisions/0100-2026-06-11_sim_unify-pulse-sustained-time-interval.md)；
> sustained `value` 每匹配日独立满额（取代 0099）→ [b_lm_model 0131](../../../b_lm_model/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md)；
> `delivery: total | level` → [b_lm_model 0132](../../../b_lm_model/docs/decisions/0132-2026-07-14_model_sustained-delivery-total-vs-level.md)

## 仿真/优化: 数学结构
### Regimen 的 K×4 参数空间
一条 **Regimen** 描述**一种行为的重复计划**——类比手机日历里的一条重复事件。每条 Regimen 恰好由四个维度组成：

| 字段 | 含义 | 可关闭？ |
|---|---|---|
| `time_start`/`time_end` 时间区间 | 每天 `[time_start, time_end)` 区间内执行（`time_end == time_start` 即单点脉冲） | 否 |
| `value` 摄入量 | 每次执行时的量，与时间区间一一配对 | 否 |
| `days` 执行日 | 每周哪几天执行 | 否（全选=每天） |
| `valid_range` 有效期 | 此计划在哪段日期内有效 | **可关闭** → 整个仿真期永久有效 |

**关键：`value` 是单次命中窗口内的总量**（如 0.5 kg、10 IU、45 min），不是速率（不是 kg/h）。`time_start == time_end` 时退化为脉冲：在该时刻瞬时摄入固定量；区间非零宽度时（sustained），`N_steps` = 该窗口自身时长 / `step_size`（与 `date_range`/`days` 命中了多少天无关），每个命中日各自独立按 `value / N_steps` 摊到每个 step（[ADR 0131](../../../b_lm_model/docs/decisions/0131-2026-07-13_model_sustained-value-per-day-not-per-span.md)，取代 ADR 0099 曾经的"总量按整个生效窗口摊分"规则），单日累计贡献仍等于 `value`，与 `step_size` 无关，也与匹配了多少天无关。若语义上 `value` 表达的是应保持恒定的水平（睡眠时长、救治强度等，而非随时间累积的总量），regimen 条目可设 `delivery: level` 让每个命中 step 直接交付 `value` 本身，不做 `N_steps` 除法（[ADR 0132](../../../b_lm_model/docs/decisions/0132-2026-07-14_model_sustained-delivery-total-vs-level.md)）；不设时默认 `delivery: total`，即上述摊分规则。

**`valid_range` 关闭的语义**：日常习惯（吃饭、喝水、睡觉）不需要起止日期，关闭即等于"从第0天到仿真结束"。阶段性行为（手术康复期用药、参战期间）才需要开启。

#### 典型例子

```
早餐进食（脉冲，time_start == time_end）:
  有效期:    关闭（永久有效）
  时间区间:  07:30 ~ 07:30
  摄入量:    0.5 kg
  执行日:    每天（全选）

胰岛素注射（早晚各一次，均为脉冲）:
  有效期:    2024-02-01 ~ 2024-06-30
  时间区间:  08:00~08:00   20:00~20:00
  摄入量:    10 IU         8 IU      ← 区间与 value 等长，位置一一对应
  执行日:    每天

有氧运动（脉冲）:
  有效期:    关闭
  时间区间:  07:00 ~ 07:00
  摄入量:    45 min
  执行日:    周一 周三 周五

白天救治强度（sustained，delivery: level，直接交付水平）:
  有效期:    1945-08-06 ~ 1945-08-11
  时间区间:  08:00 ~ 20:00
  摄入量:    4.0     ← delivery: level 时每个命中 step 直接交付 value 本身，不做 N_steps 除法
  执行日:    每天

训练负荷（sustained，delivery: total 默认，窗口总量按窗口自身时长摊分）:
  有效期:    关闭
  时间区间:  08:00 ~ 20:00
  摄入量:    288.0   ← 窗口自身 12h / step=1h → N_steps=12，每 step 写入 24.0；
                       每个命中日各自独立累计 288.0，与匹配了多少天无关
  执行日:    每天
```

K 条 Regimen 组成完整的干预方案，每条各有上述四个维度，每个维度独立可设为 **锁定**（固定值）或 **优化**（给定搜索范围，交由优化器搜索）。

### Regimen → 优化器参数展开

优化器统一接受实数向量 $\theta \in \mathbb{R}^d$。每条 Regimen 中被标记为"优化"的维度展开为 $\theta$ 的一段分量：

| 字段 | 展开方式 | 贡献维数 |
|---|---|---|
| `time` 时刻（第 $i$ 个时刻点） | $\tau_i \in [\tau_{\min}, \tau_{\max}]$，单位：小时 | $n_r$（时刻数） |
| `value` 摄入量（第 $i$ 个） | $d_i \in [d_{\min}, d_{\max}]$ | $n_r$ |
| `days` 执行日 | 连续松弛 $w_j \in [0,1]$，$j=1\ldots7$；仿真时 $w_j \ge 0.5$ 视为执行 | 7 |
| `valid_range` 有效期（开启时） | $(t_{\text{start}},\, t_{\text{end}}) \in$ 日期范围 | 2 |

**总搜索维数**：

$$d = \sum_{r=1}^{K} \Bigl[ n_r \cdot \bigl(\mathbb{1}[\text{B优化}] + \mathbb{1}[\text{C优化}]\bigr) + 7 \cdot \mathbb{1}[\text{D优化}] + 2 \cdot \mathbb{1}[\text{A优化且开启}] \Bigr]$$

**每周天数（D维）的两种处理**：

1. **连续松弛**（默认）：$w_j \in [0,1]$，优化后取 $w_j \ge 0.5$ 的天作为执行日。适合 NSGA-II（梯度不需要精确）。
2. **约束枚举**（当用户给出"至少 N 天"约束时）：加入约束 $\sum_j w_j \ge N$，连续松弛仍可用。

**时刻序列（B维）的时序约束**：若一条 Regimen 有多个时刻点，优化时须保证 $\tau_1 < \tau_2 < \cdots < \tau_{n_r}$。连续化技巧：

$$\tau_i = \sum_{k=1}^{i} \text{softmax}(\alpha)_k \cdot T_{\text{day}}, \quad \alpha \in \mathbb{R}^{n_r} \text{ 无约束}$$

优化器对 $\alpha$ 搜索，仿真前先转换回 $\tau_i$，保证时序自动满足。

### iCal双向转换工具（未实现）
**工具价值**：用户可以在手机日历App里直接设计自己的行为计划，导出iCal后一键导入LM仿真。

**现状**：`gui/src/` 中无任何 iCal/ics 相关代码，此工具从未实现，也不在当前 Simulator 的开发范围内（[ADR 0117](decisions/0117-2026-06-21_sim_regimen-vs-recommended-final-naming.md)「不在本次范围内」一节已记录该处文档与实现的落差）。后文各交互 mockup 中不再出现 iCal 导出，实际的 Opt → Sim 传递方式见下文「Opt → Sim：N-N 重组架构」一节。

### Evidence 变量：文献直接来源的值

随机事件（战死、手术风险、疾病发作）和其他文献统计量，以 **`evidence`** 顶层节纳入模型（8 种子类型：`rr`/`or`/`hr`/`ard`/`cohens_d`/`ir`/`beta`/`pk`）。Loader 在加载时自动完成换算，Simulator 只见换算后的有效值。**不进入任何优化搜索空间。**

换算公式、溯源字段（`evidence_type`/`evidence_raw_value`）见 [evidence/conversion.md](evidence/conversion.md)（权威实现描述，含已知实现细节）；把换算结果自动接入某个状态变量 dynamics 的 `applies_to` 机制见 [evidence/applies_to.md](evidence/applies_to.md)；YAML 字段声明方式见 `b_lm_model` 仓库 `docs/model.md`。

**仿真中的确定性处理**（不做随机采样）：

```
生存率(t) = ∏(1 − ir_effective × step_size)
```

直接得到期望存活率确定性轨迹，可重现，足够用于 Pareto 优化。分布形式的采样（MC）只应用于 `parameter` 变量，与 evidence 换算是两回事，见 [mc.md](mc.md)。


## 双环优化架构

LM 的优化体系由两个独立的优化环构成，目标和实现工具完全不同：

### 外环：Regimen 搜索（当前主攻，Simulator 实现）

| 项目       | 说明                                    |
| -------- | ------------------------------------- |
| **搜索对象** | `input` 变量的 Regimen 计划（时刻、剂量、执行天、有效期） |
| **目标**   | 寻找令 `state` 输出最优的行为/用药方案              |
| **算法**   | NSGA-II（多目标）/ L-BFGS-B、Nelder-Mead（单目标，scipy）——完整口径见下文「优化目标与方法」一节 |
| **输出**   | Pareto 前沿：一批非支配 Regimen 方案            |
| **用户**   | 医生、患者、研究者 —— 关心"怎么做才最好"               |
| **当前状态** | ✅ 已设计，实现中                             |

### 内环：参数校准（未来，Modeller 实现）

| 项目       | 说明                                      |
| -------- | --------------------------------------- |
| **搜索对象** | `parameter` 变量（机制系数，如 Bergman p1/p2/p3） |
| **目标**   | 使仿真曲线拟合文献观测数据（最小化 MSE / AIC）            |
| **算法**   | L-BFGS-B / Nelder-Mead / Bayesian Opt   |
| **输出**   | 一组使模型贴合真实数据的 `parameter` 值              |
| **用户**   | 模型开发者 —— 关心"模型有多准"                      |
| **当前状态** | ⏳ 设计预留，Modeller 工具待实现                   |

### 两环的关系

```
内环（Modeller）              外环（Simulator）
   ↓ 校准 parameter              ↓ 搜索最优 input
model.yaml ─────────────────→ story.yaml ──→ Pareto 前沿
  parameter 值由内环确定          input 的 Regimen 由外环搜索
```

`parameter` 经内环校准后写入 `model.yaml` 并固定；外环在 `parameter` 固定的前提下搜索 `input` 空间。两环互不干扰，可以独立运行。

`evidence` 变量不进入任何优化环 —— 它是文献给定的约束，Loader 换算后直接作为常量供公式使用。

---

## GUI Working State Layer（GUI 工作状态层）

> 对应需求 F-1；架构决策见 ADR 0074、ADR 0109/0110（plans 强制规范）、ADR 0115（移除 daily_inputs 后简化）。

### 概念

GUI Working State Layer 是 Sim 面板中 `inputEvents[]` 的集合——它是用户可见、可编辑的输入配置，代表"本次仿真实际使用什么值"。

```
加载流程：
  YAML 文件 → Loader 解析 self.plans → 前端按 plan 还原 inputEvents ← 用户编辑 / Opt 结果注入
                                     ↓
                  session 启动：inputEvents 作为 regimens 字段发给后端
                                     ↓
                              每步：apply_schedules(session['regimens'])
```

ADR 0074 当时要解决的问题（旧版 `daily_inputs`/`_apply_schedules` 在每步末尾用 YAML 值覆盖 GUI 编辑）已经
不存在：`daily_inputs` 整套机制已在 ADR 0115 删除，`simulation.plans[*].regimens` 是仅剩的输入声明位置
（ADR 0109），而 GUI 的 `inputEvents` 本身就是该 plan 内容的可编辑实例，两者不再是会冲突的两条路径——
GUI session 每步只调用一次 `apply_schedules()`，输入即 `inputEvents`，不存在"谁覆盖谁"的优先级问题。

### 初始化规则

| 事件 | inputEvents（GUI 层）的变化 |
|------|--------------------------|
| 加载新模型 | 从 `simulation.plans[*].regimens` 解析（`self.plans[plan_id]`），按 plan 填充 inputEvents |
| 加载含 `optimizer.results.recommended.x` 的模型 | 询问用户是否预填推荐解；选"是"实际只覆盖 **Opt Tab** 的 `optInputEvents`（`useModelInit.ts` `Modal.confirm.onOk`），不触碰本表定义的 Sim `inputEvents`——推荐解本就该作为 Opt 决策变量的起点，此行为合理，此处仅修正文字描述 |
| Opt 完成，用户点击"以此解运行仿真" | 按 `optimizer.startpoint.regimens` 决策变量映射将解的 `x` 写入 inputEvents |
| 用户手动编辑 | 直接修改 inputEvents |

### F-MPLAN 扩展

多方案时，每个 Plan 有独立的 `inputEvents[]`，对应独立的 session，方案间隔离，互不影响。

---

## Opt → Sim：N-N 重组架构

> 对应需求 F-5、F-2、F-3。

### 设计原则

Opt 产出 N 组输入组合（Pareto 前沿）；Sim 是下游，必须能接住 N 组。软件层负责重组，Opt 结果保持原始格式（`{x, f}` 向量）。

```
YAML: optimizer.startpoint.regimens   pareto_front[i].x
（含 optimize: 的决策变量）              ↓
           ↓           xToInputEvents(x, optimizerSchedules, baseInputEvents)
                                        ↓
                           Plan[i].inputEvents[]   →   独立 session → 仿真曲线 i
```

### xToInputEvents 函数

**职责**：将 Pareto 解的 `x` 向量还原为 Sim 可执行的 `InputEvent[]`。

**输入**：
- `x: number[]` — 某个 Pareto 解的决策变量值
- `optimizerRegimens: object[]` — 当前 YAML 中 `optimizer.startpoint.regimens` 中含 `optimize:` 块的条目列表
- `baseInputEvents: InputEvent[]` — 当前 Sim 的基础 inputEvents（提供 `days`、`valid_range_enabled` 等非优化字段）

**映射规则**（与 Python 后端构建 x 向量的顺序完全一致）：

```
对 optimizer.startpoint.regimens 中有 optimize: 块的条目（按列表顺序）:
  按启用的 Tier 依次贡献维度：T1(value) + T2(time_slot) + T3(days_combo) + T4(date_offsets)
  x[idx++] → 匹配 variable=varName AND time=event.time 的 baseInputEvent，更新对应字段
```

**输出**：返回新的 `InputEvent[]`，只更新了 `optimizeValue=true` 事件的 value，其余字段不变。

**调用场景**：

| 场景 | 调用方式 |
|------|---------|
| 加载模型，预填推荐解 | `xToInputEvents(recommended.x, yaml.optimizer.startpoint.regimens, current)` |
| "以此解运行仿真" | 同上，结果设为当前 Sim Plan 的 inputEvents |
| Run Compared（N 个 Pareto 解） | 对每个勾选的解调用，得到 N 个 Plan |

### 数量关系

| | 1-1（MVP） | N-N（目标） |
|--|------------|------------|
| Opt → Sim | reference.x → 1 个 inputEvents | pareto_front[0..N-1].x → N 个 Plan |
| Sim 运行 | 1 个 session | N 个并行 session |
| 图表 | 1 条曲线 | N 条曲线（F-MPLAN） |
| 代码差异 | `xToInputEvents` × 1 | `xToInputEvents` × N + SimChart 多曲线 |

`xToInputEvents` 函数本身是共用的，N-N 仅比 1-1 多了"调用 N 次"和 SimChart 多数据集渲染。SimChart 改造是 F-MPLAN 必要工作，与 1-N 无关。因此**实现 N-N 的额外代价极小**，直接做 N-N。

---

## 优化: Pareto输出的形态

### Pareto前沿是什么
对于两目标优化，输出是一条**权衡曲线**（50-200个非支配解），每个点代表一种权衡下的最优Regimen方案：
```
目标1：肝脂肪减少量（越大越好）
                ↑
              * |
           *    |         每个*是一个具体可执行的Regimen方案
        *       |
     *          |
  *             |
                +——————————————→
                  目标2：ALT酶峰值（越小越好）

左上角 = 激进运动方案（最大减脂，但ALT风险高）
右下角 = 保守休息方案（ALT安全，但减脂少）
中间弯折点 = 推荐的最佳权衡方案
```

### 用户如何使用Pareto输出

实际交互是 Opt Tab 结果区的 Solutions 表格，而非本节早期设想的"点选/偏好滑条/iCal 导出"：

1. `ParetoChart` 显示 Pareto 散点图，悬浮某点显示该方案的目标值提示（无点选逻辑，无方案预览面板）。
2. Solutions 表格逐行列出每个 Pareto 解的决策变量与目标值，参考解（`recommended`/`best_x`）高亮为 ★ 行。
3. 用户用行首 checkbox 勾选一个或多个方案，点击「Send to Sim / 发送到 Sim」——不是"导出为 iCal"，而是调用 `xToInputEvents` 把勾选解写回 Sim Tab，每个解各自生成一个独立 Plan（N-N 架构，见下文「Opt → Sim：N-N 重组架构」一节，该节描述与代码吻合）。

## 仿真/优化: 界面规划
### 核心设计理念

Sim 与 Opt 是两个完全独立的顶部 Tab（`centerTab: 'simulation' | 'optimization'`），各自挂载独立的 Setup/ControlBar/结果组件（`SimSetupTab`+`SimControlBar` / `OptSetupTab`+`OptControlBar`），二者布局镜像但状态互相隔离；不存在"Opt 内嵌于 Sim 顶部开关"的模式（[ADR 0084](decisions/0084-2026-05-23_sim_sim-opt-separation.md) 已推翻早期这一设想）。

### 整体布局（两栏 4:6，无第三列）

Sim Tab 与 Opt Tab 内部布局镜像，均为 `WorkspacePage` 固定 4:6 两栏（[ADR 0079](decisions/0079-2026-05-18_sim_workspace-layout-4-6-split.md)）：

```
┌───────────────────────────────────────────────────────────┐
│  [仿真] [优化]                             ← 顶部 Tab 切换  │
├───────────────────────────────────────────────────────────┤
│  [Story选择器]  [仿真时长]  [步长]    [▶运行][⏸暂停][⏹停止]│ ← 各 Tab 独立 ControlBar
├─────────────────────┬─────────────────────────────────────┤
│  左栏 40%：输入区   │  右栏 60%：结果区                   │
│                     │                                     │
│  Sim: Variables /   │  Sim: 曲线图 + Log                 │
│  Regimens / Evidence│  Opt: 进度图 + Pareto 散点          │
│  Opt: 同上，各维度  │       + Solutions 表格              │
│  可标记 🔒/🔀        │                                     │
├─────────────────────┴─────────────────────────────────────┤
│  进度条 ████████░░ 80%                                     │
└───────────────────────────────────────────────────────────┘
```

### Sim Tab 左栏：输入区详细设计

左栏分三个折叠块：VARIABLES（初始状态值）、REGIMENS（干预计划列表）、EVIDENCE（只读文献值）。Parameters 面板属于 Modeller 工具（待实现），不在 Simulator 中显示。

每条 Regimen 展开后呈现四个维度。`value` 字段显示带单位的**一次性摄入量**，不是速率。

```
┌─── VARIABLES ──────────────────────────────────────┐
│  liver_fat_percentage    初始值: [15.0] %           │
│  body_weight             初始值: [72.0] kg          │
└────────────────────────────────────────────────────┘

┌─── REGIMENS ───────────────────────────────────────┐
│                                          [+ 新增]  │
│                                                    │
│  ▼ 早餐进食                              [×删除]   │
│  ┌──────────────────────────────────────────────┐  │
│  │ 有效期: [关闭 ▼]                             │  │
│  │                                              │  │
│  │ 时刻 / 摄入量:               [+ 添加时刻]   │  │
│  │   [07:30]  →  [0.5 kg]      [×]             │  │
│  │                                              │  │
│  │ 每周: ☑一 ☑二 ☑三 ☑四 ☑五 ☑六 ☑日          │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ 胰岛素注射                            [×删除]   │
│  ┌──────────────────────────────────────────────┐  │
│  │ 有效期: [2024-02-01] ~ [2024-06-30]  [✓开启] │  │
│  │                                              │  │
│  │ 时刻 / 摄入量:               [+ 添加时刻]   │  │
│  │   [08:00]  →  [10 IU]       [×]             │  │
│  │   [20:00]  →  [ 8 IU]       [×]             │  │
│  │                                              │  │
│  │ 每周: ☑一 ☑二 ☑三 ☑四 ☑五 ☑六 ☑日          │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ 有氧运动                              [×删除]   │
│  ┌──────────────────────────────────────────────┐  │
│  │ 有效期: [关闭 ▼]                             │  │
│  │                                              │  │
│  │ 时刻 / 摄入量:               [+ 添加时刻]   │  │
│  │   [07:00]  →  [45 min]      [×]             │  │
│  │                                              │  │
│  │ 每周: ☑一 ☐二 ☑三 ☐四 ☑五 ☐六 ☐日          │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

┌─── EVIDENCE ───────────────────────────────────────┐
│  （只读，Loader 已换算，影响动力学但不进入优化）   │
│  combat_death_rate   ir   0.008 / day              │
│  smoking_rr          rr   14.0                     │
│  obesity_or          or   1.65  → effective 1.43   │
└────────────────────────────────────────────────────┘
```

### Opt Tab 左栏：输入区详细设计

Opt Tab 与 Sim Tab 的 REGIMENS 面板同源数据结构，但每个维度可标记为锁定或优化：

**🔒 = 锁定**（固定值，不参与搜索）　**🔀 = 优化**（给出范围，交优化器搜索）

切换粒度：可以按整条 Regimen 切换，也可以按单个时刻行、或有效期、或每周天数分别切换。

```
┌─── REGIMENS（优化模式）────────────────────────────┐
│                                                    │
│  ▼ 早餐进食                                        │
│  ┌──────────────────────────────────────────────┐  │
│  │ 有效期: 🔒 [关闭]                            │  │
│  │                                              │  │
│  │ 时刻 / 摄入量:                               │  │
│  │   时刻:   🔒 [07:30]                         │  │← 时刻固定
│  │   摄入量: 🔀 [0.3 kg ~ 0.8 kg]              │  │← 量待搜索
│  │                                              │  │
│  │ 每周: 🔒 ☑一 ☑二 ☑三 ☑四 ☑五 ☑六 ☑日       │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ 胰岛素注射                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ 有效期: 🔒 [2024-02-01 ~ 2024-06-30]        │  │
│  │                                              │  │
│  │ 时刻1 / 摄入量1:                             │  │
│  │   时刻:   🔀 [06:00 ~ 10:00]                │  │← 时刻和量都搜索
│  │   摄入量: 🔀 [5 IU ~ 20 IU]                 │  │
│  │                                              │  │
│  │ 时刻2 / 摄入量2:                             │  │
│  │   时刻:   🔒 [20:00]                         │  │← 晚间时刻固定
│  │   摄入量: 🔀 [4 IU ~ 15 IU]                 │  │
│  │                                              │  │
│  │ 每周: 🔒 ☑全选                              │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ▼ 有氧运动                                        │
│  ┌──────────────────────────────────────────────┐  │
│  │ 有效期: 🔒 [关闭]                            │  │
│  │                                              │  │
│  │ 时刻 / 摄入量:                               │  │
│  │   时刻:   🔀 [06:00 ~ 09:00]                │  │
│  │   摄入量: 🔀 [20 min ~ 90 min]              │  │
│  │                                              │  │
│  │ 每周: 🔀 [3] ~ [5] 天（优化选择哪几天）      │  │← 天数区间搜索（daysNMin~daysNMax）
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

┌─── OBJECTIVES（优化目标）──────────────────────────┐
│  + 添加目标                                        │
│  ① liver_fat_percentage    方向: [最小化 ▼]  [×]  │
│  ② alt_enzyme_level        方向: [最小化 ▼]  [×]  │
└────────────────────────────────────────────────────┘

┌─── CONSTRAINTS（约束）─────────────────────────────┐
│  + 添加约束                                        │
│  alt_enzyme_level   ≤  [120]  U/L                 │
│  weekly_exercise    ≥  [60]   min                 │
└────────────────────────────────────────────────────┘

┌─── 算法配置 ────────────────────────────────────────┐
│  算法: [NSGA-II ▼]    种群: [100]    代数: [200]   │
│  当前搜索维数: d = 9（自动计算并显示）              │
└────────────────────────────────────────────────────┘
```

**搜索维数 d 的实时计算**：UI 自动统计所有 🔀 维度，显示当前 $d$ 值，帮助用户判断问题规模（$d > 20$ 时提示增大种群）。

### Sim Tab 右栏：结果区详细设计

```
┌─── 仿真曲线 ──────────────────────────────────┐
│  [liver_fat%] [alt_level] [glucose] + 添加     │  ← 变量选择
│                                                 │
│  100%│                                          │
│      │  ╲                                       │
│   50%│    ╲___                                 │
│      │        ╲___________                     │
│    0%└──────────────────────→ 时间(天)          │
│        0      30      60      90               │
└─────────────────────────────────────────────────┘

▼ Log  [复制] [下载]
  12:34:05 Model: ckd_protein_a4 (31 vars, 12 formulas)
  12:34:05 Imports: references/medical/physiology/glucose_regulation_2026_mw
  12:34:05 Sim: start=2026-01-01, step=1 day, 365 steps
  12:34:05 Outputs (5): GFR, muscle_mass, lm_score, ...
  12:34:07 Done in 2.3s — 365 steps
  12:34:07 Schedule hits: dietary_protein=1095
```

Log 面板出现在曲线区底部（可折叠）。仅在有 log 内容时显示。  
详细内容分层规则见 [ADR 0093](decisions/0093-2026-06-05_sim_runtime-log-panel.md)。

### Opt Tab 右栏：结果区详细设计

优化运行中显示进度；完成后显示 Pareto 散点图（仅悬浮提示，无点选/预览面板）+ Solutions 表格（checkbox 多选 + Send to Sim，交互细节见上文「优化: Pareto输出的形态」一节）：

```
┌─── 优化进度 ────────────────────────────────────┐
│  Generation 45/200  ████████░░░░░░░  种群收敛中  │
└─────────────────────────────────────────────────┘

┌─── Pareto前沿 ──────────────────────────────────┐
│  目标1: liver_fat减少量（↑更好）                  │
│   ↑                                              │
│   │        *  *        （悬浮显示目标值提示）    │
│   │      *                                       │
│   │    *                                         │
│   │  *                                           │
│   └────────────────────→ 目标2: ALT峰值（←更好）  │
└───────────────────────────────────────────────────┘

┌─── Solutions（Pareto 解列表）───────────────────────┐
│ ☑ #  x1     x2    …  liver_fat  ALT                │
│ ☑ ★  0.42   06:30 …  -42%       98                 │  ← 参考解高亮
│ ☐ 2   0.38   07:00 …  -35%       85                 │
│ …（最多 80 行）                                     │
│ [Send to Sim (2)]  [Clear]              [Download]  │
└───────────────────────────────────────────────────┘
```

早期设想的"右列元数据区"（模型引用文献 / 约束状态 ✅⚠️ / 参数置信度 ★）从未实现，也无任何 ADR 或代码痕迹显示其在开发计划中——两栏 4:6 布局是 ADR 0079 从更早的单栏方案直接演进而来，未经过三栏阶段，此处不再保留描述。

---

> YAML 模型格式规范见 [`model_design.md`](model_design.md)。

## 优化目标与方法

优化目标格式（`optimizer.objectives`）与算法选择/参数展开的完整规范见 [opt.md](opt.md)，本节不重复维护。

要点：目标不是预设名字符串，而是 `objectives: [{variable, metric, direction}]` 列表；算法后端只有两类——`NSGA-II`（多目标或显式指定时，`pymoo` 库，输出 Pareto 前沿）与 `scipy`（`L-BFGS-B`/`Nelder-Mead`，单目标连续优化）。

GUI 算法下拉框（`OptSetupTab.tsx`）实际提供四个选项：NSGA-II / MOEA-D / L-BFGS-B / Nelder-Mead。其中 **MOEA-D 目前是 NSGA-II 后端的别名**，非独立实现——`optimizer_engine.py` 把 `method: moea/d` 与 `nsga2`/`nsga-ii` 一并路由到同一个 `_run_nsga2`（`optimizer_backends.py` 只有 NSGA-II 一种多目标算法），GUI 侧尚未如实标注这一点。

---

## 结果交换：CSV 与 YAML（ADR 0094）

### 核心原则

**CSV 是结果的通用交换格式。** 导入 CSV 是唯一需要理解的操作，其后果由所在标签页的性质自然决定：

| 标签页 | 导出 CSV | 导入 CSV → 自动后果 |
|--------|---------|---------------------|
| **Sim** | 见下方"Sim CSV 导出格式" | 新增一条带标签的对比曲线 |
| **Opt** | Pareto 前沿（x0…xN, obj1…objN） | 合并入当前前沿，自动开启热启动 |
| CLI --sim-only | 自动输出 `_sim.csv` | — |
| CLI --opt-only | 自动输出 `_opt.csv` | `--opt-continue [TIMESTAMP]` |

"多曲线对比"和"热启动"不是独立功能——它们是导入 CSV 在各自上下文中的直接结果，无需单独学习。

### Sim CSV 导出格式（ADR 0108）

导出范围覆盖所有 plan（当前运行 + Run All Plans 结果 + CSV 导入的历史曲线）：

| 情形 | 格式 | 文件名 |
|------|------|--------|
| 无对比曲线（单 plan） | 宽表 CSV，列 = `step, time, var1, var2 …` | `model_start_end.csv` |
| 有对比曲线（多 plan） | ZIP，每变量一个 CSV | `model_start_end.zip` |

多 plan 时每个变量的 CSV 格式：

```
time_s,time_h,Plan A,Plan B,…
0,0.0000,5.0,4.8,…
```

同类变量的所有 plan 曲线集中在同一文件，便于横向对比分析。下载按钮在无任何仿真数据时禁用。

### Sim 仿真历史曲线

每次点击 **Run** 时，若当前已有完成的仿真结果，引擎自动将其快照为一条带标签的历史曲线（标签格式：`Sim 2026-01-01 · 1h`），保留在图表对比区。新的仿真在此基础上叠加显示。

对比曲线行为：
- **来源**：CSV 导入 或 Run 时自动快照，两者进同一列表
- **标签**：CSV 来源用文件名；自动快照用 `Sim {起始日} · {步长}` 格式
- **关闭**：每条曲线在切换栏有 × 按钮，点击即从对比区移除
- **生命周期**：切换模型或点击重载时，当前仿真结果（simulationData）和所有对比曲线同时清空；模型间的仿真数据相互隔离，不跨模型复用

### YAML 下载（另存为）

YAML 下载**永远不覆盖源文件**（另存为语义），Sim 和 Opt 标签行为完全一致：

- **有 opt 结果** → 自动将 `optimizer.results` 块写入副本并下载，通过 `message.success` 告知包含的解数量
- **无 opt 结果** → 下载纯模型定义，同样通过 `message.success` 告知

### 报告与图片导出（ADR 0122）

报告导出按钮（`ReportButton.tsx`）是独立共用组件，同时挂载在 SimControlBar 和 OptControlBar 的工具栏 slot 中。导出格式：

| 格式 | 触发 | 行为 |
|------|------|------|
| **HTML 预览** | 菜单选项 | 新标签页打开，图片以 base64 内嵌，自包含无需联网 |
| **MD 导出** | 菜单选项 | 下载 `.zip`，内含 `report.md`（相对路径引用图片）+ `images/` 目录（PNG 文件） |

MD 导出使用 ZIP 而非单文件，原因是 Markdown 标准不支持 base64 data URL——GitHub、Obsidian、VS Code 等所有主流查看器均无法渲染内嵌 base64 图片；ZIP + 相对路径是唯一通用方案。

**图片生成规则**：每变量 × 每 plan 各生成一张 PNG，不叠加多条曲线。文件名格式为 `{varName}_{planLabel}.png`。多 plan 时 MD 正文中每图前插入 `**— Plan 名 —**` 分隔标注。

**数据来源三级 fallback**（`effectiveSimData`）：`simulationData`（当前仿真）→ `importedSimRuns` 最后一条（历史归档）→ `comparedPlans` 第一条有数据的 plan（Pareto 解仿真）。第三级保证 opt 工作流结束后 Overview 和报告不显示"No data"。

**逐变量 PNG 下载**：SimPlotTab 每个变量的 Collapse 标题行 `extra` slot 中提供 PNG 和 CSV 两个并排下载按钮。单 plan 时直接下载单张 PNG；多 plan 时下载包含每 plan 独立图片的 ZIP。

### 已移除

`saveResultsToFile()`（直接覆盖源文件写入结果）已永久移除。结果通过 CSV（交换）或 YAML 另存为（归档/发布）流转。
