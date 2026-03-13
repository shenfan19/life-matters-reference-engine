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

### 2.2 时间步长 (dt) 处理机制
在表达式中，`dt` 代表仿真步长（秒）。建议结合预定义的常量以确保跨尺度一致性：
- `HOUR` = 3600
- `DAY` = 86400

**正确示例**: `blood_glucose: blood_glucose - rate * (dt / HOUR)`

### 2.3 分层约束规则 (Validation)
1. **Model (模型)**: 只能 `import` 其他 Model，严禁引用 Story。
2. **Story (故事)**: 用于组合 Model 并配置具体场景，允许包含 `optimizer` 配置。
3. **循环检测**: `LoaderEngine` 会自动检查并阻止循环导入。

---

## 第三部分：最佳实践

1. **单一职责**: 一个 YAML 文件应只专注一个生理或系统过程。
2. **可读性**: 使用 `description` 字段引用参考文献（如：`ref: Goodman & Gilman 2018`）。
3. **验证**: 发布前请运行 `lifematters-loader --validate <file>` 确保 Schema 正确。

---
*最后更新：2025年3月*
