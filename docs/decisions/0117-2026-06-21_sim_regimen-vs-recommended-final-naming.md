# ADR 0117 — API/YAML 概念层命名维持 `regimen`；`optimizer.results.reference` → `recommended` 并删除解码字典

**日期**: 2026-06-21
**状态**: 已接受
**范围**: sim_engine（routes/simulation.py、session_manager.py、optimizer_engine.py、model_structure/loader.py）、
sim_gui（useSimulation/useModelInit/usePlans/useOptimizer/SimOptTab/optUtils/simUtils）、
models/（132 个含 `plans[*].regimens` 或 `optimizer.startpoint.regimens` 的文件 + 64 个含
`optimizer.results` 的文件）、life-matters-models/docs/model.md、sim_code 的 docs/sim_design.md、docs/opt.md

---

## 背景

ADR 0116 把"纯内部实现命名"统一成了 `schedule`（`regimen_runner.py`→`schedule_runner.py` 等），
明确保留 API 契约层（`regimens` 请求字段、`RegimenData` 类、`regimen_variable`/`regimen_event_labels`
响应字段）和 YAML `simulation.plans[*].schedules`/`optimizer.startpoint.schedules`/
`optimizer.results.reference.regimen` 不变，理由是"这些是跨前后端边界的契约名，本次只动内部命名"。

用户随后指出项目**还未发布**，"避免改名成本"这个理由不成立，于是临时把 API 契约层和上述两个 YAML
核心字段也都改成了 `schedule`/`schedules`（与 ADR 0116 的内部命名保持一致）。改完之后发现两个问题：

1. **`regimen` 才是这个形式化方法在论文/规范里的本名**：`life-matters-models/docs/LM_format_1.0.md` §7 把
   "K×4 Regimen"定义为 LM format 的标准输入形式化方法，论文草稿和
   outreach 邮件已大量使用这个词。把 API/YAML 改成 `schedule` 实际上是在偏离已经对外使用的术语，
   不是在"统一"——内部实现叫什么不影响任何人，但跨边界的契约名应该和已发布的概念术语对齐。
2. **`optimizer.results.reference.regimen`/`objectives` 是废稿**：排查 `useOptimizer.ts::buildResults()`
   （当前"保存结果到模型"的唯一实现）发现它只写 `{x, f}`，从未生成解码后的 `regimen`/`objectives`
   字典；前端"Sim 读取 opt 结果"功能也只读 `x`（用 `xToInputEvents` 现场解码），从不读这两个字典。
   64 个模型文件里的这两个字典是更早版本的保存逻辑写的，现在完全不维护、不消费——和 ADR 0115
   删除的 `daily_inputs` 是同一类问题。

另外，`reference` 这个名字本身有歧义：`variables.<name>.reference`/`formulas.<name>.reference` 是
文献引用字段（DOI/PMID），`optimizer.results.reference` 是"建模者标注的推荐 Pareto 点"——同一份
YAML 文件里"reference"表示两个完全不相关的概念，容易让学术读者误解为文献引用。

## 决策

### 1. API 契约层 + YAML 核心字段，撤回到 ADR 0116 的原状（`regimen`/`regimens`）

| 字段/标识符 | 最终状态 |
|------|---------|
| HTTP 请求字段 | `SimulationStartRequest.regimens`、`start_session(regimens=...)`、`session['regimens']` |
| Pydantic 类 | `RegimenData`/`RegimenEventData` |
| 优化结果响应字段 | `result['regimen_variable']`/`result['regimen_event_labels']` |
| YAML | `simulation.plans[*].regimens`（132 个文件）、`optimizer.startpoint.regimens` |
| `optimizer_engine.py` 内部闭包 | `_build_regimen_events`（与契约字段同步，跨越 ADR 0116 的"纯内部"边界——见下） |

`sim_engine/src/schedule_runner.py`（ADR 0116 新建的纯内部执行核心：`apply_schedules()`、
`precompute_sustained_divisors` 等）**不退回** `regimen_runner.py`——这部分始终没有暴露在
API/YAML 边界上，保留 ADR 0116 的结果。`_build_regimen_events` 例外：它直接对应契约层的
`regimen_variable`/`regimen_event_labels` 输出，因此随契约层改名同步改回，不算破坏 ADR 0116 的
"内部命名"边界。

净效果：本次绕了一圈（先改成 `schedule` 又改回 `regimen`），API/YAML 概念层最终与 ADR 0116
刚写完时的状态一致——这趟探索没有改变契约层命名，但排除了"和 K×4 Regimen 论文术语不一致"这个
被搁置的选项，把决策记录下来，避免以后重新提出同一个方案。

### 2. `optimizer.results.reference` → `recommended`，删除解码字典

```yaml
# 之前
reference:
  x: [...]
  f: [...]
  regimen: {...}      # 废稿：从未被任何代码读取，保存逻辑也不再生成
  objectives: {...}   # 废稿：同上

# 之后
recommended:
  x: [...]
  f: [...]
```

- `reference` → `recommended`，避免和 `variables.<name>.reference`/`formulas.<name>.reference`
  （文献引用）撞词。
- 删除 `regimen`/`objectives` 两个解码字典：人类可读展示和"发送到 Sim"功能都从 `x`/`f` 现场用
  `xToInputEvents` 解码，不需要预先持久化一份容易过期的副本。

这一步与第 1 条独立、且**不可逆**（与第 1 条的"绕一圈"不同）：64 个模型文件里的旧字典已物理删除。

## 不在本次范围内

- `LM_format_1.0.md` §7 "K×4 Regimen" 形式化方法本身的命名，以及 `sim_impl.md`/`sim_requirements.md`/
  `ui_guidelines.md` 里"Regimen"作为概念品牌词的用法——本次决策的前提之一（"应与论文术语对齐"）依赖
  这个词保持现状，但品牌词本身是否需要调整不是本次议题。
- `LM_format_1.0.md` §6/§7 中 `optimizer.results.reference.regimen` 的 YAML 示例（含"可导出为
  iCal"的概念性描述）——这处现在与实现不一致（字段已改名 `recommended`，解码字典已删除，iCal
  导出从未实现），但因为示例嵌在 K×4 Regimen 正式定义里，与上一条同样的理由暂不修改，留作后续
  跟进。
- 用户提出的、关于 `regimen`/`schedule` 单复数命名约定的更一般性问题（"plan.regimen 改成
  regimens.regimen，和 formulas.formula 一样更有逻辑"）——讨论中途转向了本次的 reference 问题，
  尚未得到最终结论。

## 结果

```
sim_engine/src/routes/simulation.py         RegimenData/RegimenEventData/regimens 字段
sim_engine/src/session_manager.py           start_session(regimens=...)/session['regimens']
sim_engine/src/optimizer_engine.py          result['regimen_variable']/['regimen_event_labels']；
                                             _build_regimen_events；optimizer.startpoint.regimens 解析
sim_engine/src/model_structure/loader.py    plan.get('regimens', [])
sim_engine/src/optimizer_eval.py            文档注释同步 _build_regimen_events
sim_cli/output.py                           注释同步 optimizer.startpoint.regimens
sim_gui/.../useSimulation.ts                buildRegimenPayload；payload 字段 regimens
sim_gui/.../useModelInit.ts                 optBlock.startpoint.regimens；regimen_event_labels
sim_gui/.../usePlans.ts, useOptimizer.ts    buildOptRegimens；startpoint: { regimens }
sim_gui/.../optUtils.ts, optUtils.test.ts   buildOptRegimens；测试 fixture 路径 startpoint.regimens
sim_gui/.../simUtils.ts                     regimenOptEntries；optimizerConfig.startpoint.regimens
sim_gui/.../SimOptTab.tsx                   optResult.regimen_event_labels
models/**/*.yaml（132 个文件）               plans[*].schedules / optimizer.startpoint.schedules
                                             → regimens（两处字段统一改名）
models/**/*.yaml（64 个文件）                 optimizer.results.reference → recommended；
                                             删除 regimen/objectives 解码字典
life-matters-models/docs/model.md                    全文同步 regimens 字段名 + recommended 字段说明
docs/sim_design.md, docs/opt.md,
docs/coding_conventions.md                  字段路径引用同步
tests/test_sim_cli_consistency.py           start_session(regimens=...) kwarg
```

验证：`pytest tests/` 8/8 通过；161 个模型 YAML 全部 `yaml.safe_load` 通过；`sim_gui`
`tsc --noEmit` 零错误、`vitest run` 4/4 通过。

## 关联

- ADR 0115 — 删除 `daily_inputs`/`_apply_schedules`/`manual_overrides`（同类"规范里还留着但零消费者"的废稿清理）
- ADR 0116 — 内部命名统一为 `schedule`；本 ADR 确认其"不在本次范围内"列出的 API/YAML 契约层维持原状
