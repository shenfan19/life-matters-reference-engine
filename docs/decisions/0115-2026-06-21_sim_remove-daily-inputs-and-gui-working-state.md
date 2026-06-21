# ADR 0115 — 移除 `daily_inputs` / `_apply_schedules` / `manual_overrides`（plans 强制后的废稿清理）

**日期**: 2026-06-21
**状态**: 已接受
**范围**: sim_engine（`model_structure/` · `mc_utils.py` · `session_manager.py` · `optimizer_eval.py` · `regimen_runner.py`），model.md（`daily_inputs` 小节）

---

## 背景

ADR 0109 已将仿真输入方案的唯一合法位置强制收口到 `simulation.plans[*].schedules`。但代码里还留着一套更早、独立于 plan 的输入机制：

- `daily_inputs` YAML 字段（按天指定输入值）→ loader 解析为 `self.schedules: Dict[str, InputSchedule]`（`base.py` 的 `InputSchedule`/`SchedulePoint`）。
- `Simulation._apply_schedules()`：每步在 `model.step()` 内部消费 `self.schedules`，按 pulse/step/linear 插值写入变量值。
- `manual_overrides`：ADR 0074 引入，唯一目的是让 `_apply_schedules()` 跳过已被 GUI regimen 接管的变量（否则 `daily_inputs` 的值会在每步覆盖 GUI 编辑的值）。

现状核查：

1. `models/` 目录下**没有任何 YAML 文件使用 `daily_inputs`**。
2. plans 强制规范（ADR 0109）后，`daily_inputs` 和 `simulation.plans[*].schedules` 是两条平行但语义重叠的输入声明方式——前者是更早、更简单、不支持多 plan / GUI 编辑 / 优化器的版本。
3. `manual_overrides` 的唯一读取点就是 `_apply_schedules()`（`simulation.py:71/74`）；`apply_regimens()`（`regimen_runner.py`，处理 plan-based schedule）从未读取它。一旦 `_apply_schedules()` 被删，`manual_overrides` 全仓库再无任何读取者，整套 ADR 0074 "GUI Working State Layer" 失去存在理由。

## 决策

**整套删除，不保留兼容层：**

| 删除对象 | 位置 |
|---------|------|
| `SchedulePoint` / `InputSchedule` 数据类 | `model_structure/base.py` |
| `self.schedules` 初始化 + `daily_inputs` 解析 | `model_structure/core.py` / `loader.py` |
| `Simulation._apply_schedules()` 及其在 `step()` 内的调用 | `model_structure/simulation.py` |
| `self.manual_overrides` 初始化、`clone_model()` 里的克隆、`optimizer_eval.py`/`session_manager.py` 里的写入 | `core.py` / `mc_utils.py` / `optimizer_eval.py` / `session_manager.py` |
| YAML `daily_inputs` 小节（保留 `accumulators` 小节，二者本不耦合） | `b_lm_model/docs/model.md` |

`apply_regimens()`/`regimen_runner.py`（plan-based schedule 执行核心）不受影响——它是当前唯一受支持的输入执行路径。

## 不在本次范围内

- `accumulators` 不动：它从任意 `source` 变量积分，不依赖 `daily_inputs`，是独立功能。
- 不重命名 `apply_regimens`/`regimen_runner.py`（曾评估过 regimen→schedule 的命名统一提案，因会与本次删除前就存在的 `_apply_schedules` 撞名而搁置；见内部记录，本次删除后该撞名风险已消失，但仍非本次范围）。
- 历史 ADR（0053、0074、0100、0110 等）提到 `daily_inputs`/`_apply_schedules`/`manual_overrides` 的段落不回填修改——ADR 是时间点记录，不retroactively改写。

## 结果

```
sim_engine/src/model_structure/base.py        删除 SchedulePoint / InputSchedule
sim_engine/src/model_structure/core.py        删除 self.schedules / self.manual_overrides 初始化
sim_engine/src/model_structure/loader.py      删除 daily_inputs 解析块 + 相关 import
sim_engine/src/model_structure/simulation.py  删除 _apply_schedules() 方法 + step() 内调用
sim_engine/src/mc_utils.py                    clone_model() 删除 schedules 克隆 + manual_overrides 继承
sim_engine/src/optimizer_eval.py              删除 manual_overrides 写入（已无消费者）
sim_engine/src/session_manager.py             删除 manual_overrides 写入 + 相关注释
sim_engine/src/regimen_runner.py              删除引用已不存在的 _apply_schedules 的过时注释
b_lm_model/docs/model.md                      删除 daily_inputs 小节，accumulators 独立成节
```

验证：`pytest tests/` 8 个测试全部通过；`sim_engine` 模块全量 import 正常。

## 关联

- ADR 0074 — 本次删除的直接前提（其引入的 manual_overrides 机制现已无消费者）
- ADR 0109 — plans 强制规范，daily_inputs 成为多余路径的根本原因
- ADR 0110 — Plan/Schedule 解析单一来源
