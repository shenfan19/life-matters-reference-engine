# ADR 0063 — Resolved imports 与仿真输出选择规则

## 状态

✅ 已实施

## 日期

2026-05-07

## 背景

Paper3 这类模型会通过 `imports` 复用 Paper2 的变量、方程和仿真配置。但 GUI 过去主要展示当前 YAML 的原始内容，导致导入变量没有出现在模型页和报告页；仿真端也只读取简单的 `output_variables`，当变量名不存在时会输出零值曲线，容易把“配置错误”误看成“变量真实为 0”。

同时，旧 loader 曾支持裸名字递归检索 import。这个机制不透明，遇到同名模型时不稳定，不适合继续保留。

## 决策

1. `imports` 只支持显式路径：
   - `published/paper2/foo` 表示从 `models/` 根目录出发。
   - `models/published/paper2/foo` 作为兼容写法保留。
   - `./foo`、`../foo` 表示相对当前 YAML 文件。
   - 裸名字递归检索删除。

2. Loader 在合并 imports 后记录 provenance：
   - `provenance.variables[var]` 标出变量来源 YAML。
   - `provenance.formulas[formula]` 标出方程来源 YAML。
   - GUI 的模型页使用 resolved model 展示变量、方程、输出变量，并显示来源。
   - 报告页使用 resolved model 的内容和仿真结果，但不显示 import/source provenance，避免报告被内部组装细节污染。

3. 输出选择由后端统一解释：
   - 本模型未定义 `simulation.output_variables` 和 `simulation.output_types` 时，继承 imports 的输出选择并集。
   - 本模型显式定义任一输出字段时，本模型定义优先，不再混入 imports 的输出字段。
   - `output_variables` 与 `output_types` 同时存在时取并集。
   - 两者都不存在或为空时，输出所有变量。
   - `output_types` 只接受 `input`、`parameter`、`state`。
   - 不存在的 `output_variables` 跳过并 warning，不生成零值曲线。

## 影响

- Builder 直接复制内容进模型时，不需要写 `imports`，行为仍然完整。
- Published 模型需要复用前序论文模型时，可以保留强定位路径 import。
- GUI 看到的模型内容与 sim 实际运行内容一致。
- 来源追踪集中在模型页，报告页保持为面向结果的干净输出。
- 错误输出变量会暴露为 warning，避免静默产生误导性零值曲线。

## 后续

如后续需要更完整的 provenance，可把来源信息扩展到 `simulation`、`optimizer` 的每个子字段，并在 GUI 中增加专门的 import/source summary。
