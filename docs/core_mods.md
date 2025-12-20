# Core层模型规范

**面向用户**: 医学/社会学研究者  
**前置知识**: 基本YAML语法

---

> **一句话总结**: Core层是纯科学模型，用YAML配置定义变量和动力学方程，像"填表"一样建模。

---

## 🎯 设计目标

- ✅ **零编程**: 只需填写YAML配置，无需写代码
- ✅ **纯科学**: 只包含药理/生理动力学，不含历史信息
- ✅ **可重现**: 模型可被其他研究者验证和引用
- ✅ **易协作**: 通过Git管理，支持多人编辑

---

## 📝 最小示例

这是一个完整的Core层模型：

```yaml
# mods/core/aspirin.yaml
metadata:
  name: aspirin_pharmacology
  version: 1.0.0
  author: Medical Research Team
  description: Aspirin absorption and pain relief

variables:
  blood_aspirin:
    description: Blood concentration
    value: 0.0
    type: state
    unit: mg/L
    bounds: [0, 500]
  
  dose:
    description: Single dose
    value: 500
    type: input
    unit: mg

formulas:
  absorption:
    description: First-pass absorption
    dynamics:
      blood_aspirin: blood_aspirin + dose * 0.8 * (dt / 3600)

simulator:
  step_size: 60        # 1 minute
  total_time: 21600    # 6 hours
```

**就这么简单！** 保存后即可在Simulator中运行。

---

## 🧱 文件结构

### 必需部分

每个Core模型必须包含：

```yaml
metadata:      # 模型信息
variables:     # 变量定义
formulas:      # 动力学方程
```

### 可选部分

```yaml
imports:       # 导入其他模型
simulator:     # 仿真配置（如缺失，使用默认值）
optimizer:     # 优化配置（仅优化时需要）
```

---

## 📊 Metadata - 元数据

**目的**: 描述模型信息，便于管理和引用

```yaml
metadata:
  name: model_name              # 模型名称（可选，默认文件名）
  version: 1.0.0                # 版本号（推荐语义化版本）
  author: Your Name             # 作者
  description: 简短描述          # 模型用途
  tags: [metabolism, diabetes]  # 标签（便于搜索）
```

**注意**:
- `name` 可省略，系统自动使用文件名
- `tags` 用于分类和搜索

---

## 🔢 Variables - 变量

**目的**: 定义模型中的所有变量

### 变量类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `state` | 状态变量（会随时间变化） | 血糖浓度、肺功能 |
| `input` | 输入变量（用户控制） | 每日抽烟数、药物剂量 |
| `parameter` | 参数（可被优化） | 吸收率、代谢系数 |

### 完整示例

```yaml
variables:
  blood_glucose:
    description: Blood glucose level    # 描述
    value: 100.0                        # 初始值
    type: state                         # 类型
    unit: mg/dL                         # 单位
    bounds: [0, 500]                    # 范围（可选）
  
  insulin_dose:
    value: 0
    type: input
    unit: units
  
  absorption_rate:
    value: 0.8
    type: parameter
    bounds: [0.5, 1.0]
```

### 约束规则

- ✅ 变量名只能包含字母、数字、下划线（不能有空格）
- ✅ `value` 必须是数字
- ✅ 如果定义了 `bounds`，`value` 必须在范围内
- ✅ `type` 必须是 `state`、`input` 或 `parameter` 之一

---

## 🧮 Formulas - 公式

**目的**: 定义变量如何随时间变化

### 基本格式

```yaml
formulas:
  formula_name:
    description: 公式描述
    condition: true                    # 执行条件（可选）
    priority: 0                        # 优先级（可选）
    dynamics:
      variable_name: expression        # 更新规则
```

### 示例1：简单衰减

```yaml
formulas:
  lung_damage:
    description: Smoking damages lung capacity
    dynamics:
      lung_capacity: lung_capacity - cigarettes_per_day * 0.1 * dt
```

**解读**:
- 每个时间步 `dt`，肺功能 `lung_capacity` 减少
- 减少量 = 每日抽烟数 × 0.1 × 时间步长

### 示例2：带条件的公式

```yaml
formulas:
  pain_relief:
    description: Aspirin relieves pain when concentration is sufficient
    condition: blood_aspirin > 10      # 只有血药浓度>10时生效
    dynamics:
      pain_level: pain_level - 0.5 * dt
```

### 示例3：多变量更新

```yaml
formulas:
  glucose_regulation:
    description: Insulin regulates glucose
    dynamics:
      blood_glucose: blood_glucose - insulin * glucose_sensitivity * dt
      insulin: insulin - insulin_clearance_rate * dt
```

### 表达式支持

支持基本数学运算：

```yaml
dynamics:
  # 加减乘除
  var1: a + b - c * d / e
  
  # 幂运算
  var2: base ** exponent
  
  # 括号
  var3: (a + b) * (c - d)
  
  # 常见函数（通过asteval）
  var4: sqrt(x**2 + y**2)
  var5: exp(-t / tau)
  var6: sin(2 * pi * f * t)
```

### 优先级（Priority）

当多个公式更新同一变量时，优先级决定执行顺序：

```yaml
formulas:
  absorption:
    priority: -100     # 先执行（负数优先级高）
    dynamics:
      blood_drug: blood_drug + dose * 0.8 * dt
  
  metabolism:
    priority: 0        # 后执行
    dynamics:
      blood_drug: blood_drug * exp(-clearance_rate * dt)
```

**规则**: 
- 优先级范围：-100 到 100
- 数字越小，越先执行
- 默认优先级为 0

---

## 🔗 Imports - 导入其他模型

**目的**: 复用已有模型，避免重复编写

### 基本用法

```yaml
imports:
  - base_physiology
  - glucose_regulation
```

系统会自动加载 `mods/core/base_physiology.yaml` 和 `mods/core/glucose_regulation.yaml`。

### 覆盖规则

当前模型的定义会覆盖导入模型的同名内容：

```yaml
# glucose_regulation.yaml 定义了 insulin_sensitivity = 1.0

# diabetes.yaml
imports:
  - glucose_regulation

variables:
  insulin_sensitivity:
    value: 0.5    # 覆盖原值，糖尿病患者胰岛素敏感性降低
```

### 路径支持

```yaml
imports:
  - physiology/metabolism      # 加载 mods/core/physiology/metabolism.yaml
  - diseases/diabetes          # 加载 mods/core/diseases/diabetes.yaml
```

---

## ⚙️ Simulator - 仿真配置

**目的**: 设置仿真运行参数

```yaml
simulator:
  step_size: 60         # 时间步长（秒）
  total_time: 86400     # 总时长（秒）= 1天
  output_format: csv    # 输出格式
  output_variables:     # 输出哪些变量
    - blood_glucose
    - insulin
```

**可选字段**:
- `step_size`: 默认 1
- `total_time`: 默认 3600（1小时）
- `output_variables`: 默认输出所有 `state` 类型变量

---

## 🎯 Optimizer - 优化配置

**目的**: 自动寻找最佳参数

```yaml
optimizer:
  targets_of_optimization:
    - min_medical_cost       # 最小化医疗费用
    - max_quality_of_life    # 最大化生活质量
  
  variables_to_optimize:
    - drug_dose              # 要优化的参数
    - exercise_time
  
  bounds:
    - [0, 100]               # drug_dose范围
    - [0, 60]                # exercise_time范围
  
  method: nsga2              # 优化算法
  pop_size: 50               # 种群大小
  n_gen: 100                 # 迭代次数
```

**注意**:
- `variables_to_optimize` 中的变量必须是 `parameter` 类型
- `bounds` 顺序必须与 `variables_to_optimize` 一致

---

## ✅ 验证与调试

### 语法检查

保存YAML后，使用命令行验证：

```bash
lifematters-loader --validate mods/core/your_model.yaml
```

如果有错误，系统会生成 `mods/patch/your_model_patch.yaml`，包含缺失变量的占位符。

### 常见错误

**错误1: 变量未定义**
```yaml
formulas:
  damage:
    dynamics:
      lung_capacity: lung_capacity - rate * dt
      # 错误：rate未在variables中定义
```

**解决**: 在 `variables` 中添加 `rate`

**错误2: 类型不匹配**
```yaml
variables:
  age:
    value: "25"    # 错误：字符串，应该是数字
    type: state
```

**解决**: 改为 `value: 25`

**错误3: 缩进错误**
```yaml
variables:
blood_glucose:      # 错误：缩进不对
  value: 100
```

**解决**: 确保使用2个空格缩进

---

## 📚 完整示例：糖尿病模型

```yaml
# mods/core/diabetes.yaml
metadata:
  name: diabetes_model
  version: 1.0.0
  author: Research Team
  description: Type 2 diabetes glucose regulation
  tags: [metabolism, diabetes, glucose]

imports:
  - base_physiology

variables:
  blood_glucose:
    description: Blood glucose concentration
    value: 100.0
    type: state
    unit: mg/dL
    bounds: [0, 500]
  
  insulin:
    description: Blood insulin level
    value: 10.0
    type: state
    unit: μU/mL
    bounds: [0, 100]
  
  glucose_intake:
    description: Dietary glucose intake rate
    value: 0
    type: input
    unit: mg/min
  
  insulin_sensitivity:
    description: Insulin sensitivity coefficient
    value: 0.5
    type: parameter
    bounds: [0.1, 1.0]

formulas:
  glucose_absorption:
    description: Glucose absorbed from diet
    priority: -100
    dynamics:
      blood_glucose: blood_glucose + glucose_intake * dt
  
  insulin_secretion:
    description: Pancreas secretes insulin in response to glucose
    condition: blood_glucose > 100
    dynamics:
      insulin: insulin + (blood_glucose - 100) * 0.01 * dt
  
  glucose_regulation:
    description: Insulin reduces blood glucose
    dynamics:
      blood_glucose: blood_glucose - insulin * insulin_sensitivity * dt
  
  insulin_clearance:
    description: Insulin is cleared from blood
    dynamics:
      insulin: insulin * exp(-0.1 * dt)

simulator:
  step_size: 60
  total_time: 86400
  output_variables:
    - blood_glucose
    - insulin

optimizer:
  targets_of_optimization:
    - min_glucose_variance
  variables_to_optimize:
    - insulin_sensitivity
  bounds:
    - [0.1, 1.0]
  method: grid
```

---

## 🚫 Core层禁止内容

为了保持科学性和可复用性，Core层**不应包含**：

❌ 历史信息（年份、地点）
❌ 社会经济因素（价格、可及性）
❌ 特定人群参数（老年人、儿童）

这些应该放在 [Scenario层](scenarios.md)。

---

## 💡 最佳实践

1. **单一职责**: 一个模型专注一个生理过程（如血糖调节）
2. **变量命名**: 使用清晰的英文命名（如 `blood_glucose` 而非 `bg`）
3. **添加注释**: `description` 字段详细说明变量/公式含义
4. **合理单位**: 统一使用国际单位或常用医学单位
5. **参考文献**: 在 `description` 中注明参数来源

### 示例

```yaml
variables:
  aspirin_clearance_rate:
    description: Half-life ~2-3h (ref: Goodman & Gilman 2018, p.325)
    value: 0.231      # ln(2)/3h ≈ 0.231/h
    type: parameter
    unit: 1/h
```

---

## 🔗 下一步

- **编写Scenario**: 阅读 [Scenario层规范](scenarios.md)
- **运行仿真**: 回到 [快速开始](quickstart.md) 运行你的模型
- **查看示例**: 浏览 `mods/core/` 目录

---

## 📖 参考资料

- **完整规范**: 见项目根目录的 `docs/mod_structure.md`（技术细节版）
- **YAML语法**: https://yaml.org/spec/1.2/spec.html
- **Asteval文档**: https://newville.github.io/asteval/

---

**开始创建你的第一个模型吧** 🚀
