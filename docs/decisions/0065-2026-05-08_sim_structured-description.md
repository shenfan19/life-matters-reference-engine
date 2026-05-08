# ADR 0065 — metadata.description 支持结构化与自由文本

## 状态

✅ 已实施

## 日期

2026-05-08

## 背景

模型需要一段面向读者的说明，但单个长字符串容易混杂需求、问题、方法、结果和限制。相反，如果强制所有模型填写固定字段，又会让简单模型显得繁琐，并在 GUI 中留下许多空行。

因此需要一种亲和的描述规则：作者可以只写一段自由文本，也可以按需要写结构化字段；界面只展示实际存在的内容。

## 决策

`metadata.description` 支持两种形式：

- 字符串：作为一个 `Brief` 显示。
- 映射对象：按 YAML 中的字段顺序显示所有非空字段。

推荐结构化字段为：

`brief`、`need`、`problem`、`method`、`simulation`、`optimization`、`result`、`conclusion`、`limitations`

这些字段只是推荐，不是 schema 限制。作者可以增加其他英文键，例如 `scope`、`cohort`、`assumption`、`usage`、`evidence`、`mechanism`、`time_scale`、`sources`。GUI 会自动把 unknown key 转成英文标签，例如 `expected_cohort` 显示为 `Expected Cohort`。

科学依据、文献解释和建模假设属于模型描述的一部分，但不使用笼统的 `science_note`。应拆成更具体的 description 子项，例如 `evidence`、`mechanism`、`time_scale`、`sources`；不再使用 `metadata.science_note` 或顶层 `science_note`。

当来源能归属到具体变量或公式时，优先写入对应 `reference` 字段；`description.sources` 只保留无法拆分的场景级背景来源。

`brief` 取代 `summary` 作为第一推荐字段，因为它更像模型卡片中的短说明，不暗示必须写成论文摘要。`result` 取代 `expected_result`；如果当前还没有实际结果，可以在内容中写明“预期……”。

## 影响

- 简单模型可以继续使用 `description: "..."`。
- 复杂模型可以使用结构化 description，但不需要填满所有字段。
- Overview 页更紧凑：字段名和内容同一行，缺失字段不显示。
- 后端 validator 允许 `metadata.description` 为字符串或映射对象。
- `published` 模型统一采用结构化中文描述，并使用 `brief` 与 `result` 字段。

## 非目标

- 不引入多语言 description schema。
- 不把推荐字段变成硬性 schema。
- 不在 report 页展示完整 description 结构；report 仍以结果输出为主。
