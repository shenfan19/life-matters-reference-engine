# Converter 需求

## 核心定位

Converter 是 LM 系统的桥梁层：将 LM-Sim 的 YAML 仿真模型自动（或半自动）转换为 LM-Game 的游戏关卡格式。

**输入**: `mods/scenarios/{category}/model.yaml` — 仿真模型  
**输出**: `mods/stories/{category}/{id}/game_story.yaml` + `cards/*.yaml` + `_mapping.json`

## 依赖关系

- 依赖 **sim 模块**：需理解 model.yaml 格式（见 `c_sim_model.md`）
- 依赖 **game 模块**：需知道 game_story.yaml 格式（见 `c_game_实现.md`）
- Converter 在 game 模块格式稳定后才能确定（逻辑顺序不变）

## 功能需求

### 核心转换需求

1. **变量映射**：sim state/input/parameter → game 状态条/玩家牌/环境牌权重
2. **公式识别**：dynamics 公式 → 卡牌效果（P1-P6 模式）
3. **时间归一化**：连续 dt → 离散回合（1 turn = N days）
4. **健康变量指定**：用户必须选择哪个 sim 变量映射为 HP
5. **溯源记录**：生成 `_mapping.json` 记录每个字段的推导来源

### 准确性需求

- 卡牌数值与 sim 输出一致（误差 ≤ 5%）
- 历史参数覆写（patches）必须反映在卡牌效果上
- 科学数据（RR值、概率）不得失真

### 可行性评估

约 80% 可全自动，20% 需半自动辅助（标准化 tags + 公式规范）。

| 转换步骤 | 自动化难度 | 结论 |
|---------|----------|------|
| 资源识别 | ⭐ | ✅ 全自动 |
| Input 分类 | ⭐⭐ | ⚠️ 半自动（下拉菜单辅助）|
| 效果提取 | ⭐ | ✅ 全自动 |
| 公式识别 | ⭐⭐⭐ | ⚠️ 半自动（可选手动标注）|
| 权重计算 | ⭐⭐ | ✅ 全自动 |

## 约束

### 来自 game 模块的约束

- 游戏数值必须为整数（降维规则）
- 环境牌 weight（抽取频率）与 probability（触发概率）必须分开
- 时间步长 = 1 回合（不支持子回合精度）

### 来自 sim 模块的约束

- 输入变量（input）= 可干预量 → 玩家牌
- 状态变量（state）= Euler 更新量 → 状态条
- 参数（parameter）= 固有系数 → 权重/概率
