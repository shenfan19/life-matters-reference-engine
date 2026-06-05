# 软件设计

> **决议导航**：本文件中的关键决议已汇总至 [DECISIONS.md](DECISIONS.md)（⭐⭐ 为核心约束）。  
> 关键 ADR：K×4 → [0038](decisions/0038-2026-04-20_sim_regimen-k4-input-scheduling.md)；MC 仿真 → [0045](decisions/0045-2026-04-30_sim_MC概率仿真与随机参数架构.md)；Simulator 拆分 → [0066](decisions/0066-2026-05-08_sim-simulator-decomposition-and-result-workspaces.md)

## 仿真/优化: 数学结构
### Regimen 的 K×4 参数空间
一条 **Regimen** 描述**一种行为的重复计划**——类比手机日历里的一条重复事件。每条 Regimen 恰好由四个维度组成：

| 字段 | 含义 | 可关闭？ |
|---|---|---|
| `time` 时刻 | 每天在哪些时刻执行（可有多个时刻） | 否 |
| `value` 摄入量 | 每次执行时的量，与 `time` 一一配对 | 否 |
| `days` 执行日 | 每周哪几天执行 | 否（全选=每天） |
| `valid_range` 有效期 | 此计划在哪段日期内有效 | **可关闭** → 整个仿真期永久有效 |

**关键：`value` 是离散的一次性摄入量**（如 0.5 kg、10 IU、45 min），不是速率（不是 kg/h）。一次执行 = 在某时刻瞬时摄入固定量，仿真引擎将其作用于该时刻所在的积分步。

**`valid_range` 关闭的语义**：日常习惯（吃饭、喝水、睡觉）不需要起止日期，关闭即等于"从第0天到仿真结束"。阶段性行为（手术康复期用药、参战期间）才需要开启。

#### 三个典型例子

```
早餐进食:
  有效期:  关闭（永久有效）
  时刻:    07:30
  摄入量:  0.5 kg
  执行日:  每天（全选）

胰岛素注射（早晚各一次）:
  有效期:  2024-02-01 ~ 2024-06-30
  时刻:    08:00    20:00
  摄入量:  10 IU    8 IU      ← time 与 value 等长，位置一一对应
  执行日:  每天

有氧运动:
  有效期:  关闭
  时刻:    07:00
  摄入量:  45 min
  执行日:  周一 周三 周五
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

### iCal双向转换工具
**工具价值**：用户可以在手机日历App里直接设计自己的行为计划，导出iCal后一键导入LM仿真。

### Evidence 变量：文献直接来源的值

随机事件（战死、手术风险、疾病发作）和其他文献统计量，以 **`evidence`** 类型纳入模型。Loader 在加载时自动完成换算，Simulator 只见换算后的有效值。**不进入任何优化搜索空间。**

```yaml
evidence:
  # ── 发病率 / 死亡率（直接用作概率，无需换算）──
  combat_death_rate:
    type: ir                    # incidence rate
    value: 0.008
    unit: prob/day
    description: "参战时日死亡概率（索姆河战役）"
    reference: "Prior 1992, Historical Journal"

  surgery_mortality:
    type: ir
    value: 0.03
    unit: prob/event
    reference: "相关外科文献"

  disease_incidence:
    type: ir
    value: 0.05
    unit: prob/year

  # ── 相对风险（直接用作乘数，无需换算）──
  smoking_lung_cancer_rr:
    type: rr
    value: 14.0
    reference: "Doll & Hill (1950)"

  # ── 比值比（患病率 > 10% 时 Loader 自动换算为有效 RR）──
  obesity_diabetes_or:
    type: or
    value: 1.65
    baseline_prevalence: 0.23   # 必填；Loader: RR = OR/((1-p₀)+p₀×OR)
    reference: "..."

  # ── 风险比（Loader 自动 × 基线风险）──
  chemo_mortality_hr:
    type: hr
    value: 0.82
    baseline_ref: chemotherapy_baseline_ir   # 必填；引用同一 evidence 节中的 ir 变量
    reference: "..."

  # ── 效应量 Cohen's d（Loader 自动 × population_sd）──
  exercise_fev1_effect:
    type: cohens_d
    value: 0.68
    population_sd: 0.5          # 必填；单位与 target 变量一致
    unit: L
    reference: "..."

  # ── 绝对风险差（直接用，无需换算）──
  statin_cvd_ard:
    type: ard
    value: 0.012
    unit: prob/year
    reference: "..."

  # ── 回归系数（直接用作斜率）──
  age_bp_beta:
    type: beta
    value: 0.45
    unit: mmHg/year
    reference: "..."

  # ── PK/PD 参数（直接测量值，无需换算）──
  aspirin_elimination:
    type: pk
    value: 0.198                # ke = 0.693 / t½ = 0.693 / 3.5h
    unit: 1/hour
    reference: "..."
```

**Loader 换算规则汇总：**

| `type` | 换算 | 必填辅助字段 |
|--------|------|------------|
| `rr` | `effective = value` | — |
| `or` | `effective = OR / ((1−p₀) + p₀×OR)` | `baseline_prevalence` |
| `hr` | `effective = baseline_ir × HR` | `baseline_ref` |
| `ard` | `effective = value` | — |
| `cohens_d` | `effective = d × population_sd` | `population_sd` |
| `ir` | `effective = value` | — |
| `beta` | `effective = value` | — |
| `pk` | `effective = value` | — |

**仿真中的确定性处理**（不做随机采样）：

```
生存率(t) = ∏(1 − ir_effective × step_size)
```

直接得到期望存活率确定性轨迹，可重现，足够用于 Pareto 优化。


## 双环优化架构

LM 的优化体系由两个独立的优化环构成，目标和实现工具完全不同：

### 外环：Regimen 搜索（当前主攻，Simulator 实现）

| 项目       | 说明                                    |
| -------- | ------------------------------------- |
| **搜索对象** | `input` 变量的 Regimen 计划（时刻、剂量、执行天、有效期） |
| **目标**   | 寻找令 `state` 输出最优的行为/用药方案              |
| **算法**   | NSGA-II / MOPSO（多目标进化算法）              |
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

> 对应需求 F-1；架构决策见 ADR 0074。

### 概念

GUI Working State Layer 是 Sim 面板中 `inputEvents[]` 的集合——它是用户可见、可编辑的输入配置，代表"本次仿真实际使用什么值"。**它的优先级永远高于 YAML schedule。**

```
加载流程：
  YAML 文件 → Loader 解析 → inputEvents（GUI 工作状态）← 用户编辑 / Opt 结果注入
                                     ↓
                              引擎 session 启动
                                     ↓
              manual_overrides ← GUI 受控变量列表（禁止 YAML schedule 覆盖）
                                     ↓
                              每步：_apply_regimens（GUI 值）
                              每步：model.step() → _apply_schedules（跳过 manual_overrides 里的变量）
```

### 优先级规则

| 来源 | 优先级 | 适用范围 |
|------|--------|---------|
| GUI inputEvents（`_apply_regimens`） | **高** | 有 GUI regimen 的 input 变量 |
| YAML schedule（`_apply_schedules`） | 低（被跳过） | GUI 受控变量自动跳过 |
| YAML schedule（`_apply_schedules`） | **高**（正常应用） | 没有 GUI regimen 的变量 |

关键：`_apply_schedules` 内已有 `manual_overrides` 跳过机制（[simulation.py:74](../sim_engine/src/model_structure/simulation.py#L74)）。引擎改动只需在 session 启动时，将有 GUI regimen 的变量写入 `model.manual_overrides`。

### 初始化规则

| 事件 | inputEvents（GUI 层）的变化 |
|------|--------------------------|
| 加载新模型 | 从 `simulation.schedules` 解析，填充 inputEvents |
| 加载含 `optimizer.results.reference.regimen` 的模型 | 询问用户是否预填推荐解，选"是"则覆盖对应 inputEvents |
| Opt 完成，用户点击"以此解运行仿真" | 按 `optimizer.schedules` 决策变量映射将解的 `x` 写入 inputEvents |
| 用户手动编辑 | 直接修改 inputEvents |

### F-MPLAN 扩展

多方案时，每个 Plan 有独立的 `inputEvents[]`，对应独立的 session。每个 session 各自有 `manual_overrides`，方案间隔离，互不影响。

---

## Opt → Sim：N-N 重组架构

> 对应需求 F-5、F-2、F-3。

### 设计原则

Opt 产出 N 组输入组合（Pareto 前沿）；Sim 是下游，必须能接住 N 组。软件层负责重组，Opt 结果保持原始格式（`{x, f}` 向量）。

```
YAML: optimizer.schedules       pareto_front[i].x
（含 optimize: 的决策变量）              ↓
           ↓           xToInputEvents(x, optimizerSchedules, baseInputEvents)
                                        ↓
                           Plan[i].inputEvents[]   →   独立 session → 仿真曲线 i
```

### xToInputEvents 函数

**职责**：将 Pareto 解的 `x` 向量还原为 Sim 可执行的 `InputEvent[]`。

**输入**：
- `x: number[]` — 某个 Pareto 解的决策变量值
- `optimizerSchedules: object[]` — 当前 YAML 中 `optimizer.schedules` 中含 `optimize:` 块的条目列表
- `baseInputEvents: InputEvent[]` — 当前 Sim 的基础 inputEvents（提供 `days`、`valid_range_enabled` 等非优化字段）

**映射规则**（与 Python 后端构建 x 向量的顺序完全一致）：

```
对 optimizer.schedules 中有 optimize: 块的条目（按列表顺序）:
  按启用的 Tier 依次贡献维度：T1(value) + T2(time_slot) + T3(days_combo) + T4(date_offsets)
  x[idx++] → 匹配 variable=varName AND time=event.time 的 baseInputEvent，更新对应字段
```

**输出**：返回新的 `InputEvent[]`，只更新了 `optimizeValue=true` 事件的 value，其余字段不变。

**调用场景**：

| 场景 | 调用方式 |
|------|---------|
| 加载模型，预填推荐解 | `xToInputEvents(reference.x, yaml.optimizer.schedules, current)` |
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
1. 界面显示Pareto散点图
2. 用户点击某个点 → 右侧展示该方案对应的具体Regimen时间表
3. 用户可拖动"偏好滑条"（偏向哪个目标更重要）→ 系统高亮推荐点
4. 用户导出选中的Regimen → 可导出为iCal格式（直接导入手机日历）

## 仿真/优化: 界面规划
### 核心设计理念

**Opt内嵌于Sim界面**：不是两个独立Tab，而是在Sim界面顶部有一个"优化模式"开关。开启后，输入区域的常数输入框变为范围输入框（可锁定或优化），其余布局不变。

### 整体布局（三列式）
```
┌─────────────────────────────────────────────────────────────────┐
│  [Story选择器]  [仿真时长]  [步长]    [ 🔀 优化模式 OFF/ON ]    │
├─────────────────┬───────────────────────┬───────────────────────┤
│                 │                       │                       │
│  左列：输入区   │  中列：仿真曲线区     │  右列：元数据区       │
│                 │                       │                       │
│  Variables      │  实时/结果曲线图      │  模型引用文献         │
│  Regimens       │  （多变量叠加）       │  参数来源             │
│  Evidence       │                       │  约束状态显示         │
│  （只读）       │                       │  （绿/红指示）        │
│                 │                       │                       │
├─────────────────┴───────────────────────┴───────────────────────┤
│  [▶ 运行仿真]  [⏸ 暂停]  [⏹ 停止]     进度条 ████████░░ 80%   │
└─────────────────────────────────────────────────────────────────┘
```

### 左列：输入区详细设计

#### 普通仿真模式（Opt关闭）

左列分三个折叠块：VARIABLES（初始状态值）、REGIMENS（干预计划列表）、EVIDENCE（只读文献值）。Parameters 面板属于 Modeller 工具（待实现），不在 Simulator 中显示。

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

#### 优化模式（Opt开启后，Regimen 各维度出现锁定/优化切换）

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
│  │ 每周: 🔀 至少 [3] 天（优化选择哪几天）       │  │← 天数搜索
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

### 中列：曲线区详细设计

#### 普通仿真模式

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

#### 优化模式（优化运行中）

```
┌─── 优化进度 ────────────────────────────────────┐
│  Generation 45/200  ████████░░░░░░░  种群收敛中  │
└─────────────────────────────────────────────────┘

┌─── Pareto前沿（实时更新）─────────────────────────┐
│  目标1: liver_fat减少量（↑更好）                  │
│   ↑                                              │
│   │        *  *                                  │
│   │      *                                       │
│   │    *                                         │
│   │  *                                           │
│   └────────────────────→ 目标2: ALT峰值（←更好）  │
│                                                  │
│  [点击某个点查看该Regimen详情]                    │
└───────────────────────────────────────────────────┘

┌─── 选中方案的Regimen预览 ─────────────────────────┐
│  当前选中：方案 #37                               │
│  exercise: 周一三五  07:00-08:00  强度0.72        │
│  预测结果: 肝脂↓42%  ALT峰值98 U/L               │
│  [导出为iCal] [设为当前仿真参数]                  │
└───────────────────────────────────────────────────┘
```

### 右列：元数据区

```
┌─── 模型信息 ──────────────────────┐
│ fat_metabolism v1.2               │
│ 📄 Donnelly et al. 2009          │
│ 📄 Promrat et al. 2010           │
│                                   │
│ glucose_metabolism v0.8           │
│ 📄 Bergman 1981 (Minimal Model)  │
└───────────────────────────────────┘

┌─── 约束状态 ──────────────────────┐
│ ✅ alt_enzyme_level < 120         │
│ ✅ weekly_exercise ≥ 60 min       │
│ ⚠️  muscle_mass 接近下限         │
└───────────────────────────────────┘

┌─── 参数置信度 ────────────────────┐
│ exercise_effect  ★★★★☆ 中高       │
│ fat_accumulation ★★★☆☆ 中等       │
│ alt_response     ★★☆☆☆ 较低       │
└───────────────────────────────────┘
```

---

> YAML 模型格式规范见 [`model_design.md`](model_design.md)。

## 优化目标与方法

### 可选优化目标

在 `story.yaml` 的 `optimizer.targets` 中定义：

| 目标名 | 含义 | 典型场景 |
|--------|------|---------|
| `max_longevity` | 寿命最长 | 慢性病健康仿真 |
| `max_wealth` | 财富最大 | 职业路径经济仿真 |
| `max_qol` | 生活品质最高 | 交互式人生模拟 |
| `max_career` | 事业最成功 | 职业影响力仿真 |
| `max_social_impact` | 社会影响力最大 | 传染病/政策仿真 |
| `max_sustainability` | 环境可持续性最高 | 碳足迹/生态仿真 |

多目标组合通过 Pareto 前沿输出权衡解集。

### 优化方法对比

| 方法 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| **加权和法** | 最简单，计算快 | 权重需人工设定，遗漏非凸区域 | 入门，快速验证 |
| **NSGA-II** | 完整 Pareto 解集，处理非凸 | 计算密集，收敛慢 | 多目标平衡，科研分析 |
| **ε-约束法** | 约束控制精确，解均匀 | 需多次求解，对 ε 敏感 | 约束明确的单指标优化 |
| **MOPSO** | 全局搜索强，收敛快 | 易陷局部最优 | 并行计算场景 |
| **MORL** | 适应动态环境 | 训练不稳定，样本效率低 | 长期动态决策 |

推荐顺序：加权和法跑通流程 → NSGA-II（`pymoo` 库）→ MORL（动态交互时）。
