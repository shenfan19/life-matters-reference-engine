# Story层设计指南

**面向用户**: 科普设计者、游戏爱好者、历史爱好者  
**前置阅读**: [建模设计手册](model.md)

---

> **一句话总结**: Story是"一键运行"的预配置剧情，组合Core层模型并调整参数，让用户无需手动设置即可体验。

---

---

## 📋 核心决议总结

### 设计原则
1. **单包封装 (Single Package)**: 每个 Story 是一个独立文件夹，包含所有元数据、逻辑与资源。
2. **Sim-Game 映射 (R-G Mapping)**: 仿真模型自动导出为游戏关卡，保持科学性。
3. **极简变量**: 将复杂的科研数据简化为直观的数值卡牌（HP/SP/Money）。
4. **离散化步进**: 将连续时间步 (`dt`) 映射为离散回合 (`Turn`)。

---

## 🏗️ 双层架构设计

### 目录结构

```
mods/
├── core/                    # 科研层（科学家编辑：纯药理/生理模型）
│   ├── aspirin.yaml
│   └── glucose_regulation.yaml
│
└── stories/               # 剧情层（故事包：文件夹形式封装）
    └── marie_curie/       # 禁止在目录外出现同名文件
        ├── story.yaml     # 核心入口：合并 metadata (游戏) 与 dynamics (仿真)
        ├── cards/         # 手牌定义 (Sim Inputs)
        └── dynamics/      # 附加规则 (Sim Dynamics)
```

> [!IMPORTANT]
> **单包原则 (Single Package Rule)**: 每个 Story 必须且仅能存在于一个独立的子目录中。不允许在 `mods/stories/` 根目录下放置外部 YAML 索引或元数据文件。所有信息必须封装在文件夹内的 `story.yaml` 中。这样确保了故事包可以“随便搬迁”，无索引依赖。

---

## 📄 模型层设计规范
- **详细规范**: 见 [建模设计手册](model.md)

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

## 🎮 Story层规范（剧情设计）

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

# === 剧情配置 ===
story:
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


## 🃏 卡牌与游戏化UI设计 (Card UI)

在最新的 `sim_gui` 前端实现中，Story 引擎支持类似于《炉石传说》或《杀戮尖塔》的卡牌交互界面。

### 卡牌数据定义

卡牌配置被放置在 `mods/stories/<story_name>/cards/` 文件夹下游，并以 YAML 格式定义：

```yaml
# mods/stories/marie_curie/cards/research.yaml
name: "实验室研究"
type: "goal"             # 卡牌类型，决定视觉UI配色 (如 health, work, goal)
tags: ["work", "goal"]
cost: 5                  # 费用，显示在卡牌左上角
effects:
  +research_progress: 10
  -health: 5
  +radiation: 8
description: "在实验室中进行艰苦的矿石提炼和放射性物质提取。"
icon: "🧪"               # 卡牌图标
```

### UI 层叠架构

`StoryEngine` 在前端加载这套 yaml 后会将其转换为交互式的 HTML 堆叠视图，左上角显示费用，中上部分展示立绘与名称，卡牌允许存在悬浮态变幻以提示详细 effects 变化。

**游戏化设计限制**：
- 卡牌仅能在玩家的回合 (`isPlayerTurn = true`) 或者满足其 cost 消耗时打出。
- 卡牌造成的 `effects` 通过内部的 `applyEffects` 函数结合状态机的计算公式执行。


### Story层关键特性

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

## 🔄 R-G 自动化转换逻辑 (Sim-Game Converter)

`LoaderEngine` 通过识别 `story.yaml` 中的特定字段，自动生成游戏关卡：

### 1. 变量映射 (Variable Mapping)
- **Sim Input** → **Game 手牌**: 所有的 `inputs` 自动转化为玩家的可视化操作。
- **Sim State** → **Game 指标**: `health_points` 映射为红条，`research_progress` 映射为蓝条。
- **Sim Parameter** → **权重系数**: 影响环境牌抽取的频率 (Probability)。

### 2. 公式模式识别 (Dynamics Mapping)
引擎根据 `model.category` 自动识别转化模式：

| 动力学大类 | 转化策略 (RG Strategy) | 游戏表现 |
|-----------|----------------------|---------|
| `physiological` | 生命指标映射 | **生存模式**: 关注 HP (Health) 与状态条 (Glucose/Fever)。 |
| `socio_economic` | 循环流转映射 | **经营模式**: 关注 Money (Savings) 与 Efficiency (Productivity)。 |
| `environmental` | 危机响应映射 | **策略模式**: 关注 Safety (Score) 与 Progress (Rescue)。 |
| `risk` | 冲突博弈映射 | **对抗模式**: 关注 Stability (Gauge) 与 Conflict (War Intensity)。 |
| `simple` | 线性增长映射 | **教学模式**: 关注 Mastery (Process) 与 Quality (Freshness)。 |

### 3. P1-P5 数值简化原则
- **归一化**: 将大数（如 $10^6$ 人口）简化为百分比或 0-100 的数值。
- **离散化**: 忽略微小的波动，只保留对游戏平衡有影响的截断值。
- **感性化**: 将 $RR=14.0$ 转化为“极高风险”的视觉提示及卡牌权重提升。

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
    def load_story(self, story_file: str) -> ModStructure:
        """加载剧情，自动处理imports和patches"""
        story = self.load_yaml(story_file)
        
        # 1. 加载所有imports
        merged_model = self.fetch_with_imports(story['imports'])
        
        # 2. 应用patches
        if 'patches' in story:
            self.apply_patches(merged_model, story['patches'])
        
        # 3. 合并story的simulator配置
        if 'simulator' in story:
            merged_model.simulator.update(story['simulator'])
        
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
def validate_story(self, story_data: dict) -> bool:
    """验证故事文件完整性"""
    errors = []
    
    # 检查必需字段
    if 'imports' not in story_data:
        errors.append("Story must have 'imports' field")
    
    # 检查patch目标存在
    if 'patches' in story_data:
        for mod_name in story_data['patches'].keys():
            if mod_name not in story_data.get('imports', []):
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

### 科普工作流（Story层）

```mermaid
graph LR
    A[选择历史事件] --> B[查找可用模型]
    B --> C[编写story YAML]
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
| **Story** | Desmos/PhET/Hearthstone | 教育/游戏级易用性，一键体验，卡牌交互 |
| **整体** | 文明系列 | Story = 剧本，Core = 游戏引擎 |

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

## 📚 相关文档

- **建模设计手册**: [model.md](model.md)
- **系统概览**: [README](../README.md)

---

## 🤝 贡献指南

### 科研者（Core层）
1. 阅读 `mod_structure.md`
2. 在 `mods/core/` 创建新模型
3. 运行 `lifematters-loader --validate`
4. 提交Pull Request

### 游戏设计者（Story层）
1. 浏览 `mods/core/` 可用模型
2. 在 `mods/stories/` 创建剧情YAML和各类Card YAML
3. 启动 `npm run dev` 在本地Web端测试卡牌流程与状态流转
4. 分享到社区

---

## 💡 常见问题

**Q: 为什么不用JSON？**  
A: YAML支持注释，更适合人类编辑和文档化。

**Q: Patch会导致Core层臃肿吗？**  
A: 不会。Patch只存在Story层，Core保持简洁。

**Q: 如何避免小狼毫式的字段丢失？**  
A: 使用字段级merge而非整体替换，参见 `apply_patches()` 实现。

---

**文档维护**: 按照业务变动实时修改  
**反馈渠道**: GitHub Issues / 项目讨论组
