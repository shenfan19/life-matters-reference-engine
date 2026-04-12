# LifeMatters 建模设计手册 (Model Design Guide)

本手册详细介绍了如何为 LifeMatters 仿真框架设计和编写模型。文档分为两大部分：**入门教程**（面向研究者）和**技术参考**（面向开发者）。

---

## 第一部分：入门教程 (快速上手)

**面向对象**：医学/社会学研究者  
**核心理念**：像“填表”一样建模，无需编程。

### 1.1 最小模型示例
一个完整的生命动力学模型只需简单的 YAML 配置：

```yaml
# mods/core/aspirin.yaml
metadata:
  name: aspirin_pharmacology
  description: 阿司匹林吸收与疼痛缓解模型

variables:
  blood_aspirin:
    description: 血药浓度
    value: 0.0
    type: state      # 随时间变化的变量
    unit: mg/L
  
  dose:
    description: 单次剂量
    value: 500
    type: input      # 用户输入的参数
    unit: mg

formulas:
  absorption:
    description: 药物吸收过程
    dynamics:
      blood_aspirin: blood_aspirin + dose * 0.8 * (dt / 3600)
```

### 1.2 变量类型速查
| 类型 | 用途 | 示例 |
|------|------|------|
| `state` | **状态变量**：由于动力学方程而随时间变化的量 | 血糖浓度、心率 |
| `input` | **输入变量**：仿真过程中可由用户调节的控制量 | 每日抽烟数、给药剂量 |
| `parameter` | **参数**：模型的固有系数，通常用于优化算法寻找最优解 | 吸收率、代谢半衰期 |

---

## 第二部分：技术参考 (深度规范)

**面向对象**：系统开发者、高级建模者  
**版本**: v3.1 (核心规范)

### 2.1 统一 YAML Schema
所有模型文件必须遵循以下结构：

```yaml
type: model | story              # 显式定义文件类型
category: physiological | socio_economic | environmental | risk | simple  # 通用动力学大类

## 2.1.1 通用动力学大类详解 (Universal Categories)
| 大类 | 描述 | 核心动力学示例 |
|------|------|---------------|
| `physiological` | 生理与医学动力学 | 血糖调节 (Diabetes), 病毒载量 (Flu) |
| `socio_economic` | 社会经济动力学 | 劳动力生产率 (Labor), 分配与积累 |
| `environmental` | 环境与自然动力学 | 灾害强度 (Disaster), 重建进度 |
| `risk` | 风险与对抗动力学 | 战争压力 (War), 冲突烈度 |
| `simple` | 简易教学/演示动力学 | 香蕉生长 (Banana), 面条烹饪 (Noodle) |

### 2.2 单文件封装原则 (Single File Rule)
为了确保模型的便携性和自适应转化，所有生命动力学模型（Models）应遵循**单文件化指标**：
- **无外部依赖**：模型内除基础生理常数外，应尽量减少对其他 YAML 的 `import`。
- **自足性**：`variables` 和 `formulas` 应包含该动力学过程完整的闭环逻辑。
- **命名规范**：文件名即为场景名（如 `flu.yaml`, `banana.yaml`）。

metadata:
  name: "唯一标识符"
  version: "1.0.0"
  tags: [tag1, tag2]

imports:                          # 递归导入依赖
  - base_physiology

variables:
  var_name:
    type: input | state | parameter
    value: 0.0
    unit: "unit"
    bounds: [min, max]
    optimizable: true | false     # 是否对优化器可见
    io_role: input | output | intermediate # UI 与 IO 语义

formulas:
  formula_name:
    condition: "expression"       # 只有满足条件时公式才生效
    priority: 0                   # 执行顺序 (-100 到 100)
    dynamics:                     # 动力学更新 (dt 驱动)
      var: "expression"
    formula: "expression"         # 静态指标计算 (与 dynamics 二选一)
```

### 2.2 时间步长与 time_unit 设计

#### 2.2.1 time_unit 字段

不同动力学模型的自然时间尺度差异很大（分钟级生理过程 vs 年级社会演化）。在 `simulator` 节中用 `time_unit` 声明步长单位，消除歧义：

```yaml
simulator:
  step_size: 1        # 每步 1 个 time_unit
  time_unit: minute   # second | minute | hour | day | week | month | year
  total_time: 1440    # 1440 分钟 = 24 小时
```

| 字段 | 含义 | 默认 |
|------|------|------|
| `step_size` | 每步时长，单位为 `time_unit` | 1 |
| `time_unit` | 步长的时间单位 | `second`（向后兼容） |
| `total_time` | 仿真总时长，单位同 `time_unit` | — |

**引擎内部**：`self.time` 始终以**秒**存储，`step_size_sec = step_size × TIME_UNIT_SECONDS[time_unit]`，确保 accumulator 窗口（day/week/month）的跨尺度一致性。

#### 2.2.2 公式中的 dt 与 t

公式表达式中可用的时间变量（单位均为 `time_unit`）：

| 变量 | 含义 |
|------|------|
| `dt` / `step_size` | 当前步长（= YAML 中的 `step_size`） |
| `t` / `time` | 当前仿真时间 |

```yaml
# time_unit: minute 时，dt=1 代表 1 分钟，time 以分钟计
dynamics:
  blood_glucose: blood_glucose + (uptake - utilization) * dt
  circadian_offset: 5 * sin(t * 3.14159 / 720)   # 720 分钟 = 12 小时
```

#### 2.2.3 预定义时间常量（辅助单位换算）

当 `time_unit: second` 时，可用以下常量避免硬编码：

| 常量 | 值（秒） |
|------|---------|
| `SECOND` | 1 |
| `MINUTE` | 60 |
| `HOUR` | 3600 |
| `DAY` | 86400 |

```yaml
# time_unit: second 时
dynamics:
  liver_damage: liver_damage + dose * 0.001 * (dt / HOUR)
```

---

### 2.3 积分方案：统一 Euler 离散形式（永久设计决策）

#### 结论

**本框架永久采用统一的 Euler 离散明文表达，所有动力学公式直接写出下一时刻的值。不引入 ODE/explicit 类型区分，不引入 RK4、RK45 等高阶积分器。**

#### 设计原则

**直观明文原则**：建模者在 `dynamics` 中写什么，引擎就赋什么值，没有隐藏的求值阶段。公式即文档，所见即所得。

```yaml
# 状态随时间演化：写出"下一刻 = 当前 + 本步变化"
blood_glucose: blood_glucose + (uptake - utilization) * dt

# 时间函数：直接写出当前时刻的值
circadian_offset: 5 * sin(t * 3.14159 / 720)

# 二阶系统：拆成两个一阶方程
position: position + velocity * dt
velocity: velocity + (force - damping * velocity - k * position) * dt
```

所有写法形式统一，引擎直接赋值。无需区分"ODE"与"Explicit"，也无需理解积分器内部逻辑。

#### 为什么不需要高阶积分器

**模型误差主导**：生理与社会学模型的参数不确定性在 ±10%～±50% 量级，Euler 在分钟～天级步长下的截断误差远低于此。高阶积分器在数值精度上的提升对仿真结果无可见影响。

**离散事件破坏光滑性假设**：RK4/RK45 的精度优势依赖步长内动力学光滑。生理与社会模型中充满进餐、用药、睡眠切换、灾害等离散事件，不连续点处高阶方法退化，无优势可言。

**直觉代价不可接受**：高阶积分器要求公式写成纯速率形式（去掉 `* dt`），引擎在内部完成多阶段求值。这破坏了"明文时间表达"原则，建模者无法直接看到每步的状态变化，调试和理解成本大幅上升。

综合以上三点，对本框架的目标场景（教育游戏、生理仿真、社会动力学），Euler 离散形式是永久最优解，无需也不应当迁移到其他积分方案。

### 2.3 分层约束规则 (Validation)
1. **Model (模型)**: 只能 `import` 其他 Model，严禁引用 Story。
2. **Story (故事)**: 用于组合 Model 并配置具体场景，允许包含 `optimizer` 配置。
3. **循环检测**: `LoaderEngine` 会自动检查并阻止循环导入。

---

## 第三部分：每日输入与多尺度积分

### 3.1 每日输入 (daily_inputs)

`daily_inputs` 是 `schedules` 的用户友好替代格式，以**天**为单位指定输入值变化，引擎自动转换为秒级时间戳。

```yaml
daily_inputs:
  cigarettes:
    interpolation: step      # 'step'（阶梯）或 'linear'（线性插值）
    values:
      - { day: 1,  value: 20 }   # 第 1 天起：每天 20 支
      - { day: 8,  value: 10 }   # 第 8 天起：减为 10 支
      - { day: 30, value: 0  }   # 第 30 天起：戒烟
```

- `day: 1` 对应仿真时间 `t = 0s`（第一天开始）
- `day: N` 对应 `t = (N-1) × 86400s`
- 与 `schedules:` 同名条目时，`daily_inputs` 优先覆盖

### 3.2 累积器 (accumulators)

`accumulators` 可将任意 `input` 或 `state` 变量，按天/周/月窗口自动积分，生成多尺度汇总变量。

```yaml
accumulators:
  weekly_cigarettes:
    source: cigarettes        # 来源变量（必填）
    window: week              # 窗口类型：'day' | 'week' | 'month'
    operation: sum            # 操作：'sum'（总量）或 'mean'（均值）
    unit: cigs/week
    description: 每周吸烟总量

  monthly_avg_cigarettes:
    source: cigarettes
    window: month
    operation: mean           # 月均每日抽烟数
    unit: cigs/day
    description: 每月平均每日吸烟量
```

**输出变量**：若 `weekly_cigarettes` / `monthly_avg_cigarettes` 未在 `variables:` 中定义，引擎自动创建为 `state` 类型变量，在每个窗口边界时刻写入结果。

### 3.3 积分数学原理

设来源变量值为 `V`（单位：per day），仿真步长为 `dt`（秒），则每步贡献：

```
contribution = V × (dt / 86400)
```

| 窗口 | 步长 1h，常量 V=20 | 结果 |
|------|-------------------|------|
| 日总量 (sum)  | 20 × (3600/86400) × 24步 | **20** |
| 周总量 (sum)  | 20 × (3600/86400) × 168步 | **140** |
| 周均值 (mean) | 周总量 ÷ 7 | **20**（= 每日值）|

这一公式对任意步长（1秒、1小时、1天）均给出一致的结果。

### 3.4 完整示例

```yaml
metadata:
  name: smoking_impact_model
  version: 1.0.0

variables:
  cigarettes:
    description: 每日吸烟数量
    value: 20
    type: input
    unit: cigs/day

daily_inputs:
  cigarettes:
    interpolation: step
    values:
      - { day: 1,  value: 20 }
      - { day: 8,  value: 10 }

accumulators:
  weekly_cigs:
    source: cigarettes
    window: week
    operation: sum
    unit: cigs/week

  monthly_avg_cigs:
    source: cigarettes
    window: month
    operation: mean
    unit: cigs/day

simulator:
  step_size: 3600   # 1 小时步长
  output_variables: [cigarettes, weekly_cigs, monthly_avg_cigs]
```

---

## 第四部分：最佳实践

1. **单一职责**: 一个 YAML 文件应只专注一个生理或系统过程。
2. **可读性**: 使用 `description` 字段引用参考文献（如：`ref: Goodman & Gilman 2018`）。
3. **验证**: 发布前请运行 `lifematters-loader --validate <file>` 确保 Schema 正确。
4. **步长一致性**: 使用 `daily_inputs` 时，任意步长（秒/小时/天）均可正确积分，无需手动调整。

---

## 第五部分：模型分类体系

> 详细决策见 ADR [0022](../decisions/0022-models-three-level-taxonomy.md)。本节为实用速查。

### 5.1 三层目录规则

所有模型文件放在 `mods/models/` 下，按**三层**组织：

```
mods/models/
  L1 (领域)  / L2 (学科)  / L3 (细分方向)  / file.yaml
  medical    / nutrition  / food           / banana_physiology.yaml
  social     / economy    / labor          / labor_daily.yaml
```

**L3 不强制**：仅当 L2 目录内文件类型明显多元（≥2种方向）时才增加 L3。

### 5.2 完整分类表

| L1 | L2 | L3 | 说明 |
|----|----|----|------|
| medical | physiology | —（扁平）| 生理库组件，被其他模型 import |
| medical | nutrition | food | 单一食材的营养与代谢 |
| medical | nutrition | diet | 饮食模式、历史饮食、干预方案 |
| medical | fitness | individual | 个人耐力项目（跑步、游泳） |
| medical | fitness | team | 团队运动（篮球、足球） |
| medical | fitness | racket | 球拍运动（网球、乒乓球） |
| medical | disease | metabolic | 代谢性疾病（糖尿病、肥胖） |
| medical | disease | chronic | 慢性病（肝病、高血压、CKD） |
| medical | disease | acute | 急性病（流感等短期发作） |
| medical | disease | infectious | 传染病（传播动力学） |
| medical | disease | mental | 心理健康疾病 |
| medical | disease | genetic | 遗传病 |
| medical | medicine | pharmacology | 药代动力学、药物吸收 |
| medical | medicine | therapy | 治疗方案与干预协议 |
| medical | medicine | preventive | 预防医学、疫苗 |
| medical | surgery | orthopedic | 骨科手术 |
| medical | surgery | cardiovascular | 心血管手术 |
| medical | surgery | general | 普外科 |
| social | economy | labor | 劳动力与生产率 |
| social | economy | market | 市场与供需动力学 |
| social | economy | finance | 金融、财政、资本积累 |
| social | conflict | war | 武装冲突动力学 |
| social | conflict | disaster | 自然灾害与重建 |
| social | conflict | civil | 社会动乱、骚乱 |
| social | law | policy | 政策与法规影响 |
| social | law | criminal | 犯罪与司法 |
| social | law | civil | 民事与产权 |
| social | psychology | panic | 群体恐慌与传播 |
| social | psychology | behavior | 个体行为决策 |
| social | psychology | cognition | 认知与学习动力学 |
| social | technology | innovation | 技术发明与扩散 |
| social | technology | infrastructure | 基础设施发展 |
| social | technology | digital | 数字化与信息传播 |
| social | demography | population | 人口增长模型 |
| social | demography | mortality | 死亡率动力学 |
| social | demography | migration | 人口迁移 |

### 5.3 import 路径规范

跨目录引用必须从 `mods/` 根出发，加 `models/` 前缀：

```yaml
# ✅ 正确（在任意位置的模型中均可解析）
imports:
  - models/medical/physiology/glucose_regulation

# ⚠️ 仅在同目录文件中可用（loader 先搜当前目录）
imports:
  - glucose_regulation

# ❌ 错误（缺少 models/ 前缀，loader 当作相对路径处理）
imports:
  - medical/physiology/glucose_regulation
```

### 5.4 standalone 标注

| 字段 | 含义 | 典型位置 |
|------|------|----------|
| `standalone: true`（或省略）| 可独立运行，有完整 `simulator` 配置 | nutrition/food, fitness/\*\* |
| `standalone: false` | 库组件，需被其他模型 import 才有意义 | physiology/\*, disease/metabolic/\*_core |

---
*最后更新：2026年4月*
