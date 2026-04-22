# Claude Code 项目指令

## 项目概览

Life Matters（LM）——跨尺度多模型动力学仿真框架。
详见 `docs/overview.md`。

## 代码结构

```
sim_gui/      前端仿真界面（React + Vite，端口 5173）
game/         前端游戏界面（React + Vite，端口 5174）
sim_engine/   Python 仿真引擎 + API server
mods/         YAML 模型生态（models/ + stories/）
docs/         设计文档与架构决策
```

## 前端编码规范

所有 sim_gui 和 game 的 UI 代码必须遵循：

@docs/global_prompt.md
