# ADR 0119 — Sim 运行日志核心合并：CLI/GUI 共用内容生成，IO 出口各自实现

**日期**: 2026-06-22
**状态**: 已接受
**范围**: sim_engine（新增 `run_logging.py`，`simulator_engine.py`、`session_manager.py` 改为调用）、sim_cli（`runner.py`）

---

## 背景

ADR 0118 之后追问了一个更广的问题：CLI 和 GUI 的日志/报错信息渠道整体是不是已经合流。排查发现：

- **报错信息**：已经合流——两边都直接传递引擎层返回的 `result['error']`（同一个 `str(e)`），渠道不同
  （CLI 写日志文件+stdout，GUI 转 `HTTPException`/`message.error()`）但内容完全一致，不需要改。
- **opt 过程性文本日志**（"Model: ...""Objectives (...): ...""Algorithm: ..."）：`run_optimizer()`
  本来就有 `log_cb` 参数把这些内容推出去，GUI 路由（`routes/optimizer.py`）接了，但
  `sim_cli/runner.py::run_opt()` 调 `run_optimizer()` 时没传 `log_cb`，导致 CLI 端完全看不到这些信息
  ——这是"通道已经设计好了，只是 CLI 端没接"，已在前一个改动里补上 `log_cb=logger.info`。
- **sim 过程性文本日志**（变量/公式数、output 变量列表、NaN/越界告警、完成耗时、schedule 命中次数）：
  排查后发现比 opt 的情况更深——**这套内容本身只存在于 `session_manager.py`（GUI 专属代码）里**，
  `simulator_engine.py::run_simulation()`/`run_simulation_mc()`（CLI 路径）完全没有等价机制，不是"通道
  没接"，是"内容生成逻辑本身没共享"。用户明确要求：要的是同一份代码生成内容、只是 IO 出口不同，不是
  CLI/GUI 背靠背各写一份。

## 决策

**新增 `sim_engine/src/run_logging.py`，把"生成什么内容"和"内容往哪儿写"拆开：**

- 内容生成函数只接受数据（`model`/`output_variables`/`outputs` 等）和一个 `log_cb: Callable[[str], None]`
  出口参数，不关心调用者是 CLI 还是 GUI：
  - `build_initial_logs(...)` — 运行头部：模型规模、imports、起止/步长/总步数、output 变量列表、
    output 校验警告、schedule 变量名、MC seed
  - `check_value_warnings(...)` — NaN/Inf 与越界告警（每个变量只报一次）
  - `log_completion(...)` — 完成耗时 + schedule 命中次数（命中计数由调用者预先算好传入，CLI 和 GUI
    的数据保存方式不同：GUI 全程保留 dict 行历史，CLI 分 chunk 处理不留全量历史，用
    `input_variable_hits()`/`accumulate_hits()` 两个辅助函数分别适配）
- **IO 出口各自实现**：
  - GUI（`session_manager.py`）：`log_cb=lambda msg: session['logs'].append(_make_log(msg))`
    （`_make_log` 包一层 `{t, msg}` 给日志面板用，原样保留）
  - CLI（`simulator_engine.py`）：新增 `log_cb: Optional[Callable[[str], None]] = None` 参数，贯穿
    `run_simulation()` → `run_simulation_mc()` → `run_simulation_all_plans()`，由 `sim_cli/runner.py`
    传入 `logger.info`；未传时（其它调用方/测试）行为不变，不产生这些信息
- 这与 `run_optimizer()` 已有的 `log_cb` 模式完全一致——本次是把 sim 路径也补成同一种形状，不是发明新机制。

## 结果

```
sim_engine/src/run_logging.py          新增：build_initial_logs / check_value_warnings /
                                        log_completion / input_variable_names /
                                        input_variable_hits / accumulate_hits / fmt_step
sim_engine/src/session_manager.py      _fmt_step/_check_value_warnings/_log_completion 改为
                                        薄包装，委托 run_logging.py；删除 math 这个现在用不到的 import
sim_engine/src/simulator_engine.py     run_simulation()/run_simulation_mc()/
                                        run_simulation_all_plans() 新增 log_cb 参数，调用
                                        run_logging.py 生成同一套信息
sim_cli/runner.py                      run_sim() 调用 run_simulation_all_plans() 时传
                                        log_cb=logger.info；run_opt() 传 log_cb=logger.info
                                        （ADR 0118 期间已先补上 opt 这一半）
```

验证：`pytest tests/` 8 个测试全过；CLI 跑真实模型（banister，4 个 plan），日志文件里每个 plan 都出现
`Model:`/`Sim:`/`Outputs:`/`Regimens:`/`Done in ...`/`Schedule hits:`，与直接调用 GUI 路径
（`start_session`/`batch_steps`）拿到的 `logs` 列表内容逐行一致，只是落地形式不同（日志文件 vs
内存里的 `{t, msg}` 列表）。

## 后续清理

排查过程中确认 `simulator_engine.py` 的 `pause_every`/`interactive`/`pause_callback`/
`_interactive_pause()`（本地同步交互式暂停，`sim_cli/main.py` 从未启用）是无人调用的死代码，
连带把因它而存在的 chunk 循环（`chunk_size`/`self.running`）一并简化为单次 `advance_steps` 调用。
不属于本次"日志合流"要解决的问题，但同一轮排查里顺手清理，不在本次范围内的部分（见下）不受影响。

## 不在本次范围内

- CLI 当前默认不传 `log_cb`（`sim_cli/main.py` 没有暴露 `--verbose` 之类的开关）——`run_sim()`/`run_opt()`
  内部固定传 `logger.info`，所以这些信息已经进了日志文件，只是不在 stdout 实时打印；是否要加一个 CLI 开关
  控制 stdout 是否同时显示，留待有需求时再做，不属于"合流"本身要解决的问题。
- 没有改动报错信息的渠道（ADR 0118 已确认合流，不需要动）。
- 没有改动 opt 的逐代进度条机制（`progress_callback`，两边早已共用，见 ADR 0113）。

## 关联

- ADR 0118 — 日期/时间字段前置校验（同一次排查里发现的另一类问题，错误信息渠道）
- ADR 0113 — Sim 执行核心合并（`advance_steps` 共用，是本次能直接复用同一份 `outputs` row 形状的前提）
- ADR 0111 — Sim/CLI 一致性回归测试套件（验证两条路径行为一致的现有手段）
