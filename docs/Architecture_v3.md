# LifeMatters 架构设计决策文档 v3

**版本**: v3.0  
**日期**: 2025-01-25  
**核心决策**: 统一YAML范式 + 人为分层 + 输入输出规范化

---

## 一、核心架构原则

### 1.1 统一范式设计

```
技术层面: 统一的YAML格式 (models & stories)
概念层面: 清晰的分层约定 (职责分离)
实施层面: 工具检测 + 文档规范 (强制执行)
```

**设计理念**:
- **格式统一** ≠ **概念混淆**
- 通过目录、type字段、validator保证分层严谨性
- 允许技术灵活性，禁止架构混乱

---

### 1.2 整体结构

```
lifematters/
├─ models/          (Level 1: 科学模型 - 能力声明)
│  ├─ core/         # 基础模型
│  ├─ medical/      # 医学模型
│  │  ├─ dynamics/      # 动力学方程
│  │  ├─ statistical/   # 统计模型
│  │  └─ diagnostic/    # 诊断判断
│  ├─ interventions/    # 干预措施
│  │  ├─ diet/
│  │  ├─ exercise/
│  │  ├─ pharmacology/  # 药物
│  │  └─ surgery/       # 手术
│  └─ community/    # 用户贡献
│
└─ stories/         (Level 2: 应用故事 - 用途配置)
   ├─ examples/
   │  ├─ research/
   │  └─ game/
   └─ user/
```

---

## 二、统一YAML格式规范

### 2.1 通用Schema定义

所有YAML文件（models和stories）共享相同的顶层结构：

```yaml
# ============================================
# 通用字段 (所有文件必需)
# ============================================
type: model | story              # 文件类型标记
category: <subcategory>          # 二级分类

metadata:
  name: "<唯一名称>"
  version: "1.0.0"
  author: "<作者>"
  description: "<描述>"
  tags: [tag1, tag2]

# ============================================
# 核心内容 (技术统一)
# ============================================
imports:                         # 依赖的其他文件
  - path/to/dependency

variables:                       # 变量定义
  variable_name:
    type: input | state | parameter
    value: <初始值>
    unit: "<单位>"
    bounds: [min, max]
    
    # 扩展字段
    optimizable: true | false    # 是否可优化
    io_role: input | output | intermediate  # IO语义
    uncertainty: [lower, upper]  # 不确定性区间

formulas:                        # 公式定义
  formula_name:
    description: "<描述>"
    condition: <条件表达式>
    priority: <整数>
    dynamics:
      variable_name: "<更新表达式>"

# ============================================
# 可选字段 (按需启用)
# ============================================
simulation:                      # 仿真配置
  duration: <数值>
  time_step: <数值>
  output_variables: [...]

optimizer:                       # 优化配置
  input_optimization: {...}
  param_calibration: {...}

# ============================================
# Story特有字段 (仅type=story时有效)
# ============================================
story:                           # 叙事元素
  title: "<故事标题>"
  premise: "<前提设定>"
  protagonist: {...}
  conflict: "<核心冲突>"
  choices: [...]                # 玩家选择
```

---

### 2.2 Type分类定义

#### Models (type: model)

```yaml
type: model
category: 
  - dynamics          # 动力学方程
  - statistical       # 统计模型
  - diagnostic        # 诊断判断
  - intervention      # 干预措施
  - pharmacology      # 药理模型
```

**职责**:
- 定义科学规律和可复用组件
- 声明变量能力（optimizable, io_role）
- 不包含具体应用场景

**约束**:
- ✅ 可以 import 其他 models
- ❌ 不能 import stories
- ❌ 不能包含 story 字段
- ❌ 不能包含 optimizer 字段

---

#### Stories (type: story)

```yaml
type: story
category:
  - research_story    # 科研场景
  - game_story        # 游戏场景
  - education_story   # 教育场景
  - clinical_story    # 临床场景
```

**职责**:
- 组合 models 形成完整应用
- 配置优化目标和约束
- 定义用户交互和叙事

**约束**:
- ✅ 可以 import models（推荐）
- ⚠️ 可以 import stories（谨慎使用，用于组合式故事）
- ✅ 可以包含 story 字段
- ✅ 可以包含 optimizer 字段

---

## 三、输入输出设计规范

### 3.1 输入输出的统一处理

**核心原则**: 所有输入输出都通过 `variables` 定义，使用扩展字段标记语义。

```yaml
variables:
  <variable_name>:
    # 技术分类 (必需)
    type: input | state | parameter
    
    # 语义标记 (扩展)
    io_role: input | output | intermediate
    
    # 优化标记 (扩展)
    optimizable: true | false
```

#### Type vs IO Role 对照表

| type | io_role | 含义 | 示例 |
|------|---------|------|------|
| `input` | `input` | 外部输入（用户可调） | 每日碳水摄入、药物剂量 |
| `state` | `intermediate` | 内部状态（计算中间量） | 血糖浓度、胰岛素水平 |
| `state` | `output` | 输出指标（评估结果） | 健康评分、糖尿病风险 |
| `parameter` | `intermediate` | 模型参数（科学常数） | 吸收率、代谢率 |

---

### 3.2 输入样例 (Inputs)

#### 示例1: 饮食输入

```yaml
# models/interventions/diet/meal_input.yaml
type: model
category: intervention

metadata:
  name: "meal_input"
  description: "饮食输入模型"

variables:
  # ========== 输入变量 ==========
  meal_carbs:
    type: input
    value: 50
    unit: "g"
    bounds: [0, 300]
    io_role: input
    optimizable: true
    description: "单餐碳水化合物摄入"
  
  meal_protein:
    type: input
    value: 20
    unit: "g"
    bounds: [0, 150]
    io_role: input
    optimizable: true
  
  meal_fat:
    type: input
    value: 15
    unit: "g"
    bounds: [0, 100]
    io_role: input
    optimizable: true
  
  meal_timing:
    type: input
    value: 12
    unit: "hour"
    bounds: [6, 22]
    io_role: input
    optimizable: true
    description: "进餐时间（24小时制）"
  
  # ========== 中间计算 ==========
  total_calories:
    type: state
    value: 0
    unit: "kcal"
    io_role: intermediate
  
  # ========== 输出指标 ==========
  diet_quality_score:
    type: state
    value: 0
    unit: "score"
    bounds: [0, 100]
    io_role: output
    description: "饮食质量评分"

formulas:
  calculate_calories:
    dynamics:
      total_calories: "meal_carbs * 4 + meal_protein * 4 + meal_fat * 9"
  
  calculate_diet_quality:
    dynamics:
      diet_quality_score: |
        min(100, (meal_protein * 2 + meal_carbs * 0.5 + meal_fat * 0.3))
```

---

#### 示例2: 运动输入

```yaml
# models/interventions/exercise/exercise_input.yaml
type: model
category: intervention

variables:
  # ========== 输入变量 ==========
  exercise_duration:
    type: input
    value: 0
    unit: "minutes"
    bounds: [0, 180]
    io_role: input
    optimizable: true
  
  exercise_intensity:
    type: input
    value: 1
    unit: "MET"
    bounds: [1, 10]
    io_role: input
    optimizable: true
    description: "运动强度（代谢当量）"
  
  exercise_type:
    type: input
    value: 0
    unit: "enum"
    bounds: [0, 3]
    io_role: input
    description: "0=无,1=有氧,2=力量,3=HIIT"
  
  # ========== 输出效果 ==========
  calories_burned:
    type: state
    value: 0
    unit: "kcal"
    io_role: output
  
  glucose_reduction_effect:
    type: state
    value: 0
    unit: "mg/dL"
    io_role: output

formulas:
  calculate_energy_expenditure:
    condition: exercise_duration > 0
    dynamics:
      calories_burned: "exercise_duration * exercise_intensity * 3.5 * 70 / 200"
  
  glucose_lowering_effect:
    condition: exercise_duration > 0
    dynamics:
      glucose_reduction_effect: "exercise_intensity * exercise_duration * 0.2"
```

---

#### 示例3: 药物输入

```yaml
# models/interventions/pharmacology/metformin.yaml
type: model
category: pharmacology

variables:
  # ========== 输入变量 ==========
  daily_dose:
    type: input
    value: 0
    unit: "mg"
    bounds: [0, 2550]
    io_role: input
    optimizable: true
    description: "二甲双胍每日剂量"
  
  dosing_frequency:
    type: input
    value: 2
    unit: "times/day"
    bounds: [1, 3]
    io_role: input
  
  # ========== 药代动力学 ==========
  blood_concentration:
    type: state
    value: 0
    unit: "mg/L"
    io_role: intermediate
    description: "血药浓度"
  
  time_since_dose:
    type: state
    value: 0
    unit: "hours"
    io_role: intermediate
  
  # ========== 输出效果 ==========
  glucose_lowering_effect:
    type: state
    value: 0
    unit: "mg/dL"
    io_role: output
  
  side_effect_risk:
    type: state
    value: 0
    unit: "probability"
    bounds: [0, 1]
    io_role: output

formulas:
  absorption:
    condition: time_since_dose < 12
    dynamics:
      blood_concentration: |
        blood_concentration + (daily_dose / dosing_frequency) * 0.6 * 
        exp(-time_since_dose / 4) * dt
      time_since_dose: "time_since_dose + dt / 3600"
  
  pharmacodynamics:
    dynamics:
      glucose_lowering_effect: "blood_concentration * 0.8"
      side_effect_risk: "min(1.0, blood_concentration / 20)"
```

---

#### 示例4: 手术输入

```yaml
# models/interventions/surgery/bariatric_surgery.yaml
type: model
category: intervention

variables:
  # ========== 输入变量 ==========
  surgery_performed:
    type: input
    value: 0
    unit: "boolean"
    bounds: [0, 1]
    io_role: input
    description: "0=未手术, 1=已手术"
  
  surgery_type:
    type: input
    value: 0
    unit: "enum"
    bounds: [0, 2]
    io_role: input
    description: "0=无,1=袖状胃切除,2=胃旁路"
  
  # ========== 术后状态 ==========
  days_post_surgery:
    type: state
    value: 0
    unit: "days"
    io_role: intermediate
  
  stomach_capacity:
    type: state
    value: 1500
    unit: "mL"
    io_role: output
    description: "胃容量"
  
  # ========== 输出效果 ==========
  weight_loss_effect:
    type: state
    value: 0
    unit: "kg/month"
    io_role: output
  
  metabolic_improvement:
    type: state
    value: 0
    unit: "score"
    bounds: [0, 100]
    io_role: output

formulas:
  surgery_effect:
    condition: surgery_performed == 1
    dynamics:
      days_post_surgery: "days_post_surgery + dt / 86400"
      stomach_capacity: |
        if surgery_type == 1:
            max(200, 1500 * exp(-days_post_surgery / 90))
        elif surgery_type == 2:
            max(150, 1500 * exp(-days_post_surgery / 60))
        else:
            1500
  
  calculate_effects:
    condition: surgery_performed == 1
    dynamics:
      weight_loss_effect: "(1500 - stomach_capacity) / 100"
      metabolic_improvement: "min(100, days_post_surgery / 3.65)"
```

---

### 3.3 输出样例 (Outputs)

#### 示例1: 诊断输出

```yaml
# models/medical/diagnostic/diabetes_classifier.yaml
type: model
category: diagnostic

metadata:
  name: "diabetes_classifier"
  description: "糖尿病诊断分类器"

variables:
  # ========== 输入指标 ==========
  fasting_glucose:
    type: input
    value: 90
    unit: "mg/dL"
    bounds: [40, 400]
    io_role: input
  
  HbA1c:
    type: input
    value: 5.0
    unit: "%"
    bounds: [4, 15]
    io_role: input
  
  OGTT_2h:
    type: input
    value: 120
    unit: "mg/dL"
    bounds: [40, 400]
    io_role: input
    description: "口服葡萄糖耐量测试2小时血糖"
  
  # ========== 诊断输出 ==========
  diabetes_status:
    type: state
    value: 0
    unit: "enum"
    bounds: [0, 3]
    io_role: output
    description: "0=正常,1=前期,2=确诊,3=严重"
  
  diagnosis_confidence:
    type: state
    value: 0
    unit: "probability"
    bounds: [0, 1]
    io_role: output
  
  risk_level:
    type: state
    value: 0
    unit: "score"
    bounds: [0, 100]
    io_role: output
    description: "综合风险评分"

formulas:
  diagnose_diabetes:
    priority: 10
    dynamics:
      diabetes_status: |
        if fasting_glucose >= 126 or HbA1c >= 6.5 or OGTT_2h >= 200:
            3 if (fasting_glucose >= 180 or HbA1c >= 8) else 2
        elif fasting_glucose >= 100 or HbA1c >= 5.7 or OGTT_2h >= 140:
            1
        else:
            0
      
      diagnosis_confidence: |
        if diabetes_status >= 2 and fasting_glucose >= 126 and HbA1c >= 6.5:
            0.95
        elif diabetes_status == 1:
            0.7
        else:
            0.85
      
      risk_level: |
        (fasting_glucose / 126 * 30 + 
         HbA1c / 6.5 * 40 + 
         OGTT_2h / 200 * 30)
```

---

#### 示例2: 健康评估输出

```yaml
# models/medical/assessment/health_score.yaml
type: model
category: diagnostic

imports:
  - ../dynamics/glucose_metabolism
  - ../dynamics/cardiovascular

variables:
  # ========== 输出指标 ==========
  overall_health_score:
    type: state
    value: 100
    unit: "score"
    bounds: [0, 100]
    io_role: output
    description: "综合健康评分"
  
  metabolic_health:
    type: state
    value: 100
    unit: "score"
    bounds: [0, 100]
    io_role: output
  
  cardiovascular_health:
    type: state
    value: 100
    unit: "score"
    bounds: [0, 100]
    io_role: output
  
  quality_of_life:
    type: state
    value: 100
    unit: "score"
    bounds: [0, 100]
    io_role: output
  
  # ========== 预测输出 ==========
  life_expectancy:
    type: state
    value: 80
    unit: "years"
    io_role: output
    description: "预测剩余寿命"
  
  complication_risk_5y:
    type: state
    value: 0
    unit: "probability"
    bounds: [0, 1]
    io_role: output
    description: "5年并发症风险"

formulas:
  calculate_metabolic_health:
    dynamics:
      metabolic_health: |
        max(0, 100 - 
            abs(blood_glucose - 90) * 0.3 -
            abs(HbA1c - 5.0) * 10 -
            abs(BMI - 22) * 2)
  
  calculate_cardiovascular_health:
    dynamics:
      cardiovascular_health: |
        max(0, 100 - 
            max(0, systolic_bp - 120) * 0.5 -
            max(0, LDL_cholesterol - 100) * 0.3 -
            max(0, triglycerides - 150) * 0.2)
  
  calculate_overall:
    priority: -1
    dynamics:
      overall_health_score: |
        (metabolic_health * 0.4 + 
         cardiovascular_health * 0.4 + 
         quality_of_life * 0.2)
      
      life_expectancy: |
        80 + (overall_health_score - 50) * 0.2
      
      complication_risk_5y: |
        max(0, min(1, (100 - overall_health_score) / 100 * 0.5))
```

---

#### 示例3: 成本效益输出

```yaml
# models/medical/assessment/cost_benefit.yaml
type: model
category: diagnostic

variables:
  # ========== 成本输出 ==========
  daily_medication_cost:
    type: state
    value: 0
    unit: "CNY"
    io_role: output
  
  monthly_healthcare_cost:
    type: state
    value: 0
    unit: "CNY"
    io_role: output
  
  annual_total_cost:
    type: state
    value: 0
    unit: "CNY"
    io_role: output
  
  # ========== 效益输出 ==========
  QALY_gained:
    type: state
    value: 0
    unit: "years"
    io_role: output
    description: "质量调整生命年"
  
  cost_effectiveness_ratio:
    type: state
    value: 0
    unit: "CNY/QALY"
    io_role: output

formulas:
  calculate_medication_cost:
    dynamics:
      daily_medication_cost: |
        (metformin_dose / 1000 * 0.5 +
         insulin_dose * 2.0 +
         statin_dose / 10 * 3.0)
  
  calculate_healthcare_cost:
    dynamics:
      monthly_healthcare_cost: |
        daily_medication_cost * 30 +
        doctor_visits * 200 +
        lab_tests * 150 +
        (complication_risk * 5000)
      
      annual_total_cost: "monthly_healthcare_cost * 12"
  
  calculate_cost_effectiveness:
    dynamics:
      QALY_gained: "life_expectancy * (overall_health_score / 100)"
      cost_effectiveness_ratio: |
        annual_total_cost / max(0.01, QALY_gained)
```

---

## 四、Story应用示例

### 4.1 研究故事：综合糖尿病管理

```yaml
# stories/research/comprehensive_diabetes_management.yaml
type: story
category: research_story

metadata:
  name: "comprehensive_diabetes_management"
  version: "1.0"
  author: "Fan"
  description: "综合糖尿病管理优化研究"

story:
  title: "张先生的控糖之路"
  premise: "45岁程序员,确诊2型糖尿病,探索最优管理方案"
  research_question: "如何在预算约束下最大化生活质量?"
  
  timeline:
    - month_0: "确诊,开始干预"
    - month_3: "首次复查"
    - month_6: "调整方案"
    - month_12: "年度评估"
  
  protagonist:
    age: 45
    occupation: "程序员"
    initial_status:
      HbA1c: 7.8
      fasting_glucose: 145
      BMI: 28

# ========== 组合多个models ==========
imports:
  - ../../models/medical/dynamics/glucose_metabolism
  - ../../models/medical/dynamics/insulin_system
  - ../../models/interventions/diet/meal_input
  - ../../models/interventions/exercise/exercise_input
  - ../../models/interventions/pharmacology/metformin
  - ../../models/medical/diagnostic/diabetes_classifier
  - ../../models/medical/assessment/health_score
  - ../../models/medical/assessment/cost_benefit

# ========== 功能声明 ==========
capabilities:
  simulation: true
  input_optimization: true
  param_calibration: false

# ========== 模拟配置 ==========
simulation:
  duration: 365
  time_step: 3600
  population_size: 1

# ========== 优化配置 ==========
optimizer:
  # 外环优化: 寻找最优干预组合
  input_optimization:
    # 从imported models中引用变量
    variables:
      # 饮食输入
      - meal_carbs
      - meal_protein
      - meal_timing
      
      # 运动输入
      - exercise_duration
      - exercise_intensity
      
      # 药物输入
      - daily_dose
    
    # 多目标优化
    objectives:
      - minimize: annual_total_cost
      - maximize: overall_health_score
      - minimize: complication_risk_5y
    
    # 约束条件
    constraints:
      daily_medication_cost: [0, 30]
      exercise_duration: [0, 90]
      total_calories: [1500, 2200]
    
    # 算法配置
    algorithm:
      method: "NSGA-II"
      population_size: 200
      generations: 300
      timeout: 7200

# ========== 参数覆盖 ==========
overrides:
  # 个体化参数
  glucose_metabolism.baseline_glucose: 145
  insulin_system.insulin_sensitivity: 0.6
  cost_benefit.insurance_coverage: 0.75
```

---

### 4.2 游戏故事：卖火柴的小女孩

```yaml
# stories/game/match_girl.yaml
type: story
category: game_story

metadata:
  name: "match_girl"
  version: "1.0"
  description: "工业革命时期伦敦的生存挑战"

story:
  title: "卖火柴的小女孩"
  theme: "贫困与希望的挣扎"
  emotional_arc: "希望 → 绝望 → 平静"
  
  setting:
    time: "1845年圣诞夜"
    location: "伦敦贫民窟"
    weather: "大雪,气温-10°C"
  
  protagonist:
    name: "小女孩"
    age: 7
    initial_state:
      body_temperature: 35
      hunger_level: 70
      hope: 50
      matches: 12

# ========== 精简models组合 ==========
imports:
  - ../../models/medical/dynamics/body_temperature
  - ../../models/medical/dynamics/starvation

# ========== 游戏功能 ==========
capabilities:
  simulation: true
  input_optimization: false
  param_calibration: false

# ========== 玩家选择 ==========
story:
  choices:
    - id: burn_match
      name: "点燃一根火柴"
      description: "获得短暂温暖,但减少资产"
      cost:
        matches: -1
      effects:
        body_temperature: +10
        hope: +5
      cooldown: 300
      available_when: "matches > 0"
    
    - id: seek_shelter
      name: "寻找避风处"
      description: "减少热量流失"
      cost:
        energy: -5
      effects:
        body_temperature_decay_rate: -0.5
      duration: 600
    
    - id: eat_bread
      name: "吃掉藏起来的面包"
      description: "补充能量,但只有一块"
      cost:
        bread: -1
      effects:
        hunger_level: -30
        body_temperature: +2
      available_when: "bread > 0"
    
    - id: hallucination
      name: "陷入幻觉"
      description: "身体机能衰竭时的精神保护"
      auto_trigger_when: "body_temperature < 30"
      effects:
        hope: +20
        awareness: -50

# ========== 游戏结局 ==========
story:
  endings:
    - id: survival
      condition: "body_temperature > 33 and time > 28800"
      title: "黎明的曙光"
      description: "你撑过了最艰难的夜晚"
    
    - id: peaceful_death
      condition: "body_temperature < 28"
      title: "平静的离去"
      description: "在幻觉中,你看到了奶奶..."
    
    - id: rescue
      condition: "hope > 60 and time > 14400"
      title: "意外的救助"
      description: "一位好心人收留了你"

# ========== 初始状态 ==========
initial_state:
  age: 7
  body_temperature: 35
  hunger_level: 70
  hope: 50
  matches: 12
  bread: 1
  awareness: 100
```

---

## 五、分层约束与检测

### 5.1 依赖规则

```
✅ 允许:
  Story → Model (单向,推荐)
  Model → Model (DAG有向无环图)

⚠️ 警告但技术可行:
  Story → Story (组合式故事,罕见)

❌ 禁止:
  Model → Story (违反分层原则)
  A → B → A (循环依赖)
```

---

### 5.2 Validator实现

```python
# validator.py
class ArchitectureValidator:
    """架构完整性检查"""
    
    def __init__(self):
        self.errors = []
        self.warnings = []
    
    def validate_file(self, file_path: str, data: dict):
        """验证单个文件"""
        
        # 检查1: 目录与type一致性
        self._check_directory_type_consistency(file_path, data)
        
        # 检查2: 字段完整性
        self._check_required_fields(data)
        
        # 检查3: Import合法性
        self._check_import_rules(file_path, data)
        
        # 检查4: 变量IO语义
        self._check_variable_io_semantics(data)
        
        return len(self.errors) == 0
    
    def _check_directory_type_consistency(self, file_path, data):
        """检查文件位置与type是否匹配"""
        
        if 'models/' in file_path:
            if data.get('type') != 'model':
                self.errors.append(
                    f"{file_path}: File in models/ must have type=model"
                )
        
        elif 'stories/' in file_path:
            if data.get('type') != 'story':
                self.errors.append(
                    f"{file_path}: File in stories/ must have type=story"
                )
    
    def _check_import_rules(self, file_path, data):
        """检查import规则"""
        
        file_type = data.get('type')
        imports = data.get('imports', [])
        
        for imp_path in imports:
            imp_type = self._get_import_type(imp_path)
            
            # Model不能import Story
            if file_type == 'model' and imp_type == 'story':
                self.errors.append(
                    f"{file_path}: Model cannot import story {imp_path}"
                )
            
            # Story import Story (警告)
            if file_type == 'story' and imp_type == 'story':
                self.warnings.append(
                    f"{file_path}: Story imports story {imp_path}. "
                    f"Consider if composition is necessary."
                )
        
        # 检查循环依赖
        if self._has_circular_dependency(file_path):
            self.errors.append(
                f"{file_path}: Circular dependency detected"
            )
    
    def _check_variable_io_semantics(self, data):
        """检查变量IO语义的一致性"""
        
        variables = data.get('variables', {})
        
        for var_name, var_def in variables.items():
            var_type = var_def.get('type')
            io_role = var_def.get('io_role')
            
            # 输入变量通常是input type
            if io_role == 'input' and var_type not in ['input', 'parameter']:
                self.warnings.append(
                    f"Variable {var_name}: io_role=input but type={var_type}. "
                    f"Consider using type=input."
                )
            
            # 输出变量通常是state type
            if io_role == 'output' and var_type != 'state':
                self.warnings.append(
                    f"Variable {var_name}: io_role=output but type={var_type}. "
                    f"Consider using type=state."
                )
    
    def _get_import_type(self, import_path: str) -> str:
        """获取import文件的type"""
        # 简化实现:基于路径判断
        if 'stories/' in import_path:
            return 'story'
        elif 'models/' in import_path:
            return 'model'
        else:
            # 实际实现:加载文件检查type字段
            data = self._load_yaml(import_path)
            return data.get('type', 'unknown')
    
    def _has_circular_dependency(self, file_path: str) -> bool:
        """检测循环依赖"""
        visited = set()
        visiting = set()
        
        def dfs(path):
            if path in visiting:
                return True  # 发现环
            if path in visited:
                return False
            
            visiting.add(path)
            
            data = self._load_yaml(path)
            for imp in data.get('imports', []):
                if dfs(imp):
                    return True
            
            visiting.remove(path)
            visited.add(path)
            return False
        
        return dfs(file_path)
```

---

### 5.3 CLI Linter工具

```bash
# 检查所有文件
$ lifematters lint --strict

Validating architecture...

✓ models/medical/glucose_metabolism.yaml
  - type: model
  - imports: 2 models
  - variables: 15 (5 input, 8 state, 2 parameter)

✓ stories/research/diabetes_management.yaml
  - type: story
  - imports: 8 models
  - optimization enabled

✗ models/core/time_system.yaml
  ERROR: Imports story 'stories/calendar.yaml'
  FIX: Remove story import or move file to stories/

⚠ stories/game/match_girl.yaml
  WARNING: Story imports story 'stories/base_game.yaml'
  Consider if composition is necessary.

Summary:
  Files checked: 127
  Errors: 1 (must fix)
  Warnings: 3 (review recommended)
  Circular dependencies: 0

Run 'lifematters lint --fix' to auto-fix some issues.
```

---

## 六、实施要点

### 6.1 Model开发工作流

```bash
# 1. 创建新model
$ lifematters create model \
  --name glucose_metabolism \
  --category dynamics \
  --output models/medical/

# 2. 编辑YAML
$ vim models/medical/glucose_metabolism.yaml

# 3. 验证
$ lifematters lint models/medical/glucose_metabolism.yaml

# 4. 测试
$ lifematters simulate models/medical/glucose_metabolism.yaml
```

---

### 6.2 Story开发工作流

```bash
# 1. 从模板创建
$ lifematters create story \
  --template research \
  --name my_diabetes_study \
  --output stories/user/

# 2. 编辑配置
$ vim stories/user/my_diabetes_study.yaml

# 3. 验证依赖
$ lifematters lint stories/user/my_diabetes_study.yaml

# 4. 运行模拟
$ lifematters run stories/user/my_diabetes_study.yaml

# 5. 执行优化
$ lifematters optimize stories/user/my_diabetes_study.yaml \
  --mode input
```

---

### 6.3 开发优先级

#### Phase 1: 基础框架 (0-3个月)
- ✅ 统一YAML Schema定义
- ✅ Loader递归加载实现
- ✅ Validator分层检查
- ✅ 基础Model库(glucose, insulin)

#### Phase 2: 输入输出完善 (3-6个月)
- ✅ 输入Models (diet, exercise, drugs)
- ✅ 输出Models (diagnosis, assessment)
- ✅ Story模板库
- ✅ Linter工具

#### Phase 3: 优化集成 (6-9个月)
- ✅ 外环优化(input_optimization)
- ✅ 内环校准(param_calibration)
- ✅ 多目标算法集成
- ✅ GUI模式选择

#### Phase 4: 高级功能 (9-12个月)
- ✅ 敏感性分析
- ✅ 不确定性量化
- ✅ Story组合机制
- ✅ 社区Model库

---

## 七、关键决策记录

### 决策1: 采用统一YAML格式

**理由**:
- 技术简洁（一套parser/validator）
- 演化灵活（新类型无需重新设计schema）
- 用户友好（学习一次,到处使用）

**保障措施**:
- 目录结构强制分离
- type字段明确标记
- Validator严格检查
- 文档清晰说明

---

### 决策2: IO通过variables扩展标记

**理由**:
- 统一变量系统,降低复杂度
- io_role语义清晰,不干扰type
- 灵活组合,支持复杂场景

**优势**:
- 输入输出都是变量,便于optimizer引用
- 扩展字段向后兼容
- 工具可基于io_role生成UI

---

### 决策3: 允许技术灵活性,禁止架构混乱

**理念**:
- 技术层面:循环依赖检测,但不强制单向import
- 架构层面:通过工具警告违反分层的行为
- 创新空间:用户可探索新用法(如story组合)

**平衡点**:
- 强制:禁止循环依赖
- 警告:Model import Story
- 提示:Story import Story

---

## 八、FAQ

### Q1: 为什么不用两套格式分离models和stories?

**A**: 分离格式会导致:
1. 代码复杂度翻倍(两套parser/validator)
2. 学习成本增加(用户要学两套规则)
3. 演化困难(改动牵一发动全身)
4. 不能更好地防止滥用(格式不同但用户仍可能错误使用)

统一格式通过目录、type、validator保证分层,技术成本更低。

---

### Q2: 如何防止用户在model中写复杂的story逻辑?

**A**: 多层保护:
1. Validator检查:model包含story字段→报错
2. Linter警告:model引用story→警告
3. 文档规范:明确职责分离
4. 代码审查:社区贡献强制检查

---

### Q3: Story可以不包含story字段吗?

**A**: 可以。Story的本质是"组合models形成应用",story字段只是可选的叙事增强。

```yaml
# 最小化story (纯研究配置)
type: story
category: research_story

imports: [...]
optimizer: {...}
# 没有story字段也是合法的
```

---

### Q4: Model可以有optimizer字段吗?

**A**: 不推荐,但技术上不禁止。

- Model应该声明能力(optimizable: true)
- Story负责配置优化目标和算法
- 如果Model包含optimizer,Validator会警告

---

### Q5: 如何处理输入的枚举类型(如手术类型)?

**A**: 用整数表示+文档说明

```yaml
surgery_type:
  type: input
  value: 0
  bounds: [0, 2]
  description: "0=无手术, 1=袖状胃切除, 2=胃旁路"
  
  # 可选:扩展枚举定义
  enum_values:
    0: "none"
    1: "sleeve_gastrectomy"
    2: "gastric_bypass"
```

---

## 九、附录

### A. 变量Type速查表

| type | 含义 | 初始化 | 运行时修改 | 优化器可调 |
|------|------|--------|----------|----------|
| `input` | 外部输入 | 用户设置 | ✅ | ✅ (外环) |
| `state` | 内部状态 | 初始值 | ✅ (formulas更新) | ❌ |
| `parameter` | 模型参数 | 固定值 | ❌ | ✅ (内环) |

---

### B. IO Role速查表

| io_role | 含义 | 典型type | 示例 |
|---------|------|---------|------|
| `input` | 可控输入 | input | 每日药物剂量 |
| `intermediate` | 中间计算 | state/parameter | 血药浓度 |
| `output` | 评估指标 | state | 健康评分 |

---

### C. 完整示例文件树

```
lifematters/
├─ models/
│  ├─ medical/
│  │  ├─ dynamics/
│  │  │  ├─ glucose_metabolism.yaml
│  │  │  ├─ insulin_system.yaml
│  │  │  └─ body_temperature.yaml
│  │  ├─ diagnostic/
│  │  │  ├─ diabetes_classifier.yaml
│  │  │  └─ risk_assessment.yaml
│  │  └─ assessment/
│  │     ├─ health_score.yaml
│  │     └─ cost_benefit.yaml
│  └─ interventions/
│     ├─ diet/
│     │  └─ meal_input.yaml
│     ├─ exercise/
│     │  └─ exercise_input.yaml
│     ├─ pharmacology/
│     │  ├─ metformin.yaml
│     │  └─ insulin_therapy.yaml
│     └─ surgery/
│        └─ bariatric_surgery.yaml
│
└─ stories/
   ├─ examples/
   │  ├─ research/
   │  │  ├─ comprehensive_diabetes.yaml
   │  │  └─ lifestyle_intervention.yaml
   │  └─ game/
   │     ├─ match_girl.yaml
   │     └─ diabetes_survival.yaml
   └─ user/
      └─ my_studies/
```

---

**文档结束**

**版本历史**:
- v1.0 (2025-01-24): 初始2级架构
- v2.0 (2025-01-25): 整合优化器
- v3.0 (2025-01-25): 统一YAML范式 + 输入输出规范

---

**下一步**:
1. 实施Phase 1基础框架
2. 开发输入输出Model库
3. 编写Validator和Linter
4. 准备框架论文
