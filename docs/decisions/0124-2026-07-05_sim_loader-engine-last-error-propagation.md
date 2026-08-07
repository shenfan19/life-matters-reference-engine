# 0124 — LoaderEngine 错误信息透传：`fetch()` 新增 `last_error`

**日期**：2026-07-05
**状态**：✅ 已接受

---

## 背景

审查引擎的错误检测机制时发现：`Loader`/`Validator`（`model_structure/loader.py`、
`model_structure/validator.py`）本身已经能生成具体、可读的错误信息（如"检测到循环
import"、"formula 缺少 step_unit"、"evidence 名称与 variables 重名"等），但 CLI/GUI
加载模型的唯一入口 `LoaderEngine.fetch()`（`loader_engine.py`）在 `except Exception as e`
分支里只把 `e` 写进日志，返回值是裸 `None`。

`ReferenceEngine.load_models()` 只返回 `self.loader.fetch(...) is not None` 这个布尔值，
再往上传到 `run_simulation`/`run_simulation_mc`/`run_simulation_all_plans`
（`reference_engine.py`）、`start_session`（`session_manager.py`）、`run_optimizer`
（`optimizer_engine.py`）时，全部退化成同一句硬编码兜底："无法加载模型：{model_name}"/
"Cannot load model: {model_name}"——具体原因只能翻日志文件，GUI 返回给前端的 JSON
`{"success": false, "error": "无法加载模型：xxx"}` 完全看不出问题出在哪。

这意味着"错误检测机制"在校验逻辑本身是完整的，但主调用路径上的错误信息传递有缺口——
检测到了，但没说清楚。

## 决策

给 `LoaderEngine` 增加 `self.last_error: Optional[str]` 属性：

- `fetch()` 开头重置为 `None`；三个失败分支（循环依赖、文件未找到、`load_model`/
  `validate_model` 抛出异常）各自把具体信息写入 `self.last_error`，再照常记日志、返回 `None`。
- 调用方（`reference_engine.py` 3 处、`session_manager.py` 1 处、`optimizer_engine.py`
  1 处）原来的硬编码兜底信息改为 `self.loader.last_error or f"无法加载模型：{model_name}"`
  ——`last_error` 有值就用它，没有（理论上不会发生，保留兜底防止空指针式的裸错误）才退回旧文案。

不改变 `fetch()`/`load_models()` 的返回类型（仍是 `Optional[ModelStructure]`/`bool`），
`last_error` 是旁路属性，不引入新的异常类型或返回值 schema 变化，向后兼容。

### 为什么不让 `fetch()` 直接抛异常

`fetch()` 现有调用方（`scan_models()` 批量扫描整库、`merge_models()`）依赖它"失败返回
`None`"的契约来跳过坏模型继续扫描下一个，改成抛异常会牵动这些调用点的 try/except
结构；只加一个可选的错误信息旁路，改动面小、行为不变。

## 结果

- `reference_engine/src/loader_engine.py`：新增 `self.last_error`，`fetch()` 三个失败点写入
- `reference_engine/src/reference_engine.py`：3 处（`run_simulation`、`run_simulation_mc`、
  `run_simulation_all_plans`）改为优先展示 `self.loader.last_error`
- `reference_engine/src/session_manager.py`：`start_session` 同上
- `reference_engine/src/optimizer_engine.py`：`run_optimizer` 同上
- 回归锁定：`tests/errors/`（见 0125 †，life-matters-models 仓库）的 11 个用例全部通过
  `ReferenceEngine.load_models()` 断言 `engine.loader.last_error` 包含具体原因，而不是只
  断言返回值是 `False`——这正是本次要修的缺口

## 未决

- CLI 单模型路径（`cli/main.py`）目前仍只打印"Simulation failed. Check log for details."，
  没有把 `result['error']` 展示到终端——这是 CLI 交互体验的独立问题，不在本次改动范围内。
