# 0057 — `models/researches/` 论文专用场景目录

**日期**：2026-05-04  
**状态**：✅ 已实施

---

## 背景

随着论文写作推进，模型场景文件出现两种性质的混用：

- **快速 CI 场景**（`test/`）：时长短（1 周）、参数精简，用于开发调试和快速验证引擎。
- **论文正式场景**：完整时长（52 周 CKD、16 周 Banister）、完整 MC 设置、可复现论文数值。

两类场景混在 `models/scenarios/test/` 下，命名以 `test_` 开头，无法体现与论文的对应关系，且文件名不包含案例标识（A1、B3、A4 等）。

---

## 决策

新建 `models/researches/` 目录，按论文分三层结构：

```
models/researches/
  paper1/    # Paper 1 — JOSS 软件工具论文
    a1_fatty_liver.yaml
    b3_banister.yaml       ← 完整 16 周 V2 协议
  paper2/    # Paper 2 — JAMIA 临床验证
    a4_ckd_protein.yaml    ← 52 周完整版（从 test/ 迁移）
    a5_hypertension_gout.yaml
  paper3/    # Paper 3 — JBI 优化方法
    a4_ckd_protein_pareto.yaml
    a5_hypertension_gout_3obj.yaml
    a6_smoking_stress.yaml
```

**文件命名规则**：`{案例ID}_{描述}.yaml`，从前往后排列（paper 中出现的顺序）。

**`test/` 目录保留**：`test_banister.yaml`（1 周快速 CI）和 `test_glucose_meal.yaml` 继续存在，作为引擎回归测试，不纳入论文范围。

**stub 文件**：尚未完成的场景建立 stub YAML，有完整 metadata 和 TODO 标记，无法运行时被 loader 跳过（捕获异常）。

---

## 理由

- 论文场景和 CI 测试场景目的不同，应明确分离。
- `researches/paper1/b3_banister.yaml` 对应论文 §5.2，比 `test/test_banister.yaml` 更有可读性。
- 每个 YAML 文件的 `metadata.paper` 和 `metadata.case_id` 字段直接映射到论文。
- stub 文件提供占位，确保目录结构完整，让开发者知道还有哪些场景需要实现。

---

## 后果

- `models/scenarios/test/test_ckd_protein.yaml` 迁移到 `models/researches/paper2/a4_ckd_protein.yaml`。
- `docs/validation.md` 中对 CKD 场景的路径引用同步更新。
- `models/researches/` 通过 `scan_models` 递归发现（见 ADR 0058）自动出现在 GUI 模型列表中。
