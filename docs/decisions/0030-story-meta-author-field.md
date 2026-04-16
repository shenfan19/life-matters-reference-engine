# 0030 — Story Meta author 字段标准化

**状态**: ✅ 已实施  
**日期**: 2026-04-15  
**作者**: shenfan19

---

## 背景

`game_story.yaml` 的 `meta` 块中已有 `author` 字段（在 ADR 0006 的字段规范中列出），但：

- `StoryMeta` TypeScript 接口未声明 `author`，前端无法类型安全地读取
- `newFormatLoader.ts` 组装 meta 对象时未传递 `author`，即使 YAML 中写了也丢失
- 部分 medical story（`banister_fitness_fatigue`、`ckd_protein_muscle`、`hypertension_gout`、`test_daily_life`）YAML 中未包含该字段，格式不统一

## 决策

### 1. 补充 TypeScript 类型

```typescript
// game/src/core/types.ts
export interface StoryMeta {
  // ...既有字段...
  author?: string;   // 新增，可选
}
```

### 2. Loader 透传

```typescript
// game/src/core/newFormatLoader.ts — meta 组装块
meta: {
  // ...既有字段...
  author: rawStory.meta?.author ?? '',
}
```

### 3. 补全 medical story YAML

为 4 个 medical story 的 `meta` 块补充 `author: ""`，与 social story 格式统一。

## 用途说明

`author` 字段预留用于社区贡献者署名。当前所有官方 story 保持空字符串，待贡献者确认后按姓名填写。前端暂不展示该字段，但通过 `StoryMeta` 接口传递，未来可用于 StorySelect 卡片、About 页或导出报告中显示。
