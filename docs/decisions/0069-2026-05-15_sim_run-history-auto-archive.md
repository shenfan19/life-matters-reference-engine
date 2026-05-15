# 0069 · 运行历史自动存档（Run History Auto-Archive）

**日期**：2026-05-15  
**状态**：✅ 已实施  
**类别**：GUI / 数据持久化

---

## 背景

用户每次完成仿真或优化后，结果只存在于浏览器内存（仅 localStorage 轻量缓存），关闭页面或刷新即丢失。  
Opt 结果更没有任何持久化，导致需要手动记录数据、在 sim 和 opt 之间手动传递参数。  
同时，长时间运行的 sim/opt 无法保存中间状态供后续分析或对比。

## 决策

采用**方案 A：自动存档 + 历史面板**：

- 每次 sim / opt **完成**时，前端自动调用 `POST /api/runs/save` 将完整结果存到服务器端 `runs/` 目录的 JSON 文件
- 用户无需手动操作，零摩擦
- 右上角增加"历史"按钮（HistoryOutlined），点开侧抽屉可浏览、加载、删除历史记录
- 加载历史的 sim 结果后，图表即时恢复；加载 opt 结果后，Pareto 前沿和"以此解运行仿真"按钮可直接使用

## 实现细节

### 后端

**`sim_engine/src/run_store.py`**（新增）

JSON 文件存储，每条运行一个文件：`runs/run_YYYYMMDD_HHMMSS_<6hex>.json`

```
save_run(data)   → run_id       写磁盘，自动生成 id 和 created_at
list_runs()      → [meta, ...]  读所有文件的元数据（去掉大数组），按 mtime 倒序
get_run(id)      → dict         读完整文件（含 sim_result / opt_result 大数组）
delete_run(id)   → bool         unlink 文件
patch_run(id, d) → bool         仅允许修改 label / status
```

`_SUMMARY_ONLY_FIELDS = {'sim_result', 'opt_result'}` —— list_runs 时跳过这两个字段，保持列表接口轻量。

**`sim_engine/src/api_server.py`**（新增端点）

```
GET    /api/runs              列出所有运行（元数据）
GET    /api/runs/{id}         获取完整运行数据
POST   /api/runs/save         保存运行（前端调用）
DELETE /api/runs/{id}         删除
PATCH  /api/runs/{id}         更新 label / status
```

### 前端

**`sim_gui/src/components/SimRunHistory.tsx`**（新增）

Antd `Drawer` 组件，右侧滑出，宽度 380px。  
每条记录展示：类型 Badge（SIM/OPT）、模型名、时间（"X 分钟前"）、状态、摘要信息、备注编辑、加载/删除按钮。

**`sim_gui/src/components/Simulator.tsx`**（修改）

| 新增 | 说明 |
|------|------|
| `historyOpen` state | 控制抽屉开关 |
| `lastOptimizerOverrideRef` | 保存最近一次 opt 配置，供 saveOptRun 使用 |
| `saveSimRun(data, perRun, vars)` | sim 完成时自动调用，POST 到 /api/runs/save |
| `saveOptRun(result, elapsed)` | opt 完成时自动调用 |
| `loadHistoryRun(run: RunRecord)` | 从历史加载：sim 恢复 simulationData 等状态；opt 恢复 optResult 等并同步 inputEvents |
| History 按钮 | 在 center tab bar 右端 |
| `<SimRunHistory>` | 渲染在根 div 末尾 |

**`sim_gui/src/types.ts`**（新增类型）

```typescript
RunMeta    // 轻量元数据（与 list_runs 返回对应）
RunRecord  // 完整记录（extends RunMeta，含 sim_result / opt_result）
```

## 运行记录 JSON 结构

```jsonc
{
  "id": "run_20260515_143200_abc123",
  "type": "sim",              // "sim" | "opt"
  "model_name": "glucose_bergman",
  "model_key": "models/published/.../glucose.yaml",
  "created_at": "2026-05-15T14:32:00.000Z",
  "status": "completed",
  "label": "",               // 用户可编辑备注

  // sim 专用
  "sim_config": {
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
    "step_value": 1,
    "step_unit": "hour",
    "sim_runs": 3,
    "session_seed": 12345,
    "input_events": [...]
  },
  "sim_result": {
    "data": [...],            // SimulationDataPoint[]（大数组）
    "data_per_run": [[...]],  // MC 各轨迹
    "output_vars": [...]
  },
  "sim_result_summary": {
    "n_points": 8760,
    "n_runs": 3,
    "output_vars": ["blood_glucose", "insulin"]
  },

  // opt 专用（同理，opt_config / opt_result / opt_result_summary）
}
```

## 暂停/恢复设计

- **Sim 暂停**：现有 in-memory pause 已可用（`isRunningRef.current = false`）
- **服务器重启后恢复**：当前 session 会消失；用户可"加载历史"恢复已保存的结果，但无法继续运行到中途步骤（重新 Run 即可，配置已保存在 sim_config 中）
- **Opt 暂停**：pymoo 内部状态无法序列化；取消后保存当前 Pareto 前沿；恢复=重新运行（可用历史中的 opt_config 复原参数）

## 局限性

- 每条运行存为独立 JSON 文件；大规模 MC（50 条 × 8760 步 × 10 变量 ≈ 35MB）可能较大，但不影响性能（文件读写各一次）
- 无自动清理策略（需用户手动删除旧记录）
- 没有跨设备同步（本地文件）
- 历史加载后是只读快照；修改 inputEvents 后如需重跑需手动点 Run

## 未来可扩展

- 历史对比（多条 sim 曲线叠加）
- 自动过期清理（保留最近 N 条）
- JSON 导出/导入（跨设备共享）
- 运行标签分类过滤
