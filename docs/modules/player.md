# Player 模块说明 (Simulator Engine & UI/UX)

## 功能说明
Player 模块（也称 StoryEngine 或 SimulatorEngine）包含两个主要职责：
1. **仿真引擎**：按 `dt` × `steps` 驱动动力学模型逐步迭代，输出状态曲线。
2. **剧情交互运行时**：以回合制卡牌形式，让用户实时参与人生决策，影响仿真走向。

---

## 两种运行模式

### 1. 科研仿真模式（Simulator Mode）
- 自动批量迭代，输出 CSV / JSON 状态文件用于研究分析。
- CLI：`python sim_engine/src/simulator_cli.py`
- API：`POST /api/story/{story_id}/step`

### 2. 游戏剧情模式（Story / Card Mode）
- 载入 `cards/` 子目录的卡牌 YAML，每回合玩家出牌，系统执行 `applyEffects` 后推进一个仿真步骤。
- 前端：`StoryEngine.tsx`（`sim_gui`）

---

## UI/UX 设计原则

- **操作直观性**：用户能轻松理解并操作卡牌与状态栏。
- **反馈及时性**：出牌后即时更新所有状态变量，并显示数值变化（+/- 动画）。
- **数据可视化**：核心状态量以进度条或折线图实时展示趋势。

---

## 线程模型——避免 UI 阻塞

长时间仿真（如 10,000 步）需在后台线程运行，通过消息机制推送进度：

```python
# 核心思路（Python 后端）
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=4)

def run_simulation(params, progress_cb):
    for step in range(params.steps):
        state = simulator.step(state)
        if step % 100 == 0:
            progress_cb(step, state)  # 推送进度

# WebSocket 或 pubsub 推送到前端
```

| 需求 | 做法 |
|---|---|
| **暂停 / 取消** | 传 `threading.Event` 给积分循环，按钮 `set()` 即可中止 |
| **多任务并行** | `max_workers` 调大，每任务带唯一 `task_id` |
| **实时曲线** | 每 N 步广播状态，前端追加图表数据点并刷新 |
| **实时调参** | 参数使用 `multiprocessing.Value`，计算线程随时读取 |

---

## 模型校验功能（结合 Generator）

在进入游戏或科研仿真前，系统应先校验模型合法性：

- 一段时间统计发病率（前向仿真验证）
- 分组对比统计发病率增加情况（与 paper 对比）
- 对照原始论文的 KM 曲线或 RCT 结果

```bash
# 前端触发校验
GET /api/validate?model=stories/marie_curie
```

校验未通过时，显示报告并阻止进入仿真，避免产生误导性结果。

---

## 计算公式执行顺序

多个公式更新同一变量时，通过 `priority` 字段控制执行顺序：
- 优先级数字越小，越先执行（如 `-100` 先于 `0`）
- 并行冲突变量用 `asteval` 顺序求值，避免隐式 race condition。
