为了帮助您调试更新的 `mod_structure.py`、`loader_cli.py` 和 `loader_engine.py`，我将提供一组必要的调试命令，涵盖以下目标：

1. **验证 `imports` 递归加载**：确保 `mod_structure.py` 正确处理 `imports` 字段，根模型覆盖子模型的同名字段。
2. **测试循环依赖检测**：确认 `mod_structure.py` 和 `loader_engine.py` 能检测循环依赖。
3. **检查 CLI 输出**：验证 `loader_cli.py` 正确显示模型信息（包括 `hooks`、`optimizer_method` 和 `extra_deps`）。
4. **测试合并功能**：确保 `loader_engine.py` 和 `mod_structure.py` 正确合并多个模型。
5. **验证时间单位警告**：检查 `mod_structure.py` 是否对未使用时间单位的 `dt` 发出警告。
6. **测试模型加载和仿真**：确保加载的模型可以运行单步仿真。

以下是调试命令，假设您的项目目录结构如下：
```
LifeMatters/
├── mods_med/
│   ├── physiology/
│   │   ├── metabolism.yaml
│   │   ├── nutrition_intake.yaml
│   │   ├── glucose_regulation.yaml
│   │   ├── circular_a.yaml
│   │   ├── circular_b.yaml
├── lang/
│   ├── zh-Hans.yaml
├── mod_structure.py
├── loader_cli.py
├── loader_engine.py
├── lang_manager.py
```

### 前置准备：测试模型文件
为了调试，您需要创建以下测试模型文件（在 `mods_med/physiology/` 下）以覆盖关键场景。如果已有类似文件，可直接使用。

1. **metabolism.yaml**（主模型，包含 `imports`）：
```yaml
imports:
  - nutrition_intake
  - glucose_regulation
metadata:
  name: metabolism
  version: 2.1.0
  author: Minghui Wu
  description: 基础代谢率、能量消耗和运动影响
  conflicts: []
  tags: [metabolism, energy]
variables:
  blood_glucose:
    description: Blood glucose level
    value: 100.0
    type: state
    unit: mg/dL
    bounds: [0.0, 500.0]
  protein_intake:
    description: Daily protein intake
    value: 50.0
    type: parameter
    unit: g
    bounds: [0.0, 200.0]
formulas:
  glucose_decay:
    description: Blood glucose decays hourly
    dynamics:
      blood_glucose: blood_glucose - 0.01 * (dt / HOUR)
simulator:
  dt: 3600
  dt_unit: hour
  steps: 100
  output_format: yaml
  hooks:
    - post_step: check_metabolic_state
optimizer:
  method: nsga2
  python_envs:
    - pymoo: ">=0.6.0"
    - matplotlib: ">=3.5.0"
  targets:
    - max_happiness
    - min_health_risk
  parameters_to_optimize:
    - protein_intake
```

2. **nutrition_intake.yaml**（子模型，变量重叠）：
```yaml
imports: []
metadata:
  name: nutrition_intake
  version: 1.0.0
  author: LifeMatters
  description: 营养摄入模型
variables:
  protein_intake:
    description: Overwritten protein intake
    value: 0.0
    type: parameter
    unit: g
    bounds: [0.0, 100.0]
formulas: {}
simulator: {}
optimizer: {}
```

3. **glucose_regulation.yaml**（子模型，公式重叠）：
```yaml
imports: []
metadata:
  name: glucose_regulation
  version: 1.0.0
  author: LifeMatters
  description: 血糖调节模型
variables:
  insulin_sensitivity:
    description: Insulin sensitivity
    value: 1.0
    type: parameter
    unit: null
    bounds: [0.0, 2.0]
formulas:
  glucose_decay:
    description: Overwritten glucose decay
    dynamics:
      blood_glucose: blood_glucose - 0.02 * dt  # 未使用时间单位，应触发警告
simulator: {}
optimizer: {}
```

4. **circular_a.yaml**（循环依赖测试）：
```yaml
imports:
  - circular_b
metadata:
  name: circular_a
  version: 1.0.0
  description: 测试循环依赖
variables:
  var_a:
    description: Variable A
    value: 1.0
    type: state
formulas: {}
simulator: {}
optimizer: {}
```

5. **circular_b.yaml**（循环依赖测试）：
```yaml
imports:
  - circular_a
metadata:
  name: circular_b
  version: 1.0.0
  description: 测试循环依赖
variables:
  var_b:
    description: Variable B
    value: 2.0
    type: state
formulas: {}
simulator: {}
optimizer: {}
```

### 调试命令
以下命令假设您在项目根目录运行，Python 环境已安装核心依赖（`PyYAML`、`numpy`、`asteval`）。命令分为 CLI 测试和 Python 脚本测试两部分。

#### 1. CLI 测试命令
这些命令使用 `loader_cli.py` 测试模型加载、合并和列表显示功能。

- **列出所有模型（验证基本扫描和输出）**：
  ```bash
  python loader_cli.py --list --folder physiology --lang zh-Hans
  ```
  **预期输出**：
  ```
  可用模型 (5)：
  名称                           变量       公式       临界条件    版本      钩子       优化器         额外依赖    状态
  ------------------------------------------------------------------------------------------------------------------------------------------------------
  metabolism                    2         1         0         2.1.0     1         nsga2         2         基础代谢率、能量消耗和运动影响
  nutrition_intake              1         0         0         1.0.0     0         N/A           0         营养摄入模型
  glucose_regulation            1         1         0         1.0.0     0         N/A           0         血糖调节模型
  circular_a                    1         0         0         1.0.0     0         N/A           0         测试循环依赖
  circular_b                    1         0         0         1.0.0     0         N/A           0         测试循环依赖
  ```
  **调试点**：检查 `hooks`（1 for metabolism）、`optimizer_method`（nsga2 for metabolism）和 `extra_deps`（2 for metabolism）是否正确显示。

- **加载单一模型（验证 `imports` 递归加载）**：
  ```bash
  python loader_cli.py --file metabolism --folder physiology --lang zh-Hans
  ```
  **预期输出**：
  ```
  ✓ 模型 metabolism 已加载
    变量数: 2
    公式数: 1
    钩子数: 1
    优化器: nsga2
    额外依赖: 2
    版本: 2.1.0
    状态: 基础代谢率、能量消耗和运动影响
  ```
  **调试点**：
  - 确认 `protein_intake` 的值来自 `metabolism.yaml`（50.0），而非 `nutrition_intake.yaml`（0.0），验证根模型覆盖。
  - 检查 `glucose_decay` 公式来自 `metabolism.yaml`（含 `dt / HOUR`），且日志中有 `glucose_regulation.yaml` 中 `dt` 未使用时间单位的警告。

- **合并多个模型（验证合并逻辑）**：
  ```bash
  python loader_cli.py --file metabolism nutrition_intake --merge-to merged.yaml --folder physiology --lang zh-Hans
  ```
  **预期输出**：
  ```
  ✓ 合并成功，变量数: 2，公式数: 1，钩子数: 1，优化器: nsga2，额外依赖: 2，输出到: merged.yaml
  ```
  **调试点**：
  - 检查 `merged.yaml` 是否包含 `imports: [nutrition_intake, glucose_regulation]`，且 `variables` 和 `formulas` 正确合并。
  - 验证 `protein_intake` 和 `glucose_decay` 来自 `metabolism.yaml`。

- **测试循环依赖**：
  ```bash
  python loader_cli.py --file circular_a --folder physiology --lang zh-Hans
  ```
  **预期输出**：
  ```
  ✗ 加载模型失败: 循环依赖检测到: circular_a
  ```
  **调试点**：确认 `mod_structure.py` 的 `visited` 和 `loader_engine.py` 的 `loaded_models` 正确抛出循环依赖错误。

- **测试空文件夹**：
  ```bash
  python loader_cli.py --list --folder nonexistent_folder --lang zh-Hans
  ```
  **预期输出**：
  ```
  ✗ 在文件夹 nonexistent_folder 中未找到模型
  ```
  **调试点**：验证错误处理和多语言输出。

#### 2. Python 脚本测试命令
这些脚本直接调用 `LoaderEngine` 和 `ModStructure`，用于更细粒度的调试。

- **测试递归加载和合并**：
  ```python
  from loader_engine import LoaderEngine
  from mod_structure import ModStructure
  import yaml

  engine = LoaderEngine(mods_directory="mods_med", language="zh-Hans")
  model = engine.fetch("metabolism", folder="physiology")
  if model:
      print("元数据:", model.metadata)
      print("变量:", {k: v.__dict__ for k, v in model.variables.items()})
      print("公式:", {k: v.__dict__ for k, v in model.formulas.items()})
      print("模拟器:", model.simulator)
      print("优化器:", model.optimizer)
  else:
      print("加载失败")
  ```
  **预期输出**（简略）：
  ```
  元数据: ModelMetadata(name='metabolism', version='2.1.0', author='Minghui Wu', description='基础代谢率、能量消耗和运动影响', conflicts=[], tags=['metabolism', 'energy'])
  变量: {'blood_glucose': {'description': 'Blood glucose level', 'value': 100.0, 'type': <VariableType.state: 'state'>, 'unit': 'mg/dL', 'bounds': [0.0, 500.0]}, 'protein_intake': {'description': 'Daily protein intake', 'value': 50.0, 'type': <VariableType.parameter: 'parameter'>, 'unit': 'g', 'bounds': [0.0, 200.0]}}
  公式: {'glucose_decay': {'description': 'Blood glucose decays hourly', 'condition': True, 'priority': 0, 'dynamics': {'blood_glucose': 'blood_glucose - 0.01 * (dt / HOUR)'}, 'formula': None}}
  模拟器: {'dt': 3600, 'dt_unit': 'hour', 'steps': 100, 'output_format': 'yaml', 'hooks': [{'post_step': 'check_metabolic_state'}]}
  优化器: {'method': 'nsga2', 'python_envs': ['pymoo: >=0.6.0', 'matplotlib: >=3.5.0'], 'targets': ['max_happiness', 'min_health_risk'], 'parameters_to_optimize': ['protein_intake']}
  ```
  **调试点**：
  - 确认 `protein_intake` 的值是 50.0（来自 `metabolism.yaml`）。
  - 检查日志是否有 `glucose_regulation.yaml` 中 `dt` 未使用时间单位的警告。
  - 验证 `simulator` 和 `optimizer` 字段正确加载。

- **测试单步仿真**：
  ```python
  from loader_engine import LoaderEngine
  from mod_structure import ModStructure

  engine = LoaderEngine(mods_directory="mods_med", language="zh-Hans")
  model = engine.fetch("metabolism", folder="physiology")
  if model:
      model.step(dt=3600)  # 1 小时
      print("当前状态:", model.get_current_state())
  else:
      print("加载失败")
  ```
  **预期输出**：
  ```
  当前状态: {'blood_glucose': {'value': 99.9, 'unit': 'mg/dL', 'description': 'Blood glucose level'}, 'protein_intake': {'value': 50.0, 'unit': 'g', 'description': 'Daily protein intake'}}
  ```
  **调试点**：
  - 确认 `blood_glucose` 按公式 `blood_glucose - 0.01 * (dt / HOUR)` 减少到 99.9（dt=3600 秒，1 小时）。
  - 检查 `variable_history` 是否记录了 `[100.0, 99.9]`。

- **测试合并模型**：
  ```python
  from loader_engine import LoaderEngine

  engine = LoaderEngine(mods_directory="mods_med", language="zh-Hans")
  result = engine.merge_models_by_names(["metabolism", "nutrition_intake"], output_path="merged.yaml", folder="physiology")
  if result["success"]:
      print(f"合并成功: 变量数={result['variables']}, 公式数={result['formulas']}")
      with open("merged.yaml", "r", encoding="utf-8") as f:
          print(yaml.safe_load(f))
  else:
      print(f"合并失败: {result['error']}")
  ```
  **预期输出**（简略）：
  ```
  合并成功: 变量数=2, 公式数=1
  {'imports': [], 'metadata': {...}, 'variables': {'blood_glucose': {...}, 'protein_intake': {'value': 50.0, ...}}, 'formulas': {'glucose_decay': {...}}, 'simulator': {...}, 'optimizer': {...}}
  ```
  **调试点**：
  - 确认 `merged.yaml` 中 `protein_intake` 的值是 50.0（`metabolism.yaml` 覆盖 `nutrition_intake.yaml`）。
  - 检查 `simulator` 和 `optimizer` 是否来自 `metabolism.yaml`。

- **测试循环依赖**：
  ```python
  from loader_engine import LoaderEngine

  engine = LoaderEngine(mods_directory="mods_med", language="zh-Hans")
  model = engine.fetch("circular_a", folder="physiology")
  print("加载结果:", model)
  ```
  **预期输出**：
  ```
  加载结果: None
  ```
  **调试点**：检查日志是否记录 “检测到循环依赖: circular_a”。

#### 3. 日志调试
启用详细日志以捕获警告和错误：
```bash
export PYTHON_LOG_LEVEL=DEBUG
python -m logging loader_cli.py --list --folder physiology --lang zh-Hans
```
**调试点**：
- 查找 `glucose_regulation.yaml` 的时间单位警告：
  ```
  WARNING: 公式 glucose_decay: 'dt' 用于 blood_glucose 的动态中未指定时间单位 (e.g., HOUR)。假设 dt 以秒为单位。
  ```
- 查找循环依赖错误（运行 `circular_a` 测试时）：
  ```
  ERROR: 检测到循环依赖: circular_a
  ```

### 调试注意事项
1. **环境准备**：
   - 确保安装了依赖：`pip install PyYAML numpy asteval logging`
   - 确保 `lang/zh-Hans.yaml` 包含必要的翻译键（如 `table_hooks`、`table_optimizer`、`table_deps`），否则可能导致 KeyError。如果缺失，我可以提供翻译文件示例。

2. **文件路径**：
   - 调整 `mods_directory`（默认 `mods_med`）和 `folder`（默认 `physiology`）以匹配您的实际目录结构。
   - 确保测试模型文件存在，否则 `find_model_file` 会返回 None。

3. **潜在问题**：
   - 如果 `split_model` 未实现，运行 `--split-to` 会失败。建议实现 `ModStructure.split_model`（如前所述）或暂时禁用 `split_model` 相关命令。

4. **扩展测试**：
   - 测试多目标优化配置：检查 `optimizer.python_envs` 和 `parameters_to_optimize` 是否正确加载。
   - 测试钩子执行：在 `mod_structure.py` 中模拟 `check_metabolic_state` 钩子，验证 `hooks['post_step']` 触发。
