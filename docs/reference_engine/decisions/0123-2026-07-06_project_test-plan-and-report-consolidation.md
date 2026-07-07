# 0123 — 测试大纲 + 测试报告合并，迁至 `models/test/`

**日期**：2026-07-06
**状态**：✅ 已接受

---

## 背景

测试/验证相关文档此前散落在四处，互不引用、职责边界模糊：

1. `docs/reference_engine/validation.md`（ADR 0056 三层验证框架：数值精度/文献对标/优化合理性），
   引用了尚未实现的 `scripts/validate_banister.py`。
2. `b_lm_home/process/c_paper_model_verify_checklist.md`（逐 YAML 模型 A–F 人工核对表）。
3. `b_lm_home/tasks/2026-06-25_task_prelaunch-publish-verification-checklist.md`（项目级上线/发表前
   检查清单，与 #2 部分重叠，同时混有部署/安全等内部专属内容）。
4. `tests/errors/README.md`、`tests/models/README.md`、`models/test/{valid,invalid}/README.md`
   （实际 pytest 套件的范围说明，分散引用前三者）。

没有单一"测什么、怎么测、通过标准是什么"（大纲）与"实际测过什么、结果如何"（报告）的区分，
新协作者需要跨四个仓库拼凑全貌。

## 决策

### 1. 拆成大纲 + 报告两个文件，放在 `models/test/`

- `models/test/test_plan.md`：静态方法论——测试范围、协议、通过标准。合并 #1（三层框架全文）、
  #2（A–F 核对表全文）、#3 中通用的引擎数值正确性/API-IO 检查方法（非项目专属 bug 追踪）。
- `models/test/test_report.md`：动态执行记录——每次运行/复核后追加一条结果，不覆盖历史。

**放在 `models/test/` 而不是 `docs/reference_engine/`**：测试对象本质是"引擎 + 模型"的组合（层2/层3
验证、逐模型核对表都是针对具体 YAML 模型运行的），模型生态仓库（`b_lm_model`）已有 `models/test/`
承载测试 fixture（`valid/`/`invalid/`），大纲+报告与这些 fixture 同属"测试基础设施"，放在一起比
分散在 `docs/reference_engine/` 与 `b_lm_home` 两处更容易维护和引用。

### 2. 公开/内部边界：不是所有"测试相关文档"都合并搬迁

`models/test/` 随代码库公开发布（GitHub）。#3 号文档混有部署资源保护（如 session 超时 P0 未实现）、
安全合规等**内部专属**内容——公开这类信息等于公示未修复的漏洞。因此：

- #1、#2 全文合并，原文件删除（内容纯粹是科学方法论，无发布风险）。
- #3 只把**通用检查方法**（引擎数值正确性一般性检查项、API/IO 边界检查方法）合并进
  `test_plan.md`，原文件保留在 `b_lm_home/tasks/`，只做瘦身（重复部分改为指向 test_plan.md 的
  指针），继续承载部署/安全/具体 bug 追踪等内部内容。
- #4 三个 README 不变（描述的是 fixture 目录本身，不是待合并的"测试文档"）。

### 3. 报告只记录已实际验证的内容，不照抄旧文档的断言

生成 `test_report.md` 时实际运行了 `pytest tests/`（22 项全部通过，2026-07-06），如实记录；
层2/层3 验证从未针对当前引擎代码执行过，报告中明确标注"尚未执行"，不复用 `validation.md`
设计期埋入的示例数值冒充已验证结果。

## 结果

- 新增：`models/test/test_plan.md`、`models/test/test_report.md`
- 删除：`docs/reference_engine/validation.md`、`b_lm_home/process/c_paper_model_verify_checklist.md`
- 瘦身：`b_lm_home/tasks/2026-06-25_task_prelaunch-publish-verification-checklist.md`（第1/3节改为
  指针，保留内部专属追踪项）
- 更新引用：根 `README.md`、`docs/reference_engine/DECISIONS.md`、
  `docs/reference_engine/decisions/README.md`、`models/papers/README.md`、
  `b_lm_home/process/lm_update_checklist.md`、`b_lm_home/process/case_study_minipaper_methodology.md`、
  `tests/models/README.md`

## 未决

- `reference_engine/scripts/validate_banister.py` 仍未实现，层1数值精度验证仍依赖人工计算
  （见 `test_plan.md` 第2节现状说明）。
- `tests/models/` 数值回归覆盖率低，仅 1 个模型变量。
