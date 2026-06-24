# ADR 0068 — 公式预编译：asteval → Python 函数

## 状态

✅ 已实施

## 日期

2026-05-15

## 背景

仿真引擎的主性能瓶颈在 `simulation.py` 的 `step()` 循环：每一步对每一条公式调用 `asteval.eval(expr_string)`，即每步都要重新解析字符串、构建 AST、通过 asteval 的 Python 解释器执行。类比 MATLAB 中每步用 `subs` 而非 `matlabFunction`。

典型优化问题（`pop=50, gen=80`）会执行 4,000 次完整仿真，每次仿真数百到数千步，导致运行时间半小时以上，严重阻碍调试。

asteval 的作用是提供一个安全的表达式求值环境（含数学函数、变量隔离），但其运行时开销远高于原生 Python。

## 决策

### 架构：asteval → Python 函数 → step 调用函数

在模型加载后第一次调用 `step()` 时，执行一次 `_build_formula_cache()`：

1. **提取变量依赖**：用 `ast.parse()` 遍历表达式 AST，提取所有 `ast.Name` 节点，分为模型变量和步长符号（`step`、`t`、`HOUR` 等）。
2. **生成 Python 函数**：用 `exec()` 在隔离命名空间中定义函数，函数参数即依赖的变量名：
   ```python
   def _fn(blood_glucose, uptake, utilization, step):
       return blood_glucose + (uptake - utilization) * step
   ```
   数学函数（`sin`、`max` 等）通过函数的 globals 环境（`_FORMULA_GLOBALS`）提供，不作参数。
3. **存储函数与参数列表**：缓存 `(fn, [param_names])` 到 `self._formula_cache`，同时缓存按优先级排好序的公式列表（`self._sorted_formulas`）。

### step() 调用方式

每步通过 `_get_arg(name)` 读取当前变量值（优先从 `self.variables[name].value`，其次从步长符号），按参数列表顺序构建位置参数列表后调用：

```python
new_value = fn(*[_get_arg(n) for n in params])
```

变量在步内更新后，下一条公式通过 `_get_arg` 读到最新值，保持原有的步内依赖顺序语义。

### 回退机制

若 `exec()` 编译失败（语法不兼容），`fn=None`，`step()` 回退到 `asteval.eval(raw_expr)`，不中断仿真。

### 性能对比

| 方式 | 变量访问 | 每步开销 |
|------|---------|---------|
| asteval（原） | 字典查找 + asteval 解释执行 | 最高 |
| compile() + eval(code, symtable) | 字典查找 | 中等 |
| **Python 函数（本方案）** | LOAD_FAST（位置参数） | 最低 |

预期提速 5–15×，具体倍数取决于公式复杂度和变量数量。

## 影响文件

- `sim_engine/src/model_structure/simulation.py`：新增 `_compile_expr_to_fn()`、`_build_formula_cache()`、`_FORMULA_GLOBALS`、`_STEP_SYMS`；改写 `step()` 公式执行循环

## 不改变的内容

- asteval 继续保留：用于验证器（`validator.py`）、ODE 路径（`simulator_engine.py` 旧路径）和编译失败时的回退
- 公式语法、YAML 格式、变量系统不变
- 步内变量依赖顺序语义不变（靠优先级排序 + `_get_arg` 实时读值保证）
