# test_verify — 引擎代码的 pytest 验证套件

`test_verify/` 是仓库的 Python 单元/回归测试套件，用 `pytest` 驱动，验证的对象是**`cli/`、`reference_engine/` 里的代码本身有没有按预期实现**——不涉及某个具体模型 YAML 的数值是否符合文献/临床常识（那属于 `models/validation/`，见下方"和 models/test_fixtures/、models/validation/ 的关系"）。

## 这个目录做什么 / 不做什么

**做什么**：
- 断言某个 Python 函数/接口在给定输入下产生预期输出（如 `apply_schedules()` 的 pulse reset 不应被 bounds 下限夹住：`test_schedule_runner.py`）。
- 给历史 bug 上"回归锁定"——bug 修复后新增一个能复现该 bug 的用例，之后任何改动只要让它又失败，就说明该 bug 复发了（本目录几乎每个文件的 docstring 都写明了对应的 bug 背景和修复位置）。
- 验证 CLI 和 GUI 两条路径共用同一个引擎层时结果是否完全一致（`test_sim_cli_consistency.py`）。
- 验证引擎在遇到结构错误/配置错误的模型 YAML 时能否可靠失败、且报错信息能传到调用方（`errors/`）。
- 验证具体模型的某个变量在多组参数取值下，数值关系（单调性、线性缩放等）是否符合该模型自身公式的预期（`models/`）。

**不做什么**：
- 不验证模型的科学/文献可信度（`daily_dose` 该不该是 200mg 这种问题，不在这里回答）。
- 不跑真实的浏览器/GUI 交互（那是 `gui/e2e/`，见下方"什么是冒烟测试"）。
- 不做性能/负载测试。

## 输入 / 输出

- **输入**：每个测试文件是自包含的 Python 代码，直接 `import` 引擎层模块（如 `reference_engine.src.reference_engine.ReferenceEngine`），不经过 CLI 的 `argparse` 层、不起 HTTP server（ADR 0072 的约束）。部分测试会加载 `models/test_fixtures/valid/` 或 `models/test_fixtures/invalid/` 下的 fixture YAML 作为输入数据。
- **输出**：标准 pytest 结果——每个 `test_*` 函数 PASS/FAIL，失败时打印 assertion 的具体差异（不是像 `cli/batch.py` 那样生成一份 Markdown 报告）。

## 运行

```bash
pytest                    # 用 pytest.ini 里的 testpaths = test_verify，跑全部
pytest test_verify/errors/           # 只跑错误检测用例
pytest test_verify/models/           # 只跑数值回归用例
pytest test_verify/test_schedule_runner.py::test_pulse_value_not_inflated_by_nonzero_bounds_floor
```

## 目录结构

```
test_verify/
├── verification_report.md       # 引擎实现正确性 + 数值精度验证的方法论与当前结果（verify 侧）
├── test_capacity_limits.py       # 并发限流（P1/P2 公网部署防护）
├── test_same_day_duration.py     # 同日模型（start_date == end_date）仿真时长回归
├── test_schedule_runner.py       # apply_schedules() pulse reset 回归
├── test_session_cleanup.py       # GUI session 空闲超时清理（P0 公网部署要求）
├── test_sim_cli_consistency.py   # CLI/GUI 路径一致性（ADR 0045/0110/0112/0113）
├── errors/                       # 错误检测机制回归，见 errors/README.md
└── models/                       # 单模型变量数值回归，见 models/README.md
```

## 什么是冒烟测试（smoke test）——以及为什么本目录基本不算

术语常见混淆，按覆盖面/深度从浅到深排列：

- **冒烟测试（smoke test）**：跑一遍最基本的黄金路径，只确认"系统没有彻底坏掉"，不深究细节是否正确。特点是覆盖面广、断言少、跑得快。本仓库里真正的冒烟测试是 `gui/e2e/specs/run-simulation.spec.ts`——在真实浏览器里选模型、点仿真、确认结果面板真的收到了数据点，仅此而已，不检查数值对不对。
- **单元测试（unit test）**：针对一个函数/一小段逻辑，断言具体行为，覆盖面窄、断言精确。本目录的 `errors/`、`test_schedule_runner.py` 等大多属于这一类。
- **回归测试（regression test）**：不一定是"新"功能的测试，而是给一个已修复的历史 bug 做的锁定用例，目的是防止同一个 bug 以后又被改回来。本目录里几乎每个文件都兼具"单元测试"和"回归测试"两重身份——先是回归锁定（docstring 里写明对应哪次修复），顺带也验证了正常行为。
- **一致性/集成测试**：跨越多个模块或多条路径（如 CLI 和 GUI 两条代码路径）验证结果一致，比单元测试覆盖面更宽，但仍是精确断言，不是"能跑就行"。`test_sim_cli_consistency.py` 属于这一类。

一句话区分：**冒烟测试问"系统还活着吗"，本目录问"这行代码做对了吗"。**

## 和 `models/test_fixtures/`、`models/validation/` 的关系

`models/test_fixtures/valid/`、`models/test_fixtures/invalid/` 下的 YAML 是"数据"，本目录（`test_verify/`）里的 pytest 用例是"断言"——两者测的是同一件事（引擎代码写得对不对），只是分放在两个仓库：不少测试直接读取 `models/test_fixtures/valid/*.yaml` 作为输入（如 `test_same_day_duration.py` 读取 `test_valid_same_day_duration.yaml`），断言的是引擎代码行为，不是模型科学内容，`cli/batch.py --input-dir test_fixtures/valid` 之类的批量跑法也是同一角色的另一种驱动方式。

`models/validation/`（含 `validation_report.md`）是完全不同的另一件事——测的是具体模型的输出是否符合文献/临床常识（"validate"），跟本目录、跟 `models/test_fixtures/` 都没有内容上的关系，只是同属"分层验证工作"的另一半，方法论关系见 `verification_report.md` 开篇。
