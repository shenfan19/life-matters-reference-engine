# ADR 0094 — Result Exchange: CSV as Universal Format, YAML as Unified Model Download

**Date:** 2026-06-05  
**Status:** Accepted  
**Context:** sim_gui — Sim tab, Opt tab, CLI

---

## Context

Users need to compare simulation results across different configurations (step sizes, parameter sets) and reuse optimizer results across sessions. Two related features were being explained as separate concepts: "multi-curve overlay" in Sim and "warm-start" in Opt. This caused unnecessary cognitive load.

The underlying mechanism is the same in both cases: importing a CSV file brings external results into the current session, and each tab responds naturally to that data.

---

## Decision

### 1. CSV is the universal result exchange format

Importing CSV has tab-specific consequences that follow naturally from what each tab does.

| Tab | Export CSV content | Import CSV → automatic consequence |
|-----|-------------------|-------------------------------------|
| Sim | 仿真时序（时间序列） | 新增一条带标签的对比曲线 |
| Opt | 优化结果（Pareto 前沿） | 合并入 Pareto 前沿，自动开启热启动 |
| CLI --sim | Auto `_sim.csv` | — |
| CLI --opt | Auto `_opt.csv` | `--continue [TIMESTAMP]` |

"多曲线对比"和"热启动"不是独立功能——它们是导入 CSV 在各自上下文的直接结果，无需单独学习。

### 2. Sim 仿真历史曲线（auto-snapshot）

每次点击 Run 时，若当前已有完成的仿真结果，GUI 自动将其快照为一条历史对比曲线，标签为 `Sim {起始日} · {步长}`。CSV 导入的曲线与自动快照进同一列表。

每条曲线在切换栏显示 × 按钮，可单独移除。切换模型或点击重载时列表清空。

这使"多步长对比"的操作变为：Run → 改步长 → Run → 图中自动出现两条曲线。

### 3. YAML download is unified across Sim and Opt tabs

Both tabs share the same session (`ModelSession`). The model download button behaves identically regardless of which tab the user is on:

- **有 opt 结果** → 自动将 `optimizer.results` 块写入副本并下载
- **无 opt 结果** → 下载原始模型 YAML

用户通过 `message.success` 得知下载内容（含解数量或"无优化结果"）。无需用户主动选择含/不含——会话状态即真相。

**"保存结果到原文件" is permanently removed.** The source YAML is never overwritten from the GUI. Results travel via CSV (exchange) or YAML Save As (archive/publish).

### 3. All file operations notify the user after completion

Every download/upload shows a `message.success` stating what was transferred and how much data:

| Operation | Notification example |
|-----------|----------------------|
| 模型下载（含结果） | "已下载模型（含 12 个 Pareto 解）" |
| 模型下载（无结果） | "已下载模型（无优化结果）" |
| 仿真结果导出 | "已下载仿真时序（1440 个数据点，CSV）" |
| 优化结果导出 | "已下载优化结果（20 个 Pareto 解，CSV）" |
| 仿真结果导入 | "已上传仿真时序 "…"（1440 个数据点，已叠加为对比曲线）" |
| 优化结果导入 | "导入 N 个解，共 M 个（已开启热启动）" |

### 4. Toolbar button order (both tabs, end section)

```
Sim:  | 模型↓ | ↓仿真 | ↑仿真 | 重载 |
Opt:  | 模型↓ | ↓优化 | ↑优化 | 重载 |
```

- **模型↓** — YAML 另存为（统一行为，两个 tab 相同）
- **↓仿真 / ↓优化** — CSV 导出，标签明确区分内容类型（仿真时序 vs Pareto 前沿）
- **↑仿真 / ↑优化** — CSV 导入，标签同上
- **重载** — 清除 session，同时重置仿真和优化，重新加载 YAML 默认值

Tooltip 进一步说明格式（CSV/YAML）和操作后果。

### 5. Reload mutual lock

重载会同时清除仿真和优化的 session 状态，因此：

- **仿真运行中（running / paused）** → Opt 工具栏的"重载"按钮禁用，tooltip 显示"仿真运行中，无法重载"
- **优化运行中** → Sim 工具栏的"重载"按钮禁用，tooltip 显示"优化运行中，无法重载"

两个 tab 共享同一个 `ModelSession`，任意一侧运行时都不允许重载，防止状态撕裂。

---

## Consequences

### Removed
- `saveResultsToFile()` — 直接覆盖源文件。
- "保存结果" (SaveOutlined) button。
- Opt YAML 下载的含/不含结果 Dropdown（合并为统一自动行为）。

### Added
- Sim CSV import → labeled overlay curve (auto-snapshot on Run + CSV import share same list).
- Sim auto-snapshot: each new Run snapshots the previous completed result into the comparison list.
- × close button on each comparison curve; list clears on model switch or reload.
- Opt CSV export → Pareto front as CSV (symmetric with Sim).
- Sim Reload button (symmetric with Opt Reload).
- `message.success` notifications on all file operations.

### Unchanged
- Opt warm-start checkbox (low-level control; auto-enabled after CSV import).
- CLI behavior.
