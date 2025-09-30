---
---
>[!question]+ Task
>```dataviewjs
>const {fan_task} = await cJS();
>fan_task.fn_single_page(dv, 0);
>```

# 模型组装器

## 通用数据存储方案
- 如何从mod数据里调用其他mod数据？用scenary来管理，不然会增加复杂性，与简易原则相悖。
## 数据读取方案
- 方案一般选择
    - 如果表达式来源可信且简单 → 用 `numexpr`（最快）。
    - 如果需要支持函数调用或动态变量 → 用 `asteval`（最灵活）。
- 带分支方案优缺点对比
    - **简单分支**：用 `asteval` 解析 Python 风格的三元表达式。
    - **复杂分支**：用 **分步条件结构** + `numexpr`（性能优先）或 `asteval`（功能优先）。
- 具体实现要逐渐动态调整，不可能一蹴而就，毕竟仿真系统可能处理的问题非常多，要有兼容性

## 🔗 组合逻辑
```python
hybrid_model = {
    "name": "BD-Glucose",
    "components": [bd_model, glucose_eq],
    "couplings": [
        {"var1": "bd.population", "var2": "glucose.host"}
    ]
}
```

> 🔍 AI Prompt:  
> "如何自动识别模型间的冲突参数并合并？"
