# models/source — 来源模型构件

## 定位

`source/` 存放**可复用的生理/社会动力学子模型**，是整个模型生态的基础构件层。

每个文件描述一个独立的生理系统或机制（肾功能、运动疲劳、PK/PD 等），供上层场景（`scenarios/`、`papers/`）通过 `imports:` 机制组合调用。

**不在这里放的内容**：
- 完整可运行的仿真场景（放 `scenarios/` 或 `papers/`）
- 游戏内容（放 `stories/`）

## 目录结构

```
components/
  medical/
    disease/      慢性病进展模型（CKD、糖尿病、高血压等）
    fitness/      运动适应与疲劳（Banister 等）
    medicine/     药物动力学（PK/PD，一阶吸收/清除）
    nutrition/    营养素代谢（蛋白质、能量、水分）
    physiology/   生理基础（肾小球滤过、肌肉合成、ALT动力学等）
    surgery/      手术围手术期模型
  social/
    conflict/     冲突与压力模型
    demography/   人口统计动力学
    economy/      经济收支模型
    law/          法律与政策约束
    psychology/   心理健康与认知模型
    technology/   技术扩散模型
```

## 使用方式

```yaml
# 在 scenarios/ 或 papers/ 的场景文件中通过 imports 引用
imports:
  - components/medical/physiology/banister_fitness_fatigue
  - components/medical/disease/ckd_renal_filtration
```

Loader 递归合并导入的子模型，根文件中的同名变量/公式覆盖子模型定义。

## 贡献规范

见 [`docs/model_requirements.md`](../../docs/model_requirements.md)。每个组件文件必须包含：
- `metadata.description`（机制说明）
- `metadata.references`（文献来源）
- 每个变量的 `description` 和 `unit`
