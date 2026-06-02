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
    topic_importance: 5 - 说明      # 通用字段（所有类型）
    framework_demand: 4 - 说明      # 通用字段（所有类型）
    evidence_quality: 4 - 说明      # 通用字段（所有类型）
    paper_value: 5 - 说明           # 仅 papers/
    innovation: 4 - 说明            # papers/ 和 scenarios/
    popularity: 4 - 说明            # 仅 references/
    social_value: 5 - 说明          # 仅 scenarios/
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

## 三、通用字段（所有模型类型共用）

以下三个字段定义跨类型一致，适用于 papers/、scenarios/、references/ 中的任何模型。

### `topic_importance` — 话题现实重要性

该模型所研究主题的现实重要性：受影响人群规模、科学基础地位、社会关注度。

| 分值 | 标准 |
|------|------|
| **5** | 全球性问题影响数十亿人，或基础科学核心机制（糖尿病、血糖调节、重大战争） |
| **4** | 重要专科/社会问题，影响数亿人（慢性肾病、全球冲突、网络安全） |
| **3** | 特定人群或学科问题（镰刀细胞病、黑帮经济、经典文学人物） |
| **2** | 小众话题，受众有限（古代商路、游戏专用组件） |
| **1** | 纯占位或测试，无现实对应 |

### `framework_demand` — 框架内需求强度

该模型在 LM 框架内被其他模型 import 或作为标准案例引用的预期强度。

| 分值 | 标准 |
|------|------|
| **5** | 核心积木，多个上层模型必须 import（glucose_regulation、energy_balance） |
| **4** | 被多个场景或论文依赖（ckd_protein_muscle、banister_fitness_fatigue） |
| **3** | 在特定子领域中等频率使用 |
| **2** | 低频引用，预期只有少数上层模型用到 |
| **1** | 一次性或孤立使用（_ag 游戏专用、TODO 存根） |

### `evidence_quality` — 参数可信度

支撑该模型参数与机制的客观依据质量，跨所有模型类型定义一致。

| 分值 | 标准 |
|------|------|
| **5** | 全部参数有高质量 RCT 或 meta 来源，文献可直接追溯 |
| **4** | 主要参数有良好文献支撑，个别系数为合理估算 |
| **3** | 参数来源混合，部分有文献，部分为合理推算 |
| **2** | 多数参数为估算或经验值，文献支撑薄弱（含 _noref 模型） |
| **1** | 核心参数全为估算，无可追溯来源，或 TODO 存根 |

> **注**：标注 `TODO:SOURCE` 的参数每项直接降 1 分；文件名含 `_noref` 的模型 evidence_quality ≤ 2；TODO 存根模型 evidence_quality = 1。

---

## 四、类型专属字段

字段非强制；不写则缺省，GUI 与引擎均忽略未填字段。

### 4.1 papers/（论文场景模型）

| 字段 | 说明 | 5 分标准 | 1 分标准 |
|------|------|---------|---------|
| `paper_value` | 对本论文的贡献价值：在所属论文中的定位 | 旗舰核心案例，直接支撑主线论点 | 纯辅助附录，不宜独立呈现 |
| `innovation` | 方法论/科学创新度：区分于已有文献的独特贡献 | 独特首创，reviewer 难找先例对比 | 已有充分先例，增量贡献极小 |

> **建议补充字段**（可选）：
> - `reviewer_robustness`: 投稿抗质疑强度（5=reviewer 难以推翻核心结论，1=易被参数估算质疑推翻）

### 4.2 scenarios/（历史/叙事场景）

| 字段 | 说明 | 5 分标准 | 1 分标准 |
|------|------|---------|---------|
| `innovation` | 建模创新度：叙事-科学跨越的独特性 | 首次将该叙事冲突转化为可优化动力学 | 建模直观，无超出预期的新方法 |
| `social_value` | 社会/伦理/历史讨论价值：引发深层讨论的潜力 | 触及普世伦理、重大历史教训、学术公义 | 纯娱乐/展示，无实质讨论价值 |

### 4.3 references/（可复用参考模型）

| 字段 | 说明 | 5 分标准 | 1 分标准 |
|------|------|---------|---------|
| `popularity` | 学术通用度：在领域内的引用广度和建模基础地位 | 教科书级基准，跨领域被引用 | 小众或新兴，基础地位未建立 |

---

## 五、语义说明

### topic_importance vs framework_demand 的区别

两者回答不同问题，评分可以差异显著：

| 示例 | topic_importance | framework_demand | 理由 |
|------|-----------------|-----------------|------|
| glucose_regulation_mw | 5 | 5 | 糖尿病是全球危机，且是所有代谢模型的核心积木 |
| football_2026_noref | 4 | 2 | 足球影响十亿球迷，但此模型参数无来源，复用价值低 |
| raw_berry_2026_ag | 1 | 1 | 游戏专用食物组件，话题和需求都极低 |
| ad1941_ru_leningrad_TODO | 5 | 1 | 列宁格勒围城是重大历史事件，但模型尚为存根 |

### evidence_quality 的跨类型一致性

对于历史场景，"证据"是历史文献和物理/生理文献；对于参考模型，是直接引用的原始研究；对于论文模型，是 RCT 和 meta 来源。定义统一，语境自然适配。

### innovation 的评判原则

创新不等于复杂度。一个简单模型若引入了之前未在该问题上尝试过的机制或优化视角，得分高于一个复杂但重复已知路径的模型。判断标准：**"reviewer 是否能在已发表文献中找到几乎相同的模型？"**

---

## 六、评分更新规则

- 每次参数精化后（如 TODO:SOURCE 填写完毕），同步更新 `evidence_quality`。
- 论文投稿状态变化（如晋升为旗舰案例或降为附录）后，同步更新 `paper_value`。
- 评分是建模者的主观判断，版本控制保留历史；不要删除旧评分注释，而是直接覆写值。
- 评分不进入引擎计算，仅供建模者和协作者参考。

---

## 七、示例

### papers/ 完整示例

```yaml
metadata:
  name: a5_hypertension_gout
  description:
    brief: HCTZ 治疗高血压导致尿酸升高的临床冲突，T2+T4 时间药理学优化。
  ratings:
    topic_importance: 5 - 高血压+痛风是最常见药物冲突之一，患者群体庞大
    framework_demand: 4 - 论文核心案例，被多个 paper 场景依赖
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
  ratings:
    topic_importance: 4 - 医学史最著名的知识阻力案例，医学/科学政策圈高度关注
    framework_demand: 2 - 历史场景，被其他模型直接引用的可能性较低
    evidence_quality: 4 - Rogers 扩散理论和 Carter 传记提供良好文献基础
    innovation: 5 - 首次将科学创新接受度动力学建模为可优化问题
    social_value: 5 - 直接关联循证医学政策，触发深层科学伦理讨论
  tags: [historical, semmelweis, ...]
```

### references/ 完整示例

```yaml
metadata:
  name: ckd_protein_muscle
  description:
    brief: CKD 蛋白质摄入 vs 肌肉保持动态模型。
  ratings:
    topic_importance: 4 - CKD 影响全球数亿患者，营养管理是核心临床问题
    framework_demand: 4 - 已被 A4 系列论文场景导入，多个 CKD 场景依赖
    evidence_quality: 4 - KDIGO 指南和多项 RCT 支撑，个别系数估算
    popularity: 4 - 肾病领域核心场景依赖，建模基础地位良好
  tags: [nephrology, ckd, ...]
```
