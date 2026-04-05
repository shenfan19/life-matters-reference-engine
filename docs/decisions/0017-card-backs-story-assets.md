# 0017 — 卡背图片 + Story 静态资产加载

**状态**：✅ 已实施  
**日期**：2026-04-05

## 背景

命运手牌（Row 2）和我方牌堆（右侧 DeckPile）均以面朝下方式展示，原始实现仅用 `?` 占位符，视觉辨识度低，无法体现故事叙事风格。需要支持每个 story 提供自定义卡背图片。

同时，Vite dev 中间件原本将 `/stories/*` 下所有文件统一以 `text/plain` 返回，导致图片、音频等二进制资产无法被浏览器正确解析。

## 决策

### 1. YAML 新增字段

在 `game_story.yaml` 顶层新增两个可选字段：

```yaml
card_back_fate:   card_backs/fate.png     # 命运牌（面朝下）的卡背
card_back_player: card_backs/player.png  # 我方牌堆的卡背
```

路径为相对于 story 文件夹的相对路径，支持子目录。

### 2. Loader 处理

`newFormatLoader.ts` 在组装 `GameStory` 时：

```typescript
const toAssetUrl = (rel: string | undefined) =>
  rel ? `/${storyDir}/${rel}` : undefined;
```

生成形如 `/stories/marie_curie/card_backs/fate.png` 的绝对 URL，直接可用于 `<img src>` 或 `<audio src>`。

### 3. 组件更新

- `FaceDownCard`：接受 `cardBack?: string`，有值时渲染 `<img>`，无值降级为 `?` 占位符
- `DeckPile`：接受 `cardBack?: string`，在面朝下堆叠的顶层卡片（`i === 0`）渲染卡背图片

### 4. Vite 中间件 MIME 修正

`vite.config.ts` 的 `modsPlugin` 增加扩展名 → MIME 映射表，涵盖：

| 扩展名 | MIME |
|--------|------|
| `.yaml` / `.yml` | `text/plain; charset=utf-8` |
| `.png` / `.jpg` / `.webp` / `.gif` | `image/*` |
| `.svg` | `image/svg+xml` |
| `.mp3` / `.ogg` / `.wav` | `audio/*` |
| 其他 | `application/octet-stream` |

生产构建中，`prepare-stories.mjs` 的递归复制已覆盖全部文件类型，无需额外修改。

## 后果

- ✅ 每个 story 可用自己的美术风格的卡背，增强代入感
- ✅ 不提供卡背时自动降级为原有占位符，向后兼容
- ✅ 修复了图片/音频资产在 dev 模式下因 MIME 错误导致无法加载的问题
- ⚠️ 卡背图片文件需 story 作者自行准备并放入 story 文件夹
