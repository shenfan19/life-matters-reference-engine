# models/papers — 论文专用仿真场景

## 定位

`papers/` 存放**与学术论文直接对应的正式仿真场景**，用于复现论文数值、执行对照实验、生成 Pareto 前沿图。

每个场景文件经过文献参数校准，包含完整的 MC 和 Opt 配置，可复现论文中报告的定量结果。

## 目录结构

```
papers/
  s1/   S1 — JOSS 软件工具论文（撰写中）
  s2/   S2 — JAMIA 临床框架验证（撰写中）
  s4/   S4 — JBI 优化方法论文（待撰写）
```

| 目录 | 论文 | 目标期刊 | 状态 |
|------|------|---------|------|
| `s1/` | S1 — 软件工具论文 | JOSS / SoftwareX | 撰写中 |
| `s2/` | S2 — 临床框架验证 | JAMIA / JBI | 撰写中 |
| `s4/` | S4 — 优化方法论文 | JBI / AI in Medicine | 待撰写 |

## 文件清单

| 文件 | 案例 | 所属论文 | 状态 |
|------|------|---------|------|
| `s1/fatty_liver_a1_s1.yaml` | A1：脂肪肝运动优化 | S1 | TODO：参数待填 |
| `s1/banister_b3_s1.yaml` | B3：Banister 16周V2协议 | S1 | ✅ 可运行 |
| `s2/ckd_protein_a4_s2.yaml` | A4：CKD 蛋白质-肌肉权衡 | S2 | ✅ 可运行 |
| `s2/hypertension_gout_a5_s2.yaml` | A5：高血压+痛风药物冲突 | S2 | TODO：公式待细化 |
| `s4/ckd_protein_pareto_a4_s4.yaml` | A4深化：完整Pareto对照 | S4 | TODO |
| `s4/hypertension_gout_3obj_a5_s4.yaml` | A5深化：三目标扩展 | S4 | TODO |
| `s4/smoking_stress_a6_s4.yaml` | A6：压力×吸烟×精神健康 | S4 | TODO：参数待确认 |

## 验证要求

每个场景须通过对应层级的验证协议，详见 [`docs/validation.md`](../../docs/validation.md)：

| 场景 | 验证层 |
|------|--------|
| b3_banister | 层1（解析解）+ 层2（Morton 1990 Fig.3） |
| a4_ckd_protein | 层2（GFR下降速率、KDIGO自然史） |
| a5_hypertension_gout | 层2（HCTZ效应量，Law 2009） |
| s4 系列 | 层3（Pareto合理性 + 对照实验） |

## 与 temp/ 的区别

`models/temp/` 存放调试用快速场景（PK 测试场景、1周快测等），**临时目录，后续清理删除**。凡需要长期保留和论文引用的场景，应移入此目录并完善参数文献来源。
