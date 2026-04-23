# 0009 — 旧格式 Story 迁移至文件夹格式，删除旧解析逻辑

**状态**：✅ 已实施  
**日期**：2026-04-04

## 背景

ADR-0006 确立了新文件夹格式为 story 标准，但当时为兼容旧格式，CardGame.tsx 保留了双路加载逻辑（`isNewFormat()` 判断）。`models/stories/` 下仍有 6 个旧格式 story：

- `ad1346_europe_black_death`
- `ad1916_somme_britain`
- `banister_fitness_fatigue`
- `ckd_protein_muscle`
- `daily_life`
- `hypertension_gout`

同时 game 源码中存在多个已与 App.tsx 完全脱节的旧组件和工具类。

## 决策

### 1. 迁移全部旧格式 story

编写一次性 Python 迁移脚本，将 6 个旧 story 原地转换为新格式：

- `variables` → `initial_state`（取 value 字段）
- `variables`（label/color/max 显示信息）→ 新增 `variable_display` 字段（见下）
- `game` → `turns`
- `lose_conditions` / `win_conditions` 列表 → `lose_condition` + `win_condition`（取第一条）+ `endings`（全部条目，grade A/D）
- `player_cards` inline → `cards/player_<id>.yaml` 独立文件
- `environment_cards` inline → `cards/env_<id>.yaml` 独立文件
- `game_story.yaml` 更新为引用 `env_deck` / `player_deck` 路径

### 2. 新增 `variable_display` 字段

旧 story 的 `variables` 包含自定义 label 和 color（如 somme 的 "士气"、"口粮储备"），而新格式 `initial_state` 只存原始值。为不丢失这些显示信息，在 `game_story.yaml` 中新增 `variable_display` 字段：

```yaml
variable_display:
  morale:
    label: 士气
    color: "#1677ff"
    max: 100
```

`newFormatLoader.ts` 优先读取 `variable_display`，其次回落到内置 `VAR_LABELS/VAR_COLORS` 映射表，最后回落到变量 key 名。手工编写的 story（Marie Curie / Newton）不需要此字段，依赖内置映射即可。

### 3. 删除 CardGame.tsx 旧格式分支

移除 `isNewFormat()` 判断，所有 story 统一走 `loadNewFormatStory()`。

### 4. 删除死代码

以下文件已与 App.tsx 完全脱节，一并删除：

| 文件 | 说明 |
|------|------|
| `src/components/Game.tsx` | 旧游戏组件，使用旧 Engine 类 |
| `src/components/StoryLoader.tsx` | 旧加载组件，使用 AdaptiveConverter |
| `src/components/LevelSelect.tsx` | 旧关卡选择组件 |
| `src/core/StoryLoader.ts` | 旧 YAML 加载类 |
| `src/core/Engine.ts` | 旧游戏引擎类 |
| `src/core/AdaptiveConverter.ts` | 旧 Universal Dynamics → Story 转换器（前端版） |
| `game/stories/` | 旧开发用 story 文件夹（已被 `models/stories/` 取代） |

`isNewFormat` 函数从 `newFormatLoader.ts` 中移除。

## 后果

- ✅ `models/stories/` 下所有 story 格式统一，无遗留旧格式
- ✅ CardGame.tsx 加载路径单一，无条件分支
- ✅ 删除约 400 行死代码，减少维护负担
- ✅ `variable_display` 字段保留了旧手工 story 的自定义显示信息
- ⚠️ converter 输出的 story（`to_game/`）没有 `variable_display`，变量显示依赖内置映射表，复杂变量名（如 `fitness_component`）会回落到英文 key 名
- ⬜ 未来可扩展 converter 的 `_save_new_format()` 输出 `variable_display`，保留模型原始 label
