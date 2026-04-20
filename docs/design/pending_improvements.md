# 待处理改进计划

> 创建日期：2026-04-20  
> 状态：待处理
- [ ] sim opt input 核心 [priority:: high]
---

## 问题 1：Regimen 仿真后端时间调度（已完成基础实现）

**当前状态（已改进）**：`batch_steps` 每步调用 `_apply_regimens`，按 HH:mm 时刻触发事件，同时支持执行日（days）和有效期（valid_range）过滤。

**尚待处理**：

- **多事件叠加语义**：同一 step 内多个 Regimen 写同一变量时，目前后写覆盖前写。如果语义应为"累加"（如多次进食），需要在 `_apply_regimens` 里改成先读当前值再加上 `value`。
- **仿真步长 vs 事件精度**：若步长 > 1 小时（如 3600s），同一步内可能跨多个事件时刻，现有逻辑只在窗口内命中一次，基本够用，但若步长很大（如一天）则所有当天事件都会触发，需测试验证。
- **valid_range 与仿真起始日期对齐**：目前以 1900-01-01 为仿真第 0 天。若场景有实际起始日期（如 Newton 1666），应读取场景元数据的 start_date 字段并传入引擎。

---

## 问题 2：Newton YAML 公式与新单位（per-event 量）不一致

**背景**：上次将 Newton YAML 中食物摄入变量的单位从 `g/min`/`ml/min` 改为每次摄入量 `g`/`ml`，并调整了取值范围。但 YAML 中的微分方程公式仍基于旧的速率语义（例如 `kcal_intake += bread_intake * bread_kcal_per_g`），数值含义已变化。

**需要做的**：

1. 检查 `ad1666_uk_issac_newton.yaml` 中所有涉及 `bread_intake`、`pottage_intake`、`ale_intake`、`meat_intake`、`cheese_intake`、`apple_intake` 的公式。
2. 将公式从"速率 × 时间步长"改为"单次摄入量 ÷ 步长"或重新设计为事件脉冲（即：公式只在摄入量 > 0 的那一步生效，其余步归零）。
3. 重新验证仿真曲线，确认每日摄入量在合理范围内（例如 bread：约 120g/餐 × 2餐/日）。
4. 同步检查 `ad1910_po_marie_curie` 以及其他场景，若有类似速率单位问题，一并修正。

---

## 问题 3：系统卡牌 sys_routine / sys_amplify / sys_shield / sys_avoid 未实现

**背景**：这四类卡在 YAML 的 `player_deck` 中已被引用，卡定义文件包含 `system_effect` 字段，但游戏引擎（`game_engine` 或 `c_sim` 的卡处理逻辑）目前不解析 `system_effect`，因此这些卡被抽到后无任何效果。

**各卡语义**：

| 卡名 | 预期行为 |
|------|---------|
| `sys_routine` | 触发"例行程序"，按当前 Regimen 计划执行一次完整的日常 |
| `sys_amplify` | 放大下一张玩家卡的效果（乘以系数，如 1.5×） |
| `sys_shield` | 抵消下一张环境卡的负面效果 |
| `sys_avoid` | 跳过下一张环境卡 |

**需要做的**：

1. 在 `game_engine` 的卡牌处理流程中，识别 `system_effect` 字段。
2. 为每种 `system_effect` 类型实现对应的游戏状态修改逻辑。
3. 在 UI（CardGame）中为这些效果添加视觉反馈（如 shield 图标、amplify 高亮等）。
4. 补充单元测试验证每类系统卡的触发逻辑。

---

## 参考文件

- `sim_engine/src/simulator_engine.py` — Regimen 调度已在 `_apply_regimens` 方法
- `sim_engine/src/api_server.py` — `SimulationStartRequest` 已加 `regimens` 字段
- `mods/scenarios/social/ad1666_uk_issac_newton.yaml` — Newton 场景（需修公式）
- `mods/stories/to_game/ad1910_po_marie_curie/` — Curie 场景（需检查）
- `mods/stories/to_game/*/cards/sys_*.yaml` — 系统卡定义文件
