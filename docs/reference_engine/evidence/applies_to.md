# Evidence 的 `applies_to`：自动接入 dynamics

> 对应 `reference_engine/src/model_structure/loader.py` 中 `ModelStructure.load()` 里独立于换算循环的第二个 evidence 循环（处理 `applies_to` 字段）。换算出 `effective` 值本身的 8 种子类型公式见 [conversion.md](conversion.md)。YAML 字段声明方式见 `b_lm_model` 仓库 `docs/model.md`「自动接入 dynamics」一节。决策背景见 `b_lm_model` 仓库 `docs/decisions/0040-2026-04-22_sim_医学证据类型与变量映射.md`。

## 解决什么问题

`evidence:` 条目换算出 `effective` 系数后，仍需要有人把它接到某个 `state` 变量的动力学方程上
（比如"这个发病率要累加进疾病风险状态"）。5 种子类型（`ir`/`ard`/`hr`/`rr`/`or`）的接入方式只有
一种没有歧义的写法——"以换算后的系数为速率，按步长累加进目标状态"——声明 `applies_to` 等字段后，
Loader 会自动生成对应的 `Formula`，不需要建模者手写这段样板 dynamics。

`cohens_d`/`beta`/`pk` **不支持** `applies_to`（声明会直接报错）：这 3 种的接入方式本身是建模判断
（过渡形式、回归结构、PK 模型结构不唯一），Loader 不会替建模者选择，必须手写 dynamics。

## 触发条件与校验顺序

对每条 `evidence` 条目，`applies_to` 循环按以下顺序检查（任一步失败即 raise，不静默跳过）：

1. 未声明 `applies_to` → 跳过该条目，不影响任何行为（纯增量字段）。
2. `type` 是 `cohens_d`/`beta`/`pk` → 报错，要求去掉 `applies_to` 手写 dynamics。
3. `applies_to` 指向的变量名必须已在 `variables:` 声明 → 否则报错。
4. 同一个 `applies_to` 目标不能被两条以上 evidence 同时声明 → 否则报错。**原因**：多个风险因子的组合方式（相乘=比例风险假设，还是相加=竞争风险模型）是有争议的流行病学方法论问题，Loader 不代为选择。
5. `step_unit` 必须是 `minute`/`hour`/`day` 之一（与 `formulas.step_unit` 同一约束）→ 否则报错。
6. 按子类型解析 `rate_unit`（见下）→ 必须能在 `TIME_UNIT_SECONDS` 中找到（`minute`/`hour`/`day`/`week`/`month`/`year`）→ 否则报错。

## 生成的表达式

时间单位换算系数：`factor = TIME_UNIT_SECONDS[step_unit] / TIME_UNIT_SECONDS[rate_unit]`
（`step_unit` 是生成公式实际用的步长单位；`rate_unit` 是这条速率本身"自然"的时间单位，二者可以不同，比如 `rate_unit: year` 的年发病率接入 `step_unit: day` 的公式）。

| 子类型 | `rate_unit` 从哪来 | 生成的 dynamics 表达式 |
|--------|-------------------|----------------------|
| `ir` / `ard` | 条目自身声明的 `rate_unit` | `{applies_to} + {ev_name} * {factor} * step` |
| `hr` | `baseline_ref` 指向条目的 `rate_unit` | `{applies_to} + {ev_name} * {factor} * step` |
| `rr` / `or` | `baseline_ref` 指向条目的 `rate_unit` | `{applies_to} + {baseline_ref} * {ev_name} * {factor} * step` |

**为什么 `hr` 和 `rr`/`or` 的表达式不一样**：`hr` 在换算阶段（[conversion.md](conversion.md)）已经把
`effective = baseline_value × HR` 算成了一个绝对速率，所以这里直接乘 `factor * step` 累加即可；
而 `rr`/`or` 换算阶段的 `effective` 是**纯比例**（`rr` 原样，`or` 转换后也仍是比例），本身不是速率，
所以生成表达式里要再乘一次 `{baseline_ref}`（引用基线 `ir`/`ard` 条目换算后的变量值）才能得到
"基线 × 比例"的速率。

`baseline_ref` 的要求：`rr`/`or` 必须显式声明且指向同一 YAML 文件内一个已加载的 `ir`/`ard` 类型
evidence 条目（否则报错，见校验步骤 6 对 `rate_unit` 的间接检查）；`hr` 的 `baseline_ref` 校验较松——
若指向的条目不存在，`rate_unit` 会取到空字符串，仍会在步骤 6 因找不到合法 `rate_unit` 而报错，
但报错信息只会提示"`rate_unit` 无法确定"，不会直接点出是 `baseline_ref` 写错了，排查时需注意。

生成的 `Formula` 存入 `self.formulas[f"_auto_evidence_{ev_name}"]`，`step_unit`/`step_size_sec` 按上表
`step_unit` 填入，`description` 自动生成为 `"自动生成：evidence '{ev_name}' 接入 '{applies_to}'（applies_to）"`。

## 执行顺序说明

`applies_to` 处理是独立于 evidence 换算的**第二个循环**（不并入换算循环），确保无论 YAML 中
`evidence:` 条目的声明顺序如何，`baseline_ref` 指向的条目在这个循环开始前都已经在换算循环中
处理完毕、存在于 `self.variables`/`evidence_dict` 中。
