# LifeMatters: 医学与社会学仿真建模框架

## 项目概述
LifeMatters 是一个面向医学与社会学的仿真建模框架，旨在从科研论文生成动力学模型，通过仿真验证和优化得出新结论，并为普通用户提供交互式人生模拟体验。框架采用模块化设计，结合类游戏的 Modding 机制，允许用户通过 YAML 配置文件定义、优化和运行复杂模型，支持多语言（英文、中文等）和子文件夹模型加载。

软件采用混合架构，包含离线工具（BioCraft、HealthTuner、Loader）和运行时服务（VitalSim），通过共享模型库实现高效协作。BioCraft、HealthTuner 和 Loader 为独立 CLI 工具，执行后退出；VitalSim 提供运行时控制，支持暂停、继续和参数调整。框架满足学术研究人员验证理论模型、教育工作者教授复杂系统，以及普通用户体验人生模拟的需求，提供灵活、友好的解决方案。

## 为什么选择 LifeMatters？
- **科研与科普双定位**：支持研究人员验证与优化模型，同时为非技术用户提供直观体验。
- **混合架构**：离线工具简洁高效，运行时服务支持动态控制。
- **零编程门槛**：通过 YAML 配置文件驱动仿真，无需编码。
- **多语言支持**：支持英文、中文等多种语言，CLI 输出可动态切换。
- **灵活扩展**：支持动态加载新模型和子文件夹模型（如 `mods_med/cancer_models`），适用于多领域研究。

## 架构设计

### 分层结构
```
客户端界面层：Web GUI（生成、优化、仿真、加载）
离线 CLI 工具：BioCraft、HealthTuner、Loader（执行后退出）
运行时服务：VitalSim（CLI + 后台服务，支持运行时控制）
共享库层：Loader（通过 fetch() 加载 YAML，支持子文件夹和 imports）
存储层：YAML 文件（通过 loader.fetch() 访问，支持 imports 字段）
```

### 核心设计理念
- **单一运行时服务**：仅 VitalSim 支持暂停、继续和参数调整。
- **模块化调用**：HealthTuner 调用 VitalSim 仿真引擎进行优化。
- **统一数据加载**：所有模块通过 `loader.fetch()` 访问 YAML 文件，支持子文件夹和 `imports` 自动加载。
- **多语言支持**：通过 `lang_manager.py` 提供动态语言切换。
- **简单优先**：除 VitalSim 外，其他模块为简单 CLI 工具，执行后退出。
- **Imports 支持**：模型文件中的 `imports` 字段支持递归依赖加载，根模型的定义覆盖导入模型的同名字段，包含循环依赖检测。

## 安装依赖
LifeMatters 框架的核心依赖在安装时统一管理，模型文件可通过 `optimizer.python_envs` 指定优化任务的额外依赖。

```bash
pip install PyYAML==5.4.1 numpy>=1.21.0 flet>=0.22.0 logging
```

**说明**：
- 核心依赖（如 `PyYAML`、`numpy`）支持仿真和基本优化任务。
- 优化任务可能需要额外依赖（如 `pymoo` 用于多目标优化），在模型文件的 `optimizer.python_envs` 中指定，Loader 模块可自动解析并安装。

## 模型结构
支持的 YAML 模型格式如下。详细规则参见 `a_mod_rule.md`。

```yaml
metadata:
  name: "模型名称"
  version: "1.0.0"
  author: "作者"
  description: "描述"
  conflicts: []
  tags: []
imports:
  - model_name  # 导入模型，支持递归加载
variables:
  var_name:
    description: "变量描述"
    value: 0.0
    unit: "单位"
    type: "input/state/parameter"
    bounds: [min, max]
formulas:
  formula_name:
    description: "公式描述"
    condition: "触发条件"
    priority: 100
    dynamics:
      var_name: "变量更新表达式"
    # 或 formula: "静态公式表达式"
simulator:
  dt: 3600  # 时间步长（秒）
  dt_unit: hour  # 时间单位
  steps: 100  # 仿真步数
  output_format: yaml
  pause_every: 10  # 每 10 步暂停
  hooks:
    - post_step: function_name
  monitor_conditions:
    - condition_expression
optimizer:
  method: "grid"  # 优化方法
  python_envs:  # 优化任务额外依赖
    - package_name: ">=version"
  targets:
    - target_name
  pop_size: 20
  n_gen: 50
  duration: 60.0
  bounds: [[min1, max1], [min2, max2]]
  parameters_to_optimize:
    - var_name
```

**关键说明**：
- `imports`：支持递归加载，路径相对于当前模型文件目录（非 mods 根目录），根模型覆盖导入模型的同名字段（例如根的 abc=3 覆盖子的 abc=2）。
- 合并多个文件时，以第一个文件为根模型，后续文件覆盖根的同名字段，包括 variables、formulas、simulator 和 optimizer。
- `simulator`：必须存在于 VitalSim 加载的模型中，定义仿真参数。
- `optimizer`：必须存在于 HealthTuner 加载的模型中，定义优化参数，`python_envs` 指定额外依赖。
- 时间步长使用保留单位（如 `HOUR`、`DAY`），详见 `a_mod_rule.md`。

## Loader 模块
### 功能
- 扫描和加载 YAML 模型文件，处理变量、公式和 `imports`，支持子文件夹加载。
- 支持递归 `imports` 加载，自动合并模型，根模型覆盖导入模型的同名字段。
- 检测循环依赖，防止加载错误。
- 合并模型（通过 `--file` 或 `--folder`），可通过 `--merge-to` 导出到 YAML 文件。
- 支持多语言 CLI 输出。

### 依赖
- `lang_manager.py`：多语言支持。
- `PyYAML`：YAML 解析。

### 使用方法
- **CLI**：
  ```bash
  python loader_cli.py --list --lang zh-Hans --folder physiology  # 列出 physiology 文件夹中的模型
  python loader_cli.py --folder physiology --merge-to merged.yaml  # 合并 physiology 文件夹，以 physiology.yaml 为根
  python loader_cli.py --file physiology/obesity_diabetes physiology/obesity_diabetes_patch --merge-to combined.yaml  # 合并指定文件
  python loader_cli.py --folder physiology --merge-to merged.yaml  # 以 physiology.yaml 为根，加载所有 YAML 文件，忽略 imports
  python loader_cli.py --folder physiology cancer_models --merge-to merged.yaml  # 每个文件夹以同名文件为根，第一个为整体根
  python loader_cli.py --file physiology/obesity_diabetes.yaml --split-to split_dir  # 支持带扩展名
  ```
- **编程接口**：
  ```python
  from loader_engine import LoaderEngine
  engine = LoaderEngine("mods_med", language="zh-Hans")
  models = engine.scan_models_in_folder("physiology")
  details = engine.get_model_details(models, folder="physiology")
  result = engine.merge_models_by_names(["digestive", "diabetes"], "combined.yaml", folder="physiology")
  result = engine.merge_models_by_folder("physiology", None)  # 不导出
  ```

## BioCraft 模块
### 功能
- 从论文或模板生成 YAML 模型。
- 支持多语言字段生成。

### 依赖
- `loader_engine.py`：加载生成模型。
- `lang_manager.py`：多语言支持。
- `PyYAML`：YAML 生成。

### 使用方法
- **CLI**：
  ```bash
  python generator_cli.py --generate risk_increase lung_cancer.yaml --param risk_name=lung_cancer risk_factor=smoking_status increase_rate=0.05
  ```
- **编程接口**：
  ```python
  from generator_engine import GeneratorEngine
  engine = GeneratorEngine("mods_med")
  engine.generate_from_template("risk_increase", "lung_cancer.yaml", {"risk_name": "lung_cancer", "increase_rate": 0.05})
  ```

## VitalSim 模块
### 功能
- 运行动态仿真，支持暂停、继续、参数调整、状态保存和事件应用。
- 要求模型文件中存在 `simulator` 字段，定义时间步长、步数和监控条件。
- 支持多语言输出和临界条件监控（如低血糖警报）。
- 为优化器提供状态快照和参数调整接口。

### 依赖
- `loader_engine.py`：模型加载。
- `lang_manager.py`：多语言支持。
- `PyYAML`：YAML 输出。

### 使用方法
- **CLI**：
  ```bash
  python loader_cli.py --list --lang zh-Hans --folder physiology  # 只列出 physiology 文件夹当前目录的模型，不递归
  python loader_cli.py --folder physiology cancer_models --merge-to merged.yaml  # 每个文件夹以同名文件为根，包含 imports 和所有文件，第一个为整体根
  python loader_cli.py --folder physiology --merge-to merged.yaml  # 合并 physiology 文件夹（含 imports 和所有 YAML 文件）
  python loader_cli.py --file physiology/obesity_diabetes --split-to split_dir  # 生成 obesity_diabetes_patch.yaml
  python loader_cli.py --folder physiology --split-to split_dir  # 生成 mods/physiology/physiology_patch.yaml
  ```
- **编程接口**：
  ```python
  from player_engine import PlayerEngine
  engine = PlayerEngine("mods_med", language="zh-Hans")
  result = engine.run_simulation("digestive", 100, folder="physiology")
  yaml.dump(result, open("result.yaml", "w"), allow_unicode=True)
  ```

## HealthTuner 模块
### 功能
- 优化模型参数（如最小化误差或多目标优化），调用 VitalSim 仿真引擎。
- 要求模型文件中存在 `optimizer` 字段，定义优化方法、目标和额外依赖（`python_envs`）。
- 支持多语言输出和 YAML 结果保存。

### 依赖
- `player_engine.py`：仿真支持。
- `loader_engine.py`：模型加载。
- `lang_manager.py`：多语言支持。
- `PyYAML`：YAML 输出。
- 额外依赖（如 `pymoo`）在 `optimizer.python_envs` 中指定。

### 使用方法
- **CLI**：
  ```bash
  python optimizer_cli.py --optimize digestive diabetes --target min_error --duration 60 --method grid --lang zh-Hans --folder physiology --output result.yaml
  python optimizer_cli.py --optimize stress_health --method nsga2 --targets max_happiness min_health_risk --pop_size 50 --n_gen 100 --folder physiology
  ```
- **编程接口**：
  ```python
  from optimizer_engine import OptimizerEngine
  engine = OptimizerEngine("mods_med")
  engine.load_models(["digestive", "diabetes"])
  engine.set_optimization_target("min_error")
  result = engine.optimize(duration=60.0, method="grid", folder="physiology")
  yaml.dump(result, open("result.yaml", "w"), allow_unicode=True)
  ```

## 多语言支持
- **实现**：通过 `lang_manager.py` 提供动态语言切换，翻译文件存储在 `lang` 文件夹中（如 `langs/en.yaml`、`langs/zh-Hans.yaml`）。
- **语言代码**：
  - `en`：英文
  - `zh-Hans`：简体中文（中国大陆、新加坡）
  - `zh-Hant`：繁体中文（香港、台湾、澳门）
- **添加新语言**：创建新文件（如 `langs/fr.yaml`），文件名即语言代码，格式参考 `lang/en.yaml`。
- **CLI 使用**：通过 `--lang` 参数指定语言。
- **示例**：
  ```bash
  python loader_cli.py --list --lang zh-Hans --folder physiology
  # 输出：可用模型 (2)：
  # 名称                           变量       公式       临界条件    版本
  # digestive                     18        10        2         2.0.0
  # diabetes                      20        12        2         2.1.0
  ```

## 子文件夹支持
- **功能**：加载 `mods` 目录下指定子文件夹中的 YAML 文件，不递归搜索。
- **CLI 使用**：
  ```bash
  python loader_cli.py --list --folder physiology  # 只当前目录
  python loader_cli.py --folder physiology --merge-to output.yaml  # 只合并当前目录模型
  ```
- **编程接口**：
  ```python
  engine = LoaderEngine("mods")
  models = engine.scan_models("physiology")  # 只扫描当前目录
  ```

## 时间步长处理
- **基单位**：框架以秒为时间步长（`dt`）的默认单位，所有公式中的 `dt` 表示秒的增量。
- **时间单位常量**：模型支持以下保留字，用于缩放 `dt`：
  - `SECOND`：1 秒
  - `MINUTE`：60 秒
  - `HOUR`：3600 秒
  - `DAY`：86400 秒
  - `WEEK`：604800 秒
  - `MONTH`：2592000 秒（约 30 天）
  - `YEAR`：31536000 秒（约 365 天）
- **使用示例**：
  ```yaml
  formulas:
    glucose_decay:
      description: Blood glucose decays hourly
      dynamics:
        blood_glucose: blood_glucose - 0.01 * (dt / HOUR)  # 每小时衰减 0.01
  ```
- **编程验证**：
  ```python
  def test_time_units():
      model = ModStructure()
      model.load_model_from_dict({
          'metadata': {'name': 'test', 'version': '1.0.0', 'imports': []},
          'variables': {'x': {'value': 100.0, 'type': 'state'}},
          'formulas': {
              'update_x': {
                  'description': 'Update x hourly',
                  'dynamics': {'x': 'x - 0.1 * (dt / HOUR)'}
              }
          }
      })
      model.step(dt=3600)  # 1 小时
      assert abs(model.variables['x'].value - 99.9) < 1e-6  # 衰减 0.1
      model.step(dt=86400)  # 1 天
      assert abs(model.variables['x'].value - (99.9 - 0.1 * 24)) < 1e-6  # 每小时衰减 0.1，24 小时
  ```

## 性能优化
- **大规模仿真**：增大时间步长（`--dt` 或 `simulator.dt`）。
- **内存管理**：定期清理预警和事件历史。
- **批量加载**：
  ```python
  def load_models_batch(engine, batch_size=10):
      models = engine.scan_models_in_folder("physiology")
      for i in range(0, len(models), batch_size):
          yield engine.get_model_details(models[i:i+batch_size], folder="physiology")
  ```

## 扩展开发
### 计划功能
- **增量合并**：支持基于现有合并结果的增量更新。
- **冲突检测**：增强模型间的潜在冲突检测。
- **模板生成**：根据现有模型生成新模板。
- **可视化**：图形化显示模型结构和依赖关系。
- **多语言扩展**：支持更多语言（如法语、西班牙语）。

### 自定义扩展
- **事件**：
  ```python
  SimulationEvent(
      name="Custom Event",
      description="Event description",
      time=0,
      effects={"variable_name": effect_value}
  )
  ```
- **健康指标**：
  ```python
  if 'custom_variable' in self.state:
      value = self.state['custom_variable']
      # 添加自定义评估逻辑
  ```
- **扩展接口**：
  ```python
  class LoaderEngineExtended(LoaderEngine):
      def detect_conflicts(self, model_names: List[str]) -> List[str]:
          pass
      def generate_template(self, base_model: str) -> str:
          pass
      def export_documentation(self, model_names: List[str]) -> str:
          pass
  ```

## 故障排除
- **模型加载失败**：检查 `mods_med` 目录或子文件夹是否存在，确认 YAML 文件格式为 UTF-8。
- **合并失败**：确保至少选择 2 个模型，检查输出路径权限。
- **循环依赖**：检查 `imports` 是否包含自身或循环引用。
- **GUI 异常**：确认 `flet` 库安装，检查 Python 版本（推荐 3.8+）。
- **优化依赖缺失**：检查 `optimizer.python_envs` 中的包是否安装，可通过 `pip install package_name` 手动安装。

## 联系支持
- **技术问题**：检查日志，参考模块文档。
- **模型开发**：参考 Loader 和 BioCraft 文档。
- **功能建议**：提交 issue 或 pull request。

本指南提供 LifeMatters 框架的完整概述，详细规则请参阅 `a_mod_rule.md`，模块功能请参阅各模块文档（Loader、VitalSim、BioCraft、HealthTuner）。
