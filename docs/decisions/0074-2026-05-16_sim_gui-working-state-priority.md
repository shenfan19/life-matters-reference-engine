# ADR 0074 — GUI Working State Layer：GUI 优先级高于 YAML Schedule

**日期**：2026-05-16  
**状态**：已采纳  
**范围**：仿真引擎 `simulator_engine.py` + `simulation.py`

---

## 背景

ADR 0053 规定"YAML Schedule 优先于 GUI Regimen"。该规则的初衷是保护模型定义的时序行为不被用户误操作覆盖。

但实际情况是：

1. YAML schedule 在前端加载时已被解析为 `inputEvents`，用户在 GUI 中看到并编辑的就是这些值。
2. 用户修改 inputEvents、或将 Opt 结果注入 inputEvents 后，引擎内的 `_apply_schedules()` 仍会在每步末尾覆盖这些值，导致 GUI 的任何修改对有 YAML schedule 的变量完全无效。
3. F-OPT-SIM（将 Pareto 解应用到 Sim）和 F-MPLAN（多方案比较）均依赖 GUI 值能真正进入引擎——在当前优先级下，这两个功能对有 YAML schedule 的模型都是坏掉的。

## 问题根因

引擎步执行顺序：

```python
# simulator_engine.py 批步循环
self._apply_regimens(model, session['regimens'], ...)  # 1. GUI 值写入
model.step(_native_step)                               # 2. 内部调用：
    └── _apply_schedules()                             #    YAML 覆盖 GUI 值 ← 问题所在
    └── formulas execute                               #    用了 YAML 值，不是 GUI 值
```

`_apply_schedules()` 已有 `manual_overrides` 跳过机制（`simulation.py:74`），但从未被激活用于 GUI regimen 场景。

## 决定

**反转 ADR 0053 对 GUI-controlled 变量的优先级规则**：

- 有 GUI regimen 的变量：GUI 优先（`_apply_schedules` 跳过）
- 没有 GUI regimen 的变量：YAML schedule 照常应用（向后兼容）

**实现**：在 `simulator_engine.py` session 启动时，将有 GUI regimen 的变量写入 `base_model.manual_overrides`：

```python
# session 启动，紧接 input_params 应用之后
for reg in (regimens or []):
    var = reg.get('variable', '')
    if var in base_model.variables:
        base_model.manual_overrides[var] = 'gui'
```

MC 模式下，每个 `run_model` 是 `base_model` 的克隆，克隆方法（`_clone_model`）已复制 `manual_overrides`（`simulator_engine.py:1039`），无需额外处理。

## 与 ADR 0053 的关系

ADR 0053 的以下规则**被本 ADR 修改**：

> "YAML Schedule 的优先级高于 GUI Regimen（`inputEvents`）"

修改后语义：

> "YAML Schedule 是加载时的默认值来源；一旦用户在 GUI 中配置了某变量的 regimen，该变量在本次 session 中由 GUI 全权控制，YAML Schedule 不再介入。"

ADR 0053 中关于 `optimizer` 路径的优先级规则（优化器 Regimen 优先级最高）不变。

## 影响

| 场景 | 变化前 | 变化后 |
|------|--------|--------|
| 用户编辑 GUI inputEvents，变量有 YAML schedule | 编辑无效，YAML 覆盖 | 编辑生效 |
| Opt 结果注入 inputEvents（F-OPT-SIM） | 无效 | 生效 |
| F-MPLAN 多方案，各 plan 有独立 inputEvents | 所有 plan 跑相同 YAML schedule | 各 plan 独立 |
| 没有 GUI regimen 的变量 | YAML schedule 生效 | 不变（兼容） |

## 不在范围

- 永久修改 YAML 的 schedule 值（GUI 层是 session 级，不写回 YAML）
- 修改 optimizer 路径的优先级（optimizer Regimen 已有独立实现）
