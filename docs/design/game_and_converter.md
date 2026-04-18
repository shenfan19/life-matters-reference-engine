## 一、整体架构概览

```
mods/scenarios/{category}/      ← 仿真模型 (源数据)
mods/stories/{category}/{id}/   ← 游戏故事包 (目标格式)
    game_story.yaml              ← 主配置文件
    cards/                       ← 卡牌 YAML 文件
        player_*.yaml
        env_*.yaml
    assets/                      ← 图片、音乐等资源
    _mapping.json                ← 转换溯源文档

game/                            ← 卡牌游戏前端 (port 5174)
    src/core/newFormatLoader.ts  ← YAML → GameStory 转换器
    src/components/CardGame.tsx  ← 游戏主组件

sim_gui/src/components/
    Converter.tsx                ← 转换器 UI (stub, 调用后端插件)
    StoryEditor.tsx              ← 故事编辑器 (集成了 Converter tab)
```

## 六、已知设计问题与待讨论点

### 6.1 Converter 前后端对接
- 当前 `Converter.tsx` 调用的 `/api/plugins/story_converter/run` 后端插件状态不明
- 需要确认：后端是否真正实现了自动转换，还是依然需要人工操作后上传

### 6.2 generic_cards 未实现
- `game_story.yaml` 中有 `generic_cards.inject: [rest, interrupt]` 字段
- `newFormatLoader.ts` 目前**不处理**这个字段
- "休息"和"中断"等通用牌需要从某个公共库注入，但机制未实现

### 6.3 card_back 资产路径容错
- 当 `card_back_fate/player` 为空字符串时，fallback 到 `/stories/assets_common/`
- 目前 `env_fitness_dynamics` 等 medical 故事没有设置资产，依赖公共资产

### 6.4 duration 牌的 Recall 机制
- `duration > 0` 的牌进入 `board`，但目前没有 "提前撤回" 机制（只有即时牌可以 recall）
- 永久牌（`duration: -1`）也在 board 中，但不消耗手牌位

### 6.5 env_deck weight 与 probability 的区别
- `weight`：影响抽牌频率（加权随机，尚未在 `newFormatLoader` 中实际使用加权抽取）
- `probability`：牌被抽到后的触发概率（在 `endTurn` 中执行 `Math.random() < probability`）
- **当前 bug**：`loadNewFormatStory` 加载 envCards 时**丢弃了** `weight` 信息，未做加权抽取

### 6.6 endings 条件中 `and`/`or` 大小写转换
- `buildConditions` 中有 `.replace(/\band\b/gi, '&&')` 逻辑
- 但 `evalCond` 函数也有同样转换，可能双重转换（`&&` → `&&` 无害，但值得注意）

---

## 七、文件路径快速参考

| 文件 | 用途 |
|------|------|
| `game/src/core/newFormatLoader.ts` | YAML → GameStory 转换器 |
| `game/src/core/types.ts` | 类型定义（Story, Card, DeckConfig 等旧格式）|
| `game/src/components/CardGame.tsx` | 游戏主引擎 (~1600行) |
| `game/src/components/CardGame.css` | 游戏样式 |
| `game/src/core/fetchYaml.ts` | YAML 加载工具（走 `/api/file/{path}`）|
| `game/src/core/storyI18n.ts` | i18n overlay 加载 |
| `sim_gui/src/components/Converter.tsx` | 转换器 UI (stub) |
| `sim_gui/src/components/StoryEditor.tsx` | 故事编辑器（含 Converter tab）|
| `mods/stories/social/ad1910_po_marie_curie/` | 典型完整故事包参考 |
| `mods/stories/medical/banister_fitness_fatigue/` | 典型医学建模故事参考 |
| `docs/decisions/0031-*.md` | 转换工作流 ADR |
