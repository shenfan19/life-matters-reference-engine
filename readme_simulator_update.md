# LifeMatters Simulator 更新说明

## 主要变更

### 1. 关键字更新
- **`dt`** → **`step_size`**：时间步长参数统一命名
- **`steps`** → **`total_time`**：改用总仿真时间（秒）代替步数
- **`output_format`**：锁定为 **`csv`**，自动生成 CSV 格式输出

### 2. CSV 输出格式
生成的 CSV 文件包含以下列：
1. **step**：仿真步数（从 1 开始）
2. **time**：仿真时间（秒）
3. **output_variables**：模型中 `simulator.output_variables` 指定的变量值

示例 CSV：
```csv
step,time,blood_glucose,plasma_insulin,body_water
1,3600,100.5,15.2,42.0
2,7200,98.3,14.8,42.1
3,10800,99.1,15.0,42.0
```

### 3. YAML 模型配置更新

#### 旧格式（已弃用）：
```yaml
simulator:
  dt: 3600  # 时间步长
  steps: 8760  # 总步数
  output_format: yaml
```

#### 新格式：
```yaml
simulator:
  step_size: 3600  # 时间步长（秒），例如 3600 = 1 小时
  total_time: 31536000  # 总仿真时间（秒），例如 31536000 = 1 年
  output_format: csv  # 锁定为 CSV
  output_variables:  # 必须指定要输出的变量
    - blood_glucose
    - plasma_insulin
    - body_water
  monitor_conditions:
    - blood_glucose < 70
```

### 4. CLI 使用示例

#### 运行仿真（默认输出到 `mods/output/`）：
```bash
python simulator_cli.py --file digestive --time 8760 --lang zhhans
# 输出：mods/output/digestive_simulation.csv
```

#### 指定 CSV 输出路径：
```bash
python simulator_cli.py --file physiology/obesity_diabetes --time 4380 --output results/my_simulation.csv
```

#### 交互式仿真（每 100 步暂停）：
```bash
python simulator_cli.py --file digestive --time 8760 --pause-every 100 --interactive
```

### 5. 编程接口示例

```python
from simulator_engine import SimulatorEngine

# 初始化引擎
engine = SimulatorEngine("mods", language="zhhans")

# 运行仿真
result = engine.run_simulation(
    model_name="digestive",
    time_hours=8760,  # 1 年
    folder="physiology",
    output_path="results/simulation.csv"
)

if result["success"]:
    print(f"仿真完成！")
    print(f"总步数: {result['steps']}")
    print(f"总时间: {result['time']/3600:.2f} 小时")
    print(f"CSV 文件: {result['csv_output']}")
    print(f"输出变量: {result['output_variables']}")
```

### 6. 时间单位常量（保持不变）

在公式中使用时间步长：
```yaml
formulas:
  glucose_decay:
    description: 血糖每小时衰减
    dynamics:
      blood_glucose: blood_glucose - 0.01 * (step_size / HOUR)
```

可用常量：
- `SECOND` = 1
- `MINUTE` = 60
- `HOUR` = 3600
- `DAY` = 86400
- `WEEK` = 604800
- `MONTH` = 2592000
- `YEAR` = 31536000

### 7. 文件结构

仿真输出默认保存到：
```
mods/
  output/
    <model_name>_simulation.csv
    digestive_simulation.csv
    obesity_diabetes_simulation.csv
```

自定义输出路径：
```bash
python simulator_cli.py --file digestive --time 8760 --output custom/path/result.csv
```

### 8. 需要更新的其他文件

根据你的代码结构，可能还需要更新以下文件：

1. **`optimizer_engine.py`**：如果优化模块调用仿真引擎
2. **`interface_expert.py`**：Web 界面需要适配新的 CSV 输出
3. **`a_mod_rule.md`**：模型规则文档需要更新 `simulator` 字段说明
4. **其他 YAML 模型文件**：所有模型的 `simulator` 部分需要更新

### 9. 迁移清单

- [x] `simulator_engine.py` - 核心仿真引擎
- [x] `simulator_cli.py` - 命令行接口
- [x] `simulation.py` - 仿真逻辑（`step` 方法）
- [x] `physiology.yaml` - 示例模型文件
- [ ] `optimizer_engine.py` - 优化引擎（如果调用仿真）
- [ ] `interface_expert.py` - Web 界面
- [ ] `a_mod_rule.md` - 模型规则文档
- [ ] 其他 YAML 模型文件

### 10. 向后兼容性

为了支持旧模型，可以在 `simulator_engine.py` 中添加兼容代码：

```python
# 兼容旧的 dt 参数
if 'dt' in self.current_model.simulator and 'step_size' not in self.current_model.simulator:
    step_size = self.current_model.simulator['dt']
    logger.warning("警告: 'dt' 已弃用，请使用 'step_size'")
else:
    step_size = self.current_model.simulator.get('step_size', 3600.0)

# 兼容旧的 steps 参数
if 'steps' in self.current_model.simulator:
    total_time = self.current_model.simulator['steps'] * step_size
    logger.warning("警告: 'steps' 已弃用，请使用 'total_time'")
else:
    total_time = self.current_model.simulator.get('total_time', 31536000.0)
```

## 测试建议

1. **单步测试**：验证 `step_size` 参数正确传递
2. **时间计算**：确认 `total_time` 正确转换为步数
3. **CSV 输出**：检查 CSV 文件格式和内容
4. **变量缺失**：测试 `output_variables` 中不存在的变量
5. **边界情况**：测试 0 步、1 步、极大步数

## 需要提供的其他文件

如果你需要我更新这些文件，请提供：
- `optimizer_engine.py`
- `interface_expert.py`
- `a_mod_rule.md`
- 其他使用 `simulator` 配置的 Python 文件
