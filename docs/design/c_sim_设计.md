# 软件设计
## 仿真/优化: 数学结构
- [ ] 核心在这里更新 [priority:: high] 
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
iCal对应关系详见 c_matter_task_3 §1.2。**工具价值**：用户可以在手机日历App里直接设计自己的行为计划，导出iCal后一键导入LM仿真。这是一个独立的易用性贡献，适合放在Paper 1的附录或作为开源工具。

### 概率事件参数（随机场景的处理）

随机事件（战死、手术风险、疾病发作）不通过蒙特卡洛模拟，而是以**概率常数**纳入模型动力学，以期望值轨迹运行仿真：

```yaml
# 概率事件参数，不进入优化搜索空间，只影响模型动力学
probability_params:
  combat_death_rate:
    description: "参战时日死亡概率"
    value: 0.008          # 索姆河战役：约0.8%/天
    unit: "prob/day"
    reference: "Prior 1992, Historical Journal"
    type: probability_constant  # 区别于普通参数

  surgery_mortality:
    description: "手术死亡概率（单次事件）"
    value: 0.03           # 3%，来自文献
    unit: "prob/event"
    reference: "相关外科文献"
    type: probability_constant

  disease_incidence:
    description: "某病年发病率"
    value: 0.05           # 5%/年
    unit: "prob/year"
    type: probability_constant
```

**在仿真中的处理方式**：

```
生存率轨迹 = ∏(1 - death_rate_per_step × step_size)
```

不需要随机采样，直接得到期望存活率的确定性轨迹。这比蒙特卡洛更快，且结果可重现，足够用于Pareto优化。


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
│  Parameters     │  （多变量叠加）       │  参数来源             │
│  Regimens       │                       │  约束状态显示         │
│  Prob.Constants │                       │  （绿/红指示）        │
│                 │                       │                       │
├─────────────────┴───────────────────────┴───────────────────────┤
│  [▶ 运行仿真]  [⏸ 暂停]  [⏹ 停止]     进度条 ████████░░ 80%   │
└─────────────────────────────────────────────────────────────────┘
```

### 左列：输入区详细设计

#### 普通仿真模式（Opt关闭）

左列分三个折叠块：VARIABLES（初始状态值）、REGIMENS（干预计划列表）、PROBABILITY CONSTANTS。

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

┌─── PROBABILITY CONSTANTS ──────────────────────────┐
│  （只读，影响动力学但不进入优化）                  │
│  combat_death_rate   0.008 / day                   │
│  surgery_mortality   0.03  / event                 │
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
```

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

## YAML 建模规范

> 面向建模者的完整 YAML 格式规范。引擎实现细节见 `c_sim_实现.md`。

### 变量类型（5 种）

| 类型 | 引擎读取 | 建模者填入 | 用途 |
|------|---------|----------|------|
| `state` | `value`（随时间更新） | 初始值 | 随时间演化的状态变量 |
| `input` | `value`（用户可调） | 控制量 | 用户干预量 |
| `parameter` | `value`（不变） | 最终系数 | **直接进公式**的动力学系数（PK速率、方程斜率等） |
| `probability_constant` | `value`（不变） | 概率值 | 随机事件概率，以期望值运行（发病率、病死率等） |
| **`evidence_param`** | `_effective_value`（**Loader 自动换算**） | **原始文献值** | 流行病学效应量（OR / HR / Cohen's d 等），Loader 换算后才进公式 |

`probability_constant` 放在 `probability_params:` 节下；`evidence_param` 放在 `evidence_params:` 节下。

**`parameter` vs `evidence_param` 的判断准则：**
- 文献直接给你一个可以放进公式的数（吸收率 0.8、衰减系数 0.02）→ `parameter`
- 文献给你的是统计效应量（OR=1.65、HR=0.82、d=0.68），需要换算才能进公式 → `evidence_param`

---

### 医学证据类型与变量映射

`evidence_param` 由 Loader 在组装阶段自动换算，Simulator 只见换算后的 `_effective_value`。完整规范见 `decisions/0040`。

| 效应量 | `evidence_type` 值 | Loader 换算公式 | 必填辅助字段 |
|--------|------------------|---------------|------------|
| **RR**（相对风险） | `relative_risk` | `effective = value` | — |
| **OR**（比值比） | `odds_ratio` | `effective = OR / ((1−p₀) + p₀×OR)` | `baseline_prevalence` |
| **HR**（风险比） | `hazard_ratio` | `effective = baseline_rate × HR` | `baseline_rate_ref` |
| **ARD**（绝对风险差） | `absolute_risk_difference` | `effective = value` | — |
| **ES / Cohen's d** | `effect_size` | `effective = d × population_sd` | `population_sd` |
| **IR**（发病率） | `incidence_rate` | `effective = value` | — |
| **PK/PD 参数** | `pk_rate_constant` 等 | `effective = value` | — |

患病率（Prevalence）直接设为对应 `state` 变量的初始 `value`，不需要 `evidence_param`。

---

### 完整 YAML Schema

```yaml
type: model | story
category: physiological | socio_economic | environmental | risk | simple

metadata:
  name: "唯一标识符"
  version: "1.0.0"
  tags: [tag1, tag2]
  references: ["Author et al. (Year) Title. Journal."]

imports:
  - models/medical/physiology/glucose_regulation   # 从 mods/ 根出发加 models/ 前缀

variables:
  var_name:
    type: input | state | parameter
    value: 0.0
    unit: "unit"
    bounds: [min, max]
    optimizable: true | false
    io_role: input | output | intermediate    # UI 与 IO 语义
    description: "说明（用于报告）"
    reference: "文献来源"

probability_params:
  param_name:
    value: 0.008
    unit: "prob/day"              # prob/day | prob/event | prob/year
    description: "说明"
    reference: "文献来源"
    type: probability_constant

evidence_params:
  # 流行病学效应量：建模者填原始文献值，Loader 自动换算为 _effective_value
  smoking_lung_cancer_rr:
    evidence_type: relative_risk  # relative_risk | odds_ratio | hazard_ratio |
                                  # absolute_risk_difference | effect_size |
                                  # incidence_rate | regression_coefficient |
                                  # pk_rate_constant | pk_volume |
                                  # pd_emax | pd_ec50 | pd_hill
    value: 2.7                    # 原始文献值（不需要手动换算）
    unit: "RR"
    reference: "文献来源"
    # OR 必填辅助字段:
    # baseline_prevalence: 0.23
    # HR 必填辅助字段:
    # baseline_rate_ref: "对应 probability_constant 的变量名"
    # effect_size 必填辅助字段:
    # population_sd: 0.5          # 参考人群 SD（与 unit 同单位）

formulas:
  formula_name:
    condition: "expression"       # 条件满足时才执行
    priority: 0                   # 执行顺序（-100 到 100，小值先执行）
    dynamics:                     # 动力学更新（dt 驱动），与 formula 二选一
      var: "expression"
    formula: "expression"         # 静态指标计算（不依赖 dt）
    description: "说明"
    reference: "文献来源"

simulator:
  step_size: 1
  time_unit: minute               # second | minute | hour | day | week | month | year
  total_time: 1440
  output_variables: [var1, var2]
```

---

### 时间与步长

`time_unit` 消除步长歧义；公式中 `dt` 和 `t` 单位均为 `time_unit`：

| 变量 | 含义 |
|------|------|
| `dt` / `step_size` | 当前步长（= YAML 中的 `step_size`） |
| `t` / `time` | 当前仿真时间 |

`time_unit: second` 时可用预定义常量：`SECOND=1`、`MINUTE=60`、`HOUR=3600`、`DAY=86400`。

---

### Euler 离散积分（永久决策）

**本框架永久采用统一 Euler 离散明文表达，直接写出下一时刻的值，不引入 RK4 等高阶积分器。**

```yaml
dynamics:
  blood_glucose: blood_glucose + (uptake - utilization) * dt
  position: position + velocity * dt
  velocity: velocity + (force - damping * velocity) * dt
```

理由：生理/社会模型参数不确定性 ±10–50%，Euler 截断误差远低于此；离散事件（进餐、用药）破坏高阶积分器精度优势；明文表达所见即所得。

---

### daily_inputs 与 accumulators

`daily_inputs` 以天为单位指定输入值，引擎自动转秒级时间戳：

```yaml
daily_inputs:
  cigarettes:
    interpolation: step       # step（阶梯）| linear（线性插值）
    values:
      - { day: 1,  value: 20 }
      - { day: 8,  value: 10 }
      - { day: 30, value: 0  }
```

`accumulators` 按天/周/月窗口自动积分：

```yaml
accumulators:
  weekly_cigarettes:
    source: cigarettes
    window: week              # day | week | month
    operation: sum            # sum | mean
    unit: cigs/week
```

每步贡献 = `V × (dt / 86400)`，对任意步长均一致。

---

### 分层约束

1. **Model**：只能 `import` 其他 Model，严禁引用 Story。
2. **Story**：组合 Model 并配置场景，允许 `optimizer` 配置和 `patches`。
3. **循环检测**：`LoaderEngine` 自动阻止循环导入。

---

### 模型分类体系

三层目录：`mods/models/{L1}/{L2}/{L3}/file.yaml`

| L1 | L2 | 说明 |
|----|----|----|
| medical | physiology / nutrition / fitness / disease / medicine / surgery | 生理与医学 |
| social | economy / conflict / law / psychology / technology / demography | 社会经济与社会学 |

完整 L3 细分见 `docs/decisions/0022-models-three-level-taxonomy.md`。

`standalone: true`（或省略）= 可独立运行；`standalone: false` = 库组件，需被 import。

---

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
