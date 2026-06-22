# ADR 0118 — 日期/时间字段前置校验，消除 CLI/GUI 共用的静默回退

**日期**: 2026-06-22
**状态**: 已接受
**范围**: sim_engine（`simulator_engine.py`、`session_manager.py`、`optimizer_engine.py`，新增 `validation.py`）、sim_cli（`runner.py`）

---

## 背景

排查报错机制现状时发现：`schedule_runner.py`、`optimizer_engine.py`、`sim_cli/runner.py` 里多处把
日期/时间字符串解析失败当作"正常情况"处理——`except ValueError: pass`、`except Exception: return 默认值`
——格式错误的 `start_date`/`end_date`/`time_start`/`valid_start` 等字段不会报错，而是悄悄换成默认值
（epoch 1900-01-01、`total_time` 兜底、整日 86400 秒）继续往下跑。CLI 和 GUI 都不提示，测试也发现不了：
改错一个 YAML 字段，仿真"看起来正常跑完"，但跑的不是用户预期的输入。

代表性位置：

- `schedule_runner.py` 的 `_time_range_day_seconds`/`_n_active_days`/`apply_schedules` 共五处
  `date.fromisoformat(...)` 包在 `except ValueError: pass` 或 `except Exception: return 86400.0` 里。
- `optimizer_engine.py::run_optimizer()` 计算 `sim_start_date`/`end_date` 对应总时长时，整段用
  `except Exception` 包住——日期**缺失**（合法，total_time 是合法的替代配置方式）和日期**格式错误**
  （用户输入错误）被同一段代码吞掉，结果都是静默回退到 `total_time`，是本次发现的最高风险点：优化器会在
  一个完全不同于配置意图的时间窗口上跑完，没有任何错误或警告。
- `sim_cli/runner.py::_time_hours()` 是 CLI 自己重复计算总时长的旧逻辑，同样的吞错模式。

## 决策

**新增 `sim_engine/src/validation.py`，CLI 与 GUI 在"真正开始执行前"各调用一次，复用现有的
`{"success": False, "error": str(e)}` 错误通道（已经是 CLI 日志/stdout、API `HTTPException.detail`、
前端 `message.error()` 三端共用的报错路径——见 `routes/simulation.py` 把 `result['error']` 转成
`HTTPException`，`useSimulation.ts` 用 `message.error(e.message)` 展示。本次不新增新的报错通道，
只是让被吞掉的错误真正抬出来，走这条已有通道。**

`validation.py` 提供三个函数：

| 函数 | 校验对象 | 严格度 |
|---|---|---|
| `validate_simulator_dates` | `simulator.start_date`/`end_date`（含 `optimizer.start_date`/`end_date`） | 宽松：容忍 `year == 0` 的"古代日期"占位（loader.py/optimizer_engine.py 的总时长近似算法已显式支持），仍做月/日合法性校验（用闰年代入校验 `02-29`），并检查 `end_date` 不早于 `start_date` |
| `validate_schedule_list` | schedule/event 级 `valid_start`/`valid_end`/`time_start`/`time_end`（CLI `schedule_entries` 与 GUI `regimens` 参数共用同一形状） | 严格：与消费端 `schedule_runner.py` 实际使用的 `date.fromisoformat()` 要求一致 |
| `validate_optimizer_regimens` | `optimizer.startpoint.regimens` 固定值与 `optimize:` 搜索窗口（`time_start`/`time_end`/`date_range`） | 严格，同上 |

调用位置（均在进入逐步执行的热循环之前，一次性校验，校验失败转换为标准失败 dict）：

- `simulator_engine.py::run_simulation()` / `run_simulation_mc()`（CLI 仿真路径）
- `session_manager.py::start_session()`（GUI 仿真路径）
- `optimizer_engine.py::run_optimizer()`（CLI/GUI 共用的优化器入口，ADR 0113）
- `sim_cli/runner.py::_time_hours()`（CLI 独立的总时长预估，原本的吞错模式单独打了一个 patch）

热循环内部（`schedule_runner.py` 的 `try/except`）**保留原样**，不删除——前置校验通过后理论上不会再
触发，继续留作防御性兜底。

## 结果

```
sim_engine/src/validation.py              新增：3 个校验函数
sim_engine/src/simulator_engine.py        run_simulation()/run_simulation_mc() 开头加校验
sim_engine/src/session_manager.py         start_session() 开头加校验
sim_engine/src/optimizer_engine.py        run_optimizer() 加两处校验（regimens 定义 + 时间窗口日期）
sim_cli/runner.py                         _time_hours() 改为校验后抛出，run_sim() 捕获并走既有失败路径
```

验证：`pytest tests/` 8 个测试全过；用真实模型（banister）跑通 CLI sim/opt 无回归；故意改坏一个模型的
`start_date`/regimen `time_start`，CLI 和直接调用 `start_session()` 都能在执行前拿到同一句清晰错误，而
不是"看起来跑完了"。

## 不在本次范围内

- `schedule_runner.py`/`optimizer_engine.py` 内部仍存在的 `try/except` 兜底本身——继续保留作防御性代码，
  不是本次校验的目标，也不计划删除。
- "格式合法但语义上不合理"的更深校验（例如 schedule 的 `valid_range` 与仿真整体时间窗口完全不重叠、
  `optimize.date_range` 搜索窗口宽度为 0 等）——超出"格式校验"范围，留待按需评估。
- 现有 `/api/validate` 接口（YAML 静态结构校验）——本次是运行时参数校验，两者目标不同，不合并。
- GUI 前端展示逻辑——已有 `message.error()` 通道能透传 `error` 字段，不需要新增组件。

## 关联

- ADR 0100 — pulse/sustained 时间区间统一（`time_start`/`time_end` 字段语义的来源）
- ADR 0113 — Sim 执行核心合并：CLI/GUI 共用 `advance_steps`/`run_optimizer`，本次校验加在它们共同的
  上游入口，不需要在两条路径各写一份
- ADR 0111 — Sim/CLI 一致性回归测试套件：校验保证两条路径在同一种坏输入下报出同一句错误，而不是各自
  静默走向不同的错误结果
