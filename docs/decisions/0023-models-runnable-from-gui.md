# 0023 — Models 可在 GUI 文件树中直接运行

**状态**: ✅ 已实施  
**日期**: 2026-04-12  
**作者**: shenfan19

---

## 背景

过去，仿真器 GUI 的文件树（左侧 Scenarios 面板）只展示 `mods/scenarios/` 下的场景文件。如果想测试一个独立的 model 文件（如 `running.yaml`），必须为它单独建一个空壳 scenario。

这导致两个问题：
1. 测试新模型时需要写冗余的 scenario wrapper，阻碍快速迭代；
2. 每个 model 有自己的 `simulator` 配置（`total_time`、`step_size`、`output_variables`），脱离 scenario 无法被触发。

## 决策

在 GUI 文件树中同时暴露 `SCENARIOS` 和 `MODELS` 两个顶级分组，让带有完整 `simulator` 配置的 model 文件可以直接被选中、验证并运行，无需 scenario 包装。

具体实现：
- `loadFileTree` 同时扫描 `scenarios/` 和 `models/` 目录；
- SCENARIOS 组和 MODELS 组作为不可选的分组节点，下挂各自的文件树；
- Models 文件节点使用紫色 tag 区分视觉风格；
- `handleValidateAndLock` 在 validate 时读取返回的 `standalone` 字段，若为 `false` 则展示警告提示（不阻止运行）。

## standalone 约定

每个 model 文件在 `metadata` 中用 `standalone` 字段声明是否可独立运行：

```yaml
metadata:
  standalone: true   # 有完整 simulator 配置，可直接运行（默认）
  standalone: false  # 库组件，依赖其他模型 import，单独运行结果不完整
```

`standalone: false` 的模型在 GUI 验证时会显示：
> "此文件为库组件——不依赖关联模型时仿真结果可能不完整"

## 被否定的方案

- **只在 scenarios/ 下建 test 场景**：样板代码多，维护负担重，每次改 model 参数都要同步 scenario。  
- **新增专门的 test/ 工具页面**：开发成本高，且与现有仿真器功能重复。  
- **不做区分，所有 model 都可运行**：`standalone: false` 的库组件（如 `diabetes_core`）在没有依赖时仿真结果无意义，容易误导用户。
