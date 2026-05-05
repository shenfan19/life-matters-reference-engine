# 0057 — `models/papers/` 论文专用场景目录

**日期**：2026-05-04（创建）；2026-05-05（更新：`researches/` → `papers/`）  
**状态**：✅ 已实施

---

## 背景

随着论文写作推进，模型场景文件出现两种性质的混用：

- **快速 CI 场景**（`test/`）：时长短（1 周）、参数精简，用于开发调试和快速验证引擎。
- **论文正式场景**：完整时长（52 周 CKD、16 周 Banister）、完整 MC 设置、可复现论文数值。

两类场景混在 `models/scenarios/test/` 下，命名以 `test_` 开头，无法体现与论文的对应关系。

---

## 决策

### 目录命名

初始命名为 `models/researches/`，后更名为 `models/papers/`。

**更名理由**：`papers/` 比 `researches/` 更直接——子目录以论文名命名，发表后可改为论文标题；用户一眼可知这是已调试完成、与论文绑定的模型。

### 目录结构

```
models/papers/
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

论文发表后，子目录（`paper1/`）可改名为论文短标题（如 `banister_fitness_2026/`），使 repo 对外部读者自文档化。

**`test/` 目录保留**：`test_banister.yaml`（1 周快速 CI）和 `test_glucose_meal.yaml` 继续存在，作为引擎回归测试，不纳入论文范围。

---

## 理由

- 论文场景和 CI 测试场景目的不同，应明确分离。
- `papers/paper1/b3_banister.yaml` 对应论文 §5.2，比 `test/test_banister.yaml` 更有可读性。
- 每个 YAML 文件的 `metadata.paper` 和 `metadata.case_id` 字段直接映射到论文。

---

## 后果

- `models/scenarios/test/test_ckd_protein.yaml` 迁移到 `models/papers/paper2/a4_ckd_protein.yaml`。
- `docs/validation.md`、`models/components/README.md`、`models/scenarios/README.md` 中路径引用同步更新。
- `models/papers/` 通过 `scan_models` 递归发现（见 ADR 0058）自动出现在 GUI 模型列表中。
