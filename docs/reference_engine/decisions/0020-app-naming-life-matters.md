# 0020 — 应用命名：统一为 Life Matters，中文副名仅在 About 中显示

**状态**：✅ 已实施  
**日期**：2026-04-07

## 背景

应用曾同时使用「Life Matters」和「立民」两个名称，以「·」连接（`Life Matters·立民`）出现在标题栏、About 弹窗等位置。「立民」作为创作初期的中文意译，主观色彩较强，不如英文名通用；在正式界面中并列出现显得不稳定，且在小字号下辨识度差。

## 决策

### 1. 对外统一名称

所有界面位置（标题栏、浏览器标签、状态栏、免责声明）统一使用 **Life Matters**，中英文语言下均相同。

`app.title` locale 键各语言均为 `"Life Matters"`。

### 2. About 弹窗例外

About 弹窗作为项目信息的详细展示场所，中文语言下标题显示 **Life Matters (立民)**，以括号形式保留中文副名，供了解背景的用户参考。

实现方式：新增独立的 `about.name` locale 键，与 `app.title` 分开管理：

| 语言 | `app.title` | `about.name` |
|------|-------------|--------------|
| en | Life Matters | Life Matters |
| zh-CN | Life Matters | Life Matters (立民) |
| zh-TW | Life Matters | Life Matters (立民) |

About 弹窗标题使用 `t('about.name')`，其他所有位置使用 `t('app.title')`。

### 3. 免责声明标题

`disclaimer.title` 简化为：
- 中文：`免责声明` / `免責聲明`
- 英文：`Disclaimer`

不再带 Life Matters 或立民前缀，避免在已有品牌名上下文中重复。

## 后果

- ✅ 标题栏、状态栏等高频可见位置简洁统一
- ✅ 「立民」副名保留在 About 弹窗，不完全丢失创作意图
- ✅ `app.title` 与 `about.name` 分开，未来如需再调整互不影响
