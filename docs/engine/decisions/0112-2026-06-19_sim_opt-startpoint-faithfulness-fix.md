# ADR 0112 — Opt startpoint 解析忠诚性修复（seed 硬编码 + T4 date_range 丢失）

**日期**: 2026-06-19
**状态**: 已接受
**范围**: sim_gui（`Simulator.tsx` / `optUtils.ts`），sim_engine（测试套件扩展）

---

## 背景

[ADR 0110](0110-2026-06-17_sim_unify-plan-schedule-parsing.md) 解决了 sim（仿真）侧
plan/schedule 的双重解析问题。排查 opt（优化器）侧是否有同样的问题时，发现情况更严重：

GUI 每次点"运行优化"，都会把 `useOptimizer.ts::startOptimization()` 里前端重新解析/拼装的
`startpoint.schedules`、`objectives`、`constraints`、`algorithm` 整体打包成
`optimizer_override`，无条件发给后端 `run_optimizer()`，后端的合并逻辑是"只要 override 里有这个
key 就整段替换 YAML 自己的值"（`optimizer_engine.py` 第 164-168 行）。CLI 的 `--opt` 则只覆盖
`warm_start`，其余完全读 YAML。也就是说：**GUI 跑优化时，YAML 的 `optimizer:` 块本身从未被后端
直接使用过，哪怕用户一个字段都没编辑** —— 实际使用的永远是前端重新拼出来的那一份。

`buildOptInputEventsFromYAML`（解析 YAML → 前端可编辑状态）和 `optimizer_engine.py` 里的
T1-T4 决策变量解析（`run_optimizer()` 第 195-309 行）是对同一段 YAML 语义的两份独立实现
（Python + TypeScript），其中 T1-T4 的复杂度（数值范围 / 时间窗 / 星期池 / 日期范围四种独立语法）
远超 sim 侧的 schedules，全量改成 ADR 0110 那种"后端单一解析"代价较大，本次先做**忠诚性测试**：
拿真实模型跑"YAML → 前端解析 → 编辑状态 → 前端重序列化"，看不编辑的情况下能不能复现 YAML 原文。

### 发现的两个真问题

用 `models/test/test_opt_t1_single.yaml`（T1）、`test_opt_t2.yaml`（T2）、`test_opt_t3.yaml`（T3）、
`test_opt_t4.yaml`（T4）四个 fixture 实测：

1. **`algorithm.seed` 硬编码为 `42`**（`useOptimizer.ts` 原代码），不读 YAML 自己的
   `optimizer.algorithm.seed`。NSGA-II 对 seed 敏感，这意味着即使 YAML 指定了别的 seed，GUI 跑出来
   的结果也永远对不上 CLI（CLI 直接读 YAML 的 seed）。
2. **T4（`optimize.date_range`）整个搜索维度被静默丢弃**：`buildOptInputEventsFromYAML` 算
   `validRangeEnabled`（决定要不要把日期范围写进重建后的 JSON）时，只看固定的
   `s.date_range`/`valid_start`/`valid_end` 字段，没看 `s.optimize.date_range`（T4 自己的搜索
   范围字段）。当模型的日期搜索范围只写在 `optimize.date_range` 里（没有额外固定 date_range，
   这是正常写法——没人会同时写固定范围和搜索范围）时，`validRangeEnabled` 算出 `false`，
   `buildOptSchedules` 里写 `optimize.date_range` 的代码块整段被跳过。**T4 这个决策维度在 GUI
   端消失，优化器实际跑的搜索空间比 YAML 定义的少一维，没有任何报错或提示。**

T1（数值范围）、T3（星期池）的往返完全一致（字段顺序不同，数值相同，非 bug）。T2（时间窗）的往返
会多写入一个 `time_start/time_end: "08:00"` 默认值——验证后确认无害：前端的默认值
（`normalizeTimeInterval`）和后端的默认值（`optimizer_engine.py::_build_regimen_events` 的
`e0.get('time_start', '08:00')`）刚好都是 `"08:00"`，解码结果相同；但这是"两边各自硬编码同一个
默认值"的脆弱一致，不是有保障的一致，本次不改，留档供下次留意。

## 决策

**修复上述两个真问题，并把"忠诚性测试"固化为可重复运行的自动化测试，而不是一次性人工核对。**

### 1. seed 不再硬编码

`useOptimizer.ts` 的 `optimizerOverride.algorithm.seed` 改为读 `optSeed`（来自 YAML 的
`algorithm.seed`，加载时读入；YAML 未指定时默认 `42`，与 `optimizer_engine.py` 自己的
fallback 一致）。配套：`types.ts` 的 `ModelSession` 新增 `optSeed`，`Simulator.tsx` 在 YAML 加载
和 session 恢复两处都同步这个值。

### 2. T4 的 `validRangeEnabled` 同时看 `optimize.date_range`

```ts
const hasT4Range = Array.isArray(s.optimize?.date_range) && s.optimize.date_range.length === 2;
...
validRangeEnabled: !!(validStart || validEnd) || hasT4Range, validStart, validEnd,
```

顺带发现但**本次不修**的边界情况：`days` 字段为全 7 天（`[Mon,...,Sun]`）时，`hasDays` 判 `false`
导致固定 `days` 字段被整体丢弃——这个目前无害（"无 `days` 字段"和"`days`=全 7 天"在
`apply_regimens` 里语义相同，都是"每天生效"），归为下一次顺带修复项，不和这次的真 bug 混在一起改。

### 3. 把"忠诚性测试"变成自动化回归测试

`buildOptInputEventsFromYAML` 原本是 `Simulator.tsx` 内的局部闭包函数，无法被测试文件单独
import。挪到 `optUtils.ts`（`buildOptSchedules` 已经在这个文件里，逻辑上本来就该在一起），改为
具名 export；`parseDaysMask`/`DAY_STR_MAP` 同样挪过去（消除 `Simulator.tsx` 内三处重复定义）。

sim_gui 此前没有任何 JS 单元测试框架，新增 `vitest`（Vite 原生、零配置）作为 devDependency，
新增 `sim_gui/src/components/sim_tab/optUtils.test.ts`：对四个 T1-T4 fixture 跑"YAML schedules
→ buildOptInputEventsFromYAML → buildOptSchedules"往返，用 `toEqual`（结构比较，不受字段顺序
影响）比对 YAML 原文，对两个已知无害的差异（T2 的 `time_start`/`time_end` 默认值、`days` 全 7 天
等价于无 `days` 字段）做了显式归一化后再比较，避免把无害差异误报成失败——但 `optimize.date_range`
等真实字段不做归一化，确保 T4 的真 bug 仍会被测出。

修复前在这条测试上做过验证：T4 用例失败（`optimize.date_range` 整段消失），恢复修复后通过。

## 不在本次范围内

- T1-T4 决策变量解析全量改为后端单一解析（完整对齐 ADR 0110 模式）：T4 的具体 bug 已经用更小的
  代价（一行条件 + 自动化测试）解决，全量重构的收益不再迫切，留作未来如果再发现新分叉时的选项。
- `days` 全 7 天被丢弃的边界情况：见上文，已知无害，记录但不修。

## 结果

```
sim_gui/src/components/sim_tab/optUtils.ts        新增 parseDaysMask、buildOptInputEventsFromYAML（含 T4 修复）
sim_gui/src/components/sim_tab/optUtils.test.ts   新增，忠诚性回归测试（4 个 T1-T4 fixture）
sim_gui/src/components/Simulator.tsx              移除重复定义，改为从 optUtils 导入
sim_gui/src/components/opt_tab/useOptimizer.ts     algorithm.seed 改为读 optSeed（不再硬编码 42）
sim_gui/src/types.ts                               ModelSession 新增 optSeed
sim_gui/package.json                               新增 vitest devDependency + test script
tests/test_sim_cli_consistency.py                  新增 opt 一致性用例（见 ADR 0113）
```

## 关联

- ADR 0072 — 测试直接 import 引擎层函数，不经 CLI 解析层
- ADR 0100 — pulse/sustained 时间区间统一（T2 的 `_width_min` 解码依据）
- ADR 0110 — Plan/Schedule 解析单一来源（sim 侧的同类问题，本次是 opt 侧的对应修复）
- ADR 0111 — Sim/CLI 一致性回归测试套件（其"opt 没有发现分叉"的结论在本 ADR 被修正——
  当时只确认了"两边调同一个函数"，没往下查传参是否等价）
- ADR 0113 — Sim 执行核心合并 + CLI MC 能力（同一轮排查的另一部分）
