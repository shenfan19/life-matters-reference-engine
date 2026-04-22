# Life Matters — 系统总览

> 本文是整个项目的入口文档，描述系统架构、模块分工与文档导航。
> 各模块的详细需求、设计与实现见各自的三段式文档。

---

## 项目定位

**Life Matters（LM）** 是一个跨尺度多模型动力学仿真框架，核心能力是：

1. 把医学/社会学文献里的统计结论（OR、HR、Cohen's d 等）转化为可运行的 YAML 动力学模型
2. 在统一框架内同时运行异尺度模型（分钟–小时–天–年）
3. 对行为干预方案（Regimen）做多目标 Pareto 优化
4. 把科研模型转化为游戏化场景（LM-Game）供大众体验

---

## 四个模块

| 模块 | 职责 | 文档 |
|------|------|------|
| **Sim** | YAML 模型加载、Euler 仿真引擎、Regimen 外环优化 | `sim_requirements` · `sim_design` · `sim_impl` |
| **Game** | 卡牌游戏引擎，消费 Sim 的仿真结果 | `game_requirements` · `game_design` · `game_impl` |
| **Converter** | Sim 模型 → Game Story 半自动转换工具 | `converter_requirements` · `converter_design` · `converter_impl` |
| **Mod** | YAML 模型生态管理（目录结构、版本、发布） | `mod_requirements` · `mod_design` · `mod_impl` |

---

## 变量类型体系

所有 YAML 模型共用同一套变量类型，详见 `sim_design.md § 变量类型（4 种）`：

| 类型 | 用途 | 优化归属 |
|------|------|---------|
| `state` | 随时间演化的状态变量 | — |
| `input` | 用户干预量，Regimen 结构化调度 | 外环 opt（Simulator） |
| `parameter` | 动力学机制系数，由文献数据拟合确定 | 内环 opt（Modeller，待实现） |
| `evidence` | 文献直接给出的效应量（OR/HR/RR/Cohen's d 等），Loader 自动换算 | 不参与优化 |

---

## 双环优化架构

```
内环（Modeller，待实现）      外环（Simulator，当前主攻）
  calibrate parameter    →      search optimal input Regimen
  fit to literature data         Pareto front output
```

详见 `sim_design.md § 双环优化架构`。

---

## 目录结构

```
docs/
  overview.md              ← 本文件
  global_prompt.md         ← 前端 UI/UX 编码规范（sim_gui + game 通用）
  sim_requirements.md · sim_design.md · sim_impl.md
  game_requirements.md · game_design.md · game_impl.md
  converter_requirements.md · converter_design.md · converter_impl.md
  mod_requirements.md · mod_design.md · mod_impl.md
  pending_sim_opt_plan.md  ← Monte Carlo + 外环 opt 实现任务清单
  pending_improvements.md  ← 待修复的已知问题清单
  decisions/               ← 架构决策记录（ADR 0001–0040+）
```

---

## 代码结构

```
sim_gui/      前端仿真界面（React + Vite，端口 5173）
game/         前端游戏界面（React + Vite，端口 5174）
sim_engine/   Python 仿真引擎 + API server
mods/
  models/     纯动力学模型（可复用）
  stories/    预配置游戏场景（组合 model + patches）
```

---

## 跨模块规范

- **前端编码规范**（响应式、颜色 token、i18n、字体、间距等）：`global_prompt.md`
- **架构决策历史**：`decisions/README.md`
