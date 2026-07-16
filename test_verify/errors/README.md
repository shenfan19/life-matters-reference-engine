# 错误检测回归测试

> 任务来源：错误检测机制审查（2026-07-05）。与 `tests/test_sim_cli_consistency.py`
> （CLI/GUI 路径一致性）、`tests/models/`（单变量数值回归）不同，本目录验证的是
> **引擎对结构错误/配置错误的检测和报错能力**：不只是能正确加载 `models/test/valid/`
> 下结构合法的模型，还要能在遇到 `models/test/invalid/` 下故意写错的模型时可靠地失败，
> 并把具体原因暴露给调用方。

## 测得住的两个前提

1. **fixture 本身可信**：每个 `models/test/invalid/*.yaml` 只故意写错一处，其余部分结构
   合法（见该目录 README 的文件清单），所以一个测试失败能直接定位到具体哪个校验分支坏了。
2. **走真实调用路径，不走底层内部函数**：所有测试通过 `ReferenceEngine.load_models()` /
   `run_simulation()` 断言——这与 CLI（`cli/runner.py`）、GUI（`session_manager.py`）实际
   加载模型的路径完全一致。这曾经不成立：`LoaderEngine.fetch()`（CLI/GUI 加载模型的唯一
   入口）把 `Loader`/`Validator` 抛出的详细错误信息吞掉，只记日志，调用方只能拿到一个
   `None`/`False`，看不到具体原因（`validate_model()` 本身早已能生成具体错误信息，缺口
   在传递链路上）。修复见 `reference_engine/src/loader_engine.py` 的 `LoaderEngine.last_error`
   属性；这些测试正是该修复的回归锁定。

## 文件组织

- `test_structural_errors.py` — `validator.py`（step_size、optimizer.method、公式未声明变量、
  废弃符号 `dt`）
- `test_import_errors.py` — `loader.py` 的 import/YAML 结构校验（循环 import、越出 models
  根目录、顶层 YAML 非 mapping）
- `test_evidence_errors.py` — `loader.py` 的 evidence 校验（名称冲突、`applies_to` 缺
  `baseline_ref`）
- `test_date_errors.py` — `validation.py`（`end_date` 早于 `start_date`）；注意这一条**不**
  在 `load_models()` 阶段失败，只在 `run_simulation()` 才失败，测试里已注明原因

## 运行

```bash
pytest tests/errors/
```

## 新增一个错误检测用例

先在 `models/test/invalid/README.md` 里确认（或新增）对应 fixture，再在这里对应的文件里加一个
`assert not engine.load_models([...])` + `engine.loader.last_error` 包含关键子串的断言。
