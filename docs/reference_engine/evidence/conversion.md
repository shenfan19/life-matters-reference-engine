# Evidence 换算：8 种子类型的计算公式

> 本文件是 evidence 换算的**权威实现描述**（对应 `reference_engine/src/model_structure/loader.py` 中 `ModelStructure.load()` 处理 `evidence:` 节的那部分代码）。YAML 里怎么声明 `evidence:` 字段、`parameter` 和 `evidence` 该怎么选，见 `b_lm_model` 仓库 `docs/model.md`「变量类型（3 种）+ evidence 顶层换算」一节；本文件只回答"Loader 具体怎么把文献效应量算成公式能用的系数"。`applies_to` 自动接入 dynamics 的机制见同目录 [applies_to.md](applies_to.md)。决策背景见 `b_lm_model` 仓库 `docs/decisions/0040-2026-04-22_sim_医学证据类型与变量映射.md`。

## 换算结果如何存放

Loader 遍历 YAML `evidence:` 节，按 `type` 换算出 `effective` 值后，**以 evidence 同名**写入 `self.variables[ev_name]`，类型为 `parameter`，不新增独立的 `VariableType.evidence`。`formulas`/`dynamics` 直接引用这个名字即可，不需要记 `_effective` 之类的衍生名。

换算后的 `Variable` 额外带两个溯源字段（`reference_engine/src/model_structure/base.py`），仅供查询/调试，不参与仿真计算：

| 字段 | 含义 |
|------|------|
| `evidence_type` | 原始 evidence 的 `type`（如 `rr`/`or`/`hr`），非 evidence 来源的 parameter 为 `None` |
| `evidence_raw_value` | 换算前的原始文献数值（如 OR=1.65），与换算后的 `value` 分开保留 |

## 8 种子类型换算公式

| `type` | 效应量 | 换算 (`effective`) | 必填辅助字段 |
|--------|--------|-----------|------------|
| `rr` | 相对风险 RR | `effective = value` | — |
| `or` | 比值比 OR | `effective = value / ((1 − p₀) + p₀ × value)` | `baseline_prevalence`（即 p₀） |
| `hr` | 风险比 HR | `effective = baseline_value × value` | `baseline_ref`（指向同节另一个 evidence 条目名） |
| `ard` | 绝对风险差 | `effective = value` | — |
| `cohens_d` | 效应量 Cohen's d | `effective = value × population_sd` | `population_sd` |
| `ir` | 发病率 / 死亡率 | `effective = value` | — |
| `beta` | 回归系数 | `effective = value` | — |
| `pk` | PK/PD 参数 | `effective = value` | — |

未知 `type` 不会报错，只会打印一条 warning 并跳过该条目的换算（该 evidence 不会出现在 `self.variables` 中）。

## 每种子类型的可运行示例

`b_lm_model` 仓库 `models/test_validation/valid/` 下有 8 个最小 fixture，一种子类型一个文件，各自
只含"一个 evidence + 一两个展示/累积变量"，可以直接加载/仿真跑一遍看效果，比在文档里贴一份不会跑的
YAML 更可靠（不会因为换算逻辑改了而没人发现文档示例已经算不出那个数）：

| 子类型 | fixture | 验证的点 |
|--------|---------|---------|
| `rr` | `test_valid_evidence_rr.yaml` | 手写 dynamics 乘一个普通 parameter 基线，对比 `applies_to` 自动接线到 `ir` 基线，两条路径基线不同、数值不应相等 |
| `or` | `test_valid_evidence_or.yaml` | 唯一需要非线性换算（`baseline_prevalence`）的子类型 |
| `hr` | `test_valid_evidence_hr.yaml` | `baseline_ref` 引用同文件内 `ir` 条目做基线 |
| `ard` | `test_valid_evidence_ard.yaml` | 手写 dynamics 与 `applies_to` 自动生成的 dynamics 逐步数值必须一致 |
| `cohens_d` | `test_valid_evidence_cohens_d.yaml` | 唯一必须靠 `population_sd` 才能换出有量纲结果的子类型 |
| `ir` | `test_valid_evidence_ir.yaml` | 常被其他子类型引用作基线，需要单独确认作为"被引用方"时数值稳定 |
| `beta` | `test_valid_evidence_beta.yaml` | 年化系数折算为日速率（÷365）驱动连续状态变量 |
| `pk` | `test_valid_evidence_pk.yaml` | 验证换出的速率常数能在小时级步长公式里直接用，不需要额外单位转换 |

每个文件的 `metadata.description.result` 字段都写了具体应该算出的数字（比如"30 天后累计约
0.000658"），可以直接改 `simulation.end_date` 跑更长/更短的区间验证。8 种子类型同时共存的综合场景见
`test_valid_evidence_types.yaml`；每个文件的设计意图（为什么要单独测、和相邻文件的关系）见
`models/test_validation/validation_catalog.md` §1。

举两个最短的例子直接感受差异：

```yaml
# rr（相对风险）：effective = value，最简单，不需要辅助字段
evidence:
  smoking_cvd_rr:
    type: rr
    value: 2.5              # 换算后 smoking_cvd_rr 直接等于 2.5，可在公式里当乘数用
    baseline_ref: baseline_cvd_ir   # 只有配合 applies_to 自动接线时才需要
    applies_to: smoker_cvd_risk_auto
    step_unit: day

# or（比值比）：effective 需要用 baseline_prevalence 做非线性换算
evidence:
  obesity_cvd_or:
    type: or
    value: 1.65              # 文献给的 OR
    baseline_prevalence: 0.12  # 人群患病率 p0，必填
    # 换算：effective = 1.65 / ((1-0.12) + 0.12*1.65) ≈ 1.5306
    #（OR 和 RR 在患病率低时数值接近，患病率越高两者差距越大，这就是为什么 or 需要额外换算而 rr 不需要）
```

**这些 fixture 目前只被验证"能否正确加载/被合法拒绝"**（`test_verify/errors/test_evidence_errors.py`
覆盖的是反例——即声明错误的 fixture 会被可靠拒绝），**没有任何 pytest 真正跑一遍仿真去断言
`description.result` 里写的具体数字**。这意味着如果以后 Loader 的换算逻辑改了，这些写在注释里的
"期望结果"可能悄悄过期而不会被任何测试发现——这是本仓库另一处值得补的验证缺口，尚未处理。

## 已知实现细节（写文档时须如实反映，非建议行为）

**`hr` 的 `baseline_ref` 在基础换算路径上不校验目标类型**：上表 `hr` 行的 `baseline_value` 直接取
`evidence[baseline_ref]['value']`（原始值，未经该条目自身的类型换算）。这在 `baseline_ref` 指向
`ir`/`ard` 条目时无影响（这两种类型的 `effective = value`，原始值与换算值相同），但如果建模者把
`baseline_ref` 误指向一个 `rr`/`or`/`cohens_d` 等条目，Loader 不会报错，会静默用其原始文献值参与
乘法，得到语义不对的结果。`applies_to` 路径（见 [applies_to.md](applies_to.md)）对 `baseline_ref`
有更严格的校验（强制要求指向 `ir`/`ard`），但这条基础换算路径没有——即不使用 `applies_to` 时，
`baseline_ref` 指向非 `ir`/`ard` 条目不会被拦截。建模时应始终让 `hr`/`rr`/`or` 的 `baseline_ref`
指向 `ir`/`ard` 条目。
