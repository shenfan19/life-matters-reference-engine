# Life Matters — 系统架构与文档导航

> 跨尺度多模型动力学仿真框架，对个体行为（Regimen）进行多目标优化决策。

---

## 项目定位

**Life Matters（LM）** 的核心能力：

1. 把医学/社会学文献里的统计结论（OR、HR、Cohen's d 等）转化为可运行的 YAML 动力学模型
2. 在统一框架内同时运行异尺度模型（分钟–小时–天–年）
3. 对行为干预方案（Regimen）做多目标 Pareto 优化
4. 把科研模型转化为游戏化场景（LM-Game）供大众体验

### 与经典工具的层级关系

| 工具 | 核心能力 | 与 LM 的关系 |
|------|---------|------------|
| **NONMEM / Monolix** | 群体参数估计（fit） | LM 消费其输出；LM 无严格统计拟合能力 |
| **SimBiology / PKSim** | 单模型机制仿真（simulate） | LM 在其上加调度层 + 优化层；不替代 |
| **LM** | 跨模型行为优化（decide） | 在模型之上的**行为优化层（Decision Layer）** |

> **LM = argmax\_regimen f(state, regimen)**  
> 把生物模型变成可执行的决策系统，而不是更好的建模或拟合工具。

---

## 四个模块

| 模块 | 职责 | 文档 |
|------|------|------|
| **Sim** | YAML 模型加载、Euler 仿真引擎、Regimen 外环优化 | `sim_requirements` · `sim_design` · `sim_impl` |
| **Game** | 卡牌游戏引擎，消费 Sim 的仿真结果 | `game_requirements` · `game_design` · `game_impl` |
| **Converter** | Sim 模型 → Game Story 半自动转换工具 | `converter_requirements` · `converter_design` · `converter_impl` |
| **Model** | YAML 模型生态（目录结构、格式规范、数据要求） | `model_design` · `model_requirements` |

---

## 变量类型体系

所有 YAML 模型共用同一套变量类型：

| 类型 | 用途 | 优化归属 |
|------|------|---------|
| `state` | 随时间演化的状态变量 | — |
| `input` | 用户干预量，由 Regimen 结构化调度 | 外环 opt（Simulator） |
| `parameter` | 动力学机制系数，由文献数据拟合确定 | 内环 opt（Modeller，待实现） |
| `evidence` | 文献直接给出的效应量（OR/HR/RR/Cohen's d），Loader 自动换算 | 不参与优化 |

---

## 双环优化架构

```
内环（Modeller，待实现）      外环（Simulator，当前主攻）
  calibrate parameter    →      search optimal input Regimen
  fit to literature data         Pareto front output
```

详见 `sim_design.md § 双环优化架构`。

---

## 快速开始

**依赖**：Python 3.10+，Node.js 18+

```bash
# 后端
pip install -r sim_engine/requirements.txt
cd sim_engine && python src/api_server.py   # http://localhost:18080

# 仿真前端
cd sim_gui && npm install && npm run dev    # http://localhost:5173

# 游戏前端
cd game && npm install && npm run dev       # http://localhost:5174
```

两个前端均通过 Vite proxy 将 `/api` 转发至后端 `:18080`。

---

## 常见问题

**后端端口占用？** 默认 18080。修改 `sim_engine/src/api_server.py`，同步更新 `sim_gui/vite.config.ts` 和 `game/vite.config.ts` 的 proxy 目标。

**前端空白？** 确认后端已启动，访问 `http://localhost:18080/api/health` 验证，再检查 `npm install` 是否完成。

**如何添加模型？** 将 `.yaml` 放入 `models/components/`，格式见 `model_design.md`。

**如何添加游戏场景？** 在 `models/stories/` 下新建子目录，放入 `game_story.yaml`。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [model_design.md](model_design.md) | YAML Schema 完整规范（变量、公式、schedules、优化器） |
| [model_requirements.md](model_requirements.md) | 建模数据标准（description、reference 强制要求） |
| [sim_design.md](sim_design.md) | Simulator 软件设计（Regimen K×4、会话管理） |
| [sim_impl.md](sim_impl.md) | Simulator 实现细节 |
| [opt_impl.md](opt_impl.md) | Optimizer 实现细节（NSGA-II、scipy、MC 内嵌） |
| [game_design.md](game_design.md) | 游戏机制设计 |
| [global_prompt.md](global_prompt.md) | 前端 UI/UX 编码规范（颜色 token、i18n、响应式） |
| [decisions/README.md](decisions/README.md) | 架构决策记录索引（ADR 0001–0053+） |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
