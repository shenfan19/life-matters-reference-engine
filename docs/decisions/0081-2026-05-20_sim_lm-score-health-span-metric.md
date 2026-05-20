# ADR 0081 — LM Score：Life Matters 健康时长核心指标

**Date**: 2026-05-20
**Status**: Implemented (in + run)

---

## Requirements

### 背景

Life Matters 框架的核心命题是"行为干预能延长/改善多少健康时间"。需要一个标准化的方式表达"在指标崩溃前存活的时长"或"在安全状态内度过的累计时间"这一核心科学目标，并能作为优化器的优化目标。

### 功能需求

**R1**：支持将"所有关键指标同时在安全范围内的累计时长"作为优化目标  
**R2**：健康条件由建模者在 YAML 中自由定义（asteval 表达式，可 AND/OR 多个指标）  
**R3**：支持两种积累语义：可恢复（cumulative）和不可逆（latch）  
**R4**：完全通过 YAML 变量 + 公式实现，不依赖任何引擎特殊处理  
**R5**：变量完全透明，所有时间步均可输出和查看  

### 约束需求

**C1**：引擎不得对 `lm_score` 进行任何自动注入或特殊过滤  
**C2**：`lm_score` 是约定变量名，建模者可自由覆盖或重命名  
**C3**：GUI 唯一特殊处理：目标变量选择器中 `lm_score` 显示 ⭐ 标记，仅为识别方便  

---

## Design

### 三种目标语义

| 语义 | 实现 | 适用场景 |
|------|------|---------|
| **时刻值** | `metric: final/max/min/mean`（已有） | 单一指标的某时刻值 |
| **健康累计时长**（可恢复） | `lm_score` + if-else 公式 | 慢性病、临时症状、可恢复 |
| **首次崩溃前时长**（不可逆） | `lm_score` + `lm_alive` latch 公式 | 器官衰竭、死亡事件 |

### 为何纯 YAML 而非代码注入

- asteval 已完整支持 `lm_score + step if (condition) else lm_score` 这类条件表达式
- 科研软件要求变量完全透明，代码自动生成变量违反此原则
- YAML 模板更灵活：建模者可调整条件、单位、公式细节，无需理解框架内部
- 多模型合并时，标准 import 覆盖规则足够处理大多数场景；复杂 AND 合并由建模者在顶层显式写出

### 唯一允许的代码处理

**Builder/Sim import 合并时**（未来按需实现）：若需自动 AND 合并多个子模型各自的 `lm_score` 条件，可在 import 合并逻辑中检测多个 `lm_score_update` 公式并合并条件。此功能当前不实现，由建模者手动合并。

---

## Implementation

### 影响文件

```
docs/model.md                    ✅ lm_score 章节：完整 YAML 写法 + 两种模式 + 设计原则
docs/decisions/0081（本文件）    ✅

sim_gui/src/components/
  SimSetupTab.tsx                ✅ 目标变量选择器：lm_score 显示 ⭐（唯一 GUI 特殊处理）
```

### 无需修改的文件

```
sim_engine/src/model_structure/loader.py    不注入任何变量或公式
sim_engine/src/simulator_engine.py          不过滤任何变量，保持完全透明
sim_gui/src/components/Simulator.tsx        不自动预填优化目标
```
