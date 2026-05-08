# 0024 — asteval Interpreter 重建而非 symtable.clear()

**状态**: ✅ 已实施  
**日期**: 2026-04-12  
**作者**: shenfan19

---

## 背景

`ModelStructure._initialize_asteval()` 每次加载新模型后需要刷新符号表，将当前变量写入 `asteval.symtable`。
原实现使用 `symtable.clear()` 清空旧条目后再重新写入：

```python
def _initialize_asteval(self):
    self.asteval.symtable.clear()          # ← 问题所在
    for var_name, var in self.variables.items():
        self.asteval.symtable[var_name] = var.value
```

`asteval` 的 `Interpreter` 没有分层符号表（没有"用户层"与"内置层"之分），所有内容（包括 `abs`、`min`、`max`、`sin` 等内置函数）都存放在同一个 `symtable` 字典中。  
`symtable.clear()` 会**一并删除所有内置函数**，导致模型公式中的 `min()`、`max()` 等调用在下一步中抛出 `NameError`，仿真静默失败。

## 决策

不清空，直接重建 `Interpreter()`，让 asteval 自己完成内置函数注册：

```python
def _initialize_asteval(self):
    self.asteval = Interpreter()           # 重建，内置函数自动注册
    # 注入时间常量
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

## 为什么不手动恢复内置函数

手动枚举并恢复所有 asteval 内置（`abs`、`min`、`max`、`sin`、`cos`、`log`、`sqrt` 等 ~30 个）是脆弱的维护负担：asteval 版本升级可能新增/修改内置集合，维护者必须同步跟踪。  
重建 Interpreter 把这份责任交还给 asteval 本身，符合"让工具自己管自己"的原则。

## 性能

`Interpreter()` 构造开销极小（微秒级），每次 `step()` 不会重建，只在 `_initialize_asteval()` 被调用时（即模型加载/变量变更时）才触发。对仿真性能无影响。
