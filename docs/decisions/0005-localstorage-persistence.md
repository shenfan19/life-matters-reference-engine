# 0005 — 客户端状态持久化：localStorage

**状态**：✅ 已实施  
**日期**：2026-04-02

## 背景

页面刷新（F5）或意外关闭浏览器后，所有仿真状态（选中场景、输入设置、运行结果）全部丢失。用户对 Web UI 的信任度低于桌面 exe，因为浏览器本身不够稳定，结果白跑的风险不可接受。

## 决策

使用 `localStorage` 在客户端持久化两类数据：

**配置类（随每次变更即时写入）：**
- `selectedKey` — 当前选中的场景路径
- `mode` — sim / opt
- `inputEntries` — 输入计划条目
- `isLocked` — 是否已验证锁定
- `openSections` / `sectionWeights` — 左侧 accordion 展开状态与高度比例
- `timeValue / timeUnit / stepValue / stepUnit` — 时长步长设置

**仿真结果（仅在 status 发生变化时写入，运行中跳过）：**
- `simulationData` — 完整数据点数组
- `status / currentStep / progress`

恢复策略：
- 刷新后优先从 localStorage 读取，跳过模型默认值覆盖
- 若 status 为 `paused`，恢复为 `completed`（后端 session 已消失，无法继续，但数据可查看）
- 场景选中后等待文件树加载完成再触发模型加载，保证恢复时序正确

存储 key：`sim_persist`，单 JSON 对象，无版本控制。

## 后果

- ✅ F5 刷新、意外关闭后状态完全恢复
- ✅ 运行结果（图表数据）持久保留至下次 Reset
- ✅ 实现纯前端，无需后端改动
- ⚠️ 单浏览器单设备，换设备/清缓存后数据丢失
- ⚠️ 数据量大时（长仿真 + 多变量）可能接近 5MB 上限
- ⚠️ 无版本兼容处理，模型结构升级后旧 localStorage 数据可能导致异常（需手动清理或加 schema 版本号）
- ⬜ 云部署/多用户场景需换成后端持久化（见 TODO）
