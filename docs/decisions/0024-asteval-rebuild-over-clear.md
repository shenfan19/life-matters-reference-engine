# 0024 — Rebuild the asteval Interpreter instead of calling symtable.clear()

**Status**: implemented
**Date**: 2026-04-12
**Author**: shenfan19

---

## Background

`ModelStructure._initialize_asteval()` needs to refresh the symbol table after loading a new model, writing the current variables into `asteval.symtable`.
The original implementation cleared out the old entries with `symtable.clear()` before rewriting them:

```python
def _initialize_asteval(self):
    self.asteval.symtable.clear()          # ← the problem
    for var_name, var in self.variables.items():
        self.asteval.symtable[var_name] = var.value
```

`asteval`'s `Interpreter` has no layered symbol table (no separation between a "user layer" and a "built-in layer") — everything, including built-in functions like `abs`, `min`, `max`, `sin`, lives in the same `symtable` dict.
`symtable.clear()` therefore **wipes out all the built-in functions too**, causing calls like `min()` and `max()` in model formulas to raise `NameError` on the next step, failing the simulation silently.

## Decision

Instead of clearing the table, rebuild the `Interpreter()` outright and let asteval register its own built-ins:

```python
def _initialize_asteval(self):
    self.asteval = Interpreter()           # rebuilt; built-in functions register automatically
    # inject time constants
    self.asteval.symtable['SECOND'] = 1.0
    self.asteval.symtable['MINUTE'] = 60.0
    self.asteval.symtable['HOUR']   = 3600.0
    self.asteval.symtable['DAY']    = 86400.0
    self.asteval.symtable['WEEK']   = 604800.0
    self.asteval.symtable['MONTH']  = 2592000.0
    self.asteval.symtable['YEAR']   = 31536000.0
    for var_name, var in self.variables.items():
        self.asteval.symtable[var_name] = var.value
```

## Why not manually restore the built-ins

Manually enumerating and restoring all of asteval's built-ins (`abs`, `min`, `max`, `sin`, `cos`, `log`, `sqrt`, roughly 30 in all) is a fragile maintenance burden: an asteval version upgrade can add or change the built-in set, and a maintainer would have to track it in sync.
Rebuilding the Interpreter hands that responsibility back to asteval itself, consistent with the principle of letting a tool manage its own state.

## Performance

Constructing an `Interpreter()` is extremely cheap (microsecond-scale) and is not rebuilt on every `step()` — it only fires when `_initialize_asteval()` is called (i.e. on model load or a variable change). It has no impact on simulation performance.
