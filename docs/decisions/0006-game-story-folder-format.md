# 0006 — Game Story 文件夹格式与前端 Loader

**状态**：✅ 已实施  
**日期**：2026-04-04

## 背景

`mods/stories/` 下存在两种不兼容的 story 格式：

- **旧单文件格式**（`black_death`、`somme` 等）：所有卡牌内联在一个 `game_story.yaml` 中，字段为 `player_cards` / `environment_cards`，effect 字段名为 `variable + delta`。
- **新文件夹格式**（`marie_curie`、`issac_newton`、`dracula`）：`game_story.yaml` 仅保存 meta 和牌组引用（`env_deck` / `player_deck` 内含 `path:` 指向 `cards/` 子目录中的独立 YAML），effect 字段名为 `target + delta`，卡牌展示信息嵌套在 `display` 下。

CardGame.tsx 只能加载旧格式，新 story 无法运行。

## 决策

**以新文件夹格式为标准**，在前端新增 `src/core/newFormatLoader.ts` 适配层，旧格式不迁移但继续兼容运行。

判断逻辑（`isNewFormat`）：YAML 根节点同时含有 `initial_state` 和 `env_deck` 字段即为新格式。

新格式 loader（`loadNewFormatStory`）在浏览器端执行：
1. 解析 `game_story.yaml`，遍历 `env_deck` / `player_deck` 中的 `path` 列表，逐个 `fetch /api/file/{path}` 加载卡牌文件
2. 字段映射：`target → variable`、`display.name/icon/flavor → 平铺`、`delta` 直接复用
3. `weight` 按 `env_cards_per_turn / totalWeight` 换算为 `probability`
4. `endings` 数组转为 `win_conditions` / `lose_conditions`（grade D/F 为输，其余为赢）
5. `initial_state` 转为 `variables`（补充 label、color、max，使用内置映射表）
6. `turns.*` 映射到 `game.*`（`total → max_turns`，`action_points`，`player_hand_size`）

CardGame.tsx 加载时先 fetch `game_story.yaml`，再根据 `isNewFormat` 决定走哪条路径，两种格式输出的 `GameStory` 接口完全相同，后续游戏逻辑无需修改。

StorySelect.tsx 同步修复：回合数读取兼容新格式的 `turns.total`（原仅读 `game.max_turns`）。

## 后果

- ✅ 新格式三个 story（居里夫人、牛顿、Dracula）可正常加载和游玩
- ✅ 旧格式 story 不受影响，两种格式并存
- ✅ 新格式的文件夹结构便于独立维护每张卡牌，适合卡牌数量多的 story
- ⚠️ 新格式每次加载需多次 HTTP 请求（每张卡一次），卡牌多时略有延迟
- ⚠️ `probability` 由 weight 换算，是近似值，并非精确抽卡概率
- ⬜ 未来可在 api_server.py 增加"批量加载 story 文件夹"接口，减少请求次数
