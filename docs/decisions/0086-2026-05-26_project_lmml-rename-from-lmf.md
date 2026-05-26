# 0086 — 格式命名：Life Matters Format (LMF) → Life Matters Model Language (LMML)

**状态**：✅ 已实施  
**日期**：2026-05-26

## 背景

项目格式曾命名为 **Life Matters Format (LMF)**。比较同领域命名惯例（SBML、CellML、NeuroML）后，发现两个问题：

1. **"Format" 过于宽泛**：不传递格式类型信息（SBML 用 "Markup Language" 明确表明结构）。
2. **覆盖范围不准**："Simulation Language" 仅覆盖仿真，但该格式同时内含 `optimizer:` 块，是对**模型**的完整描述，而非某种运行模式的描述。

"Life Matters" 品牌保留不变——其名词/动词双关（matters = 重要的事 / 生命很重要）是有意设计，且在国际科研命名中具有差异化识别度。

## 决策

格式全称改为 **Life Matters Model Language**，缩写 **LMML**。

软件/工具品牌维持 **Life Matters**（简称 LM），不加后缀。

| 层级 | 名称 | 缩写 |
|------|------|------|
| 项目/软件品牌 | Life Matters | LM |
| 模型格式 | Life Matters Model Language | LMML |
| 运行模式 | Simulation / Optimization | — |

## 理由

- "Model Language" 与 CellML、NeuroML 命名模式一致，专业认可度更高
- "Model" 准确描述格式范围：变量、方程、仿真配置、优化配置均属于模型定义层，不绑定某种运行方式
- 缩写 LMML 比 LMF 携带更多语义信息
- 软件与格式分离命名（LM vs LMML）符合领域惯例（如 Chrome 与 HTML）

## 后果

- ✅ 论文标题、摘要中的 LMF 统一替换为 LMML
- ✅ 模型 YAML description 字段中的 LMF 替换为 LMML
- ✅ 内部规划文档中的 LMF 替换为 LMML
- ✅ `lm_score`、`lm_*` 变量名**不受影响**（这是软件/框架层的命名，不是格式缩写）
- ✅ 历史 ADR 保持不变（ADR 不回溯修改）
