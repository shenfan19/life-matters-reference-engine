# Claude Code 项目指令

## 项目概览

Life Matters（LM）——跨尺度多模型动力学仿真框架。
详见 `docs/README.md`。

## 代码结构

```
sim_gui/      前端仿真界面（React + Vite，端口 5173）
game/         前端游戏界面（React + Vite，端口 5174）
sim_engine/   Python 仿真引擎 + API server
models/       YAML 模型生态（components/ + scenarios/ + stories/）
docs/         对外公开文档（技术规范、架构决策、建模格式）
go/           内部文档（策略规划、论文草稿、定位分析）——不随代码发布
```

## 目录发布规则

- `docs/`：**公开**，随代码发布到 GitHub，内容须适合外部读者
- `go/`：**内部**，不发布，不在 docs/ 中引用 go/ 下的路径
- 修改 docs/ 前确认内容不含商业策略、职业规划等内部信息

## 前端编码规范

所有 sim_gui 和 game 的 UI 代码必须遵循：

@docs/global_prompt.md
