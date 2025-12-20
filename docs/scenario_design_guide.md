# Scenario层设计指南

**面向用户**: 科普设计者、游戏爱好者、历史爱好者  
**前置阅读**: [Core层规范](core_mods.md)

---

> **一句话总结**: Scenario是"一键运行"的预配置场景，组合Core层模型并调整参数，让用户无需手动设置即可体验。

---

---

## 📋 核心决议总结

### 设计原则
1. **双层YAML架构**: Core层（科研）+ Scenario层（科普/游戏）
2. **职责分离**: 科学模型与历史配置解耦
3. **渐进扩展**: 初期YAML为主，后期可选加入SQLite索引
4. **保持简洁**: 避免过度抽象，优先配置而非代码

---

## 🏗️ 双层架构设计

### 目录结构

```
mods/
├── core/                    # 科研层（科学家编辑）
│   ├── aspirin.yaml         # 纯药理模型
│   ├── penicillin.yaml
│   └── glucose_regulation.yaml
│
├── scenarios/               # 场景层（游戏设计者编辑）
│   ├── london_1910_flu.yaml      # 历史场景
│   ├── elderly_patient.yaml      # 特定人群
│   └── templates/
│       └── european_city_1900s.yaml  # 可复用模板
│
└── metadata/                # 可选：时空元数据（后期）
    └── drug_availability.yaml
```

---

## 📄 Core层规范（科研模型）

### 设计目标
- **纯科学性**: 只包含药理/生理动力学
- **可读性**: 医学研究者易于理解和修改
- **无历史信息**: 不含时间、地点等非科学属性

### 示例：aspirin.yaml

```yaml
metadata:
  name: aspirin_pharmacology
  version: 1.0.0
  author: Medical Research Team
  description: Aspirin pharmacokinetics and pain relief model
  tags: [analgesic, antipyretic, NSAID]

variables:
  blood_aspirin:
    description: Blood concentration of aspirin
    value: 0.0
    type: state
    unit: mg/L
    bounds: [0.0, 500.0]
  
  aspirin_efficacy:
    description: Pain relief efficacy coefficient
    value: 0.8
    type: parameter
    bounds: [0.5, 1.0]
  
  pain_level:
    description: Patient's pain intensity
    value: 50.0
    type: state
    unit: VAS
    bounds: [0.0, 100.0]
  
  dose:
    description: Single dose administered
    value: 500.0
    type: input
    unit: mg

formulas:
  absorption:
    description: First-pass absorption kinetics
    priority: -100
    dynamics:
      blood_aspirin: blood_aspirin + dose * 0.8 * (dt / 3600)
  
  pain_relief:
    description: Pain reduction by aspirin
    condition: blood_aspirin > 10
    dynamics:
      pain_level: pain_level - aspirin_efficacy * blood_aspirin * 0.05 * dt

simulator:
  step_size: 60      # 1 minute
  total_time: 21600  # 6 hours
```

### Core层约束
1. ✅ **允许**:
   - 药理参数（吸收率、半衰期）
   - 生理方程（动力学模型）
   - 可调参数（efficacy系数）

2. ❌ **禁止**:
   - 历史日期（invention_year）
   - 地理区域（available_regions）
   - 社会经济因素（price, accessibility）

---

## 🎮 Scenario层规范（场景设计）

### 设计目标
- **用户友好**: 一键运行，最少输入
- **历史真实**: 反映特定时空背景
- **参数定制**: 覆写Core层默认值

### 示例：london_1910_flu.yaml

```yaml
metadata:
  name: london_1910_flu_outbreak
  version: 1.0.0
  author: History Enthusiast
  description: Simulate flu outbreak in Edwardian London
  tags: [historical, pandemic, urban]

# === 场景配置 ===
scenario:
  location: London, UK
  coordinates: [51.5074, -0.1278]
  year: 1910
  season: winter
  population: 7000000
  
  # 初始条件
  initial_conditions:
    infected_population: 1000
    healthcare_capacity: limited
    public_hygiene: poor

# === 模型组合 ===
imports:
  - core/aspirin           # 阿司匹林（1899年已发明）
  - core/flu_dynamics      # 流感传播模型
  - core/mortality_rates   # 死亡率模型

# === 参数覆写（Patch机制）===
patches:
  aspirin:
    variables:
      aspirin_efficacy: 0.6
      # 原因: 1910年制药工艺不成熟，纯度较低
      # 参考: Smith et al. (2015), "Early Aspirin Manufacturing"
  
  flu_dynamics:
    variables:
      transmission_rate: 0.8
      # 原因: 伦敦人口密度高，公共卫生条件差
      contact_rate: 15.0
      # 原因: 工业时代城市拥挤，日均接触人数多

# === 数据库查询（后期功能）===
# 系统自动查询 metadata/drug_availability.db
# - aspirin: 1910年在英国已可用 ✓
# - penicillin: 1910年尚未发明 ✗（自动排除）

simulator:
  step_size: 3600        # 1 hour
  total_time: 2592000    # 30 days
  output_variables:
    - infected_population
    - death_toll
    - aspirin_usage
```

### Scenario层关键特性

#### 1. Patch机制（参数覆写）

**规则**:
- **字段级合并**: 只修改指定字段，未提及字段保留默认值
- **明确性**: 必须指定要patch哪个mod
- **文档化**: 注释说明覆写原因和参考来源

**Python实现逻辑**:
```python
def merge_patches(base_model, patches):
    """字段级合并，避免小狼毫式全替换"""
    for mod_name, overrides in patches.items():
        if mod_name not in base_model.imports:
            raise ValueError(f"Cannot patch non-imported mod: {mod_name}")
        
        for var_name, new_value in overrides.get('variables', {}).items():
            if var_name in base_model.variables:
                base_model.variables[var_name].value = new_value
            else:
                logger.warning(f"Patch variable {var_name} not in {mod_name}")
```

#### 2. 时空适配（未来扩展）

**Phase 1 (MVP)**: 手动标注
```yaml
# metadata/drug_availability.yaml
drugs:
  aspirin:
    invention_year: 1899
    regions:
      - name: Western Europe
        available_from: 1900
      - name: North America
        available_from: 1915
```

**Phase 2**: SQLite数据库
```sql
CREATE TABLE availability (
    drug_name TEXT,
    year INT,
    region_id INT,  -- 外键到regions表
    status TEXT,    -- available/limited/unavailable
    FOREIGN KEY (region_id) REFERENCES regions(id)
);

-- 树形区域结构
CREATE TABLE regions (
    id INT PRIMARY KEY,
    name TEXT,
    parent_id INT,  -- 支持 Europe > UK > London
    coordinates TEXT
);
```

**查询示例**:
```python
def check_availability(drug: str, year: int, region: str) -> bool:
    """检查药物在指定时空是否可用"""
    query = """
        SELECT status FROM availability a
        JOIN regions r ON a.region_id = r.id
        WHERE a.drug_name = ? AND a.year <= ?
        AND (r.name = ? OR r.id IN (
            SELECT parent_id FROM regions WHERE name = ?
        ))
    """
    return db.execute(query, (drug, year, region, region)).fetchone()
```

---

## 🔧 技术实现细节

### LoaderEngine扩展

**需要在 `loader_engine.py` 中新增**:

```python
class LoaderEngine:
    def load_scenario(self, scenario_file: str) -> ModStructure:
        """加载场景，自动处理imports和patches"""
        scenario = self.load_yaml(scenario_file)
        
        # 1. 加载所有imports
        merged_model = self.fetch_with_imports(scenario['imports'])
        
        # 2. 应用patches
        if 'patches' in scenario:
            self.apply_patches(merged_model, scenario['patches'])
        
        # 3. 合并scenario的simulator配置
        if 'simulator' in scenario:
            merged_model.simulator.update(scenario['simulator'])
        
        return merged_model
    
    def apply_patches(self, model: ModStructure, patches: dict):
        """字段级patch，保留未提及的字段"""
        for mod_name, overrides in patches.items():
            for var_name, new_value in overrides.get('variables', {}).items():
                if var_name in model.variables:
                    model.variables[var_name].value = new_value
                else:
                    logger.warning(f"Patch target {var_name} not found")
```

### Validator扩展

**在 `validator.py` 中新增检查**:

```python
def validate_scenario(self, scenario_data: dict) -> bool:
    """验证场景文件完整性"""
    errors = []
    
    # 检查必需字段
    if 'imports' not in scenario_data:
        errors.append("Scenario must have 'imports' field")
    
    # 检查patch目标存在
    if 'patches' in scenario_data:
        for mod_name in scenario_data['patches'].keys():
            if mod_name not in scenario_data.get('imports', []):
                errors.append(f"Cannot patch non-imported mod: {mod_name}")
    
    return len(errors) == 0, errors
```

---

## 📊 工作流程对比

### 科研工作流（Core层）

```mermaid
graph LR
    A[文献调研] --> B[提取方程]
    B --> C[编写core YAML]
    C --> D[Validator验证]
    D --> E[Simulator测试]
    E --> F[发表论文]
```

**特点**: 需要医学/数学背景，关注模型准确性

---

### 科普工作流（Scenario层）

```mermaid
graph LR
    A[选择历史事件] --> B[查找可用模型]
    B --> C[编写scenario YAML]
    C --> D[调整参数patches]
    D --> E[一键运行]
    E --> F[分享体验]
```

**特点**: 无需编程背景，关注历史真实性和可玩性

---

## 🎯 设计哲学

### 对标产品

| 层级 | 对标 | 特点 |
|------|------|------|
| **Core** | Jupyter Notebook | 科研级灵活性，但保持YAML简洁 |
| **Scenario** | Desmos/PhET | 教育级易用性，一键体验 |
| **整体** | 文明系列 | Scenario = 剧本，Core = 游戏引擎 |

### 与P社游戏的区别

| 维度 | P社（如EU4） | LifeMatters |
|------|-------------|-------------|
| **目标** | 国家策略娱乐 | 个人健康科普+科研 |
| **数据源** | 游戏平衡性 | 医学文献验证 |
| **可扩展性** | MOD社区（闭源引擎） | YAML开源生态 |
| **学术价值** | 无 | 可发SCI论文 |

---

## ⚠️ 设计约束与权衡

### 为什么不全Python化？

**反对理由**:
1. ❌ 失去核心用户（医学研究者）
2. ❌ 违背"零门槛"定位
3. ❌ 退化为普通scipy库

**保留Python的场景**（仅高级用户）:
- 复杂随机过程（马尔可夫链）
- 机器学习模型集成
- 外部API对接

**解决方案**: 预留 `custom_functions/` 目录，但MVP不实现

---

### 为什么不用纯数据库？

**问题**:
- Git版本控制困难
- 社区协作门槛高
- 失去YAML的人类可读性

**混合方案**:
- YAML存"控制逻辑"（哪些模型组合）
- SQLite存"事实数据"（药物可用性）
- Web表单降低数据提交门槛

---

## 🚀 实施路线图

### Phase 1: MVP（0-3个月）
- ✅ 支持Core层YAML（已完成80%）
- 🔲 实现Scenario加载器
- 🔲 Patch机制验证
- 🔲 3个示例场景（伦敦流感、老年患者、战争医疗）

### Phase 2: 元数据层（3-6个月）
- 🔲 建立drug_availability.yaml库（20-30个药物）
- 🔲 手动时空适配
- 🔲 社区贡献指南

### Phase 3: 数据库优化（6-12个月）
- 🔲 迁移到SQLite
- 🔲 Web表单提交接口
- 🔲 区域树形结构（国家→城市）
- 🔲 自动化可用性查询

---

## 📚 相关文档

- **mod_structure.md**: Core层YAML详细规范
- **architecture.md**: 系统整体架构
- **Project_v2_LM.md**: 项目愿景和目标

---

## 🤝 贡献指南

### 科研者（Core层）
1. 阅读 `mod_structure.md`
2. 在 `mods/core/` 创建新模型
3. 运行 `lifematters-loader --validate`
4. 提交Pull Request

### 游戏设计者（Scenario层）
1. 浏览 `mods/core/` 可用模型
2. 在 `mods/scenarios/` 创建场景YAML
3. 测试运行 `lifematters-simulator --scenario your_scenario.yaml`
4. 分享到社区

### 历史爱好者（Metadata贡献）
1. 通过Web表单提交drug_availability数据
2. 或直接编辑 `metadata/*.yaml`
3. 附上参考文献链接

---

## 💡 常见问题

**Q: 为什么不用JSON？**  
A: YAML支持注释，更适合人类编辑和文档化。

**Q: Patch会导致Core层臃肿吗？**  
A: 不会。Patch只存在Scenario层，Core保持简洁。

**Q: 如何避免小狼毫式的字段丢失？**  
A: 使用字段级merge而非整体替换，参见 `apply_patches()` 实现。

**Q: SQLite会增加多少复杂度？**  
A: Phase 1不需要数据库，仅Phase 3优化时引入，且对用户透明。

---

**文档维护**: 每3个月审阅更新  
**反馈渠道**: GitHub Issues / 项目讨论组
