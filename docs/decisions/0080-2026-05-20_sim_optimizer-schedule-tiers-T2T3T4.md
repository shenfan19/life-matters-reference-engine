# ADR 0080 — 优化器调度粒度分层设计（T2/T3/T4）

**Date**: 2026-05-20
**Status**: Design（文档完成，待实现）

---

## Requirements

### 背景与动机

现有优化器（T1）仅支持对事件**值**（剂量/强度）的连续优化，时间、星期、起止日期均作为固定参数写死在 YAML 中。

真实干预场景中，时机本身往往是关键决策变量：

| 领域 | 场景示例 | 时机变量 |
|------|---------|---------|
| 时间营养学 | 进食窗口对代谢的影响（16:8 vs 14:10） | 进食开始时刻 |
| 时间药理学 | 同一药物早晚服效果差异（昼夜节律） | 给药时刻 |
| 运动训练 | 游泳池只开周末，骑车只能工作日 | 星期模式 |
| 临床治疗 | 手术后第几天开始化疗影响副作用与疗效 | 干预起始日 |
| 社会场景 | 间歇性断食（5:2）、饥荒救援物资投放 | 断食日、资源到达日 |

### 功能需求

**R1（T2 时间窗）**：优化器应支持在建模者指定的时间窗（如 `07:00~09:00`）内搜索最优给药/进食时刻，粒度可选 `1h`（默认）或 `15min`。

**R2（T3 星期模式）**：优化器应支持从建模者预定义的候选星期模式列表中选择一个（如"周一三五"、"周末"），而非在全 2⁷ 组合空间中搜索。

**R3（T4 起始日）**：优化器应支持在建模者指定的日期窗口内搜索最优干预起始日（如 5 月 1 日–30 日中哪一天开始最好）。

**R4（可组合）**：T2/T3/T4 可对同一 `inputs` 条目任意组合启用；x 向量自动拼接所有已启用维度。

**R5（向后兼容）**：现有 T1-only 模型不受影响；新字段均为可选。

### 约束需求（搜索可行性）

以下约束是需求的一部分，直接影响设计选择——**搜索可行性本身是一个系统指标**：

**C1（搜索空间有界）**：T2 时间槽数 = `(window_end - window_start) / opt_step + 1`，通常 2–9 个；T3 候选模式数 ≤ 6（建模者保证）；T4 日期偏移数 ≤ 365 天。单个模型的整数决策变量维度预期 ≤ 10。

**C2（碰撞防止）**：同一 `inputs` 列表中，各条目的时间窗设计上不重叠，防止同一仿真步内多个事件同时命中导致脉冲意外累加。引擎不自动检测碰撞，建模者负责设计。

**C3（算法兼容）**：T2/T3/T4 产生整数决策变量，NSGA-II（pymoo `MixedVariableProblem`）支持混合整数；L-BFGS-B / Nelder-Mead 不支持，启用时自动切换并警告。

**C4（收敛预期）**：标准档（pop=50, gen=80）下，典型 T1+T2+T3 组合（约 5 个决策变量）4,000 次评估应足以收敛；若搜索空间过大由建模者通过减少候选模式数控制。

### 非功能需求

**NF1（YAML 可读性）**：新字段采用 `time_window`、`opt_step`、`days_options`、`date_start_window` 命名，与仿真积分步长 `metadata.step_size` 无歧义。

**NF2（GUI 明确性）**：每个 Tier 对应独立可识别的控件，不使用自由文本输入。

**NF3（结果可读性）**：`reference.regimen` 存储解码后的人类可读值（`time: "08:00"`、`days: [Sat, Sun]`、`date_start: "2026-05-08"`）。

---

## Design

### 四层粒度体系

| Tier | 优化对象 | x 维度类型 | 优先级 |
|------|---------|-----------|--------|
| T1 | 事件值（剂量/强度） | 连续实数 | 已实现 |
| T2 | 事件时刻（时间窗内） | 整数（槽索引） | 高：科学新颖性强 |
| T4 | 干预起始日（日期窗内） | 整数（天偏移） | 中 |
| T3 | 星期模式（候选集） | 整数（模式索引） | 低：纯排列 |

### YAML 语法

```yaml
optimizer:
  inputs:
    # T1：仅值优化
    - variable: drug_dose
      time: "08:00"
      label: "每日剂量"
      optimize:
        value: [5.0, 20.0]

    # T2：值 + 时间窗优化
    - variable: meal_carbs
      time_window: "07:00~09:00"
      opt_step: 1h               # 缺省 1h；精细场景可设 15min
      label: "早餐碳水"
      optimize:
        value: [30, 80]
        time: true

    # T3：值 + 星期模式选择
    - variable: exercise_load
      time: "17:00"
      days_options:
        - [Mon, Wed, Fri]
        - [Tue, Thu, Sat]
        - [Sat, Sun]
      label: "运动"
      optimize:
        value: [30, 90]
        days: true

    # T4：值 + 干预起始日优化
    - variable: caloric_restriction
      time: "08:00"
      days: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
      date_start_window: "2026-05-01~2026-05-30"
      label: "热量限制"
      optimize:
        value: [400, 800]
        date_start: true

    # 固定输入（无 optimize 块）
    - variable: water_intake
      time: "08:00"
      value: 1.5
```

### x 向量编码

每个 `inputs` 条目按 `[value?, time?, days?, date_start?]` 顺序展开，仅启用的 Tier 贡献维度：

| 启用 Tier | 贡献维度 | 变量类型 |
|----------|---------|---------|
| T1 | 1（value） | `RealVar(lo, hi)` |
| T2 | +1（time_slot_idx） | `IntVar(0, N_slots-1)` |
| T3 | +1（pattern_idx） | `IntVar(0, N_patterns-1)` |
| T4 | +1（day_offset） | `IntVar(0, D-1)` |
| 固定输入 | 0 | — |

**示例**：`meal_carbs`（T1+T2，3 槽）+ `exercise_load`（T1+T3，3 模式）：
```
x = [carbs_value, time_slot_idx, exercise_value, pattern_idx]
    [   55.3,           1,            62.0,            2      ]
# time_slot_idx=1 → ["07:00","08:00","09:00"][1] = "08:00"
# pattern_idx=2   → [[MWF],[TTS],[SS]][2] = [Sat, Sun]
```

### reference.regimen 格式扩展

T2/T3/T4 启用时，叶值从标量改为字典；T1-only 保持标量（向后兼容）：

```yaml
reference:
  regimen:
    drug_dose:
      "每日剂量": 12.5           # T1-only：标量
    meal_carbs:
      "早餐碳水":
        value: 55.3
        time: "08:00"            # T2 解码
    exercise_load:
      "运动":
        value: 62.0
        days: [Sat, Sun]         # T3 解码
    caloric_restriction:
      "热量限制":
        value: 620.0
        date_start: "2026-05-08" # T4 解码
```

---

## Implementation

### 前端：`InputEvent` 类型扩展（types.ts）

新增字段（均为可选，不破坏现有条目）：

```typescript
interface InputEvent {
  // 已有字段
  variable: string;
  time: string;
  value: number;
  label?: string;
  days?: string[];
  date_range?: string;
  optimizeValue?: boolean;
  valueBounds?: [number, number];

  // T2 新增
  timeWindow?: string;         // "07:00~09:00"
  optStep?: string;            // "1h" | "15min"，缺省 "1h"
  optimizeTime?: boolean;

  // T3 新增
  daysOptions?: string[][];    // [[Mon,Wed,Fri], [Sat,Sun], ...]
  optimizeDays?: boolean;

  // T4 新增
  dateStartWindow?: string;    // "2026-05-01~2026-05-30"
  optimizeDateStart?: boolean;
}
```

### 前端：GUI 控件（SimSetupTab.tsx）

每个 `InputEvent` 行在 opt 模式下，已有 value bounds 控件后追加：

**T2 控件**（当 `timeWindow` 存在且 `optimizeTime=true`）：
- 两个 TimePicker（起/止，步长与 `optStep` 对应），展示窗口范围
- Select 粒度选项：`1h` / `15min`
- 展示只读预览："3 slots: 07:00 / 08:00 / 09:00"

**T3 控件**（当 `daysOptions` 存在且 `optimizeDays=true`）：
- 候选模式列表，每行一个 Tag 组（如 `Mon Wed Fri`）
- 不可编辑（候选来自 YAML），提示"optimizer 将选择其中一个"

**T4 控件**（当 `dateStartWindow` 存在且 `optimizeDateStart=true`）：
- 两个 DatePicker（起/止），展示可选窗口
- 展示只读预览："30 day window"

### 前端：`xToInputEvents` 扩展（Simulator.tsx）

现有函数只处理 T1（value 替换）。扩展为按条目逐维解码：

```typescript
function xToInputEvents(x: number[], inputs: OptimizerInput[], baseEvents: InputEvent[]): InputEvent[] {
  let xi = 0;
  const result = baseEvents.map(ev => ({ ...ev }));

  for (const inp of inputs) {
    if (!inp.optimize) continue;  // 固定输入，跳过

    const idx = result.findIndex(ev => ev.variable === inp.variable && ev.time === inp.effectiveTime);
    if (idx < 0) { xi += dimCount(inp); continue; }

    // T1: value
    result[idx].value = x[xi++];

    // T2: time
    if (inp.optimize.time) {
      const slots = expandTimeWindow(inp.timeWindow, inp.optStep ?? '1h');
      result[idx].time = slots[Math.round(x[xi++])];
    }

    // T3: days
    if (inp.optimize.days) {
      result[idx].days = inp.daysOptions![Math.round(x[xi++])];
    }

    // T4: date_start
    if (inp.optimize.date_start) {
      const [wStart] = inp.dateStartWindow!.split('~');
      const offset = Math.round(x[xi++]);
      result[idx].dateStart = addDays(wStart, offset);
    }
  }
  return result;
}
```

辅助函数 `expandTimeWindow("07:00~09:00", "1h")` → `["07:00", "08:00", "09:00"]`。

### 后端：`optimizer_engine.py` 扩展

#### 解析阶段（`run_optimizer` 入口）

```python
def _parse_inputs(inputs_yaml: list) -> tuple[list, list, list]:
    """
    返回 (var_specs, bounds, var_types)
    var_types 元素: 'real' | 'int'
    """
    var_specs, bounds, var_types = [], [], []

    for inp in inputs_yaml:
        opt = inp.get('optimize')
        if not opt:
            continue  # 固定输入

        # T1: value
        lo, hi = opt['value']
        var_specs.append({'kind': 'value', 'variable': inp['variable'], 'inp': inp})
        bounds.append((lo, hi))
        var_types.append('real')

        # T2: time
        if opt.get('time'):
            slots = _expand_time_window(inp['time_window'], inp.get('opt_step', '1h'))
            var_specs.append({'kind': 'time', 'slots': slots, 'inp': inp})
            bounds.append((0, len(slots) - 1))
            var_types.append('int')

        # T3: days
        if opt.get('days'):
            patterns = inp['days_options']
            var_specs.append({'kind': 'days', 'patterns': patterns, 'inp': inp})
            bounds.append((0, len(patterns) - 1))
            var_types.append('int')

        # T4: date_start
        if opt.get('date_start'):
            w_start, w_end = inp['date_start_window'].split('~')
            n_days = (date.fromisoformat(w_end.strip()) - date.fromisoformat(w_start.strip())).days
            var_specs.append({'kind': 'date_start', 'window_start': w_start.strip(), 'n_days': n_days, 'inp': inp})
            bounds.append((0, n_days))
            var_types.append('int')

    return var_specs, bounds, var_types
```

#### 构建事件（`_build_regimen_events(x, var_specs)`）

```python
def _build_regimen_events(x, var_specs):
    events_by_var = {}
    pending = {}  # variable -> partial event dict

    for i, spec in enumerate(var_specs):
        var = spec['inp']['variable']
        if var not in pending:
            pending[var] = {
                'time': spec['inp'].get('time', '08:00'),
                'days': spec['inp'].get('days'),
                'date_start': None,
            }
        ev = pending[var]

        if spec['kind'] == 'value':
            ev['value'] = float(x[i])
        elif spec['kind'] == 'time':
            ev['time'] = spec['slots'][int(round(x[i]))]
        elif spec['kind'] == 'days':
            ev['days'] = spec['patterns'][int(round(x[i]))]
        elif spec['kind'] == 'date_start':
            offset = int(round(x[i]))
            start = date.fromisoformat(spec['window_start'])
            ev['date_start'] = str(start + timedelta(days=offset))

    for var, ev in pending.items():
        events_by_var[var] = [ev]
    return events_by_var
```

#### pymoo 变量类型声明

```python
from pymoo.core.mixed import MixedVariableProblem
from pymoo.core.variable import Real, Integer

variables = {}
for i, (spec, (lo, hi), vtype) in enumerate(zip(var_specs, bounds, var_types)):
    if vtype == 'real':
        variables[f'x{i}'] = Real(bounds=(lo, hi))
    else:
        variables[f'x{i}'] = Integer(bounds=(lo, hi))

problem = MixedVariableProblem(n_obj=n_obj, n_constr=n_constr, vars=variables, ...)
```

如果所有变量均为 `real`（纯 T1），降级为现有 `FloatRandomSampling` 路径（向后兼容）。

#### `_expand_time_window` 辅助

```python
def _expand_time_window(window: str, opt_step: str) -> list[str]:
    start_str, end_str = window.split('~')
    hh0, mm0 = map(int, start_str.strip().split(':'))
    hh1, mm1 = map(int, end_str.strip().split(':'))
    step_min = 60 if opt_step == '1h' else 15
    slots = []
    t = hh0 * 60 + mm0
    end = hh1 * 60 + mm1
    while t <= end:
        slots.append(f"{t//60:02d}:{t%60:02d}")
        t += step_min
    return slots
```

---

## 影响文件

```
docs/model_design.md                               ✅ 已更新（YAML Schema + 章节）
docs/decisions/0080-...（本文件）                  ✅

sim_gui/src/types.ts                               InputEvent 新增 T2/T3/T4 字段
sim_gui/src/components/SimSetupTab.tsx             T2/T3/T4 opt 控件
sim_gui/src/components/Simulator.tsx               xToInputEvents 混合整数解码
                                                   init useEffect 解析新 YAML 字段

sim_engine/src/optimizer_engine.py                 _parse_inputs、_build_regimen_events
                                                   expandTimeWindow、MixedVariableProblem
```
