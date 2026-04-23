# Converter 实现

## 当前状态

Converter 功能分两个部分：前端 UI（`Converter.tsx`，stub）和游戏侧加载器（`newFormatLoader.ts`，已实现）。

## newFormatLoader.ts — YAML 到 GameStory 的转换

文件：`game/src/core/newFormatLoader.ts`

### 主函数签名

```typescript
async function loadNewFormatStory(cleanPath: string, rawStory: any): Promise<GameStory>
```

- `cleanPath`: 相对于 `models/` 的路径，例如 `stories/social/ad1910_po_marie_curie/game_story.yaml`
- `rawStory`: 已解析的 `game_story.yaml` 内容

### 转换步骤

1. **加载玩家牌** — 遍历 `player_deck[]`，`copies: N` 复制为多个独立实例（id 加 `_1/_2...` 后缀）
2. **加载环境牌** — 遍历 `env_deck[]`，保留 `weight` 字段
3. **构建变量表** — 从 `initial_state` 生成变量，合并 `variable_display` 覆盖
4. **构建胜负条件** — 优先解析 `endings[]`（grade D/F = 失败），次选 `win_condition/lose_condition`
5. **资产路径解析** — `card_back_fate/player` 空值 fallback 到 `/stories/assets_common/`
6. **音乐路径解析** — `music` 支持字符串或数组，空值 fallback 到公共 `music.mid`

### 输出的 GameStory 类型

```typescript
interface GameStory {
  meta: { id, name, period, location, description, science_note, tags, author }
  variables: Record<string, VarDef>   // { label, value, max, color, higherIsBetter }
  goalVariables: string[]
  game: { plays_per_turn, max_turns, hand_size, env_per_turn, draw_per_turn? }
  lose_conditions: Array<{ condition, message }>
  win_conditions?: Array<{ condition, message }>
  player_cards: PlayerCard[]
  environment_cards: EnvCard[]
  cardBackFate: string
  cardBackPlayer: string
  music: string[]
}
```

## Converter.tsx — 当前状态（Stub）

文件：`sim_gui/src/components/Converter.tsx`

**当前状态**：占位 UI，功能尚不完整：
- 从 `/api/files` 加载故事文件列表
- 点击"开始转换"调用 `/api/plugins/story_converter/run`（后端插件，目前可能未实现）
- 没有转换内容预览，没有编辑能力

**实际采用的半手动工作流**（ADR 0031）：

```
1. 编写 scenario YAML（models/scenarios/）
2. 计算 days_per_turn = 总时长 / 游戏回合数
3. 将 scenario variables(io_role=output) → game_story initial_state
4. 推导卡牌效果：card_delta = input_rate × days_per_turn × efficiency_factor
5. 编写 _mapping.json 记录推导过程
6. 编写各 card YAML，在 source.formula 字段记录溯源
```

## 自动转换逻辑（8步）

```
输入: scenario.yaml + health_mapping（用户选定）

步骤1  解析 metadata → meta.*（直接映射）
步骤2  解析 simulator.total_time → turns.total（换算回合数）
步骤3  识别 health 变量 → 写入 health_mapping + initial_state.health
步骤4  遍历 variables:
         type=input  → 生成玩家牌骨架（cost 由公式 P 值决定）
         type=state  → 检查是否为 health，否则作为第三资源或内部变量
         type=parameter → 写入卡牌权重系数
步骤5  遍历 formulas → 公式模式识别（P1-P6）→ 生成环境牌骨架
步骤6  补全通用牌引用（inject 默认全部）
步骤7  写入文件夹：game_story.yaml + cards/*.yaml + _mapping.json
步骤8  返回生成摘要（x张环境牌，y张玩家牌，z个字段自动映射）
```

## 已知问题

### 7.1 Converter 前后端对接
- 当前 `Converter.tsx` 调用的 `/api/plugins/story_converter/run` 后端插件状态不明
- 需确认：后端是否真正实现了自动转换

### 7.2 generic_cards 未实现
- `game_story.yaml` 中有 `generic_cards.inject: [rest, interrupt]` 字段
- `newFormatLoader.ts` 目前**不处理**这个字段

### 7.3 card_back 资产路径容错
- `card_back_fate/player` 为空字符串时，fallback 到 `/stories/assets_common/`
- medical 故事目前依赖公共资产

### 7.4 duration 牌的 Recall 机制
- `duration > 0` 的牌进入 `board`，但目前没有"提前撤回"机制

### 7.5 env_deck weight Bug
- `weight`：影响抽牌频率；`probability`：牌被抽到后的触发概率
- **Bug**：`loadNewFormatStory` 加载 envCards 时**丢弃了** `weight` 信息，未做加权抽取

### 7.6 endings 条件大小写转换
- `buildConditions` 和 `evalCond` 都有 `and/or → &&/||` 转换，可能双重转换（无害但值得注意）

## 文件路径快速参考

| 文件 | 用途 |
|------|------|
| `game/src/core/newFormatLoader.ts` | YAML → GameStory 转换器 |
| `game/src/core/types.ts` | 类型定义（Story, Card, DeckConfig 等）|
| `game/src/components/CardGame.tsx` | 游戏主引擎 (~1600行) |
| `game/src/core/fetchYaml.ts` | YAML 加载工具（走 `/api/file/{path}`）|
| `game/src/core/storyI18n.ts` | i18n overlay 加载 |
| `sim_gui/src/components/Converter.tsx` | 转换器 UI (stub) |
| `sim_gui/src/components/StoryEditor.tsx` | 故事编辑器（含 Converter tab）|
| `models/stories/social/ad1910_po_marie_curie/` | 典型完整故事包参考 |
| `models/stories/medical/banister_fitness_fatigue/` | 典型医学建模故事参考 |
| `docs/decisions/0031-*.md` | 转换工作流 ADR |
