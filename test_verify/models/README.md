# 数值多值测试目录规范

> 任务来源：`2026-06-19_task_code-trust-verification-infra` 任务4。
> 与 `test_verify/test_sim_cli_consistency.py`（CLI/GUI 路径一致性回归）不同，本目录下的测试
> 针对**单个模型变量在多组取值下的数值行为**，用于在改动公式/参数后快速发现"某个变量的
> 输出不再符合预期"的回归。

## 目录结构

```
test_verify/models/<model_name>/<variable_name>/test_*.py
```

- `<model_name>`：`models/` 下某个 `.yaml` 文件的 `metadata.name`（不含路径前缀）。
- `<variable_name>`：该模型里被测试的**输入变量**（`type: input` 或 `type: parameter`），
  即 `pytest.mark.parametrize` 里取多组值的那个变量。
- 同一个变量的多组测试用例放在它自己的文件夹下，不与其他变量的测试混在一个文件里——
  改某个变量的公式时，只需要看这一个文件夹的测试是否还过。

## 写法约定

- 用 `pytest.mark.parametrize` 枚举该变量的多组取值（通常对应模型 YAML 里已有的
  `simulation.plans`，每个 plan 代表该变量的一组取值）。
- 断言**关系**（比例、单调性、符号），不要硬编码引擎输出的具体浮点数——硬编码值在公式
  微调后会大量误报，且新人看 diff 时分不清是真回归还是数值漂移。需要精确值比对的场景，
  参照 `models/test/test_plan.md` 的层1/层2协议，单独走数值精度/文献对标验证，不放在这里。
- 示例：`test_mc_distributions/daily_dose/test_dose_scaling.py` ——
  `test_mc_distributions.yaml` 的 `daily_dose` 在 `low_dose`/`moderate_dose`/`high_dose`
  三个 plan 里取 100/200/350 mg，断言 `plasma_conc`、`peak_plasma` 的确定性稳态值随剂量
  严格线性缩放（该模型的吸收/清除公式对 `daily_dose` 是线性的，无饱和项）。
- 示例（2026-07-10 新增）：`test_plans/caloric_deficit/test_weight_loss_ordering.py` ——
  三个命名 plan（conservative/balanced/aggressive）在 `caloric_deficit`/`exercise_minutes`
  两个维度上依次加码，断言最终 `body_weight` 严格单调递减，并附带 `max(50.0, ...)` 地板夹紧
  的余量检查，避免"恰好触底"导致假通过。
- 示例（2026-07-10 新增，`models/papers/` 下的真实论文引用模型）：
  `bergman_glucose_insulin/carb_intake_per_meal/test_intervention_beats_baseline.py` ——
  四个命名 plan（无干预基线 → ADA标准 → 空腹运动+IF → 联合优化）断言 `insulin_sensitivity`
  严格单调递增，且每个干预方案都以明显余量优于无干预基线；`hba1c` 只断言"干预 vs 基线"这一
  大间距关系，不断言三个干预方案之间的严格排序——三者差距仅约 1e-5（模型自身文档记录的已知
  简并：hba1c 平衡点由 `fasting_glucose_target` 主导，区分力有限），断言过细的排序会让测试
  在正常参数调优下变脆。

## 运行

```bash
pytest test_verify/models/
```
