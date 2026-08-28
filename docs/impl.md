# 实现细节

> 本文档记录 Loader 模块的数据加载/组装机制，以及仿真引擎运行时若干未在 [design.md](design.md) 展开的实现细节（方程执行顺序、入仿真前的模型校验、GUI/CLI 接口层约束、中间结果暂存、编辑态与运行态快照）。
> 整体数据流全景见 [design.md](design.md)；优化器设计见 [opt.md](opt.md)；校验层与插件系统的内部结构见 [architecture.md](architecture.md)。

## Loader 模块（数据加载与组装）

Loader 是静态 YAML 与动态仿真环境的桥梁，负责解析 `models/source/` 和 `models/stories/` 中的模型，处理依赖导入，在内存中组装完整可执行的 `ModelStructure`。

### 跨模型数据调用原则

- **`components/` 层**：只声明自己的变量和方程，不引用其他模型。
- **`stories/` 层**：`imports` 多个 model，通过 `patches` 覆写参数。

这避免模型间耦合，符合单一职责原则。

### 表达式求值架构（⭐⭐ 核心约束）

**asteval 是方程表达式的安全沙箱层，不可用 Python 原生 `eval()` 直接替代。**

YAML 方程来自建模者手写，属于"不可信用户输入"。asteval 提供：
- 无访问文件系统、网络、`__import__` 等危险操作的隔离执行环境
- 内置数学函数（`sin`/`cos`/`max`/`min` 等）的安全版本
- 语法错误的可控捕获，不会导致整个引擎崩溃

#### 运行时分层

| 层 | 工具 | 职责 |
|----|------|------|
| **验证层**（加载时） | `asteval` | 解析 + 语法检查；检测未定义变量 |
| **编译层**（首次 step 前） | `ast.parse` + `exec` | 将表达式转为 Python 函数（`_build_equation_cache`） |
| **执行层**（每步） | 原生 Python 函数调用 | `fn(*args)`，变量走 LOAD_FAST |
| **回退层**（编译失败时） | `asteval.eval()` | 不中断仿真，保持兼容性 |

**禁止**：用 `eval(expr, symtable)` 或 `eval(compile(expr, ...), globals)` 直接替代 `asteval.eval()`，即使表达式已来自 YAML。asteval 在验证层和回退层不可绕过，见 ADR 0024、ADR 0068、ADR 0070。

### 变量命名冲突处理

多模型合并时：
- **根模型（调用方）**定义的变量和方程**始终覆盖**被导入模型中的同名定义。
- 语义歧义的同名变量（如两个模型都定义 `body_weight`）发出警告，要求在 `patches` 中明确指定。

### 架构约束检测

- 禁止循环依赖（`A imports B imports A`）。
- 禁止 `models/` 层 import `stories/` 层。
- `models/` 层若包含 `optimizer` 字段，给出警告，建议迁移至 story 层。

### Evidence 换算（加载期自动完成）

Loader 遍历 YAML `variables:` 中声明了 `evidence_type` 字段的条目，按该字段执行换算，换算结果原地写回 `self.variables`（`type` 仍是 `parameter`，不加 `_effective` 后缀），`equations`/`dynamics` 直接用该名字引用。8 种子类型的具体换算方程、溯源字段（`evidence_type`/`evidence_raw_value`）、已知实现细节（如 `hr` 的 `baseline_ref` 在基础换算路径上不校验目标类型）见 [evidence/conversion.md](evidence/conversion.md)；把换算结果自动接入某个状态变量 dynamics 的 `applies_to` 机制（校验顺序、生成的表达式模板、`rate_unit`/`step_unit` 换算）见 [evidence/applies_to.md](evidence/applies_to.md)。

### Metadata description

`metadata.description` 在运行时保持原始结构：可以是字符串，也可以是映射对象。后端只做类型校验，不固定字段集合，不补空字段。前端 Overview 页负责把字符串显示为单行 `Brief`，或按映射对象在 YAML 中的字段顺序显示所有非空字段。

推荐字段名见 `model_design.md`，但 Loader 和 Simulator 不依赖这些推荐字段；新增字段会按 key 自动生成英文标签。

### 方程预编译为 Python 函数（ADR 0068）

模型加载后首次调用 `step()` 时，`_build_equation_cache()` 对每条方程执行一次预编译：

1. `ast.parse()` 提取表达式引用的变量名（模型变量 + 步长符号）
2. `exec()` 在隔离命名空间中生成具名参数函数：
   ```python
   def _fn(blood_glucose, uptake, utilization, step): return blood_glucose + (uptake - utilization) * step
   ```
3. 缓存 `(fn, [param_names])` 和排好序的方程列表

每步调用 `fn(*[_get_arg(n) for n in params])`，变量通过位置参数传入，Python 内部走 `LOAD_FAST`，无字典查找开销。编译失败时回退到 `asteval.eval()`。

---

## 仿真引擎运行时

### 方程执行顺序

多个方程更新同一变量时，通过 `priority` 字段控制执行顺序：
- 数字越小越先执行（如 `-100` 先于 `0`）。
- 并行冲突变量用 `asteval` 顺序求值，避免隐式 race condition。

### 模型校验（入仿真前）

> 以下是历史设计草稿描述的统计校验构想（前向仿真统计发病率、与文献分组对比、对照 KM/RCT 结果），未实现，也不在当前路线图上。

当前实际实现是纯结构校验（`metadata`/`variables`/`equations` 字段是否存在、类型是否正确、`dynamics` 引用的变量是否已定义等），不涉及任何统计计算：

```bash
GET /api/validate/{file_path}
POST /api/validate
```

（`reference_engine/src/routes/files.py::_simple_yaml_validate`）校验未通过时返回错误列表，前端据此阻止进入仿真。

### 接口层约束（⭐⭐ 核心约束）

**GUI（`gui/`）是面向人类研究者的主接口；CLI（`cli/`）是面向 AI/自动化场景的正式公开接口
（ADR 0101，修订 ADR 0072 的"CLI 不是正式接口"表述）。两者共用同一个引擎层，结果一致性由
`test_verification/test_sim_cli_consistency.py` 自动回归验证（ADR 0111）。**

```
人类用户 → gui（React）→ HTTP API（api_server.py）→ 引擎层（Python）
AI/脚本  → cli（lm-sim）─────────────────────────→ 引擎层（Python）
```

- **GUI 才有的能力不下沉到 CLI**：图表、交互调参、历史存档等仍只在 GUI 实现（见 `cli.md`"与 GUI 的关系"表）
- **不把 CLI 作为测试入口**：测试直接 import 引擎层函数，不经 CLI 解析层（ADR 0072）
- `optimizer_cli.py` 等内部调试文件暂留，不随代码发布，不在文档中介绍

背景与决策理由见 ADR 0072、ADR 0101。

### 中间结果暂存（models/temp/）

opt 和仿真产生的中间文件存入 `models/temp/{job_id}/`，不依赖用户账号体系：

```
models/temp/
  {job_id}/
    input_override.yaml   # opt 写回的 input，可直接喂给 sim
    charts/               # 图表文件
    result.csv
```

**前后端约定：**
- 后端创建任务时生成 `job_id`（uuid）并返回
- 前端将 `job_id` 存入 `localStorage`，刷新后可恢复
- `GET /api/download/result/{job_id}/{filename}` 触发浏览器下载
- 后端启动时清理超过 24h 的 temp 子目录

详见 ADR 0061。

### 编辑态刷新与运行态快照

Simulator 的前端状态分为两类：

- **编辑态 UI 状态**：当前选中的 YAML、左侧树展开、tab、面板开合、字号、输入配置等，可以保存在 `localStorage`。
- **源模型内容**：YAML 原文、resolved imports、变量、方程、`simulation`、`optimizer`，每次选择或手动刷新时都从后端重新读取，不把旧内容作为长期缓存。

仿真运行开始后，后端 session 持有启动时的 resolved model 对象，作为本次运行快照。之后即使 YAML 文件发生变化，已有 session 也不会半路切换模型；新建 session 才会读取新版 YAML。

页面刷新或短暂断开后，前端可用本地保存的 `sessionId` 调用：

```
GET /api/simulation/session/{session_id}
```

如果后端 session 仍存在，则恢复已有轨迹、进度、输出变量和随机种子；如果 session 已过期或后端重启，则保留本地最后一次静态结果供查看，但不能继续运行。

Game 派生应用采用同一原则：选关/编辑态刷新 story/card YAML；一旦开局，当前对局固定开局时的 story/card snapshot，恢复页面时恢复对局状态。源文件更新只影响新开局，不污染进行中的牌局。

详见 ADR 0064。
