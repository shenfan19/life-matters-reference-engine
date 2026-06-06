# 0096 — 模型文件名质量标记约定

**日期**：2026-06-06  
**状态**：✅ 已实施  
**类别**：模型库管理 / 工程约定  

---

## 背景

随着 `models/` 目录扩展到 145+ 个 YAML 文件，出现了三个管理问题：

1. **上传边界不清**：哪些文件应发布到 GitHub？gitignore 只能识别文件名，无法基于 YAML 内部字段过滤。
2. **质量状态不可见**：sim 是否通过、optimizer 是否通过、文献来源是否完整，没有统一的标记方式。之前使用 `_noref`（缺文献）和 `_mw`（纯组件）两种后缀，约定不完整、语义不对称。
3. **test_batch 效率低**：每次对所有文件跑 batch，已通过的模型被反复测试，拖慢验证周期。

---

## 决策

### 三种文件名后缀，其余全部废弃

| 后缀 | 含义 | gitignore |
|------|------|-----------|
| `_nosim` | sim 无法运行（YAML 解析错误、变量/公式引用错误） | ✓ |
| `_noopt` | sim 通过，optimizer 失败（算法报错、约束违反等） | ✓ |
| `_noref` | 缺文献来源（`variables`/`evidence`/`formulas` 中存在 `TODO:SOURCE`） | ✓ |

**组合**：`_nosim_noopt` 是新建或未经测试模型的保守默认状态；`_noref` 可与其他后缀组合（如 `_noref_nosim`）。

**无后缀 = 已确认通过**：三项均满足的文件无任何后缀，即为可发布状态。

### 废弃的旧后缀

| 废弃后缀 | 替换方式 |
|---------|---------|
| `_mw`（纯组件，无 sim/opt by design） | 去掉后缀；若未测试则加 `_nosim_noopt` |
| `_TODO`（草稿/WIP） | 去掉后缀；加 `_nosim_noopt` 表示未测试 |

### gitignore

```
models/**/*_nosim*.yaml
models/**/*_noopt*.yaml
models/**/*_noref*.yaml
```

（models 为独立 repo，`.gitignore` 在该 repo 根目录维护）

### test_batch 倒置过滤

新增 `FILTER_BROKEN=true` 模式，只测文件名含 `_nosim` 或 `_noopt` 的文件：

```bash
FILTER_BROKEN=true MODEL_FOLDER=models/references bash script/test_batch.sh
```

这将 test_batch 从"全量回归"变为"修复队列"——只处理有问题的文件，通过后去掉后缀。

### reviewed: true（可选 YAML 字段）

人工确认过的模型可在 `metadata` 中加 `reviewed: true`，表示建模者已确认机制合理、参数量级正确。这是正向信号，不是发布门控，不参与 gitignore。

---

## 初始执行（2026-06-06）

- 对 `models/papers/`（17 个）、`models/test/`（24 个）执行了 test_batch；
  根据结果标记：6 个 `_nosim`，6 个 `_noopt`（papers），1 个 `_nosim`（test）
- 对 `models/references/`（部分）和 `models/scenarios/`（部分）执行了 test_batch；
  已知失败的文件标记完毕，未测试的文件全部加 `_nosim_noopt`
- 所有 `_mw`（10 个）和 `_TODO`（21 个）文件完成重命名，旧后缀全部清除
- 最终状态：85 个 `_nosim_noopt`，5 个 `_nosim`，4 个 `_noopt`，8 个 `_noref`，43 个干净无后缀

---

## 关联

- `docs/model.md` — 文件名质量标记节（面向建模者）
- `script/test_batch.sh` — `FILTER_BROKEN` 模式实现
- ADR 0091 — CLI 批量测试工具（test_batch 初始设计）
