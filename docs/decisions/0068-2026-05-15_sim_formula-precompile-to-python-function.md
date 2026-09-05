# ADR 0068 — Formula Precompilation: asteval → Python Function

## Status

✅ Implemented

## Date

2026-05-15

## Background

The simulation engine's main performance bottleneck was in the `step()` loop of `simulation.py`: every step called `asteval.eval(expr_string)` for every formula, meaning every step re-parsed the expression string, rebuilt the AST, and executed it through asteval's Python interpreter. This is analogous to using `subs` instead of `matlabFunction` at every step in MATLAB.

A typical optimization problem (`pop=50, gen=80`) executes 4,000 full simulations, each with hundreds to thousands of steps, leading to run times over half an hour and severely hampering debugging.

asteval's job is to provide a safe expression-evaluation environment (with math functions and variable isolation), but its runtime overhead is far higher than native Python.

## Decision

### Architecture: asteval → Python function → step-time function call

On the first call to `step()` after a model loads, run `_build_formula_cache()` once:

1. **Extract variable dependencies**: walk the expression AST with `ast.parse()`, extract every `ast.Name` node, and split them into model variables and step-size symbols (`step`, `t`, `HOUR`, etc.).
2. **Generate a Python function**: use `exec()` in an isolated namespace to define a function whose parameters are exactly the dependent variable names:
   ```python
   def _fn(blood_glucose, uptake, utilization, step):
       return blood_glucose + (uptake - utilization) * step
   ```
   Math functions (`sin`, `max`, etc.) are supplied through the function's globals environment (`_FORMULA_GLOBALS`), not as parameters.
3. **Store the function and its parameter list**: cache `(fn, [param_names])` in `self._formula_cache`, along with a priority-sorted formula list (`self._sorted_formulas`).

### How step() calls it

Each step reads the current value of each variable via `_get_arg(name)` (preferring `self.variables[name].value`, falling back to step-size symbols), builds a positional argument list in parameter order, and calls:

```python
new_value = fn(*[_get_arg(n) for n in params])
```

After a variable is updated within a step, the next formula reads its latest value through `_get_arg`, preserving the original within-step dependency-order semantics.

### Fallback mechanism

If `exec()` fails to compile (syntax incompatibility), `fn=None`, and `step()` falls back to `asteval.eval(raw_expr)` without interrupting the simulation.

### Performance comparison

| Approach | Variable access | Per-step cost |
|------|---------|---------|
| asteval (original) | dict lookup + asteval interpreted execution | highest |
| compile() + eval(code, symtable) | dict lookup | medium |
| **Python function (this approach)** | LOAD_FAST (positional argument) | lowest |

Expected speedup is 5-15x, depending on formula complexity and variable count.

## Files affected

- `sim_engine/src/model_structure/simulation.py`: adds `_compile_expr_to_fn()`, `_build_formula_cache()`, `_FORMULA_GLOBALS`, `_STEP_SYMS`; rewrites the formula-execution loop in `step()`

## What doesn't change

- asteval is still kept: used by the validator (`validator.py`), the ODE path (`simulator_engine.py`'s legacy path), and as the fallback on compile failure
- Formula syntax, YAML format, and the variable system are unchanged
- Within-step variable dependency-order semantics are unchanged (guaranteed by priority sorting plus real-time reads via `_get_arg`)
