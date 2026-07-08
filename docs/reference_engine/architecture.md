# Reference Engine 内部架构：校验层与插件系统

> 本文档聚焦两个此前没有文档覆盖的内部模块：**校验层**（模型加载后的结构/格式检查）和
> **插件系统**（仿真结果的可选二次分析）。整体数据流全景见 [data_flow.md](data_flow.md)；
> 优化器设计见 [opt.md](opt.md)。
>
> 注意与 [ADR 0056 三层验证框架](decisions/0056-2026-05-04_project_three-tier-validation-framework.md)
> 的区分：ADR 0056 讲的是**模型科学有效性**的验证（数值精度/文献对标/优化合理性，供论文使用）；
> 本文档讲的是**代码层面的输入校验**（YAML 结构是否合法、日期/时间字符串格式是否正确），
> 两者是完全不同的概念，只是都叫"validation"。

---

## 1. 校验层

校验分成两个独立的模块，各自校验不同的东西，互不重叠：

| 模块 | 校验对象 | 调用时机 |
|---|---|---|
| [`model_structure/validator.py`](../../reference_engine/src/model_structure/validator.py) | 模型结构完整性（变量类型、公式变量引用、metadata 字段类型） | `LoaderEngine.fetch()` 加载模型后（`validate=True` 时，默认开启） |
| [`validation.py`](../../reference_engine/src/validation.py) | 日期/时间字符串格式（`YYYY-MM-DD`、`HH:MM`） | CLI/GUI 仿真或优化**开始运行前**，一次性调用 |

### 1.1 结构校验：`ModelStructure.validate_model()`

`Validator` 是 `ModelStructure` 的 mixin 之一（`class ModelStructure(Loader, Validator, Simulation)`），
`validate_model()` 内部按顺序跑三个子校验器，把所有错误收集起来一次性抛出，而不是遇到第一个错误就停：

```python
# model_structure/validator.py:333-349
validators = [
    ('Metadata', validate_metadata),
    ('Variables', validate_variables),
    ('Formulas', validate_formulas)
]
for section, validator in validators:
    valid, errors, missing_vars = validator()
    ...
if all_errors:
    raise ValueError(
        f"Model validation failed with {len(all_errors)} errors:\n- " +
        "\n- ".join(all_errors)
    )
```

三个子校验器各自检查：

- **`validate_metadata`**：`metadata.name/version/author` 必须是字符串，`description` 必须是字符串或字典（对应 `model.md` 的结构化 description 规范）。
- **`validate_variables`**：`value` 必须是数字、`type` 必须是合法的 `VariableType`、`bounds` 必须是长度为 2 且下界 ≤ 上界的数值区间、初始值必须落在 `bounds` 内、变量名必须是合法 Python 标识符（因为公式最终会编译成 Python 函数，见 [`simulation.py` 的 `_compile_expr_to_fn`](../../reference_engine/src/model_structure/simulation.py)）。
- **`validate_formulas`**：用 `ast.parse` 解析每条公式的 `condition` 和 `dynamics` 表达式，提取其中引用的变量名，检查是否都能在 `self.variables` 或 `self.formulas` 中找到；同时检查 `step_unit`——公式的 `dynamics` 一旦用到 `step`/`dt`/`step_size`，必须声明合法的 `step_unit`（`minute`/`hour`/`day`），且禁止使用废弃符号 `dt`/`step_size`（只允许 `step`）。

在校验模型公式前，还有一段独立的公式级检查（不属于 `validators` 列表，在 `validate_model()` 开头单独跑）：扫描每条公式的 `condition`/`dynamics` 里是否用了 `dt` 却没有搭配 `MINUTE`/`HOUR`/`DAY` 等时间单位常量，命中时只记 `logger.warning`，不算错误——这是历史遗留的宽松检查，晚于它的 `validate_formulas` 的 `step_unit` 强制校验已经是更严格的正式规则。

**当前实现中的两处观察**（记录现状，供后续人工判断是否需要处理）：

1. `validator.py` 里定义了 `validate_formulas_old_ver_bug()`（L132-228），但**没有出现在 `validators` 列表里，也没有任何其他调用点**——是一段不会执行的死代码，从函数名（`_old_ver_bug`）看应该是被 `validate_formulas()` 取代后遗留下来的旧实现，未清理。
2. "从表达式提取变量名"这个逻辑存在两份几乎相同的实现：[`model_structure/utils.py:19` 的模块级 `extract_vars_from_expr`](../../reference_engine/src/model_structure/utils.py)（被 `core.py` 的 `split_model` 和 `validator.py` 自身的 `self.extract_vars_from_expr` 包装方法共用）和 `validate_formulas()` 内部又局部定义了一份同名函数（validator.py:240-263），两者排除的内置符号集合略有差异（局部版本额外排除了 `MINUTE`/`HOUR`/`DAY`/`WEEK`/`MONTH`/`YEAR`/`pi`/`e`）。

### 1.2 日期/时间格式预校验：`validation.py`

这个模块解决的是一个具体问题：`schedule_runner.py` 和 `optimizer_engine.py` 在**逐步执行的热循环深处**解析日期/时间字符串（例如 `date.fromisoformat(sim_start_date)`），遇到格式错误时会**静默回退**到默认值（如 epoch `1900-01-01`，或整个优化窗口回退成 `total_time`），而不是报错。这意味着 `valid_start` 或 `time_start` 里的一个笔误，会在 CLI 和 GUI 两条路径上各自静默地改变仿真结果，且两边回退逻辑不一定完全一致。

`validation.py` 的做法是：在仿真/优化真正开始前，一次性遍历所有会被后续代码解析的日期/时间字段，格式不对就直接抛 `ValueError`，用一次报错代替两处可能分叉的静默回退。四个校验函数分别对应不同的数据来源：

| 函数 | 校验对象 | 被谁调用 |
|---|---|---|
| `validate_simulator_dates` | `simulator.start_date`/`end_date` | `reference_engine.py` 的 `run_simulation`/`run_simulation_mc`，`session_manager.py` 的 `start_session`，`optimizer_engine.py` |
| `validate_schedule_list` | regimen 列表里每个事件的 `time_start`/`time_end`/`valid_start`/`valid_end` | 同上（sim 路径） |
| `validate_optimizer_regimens` | `optimizer.startpoint.regimens` 里固定值和 `optimize:` 搜索窗口的时间/日期字段 | `optimizer_engine.run_optimizer` |

日期校验本身分两种严格度：`_check_date_strict`（标准 ISO 日期，用于 regimen 的 `valid_start`/`valid_end`）和 `_check_date_loose`（额外容忍年份为 0 的"古代日期"占位符，用于 `simulator.start_date`/`end_date`，因为 `loader.py`/`optimizer_engine.py` 的跨度计算显式支持这种近似算法，见 [loader.py:391-401](../../reference_engine/src/model_structure/loader.py)）。

---

## 2. 插件系统现状与后续可能

### 2.1 设计意图

`plugins/` 的设计目标是：后端 [`PluginManager`](../../reference_engine/src/plugin_manager.py) 扫描 `plugins/<name>/manifest.yaml` 自动发现插件，前端用一个通用组件根据 manifest 声明的输入 schema 渲染表单，调用 `/api/plugins/{id}/run` 拿结果展示——即"仿真跑完之后，用户可选地跑一个二次分析（因果推断、敏感性分析等），不需要为每种分析单独写一个 GUI 页面"。

### 2.2 当前状态：后端可用，前端零接入

**后端是完整可运行的**：

- [`PluginManager`](../../reference_engine/src/plugin_manager.py) 递归扫描 `plugins/` 下的 `manifest.yaml`（最多 2 层深度），`load_plugin`/`run_plugin` 动态 `importlib` 加载插件的 `backend.py` 并实例化执行。
- [`routes/plugins.py`](../../reference_engine/src/routes/plugins.py) 注册了 `/api/plugins`（列表）、`/api/plugins/{id}/ui-page`（插件自定义 UI 的 iframe 页面）、`/api/plugins/{id}/run`（执行）三个端点，`api_server.py` 里正常挂载。
- [`plugin_context.py`](../../reference_engine/src/plugin_context.py) 的 `PluginContext` 给插件提供了统一的日志/缓存/（可选）重新触发仿真的接口。
- 当前有两个真实插件：`plugins/sensitivity_analysis/`（对状态变量与目标变量算 Pearson 相关系数，输出龙卷风图数据，manifest 标注用于"Paper 2 第二层验证"）和 `plugins/post_causal_inference/`（Granger 因果检验，输出因果图边列表）。两者 manifest 都声明 `ui.type: none`，即不提供自定义 UI，只能通过 `DynamicForm.tsx` 这类通用表单驱动。

**前端完全没有接入**——用户在界面上找不到任何插件入口。具体是三处代码从未被使用：

1. [`gui/src/components/DynamicForm.tsx`](../../gui/src/components/DynamicForm.tsx)：唯一会调用 `/api/plugins/{id}/run` 的通用表单组件，在 `gui/src` 全树里零 import，没有任何页面渲染它。
2. `reference_engine/src/PluginLoader.tsx`：一个 React 组件，却放在 Python 后端目录里；零引用，文件首行自带注释 `// if delete? duplicated name with file in GUI`，说明这个疑问本来就悬而未决。
3. `gui/src/plugin_ui_server.py`：一个独立的 `FastAPI()` app（本意是给插件的自定义 UI 提供 iframe 独立页面），却放在前端目录里；全仓库零引用，从未被启动过。

（以上现状 2026-06-24 首次记录于 [`b_lm_home/tasks/2026-06-24_task_plugin-frontend-dead-code.md`](../../../b_lm_home/tasks/2026-06-24_task_plugin-frontend-dead-code.md)，2026-07-07 复核仍然成立。）

### 2.3 后续可能的两个方向

这是一个产品范围问题，不只是清理代码，目前尚未决定：

- **方向 A（补前端入口）**：删除 `PluginLoader.tsx` 和 `plugin_ui_server.py`（零引用、位置放错，无论后续方向如何都该删），保留插件系统整体架构，把 `DynamicForm.tsx` 接到某个实际页面上（例如模型工具栏、或独立的"插件"标签页），让现有的两个插件（敏感性分析、因果推断）变得可用。
- **方向 B（整体移除）**：判定插件功能属于从未真正落地的半成品，把 `plugins/` 子系统（`PluginManager`、`routes/plugins.py`、`plugin_context.py`、两个示例插件、`DynamicForm.tsx`、`PluginLoader.tsx`、`plugin_ui_server.py`）一并移除，等真正需要插件化的二次分析能力时重新设计。

选择哪个方向取决于"敏感性分析/因果推断这类仿真后二次分析"在产品路线图里的优先级，不是纯技术判断。
