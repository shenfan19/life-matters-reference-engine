# ADR 0070 — asteval 作为公式求值安全沙箱：约束与不可替代性

## 状态

⭐⭐ 核心约束，不可更改

## 日期

2026-05-15（补录；原始决策早于 ADR 编号体系建立）

## 背景

LM 引擎执行的公式来自建模者手写的 YAML 文件。YAML 是外部输入，不是引擎内部代码，属于**不可信来源**。引擎需要一个能执行任意数学表达式、同时不允许访问文件系统、网络、`__import__`、`os` 等危险操作的隔离执行环境。

Python 原生 `eval(expr, globals, locals)` 本身没有安全隔离：用户可以通过 `__builtins__.__import__('os').system(...)` 等方式突破沙箱。即使传入 `{'__builtins__': {}}` 也存在绕过手段，且会破坏 `min`/`max`/`abs` 等内置函数的可用性。

asteval 提供：
- 白名单式内置函数（数学函数、类型转换等）
- 禁止 import、文件访问、属性链式访问等危险操作
- 语法错误的可控捕获，不会令引擎崩溃
- 统一符号表（`symtable`），便于变量注入和读取

## 决策

**asteval 是公式表达式的不可替代安全层。以下行为被禁止：**

1. 用 `eval(expr_string, globals_dict)` 替代 `asteval.eval(expr)` 处理 YAML 公式
2. 用 `eval(compile(expr, ...), symtable)` 替代 `asteval.eval()` 处理 YAML 公式
3. 任何绕过 asteval 直接执行 YAML 表达式的方式

## 正确的分层架构

asteval 在运行时的职责是**验证和回退**，不是性能执行路径：

| 层 | 工具 | 触发时机 |
|----|------|---------|
| 验证层 | `asteval` | 模型加载时检查语法和变量引用 |
| 编译层 | `ast.parse` + `exec` | 首次 `step()` 前，生成原生 Python 函数 |
| 执行层 | 原生函数调用 | 每步 `fn(*args)` |
| 回退层 | `asteval.eval()` | 编译失败时，不中断仿真 |

性能优化（ADR 0068）通过"加载时编译为 Python 函数"实现，**而非绕过 asteval**。asteval 的 `symtable` 继续作为变量注入的权威来源；编译后的函数通过 `_get_arg()` 从 `self.variables[name].value` 读值，不依赖 symtable 作为执行命名空间。

## 违规案例（反面示例）

```python
# ❌ 错误：直接用 Python eval 执行 YAML 公式
code_obj = compile(formula.expr, '<f>', 'eval')
result = eval(code_obj, self.asteval.symtable)  # 绕过了安全层

# ✅ 正确：加载时生成函数，执行时调用；失败时回退 asteval
fn, params = _compile_expr_to_fn(formula.expr, model_vars)
result = fn(*args) if fn else self.asteval.eval(formula.expr)
```

## 关联 ADR

- ADR 0024：asteval Interpreter 重建而非 symtable.clear()（具体实现细节）
- ADR 0068：公式预编译为 Python 函数（性能优化，建立在本约束之上）
