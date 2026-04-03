# 0004 — 多语言方案：JSON locale 文件

**状态**：✅ 已实施  
**日期**：2026-04-01

## 背景

仿真器 UI 需要支持简体中文、繁体中文、英文三种语言。最初所有文字硬编码在组件中，切换语言时只有部分区域生效，繁体中文 locale 文件缺少 `sim.*` 命名空间，导致显示键名而非译文。

## 决策

采用 JSON locale 文件方案（已有 `useI18n()` hook）：

- locale 文件路径：`sim_gui/public/locales/sim/{zh-CN,zh-TW,en}.json`
- 命名空间前缀统一为 `sim.*`，按功能分组：
  - `sim.mode.*` — 模式切换标签
  - `sim.control.*` — 运行控制按钮（run / pause / continue / step / reset / pending）
  - `sim.scene.*` — 场景区域（locked, select_hint 等）
  - `sim.section.*` — 左侧 accordion 各区名称
  - `sim.chart.*` — 图表区域（no_data, export_csv 等）
  - `sim.msg.*` — 消息/通知文字
- 所有 UI 文字通过 `t('sim.xxx')` 调用，禁止在组件中硬编码中文或英文

## 后果

- ✅ 三种语言完整覆盖，切换即时生效
- ✅ 键名分组清晰，新增文字只需同步三个文件
- ⚠️ 新增 UI 文字时需手动同步三份 locale，漏加会显示键名（已有先例：zh-TW 曾缺失全部 sim.* 键）
