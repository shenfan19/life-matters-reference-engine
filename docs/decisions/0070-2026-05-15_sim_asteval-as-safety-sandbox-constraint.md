# ADR 0070 — asteval as the Formula-Evaluation Safety Sandbox: Constraint and Non-Negotiability

## Status

⭐⭐ Core constraint, not to be changed

## Date

2026-05-15 (backfilled; the original decision predates the ADR numbering system)

## Background

The formulas executed by the LM engine come from YAML files hand-written by modelers. YAML is external input, not internal engine code, and must be treated as an **untrusted source**. The engine needs an isolated execution environment that can evaluate arbitrary mathematical expressions while disallowing filesystem access, network access, `__import__`, `os`, and other dangerous operations.

Python's native `eval(expr, globals, locals)` provides no security isolation by itself: a user can break out of the sandbox via `__builtins__.__import__('os').system(...)` and similar tricks. Even passing `{'__builtins__': {}}` has known bypasses, and doing so also breaks the availability of built-ins such as `min`/`max`/`abs`.

asteval provides:
- Whitelisted built-in functions (math functions, type conversions, etc.)
- Import, file access, and attribute-chain access are all disallowed
- Controlled capture of syntax errors, so the engine never crashes
- A unified symbol table (`symtable`), convenient for injecting and reading variables

## Decision

**asteval is the non-negotiable safety layer for formula expressions. The following are prohibited:**

1. Using `eval(expr_string, globals_dict)` in place of `asteval.eval(expr)` to process YAML formulas
2. Using `eval(compile(expr, ...), symtable)` in place of `asteval.eval()` to process YAML formulas
3. Any way of bypassing asteval to execute YAML expressions directly

## The correct layered architecture

At runtime, asteval's job is **validation and fallback**, not the performance execution path:

| Layer | Tool | When it fires |
|----|------|---------|
| Validation | `asteval` | checks syntax and variable references when a model loads |
| Compilation | `ast.parse` + `exec` | before the first `step()`, generates a native Python function |
| Execution | native function call | every step, `fn(*args)` |
| Fallback | `asteval.eval()` | on compilation failure, without interrupting the simulation |

The performance optimization (ADR 0068) works by "compiling to a Python function at load time," **not by bypassing asteval**. asteval's `symtable` remains the authoritative source for variable injection; the compiled function reads values through `_get_arg()` from `self.variables[name].value`, and does not depend on symtable as its execution namespace.

## Violation example (counterexample)

```python
# Wrong: executing a YAML formula with Python's raw eval
code_obj = compile(formula.expr, '<f>', 'eval')
result = eval(code_obj, self.asteval.symtable)  # bypasses the safety layer

# Correct: generate a function at load time, call it at execution time, fall back to asteval on failure
fn, params = _compile_expr_to_fn(formula.expr, model_vars)
result = fn(*args) if fn else self.asteval.eval(formula.expr)
```

## Related ADRs

- ADR 0024: rebuilding the asteval Interpreter instead of symtable.clear() (implementation detail)
- ADR 0068: precompiling formulas into Python functions (a performance optimization built on top of this constraint)
