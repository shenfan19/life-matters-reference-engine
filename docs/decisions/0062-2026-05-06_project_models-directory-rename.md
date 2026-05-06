# 0062 — `models/` 顶层目录与文件命名规范更新

**日期**：2026-05-06  
**状态**：✅ 已实施  
**作者**：shenfan19

---

## 背景

`models/` 下原有三个内容目录：

| 原名 | 内容 |
|------|------|
| `source/` | 基于文献的参考组件模型 |
| `published/` | 与论文绑定的完整场景（见 ADR 0057） |
| `scenarios/` | 开发中的游戏场景与 sim 测试场景 |

两个问题：
1. `source/` 在工程语境下易被误读为"源代码"，语义不清
2. `scenarios/` 与 `published/` 形成对比，但没有体现"进行中/未发布"的工作流状态

同时，`published/` 和 `references/` 下的文件命名以 `{id}_{topic}` 排列，导致同主题文件（如 `ckd_protein` 的 paper2 版和 paper3 版）在目录列表中不相邻，查阅不便。

---

## 决策

### 1. 目录重命名

| 旧名 | 新名 | 理由 |
|------|------|------|
| `source/` | `references/` | 明确表达"基于外部文献的参考实现"，与 YAML 内部 `reference` 字段语义一致 |
| `published/` | 保持不变 | 已在 ADR 0057 确定，语义准确 |
| `scenarios/` | `in_process/` | 与 `published/` 形成明确的状态对比，表达"尚未发布、仍在迭代" |

### 2. 文件命名规范

**`references/` 文件**：`{topic}_{year}_{author}.yaml`
- `topic`：主题词，排前使同类文件自然聚拢
- `year`：取 `metadata.updated` 的年份
- `author`：作者缩写；无可溯源文献的用 `noref` 后缀标记，便于批量查找和补充

示例：
```
flu_2026_noref.yaml
ckd_protein_muscle_2026_noref.yaml
digestive_system_2026_mw.yaml
```

**`published/` 文件**：`{topic}_{case_id}_{paper_id}.yaml`
- `topic`：主题词排前，同主题跨论文版本相邻
- `case_id`：论文内案例编号（A1、B3 等）
- `paper_id`：论文编号（p1、p2、p3）

示例：
```
ckd_protein_a4_p2.yaml
ckd_protein_pareto_a4_p3.yaml    ← 与上一行相邻，同主题一目了然
```

---

## 权衡

`in_process/` 是工作流状态词，不是内容类型词（`scenarios` 是内容类型）。目录中的 `test_*.yaml` 是稳定的 CI 测试固件，并非严格意义上的"进行中"。接受此歧义，因为：
- `published/` vs `in_process/` 的对比关系直观，优先于精确的内容描述
- 若日后需要区分，可细分为 `in_process/game/` 和 `in_process/test/`

---

## 影响

- ADR 0022 结构快照：`models/source/` → `models/references/`
- ADR 0057 结构快照与文件命名规则：更新为新文件名
- ADR 0058：路径示例补充 `references/`、`in_process/`
- CLAUDE.md 代码结构说明更新
- 后端 `api_server.py` 与前端 `ModsManager.tsx` 无需改动（递归扫描，见 ADR 0058）
