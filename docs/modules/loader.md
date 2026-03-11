# Loader 模块说明 (Data Loading & Assembly)

## 功能说明
Loader（加载器/模型组装器）是连接静态 YAML 文件与动态仿真环境的桥梁引擎。它负责解析位于 `mods/core` 和 `mods/stories` 目录下的模型，处理依赖导入，并在内存中组装成完整的、随时可执行的 `ModStructure` 实例。详细 YAML 规范见 [建模设计手册](../design/model.md)。

## 通用数据存储方案

**跨 mod 数据调用**：通过 `stories`（故事配置）来管理多模型组合，而不是在 `core` 模型里直接相互引用。这避免了模型间的耦合，符合**简易原则**：
- `core` 模型：只声明自己的变量 and 公式，不知道其他模型的存在。
- `story` 配置：负责 `imports` 多个 `core` 模型，并通过 `patches` 修改特定参数。

## 数据读取方案（表达式求值）

系统目前使用 `asteval` 求值公式表达式。针对不同场景的选择原则：

| 场景 | 推荐方案 | 原因 |
|---|---|---|
| 表达式简单、来源可信 | `numexpr` | 最快，C 后端执行 |
| 需要函数调用或动态变量 | `asteval` | 最灵活，支持 Python 语法子集 |
| 简单条件分支 | `asteval` 三元表达式 | 直接解析 `x if cond else y` |
| 复杂分支（性能优先） | 分步条件结构 + `numexpr` | 预先分组执行 |

> 具体实现要逐渐动态调整，不可能一蹴而就。仿真系统可能处理的问题非常多，要保持向后兼容性。

## 组合逻辑与冲突检测

当多个模型合并时，需要处理变量命名冲突：

```python
hybrid_model = {
    "name": "BD-Glucose",
    "components": [bd_model, glucose_eq],
    "couplings": [
        {"var1": "bd.population", "var2": "glucose.host"}
    ]
}
```

**冲突检测策略**：
- 根模型（调用方）中定义的变量 and 公式，**始终覆盖**被导入模型中的同名定义。
- 对于存在语义歧义的同名变量（如两个模型都定义了 `body_weight`），发出警告，要求用户在 `patches` 中明确指定使用哪个值。

## 架构约束检测
- 禁止循环依赖（`A imports B imports A`）。
- 禁止 `core` 模型 import `story` 模型。
- 若 `core` 模型中包含 `optimizer` 字段，给出警告，建议迁移至 `story` 层。

## AST 预编译
在加载期将文本形式的 `dynamics` 表达式转化为 `asteval` 的安全语法树节点，加速 Simulator 每一步循环求值速度。
