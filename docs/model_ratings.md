# 模型评分体系（Model Ratings）

> 本文件是 LM 框架中 YAML 模型 `metadata.ratings` 字段的规范说明。
> 适用范围：`models/papers/`、`models/scenarios/`、`models/references/`。

---

## 一、总体说明

`ratings` 是 `metadata` 下的可选块，用于在模型文件内嵌入对该模型的结构化评估。
评分不替代 `description` 中的文字说明；两者互补——文字说明讲"是什么"，评分回答"值多少"。

**位置**：`metadata.ratings`，置于 `description` 之后、`tags` 之前。

```yaml
metadata:
  name: ...
  description:
    brief: ...
  ratings:
    research_demand: 5 - 说明
    evidence_quality: 4 - 说明
    paper_value: 5 - 说明      # 仅 papers/
    innovation: 4 - 说明
  tags: [...]
```

---

## 二、评分标尺（1–5 分）

| 分值 | 含义 |
|------|------|
| **5** | 最高：充分、显著、独特 |
| **4** | 较高：良好，有小瑕疵或轻微局限 |
| **3** | 中等：尚可，存在明确弱点或尚未精化 |
| **2** | 偏低：辅助性或衍生性，独立价值有限 |
| **1** | 最低：纯占位、高度估算，或仅用作测试 |

**格式**：`field: N - 一句解释`

```yaml
evidence_quality: 3 - 安慰剂效应未建模，菌群稳定性为聚合代理，生态效度有限
```

评分数字与解释之间用 ` - ` 分隔（空格-连字符-空格）。解释控制在 30 字以内，聚焦决定分值的核心依据。

---

## 三、各模型类型的评分字段

字段非强制；不写则缺省，GUI 与引擎均忽略未填字段。
建议按"模型类型"选取对应字段集，可灵活增减。

### 3.1 papers/（论文场景模型）

| 字段 | 说明 | 5 分标准 | 1 分标准 |
|------|------|---------|---------|
| `research_demand` | 研究需求度：该临床/科学问题的真实未解程度 | 指南明确空白、高发疾病、政策盲区 | 纯方法验证展示，无独立科学需求 |
| `evidence_quality` | 模型可信度：参数与机制的文献支撑质量 | 全部参数有高质量 RCT 或 meta 来源 | 核心参数全为估算，无可追溯来源 |
| `paper_value` | 对本论文的贡献价值：在所属论文中的定位 | 旗舰核心案例，直接支撑主线论点 | 纯辅助附录，不宜独立呈现 |
| `innovation` | 方法论/科学创新度：区分于已有文献的独特贡献 | 独特首创，reviewer 难找先例对比 | 已有充分先例，增量贡献极小 |

> **建议补充字段**（可选）：
> - `reviewer_robustness`: 投稿抗质疑强度（5=reviewer 难以推翻核心结论，1=易被参数估算质疑推翻）

### 3.2 scenarios/（历史/叙事场景）

| 字段 | 说明 | 5 分标准 | 1 分标准 |
|------|------|---------|---------|
| `research_demand` | 展示/教育需求度：作为演示案例的吸引力和适用范围 | 大众认知度高，科普和学术均适用 | 小众冷门，展示价值有限 |
| `evidence_quality` | 历史/科学参数可信度：历史文献与科学模型的支撑质量 | 历史记录扎实，物理/生理参数有文献 | 完全为创作设定，无客观依据 |
| `innovation` | 建模创新度：叙事-科学跨越的独特性 | 首次将该叙事冲突转化为可优化动力学 | 建模直观，无超出预期的新方法 |
| `social_value` | 社会/伦理/历史讨论价值：引发深层讨论的潜力 | 触及普世伦理、重大历史教训、学术公义 | 纯娱乐/展示，无实质讨论价值 |

### 3.3 references/（可复用参考模型）

| 字段 | 说明 | 5 分标准 | 1 分标准 |
|------|------|---------|---------|
| `research_demand` | 组件需求度：被上层模型复用的科学必要性 | 领域核心机制，无法绕开 | 高度专项，极少场景用到 |
| `evidence_quality` | 参数可信度：参数来源的文献质量 | 所有参数均有高质量来源 | 大量参数估算，标注 TODO |
| `popularity` | 通用度：在领域内的引用广度和建模基础地位 | 教科书级基准，跨领域被引用 | 小众或新兴，基础地位未建立 |

---

## 四、语义说明

### research_demand 的解读

`research_demand` 在不同模型类型下语义略有不同：
- **papers**：该疾病/临床问题的真实科学需求——指南是否有空白？患者群体是否足够大？
- **scenarios**：作为演示/教育材料的吸引力——受众规模和认知基础。
- **references**：上层模型导入的频率预期——是否是组合场景不可或缺的积木？

### evidence_quality 的跨类型一致性

`evidence_quality` 在所有类型中均指"支撑该模型参数与机制的客观依据质量"。
对于历史场景，"证据"是历史文献和物理/生理文献；对于参考模型，是直接引用的原始研究。
**标注 TODO:SOURCE 的参数每项直接降 1 分**；未标注但明确为估算的参数酌情降 0.5-1 分。

### innovation 的评判原则

创新不等于复杂度。一个简单模型若引入了之前未在该问题上尝试过的机制或优化视角，得分高于
一个复杂但重复已知路径的模型。判断标准：**"reviewer 是否能在已发表文献中找到几乎相同的模型？"**

---

## 五、评分更新规则

- 每次参数精化后（如 TODO:SOURCE 填写完毕），同步更新 `evidence_quality`。
- 论文投稿状态变化（如晋升为旗舰案例或降为附录）后，同步更新 `paper_value`。
- 评分是建模者的主观判断，版本控制保留历史；不要删除旧评分注释，而是直接覆写值。
- 评分不进入引擎计算，仅供建模者和协作者参考。

---

## 六、示例

### papers/ 完整示例

```yaml
metadata:
  name: a5_hypertension_gout
  description:
    brief: HCTZ 治疗高血压导致尿酸升高的临床冲突，T2+T4 时间药理学优化。
    ...
  ratings:
    research_demand: 5 - 临床最常见药物冲突之一，患者群体庞大
    evidence_quality: 4 - MAPEC RCT 证据支撑，尿酸昼夜节律系数待精化
    paper_value: 5 - 论文最强候选案例，Pareto 结论直接可操作
    innovation: 4 - 时间药理学框架化，高质量先例存在但多目标组合形式为新贡献
  tags: [paper2, hypertension, gout, ...]
```

### scenarios/ 完整示例

```yaml
metadata:
  name: ad1847_hu_semmelweis
  description:
    brief: 塞麦尔维斯洗手倡导仿真场景（1847–1865）。
    ...
  ratings:
    research_demand: 3 - 历史案例，教育价值为主，受众限于医学史和科学政策圈
    evidence_quality: 4 - Rogers 扩散理论和 Carter 传记提供良好文献基础
    innovation: 5 - 首次将科学创新接受度动力学建模为可优化问题
    social_value: 5 - 医学史最著名的知识阻力案例，直接关联循证医学政策
  tags: [historical, semmelweis, ...]
```

### references/ 完整示例

```yaml
metadata:
  name: ckd_protein_muscle
  description:
    brief: CKD 蛋白质摄入 vs 肌肉保持动态模型。
    ...
  ratings:
    research_demand: 5 - CKD 营养管理是临床核心问题，被多个场景复用
    evidence_quality: 4 - KDIGO 指南和多项 RCT 支撑，个别系数估算
    popularity: 4 - 肾病领域核心场景依赖，已被 A4 系列场景导入
  tags: [nephrology, ckd, ...]
```
