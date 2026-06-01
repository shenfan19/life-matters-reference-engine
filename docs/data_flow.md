# 数据流

Life Matters 的数据流围绕一条原则组织：**模型文件是唯一的真相来源，计算结果是局部临时产物，发布是显式的主动操作。**

---

## 两层存储

| 层 | 位置 | 性质 | 是否入 git |
|----|------|------|-----------|
| **模型层** | `models/**/*.yaml` | 结构定义 + 已发布结果 | ✅ |
| **输出层** | `output/` | 本地运行产物（CLI） | ❌（gitignore） |

GUI 的运行状态存在浏览器 localStorage（session），不写磁盘，不入 git。

---

## 数据流全景

```
models/**/*.yaml
    │
    ├─ CLI --sim ──────────────────────► output/*_sim_YYYYMMDD_HHMM.csv
    │                                        （时间序列，每列一个输出变量）
    │
    ├─ CLI --opt ──────────────────────► output/*_opt_YYYYMMDD_HHMM.csv
    │   （每代覆盖写入，中断不丢）               （Pareto 前沿，x 列 + f 列）
    │
    ├─ GUI sim tab ────────────────────► 内存 session（图表）
    │
    └─ GUI opt tab ────────────────────► 内存 session（Pareto 前沿）
                                              │
                        output/*_opt.csv ─────┤ 导入 CSV → 合并 Pareto，
                        （GUI 导入按钮）        │ 开启热启动
                                              │
                                      "保存结果到模型"
                                              │
                                              ▼
                                   models/**/*.yaml
                                   （写入 optimizer.results 块）
                                              │
                                              ▼
                                            git
```

---

## 三条典型路径

### 路径 A：本地批量优化（CLI 主导）

```
1. 编写 / 调整 models/xxx.yaml
2. python sim_cli/main.py models/xxx.yaml --opt
   → output/xxx_opt_20260606_1130.csv（每代实时更新）
3. 需要继续搜索：
   --continue              从 YAML 内嵌结果热启动
   --continue 20260606_1130  从指定 CSV 热启动
4. 对结果满意 → 在 GUI opt tab 导入 CSV → "保存结果到模型"
5. git commit → 发布
```

### 路径 B：交互式探索（GUI 主导）

```
1. 在 GUI 加载模型，调整 inputEvents
2. Sim tab 运行 → 实时图表
3. Opt tab 设置目标 → 运行优化 → 查看 Pareto 前沿
4. 选中 Pareto 行 → "发送到 Sim" → 验证最优方案
5. "保存结果到模型" → git commit
```

### 路径 C：CLI 产出 → GUI 分析

```
1. CLI 在无 GUI 环境批量跑出 output/*_opt.csv
2. 打开 GUI → opt tab → "导入 CSV"
3. Pareto 解合并到当前 session，热启动 checkbox 自动开启
4. 继续在 GUI 中搜索或导出到 Sim
```

---

## CSV 格式（统一交换格式）

### `*_sim.csv`（仿真时序）

```
time,var1,var2,...
0,初始值,...
1,...
```

第一列为时间步（按 step_size.unit 计），其余列为 `output_variables` 中指定的变量。

### `*_opt.csv`（Pareto 前沿）

```
x0,x1,...,xN,obj_var1,obj_var2,...
0.30,0.29,...,65.8,47.1
...
```

`x*` 列为决策变量原始值（与 `optimizer.schedules` 中决策条目顺序对应），其余列为目标变量名。可直接导入 GUI opt tab 进行热启动或 Pareto 分析。

---

## 结果发布机制

CLI 和 GUI 都不自动修改原始 YAML。发布是用户的显式操作：

| 触发方式 | 操作 |
|---------|------|
| GUI "保存结果到模型" | 将 session 中的 Pareto 前沿写入 `optimizer.results` 块并保存到服务器 |
| GUI 下载 YAML | 下载含 `optimizer.results` 的完整 YAML（本地存档，不自动上传） |

写回后的 YAML 是完整可复现的：包含模型定义、优化配置和已验证结果，可直接共享或上 git。

---

## SCS 模式差异

SCS（云端部署）下 CLI 不可用，输出层不存在。GUI 的行为差异仅在写保护：

- 运行仿真 / 优化：✅ 相同
- 导入 CSV：✅ 相同（内存合并）
- 保存结果到服务器：❌ 禁止（只能下载 YAML）

详见 [ADR 0078](decisions/0078-2026-05-18_project_scs-mode-design.md)。
