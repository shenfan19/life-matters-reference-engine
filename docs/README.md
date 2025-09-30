# LifeMatters: 医学与社会学仿真建模框架

## 项目简介
LifeMatters 是一个模块化的仿真建模框架，面向医学与社会学研究，旨在从科研论文生成动力学模型，通过仿真验证和优化得出新结论，同时为普通用户提供交互式人生模拟体验。框架采用类游戏的 Modding 机制，支持通过 YAML 配置文件定义、优化和运行复杂模型，无需编程技能。它支持多语言（英文、中文等）和子文件夹模型加载，适用于学术研究、教育和科普。

LifeMatters 采用混合架构，包含离线工具（BioCraft、HealthTuner、Loader）和运行时服务（VitalSim），通过共享模型库实现高效协作。框架满足以下需求：
- 学术研究人员：验证和优化理论模型。
- 教育工作者：教授复杂系统概念。
- 普通用户：体验直观的人生模拟。

## 特性
- **科研与科普双定位**：支持研究人员验证模型，同时为非技术用户提供直观体验。
- **零编程门槛**：通过 YAML 配置文件驱动仿真，无需编码。
- **混合架构**：离线工具高效简洁，运行时服务支持动态控制。
- **多语言支持**：支持英文、中文等多种语言，CLI 和 GUI 输出可动态切换。
- **灵活扩展**：支持动态加载新模型和子文件夹模型（如 `mods_med/cancer_models`）。
- **跨领域应用**：适用于医疗研究（如疾病传播）、社会学分析（如政策影响）和教育培训。

## 快速开始
### 1. 获取项目
```bash
git clone https://github.com/shenfan19/life-matters.git
cd life-matters
```

### 2. 安装依赖
确保已安装 Python 3.8+，然后运行：
```bash
pip install PyYAML==5.4.1 numpy>=1.21.0 flet>=0.22.0 logging
```

### 3. 运行示例
启动 Web 界面：
```bash
python interface_expert.py
```
- 浏览器访问 `http://localhost:8550`。
- 选择模型（如 `DigestiveSystemAdvanced`），通过标签页查看仿真结果。

### 4. 自定义仿真
- 编辑 `mods` 目录中的 YAML 文件（如 `enhanced_yaml_config.yaml`）。
- 在 Web 界面或 CLI 中选择模型，运行仿真或调整参数。例如：
  ```bash
  python loader_cli.py --list --lang zh-Hans --folder physiology
  python generator_cli.py --generate risk_increase lung_cancer.yaml --param risk_name=lung_cancer risk_factor=smoking_status increase_rate=0.05
  ```

## 安装依赖
LifeMatters 的核心依赖统一管理，模型文件可通过 `optimizer.python_envs` 指定优化任务的额外依赖。

```bash
pip install PyYAML==5.4.1 numpy>=1.21.0 flet>=0.22.0 logging
```

**说明**：
- 核心依赖（如 `PyYAML`、`numpy`）支持仿真和基本优化任务。
- 优化任务可能需要额外依赖（如 `pymoo` 用于多目标优化），在模型文件的 `optimizer.python_envs` 中指定，Loader 模块可自动解析并安装。
- 推荐 Python 版本：3.8 或更高。

## 核心功能
### 1. BioCraft 模块
- **功能**：从科研论文或模板生成 YAML 模型，支持多语言字段生成。
- **依赖**：`loader_engine.py`、`lang_manager.py`、`PyYAML`。
- **CLI 示例**：
  ```bash
  python generator_cli.py --generate risk_increase lung_cancer.yaml --param risk_name=lung_cancer risk_factor=smoking_status increase_rate=0.05
  ```
- **编程接口**：
  ```python
  from generator_engine import GeneratorEngine
  engine = GeneratorEngine("mods_med")
  engine.generate_from_template("risk_increase", "lung_cancer.yaml", {"risk_name": "lung_cancer", "increase_rate": 0.05})
  ```

### 2. Loader 模块
- **功能**：扫描和加载 YAML 模型文件，处理变量、公式和 `imports`，支持子文件夹加载、递归依赖合并、循环依赖检测和多语言 CLI 输出。
- **依赖**：`lang_manager.py`、`PyYAML`。
- **CLI 示例**：
  ```bash
  python loader_cli.py --list --lang zh-Hans --folder physiology
  python loader_cli.py --folder physiology --merge-to merged.yaml
  python loader_cli.py --file physiology/obesity_diabetes.yaml --split-to split_dir
  ```
- **编程接口**：
  ```python
  from loader_engine import LoaderEngine
  engine = LoaderEngine("mods_med", language="zh-Hans")
  models = engine.scan_models_in_folder("physiology")
  result = engine.merge_models_by_names(["digestive", "diabetes"], "combined.yaml", folder="physiology")
  ```

### 3. VitalSim 模块
- **功能**：运行动态仿真，支持暂停、继续、参数调整、状态保存和事件应用。要求模型包含 `simulator` 字段，定义时间步长、步数和监控条件。
- **依赖**：`loader_engine.py`、`lang_manager.py`、`PyYAML`。
- **CLI 示例**：
  ```bash
  python player_cli.py --run digestive --steps 100 --lang zh-Hans --folder physiology
  ```
- **编程接口**：
  ```python
  from player_engine import PlayerEngine
  engine = PlayerEngine("mods_med", language="zh-Hans")
  result = engine.run_simulation("digestive", 100, folder="physiology")
  yaml.dump(result, open("result.yaml", "w"), allow_unicode=True)
  ```

### 4. HealthTuner 模块
- **功能**：优化模型参数（如最小化误差或多目标优化），调用 VitalSim 仿真引擎。要求模型包含 `optimizer` 字段。
- **依赖**：`player_engine.py`、`loader_engine.py`、`lang_manager.py`、`PyYAML`、模型指定的额外依赖（如 `pymoo`）。
- **CLI 示例**：
  ```bash
  python optimizer_cli.py --optimize digestive diabetes --target min_error --duration 60 --method grid --lang zh-Hans --folder physiology --output result.yaml
  ```
- **编程接口**：
  ```python
  from optimizer_engine import OptimizerEngine
  engine = OptimizerEngine("mods_med")
  engine.load_models(["digestive", "diabetes"])
  result = engine.optimize(duration=60.0, method="grid", folder="physiology")
  yaml.dump(result, open("result.yaml", "w"), allow_unicode=True)
  ```

## 模型结构
支持的 YAML 模型格式如下，详细规则参见 `a_mod_rule.md`。

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
- `imports`：支持递归加载，根模型覆盖导入模型的同名字段。
- `simulator`：必须存在于 VitalSim 加载的模型中，定义仿真参数。
- `optimizer`：必须存在于 HealthTuner 加载的模型中，定义优化参数。
- 时间步长使用保留单位（如 `HOUR`、`DAY`），详见 `a_mod_rule.md`。

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
- **统一数据加载**：所有模块通过 `loader.fetch()` 访问 YAML 文件。
- **多语言支持**：通过 `lang_manager.py` 实现动态语言切换。
- **简单优先**：除 VitalSim 外，其他模块为简单 CLI 工具。
- **Imports 支持**：支持递归依赖加载，包含循环依赖检测。

## 多语言支持
- **实现**：通过 `lang_manager.py` 提供动态语言切换，翻译文件存储在 `lang` 文件夹（如 `langs/en.yaml`、`langs/zh-Hans.yaml`）。
- **支持语言**：
  - `en`：英文
  - `zh-Hans`：简体中文
  - `zh-Hant`：繁体中文
- **添加新语言**：创建新文件（如 `langs/fr.yaml`），格式参考 `lang/en.yaml`。
- **CLI 示例**：
  ```bash
  python loader_cli.py --list --lang zh-Hans --folder physiology
  # 输出：可用模型 (2)：
  # 名称       变量  公式  临界条件  版本
  # digestive  18   10   2         2.0.0
  # diabetes   20   12   2         2.1.0
  ```

## 子文件夹支持
- **功能**：加载 `mods` 目录下指定子文件夹的 YAML 文件，不递归搜索。
- **CLI 示例**：
  ```bash
  python loader_cli.py --list --folder physiology
  python loader_cli.py --folder physiology --merge-to output.yaml
  ```
- **编程接口**：
  ```python
  engine = LoaderEngine("mods")
  models = engine.scan_models("physiology")
  ```

## 时间步长处理
- **基单位**：时间步长（`dt`）以秒为默认单位。
- **时间单位常量**：
  - `SECOND`：1 秒
  - `MINUTE`：60 秒
  - `HOUR`：3600 秒
  - `DAY`：86400 秒
  - `WEEK`：604800 秒
  - `MONTH`：2592000 秒
  - `YEAR`：31536000 秒
- **示例**：
  ```yaml
  formulas:
    glucose_decay:
      description: Blood glucose decays hourly
      dynamics:
        blood_glucose: blood_glucose - 0.01 * (dt / HOUR)
  ```
- **验证代码**：
  ```python
  def test_time_units():
      model = ModStructure()
      model.load_model_from_dict({
          'metadata': {'name': 'test', 'version': '1.0.0'},
          'variables': {'x': {'value': 100.0, 'type': 'state'}},
          'formulas': {'update_x': {'dynamics': {'x': 'x - 0.1 * (dt / HOUR)'}}}
      })
      model.step(dt=3600)  # 1 小时
      assert abs(model.variables['x'].value - 99.9) < 1e-6
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
- 增量合并：支持基于现有合并结果的更新。
- 冲突检测：增强模型间冲突检测。
- 模板生成：根据现有模型生成新模板。
- 可视化：图形化显示模型结构和依赖关系。
- 多语言扩展：支持更多语言（如法语、西班牙语）。

### 自定义扩展
- **事件**：
  ```python
  SimulationEvent(
      name="Custom Event",
      time=0,
      effects={"variable_name": effect_value}
  )
  ```
- **扩展接口**：
  ```python
  class LoaderEngineExtended(LoaderEngine):
      def detect_conflicts(self, model_names: List[str]) -> List[str]:
          pass
      def generate_template(self, base_model: str) -> str:
          pass
  ```

## 故障排除
- **模型加载失败**：检查 `mods_med` 目录和 YAML 文件格式（需 UTF-8）。
- **合并失败**：确保选择至少 2 个模型，检查输出路径权限。
- **循环依赖**：检查 `imports` 是否包含自身或循环引用。
- **GUI 异常**：确认 `flet` 库安装，推荐 Python 3.8+。
- **优化依赖缺失**：检查 `optimizer.python_envs` 中的包，手动安装（如 `pip install pymoo`）。

## 联系与支持
- **项目主页**：https://github.com/shenfan19/life-matters
- **问题反馈**：通过 GitHub Issue 提交。
- **文档**：参见 `a_mod_rule.md` 和模块文档（Loader、VitalSim、BioCraft、HealthTuner）。
- **社区讨论**：论坛（待建立）。

## 免责声明
LifeMatters 仅用于研究和教育目的，仿真结果需结合专业判断，不应直接用于实际决策。

## 引用格式
```
Life Matters Development Team. (2025). Life Matters: A Modular, Data-Driven Simulation Framework for Medical and Social Research. Version 1.0. [Software]. Available at: https://github.com/shenfan19/life-matters
```
