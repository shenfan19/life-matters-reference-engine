# ADR 0121 — 顶层目录改名：`sim_cli`/`sim_engine`/`sim_gui` → `cli`/`ref_engine`/`gui`

**日期**: 2026-06-24
**状态**: 已接受
**范围**: 仓库顶层三个目录及其全部内部引用、`docs/` 重组、`SimulatorEngine` 类名

---

## 背景

仓库发布模式是多 repo 叠加：`b_lm_sim_code`（本仓库）、`b_lm_model`、`b_lm_game_code` 各自打包发布，
用户下载后解压到同一目录联合使用。原顶层结构 `sim_cli/`、`sim_engine/`、`sim_gui/` 的 `sim_` 前缀存在
两个问题：

1. **命名不准确**：本仓库的引擎同时承担仿真（sim）和优化（opt）两件事——`SimulatorEngine` 类、
   `app_state.simulator_engine` 等命名只体现了 sim，opt 是后加的对称功能，"sim 前缀打头、opt 没有对应
   前缀"的不对称命名容易让人误以为 opt 是次要/外挂功能。
2. **`docs/` 跨仓库碰撞**：`b_lm_sim_code/docs/`、`b_lm_model/docs/`、`b_lm_game_code/docs/` 三个仓库解压
   到同一目录后会互相覆盖。`models/`、`output/` 是有意共享/合并的目录，但 `docs/` 不应该被覆盖。

讨论过 `docs_sim`/`docs_model` 类前缀改名方案，认为是"分类命名"和"类命名"混用、不够专业。最终采用
`docs/engine/`、`docs/model/`（model 仓库）、`docs/game/`（game 仓库）的嵌套方案——`docs/` 本身不带前缀，
内容按产品分到子目录，与 `cli/`、`gui/`、`ref_engine/` 这种顶层目录"该叫什么就叫什么、不为假设的未来
碰撞预先加前缀"的原则保持一致（这三个目录目前在三个仓库间没有实际碰撞，无需改名）。

## 决策

**去掉 `sim_` 前缀，三选一原则：要么不加前缀，要么用 "ref engine" 一类强调"参考实现"而非"唯一实现"
的措辞打头；不用 `sim_` 强调，因为还有一个对称的 `opt`，给其中一个加前缀而不给另一个加是不合适的二选一。**

| 改动对象 | 新名 |
|---------|------|
| `sim_cli/` | `cli/` |
| `sim_engine/` | `ref_engine/` |
| `sim_gui/` | `gui/` |
| `sim_engine/src/simulator_engine.py` | `ref_engine/src/reference_engine.py` |
| `class SimulatorEngine` | `class ReferenceEngine` |
| `app_state.simulator_engine` | `app_state.engine` |
| `PluginContext.__init__(simulator_engine=...)` | `PluginContext.__init__(engine=...)` |
| `gui/public/locales/sim/` | `gui/public/locales/engine/`（与 game 仓库 `game/public/locales/game/` 对齐） |
| `<I18nProvider section="sim">` | `<I18nProvider section="engine">` |
| `docs/`（本仓库内容） | `docs/engine/`，其中 `sim_design.md`/`sim_impl.md`/`sim_requirements.md` → `design.md`/`impl.md`/`requirements.md` |

**不改动（非本次范围）**：

- `models/`、`output/` 顶层目录名——本就是有意跨仓库共享/合并的目录，不存在命名问题
- `plugins/`——没有 `sim_`/对称性问题
- 历史 ADR 文件内容（`docs/engine/decisions/*.md`）——ADR 是不可变历史记录，文件名标签
  （如 `0074-..._sim_gui-working-state-priority.md` 里的 `sim_` 是 ADR 内容范围标签，不是本次改名对象）
  及正文中对当时实际路径的引用均保持原样
- `gui/src/components/sim_tab/` 等前端内部组件文件夹名——发现该文件夹同样存在"sim_ 前缀但内容含
  opt"的不对称问题，但属于更大范围的前端内部重构，超出本次"顶层目录改名"范围，留待单独评估
- `tests/test_sim_cli_consistency.py` 文件名——测试文件名不在本次改名范围内，仅更新其内部 import

## 结果

- `cli/`、`gui/`、`ref_engine/` 三个顶层目录及内部全部 Python import、TS import、`sys.path`、
  `build.spec`（PyInstaller hiddenimports）、`.vscode/tasks.json`、`.vscode/settings.json`、
  `lm.code-workspace`、`.pre-commit-config.yaml`、`scripts/check_hardcoded_constants.py`、
  `run_server_and_log.py` 中的路径引用全部更新
- `docs/` 重组为 `docs/engine/`（含 `decisions/` 子目录），`README.md`/`CLAUDE.md`/`AGENTS.md`
  中的文档索引、`@`-include 路径（`@docs/ui_guidelines.md` → `@docs/engine/ui_guidelines.md` 等）同步更新
- `docs/engine/decisions/README.md` 中跨仓库引用 `b_lm_model` ADR 的相对路径补一层 `../`
  （`decisions/` 多嵌套了一层，原 `../../../b_lm_model/...` 失效，改为 `../../../../b_lm_model/...`）
- `tests/test_sim_cli_consistency.py`、`tests/models/test_mc_distributions/.../test_dose_scaling.py`
  的内部 import 更新；`pytest tests/` 8 个测试全过
- `python cli/main.py <model.yaml> --sim-only` 手动验证可正常运行
- GUI 后端 `ref_engine/src/api_server.py`、`ref_engine/src/reference_engine.py` import 验证通过

## 关联

- ADR 0116 — 上一次类似的"消除内部术语不对称"改名（`regimen_runner.py` → `schedule_runner.py`），
  本次沿用同样的改名记录格式
- ADR 0072/0101 — CLI 接口地位的历史决策，本次改名不影响其结论，仅改目录名
