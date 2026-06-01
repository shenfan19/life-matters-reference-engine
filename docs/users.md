# 用户与部署模式

## 当前部署形态

Life Matters Simulator 支持两种部署模式，由环境变量 `SCS_MODE` 控制：

| 模式 | 启动方式 | 写操作 | CLI |
|------|---------|--------|-----|
| **本地模式**（默认） | `uvicorn ...`（不设 SCS_MODE） | 完整权限 | ✅ 可用 |
| **SCS 模式**（云端演示） | `SCS_MODE=true uvicorn ...` | 禁止写服务器文件 | ❌ 不适用 |

两种模式共用同一个 `sim_engine/` 和 `sim_gui/`，差别仅在写操作保护。  
详见 [ADR 0078](decisions/0078-2026-05-18_project_scs-mode-design.md)。

---

## 本地用户的数据布局

```
models/          ← 模型定义（git 管理，公开）
output/          ← CLI 运行结果（gitignore，本地私有）
  *_sim_YYYYMMDD_HHMM.csv
  *_opt_YYYYMMDD_HHMM.csv
  *_{mode}.log
```

完整数据流见 [`data_flow.md`](data_flow.md)。

---

## 用户账号体系

当前版本不引入用户账号。SCS 模式通过无账号的写保护实现多人安全共享。  
未来若引入账号体系，鉴权层将替代 `SCS_MODE`，届时本文件随之更新。
