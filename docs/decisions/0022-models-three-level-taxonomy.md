# 0022 — Models 三层分类体系

**状态**: ✅ 已实施  
**日期**: 2026-04-12  
**作者**: shenfan19

---

## 背景

随着模型库（`mods/models/`）规模扩大，原有的扁平或浅层目录结构难以维护。主要问题：
- `nutrition/`、`fitness/` 等二级目录缺乏进一步分类
- `social/` 下 `panic/` 目录语义不清晰
- 新建模型无明确"归属"位置，贡献者难以判断放在哪里

## 决策

采用三层分类体系，规则如下：

| 层级 | 含义 | 示例 |
|------|------|------|
| L1 | 领域大类 | `medical/`、`social/` |
| L2 | 学科分支 | `nutrition/`、`fitness/`、`economy/` |
| L3 | 细分方向 | `nutrition/food/`、`nutrition/diet/`、`fitness/individual/` |

**不强制三层到底**：`physiology/` 等已成熟的库组件目录保持扁平，待文件数量增长后再细分，不为层级而层级。

## 结构快照（实施时）

```
mods/models/
├── medical/
│   ├── physiology/           (扁平，库组件，暂不细分)
│   ├── nutrition/
│   │   ├── food/             (单一食材生理模型)
│   │   └── diet/             (饮食模式与干预方案)
│   ├── fitness/
│   │   ├── individual/       (个人耐力项目：跑步、游泳)
│   │   ├── team/             (团队运动：篮球、足球)
│   │   └── racket/           (球拍运动：网球、乒乓球)
│   ├── disease/
│   │   ├── metabolic/        (代谢病：糖尿病、肥胖)
│   │   ├── chronic/          (慢性病：肝病、高血压、CKD)
│   │   ├── acute/            (急性病：流感)
│   │   ├── infectious/       (传染病，待填充)
│   │   ├── mental/           (心理健康，待填充)
│   │   └── genetic/          (遗传病，待填充)
│   ├── medicine/
│   │   ├── pharmacology/     (药代动力学，待填充)
│   │   ├── therapy/          (治疗方案，待填充)
│   │   └── preventive/       (预防医学，待填充)
│   └── surgery/
│       ├── orthopedic/
│       ├── cardiovascular/
│       └── general/
└── social/
    ├── economy/
    │   ├── labor/            (劳动力模型)
    │   ├── market/           (待填充)
    │   └── finance/          (待填充)
    ├── conflict/
    │   ├── war/              (战争动力学)
    │   ├── disaster/         (自然灾害)
    │   └── civil/            (社会动乱，待填充)
    ├── law/
    │   ├── policy/
    │   ├── criminal/
    │   └── civil/
    ├── psychology/           (原 panic/，语义扩展)
    │   ├── panic/
    │   ├── behavior/
    │   └── cognition/
    ├── technology/
    │   ├── innovation/
    │   ├── infrastructure/
    │   └── digital/
    └── demography/
        ├── population/
        ├── mortality/
        └── migration/
```

## 文件路径规范

所有 `imports:` 中的跨目录引用，必须使用从 `mods/` 根目录出发的完整路径：

```yaml
imports:
  - models/medical/physiology/glucose_regulation   # ✅ 正确
  - glucose_regulation                             # ⚠️ 仅在同目录下可用
  - medical/physiology/glucose_regulation          # ❌ 不含 models/ 前缀，会解析失败
```

## 后续影响

- `physiology/` 文件保持扁平，不移动（避免大规模 import 路径变更）
- `standalone: false` 的库组件标注不变
- 新增领域（如 `social/demography/`）预留目录，待建模时填充

## 被否定的方案

- **全扁平**：所有模型放在 `medical/` 下一层。扩展性差，数十个文件难以区分。  
- **四层分类**：过于深层（如 `medical/physiology/endocrine/insulin/`），增加导入路径维护成本。  
- **按病理过程（而非学科）分类**：如 `glycolysis/`、`immune_response/`，对跨学科研究者不直观。
