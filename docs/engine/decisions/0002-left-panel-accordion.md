# 0002 — 左侧面板 Accordion（VSCode 风格）

**状态**：✅ 已实施  
**日期**：2026-04-01  
**取代**：无（新增）

## 背景

左侧控制区最初用 Ant Design Tab（一次只能看一个区），后改为 Ant Design Collapse（可同时展开多个，但全局滚动，高度固定）。两种方案都存在"同时查看输入参数和变量状态"的困难。

## 决策

用自定义 flex accordion 替代 Ant Design Collapse：
- 每个 section 有 header（固定高度 26px）+ content（内部独立滚动）
- 多个 section 同时展开时按 flex 权重分配剩余高度
- 相邻展开 section 之间有可拖拽分隔线（类 VSCode Explorer）
- 折叠的 section 沉至底部，展开的 section 自动填充空间

涵盖的 sections：场景、输入、变量、公式、计划表、优化器（仅 opt 模式）。

## 后果

- ✅ 无全局滚动条，每个模块独立滚动
- ✅ 可同时查看任意两个模块
- ✅ 拖拽调整各模块高度比例，舒适度接近 VSCode
- ⚠️ 实现较复杂，约 80 行自定义 flex 逻辑
- ⚠️ flex 权重在容器高度变化时保持比例，但像素高度会随窗口变化
