# 0003 — 工具栏操作流：验证 → 模式 → 运行

**状态**：✅ 已实施  
**日期**：2026-04-01

## 背景

早期工具栏有两行：第一行显示模型名称 + 模式切换（Segmented），第二行是运行控制。验证锁定按钮在左侧场景树区域，与运行按钮视觉分离，操作流不直观。

## 决策

合并为单行工具栏，从左到右是操作顺序：

```
[仿真|优化] | [▶ Run / ⏸ Pause / ▷ Continue] [Step] [Reset] | 时长 步长 | 进度
```

验证锁定按钮回到场景 panel 的 header extra 区域，显示两个状态：
- `待验证`（黄色虚线）→ 点击触发验证，通过后变为 `已锁定`
- `已锁定`（绿色实线）→ 点击解锁

模式切换（Segmented）：运行中/暂停中/完成后均禁用，必须 Reset 后才能切换（保证模式与数据一致）。

Run/Pause/Continue 是同一个切换按钮：
- idle → Run（从头开始，清空数据）
- running → Pause（暂停 batch loop，保留 session）
- paused → Continue（复用 sessionId 继续 runBatch）
- completed → 按钮禁用，只能 Reset

## 后果

- ✅ 工作流线性：选场景 → 验证 → 选模式 → 运行
- ✅ 按钮数量从 5 个减少到 3 个
- ✅ 验证状态直接在场景旁显示，语义清晰
- ⚠️ 工具栏内容较多，窗口较窄时需注意溢出（已通过 flexShrink: 0 + whiteSpace: nowrap 处理）
