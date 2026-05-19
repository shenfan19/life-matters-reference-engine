# LM 软件需求文档

## 核心定位

LM（Life Model）是一个**跨尺度多模型动力学仿真框架**，专注于个人健康轨迹仿真。

**核心能力**：在统一框架里同时运行异尺度模型，并对跨模型交互进行 Regimen 级多目标优化。

> 类比 GPS：不比测绘更精确，但解决了"实时路径规划"这个测绘本身不解决的问题。

## 功能范围

**核心（80%）**：个人健康轨迹仿真

**扩展（20%）**：医学 / 社会学应用
- 增加用户基数
- 展示 LM 通用性
- 不改变核心定位

## 学术空白与技术定位

现有医学仿真工具覆盖：
- 分钟–小时尺度：血糖 ODE、PK/PD
- 年–十年尺度：流行病学 SD

**空白**：日–周–月尺度的跨模型组合，以及"个体行为层多模型跨尺度优化"——无现有工具覆盖。

## 核心价值主张

LM 把分散在文献里的统计结论，通过 YAML 可组合框架，转化为可以跨尺度联合运行并优化的动力学仿真系统。

## 应用场景

LM 的使用方向分为两类，共享同一套引擎和模型。

### 前向应用：行为优化

给定已校准的动力学模型，对用户的行为干预方案（Regimen）做多目标 Pareto 优化，输出可执行的最优方案建议。典型场景：慢病患者的饮食 + 用药联合优化、运动方案设计。

### 逆向应用：文献一致性校验（Simulation-as-Validation）

把文献报告的参数装入 YAML，运行仿真，将输出与文献结论对比，检验文献的内部自洽性和跨文献一致性。

**三种校验模式：**

| 模式 | 操作 | 典型输出 |
|------|------|---------|
| **单文献重现** | 用原文参数跑仿真，看能否重现原文报告的结论 | 参数自洽 / 存在未说明的隐含假设 / 参数规格不完整 |
| **跨文献参数叠加** | 把两篇研究的参数同时装入同一框架运行 | 联合可行域受限 / 需引入分层变量 / 适用人群范围不同 |
| **多文献联合约束** | 多个研究同时作为约束，搜索联合可行的参数值域 | 可行域边界 / 可行域为空集 |

**典型案例**：胰岛素敏感性（HOMA-IR）与糖耐量（OGTT）在不同来源的参数下，仿真结果可能出现内在矛盾——这与医学文献中已知的"各研究结果不一致"问题对应，LM 提供了动力学视角的重现路径。

**社会学应用**：历史数据和社会动力学参数同样可以通过 LM 进行跨来源比对，检验不同研究记录的动力学自洽性。

## 优化双环需求

LM 的优化需求分为两个独立目标：

**外环（Regimen 搜索）**：在给定的生理/动力学模型下，搜索令状态输出最优的用户行为/用药方案（`input` 变量的 Regimen 计划）。这是 LM-Simulator 的核心功能，当前主攻。输出 Pareto 前沿，直接服务于医生、患者决策。

**内环（参数校准）**：将 YAML 中的 `parameter`（机制系数，如 Bergman 最小模型的 p1/p2/p3）对文献观测数据进行拟合，使模型贴合真实生理数据。这属于 **Modeller 工具**的功能范畴，服务于模型开发者，待后续实现。

两环目标正交、工具分离：外环在 `parameter` 已确定的前提下运行，内环校准好后写入模型 YAML 并固定。`evidence` 变量（原始文献效应量，Loader 自动换算）不进入任何优化环。

## 竞争格局

| 方向 | 代表工具 | 与 LM 的关系 |
|------|---------|-----------|
| 生物物理多尺度 | PhysioDesigner, HostSim | 细胞/器官层，不是行为层 |
| 医院运营仿真 | AnyLogic, 混合仿真 | 流程优化，不是个体健康 |
| 数字孪生 | 各 Digital Twin 项目 | 愿景层，无可用工具 |
| 时间营养学 | Chrono-nutrition 研究 | 描述性，无优化框架 |
| 数学肿瘤学 | 化疗 ODE 模型 | 单病种封闭工具，LM 是开放框架 |

**结论**：无现成工具做"个体行为层的多模型跨尺度组合仿真 + 优化"。

## 与 LM-Game 的关系

### 定位分工

| | LM-Research | LM-Game |
|--|------------|---------|
| 用户 | 研究者 / 教师 | 普通公众 |
| 目标 | 学术认可 + 教育采用 | 科普传播 + 情感共鸣 |
| UI | 简洁功能性 | 游戏化 |
| 时间线 | 优先 | LM-Research 稳定后 |

### 底层共享

- 仿真引擎（同一套动力学）
- Scenario 格式（YAML）
- 数据源（文献）

### 独立部分

- UI
- 用户群（专业 vs 大众）
- 推广策略

## 与 NIH/CBK 方向的对接

| NIH 想要的 | LM 提供的 |
|----------|---------|
| 文献数据 FAIR 化再利用 | 把统计结论（RR 值 / 效应量）转为 ODE 参数 |
| 回答新研究问题 | "多个矛盾医嘱同时优化"这类新问题 |
| 可复用基础设施 | 可组合 YAML 模型生态 |

LM 本质上是**动态可计算的 meta-analysis 替代品**，对应 NIH 推动的 Computable Biomedical Knowledge（CBK）方向。

---

## 调试工作流需求

> 以下五个需求按实现优先级排序。1、4、5 优先，2、3 在 5 完成后跟进。

---

### F-1：GUI Working State Layer（GUI 工作状态层）

**背景**：当前引擎优先级颠倒：`_apply_regimens`（GUI 层）先写值，随后 `model.step()` 内的 `_apply_schedules()`（YAML 层）覆盖它。结果是 GUI 的任何编辑对有 YAML schedule 的变量完全无效，用户的输入修改和 Opt 结果都无法真正进入仿真。

**决定**：GUI Working State Layer 是 Sim 面板 `inputEvents[]` 的集合，**优先级永远高于 YAML schedule**。YAML schedule 仅作为加载时的默认值填充 inputEvents，之后引擎不再单独应用 YAML schedule。

**需求**：

| ID | 描述 |
|----|------|
| F-1-1 | 引擎：`simulator_engine.py` session 启动时，将有 GUI regimen 的变量写入 `model.manual_overrides`；`_apply_schedules()` 遇到 `manual_overrides` 中的变量自动跳过 |
| F-1-2 | 行为：GUI 中修改任意输入值（含从 Opt 结果注入的值），该变量本次 session 全程使用 GUI 值，YAML schedule 对其不生效 |
| F-1-3 | 兼容：未在 GUI 中配置 regimen 的变量，YAML schedule 照常应用（向后兼容） |

**ADR**：此决策反转 ADR 0053 对 GUI-controlled 变量的优先级规则，需记录新 ADR 0074。

---

### F-4：F-MPLAN 多方案仿真

**背景**：Pareto 前沿是一组非支配解，建模者需要同时可视化多个方案的仿真轨迹来直观比较权衡（例如：激进 vs 保守 vs 推荐解）。

详细架构决策见 [ADR 0073](decisions/0073-2026-05-16_sim_multi-plan-simulation.md)。

**交互模型**（MVP）：Pareto 解表格 checkbox → 勾选方案 → Run Compared → 图表显示 N 条曲线。Plans 来自 Pareto 前沿，不需要 YAML 多方案格式，不需要 MINPUT 面板。

**需求**：

| ID | 描述 |
|----|------|
| F-MP-1 | Pareto 解表格：每行加 checkbox；表格顶部有"Run Compared"按钮，勾选后并行启动 N 个 session |
| F-MP-2 | 所有勾选方案的仿真曲线显示在同一图表中，按方案颜色区分；图例可单独 toggle |
| F-MP-3 | 方案颜色来自预设调色板，最多 6 个 plan 同时运行 |
| F-MP-4 | MC 模式下，每个方案独立运行概率扰动（相同 seed），各自显示均值曲线 + 置信带 |
| F-MP-5 | 当只有一个 plan 运行时，图表行为与现有单方案完全一致 |

**前置依赖**：F-1（GUI Working State Layer）必须先实现，否则 Pareto 解的值会被 YAML schedule 覆盖。  
**不在范围**：方案保存为 YAML；手动创建自定义 plan 并编辑输入（二期）；跨模型比较。

---

### F-5：Opt→Sim 双向读写（Round-trip）

**背景**：Pareto 前沿是 N 组输入组合；export-model 的 YAML 含有 `optimizer.results`，但重新加载时 Sim 不读取 opt 结果、Opt 无法显式选热/冷启动。同时"以此解运行仿真"按钮只处理单变量，多变量 opt 映射错误。

**架构**：Opt 结果（`pareto_front[i].x`）通过软件层重组为 N 组合规 inputEvents（Plan），Plan 是 Sim 的会话级对象；`optimizer.inputs` 的结构本身隐含了 `x[i]` 与 `{variable, time}` 的映射关系，不需要额外字段。`best.regimen` 仅作人类可读的可视化备选。

**需求**：

| ID | 描述 |
|----|------|
| F-5-1 | **前端 `xToInputEvents` 函数**：输入 `x[]` + 当前 YAML 的 `optimizer.inputs`（或 `regimen`）结构 + 基础 inputEvents；按 `optimizer.inputs` 的变量名顺序 × events 列表顺序展开，逐一匹配 inputEvent（按 `variable + time`），返回更新后的 inputEvents；这是 Opt→Sim 所有路径的共同基础 |
| F-5-2 | **Sim 加载 opt 结果**：加载含 `optimizer.results.best.x` 的模型时，GUI 询问是否将推荐解（`best.x`）预填为当前 inputEvents（调用 `xToInputEvents`）；用户可选"加载推荐解"或"使用模型默认调度" |
| F-5-3 | **Opt 显式热/冷启动**：模型含 `optimizer.results.pareto_front` 时，Opt 面板显示"历史解 N 个（YYYY-MM-DD）"；运行前提供"热启动（继续搜索）"和"冷启动（重新搜索）"两个按钮，废除当前的自动决定逻辑 |
| F-5-4 | **清理残留单变量代码**：`SimOptTab.tsx` 中"以此解运行仿真"按钮改为调用 `xToInputEvents(best_x, optimizerInputs, inputEvents)`，支持任意数量的优化变量 |

**YAML schema**：无变化，不新增字段；`optimizer.inputs` 结构已隐含映射关系。

---

### F-2：Pareto 解逐行 Apply（依赖 F-5）

**背景**：F-5 实现 `xToInputEvents` 后，任意 Pareto 解都可正确映射为 Sim inputEvents。F-2 在此基础上为每行 Pareto 解单独提供"Apply to Sim"入口。

**需求**：

| ID | 描述 |
|----|------|
| F-2-1 | Pareto 前沿表格每行有"Apply to Sim"按钮；点击后调用 `xToInputEvents(row.x, optimizerInputs, inputEvents)` 更新当前 Sim Plan，切换到 Sim Tab |
| F-2-2 | 匹配失败的 x 项（optimizer.inputs 与模型当前状态不一致）给出 warning，其余正常应用 |

---

### F-3：F-OPT-SIM 完整（依赖 F-2）

**背景**：F-2 实现后，opt→sim 通道完整，F-3 扩展为：从 Opt 面板直接将选中 Pareto 解作为新 Plan 加入 F-MPLAN 的 Run Compared 流程。

**需求**：

| ID | 描述 |
|----|------|
| F-3-1 | Pareto 表格每行除"Apply to Sim"外，增加"+ Add to Compared Plans"；加入后自动出现在 F-MPLAN 的方案列表中 |
| F-3-2 | 当 F-MPLAN 与 F-OPT-SIM 同时使用时，Sim 图表同时显示基础方案（用户手动编辑）和 Pareto 方案（来自 Opt）的曲线 |
